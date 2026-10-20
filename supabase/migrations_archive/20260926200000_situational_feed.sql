-- Situational feed, attendance and incidents.
--
--   attendance   one row per student per school day, marked by the class teacher
--                (present / absent / late / excused). Written only by the server
--                (/api/teacher/attendance) so the marker's class is always checked.
--   incidents    staff-logged discipline, health, bullying, safety, property and
--                child-protection incidents, with the parent-notice decision the
--                category calls for. Server-written (/api/staff/incidents).
--   situations   the feed itself: one row per thing a teacher or the principal
--                should look at. Raised by the server (src/lib/feed) from
--                proctoring, submissions, TML, wellness, attendance and incidents;
--                never written by clients. `dedupe_key` makes raising idempotent.
--
-- Visibility: teachers see items for students they teach (or items addressed to
-- them); office staff with feed.read see the whole school; items with audience
-- 'principal' (child protection) only reach incidents.manage holders.

-- ── Permissions (mirrors src/lib/admin/rbac.ts) ─────────────────────────────
INSERT INTO public.role_permissions (role_key, perm)
SELECT r, p FROM (VALUES
  ('school_admin',         ARRAY['feed.read', 'incidents.manage', 'attendance.read']),
  ('principal',            ARRAY['feed.read', 'incidents.manage', 'attendance.read']),
  ('vice_principal',       ARRAY['feed.read', 'incidents.manage', 'attendance.read']),
  ('academic_coordinator', ARRAY['feed.read', 'attendance.read'])
) AS t(r, ps), unnest(ps) AS p
ON CONFLICT DO NOTHING;

-- A teacher teaches a class when it is their class-teacher class or one of their assignments.
CREATE OR REPLACE FUNCTION app.teaches_class(p_class text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT app.norm_class(p_class) <> '' AND EXISTS (
    SELECT 1 FROM public.users t
    WHERE t.id = auth.uid() AND t.role = 'teacher'
      AND (app.norm_class(t.teacher_class) = app.norm_class(p_class)
           OR (json_typeof(t.assignments::json) = 'array' AND EXISTS (
                 SELECT 1 FROM json_array_elements(t.assignments::json) e
                 WHERE app.norm_class(e->>'class') = app.norm_class(p_class))))
  )
$$;
REVOKE ALL ON FUNCTION app.teaches_class(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION app.teaches_class(text) TO authenticated;

-- ── Attendance ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.attendance (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id   uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  student_id  uuid NOT NULL REFERENCES public.users(id)   ON DELETE CASCADE,
  -- The student's class on that day (a snapshot: promotions don't rewrite history).
  class_name  text NOT NULL CHECK (length(class_name) BETWEEN 1 AND 40),
  day         date NOT NULL,
  status      text NOT NULL CHECK (status IN ('present', 'absent', 'late', 'excused')),
  note        text CHECK (note IS NULL OR length(note) <= 300),
  marked_by   uuid REFERENCES public.users(id) ON DELETE SET NULL,
  marked_at   timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_id, day)
);
CREATE INDEX IF NOT EXISTS idx_attendance_class_day ON public.attendance (school_id, class_name, day);
CREATE INDEX IF NOT EXISTS idx_attendance_student   ON public.attendance (student_id, day DESC);

