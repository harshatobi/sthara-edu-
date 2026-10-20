-- Live Lab practicals (2026-10-18): each student's progress on the CBSE Class 9-10 Science practicals, and
-- practical marks as a source for the Subject Enrichment (Practical Work) internal assessment.
--
-- practical_progress  one row per student per practical (c9-01 … c10-14, src/lib/lab/practicals): when it was done,
--                     whether the record (practical file) is in, and the viva score out of 5. Evidence for the
--                     teacher's Subject Enrichment mark; it is not a mark itself.
-- exam_marks.source   gains 'practical': the subject teacher typed the Subject Enrichment mark in the Live Lab
--                     practicals tracker. It goes into the same open marks sheet as any other mark and is submitted,
--                     reviewed and published the usual way (exams_core); locked sheets refuse it as before.
--
-- Writes go through /api/teacher/practicals only (service role, teacher scope checked there). Signed-in staff of the
-- same school can read. Students and parents never see this table.

CREATE TABLE IF NOT EXISTS public.practical_progress (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id   uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  class       text NOT NULL CHECK (char_length(class) BETWEEN 1 AND 40),
  subject     text NOT NULL CHECK (char_length(subject) BETWEEN 1 AND 60),
  student_id  uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  practical   text NOT NULL CHECK (practical ~ '^c(9|10)-[0-9]{2}$'),
  done_on     date,
  record      text NOT NULL DEFAULT 'none' CHECK (record IN ('none', 'submitted', 'checked')),
  viva        smallint CHECK (viva IS NULL OR viva BETWEEN 0 AND 5),
  note        text CHECK (note IS NULL OR char_length(note) <= 300),
  updated_by  uuid REFERENCES public.users(id) ON DELETE SET NULL,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_id, subject, practical)
);

CREATE INDEX IF NOT EXISTS practical_progress_class_idx ON public.practical_progress (school_id, class, subject);

ALTER TABLE public.practical_progress ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.practical_progress FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.practical_progress FROM authenticated;
GRANT SELECT ON public.practical_progress TO authenticated;

DROP POLICY IF EXISTS practical_progress_staff_read ON public.practical_progress;
CREATE POLICY practical_progress_staff_read ON public.practical_progress FOR SELECT TO authenticated
  USING (((SELECT app.is_staff()) AND school_id = (SELECT app.current_school_id())) OR (SELECT app.is_superadmin()));

-- New tables inherit Supabase's default grants; TRUNCATE ignores row-level security, so signed-in users must not hold it.
REVOKE TRUNCATE, TRIGGER, REFERENCES ON public.practical_progress FROM authenticated, anon;

ALTER TABLE public.exam_marks DROP CONSTRAINT IF EXISTS exam_marks_source_check;
ALTER TABLE public.exam_marks ADD CONSTRAINT exam_marks_source_check
  CHECK (source IN ('grid', 'import', 'online', 'script', 'practical'));
