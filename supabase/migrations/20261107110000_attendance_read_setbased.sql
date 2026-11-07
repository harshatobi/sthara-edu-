-- The teacher's attendance register timed out ("canceling statement due to statement timeout", 2026-11-06).
-- attendance_read called app.is_parent_of(student_id) and app.teaches_student(student_id) once per ROW;
-- teaches_student re-reads the teacher and parses their class assignments every time. A session of one
-- class (about 4,500 rows) took 1.5s and 40k buffers per page, and the register asks for many pages at once.
--
-- Same rules, evaluated once per query: two set-returning helpers (the caller's verified children; the
-- students the calling teacher teaches) used as `student_id IN (SELECT ...)`, which Postgres runs once as a
-- hashed subplan. Verified before applying, in a rolled-back transaction: for 10 users (subject teacher,
-- two class teachers, parent, student, principal, admin, vice principal, finance, another school's
-- teacher) the visible rows (count and id fingerprint) are identical; teachers 3s -> 0.17s, others ~180ms -> 9ms.
-- The per-row helpers stay (13 other policies still use them).

CREATE OR REPLACE FUNCTION app.my_child_ids() RETURNS SETOF uuid
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$ SELECT student_id FROM public.guardians WHERE parent_id = auth.uid() AND verified $$;

-- Exactly app.teaches_student's rule, for every student at once.
CREATE OR REPLACE FUNCTION app.taught_student_ids() RETURNS SETOF uuid
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT s.id
  FROM public.users t
  JOIN public.users s ON s.school_id = t.school_id AND s.role = 'student' AND app.norm_class(s.student_class) <> ''
  WHERE t.id = auth.uid() AND t.role = 'teacher'
    AND (
      app.norm_class(t.teacher_class) = app.norm_class(s.student_class)
      OR (json_typeof(t.assignments::json) = 'array' AND EXISTS (
            SELECT 1 FROM json_array_elements(t.assignments::json) e
            WHERE app.norm_class(e->>'class') = app.norm_class(s.student_class)))
    )
$$;

REVOKE ALL ON FUNCTION app.my_child_ids() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION app.taught_student_ids() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION app.my_child_ids() TO authenticated;
GRANT EXECUTE ON FUNCTION app.taught_student_ids() TO authenticated;

ALTER POLICY attendance_read ON public.attendance USING (
  (student_id = (SELECT auth.uid()))
  OR (student_id IN (SELECT app.my_child_ids()))
  OR ((school_id = (SELECT app.current_school_id())) AND (SELECT app.is_teacher()) AND (student_id IN (SELECT app.taught_student_ids())))
  OR ((school_id = (SELECT app.current_school_id())) AND (SELECT app.has_perm('attendance.read')))
  OR (SELECT app.is_superadmin())
);
