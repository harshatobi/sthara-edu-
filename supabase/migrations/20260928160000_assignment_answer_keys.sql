-- Answer keys stay with staff — 2026-09-28
--
-- assignments.questions carries the MCQ key (answer / correctAnswerIndex) and
-- the model answer (why). The read policy let every student and parent in the
-- school select it, so a student could read the key before submitting, and
-- all-MCQ work auto-grades as teacher-confirmed evidence.
--
-- 1. Students read public.assignments_student: the same rows the old policy
--    allowed (own school, not a draft), with the key fields removed from each
--    question. Parents read assignments through the server, never directly.
--    The view runs as its owner, so it filters by school itself.
-- 2. 20260928160200 then makes the base table staff- and operator-only. It is
--    separate so the view can exist before the app switches to it.

CREATE OR REPLACE FUNCTION app.strip_answer_key(qs jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE
AS $$
  SELECT CASE WHEN jsonb_typeof(qs) <> 'array' THEN '[]'::jsonb
    ELSE COALESCE((
      SELECT jsonb_agg(CASE WHEN jsonb_typeof(q) = 'object' THEN q - 'answer' - 'correctAnswerIndex' - 'why' ELSE q END ORDER BY ord)
      FROM jsonb_array_elements(qs) WITH ORDINALITY AS t(q, ord)), '[]'::jsonb)
  END
$$;

DROP VIEW IF EXISTS public.assignments_student;
CREATE VIEW public.assignments_student WITH (security_barrier = true) AS
  SELECT a.id, a.school_id, a.teacher_id, a.title, a.type, a.subject, a.class, a.description, a.instructions,
         a.due_date, app.strip_answer_key(a.questions) AS questions, a.tasks, a.units, a.question_paper_url,
         a.assigned_student_ids, a.total_marks, a.status, a.created_at, a.proctored, a.submission_mode, a.updated_at
  FROM public.assignments a
  WHERE a.school_id = (SELECT app.current_school_id())
    AND a.status IS DISTINCT FROM 'draft';

REVOKE ALL ON public.assignments_student FROM anon, public;
GRANT SELECT ON public.assignments_student TO authenticated;
GRANT EXECUTE ON FUNCTION app.strip_answer_key(jsonb) TO authenticated;
