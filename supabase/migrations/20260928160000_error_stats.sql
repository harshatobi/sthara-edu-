-- Error log statistics computed in the database (the ops console used to count a capped sample of rows, which
-- undercounted noisy errors over 7 or 30 days).
--
-- ops_error_stats(fingerprints, since) -> {
--   groups: { <fingerprint>: { inRange, schools, users, hours: [24 hourly counts, oldest first, always the last day] } },
--   schools: distinct schools across those groups since `since`
-- }
-- Service role only (the ops API calls it on an operator's behalf).

CREATE OR REPLACE FUNCTION public.ops_error_stats(p_fingerprints text[], p_since timestamptz)
RETURNS jsonb
LANGUAGE sql STABLE SET search_path = public AS $$
  WITH e AS (
    SELECT fingerprint, at, repeats, school_id, user_id
    FROM public.app_errors
    WHERE fingerprint = ANY (p_fingerprints) AND at >= least(p_since, now() - interval '24 hours')
  )
  SELECT jsonb_build_object(
    'groups', coalesce((
      SELECT jsonb_object_agg(fp, jsonb_build_object(
        'inRange', (SELECT coalesce(sum(repeats), 0) FROM e WHERE e.fingerprint = fp AND e.at >= p_since),
        'schools', (SELECT count(DISTINCT school_id) FROM e WHERE e.fingerprint = fp AND e.at >= p_since),
        'users',   (SELECT count(DISTINCT user_id) FROM e WHERE e.fingerprint = fp AND e.at >= p_since),
        -- Slot 23 is the hour up to now, slot 0 the hour 23-24 hours ago.
        'hours',   (SELECT jsonb_agg(coalesce(b.n, 0) ORDER BY h)
                    FROM generate_series(0, 23) AS h
                    LEFT JOIN (SELECT 23 - floor(extract(epoch FROM now() - e.at) / 3600)::int AS slot, sum(e.repeats) AS n
                               FROM e WHERE e.fingerprint = fp GROUP BY 1) b ON b.slot = h)))
      FROM unnest(p_fingerprints) AS fp), '{}'::jsonb),
    'schools', (SELECT count(DISTINCT school_id) FROM e WHERE e.at >= p_since)
  );
$$;
REVOKE ALL ON FUNCTION public.ops_error_stats(text[], timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ops_error_stats(text[], timestamptz) TO service_role;
