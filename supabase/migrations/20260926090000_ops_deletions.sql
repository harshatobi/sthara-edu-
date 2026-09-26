-- Operator deletions: remove a school, or one account, with the audit entry in the same transaction.
--
-- 1. settings_changes.school_id keeps the id of a deleted school as history instead of a live foreign
--    key. The ON DELETE SET NULL it had was itself an UPDATE, which the append-only trigger refuses,
--    so no school with journal entries could be deleted at all; and clearing the id would have erased
--    which school each entry was about.
-- 2. ops_delete_school(): journals 'school.deleted' (platform scope, with a snapshot of the school),
--    deletes the school's user profiles (users.school_id is ON DELETE SET NULL, so a plain school delete
--    used to leave every account alive and school-less), then the school (classes, submissions and the
--    rest cascade). Returns the deleted user ids so the caller removes their logins from Auth.
-- 3. ops_delete_account(): journals 'account.deleted' (school scope) and deletes one profile. A student
--    with fee invoices or payments can't be deleted, nor can a school's only school admin.
-- Financial records are never deleted: a school with any invoice or receipt is suspended, not deleted.
-- Both are service-role only; the operator check happens in the API route.

ALTER TABLE public.settings_changes DROP CONSTRAINT IF EXISTS settings_changes_school_id_fkey;

CREATE OR REPLACE FUNCTION public.ops_delete_school(p_school uuid, p_reason text, p_actor uuid, p_actor_email text)
RETURNS uuid[]
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_school public.schools%ROWTYPE;
  v_users uuid[];
BEGIN
  SELECT * INTO v_school FROM public.schools WHERE id = p_school FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'School not found' USING ERRCODE = 'P0002';
  END IF;
  -- Financial records are never deleted: a school with any invoice or receipt keeps its books
  -- (receipts are immutable, see app.guard_fee_payment). It can be suspended instead.
  IF EXISTS (SELECT 1 FROM public.fee_payments WHERE school_id = p_school)
     OR EXISTS (SELECT 1 FROM public.fee_invoices WHERE school_id = p_school) THEN
    RAISE EXCEPTION 'This school has fee records, which are kept as financial records. Suspend it instead of deleting it.'
      USING ERRCODE = 'P0001', HINT = 'has_fee_records';
  END IF;
  SELECT coalesce(array_agg(id), '{}') INTO v_users FROM public.users WHERE school_id = p_school AND role <> 'superadmin';

  INSERT INTO public.settings_changes (actor_id, actor_email, scope, school_id, key, old_value, new_value, reason)
  VALUES (p_actor, p_actor_email, 'platform', NULL, 'school.deleted',
    jsonb_build_object('id', v_school.id, 'name', v_school.name, 'code', v_school.settings->>'code',
      'plan', v_school.settings->>'plan', 'accounts', cardinality(v_users), 'created_at', v_school.created_at),
    NULL, p_reason);

  -- Accounts first: their role grants cascade, which app.guard_role_grant allows once the user
  -- is gone. Then the school and everything that cascades from it (classes, submissions and the rest).
  DELETE FROM public.users WHERE id = ANY (v_users);
  DELETE FROM public.schools WHERE id = p_school;
  RETURN v_users;
END $$;

CREATE OR REPLACE FUNCTION public.ops_delete_account(p_school uuid, p_user uuid, p_reason text, p_actor uuid, p_actor_email text)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user public.users%ROWTYPE;
BEGIN
  SELECT * INTO v_user FROM public.users WHERE id = p_user AND school_id = p_school FOR UPDATE;
  IF NOT FOUND OR v_user.role = 'superadmin' THEN
    RAISE EXCEPTION 'Account not found in this school' USING ERRCODE = 'P0002';
  END IF;
  IF EXISTS (SELECT 1 FROM public.fee_invoices WHERE student_id = p_user)
     OR EXISTS (SELECT 1 FROM public.fee_payments WHERE student_id = p_user) THEN
    RAISE EXCEPTION 'This student has fee records, which are kept as financial records, so the account can''t be deleted.'
      USING ERRCODE = 'P0001', HINT = 'has_fee_records';
  END IF;
  -- Somebody must be able to manage the school afterwards.
  IF EXISTS (SELECT 1 FROM public.role_grants g WHERE g.user_id = p_user AND g.school_id = p_school AND g.role_key = 'school_admin'
               AND g.revoked_at IS NULL AND (g.expires_on IS NULL OR g.expires_on >= current_date))
     AND NOT EXISTS (SELECT 1 FROM public.role_grants g WHERE g.user_id <> p_user AND g.school_id = p_school AND g.role_key = 'school_admin'
               AND g.revoked_at IS NULL AND (g.expires_on IS NULL OR g.expires_on >= current_date)) THEN
    RAISE EXCEPTION 'This is the school''s only school admin. Give another admin that role first.'
      USING ERRCODE = 'P0001', HINT = 'last_admin';
  END IF;
  INSERT INTO public.settings_changes (actor_id, actor_email, scope, school_id, key, old_value, new_value, reason)
  VALUES (p_actor, p_actor_email, 'school', p_school, 'account.deleted',
    jsonb_build_object('id', v_user.id, 'name', v_user.name, 'email', v_user.email, 'role', v_user.role),
    NULL, p_reason);
  DELETE FROM public.users WHERE id = p_user;
END $$;

REVOKE ALL ON FUNCTION public.ops_delete_school(uuid, text, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ops_delete_account(uuid, uuid, text, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ops_delete_school(uuid, text, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.ops_delete_account(uuid, uuid, text, uuid, text) TO service_role;
