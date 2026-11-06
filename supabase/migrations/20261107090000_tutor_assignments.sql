-- Tutor session assignments (Socratic tutor PR2, decisions of 2026-11-06; TML spec section 3).
--   critical_gap  assigned automatically when a chapter's TML is 35-49%; the subject teacher gets a feed item.
--                 Closes when the student finishes a session on it (not one ended early), or is cleared
--                 when the chapter is back at 50% or more.
--   teacher       a teacher assigns a session (normal or HOTS) to a student or a whole class (batch_id).
-- Screens read through the server, so signed-in users get no direct access.

CREATE TABLE public.tutor_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  subject text NOT NULL CHECK (length(trim(subject)) BETWEEN 1 AND 80),
  topic text NOT NULL CHECK (length(trim(topic)) BETWEEN 1 AND 200),
  mode text NOT NULL DEFAULT 'standard' CHECK (mode IN ('standard', 'hots')),
  source text NOT NULL CHECK (source IN ('critical_gap', 'teacher')),
  assigned_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  batch_id uuid,
  due_on date,
  note text CHECK (note IS NULL OR length(note) <= 300),
  trigger_score numeric(5,2),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'done', 'cleared', 'cancelled')),
  session_id uuid REFERENCES public.tutor_sessions(id) ON DELETE SET NULL,
  close_reason text CHECK (close_reason IS NULL OR length(close_reason) <= 200),
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (source <> 'teacher' OR assigned_by IS NOT NULL OR status <> 'open'),
  CHECK ((status = 'open') = (closed_at IS NULL))
);
-- One open assignment per student, chapter and mode, whoever set it.
CREATE UNIQUE INDEX tutor_assignments_one_open ON public.tutor_assignments (student_id, lower(subject), lower(topic), mode) WHERE status = 'open';
CREATE INDEX tutor_assignments_school_open ON public.tutor_assignments (school_id, status, created_at DESC);
CREATE INDEX tutor_assignments_student ON public.tutor_assignments (student_id, created_at DESC);
CREATE INDEX tutor_assignments_batch ON public.tutor_assignments (batch_id) WHERE batch_id IS NOT NULL;
CREATE TRIGGER trg_touch_tutor_assignments BEFORE UPDATE ON public.tutor_assignments FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
CREATE TRIGGER trg_audit_tutor_assignments AFTER INSERT OR DELETE OR UPDATE ON public.tutor_assignments FOR EACH ROW EXECUTE FUNCTION app.audit();

ALTER TABLE public.tutor_assignments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.tutor_assignments FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.tutor_assignments TO service_role;

-- The assignment a session was started for (or closed).
ALTER TABLE public.tutor_sessions ADD COLUMN assignment_id uuid REFERENCES public.tutor_assignments(id) ON DELETE SET NULL;
