-- Counts for the Platform Manager's school list and school page, done in the database.
--
-- The API used to read every user row and count in the server, which the 1,000-row page limit silently cut short:
-- a school with 2,000 accounts showed 38 students and no teachers. These functions count where the data is.
--
-- ops_registry_counts()   per school: accounts by role, classes (and those with no subjects), open and late cases,
--                         open and overdue follow-ups, the primary contact, the last logged activity and last sign-in.
-- ops_school_ai()         a school's AI calls, failures, tokens and spend since a time.
--
-- Service role only, after /api/ops has checked the operator.

CREATE OR REPLACE FUNCTION public.ops_registry_counts(p_school uuid DEFAULT NULL)
RETURNS TABLE (school_id uuid, counts jsonb)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  WITH s AS (SELECT id FROM public.schools WHERE p_school IS NULL OR id = p_school),
  people AS (
    SELECT u.school_id, u.role, count(*) AS n, max(a.last_sign_in_at) AS last_sign_in
      FROM public.users u LEFT JOIN auth.users a ON a.id = u.id
     WHERE u.school_id IN (SELECT id FROM s) GROUP BY u.school_id, u.role
  ),
  roles AS (SELECT school_id, jsonb_object_agg(role, n) AS roles, sum(n)::int AS people, max(last_sign_in) AS last_sign_in FROM people GROUP BY school_id),
  cls AS (
    SELECT c.school_id, count(*)::int AS classes,
           count(*) FILTER (WHERE jsonb_typeof(c.metadata -> 'subjects') IS DISTINCT FROM 'array' OR jsonb_array_length(c.metadata -> 'subjects') = 0)::int AS empty
      FROM public.classes c WHERE c.school_id IN (SELECT id FROM s) GROUP BY c.school_id
  ),
  cases AS (
    SELECT c.school_id, count(*)::int AS open,
           count(*) FILTER (WHERE (c.first_responded_at IS NULL AND now() > c.first_response_due) OR now() > c.resolve_due)::int AS late,
           count(*) FILTER (WHERE c.owner_id IS NULL)::int AS unassigned
      FROM public.ops_cases c WHERE c.status NOT IN ('resolved', 'closed') AND c.school_id IN (SELECT id FROM s) GROUP BY c.school_id
  ),
  tasks AS (
    SELECT t.school_id, count(*)::int AS open, count(*) FILTER (WHERE t.due_on < (now() AT TIME ZONE 'Asia/Kolkata')::date)::int AS overdue
      FROM public.ops_tasks t WHERE t.status = 'open' AND t.school_id IN (SELECT id FROM s) GROUP BY t.school_id
  ),
  acts AS (SELECT a.school_id, max(a.happened_at) AS last FROM public.ops_activities a WHERE a.school_id IN (SELECT id FROM s) GROUP BY a.school_id),
  prim AS (SELECT DISTINCT ON (c.school_id) c.school_id, c.name, c.phone, c.email FROM public.ops_contacts c
            WHERE c.active AND c.school_id IN (SELECT id FROM s) ORDER BY c.school_id, c.is_primary DESC, c.decides DESC, c.created_at)
  SELECT s.id, jsonb_build_object(
    'roles', coalesce(r.roles, '{}'::jsonb), 'people', coalesce(r.people, 0), 'lastSignIn', r.last_sign_in,
    'classes', coalesce(cls.classes, 0), 'classesWithoutSubjects', coalesce(cls.empty, 0),
    'openCases', coalesce(cases.open, 0), 'lateCases', coalesce(cases.late, 0), 'unassignedCases', coalesce(cases.unassigned, 0),
    'openTasks', coalesce(tasks.open, 0), 'overdueTasks', coalesce(tasks.overdue, 0),
    'lastActivity', acts.last,
    'contact', CASE WHEN prim.name IS NULL THEN NULL ELSE jsonb_build_object('name', prim.name, 'phone', prim.phone, 'email', prim.email) END
  )
  FROM s
  LEFT JOIN roles r ON r.school_id = s.id
  LEFT JOIN cls ON cls.school_id = s.id
  LEFT JOIN cases ON cases.school_id = s.id
  LEFT JOIN tasks ON tasks.school_id = s.id
  LEFT JOIN acts ON acts.school_id = s.id
  LEFT JOIN prim ON prim.school_id = s.id
$$;

CREATE OR REPLACE FUNCTION public.ops_school_ai(p_school uuid, p_since timestamptz) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT jsonb_build_object(
    'calls', count(*), 'failed', count(*) FILTER (WHERE NOT ok),
    'tokens', coalesce(sum(input_tokens + output_tokens + thinking_tokens), 0),
    'costUsd', coalesce(sum(cost_usd), 0))
  FROM public.ai_usage WHERE school_id = p_school AND at >= p_since
$$;

REVOKE ALL ON FUNCTION public.ops_registry_counts(uuid), public.ops_school_ai(uuid, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ops_registry_counts(uuid), public.ops_school_ai(uuid, timestamptz) TO service_role;
