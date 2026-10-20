-- Admin desk: each teacher's marking workload, counted in the database — 2026-10-15
--
-- The admin desk used to download every submission in the school (37,000 rows, 117 requests, 3 MB in the
-- sandbox school) on every page load, only to count, per teacher: submissions waiting for review, the oldest of
-- them, and how many were graded in the last 30 days. This returns those counts, one row per teacher.
--
-- Nothing is removed or hidden: the submissions stay as they are and remain queryable. The graded count covers a
-- window: the last 30 days by default (the desk), or any dates the caller passes (an earlier term or session).
--
-- Read-only. Callers: an office account of the school with dashboard.view or workforce.read (the browser desk),
-- or the service role (the School OS brief on the server). Anyone else gets no rows.

CREATE OR REPLACE FUNCTION public.admin_teacher_work(p_school uuid, p_from timestamptz DEFAULT now() - interval '30 days', p_to timestamptz DEFAULT now())
RETURNS TABLE (teacher_id uuid, pending bigint, oldest_pending timestamptz, graded30 bigint, last_graded timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  WITH ok AS (
    SELECT coalesce(auth.jwt() ->> 'role', '') = 'service_role'
        OR app.is_superadmin()
        OR (p_school = app.current_school_id() AND (app.has_perm('dashboard.view') OR app.has_perm('workforce.read'))) AS allowed
  )
  SELECT a.teacher_id,
         count(*) FILTER (WHERE s.teacher_approved IS NOT TRUE),
         min(s.submitted_at) FILTER (WHERE s.teacher_approved IS NOT TRUE),
         count(*) FILTER (WHERE s.teacher_approved IS TRUE AND s.updated_at >= p_from AND s.updated_at <= p_to),
         max(s.updated_at) FILTER (WHERE s.teacher_approved IS TRUE AND s.updated_at >= p_from AND s.updated_at <= p_to)
  FROM public.submissions s
  JOIN public.assignments a ON a.id = s.assignment_id
  WHERE a.school_id = p_school AND (SELECT allowed FROM ok)
  GROUP BY a.teacher_id
$$;

REVOKE ALL ON FUNCTION public.admin_teacher_work(uuid, timestamptz, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_teacher_work(uuid, timestamptz, timestamptz) TO authenticated, service_role;
