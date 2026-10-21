-- Platform Manager foundation: operator roles, territories, record ownership and break-glass access.
--
-- ops_operators          who works in the Platform Manager, in which role, reporting to whom. Until now every operator
--                        was a superadmin; superadmins become directors here. Other roles are ordinary accounts with
--                        users.role = 'operator': they are NOT superadmins, so row-level security gives them nothing
--                        directly. Everything they see comes through /api/ops, which checks the role's capabilities
--                        and territory (src/lib/ops/roles.ts, territories.ts).
-- ops_territories        region > state > district. Each can name a default owner for new records.
-- ops_territory_members  which operators work which territories (they see those and everything beneath).
-- ops_accounts           one row per school: its state and district, the territory that places it in, and its owner.
-- enquiries              gain the same placement columns.
-- ops_access_grants      break-glass: a timed, reasoned window in which one operator may open one school's records.
-- ops_access_events      what was opened under a grant. Both are shown to the school.
-- superadmin guards      one superadmin, named only by the database owner; the director role is theirs alone.
--
-- All of it is written and read only by the server (service role) after the operator check; no school account, and no
-- operator's own token, can read or write these tables.

-- 1. A non-superadmin operator account role.
-- The original table carries its own role check (users_role_check) without 'operator'; users_role_valid is the one kept.
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_role_valid;
ALTER TABLE public.users ADD CONSTRAINT users_role_valid
  CHECK (role IN ('student', 'teacher', 'admin', 'parent', 'superadmin', 'operator')) NOT VALID;

