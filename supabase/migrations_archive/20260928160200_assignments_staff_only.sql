-- Assignments base table: staff and operators only — 2026-09-28
--
-- Second half of 20260928160000. Students read public.assignments_student
-- (answer keys removed); parents read through the server. Apply together with
-- the app release that switches the student desk to the view: before it, the
-- student desk still reads this table and would show no assignments.

DROP POLICY IF EXISTS assignments_read ON public.assignments;
CREATE POLICY assignments_read ON public.assignments FOR SELECT TO authenticated
  USING ((school_id = (SELECT app.current_school_id()) AND (SELECT app.is_staff()))
         OR (SELECT app.is_superadmin()));
