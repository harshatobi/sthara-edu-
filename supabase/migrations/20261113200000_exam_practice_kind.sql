-- Exams: a 'practice' assessment kind (mocks, pre-boards, Studio practice tests). Its marks live in Exams for teachers
-- and the class teacher, but never count: the app refuses a practice code in any term component, so it is never on a
-- report card, and a term's review and publishing don't wait for practice sheets. Widening only; no rows change.
ALTER TABLE public.exam_assessments DROP CONSTRAINT exam_assessments_kind_check;
ALTER TABLE public.exam_assessments ADD CONSTRAINT exam_assessments_kind_check
  CHECK (kind = ANY (ARRAY['written', 'internal', 'practical', 'project', 'oral', 'practice']));
