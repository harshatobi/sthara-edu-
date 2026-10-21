-- Tutor grounding engine (grounded chat, phase 2).
--
-- 1. tutor_guard_events: one row per off-topic attempt, profanity or safety cue in the
--    tutor. No message text is stored (the decision: count, never keep what was said).
--    The profanity and off-topic follow-ups (3rd strike -> subject teacher; 5th off-topic in
--    a day -> class teacher) count these rows.
-- 2. tutor_sessions gains the grounding: subject_key, chapter_key, micro_topic, grounding
--    (syllabus / prerequisite / exam / study_skills), so mastery attaches to the chapter and
--    the teacher's doubt digest (phase 5) can report by micro-topic.
-- 3. A 'safeguarding' feed audience and the safeguarding.read permission (counsellor,
--    principal, school admin). Safeguarding items (a student's safety cue in the tutor) are
--    visible only to holders of safeguarding.read: not to teachers, and not to other
--    incidents.manage holders such as the vice principal.

-- ── 1. Guard events ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.tutor_guard_events (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id    uuid REFERENCES public.schools(id) ON DELETE CASCADE,
  student_id   uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  kind         text NOT NULL CHECK (kind IN ('off_topic', 'profanity', 'safety')),
  subject_key  text,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tutor_guard_student ON public.tutor_guard_events (student_id, kind, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tutor_guard_school ON public.tutor_guard_events (school_id, created_at DESC);

ALTER TABLE public.tutor_guard_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.tutor_guard_events FROM anon, authenticated;
GRANT SELECT ON public.tutor_guard_events TO authenticated;
GRANT ALL ON public.tutor_guard_events TO service_role;
DROP POLICY IF EXISTS tutor_guard_events_read ON public.tutor_guard_events;
CREATE POLICY tutor_guard_events_read ON public.tutor_guard_events FOR SELECT TO authenticated
  USING (student_id = (SELECT auth.uid())
         OR (school_id = (SELECT app.current_school_id()) AND (SELECT app.has_perm('feed.read')))
         OR (SELECT app.is_superadmin()));

-- ── 2. Grounded tutor sessions ────────────────────────────────────────────────
ALTER TABLE public.tutor_sessions ADD COLUMN IF NOT EXISTS subject_key text;
ALTER TABLE public.tutor_sessions ADD COLUMN IF NOT EXISTS chapter_key text;
ALTER TABLE public.tutor_sessions ADD COLUMN IF NOT EXISTS micro_topic text;
ALTER TABLE public.tutor_sessions ADD COLUMN IF NOT EXISTS grounding text;
DO $$ BEGIN
  ALTER TABLE public.tutor_sessions ADD CONSTRAINT tutor_sessions_grounding_chk
    CHECK (grounding IS NULL OR grounding IN ('syllabus', 'prerequisite', 'exam', 'study_skills'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── 3. Safeguarding audience ──────────────────────────────────────────────────
ALTER TABLE public.situations DROP CONSTRAINT IF EXISTS situations_audience_chk;
ALTER TABLE public.situations ADD CONSTRAINT situations_audience_chk CHECK (audience IN ('staff', 'principal', 'safeguarding'));

-- New office permission (mirrors src/lib/admin/rbac.ts). Added to the catalogue, not a re-seed.
INSERT INTO public.role_permissions (role_key, perm)
SELECT r, p FROM (VALUES
  ('school_admin', ARRAY['safeguarding.read']),
  ('principal', ARRAY['safeguarding.read']),
  ('counsellor', ARRAY['safeguarding.read'])
) AS t(r, ps), unnest(ps) AS p
ON CONFLICT DO NOTHING;

-- Same as 20260926200000_situational_feed, plus: safeguarding items only for safeguarding.read,
-- and incidents.manage no longer reaches them.
DROP POLICY IF EXISTS situations_read ON public.situations;
CREATE POLICY situations_read ON public.situations FOR SELECT TO authenticated
  USING ((school_id = (SELECT app.current_school_id()) AND (
            (audience = 'staff' AND (SELECT app.is_teacher()) AND (
                teacher_id = (SELECT auth.uid())
                OR (teacher_id IS NULL AND student_id IS NOT NULL AND app.teaches_student(student_id))
                OR (teacher_id IS NULL AND student_id IS NULL AND class_name IS NOT NULL AND app.teaches_class(class_name))))
            OR (audience = 'staff' AND (SELECT app.has_perm('feed.read')))
            OR (audience <> 'safeguarding' AND (SELECT app.has_perm('incidents.manage')))
            OR (audience = 'safeguarding' AND (SELECT app.has_perm('safeguarding.read')))))
         OR (SELECT app.is_superadmin()));
