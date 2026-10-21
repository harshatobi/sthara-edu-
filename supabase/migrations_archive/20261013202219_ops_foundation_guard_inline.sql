-- The original table definition carries its own role check (users_role_check) without 'operator'; users_role_valid is the one kept.
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_role_check;

-- The superadmin guard, self-contained per table (no helper to call, so no schema privilege can get in its way).
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
DROP FUNCTION IF EXISTS app.assert_can_name_superadmin(uuid);
REVOKE ALL ON FUNCTION app.guard_superadmin(), app.guard_superadmin_list() FROM PUBLIC, anon, authenticated;
