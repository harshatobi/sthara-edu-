-- Teacher workflow (assignments, quizzes, review) — 2026-09-23
--
-- 1. submissions.teacher_note: the teacher's written feedback on a reviewed
--    submission (the review route has always sent one; the column was missing,
--    so every review failed).
-- 2. Drafts: an assignment with status 'draft' is visible to school staff only.
--    Students and parents see it once it's posted ('published').
-- 3. status is one of draft / published (existing rows are all 'published').

ALTER TABLE public.submissions ADD COLUMN IF NOT EXISTS teacher_note text;

UPDATE public.assignments SET status = 'published' WHERE status IS NULL;
ALTER TABLE public.assignments ALTER COLUMN status SET DEFAULT 'published';
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'assignments_status_valid') THEN
    ALTER TABLE public.assignments ADD CONSTRAINT assignments_status_valid CHECK (status IN ('draft', 'published'));
  END IF;
END $$;

DROP POLICY IF EXISTS assignments_read ON public.assignments;
CREATE POLICY assignments_read ON public.assignments FOR SELECT TO authenticated
  USING ((school_id = (SELECT app.current_school_id())
          AND (status IS DISTINCT FROM 'draft' OR (SELECT app.is_staff())))
         OR (SELECT app.is_superadmin()));
