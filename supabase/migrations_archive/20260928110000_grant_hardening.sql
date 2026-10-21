-- Grant hardening from the 2026-09-27 audit.
--
-- 1. notifications: the mark-read policy let a signed-in user rewrite any column of their own notification,
--    including user_id, so a student could re-address a notification (title and body of their choosing) to
--    anyone. Clients may now only flip `read`; notifications are written by the server (service role).
-- 2. assignments: the update policy's WITH CHECK only pinned the school, so a teacher could hand one of their
--    assignments to a colleague. The check now matches the policy's USING clause.
-- 3. TRUNCATE is never used by the app and bypasses row-level security; the public roles lose it everywhere.
--    anon (signed out) never writes a table directly, so it loses INSERT/UPDATE/DELETE too. RLS already
--    blocked those writes; this removes the privilege itself.

REVOKE INSERT, UPDATE, DELETE ON public.notifications FROM anon, authenticated;
GRANT UPDATE (read) ON public.notifications TO authenticated;

DROP POLICY IF EXISTS assignments_staff_update ON public.assignments;
CREATE POLICY assignments_staff_update ON public.assignments FOR UPDATE TO authenticated
  USING ((school_id = (SELECT app.current_school_id())) AND ((((SELECT app.is_teacher())) AND (teacher_id = (SELECT auth.uid()))) OR (SELECT app.has_perm('people.manage'))))
  WITH CHECK ((school_id = (SELECT app.current_school_id())) AND ((((SELECT app.is_teacher())) AND (teacher_id = (SELECT auth.uid()))) OR (SELECT app.has_perm('people.manage'))));

DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
           WHERE n.nspname = 'public' AND c.relkind = 'r' LOOP
    EXECUTE format('REVOKE TRUNCATE ON public.%I FROM anon, authenticated', t);
    EXECUTE format('REVOKE INSERT, UPDATE, DELETE ON public.%I FROM anon', t);
  END LOOP;
END $$;
