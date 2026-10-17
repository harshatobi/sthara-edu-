-- TML health for the Platform Manager: per school, how many students have teacher-confirmed work from the last
-- 14 days that is newer than their latest TML snapshot (plus a 30-minute grace for the recompute), or no snapshot
-- at all. One row per affected school, so the overview no longer pages every item and snapshot to compare two dates.
CREATE OR REPLACE FUNCTION public.ops_tml_stale(p_since timestamptz DEFAULT now() - interval '14 days')
RETURNS TABLE (school_id uuid, students integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  WITH ev AS (
    SELECT i.school_id, i.student_id, max(i.created_at) AS newest
    FROM public.submission_items i
    WHERE i.teacher_confirmed AND i.created_at >= p_since AND i.created_at < now() - interval '30 minutes'
    GROUP BY 1, 2
  )
  SELECT ev.school_id, count(*)::int
  FROM ev
  LEFT JOIN LATERAL (
    SELECT max(t.computed_at) AS at FROM public.tml_scores t WHERE t.student_id = ev.student_id
  ) snap ON true
  WHERE snap.at IS NULL OR snap.at + interval '30 minutes' < ev.newest
  GROUP BY 1
$$;

CREATE INDEX IF NOT EXISTS idx_submission_items_confirmed_recent
  ON public.submission_items (created_at) WHERE teacher_confirmed;
CREATE INDEX IF NOT EXISTS idx_tml_scores_student_computed
  ON public.tml_scores (student_id, computed_at DESC);

REVOKE ALL ON FUNCTION public.ops_tml_stale(timestamptz) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ops_tml_stale(timestamptz) TO service_role;

COMMENT ON FUNCTION public.ops_tml_stale(timestamptz) IS
  'Platform Manager TML health: students per school whose confirmed work is newer than their latest TML snapshot. service_role only.';
