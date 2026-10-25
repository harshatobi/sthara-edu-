-- Living Record 08: the unified timeline.
--
-- The timeline has no data of its own; it reads 01-07's tables and the learning tables. The one thing it needs from
-- the database is attendance summarised for one student on the server (a student has a register mark per school day,
-- and every API read is capped at 1,000 rows): one row per month, and every run of 3 or more marked school days in a
-- row the student was absent (days without a mark, holidays and weekends, don't break a run).
--
-- Called by the server only (service role); the timeline route checks who may see the student first.

CREATE OR REPLACE FUNCTION public.student_attendance_timeline(p_school uuid, p_student uuid, p_from date DEFAULT NULL, p_to date DEFAULT NULL)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  WITH marks AS (
    SELECT day, status, row_number() OVER (ORDER BY day) AS n
    FROM public.attendance
    WHERE school_id = p_school AND student_id = p_student
      AND (p_from IS NULL OR day >= p_from) AND (p_to IS NULL OR day <= p_to)
  ),
  months AS (
    SELECT to_char(day, 'YYYY-MM') AS month,
           count(*) FILTER (WHERE status = 'present') AS present,
           count(*) FILTER (WHERE status = 'absent') AS absent,
           count(*) FILTER (WHERE status = 'late') AS late,
           count(*) FILTER (WHERE status = 'excused') AS excused,
           count(*) AS marked
    FROM marks GROUP BY 1
  ),
  absent AS (
    SELECT day, n - row_number() OVER (ORDER BY day) AS grp FROM marks WHERE status = 'absent'
  ),
  runs AS (
    SELECT min(day) AS from_day, max(day) AS to_day, count(*) AS days FROM absent GROUP BY grp HAVING count(*) >= 3
  )
  SELECT jsonb_build_object(
    'months', coalesce((SELECT jsonb_agg(jsonb_build_object('month', month, 'present', present, 'absent', absent, 'late', late, 'excused', excused, 'marked', marked) ORDER BY month) FROM months), '[]'::jsonb),
    'runs', coalesce((SELECT jsonb_agg(jsonb_build_object('from', from_day, 'to', to_day, 'days', days) ORDER BY from_day) FROM runs), '[]'::jsonb)
  );
$$;

REVOKE ALL ON FUNCTION public.student_attendance_timeline(uuid, uuid, date, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.student_attendance_timeline(uuid, uuid, date, date) TO service_role;
