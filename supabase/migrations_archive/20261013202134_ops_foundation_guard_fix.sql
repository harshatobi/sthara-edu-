-- The first version read NEW.id and NEW.user_id in one expression, which fails on both tables. One function per table.
CREATE OR REPLACE FUNCTION app.assert_can_name_superadmin(uid uuid) RETURNS void
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  -- Deliberately not SECURITY DEFINER: current_user is whoever is really asking.
  IF current_user NOT IN ('postgres', 'supabase_admin') THEN
    RAISE EXCEPTION 'Superadmin access is granted only by the database owner' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (SELECT 1 FROM public.users WHERE role = 'superadmin' AND id <> uid)
     OR EXISTS (SELECT 1 FROM public.superadmins WHERE user_id <> uid) THEN
    RAISE EXCEPTION 'There is already a superadmin. Remove that one first, in the same transaction.' USING ERRCODE = '23505';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION app.guard_superadmin() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.role = 'superadmin' AND (TG_OP = 'INSERT' OR OLD.role IS DISTINCT FROM 'superadmin') THEN
    PERFORM app.assert_can_name_superadmin(NEW.id);
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION app.guard_superadmin_list() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' OR NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    PERFORM app.assert_can_name_superadmin(NEW.user_id);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_guard_superadmin_list ON public.superadmins;
CREATE TRIGGER trg_guard_superadmin_list BEFORE INSERT OR UPDATE ON public.superadmins
  FOR EACH ROW EXECUTE FUNCTION app.guard_superadmin_list();
REVOKE ALL ON FUNCTION app.guard_superadmin(), app.guard_superadmin_list() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.assert_can_name_superadmin(uuid) TO service_role, authenticated;
