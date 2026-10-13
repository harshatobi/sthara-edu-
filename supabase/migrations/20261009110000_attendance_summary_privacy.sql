-- Board-pack readers get per-student tallies without the student id: enough for the school's totals, grades and
-- the count under 75%, never who. Those who may see attendance across the school still get ids (the named list).
CREATE OR REPLACE FUNCTION public.school_attendance_summary(p_from date, p_to date, p_month_from date)
RETURNS TABLE (bucket text, student_id uuid, class_name text, key text, present bigint, late bigint, absent bigint, excused bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  WITH who AS (
    SELECT (app.has_perm('attendance.read') OR app.is_superadmin()) AS named,
           (app.has_perm('attendance.read') OR app.has_perm('boardpack.view') OR app.is_superadmin()) AS allowed
  ), a AS (
    SELECT a.student_id, a.class_name, a.day, a.status
    FROM public.attendance a, who
    WHERE who.allowed
      AND a.school_id = app.current_school_id()
      AND a.day BETWEEN greatest(p_from, p_to - 400) AND p_to
  ), s AS (
    SELECT 'student'::text AS bucket, student_id, max(class_name) AS class_name,
           count(*) FILTER (WHERE status = 'present') AS present, count(*) FILTER (WHERE status = 'late') AS late,
           count(*) FILTER (WHERE status = 'absent') AS absent, count(*) FILTER (WHERE status = 'excused') AS excused
    FROM a GROUP BY student_id
    UNION ALL
    SELECT 'student_month', student_id, max(class_name),
           count(*) FILTER (WHERE status = 'present'), count(*) FILTER (WHERE status = 'late'),
           count(*) FILTER (WHERE status = 'absent'), count(*) FILTER (WHERE status = 'excused')
    FROM a WHERE day >= p_month_from GROUP BY student_id
  )
  SELECT s.bucket, CASE WHEN who.named THEN s.student_id END, s.class_name, NULL::text, s.present, s.late, s.absent, s.excused
  FROM s, who
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
