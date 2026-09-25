-- Lock down pre-role policies — 2026-09-24
--
-- Before office roles, every admin account was "staff" (app.is_staff) and "admin" (app.is_admin),
-- so a cashier or counsellor account could read every student's TML, submissions and tutor sessions,
-- verify guardian links (which is what gives a parent access to a child), and edit classes,
-- materials, the syllabus and any teacher's assignments. This moves each of those to the
-- permission that actually covers it. Teachers are unaffected (they keep role-based access), and
-- school admins and principals keep everything through their roles.
--
--   learning data (TML, submissions, tutor, engagement, proctoring, lesson/course plans, coverage)
--       teacher, or academics.read, or workforce.read (staff effectiveness is computed from it)
--   guardian links, classes, cross-teacher assignment/syllabus edits, materials   people.manage
--   guardian links (read)                     people.manage, compliance.read or fees.remind
--   per-class wellness aggregates             wellness.read
--
-- users_read (names, classes, emails of the school's people) stays open to all staff: every
-- office role needs the roster to do its job.

-- Teacher, or an office role that covers teaching and learning.
CREATE OR REPLACE FUNCTION app.sees_learning() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT COALESCE((SELECT role = 'teacher' FROM public.users WHERE id = auth.uid()), false)
      OR app.has_perm('academics.read') OR app.has_perm('workforce.read')
$$;
CREATE OR REPLACE FUNCTION app.is_teacher() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT COALESCE((SELECT role = 'teacher' FROM public.users WHERE id = auth.uid()), false)
$$;
GRANT EXECUTE ON FUNCTION app.sees_learning(), app.is_teacher() TO authenticated;

-- ── Learning data: reads ────────────────────────────────────────────────────
DROP POLICY IF EXISTS tml_scores_read ON public.tml_scores;
CREATE POLICY tml_scores_read ON public.tml_scores FOR SELECT TO authenticated
  USING (student_id = (SELECT auth.uid())
         OR ((SELECT app.sees_learning()) AND school_id = (SELECT app.current_school_id()))
         OR app.is_parent_of(student_id) OR (SELECT app.is_superadmin()));

DROP POLICY IF EXISTS submissions_read ON public.submissions;
CREATE POLICY submissions_read ON public.submissions FOR SELECT TO authenticated
  USING (student_id = (SELECT auth.uid())
         OR ((SELECT app.sees_learning()) AND school_id = (SELECT app.current_school_id()))
         OR app.is_parent_of(student_id) OR (SELECT app.is_superadmin()));

DROP POLICY IF EXISTS submission_items_read ON public.submission_items;
CREATE POLICY submission_items_read ON public.submission_items FOR SELECT TO authenticated
  USING (student_id = (SELECT auth.uid())
         OR ((SELECT app.sees_learning()) AND school_id = (SELECT app.current_school_id()))
         OR app.is_parent_of(student_id) OR (SELECT app.is_superadmin()));

DROP POLICY IF EXISTS tutor_sessions_read ON public.tutor_sessions;
CREATE POLICY tutor_sessions_read ON public.tutor_sessions FOR SELECT TO authenticated
  USING (student_id = (SELECT auth.uid())
         OR ((SELECT app.sees_learning()) AND school_id = (SELECT app.current_school_id()))
         OR (SELECT app.is_superadmin()));

DROP POLICY IF EXISTS engagement_scores_read ON public.engagement_scores;
CREATE POLICY engagement_scores_read ON public.engagement_scores FOR SELECT TO authenticated
  USING (student_id = (SELECT auth.uid())
         OR ((SELECT app.sees_learning()) AND school_id = (SELECT app.current_school_id()))
         OR app.is_parent_of(student_id) OR (SELECT app.is_superadmin()));

DROP POLICY IF EXISTS proctor_alerts_read ON public.proctor_alerts;
CREATE POLICY proctor_alerts_read ON public.proctor_alerts FOR SELECT TO authenticated
  USING (((SELECT app.sees_learning()) AND school_id = (SELECT app.current_school_id())) OR (SELECT app.is_superadmin()));

DROP POLICY IF EXISTS lesson_plans_staff_read ON public.lesson_plans;
CREATE POLICY lesson_plans_staff_read ON public.lesson_plans FOR SELECT TO authenticated
  USING (((SELECT app.sees_learning()) AND school_id = (SELECT app.current_school_id())) OR (SELECT app.is_superadmin()));

DROP POLICY IF EXISTS course_plans_staff_read ON public.course_plans;
CREATE POLICY course_plans_staff_read ON public.course_plans FOR SELECT TO authenticated
  USING (((SELECT app.sees_learning()) AND school_id = (SELECT app.current_school_id())) OR (SELECT app.is_superadmin()));

DROP POLICY IF EXISTS syllabus_progress_staff_read ON public.syllabus_progress;
CREATE POLICY syllabus_progress_staff_read ON public.syllabus_progress FOR SELECT TO authenticated
  USING (((SELECT app.sees_learning()) AND school_id = (SELECT app.current_school_id())) OR (SELECT app.is_superadmin()));

DROP POLICY IF EXISTS situations_read ON public.situations;
CREATE POLICY situations_read ON public.situations FOR SELECT TO authenticated
  USING (((SELECT app.sees_learning()) AND school_id = (SELECT app.current_school_id())
          AND (teacher_id IS NULL OR teacher_id = (SELECT auth.uid()) OR (SELECT app.has_perm('academics.read'))))
         OR (SELECT app.is_superadmin()));

-- ── Writes that used to be open to any admin ────────────────────────────────
DROP POLICY IF EXISTS assignments_staff_insert ON public.assignments;
CREATE POLICY assignments_staff_insert ON public.assignments FOR INSERT TO authenticated
  WITH CHECK (school_id = (SELECT app.current_school_id())
              AND (((SELECT app.is_teacher()) AND teacher_id = (SELECT auth.uid())) OR (SELECT app.has_perm('people.manage'))));
DROP POLICY IF EXISTS assignments_staff_update ON public.assignments;
CREATE POLICY assignments_staff_update ON public.assignments FOR UPDATE TO authenticated
  USING (school_id = (SELECT app.current_school_id())
         AND (((SELECT app.is_teacher()) AND teacher_id = (SELECT auth.uid())) OR (SELECT app.has_perm('people.manage'))))
  WITH CHECK (school_id = (SELECT app.current_school_id()));
DROP POLICY IF EXISTS assignments_staff_delete ON public.assignments;
CREATE POLICY assignments_staff_delete ON public.assignments FOR DELETE TO authenticated
  USING (school_id = (SELECT app.current_school_id())
         AND (((SELECT app.is_teacher()) AND teacher_id = (SELECT auth.uid())) OR (SELECT app.has_perm('people.manage'))));

DROP POLICY IF EXISTS classes_admin_write ON public.classes;
CREATE POLICY classes_admin_write ON public.classes FOR ALL TO authenticated
  USING (((SELECT app.has_perm('people.manage')) AND school_id = (SELECT app.current_school_id())) OR (SELECT app.is_superadmin()))
  WITH CHECK (((SELECT app.has_perm('people.manage')) AND school_id = (SELECT app.current_school_id())) OR (SELECT app.is_superadmin()));

DROP POLICY IF EXISTS guardians_read ON public.guardians;
CREATE POLICY guardians_read ON public.guardians FOR SELECT TO authenticated
  USING (parent_id = (SELECT auth.uid()) OR student_id = (SELECT auth.uid())
         OR (((SELECT app.has_perm('people.manage')) OR (SELECT app.has_perm('compliance.read')) OR (SELECT app.has_perm('fees.remind')))
             AND EXISTS (SELECT 1 FROM public.users u WHERE u.id = guardians.student_id AND u.school_id = (SELECT app.current_school_id())))
         OR (SELECT app.is_superadmin()));
DROP POLICY IF EXISTS guardians_admin_write ON public.guardians;
CREATE POLICY guardians_admin_write ON public.guardians FOR ALL TO authenticated
  USING (((SELECT app.has_perm('people.manage')) AND EXISTS (SELECT 1 FROM public.users u WHERE u.id = guardians.student_id AND u.school_id = (SELECT app.current_school_id())))
         OR (SELECT app.is_superadmin()))
  WITH CHECK (((SELECT app.has_perm('people.manage')) AND EXISTS (SELECT 1 FROM public.users u WHERE u.id = guardians.student_id AND u.school_id = (SELECT app.current_school_id())))
              OR (SELECT app.is_superadmin()));

DROP POLICY IF EXISTS materials_staff_write ON public.materials;
CREATE POLICY materials_staff_write ON public.materials FOR ALL TO authenticated
  USING ((((SELECT app.is_teacher()) OR (SELECT app.has_perm('people.manage'))) AND school_id = (SELECT app.current_school_id())) OR (SELECT app.is_superadmin()))
  WITH CHECK ((((SELECT app.is_teacher()) OR (SELECT app.has_perm('people.manage'))) AND school_id = (SELECT app.current_school_id())) OR (SELECT app.is_superadmin()));

DROP POLICY IF EXISTS syllabus_staff_write ON public.syllabus;
CREATE POLICY syllabus_staff_write ON public.syllabus FOR ALL TO authenticated
  USING (school_id = (SELECT app.current_school_id())
         AND (((SELECT app.is_teacher()) AND teacher_id = (SELECT auth.uid())) OR (SELECT app.has_perm('people.manage'))))
  WITH CHECK (school_id = (SELECT app.current_school_id())
              AND (((SELECT app.is_teacher()) AND teacher_id = (SELECT auth.uid())) OR (SELECT app.has_perm('people.manage'))));

-- ── Wellness aggregates by class: wellness.read ─────────────────────────────
CREATE OR REPLACE FUNCTION public.school_wellness_aggregates(p_days int DEFAULT 14)
RETURNS TABLE (student_class text, students bigint, checkins bigint, avg_energy numeric, low_share numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT s.student_class, count(DISTINCT w.student_id), count(*), round(avg(w.energy)::numeric, 2),
         round(avg((w.energy <= 2)::int)::numeric, 2)
  FROM public.wellness_logs w
  JOIN public.users s ON s.id = w.student_id
  WHERE app.has_perm('wellness.read')
    AND w.school_id = app.current_school_id()
    AND w.note IS NULL AND w.energy IS NOT NULL
    AND w.created_at >= now() - make_interval(days => least(greatest(p_days, 1), 90))
  GROUP BY s.student_class
  HAVING count(DISTINCT w.student_id) >= 5
$$;

-- Supabase's auto-enable-RLS event trigger function was callable over the API by anyone, signed in
-- or not (advisor 0028/0029). It only works inside an event trigger, and event triggers don't need
-- EXECUTE to fire, so nobody needs to call it directly.
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM public, anon, authenticated;
