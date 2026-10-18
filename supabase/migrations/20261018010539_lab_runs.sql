-- Live Lab: what a class predicted in one lesson (2026-10-17).
--
-- One row per time a teacher presents a demo to a class: for each question the
-- class reached, how it answered (hands counted per option, the agreed class
-- answer, or think-then-reveal) next to the engine's right answer.
-- Anonymous by design: hands are counted, not named, so a run is class-level
-- misconception evidence only and never counts toward a student's TML.
--
-- Writes go through /api/teacher/lab/runs only (service role, teacher scope
-- checked there), which rebuilds every question and answer from the engine
-- (src/lib/lab/runs.ts) and keeps only the class's counts from the browser.
-- Signed-in staff of the same school can read. Students and parents never see it.

CREATE TABLE IF NOT EXISTS public.lab_runs (
  id          uuid PRIMARY KEY,
  school_id   uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  teacher_id  uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  class       text NOT NULL CHECK (char_length(class) BETWEEN 1 AND 40),
  subject     text NOT NULL CHECK (char_length(subject) BETWEEN 1 AND 60),
  chapter     text CHECK (chapter IS NULL OR char_length(chapter) <= 200),
  engine      text NOT NULL CHECK (engine ~ '^[a-z][a-z-]{1,29}$'),
  scene_id    uuid REFERENCES public.lab_scenes(id) ON DELETE SET NULL,
  scene       jsonb NOT NULL CHECK (jsonb_typeof(scene) = 'object' AND pg_column_size(scene) < 8192),
  results     jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(results) = 'array' AND pg_column_size(results) < 32768),
  started_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS lab_runs_school_class_idx ON public.lab_runs (school_id, class, subject, updated_at DESC);
CREATE INDEX IF NOT EXISTS lab_runs_teacher_idx ON public.lab_runs (teacher_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS lab_runs_scene_idx ON public.lab_runs (scene_id) WHERE scene_id IS NOT NULL;

ALTER TABLE public.lab_runs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.lab_runs FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.lab_runs FROM authenticated;
GRANT SELECT ON public.lab_runs TO authenticated;

DROP POLICY IF EXISTS lab_runs_staff_read ON public.lab_runs;
CREATE POLICY lab_runs_staff_read ON public.lab_runs FOR SELECT TO authenticated
  USING (((SELECT app.is_staff()) AND school_id = (SELECT app.current_school_id())) OR (SELECT app.is_superadmin()));

-- New tables inherit Supabase's default grants; TRUNCATE ignores row-level security, so signed-in users must not hold it.
REVOKE TRUNCATE, TRIGGER, REFERENCES ON public.lab_runs FROM authenticated, anon;
