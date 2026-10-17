-- Live Lab: saved demos (a simulation set-up, its predictions and how the class answers).
--
-- A scene is stored whole as JSON after the server has re-checked it with the
-- engine's own validator (src/lib/lab/registry.ts validateScene), so nothing
-- stored here can describe a set-up the simulation would refuse.
-- Writes go through /api/teacher/lab only (service role, teacher scope checked
-- there); signed-in staff of the same school can read, so colleagues can reuse
-- each other's demos. Students and parents never see this table.

CREATE TABLE IF NOT EXISTS public.lab_scenes (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id       uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  teacher_id      uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  class           text NOT NULL CHECK (char_length(class) BETWEEN 1 AND 40),
  subject         text NOT NULL CHECK (char_length(subject) BETWEEN 1 AND 60),
  chapter         text CHECK (chapter IS NULL OR char_length(chapter) <= 200),
  engine          text NOT NULL CHECK (engine ~ '^[a-z][a-z-]{1,29}$'),
  title           text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 140),
  scene           jsonb NOT NULL CHECK (jsonb_typeof(scene) = 'object' AND pg_column_size(scene) < 8192),
  lesson_plan_id  uuid REFERENCES public.lesson_plans(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS lab_scenes_school_class_idx ON public.lab_scenes (school_id, class, subject, updated_at DESC);
CREATE INDEX IF NOT EXISTS lab_scenes_teacher_idx ON public.lab_scenes (teacher_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS lab_scenes_lesson_idx ON public.lab_scenes (lesson_plan_id) WHERE lesson_plan_id IS NOT NULL;

ALTER TABLE public.lab_scenes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.lab_scenes FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.lab_scenes FROM authenticated;
GRANT SELECT ON public.lab_scenes TO authenticated;

DROP POLICY IF EXISTS lab_scenes_staff_read ON public.lab_scenes;
CREATE POLICY lab_scenes_staff_read ON public.lab_scenes FOR SELECT TO authenticated
  USING (((SELECT app.is_staff()) AND school_id = (SELECT app.current_school_id())) OR (SELECT app.is_superadmin()));
