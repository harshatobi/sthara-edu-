-- Privacy policy s3: no wellness data is collected without consent. Until now wellness_own only
-- checked ownership. Writing a check-in or journal entry now needs an active 'wellness_checkin'
-- consent on record (set by a linked parent/guardian). Students keep read and delete on their own
-- rows (access and erasure rights). The service role bypasses RLS as before.
CREATE OR REPLACE FUNCTION app.has_wellness_consent(p_student uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.consents c
    WHERE c.student_id = p_student AND c.consent_type = 'wellness_checkin'
      AND c.granted AND c.revoked_at IS NULL
  );
$$;
REVOKE ALL ON FUNCTION app.has_wellness_consent(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.has_wellness_consent(uuid) TO authenticated;

DROP POLICY IF EXISTS wellness_own ON public.wellness_logs;
CREATE POLICY wellness_own_read ON public.wellness_logs FOR SELECT TO authenticated
  USING (student_id = (SELECT auth.uid()));
CREATE POLICY wellness_own_delete ON public.wellness_logs FOR DELETE TO authenticated
  USING (student_id = (SELECT auth.uid()));
CREATE POLICY wellness_own_insert ON public.wellness_logs FOR INSERT TO authenticated
  WITH CHECK (student_id = (SELECT auth.uid())
    AND school_id IS NOT DISTINCT FROM (SELECT app.current_school_id())
    AND app.has_wellness_consent(student_id));
CREATE POLICY wellness_own_update ON public.wellness_logs FOR UPDATE TO authenticated
  USING (student_id = (SELECT auth.uid()) AND app.has_wellness_consent(student_id))
  WITH CHECK (student_id = (SELECT auth.uid())
    AND school_id IS NOT DISTINCT FROM (SELECT app.current_school_id())
    AND app.has_wellness_consent(student_id));