-- 2. Operators.
CREATE TABLE IF NOT EXISTS public.ops_operators (
  user_id     uuid PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  role        text NOT NULL CHECK (role IN ('director', 'regional_lead', 'sales_rep', 'account_manager', 'support_agent', 'engineer', 'finance')),
  manager_id  uuid REFERENCES public.ops_operators(user_id) ON DELETE SET NULL CHECK (manager_id IS DISTINCT FROM user_id),
  title       text CHECK (title IS NULL OR length(title) <= 80),
  active      boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  created_by  uuid REFERENCES public.users(id) ON DELETE SET NULL,
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_ops_operators_manager ON public.ops_operators (manager_id);

-- Everyone who can open the console today keeps full access, as a director.
INSERT INTO public.ops_operators (user_id, role)
SELECT id, 'director' FROM public.users
 WHERE role = 'superadmin' OR id IN (SELECT user_id FROM public.superadmins)
ON CONFLICT (user_id) DO NOTHING;

-- 3. Territories.
CREATE TABLE IF NOT EXISTS public.ops_territories (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name              text NOT NULL CHECK (length(name) BETWEEN 2 AND 80),
  level             text NOT NULL CHECK (level IN ('region', 'state', 'district')),
  parent_id         uuid REFERENCES public.ops_territories(id) ON DELETE RESTRICT,
  state             text CHECK (state IS NULL OR length(state) <= 60),
  district          text CHECK (district IS NULL OR length(district) <= 80),
  default_owner_id  uuid REFERENCES public.ops_operators(user_id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ops_territories_shape CHECK (
    (level = 'region'   AND parent_id IS NULL AND state IS NULL AND district IS NULL) OR
    (level = 'state'    AND state IS NOT NULL AND district IS NULL) OR
    (level = 'district' AND parent_id IS NOT NULL AND state IS NOT NULL AND district IS NOT NULL)
  )
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_ops_territories_region   ON public.ops_territories (lower(name)) WHERE level = 'region';
CREATE UNIQUE INDEX IF NOT EXISTS ux_ops_territories_state    ON public.ops_territories (lower(state)) WHERE level = 'state';
CREATE UNIQUE INDEX IF NOT EXISTS ux_ops_territories_district ON public.ops_territories (lower(state), lower(district)) WHERE level = 'district';
CREATE INDEX IF NOT EXISTS ix_ops_territories_parent ON public.ops_territories (parent_id);

-- Every state and union territory, so an address always has somewhere to land. Regions and districts are added in the console.
INSERT INTO public.ops_territories (name, level, state)
SELECT s, 'state', s FROM unnest(ARRAY[
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh', 'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh',
  'Jharkhand', 'Karnataka', 'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha',
  'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
  'Andaman and Nicobar Islands', 'Chandigarh', 'Dadra and Nagar Haveli and Daman and Diu', 'Delhi', 'Jammu and Kashmir',
  'Ladakh', 'Lakshadweep', 'Puducherry'
]) AS s
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS public.ops_territory_members (
  territory_id  uuid NOT NULL REFERENCES public.ops_territories(id) ON DELETE CASCADE,
  operator_id   uuid NOT NULL REFERENCES public.ops_operators(user_id) ON DELETE CASCADE,
  PRIMARY KEY (territory_id, operator_id)
);
CREATE INDEX IF NOT EXISTS ix_ops_territory_members_operator ON public.ops_territory_members (operator_id);

-- 4. Where each school sits and who owns it.
CREATE TABLE IF NOT EXISTS public.ops_accounts (
  school_id     uuid PRIMARY KEY REFERENCES public.schools(id) ON DELETE CASCADE,
  state         text CHECK (state IS NULL OR length(state) <= 60),
  district      text CHECK (district IS NULL OR length(district) <= 80),
  territory_id  uuid REFERENCES public.ops_territories(id) ON DELETE SET NULL,
  owner_id      uuid REFERENCES public.ops_operators(user_id) ON DELETE SET NULL,
  updated_at    timestamptz NOT NULL DEFAULT now(),
  updated_by    uuid REFERENCES public.users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS ix_ops_accounts_territory ON public.ops_accounts (territory_id);
CREATE INDEX IF NOT EXISTS ix_ops_accounts_owner ON public.ops_accounts (owner_id);

ALTER TABLE public.enquiries
  ADD COLUMN IF NOT EXISTS state text CHECK (state IS NULL OR length(state) <= 60),
  ADD COLUMN IF NOT EXISTS district text CHECK (district IS NULL OR length(district) <= 80),
  ADD COLUMN IF NOT EXISTS territory_id uuid REFERENCES public.ops_territories(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS owner_id uuid REFERENCES public.ops_operators(user_id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS ix_enquiries_territory ON public.enquiries (territory_id);
CREATE INDEX IF NOT EXISTS ix_enquiries_owner ON public.enquiries (owner_id);

-- 5. Break-glass access. The operator's email is kept beside the id so the record outlives the account.
CREATE TABLE IF NOT EXISTS public.ops_access_grants (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id     uuid REFERENCES public.users(id) ON DELETE SET NULL,
  operator_email  text NOT NULL,
  operator_role   text NOT NULL,
  school_id       uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  scope           text NOT NULL DEFAULT 'records' CHECK (scope IN ('records', 'view_as')),
  reason          text NOT NULL CHECK (length(reason) BETWEEN 10 AND 500),
  case_ref        text CHECK (case_ref IS NULL OR length(case_ref) <= 80),
  started_at      timestamptz NOT NULL DEFAULT now(),
  expires_at      timestamptz NOT NULL,
  ended_at        timestamptz,
  CONSTRAINT ops_access_grants_window CHECK (expires_at > started_at AND expires_at <= started_at + interval '30 minutes')
);
CREATE INDEX IF NOT EXISTS ix_ops_access_grants_school ON public.ops_access_grants (school_id, started_at DESC);
CREATE INDEX IF NOT EXISTS ix_ops_access_grants_operator ON public.ops_access_grants (operator_id, expires_at DESC);

CREATE TABLE IF NOT EXISTS public.ops_access_events (
  id        bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  grant_id  uuid NOT NULL REFERENCES public.ops_access_grants(id) ON DELETE CASCADE,
  at        timestamptz NOT NULL DEFAULT now(),
  action    text NOT NULL CHECK (length(action) <= 80),
  target    text CHECK (target IS NULL OR length(target) <= 300)
);
CREATE INDEX IF NOT EXISTS ix_ops_access_events_grant ON public.ops_access_events (grant_id, at);

-- A grant's reason, window and operator never change; it can only be ended early, once.
CREATE OR REPLACE FUNCTION app.ops_access_grants_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    -- Rows go only when their school is deleted (the cascade), never one by one.
    IF EXISTS (SELECT 1 FROM public.schools WHERE id = OLD.school_id) THEN
      RAISE EXCEPTION 'ops_access_grants is append-only';
    END IF;
    RETURN OLD;
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.operator_email IS DISTINCT FROM OLD.operator_email
     OR NEW.operator_role IS DISTINCT FROM OLD.operator_role OR NEW.school_id IS DISTINCT FROM OLD.school_id
     OR NEW.scope IS DISTINCT FROM OLD.scope OR NEW.reason IS DISTINCT FROM OLD.reason
     OR NEW.case_ref IS DISTINCT FROM OLD.case_ref OR NEW.started_at IS DISTINCT FROM OLD.started_at
     OR NEW.expires_at IS DISTINCT FROM OLD.expires_at
     OR (OLD.operator_id IS NOT NULL AND NEW.operator_id IS NOT NULL AND NEW.operator_id <> OLD.operator_id)
     OR (OLD.ended_at IS NOT NULL AND NEW.ended_at IS DISTINCT FROM OLD.ended_at) THEN
    RAISE EXCEPTION 'An access grant cannot be changed, only ended';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_ops_access_grants_guard ON public.ops_access_grants;
CREATE TRIGGER trg_ops_access_grants_guard BEFORE UPDATE OR DELETE ON public.ops_access_grants
  FOR EACH ROW EXECUTE FUNCTION app.ops_access_grants_guard();

-- 6. Server only.
ALTER TABLE public.ops_operators ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ops_territories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ops_territory_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ops_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ops_access_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ops_access_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ops_operators, public.ops_territories, public.ops_territory_members, public.ops_accounts,
  public.ops_access_grants, public.ops_access_events FROM anon, authenticated;
GRANT ALL ON public.ops_operators, public.ops_territories, public.ops_territory_members, public.ops_accounts TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.ops_access_grants TO service_role;
GRANT SELECT, INSERT ON public.ops_access_events TO service_role;
REVOKE ALL ON FUNCTION app.ops_access_grants_guard() FROM PUBLIC, anon, authenticated;

-- 7. Superadmin is one account, and only the database owner can name it.
--
-- A superadmin (users.role = 'superadmin', or a row in public.superadmins) passes every row-level policy and is the
-- console's director. No application path may create one: not an API route holding the service key, not a signed-in
-- superadmin's own token. It is set by hand in the SQL editor (as postgres), and there can be only one at a time:
-- to hand it over, take it from the current holder and give it to the next in the same transaction.
CREATE OR REPLACE FUNCTION app.guard_superadmin() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.role = 'superadmin' AND (TG_OP = 'INSERT' OR OLD.role IS DISTINCT FROM 'superadmin') THEN
    -- Deliberately not SECURITY DEFINER: current_user is whoever is really asking.
    IF current_user NOT IN ('postgres', 'supabase_admin') THEN
      RAISE EXCEPTION 'Superadmin access is granted only by the database owner' USING ERRCODE = '42501';
    END IF;
    IF EXISTS (SELECT 1 FROM public.users WHERE role = 'superadmin' AND id <> NEW.id)
       OR EXISTS (SELECT 1 FROM public.superadmins WHERE user_id <> NEW.id) THEN
      RAISE EXCEPTION 'There is already a superadmin. Remove that one first, in the same transaction.' USING ERRCODE = '23505';
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION app.guard_superadmin_list() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' OR NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    IF current_user NOT IN ('postgres', 'supabase_admin') THEN
      RAISE EXCEPTION 'Superadmin access is granted only by the database owner' USING ERRCODE = '42501';
    END IF;
    IF EXISTS (SELECT 1 FROM public.users WHERE role = 'superadmin' AND id <> NEW.user_id)
       OR EXISTS (SELECT 1 FROM public.superadmins WHERE user_id <> NEW.user_id) THEN
      RAISE EXCEPTION 'There is already a superadmin. Remove that one first, in the same transaction.' USING ERRCODE = '23505';
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_guard_superadmin_users ON public.users;
CREATE TRIGGER trg_guard_superadmin_users BEFORE INSERT OR UPDATE OF role ON public.users
  FOR EACH ROW EXECUTE FUNCTION app.guard_superadmin();
DROP TRIGGER IF EXISTS trg_guard_superadmin_list ON public.superadmins;
CREATE TRIGGER trg_guard_superadmin_list BEFORE INSERT OR UPDATE ON public.superadmins
  FOR EACH ROW EXECUTE FUNCTION app.guard_superadmin_list();

-- The director role belongs to the superadmin and nobody else, whatever the console or an API route is told.
CREATE OR REPLACE FUNCTION app.guard_director() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.role = 'director' AND NOT (
       EXISTS (SELECT 1 FROM public.users WHERE id = NEW.user_id AND role = 'superadmin')
       OR EXISTS (SELECT 1 FROM public.superadmins WHERE user_id = NEW.user_id)) THEN
    RAISE EXCEPTION 'Only the superadmin can be a director' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_guard_director ON public.ops_operators;
CREATE TRIGGER trg_guard_director BEFORE INSERT OR UPDATE OF role, user_id ON public.ops_operators
  FOR EACH ROW EXECUTE FUNCTION app.guard_director();
REVOKE ALL ON FUNCTION app.guard_superadmin(), app.guard_superadmin_list(), app.guard_director() FROM PUBLIC, anon, authenticated;
