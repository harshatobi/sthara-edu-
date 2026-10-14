-- Debugging tools for the Platform Manager: request explorer, jobs monitor, per-school diagnostics.
--
-- request_log               one row per authenticated API request: when, what route, who (id, role, school), how long.
--                           No query strings, bodies or names. Kept 7 days (pruned nightly by pg_cron).
-- ops_job_runs              each run of a job the app itself performs (the scheduler's own runs are in cron.job_run_details).
-- ops_request_stats()       per-route volume and latency for a period.
-- ops_jobs()                the scheduler's jobs and their recent runs.
-- ops_migrations()          the migrations this database has had applied, newest first.
-- ops_school_diagnostics()  a school's sign-in picture and data-integrity checks, as counts with sample ids.
-- ops_login_check()         everything that decides whether one account can sign in.
--
-- All server-only: written and read by the service role after /api/ops has checked the operator.

CREATE TABLE IF NOT EXISTS public.request_log (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  at           timestamptz NOT NULL DEFAULT now(),
  method       text NOT NULL CHECK (length(method) <= 10),
  route        text NOT NULL CHECK (length(route) <= 300),
  user_id      uuid,
  user_role    text CHECK (user_role IS NULL OR length(user_role) <= 30),
  school_id    uuid,
  duration_ms  integer NOT NULL CHECK (duration_ms >= 0),
  release      text CHECK (release IS NULL OR length(release) <= 60)
);
CREATE INDEX IF NOT EXISTS ix_request_log_at ON public.request_log (at DESC);
CREATE INDEX IF NOT EXISTS ix_request_log_school ON public.request_log (school_id, at DESC);
CREATE INDEX IF NOT EXISTS ix_request_log_user ON public.request_log (user_id, at DESC);

CREATE TABLE IF NOT EXISTS public.ops_job_runs (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  job           text NOT NULL CHECK (length(job) <= 60),
  started_at    timestamptz NOT NULL DEFAULT now(),
  finished_at   timestamptz,
  ok            boolean,
  detail        jsonb NOT NULL DEFAULT '{}'::jsonb,
  triggered_by  text NOT NULL DEFAULT 'schedule' CHECK (length(triggered_by) <= 200)
);
CREATE INDEX IF NOT EXISTS ix_ops_job_runs_job ON public.ops_job_runs (job, started_at DESC);

ALTER TABLE public.request_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ops_job_runs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.request_log, public.ops_job_runs FROM anon, authenticated;
GRANT SELECT, INSERT ON public.request_log TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.ops_job_runs TO service_role;

-- Per-route volume and latency since p_since (optionally one school), busiest first.
CREATE OR REPLACE FUNCTION public.ops_request_stats(p_since timestamptz, p_school uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.n DESC), '[]'::jsonb) FROM (
    SELECT method, route, count(*) AS n,
           round(percentile_cont(0.5) WITHIN GROUP (ORDER BY duration_ms))::int AS p50,
           round(percentile_cont(0.95) WITHIN GROUP (ORDER BY duration_ms))::int AS p95,
           max(duration_ms) AS max, count(DISTINCT user_id) AS users
      FROM public.request_log
     WHERE at >= p_since AND (p_school IS NULL OR school_id = p_school)
     GROUP BY method, route
     ORDER BY count(*) DESC
     LIMIT 200
  ) x
$$;

-- The scheduler's jobs with their last 20 runs each. Empty when pg_cron is not installed.
CREATE OR REPLACE FUNCTION public.ops_jobs() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE out jsonb;
BEGIN
  IF to_regclass('cron.job') IS NULL THEN RETURN '[]'::jsonb; END IF;
  EXECUTE $q$
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'id', j.jobid, 'name', j.jobname, 'schedule', j.schedule, 'active', j.active, 'command', left(j.command, 200),
      'runs', (SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY r.started DESC), '[]'::jsonb) FROM (
                 SELECT d.status, d.start_time AS started, d.end_time AS ended, left(d.return_message, 300) AS message
                   FROM cron.job_run_details d WHERE d.jobid = j.jobid ORDER BY d.start_time DESC LIMIT 20) r)
    ) ORDER BY j.jobname), '[]'::jsonb) FROM cron.job j
  $q$ INTO out;
  RETURN out;