-- ── Incidents ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.incidents (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id          uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  student_id         uuid REFERENCES public.users(id) ON DELETE SET NULL,
  class_name         text,
  category           text NOT NULL CHECK (category IN ('health', 'discipline', 'bullying', 'safety', 'property', 'child_protection', 'other')),
  severity           text NOT NULL CHECK (severity IN ('critical', 'high', 'normal')),
  summary            text NOT NULL CHECK (length(summary) BETWEEN 3 AND 160),
  details            text CHECK (details IS NULL OR length(details) <= 4000),
  location           text CHECK (location IS NULL OR length(location) <= 120),
  occurred_at        timestamptz NOT NULL DEFAULT now(),
  logged_by          uuid REFERENCES public.users(id) ON DELETE SET NULL,
  -- sent: parents told; awaiting_class_teacher: class teacher confirms first;
  -- principal_decides: principal/VP decides; declined: decided not to tell; not_applicable: no student.
  parent_notice      text NOT NULL CHECK (parent_notice IN ('sent', 'awaiting_class_teacher', 'principal_decides', 'declined', 'not_applicable')),
  parent_notice_by   uuid REFERENCES public.users(id) ON DELETE SET NULL,
  parent_notice_at   timestamptz,
  status             text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  outcome            text CHECK (outcome IS NULL OR length(outcome) <= 2000),
  closed_by          uuid REFERENCES public.users(id) ON DELETE SET NULL,
  closed_at          timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_incidents_school  ON public.incidents (school_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_incidents_student ON public.incidents (student_id, created_at DESC);

-- ── Situations: from a bare table to the feed ─────────────────────────────
ALTER TABLE public.situations
  ADD COLUMN IF NOT EXISTS category        text,
  ADD COLUMN IF NOT EXISTS severity        text NOT NULL DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS title           text,
  ADD COLUMN IF NOT EXISTS class_name      text,
  ADD COLUMN IF NOT EXISTS subject         text,
  ADD COLUMN IF NOT EXISTS audience        text NOT NULL DEFAULT 'staff',
  ADD COLUMN IF NOT EXISTS source_table    text,
  ADD COLUMN IF NOT EXISTS source_id       uuid,
  ADD COLUMN IF NOT EXISTS dedupe_key      text,
  ADD COLUMN IF NOT EXISTS acknowledged_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS acknowledged_at timestamptz,
  -- Display name at the time, so the feed never needs to read other staff's user rows.
  ADD COLUMN IF NOT EXISTS ack_by_name     text,
  ADD COLUMN IF NOT EXISTS ack_note        text,
  ADD COLUMN IF NOT EXISTS escalate_at     timestamptz,
  ADD COLUMN IF NOT EXISTS escalated_at    timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at      timestamptz NOT NULL DEFAULT now();

UPDATE public.situations SET category = 'academic' WHERE category IS NULL;
UPDATE public.situations SET title = left(coalesce(message, type, 'Situation'), 160) WHERE title IS NULL;
ALTER TABLE public.situations ALTER COLUMN category SET NOT NULL;
ALTER TABLE public.situations ALTER COLUMN title SET NOT NULL;

DO $$ BEGIN
  ALTER TABLE public.situations ADD CONSTRAINT situations_category_chk
    CHECK (category IN ('academic', 'wellness', 'attendance', 'incident', 'security'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.situations ADD CONSTRAINT situations_severity_chk CHECK (severity IN ('critical', 'high', 'normal'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.situations ADD CONSTRAINT situations_audience_chk CHECK (audience IN ('staff', 'principal'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.situations ADD CONSTRAINT situations_ack_note_len CHECK (ack_note IS NULL OR length(ack_note) <= 500);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Not partial, so inserts can use ON CONFLICT (school_id, dedupe_key); NULL keys never collide.
CREATE UNIQUE INDEX IF NOT EXISTS uq_situations_dedupe ON public.situations (school_id, dedupe_key);
CREATE INDEX IF NOT EXISTS idx_situations_school_recent ON public.situations (school_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_situations_open_escalation ON public.situations (school_id, escalate_at)
  WHERE acknowledged_at IS NULL AND escalate_at IS NOT NULL;

-- ── Row-level security ─────────────────────────────────────────────────────
ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.incidents  ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.attendance, public.incidents FROM anon, authenticated;
GRANT SELECT ON public.attendance, public.incidents TO authenticated;
GRANT ALL ON public.attendance, public.incidents TO service_role;
REVOKE INSERT, UPDATE, DELETE ON public.situations FROM anon, authenticated;

-- Attendance: the student, their verified parents, their teachers, office staff with attendance.read.
DROP POLICY IF EXISTS attendance_read ON public.attendance;
CREATE POLICY attendance_read ON public.attendance FOR SELECT TO authenticated
  USING (student_id = (SELECT auth.uid())
         OR app.is_parent_of(student_id)
         OR (school_id = (SELECT app.current_school_id()) AND ((SELECT app.is_teacher()) AND app.teaches_student(student_id)))
         OR (school_id = (SELECT app.current_school_id()) AND (SELECT app.has_perm('attendance.read')))
         OR (SELECT app.is_superadmin()));

-- Incidents: whoever logged it; the student's teachers (never child protection); office staff
-- with feed.read (never child protection); incidents.manage holders see everything.
DROP POLICY IF EXISTS incidents_read ON public.incidents;
CREATE POLICY incidents_read ON public.incidents FOR SELECT TO authenticated
  USING ((school_id = (SELECT app.current_school_id()) AND (
            logged_by = (SELECT auth.uid())
            OR (SELECT app.has_perm('incidents.manage'))
            OR (category <> 'child_protection' AND (
                  (SELECT app.has_perm('feed.read'))
                  OR ((SELECT app.is_teacher()) AND student_id IS NOT NULL AND app.teaches_student(student_id))
                  OR ((SELECT app.is_teacher()) AND student_id IS NULL AND class_name IS NOT NULL AND app.teaches_class(class_name))))))
         OR (SELECT app.is_superadmin()));

-- Situations: addressed to me, or about a student/class I teach; office feed.read sees the
-- school; principal-audience items only for incidents.manage.
DROP POLICY IF EXISTS situations_read ON public.situations;
CREATE POLICY situations_read ON public.situations FOR SELECT TO authenticated
  USING ((school_id = (SELECT app.current_school_id()) AND (
            (audience = 'staff' AND (SELECT app.is_teacher()) AND (
                teacher_id = (SELECT auth.uid())
                OR (teacher_id IS NULL AND student_id IS NOT NULL AND app.teaches_student(student_id))
                OR (teacher_id IS NULL AND student_id IS NULL AND class_name IS NOT NULL AND app.teaches_class(class_name))))
            OR (audience = 'staff' AND (SELECT app.has_perm('feed.read')))
            OR (SELECT app.has_perm('incidents.manage'))))
         OR (SELECT app.is_superadmin()));

-- ── Audit ──────────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_audit_incidents ON public.incidents;
CREATE TRIGGER trg_audit_incidents AFTER INSERT OR UPDATE OR DELETE ON public.incidents
  FOR EACH ROW EXECUTE FUNCTION app.audit();
DROP TRIGGER IF EXISTS trg_audit_attendance ON public.attendance;
CREATE TRIGGER trg_audit_attendance AFTER UPDATE OR DELETE ON public.attendance
  FOR EACH ROW EXECUTE FUNCTION app.audit('status');

DROP TRIGGER IF EXISTS trg_touch_attendance ON public.attendance;
CREATE TRIGGER trg_touch_attendance BEFORE UPDATE ON public.attendance FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
DROP TRIGGER IF EXISTS trg_touch_incidents ON public.incidents;
CREATE TRIGGER trg_touch_incidents BEFORE UPDATE ON public.incidents FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
DROP TRIGGER IF EXISTS trg_touch_situations ON public.situations;
CREATE TRIGGER trg_touch_situations BEFORE UPDATE ON public.situations FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
