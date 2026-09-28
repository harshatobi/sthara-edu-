-- Platform Manager: school health metrics (phase 2 of the School Manager upgrade).
--
-- One read-only function that returns, per school, only counts: adoption by role
-- (signed in vs actually did something), per-class adoption, data-quality gaps and
-- operational signals. No names, marks or free text leave the database, which is
-- what lets operators see school health under the aggregates-only rule.
--
-- "Signed in" comes from auth.users.last_sign_in_at (not reachable through the
-- API, hence SECURITY DEFINER). "Active" means the person did something: submitted,
-- used the tutor, set or graded work, marked attendance, messaged, recorded a
-- payment, or any audited write or AI call. People marked as left are excluded.
--
-- Callable by service_role only (the /api/ops routes, after the operator check).

-- Same rule as normClass() in src/lib/teacher/scope.ts: "Class 10-A" = "10a" = "10 A".
CREATE OR REPLACE FUNCTION public.ops_norm_class(c text) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = pg_temp
AS $$ SELECT regexp_replace(lower(coalesce(c, '')), 'class|[^a-z0-9]', '', 'g') $$;

CREATE OR REPLACE FUNCTION public.ops_school_metrics(p_school uuid DEFAULT NULL)
RETURNS TABLE (school_id uuid, metrics jsonb)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
WITH sch AS (
  SELECT s.id FROM public.schools s WHERE p_school IS NULL OR s.id = p_school
),
ppl AS (
  SELECT u.id, u.school_id, u.role, u.student_class, u.custom_student_id, u.assignments, u.metadata,
         a.last_sign_in_at, a.created_at AS auth_created
  FROM public.users u
  JOIN sch ON sch.id = u.school_id
  LEFT JOIN auth.users a ON a.id = u.id
  WHERE u.role IN ('student', 'teacher', 'parent', 'admin')
    AND NOT (coalesce(u.metadata, '{}'::jsonb) ? 'left')
),
acts AS (
  SELECT student_id AS uid, submitted_at AS at FROM public.submissions WHERE submitted_at > now() - interval '56 days'
  UNION ALL SELECT student_id, created_at FROM public.tutor_sessions WHERE created_at > now() - interval '56 days'
  UNION ALL SELECT student_id, created_at FROM public.student_chats WHERE role = 'user' AND created_at > now() - interval '56 days'
  UNION ALL SELECT student_id, created_at FROM public.wellness_logs WHERE created_at > now() - interval '56 days'
  UNION ALL SELECT teacher_id, created_at FROM public.assignments WHERE created_at > now() - interval '56 days'
  UNION ALL SELECT teacher_id, updated_at FROM public.lesson_plans WHERE updated_at > now() - interval '56 days'
  UNION ALL SELECT teacher_id, created_at FROM public.materials WHERE created_at > now() - interval '56 days'
  UNION ALL SELECT marked_by, marked_at FROM public.attendance WHERE marked_at > now() - interval '56 days'
  UNION ALL SELECT updated_by, updated_at FROM public.syllabus_progress WHERE updated_at > now() - interval '56 days'
  UNION ALL SELECT acknowledged_by, acknowledged_at FROM public.situations WHERE acknowledged_at > now() - interval '56 days'
  UNION ALL SELECT logged_by, created_at FROM public.incidents WHERE created_at > now() - interval '56 days'
  UNION ALL SELECT sender_id, created_at FROM public.school_messages WHERE created_at > now() - interval '56 days'
  UNION ALL SELECT recorded_by, recorded_at FROM public.fee_payments WHERE recorded_at > now() - interval '56 days'
  UNION ALL SELECT actor_id, at FROM public.admission_events WHERE at > now() - interval '56 days'
  UNION ALL SELECT granted_by, updated_at FROM public.consents WHERE updated_at > now() - interval '56 days'
  UNION ALL SELECT actor_id, at FROM public.audit_log WHERE at > now() - interval '56 days'
  UNION ALL SELECT user_id, at FROM public.ai_usage WHERE at > now() - interval '56 days'
),
act AS (
  SELECT p.id, p.school_id, p.role, date_trunc('week', a.at) AS wk, max(a.at) AS last_at
  FROM acts a JOIN ppl p ON p.id = a.uid
  GROUP BY 1, 2, 3, 4
),
last_act AS (SELECT id, max(last_at) AS at FROM act GROUP BY id),
roles AS (
  SELECT p.school_id, p.role, jsonb_build_object(
    'total',     count(*),
    'signedIn7',  count(*) FILTER (WHERE p.last_sign_in_at > now() - interval '7 days'),
    'signedIn30', count(*) FILTER (WHERE p.last_sign_in_at > now() - interval '30 days'),
    'active7',    count(*) FILTER (WHERE l.at > now() - interval '7 days'),
    'active30',   count(*) FILTER (WHERE l.at > now() - interval '30 days'),
    'never',      count(*) FILTER (WHERE p.last_sign_in_at IS NULL)
  ) AS m
  FROM ppl p LEFT JOIN last_act l ON l.id = p.id
  GROUP BY 1, 2
),
weekly AS (
  SELECT school_id, jsonb_agg(jsonb_build_object('week', to_char(wk, 'YYYY-MM-DD'), 'role', role, 'active', n) ORDER BY wk, role) AS m
  FROM (SELECT school_id, role, wk, count(DISTINCT id) AS n FROM act GROUP BY 1, 2, 3) w
  GROUP BY 1
),
cls AS (
  SELECT c.school_id, jsonb_agg(jsonb_build_object('name', c.name, 'students', coalesce(x.students, 0), 'active7', coalesce(x.active7, 0)) ORDER BY c.name) AS m
  FROM public.classes c
  JOIN sch ON sch.id = c.school_id
  LEFT JOIN LATERAL (
    SELECT count(*) AS students, count(*) FILTER (WHERE l.at > now() - interval '7 days') AS active7
    FROM ppl p LEFT JOIN last_act l ON l.id = p.id
    WHERE p.school_id = c.school_id AND p.role = 'student'
      AND public.ops_norm_class(p.student_class) = public.ops_norm_class(c.name)
  ) x ON true
  GROUP BY 1
),
verified AS (
  SELECT g.student_id, g.parent_id FROM public.guardians g
  JOIN ppl s ON s.id = g.student_id AND s.role = 'student'
  JOIN ppl pa ON pa.id = g.parent_id AND pa.role = 'parent'
  WHERE g.verified
),
dq AS (
  SELECT p.school_id, jsonb_build_object(
    'studentsNoParent', count(*) FILTER (WHERE p.role = 'student' AND NOT EXISTS (SELECT 1 FROM verified v WHERE v.student_id = p.id)),
    'studentsNoClass',  count(*) FILTER (WHERE p.role = 'student' AND coalesce(trim(p.student_class), '') = ''),
    'studentsNoRoll',   count(*) FILTER (WHERE p.role = 'student' AND coalesce(trim(p.custom_student_id), '') = ''),
    'parentsNoChild',   count(*) FILTER (WHERE p.role = 'parent' AND NOT EXISTS (SELECT 1 FROM verified v WHERE v.parent_id = p.id)),
    'teachersNoAssignments', count(*) FILTER (WHERE p.role = 'teacher' AND jsonb_array_length(CASE WHEN jsonb_typeof(p.assignments) = 'array' THEN p.assignments ELSE '[]'::jsonb END) = 0),
    'staleTempPasswords', count(*) FILTER (WHERE (p.metadata ->> 'mustChangePassword')::boolean IS TRUE AND p.auth_created < now() - interval '14 days')
  ) AS m
  FROM ppl p GROUP BY 1
),
fees AS (
  SELECT i.school_id,
         sum(i.amount - coalesce(i.concession, 0)) AS due,
         count(*) AS invoices,
         coalesce(sum((SELECT sum(fp.amount) FROM public.fee_payments fp WHERE fp.invoice_id = i.id AND fp.voided_at IS NULL)), 0) AS paid
  FROM public.fee_invoices i JOIN sch ON sch.id = i.school_id
  WHERE i.voided_at IS NULL AND i.due_on <= current_date
  GROUP BY 1
),
ops AS (
  SELECT sch.id AS school_id, jsonb_build_object(
    'classCount',        (SELECT count(*) FROM public.classes c WHERE c.school_id = sch.id),
    'attendanceDays14',  (SELECT count(DISTINCT a.day) FROM public.attendance a WHERE a.school_id = sch.id AND a.day > current_date - 14),
    'classesMarked7',    (SELECT count(DISTINCT public.ops_norm_class(a.class_name)) FROM public.attendance a WHERE a.school_id = sch.id AND a.day > current_date - 7),
    'feeStructures',     (SELECT count(*) FROM public.fee_structures f WHERE f.school_id = sch.id),
    'feeDue',            coalesce((SELECT due FROM fees WHERE fees.school_id = sch.id), 0),
    'feeCollected',      coalesce((SELECT paid FROM fees WHERE fees.school_id = sch.id), 0),
    'invoicesDue',       coalesce((SELECT invoices FROM fees WHERE fees.school_id = sch.id), 0),
    'assignments30',     (SELECT count(*) FROM public.assignments x WHERE x.school_id = sch.id AND x.created_at > now() - interval '30 days'),
    'teachersSettingWork30', (SELECT count(DISTINCT x.teacher_id) FROM public.assignments x WHERE x.school_id = sch.id AND x.created_at > now() - interval '30 days'),
    'gradingBacklog',    (SELECT count(*) FROM public.submissions x WHERE x.school_id = sch.id AND x.submitted_at < now() - interval '7 days' AND x.teacher_approved IS NOT TRUE),
    'incidentsOpenOld',  (SELECT count(*) FROM public.incidents x WHERE x.school_id = sch.id AND x.closed_at IS NULL AND x.created_at < now() - interval '14 days'),
    'timetablePublished', EXISTS (SELECT 1 FROM public.timetable_versions t WHERE t.school_id = sch.id AND t.status = 'published'),
    'leavePendingOld',   (SELECT count(*) FROM public.leave_requests x WHERE x.school_id = sch.id AND x.status = 'pending' AND x.created_at < now() - interval '3 days'),
    'errors7',           (SELECT count(*) FROM public.app_errors x WHERE x.school_id = sch.id AND x.at > now() - interval '7 days'),
    'aiCostUsd30',       (SELECT coalesce(sum(x.cost_usd), 0) FROM public.ai_usage x WHERE x.school_id = sch.id AND x.at > now() - interval '30 days')
  ) AS m
  FROM sch
)
SELECT sch.id, jsonb_build_object(
  'at',      now(),
  'roles',   coalesce((SELECT jsonb_object_agg(r.role, r.m) FROM roles r WHERE r.school_id = sch.id), '{}'::jsonb),
  'weekly',  coalesce((SELECT w.m FROM weekly w WHERE w.school_id = sch.id), '[]'::jsonb),
  'classes', coalesce((SELECT c.m FROM cls c WHERE c.school_id = sch.id), '[]'::jsonb),
  'data',    coalesce((SELECT d.m FROM dq d WHERE d.school_id = sch.id), '{}'::jsonb),
  'ops',     (SELECT o.m FROM ops o WHERE o.school_id = sch.id)
)
FROM sch;
$$;

REVOKE ALL ON FUNCTION public.ops_school_metrics(uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ops_school_metrics(uuid) TO service_role;

COMMENT ON FUNCTION public.ops_school_metrics(uuid) IS
  'Platform Manager school health: counts only (adoption by role, per class, data quality, operations). service_role only.';