END $$;

CREATE OR REPLACE FUNCTION public.ops_migrations() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE out jsonb;
BEGIN
  IF to_regclass('supabase_migrations.schema_migrations') IS NULL THEN RETURN '[]'::jsonb; END IF;
  EXECUTE $q$
    SELECT coalesce(jsonb_agg(jsonb_build_object('version', version, 'name', name) ORDER BY version DESC), '[]'::jsonb)
      FROM (SELECT version, name FROM supabase_migrations.schema_migrations ORDER BY version DESC LIMIT 25) m
  $q$ INTO out;
  RETURN out;
END $$;

-- A school's sign-in picture by role, the staff who cannot or have not signed in, and its data-integrity checks.
CREATE OR REPLACE FUNCTION public.ops_school_diagnostics(p_school uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  WITH people AS (
    SELECT u.id, u.role, u.name, u.email, u.student_class, u.teacher_class, u.custom_student_id, u.assignments, u.metadata,
           a.last_sign_in_at, a.banned_until, a.email_confirmed_at, (a.id IS NULL) AS no_login
      FROM public.users u LEFT JOIN auth.users a ON a.id = u.id
     WHERE u.school_id = p_school
  ),
  flagged AS (
    SELECT p.*, coalesce((p.metadata ->> 'left')::boolean, false) AS has_left,
           (p.banned_until IS NOT NULL AND p.banned_until > now()) AS banned
      FROM people p
  ),
  logins AS (
    SELECT role,
           count(*) AS total,
           count(*) FILTER (WHERE has_left) AS left_school,
           count(*) FILTER (WHERE NOT has_left AND last_sign_in_at IS NULL) AS never,
           count(*) FILTER (WHERE NOT has_left AND last_sign_in_at >= now() - interval '7 days') AS week,
           count(*) FILTER (WHERE NOT has_left AND last_sign_in_at >= now() - interval '30 days') AS month,
           count(*) FILTER (WHERE NOT has_left AND banned) AS banned,
           count(*) FILTER (WHERE NOT has_left AND coalesce((metadata ->> 'mustChangePassword')::boolean, false)) AS temp_password,
           count(*) FILTER (WHERE no_login) AS no_login
      FROM flagged GROUP BY role
  ),
  stuck AS (
    SELECT id, role, name, email,
           CASE WHEN no_login THEN 'no_login' WHEN banned THEN 'banned' ELSE 'never' END AS state
      FROM flagged
     WHERE role IN ('admin', 'teacher') AND NOT has_left AND (no_login OR banned OR last_sign_in_at IS NULL)
     ORDER BY role, name LIMIT 50
  ),
  active AS (SELECT * FROM flagged WHERE NOT has_left),
  class_names AS (SELECT public.ops_norm_class(name) AS n FROM public.classes WHERE school_id = p_school),
  checks AS (
    SELECT 'students_no_class' AS key, 'users' AS tbl, array_agg(id) AS ids FROM active WHERE role = 'student' AND coalesce(student_class, '') = ''
    UNION ALL
    SELECT 'students_unknown_class', 'users', array_agg(id) FROM active
     WHERE role = 'student' AND coalesce(student_class, '') <> '' AND public.ops_norm_class(student_class) NOT IN (SELECT n FROM class_names)
    UNION ALL
    SELECT 'teachers_teach_nothing', 'users', array_agg(id) FROM active
     WHERE role = 'teacher' AND coalesce(teacher_class, '') = '' AND (assignments IS NULL OR jsonb_typeof(to_jsonb(assignments)) <> 'array' OR jsonb_array_length(to_jsonb(assignments)) = 0)
    UNION ALL
    SELECT 'parents_no_child', 'users', array_agg(p.id) FROM active p
     WHERE p.role = 'parent' AND NOT EXISTS (SELECT 1 FROM public.guardians g WHERE g.parent_id = p.id)
    UNION ALL
    SELECT 'students_no_verified_parent', 'users', array_agg(s.id) FROM active s
     WHERE s.role = 'student' AND NOT EXISTS (SELECT 1 FROM public.guardians g WHERE g.student_id = s.id AND g.verified)
    UNION ALL
    SELECT 'duplicate_roll_numbers', 'users', array_agg(id) FROM active a
     WHERE a.role = 'student' AND coalesce(a.custom_student_id, '') <> ''
       AND (SELECT count(*) FROM active b WHERE b.role = 'student' AND lower(trim(b.custom_student_id)) = lower(trim(a.custom_student_id))) > 1
    UNION ALL
    SELECT 'family_links_across_schools', 'users', array_agg(DISTINCT s.id) FROM people s
      JOIN public.guardians g ON g.student_id = s.id JOIN public.users par ON par.id = g.parent_id
     WHERE par.school_id IS DISTINCT FROM p_school
    UNION ALL
    SELECT 'classes_no_students', 'classes', array_agg(c.id) FROM public.classes c
     WHERE c.school_id = p_school AND NOT EXISTS (SELECT 1 FROM active s WHERE s.role = 'student' AND public.ops_norm_class(s.student_class) = public.ops_norm_class(c.name))
    UNION ALL
    SELECT 'accounts_no_login', 'users', array_agg(id) FROM flagged WHERE no_login
  )
  SELECT jsonb_build_object(
    'logins', (SELECT coalesce(jsonb_agg(to_jsonb(l) ORDER BY l.role), '[]'::jsonb) FROM logins l),
    'stuck', (SELECT coalesce(jsonb_agg(to_jsonb(s)), '[]'::jsonb) FROM stuck s),
    'checks', (SELECT jsonb_agg(jsonb_build_object('key', key, 'table', tbl, 'count', coalesce(array_length(ids, 1), 0), 'sample', to_jsonb(coalesce(ids[1:5], '{}'::uuid[])))) FROM checks)
  )
$$;

-- Everything that decides whether the account with this email, in this school, can sign in. NULL when the school has no such account.
CREATE OR REPLACE FUNCTION public.ops_login_check(p_school uuid, p_email text) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT jsonb_build_object(
    'id', u.id, 'role', u.role,
    'hasLogin', a.id IS NOT NULL,
    'confirmed', a.email_confirmed_at IS NOT NULL,
    'bannedUntil', CASE WHEN a.banned_until > now() THEN a.banned_until END,
    'lastSignIn', a.last_sign_in_at,
    'createdAt', coalesce(a.created_at, u.created_at),
    'left', coalesce((u.metadata ->> 'left')::boolean, false),
    'tempPassword', coalesce((u.metadata ->> 'mustChangePassword')::boolean, false),
    'emailMatches', lower(coalesce(a.email, '')) = lower(coalesce(u.email, '')),
    'hasPassword', coalesce(a.encrypted_password, '') <> '',
    'twoFactor', EXISTS (SELECT 1 FROM auth.mfa_factors f WHERE f.user_id = u.id AND f.status = 'verified')
  )
  FROM public.users u LEFT JOIN auth.users a ON a.id = u.id
  WHERE u.school_id = p_school AND lower(u.email) = lower(trim(p_email))
  LIMIT 1
$$;

REVOKE ALL ON FUNCTION public.ops_request_stats(timestamptz, uuid), public.ops_jobs(), public.ops_migrations(),
  public.ops_school_diagnostics(uuid), public.ops_login_check(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ops_request_stats(timestamptz, uuid), public.ops_jobs(), public.ops_migrations(),
  public.ops_school_diagnostics(uuid), public.ops_login_check(uuid, text) TO service_role;

-- Request rows are kept a week. 19:15 UTC is 00:45 India time.
DO $$
BEGIN
  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'request-log-prune';
  PERFORM cron.schedule('request-log-prune', '15 19 * * *', $c$DELETE FROM public.request_log WHERE at < now() - interval '7 days'$c$);
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron not available (%): request_log is not pruned automatically.', SQLERRM;
END $$;
