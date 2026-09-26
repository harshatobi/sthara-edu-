-- ============================================================================
-- Ops settings: platform configuration, settings change journal, health probe.
--
-- Backs the operator console's Settings module (/ops/settings).
--
--   platform_config    typed key/value overrides for the platform settings
--                      defined in code (src/lib/settings/registry.ts). A key
--                      with no row uses its code default. Service role only.
--   settings_changes   append-only journal of every platform and per-school
--                      settings change, with the operator and a reason.
--   ops_platform_health()  read-only posture probe (RLS coverage, applied
--                      migrations, operators, audit activity). Service role only.
--
-- Also retires public.platform_settings: nothing reads it, it has never held a
-- row, and its default_password column kept a plaintext default password.
-- Dropped only if still empty.
-- ============================================================================

-- 1. Platform configuration -------------------------------------------------
CREATE TABLE IF NOT EXISTS public.platform_config (
  key        text PRIMARY KEY CHECK (key ~ '^[a-z][a-z0-9_]*(\.[a-z0-9_]+)+$' AND length(key) <= 64),
  value      jsonb NOT NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.platform_config ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.platform_config FROM anon, authenticated;
GRANT ALL ON public.platform_config TO service_role;
COMMENT ON TABLE public.platform_config IS
  'Operator overrides of code-defined platform settings (src/lib/settings/registry.ts). Service role only.';

-- 2. Settings change journal ------------------------------------------------
CREATE TABLE IF NOT EXISTS public.settings_changes (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  at          timestamptz NOT NULL DEFAULT now(),
  actor_id    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_email text,
  scope       text NOT NULL CHECK (scope IN ('platform', 'school')),
  school_id   uuid REFERENCES public.schools(id) ON DELETE SET NULL,
  key         text NOT NULL CHECK (length(key) BETWEEN 1 AND 64),
  old_value   jsonb,
  new_value   jsonb,
  reason      text NOT NULL CHECK (length(btrim(reason)) BETWEEN 4 AND 500),
  CHECK (scope = 'school' OR school_id IS NULL)
);
CREATE INDEX IF NOT EXISTS idx_settings_changes_at ON public.settings_changes (at DESC);
CREATE INDEX IF NOT EXISTS idx_settings_changes_school ON public.settings_changes (school_id, at DESC);
ALTER TABLE public.settings_changes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.settings_changes FROM anon, authenticated;
GRANT SELECT, INSERT ON public.settings_changes TO service_role;
COMMENT ON TABLE public.settings_changes IS
  'Append-only journal of operator settings changes (platform and per school). Service role only.';

-- Append-only: even the service role cannot rewrite history.
CREATE OR REPLACE FUNCTION app.settings_changes_immutable() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  RAISE EXCEPTION 'settings_changes is append-only';
END $$;
DROP TRIGGER IF EXISTS trg_settings_changes_immutable ON public.settings_changes;
CREATE TRIGGER trg_settings_changes_immutable BEFORE UPDATE OR DELETE ON public.settings_changes
  FOR EACH ROW EXECUTE FUNCTION app.settings_changes_immutable();

-- Schools: record plan/status changes in the general audit log too (operators
-- change schools with the service key, so actor_role is 'server' there; the
-- journal above carries the operator and reason).
DROP TRIGGER IF EXISTS trg_audit_schools ON public.schools;
CREATE TRIGGER trg_audit_schools AFTER UPDATE OR DELETE ON public.schools
  FOR EACH ROW EXECUTE FUNCTION app.audit('name,settings,trial_expires_at,institution_type');

-- School codes are how every sign-in finds its school: make them unique in the
-- database, not only in the app (two schools with one code would be a sign-in
-- to the wrong school).
CREATE UNIQUE INDEX IF NOT EXISTS schools_code_unique ON public.schools ((settings ->> 'code'))
  WHERE settings ->> 'code' IS NOT NULL;

-- Writes from the console: the change and its journal entry commit together.
CREATE OR REPLACE FUNCTION public.ops_set_platform_config(
  p_key text, p_value jsonb, p_reason text, p_actor uuid, p_actor_email text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_old jsonb;
BEGIN
  SELECT value INTO v_old FROM public.platform_config WHERE key = p_key FOR UPDATE;
  INSERT INTO public.platform_config (key, value, updated_by, updated_at)
  VALUES (p_key, p_value, p_actor, now())
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = now();
  INSERT INTO public.settings_changes (actor_id, actor_email, scope, key, old_value, new_value, reason)
  VALUES (p_actor, p_actor_email, 'platform', p_key, v_old, p_value, p_reason);
  RETURN jsonb_build_object('old', v_old, 'new', p_value);
END $$;

-- p_patch: any of name, institution_type, trial_expires_at (ISO or null) and
-- settings (merged into schools.settings, top-level keys; a null value removes
-- the key). p_journal: [{key, old, new}] rows for the change log.
-- p_expected: the school's updated_at as the operator last saw it; a newer
-- row means someone else changed it meanwhile, and nothing is written.
CREATE OR REPLACE FUNCTION public.ops_update_school(
  p_school uuid, p_patch jsonb, p_journal jsonb, p_reason text, p_actor uuid, p_actor_email text, p_expected timestamptz
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_row public.schools;
  v_settings jsonb;
  k text;
BEGIN
  SELECT * INTO v_row FROM public.schools WHERE id = p_school FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'school not found' USING ERRCODE = 'P0002'; END IF;
  IF p_expected IS NOT NULL AND v_row.updated_at IS DISTINCT FROM p_expected THEN
    RAISE EXCEPTION 'school changed since it was loaded' USING ERRCODE = '40001';
  END IF;
  v_settings := coalesce(v_row.settings, '{}'::jsonb);
  IF p_patch ? 'settings' THEN
    FOR k IN SELECT jsonb_object_keys(p_patch -> 'settings') LOOP
      IF jsonb_typeof(p_patch -> 'settings' -> k) = 'null'
        THEN v_settings := v_settings - k;
        ELSE v_settings := jsonb_set(v_settings, ARRAY[k], p_patch -> 'settings' -> k, true);
      END IF;
    END LOOP;
  END IF;
  UPDATE public.schools SET
    name = CASE WHEN p_patch ? 'name' THEN p_patch ->> 'name' ELSE name END,
    institution_type = CASE WHEN p_patch ? 'institution_type' THEN p_patch ->> 'institution_type' ELSE institution_type END,
    trial_expires_at = CASE WHEN p_patch ? 'trial_expires_at' THEN (p_patch ->> 'trial_expires_at')::timestamptz ELSE trial_expires_at END,
    settings = v_settings
  WHERE id = p_school
  RETURNING * INTO v_row;
  INSERT INTO public.settings_changes (actor_id, actor_email, scope, school_id, key, old_value, new_value, reason)
  SELECT p_actor, p_actor_email, 'school', p_school, j ->> 'key', j -> 'old', j -> 'new', p_reason
  FROM jsonb_array_elements(coalesce(p_journal, '[]'::jsonb)) j;
  RETURN jsonb_build_object('updated_at', v_row.updated_at);
END $$;

REVOKE ALL ON FUNCTION public.ops_set_platform_config(text, jsonb, text, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ops_update_school(uuid, jsonb, jsonb, text, uuid, text, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ops_set_platform_config(text, jsonb, text, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.ops_update_school(uuid, jsonb, jsonb, text, uuid, text, timestamptz) TO service_role;

-- 3. Health probe -------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ops_platform_health() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT jsonb_build_object(
    'server_version', current_setting('server_version'),
    'rls_off', coalesce((
      SELECT jsonb_agg(c.relname ORDER BY c.relname)
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity), '[]'::jsonb),
    'tables', (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
               WHERE n.nspname = 'public' AND c.relkind = 'r'),
    'anon_writable', coalesce((
      SELECT jsonb_agg(DISTINCT table_name ORDER BY table_name)
      FROM information_schema.role_table_grants
      WHERE table_schema = 'public' AND grantee = 'anon' AND privilege_type IN ('INSERT', 'UPDATE', 'DELETE')), '[]'::jsonb),
    'migrations', coalesce((
      SELECT jsonb_agg(jsonb_build_object('version', version, 'name', name) ORDER BY version)
      FROM supabase_migrations.schema_migrations), '[]'::jsonb),
    'operators', (SELECT count(DISTINCT id) FROM (
        SELECT id FROM public.users WHERE role = 'superadmin'
        UNION SELECT user_id FROM public.superadmins) o),
    'audit_7d', (SELECT count(*) FROM public.audit_log WHERE at > now() - interval '7 days'),
    'audit_last', (SELECT max(at) FROM public.audit_log),
    'db_bytes', pg_database_size(current_database())
  );
$$;
REVOKE ALL ON FUNCTION public.ops_platform_health() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ops_platform_health() TO service_role;

-- 4. Retire platform_settings (only while it is still empty) ------------------
DO $$
BEGIN
  -- Nested (not AND): the inner query can't even be planned once the table is gone.
  IF to_regclass('public.platform_settings') IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.platform_settings) THEN
      DROP TABLE public.platform_settings;
    END IF;
  END IF;
END $$;
