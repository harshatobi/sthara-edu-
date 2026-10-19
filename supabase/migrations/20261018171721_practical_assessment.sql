-- Live Lab practicals, Class 11-12 (2026-10-18): the practical mark scored by its CBSE components.
--
-- practical_assessment  one row per student per practical marks sheet (the PR1/PR2 sheets of the senior preset):
--                       the parts the teacher scored (Physics: experiment A 7, experiment B 7, record 5, activity 3,
--                       project 3, viva 5; Chemistry: volumetric 8, salt 8, content 6, project 4, record and viva 4)
--                       and their total. The total itself goes into exam_marks (source 'practical') in the same save;
--                       this table keeps the breakdown behind it. Deleting the sheet deletes the breakdown.
-- practical_progress    the practical id check now admits the Class 11-12 ids (p11-ae01, ch12-a01 …); the server
--                       checks each id against the registry (src/lib/lab/practicals), so the database only bounds
--                       its shape.
--
-- Writes go through /api/teacher/practicals only (service role, teacher scope and sheet status checked there).
-- Signed-in staff of the same school can read. Students and parents never see this table.

CREATE TABLE IF NOT EXISTS public.practical_assessment (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id   uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  sheet_id    uuid NOT NULL REFERENCES public.exam_sheets(id) ON DELETE CASCADE,
  class       text NOT NULL CHECK (char_length(class) BETWEEN 1 AND 40),
  subject     text NOT NULL CHECK (char_length(subject) BETWEEN 1 AND 60),
  student_id  uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  parts       jsonb NOT NULL CHECK (jsonb_typeof(parts) = 'object'),
  total       numeric(5,1) NOT NULL CHECK (total BETWEEN 0 AND 100),
  updated_by  uuid REFERENCES public.users(id) ON DELETE SET NULL,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (sheet_id, student_id)
);

CREATE INDEX IF NOT EXISTS practical_assessment_class_idx ON public.practical_assessment (school_id, class, subject);

ALTER TABLE public.practical_assessment ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.practical_assessment FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.practical_assessment FROM authenticated;
GRANT SELECT ON public.practical_assessment TO authenticated;

DROP POLICY IF EXISTS practical_assessment_staff_read ON public.practical_assessment;
CREATE POLICY practical_assessment_staff_read ON public.practical_assessment FOR SELECT TO authenticated
  USING (((SELECT app.is_staff()) AND school_id = (SELECT app.current_school_id())) OR (SELECT app.is_superadmin()));

-- New tables inherit Supabase's default grants; TRUNCATE ignores row-level security, so signed-in users must not hold it.
REVOKE TRUNCATE, TRIGGER, REFERENCES ON public.practical_assessment FROM authenticated, anon;

ALTER TABLE public.practical_progress DROP CONSTRAINT IF EXISTS practical_progress_practical_check;
ALTER TABLE public.practical_progress ADD CONSTRAINT practical_progress_practical_check
  CHECK (practical ~ '^[a-z]{1,2}[0-9]{1,2}-[a-z0-9]{2,6}$');
