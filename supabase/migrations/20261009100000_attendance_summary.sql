-- School-wide student attendance, pre-aggregated for the admin Attendance page and the board pack, so a large
-- school isn't downloaded mark by mark. Buckets:
--   student        each student's tally over [p_from, p_to] (the session)
--   student_month  each student's tally from p_month_from to p_to
--   class_week     each class's tally per week (Monday) over [p_from, p_to]
--   class_day      each class's tally on p_to (today)
-- Readable by anyone who may see attendance across the school or the board pack, in their own school.
CREATE OR REPLACE FUNCTION public.school_attendance_summary(p_from date, p_to date, p_month_from date)
RETURNS TABLE (bucket text, student_id uuid, class_name text, key text, present bigint, late bigint, absent bigint, excused bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  WITH a AS (
    SELECT a.student_id, a.class_name, a.day, a.status
    FROM public.attendance a
    WHERE (app.has_perm('attendance.read') OR app.has_perm('boardpack.view') OR app.is_superadmin())
      AND a.school_id = app.current_school_id()
      AND a.day BETWEEN greatest(p_from, p_to - 400) AND p_to
  )
  SELECT 'student', student_id, max(class_name), NULL::text,
         count(*) FILTER (WHERE status = 'present'), count(*) FILTER (WHERE status = 'late'),
         count(*) FILTER (WHERE status = 'absent'), count(*) FILTER (WHERE status = 'excused')
  FROM a GROUP BY student_id
  UNION ALL
  SELECT 'student_month', student_id, max(class_name), NULL,
         count(*) FILTER (WHERE status = 'present'), count(*) FILTER (WHERE status = 'late'),
         count(*) FILTER (WHERE status = 'absent'), count(*) FILTER (WHERE status = 'excused')
  FROM a WHERE day >= p_month_from GROUP BY student_id
  UNION ALL
  SELECT 'class_week', NULL, class_name, to_char(date_trunc('week', day::timestamp), 'YYYY-MM-DD'),
         count(*) FILTER (WHERE status = 'present'), count(*) FILTER (WHERE status = 'late'),
         count(*) FILTER (WHERE status = 'absent'), count(*) FILTER (WHERE status = 'excused')
  FROM a GROUP BY class_name, date_trunc('week', day::timestamp)
  UNION ALL
  SELECT 'class_day', NULL, class_name, to_char(p_to, 'YYYY-MM-DD'),
         count(*) FILTER (WHERE status = 'present'), count(*) FILTER (WHERE status = 'late'),
         count(*) FILTER (WHERE status = 'absent'), count(*) FILTER (WHERE status = 'excused')
  FROM a WHERE day = p_to GROUP BY class_name
$$;
REVOKE ALL ON FUNCTION public.school_attendance_summary(date, date, date) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.school_attendance_summary(date, date, date) TO authenticated;
