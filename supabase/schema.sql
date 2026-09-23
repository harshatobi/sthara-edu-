-- ============================================================================
-- Sthara OS - Postgres & Supabase Production Schema & Security Migration
-- Date: 2026-08-09
-- Specification: TML Metric Model & Schema Review (2026-07-23)
-- ============================================================================

-- 1. ENFORCE NOT NULL & DEFAULT ON users.role (P0)
UPDATE public.users SET role = 'student' WHERE role IS NULL;
ALTER TABLE public.users ALTER COLUMN role SET NOT NULL;
ALTER TABLE public.users ALTER COLUMN role SET DEFAULT 'student';

-- CREATE PUBLIC STORAGE BUCKET FOR SUBMISSIONS
INSERT INTO storage.buckets (id, name, public) 
VALUES ('submissions', 'submissions', true) 
ON CONFLICT (id) DO UPDATE SET public = true;

-- 2. ENFORCE UNIQUENESS ON submissions(assignment_id, student_id) (P0)
DELETE FROM public.submissions a USING public.submissions b
WHERE a.assignment_id = b.assignment_id
  AND a.student_id = b.student_id
  AND a.submitted_at < b.submitted_at;

DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'unique_assignment_student'
  ) THEN
    ALTER TABLE public.submissions
      ADD CONSTRAINT unique_assignment_student UNIQUE (assignment_id, student_id);
  END IF;
END $$;

-- 3. LEARNING OUTCOMES TAXONOMY (CBSE Outcome Mapping)
CREATE TABLE IF NOT EXISTS public.learning_outcomes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  subject TEXT NOT NULL,
  class TEXT NOT NULL,
  unit_name TEXT NOT NULL,
  outcome_code TEXT NOT NULL UNIQUE, -- e.g. "CBSE-SCI10-CHEM-01"
  outcome_name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_outcomes_subject_class 
  ON public.learning_outcomes(subject, class, unit_name);

-- 4. PER-ITEM SUBMISSION STORAGE (Granular Question-Level Scores)
CREATE TABLE IF NOT EXISTS public.submission_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  submission_id UUID NOT NULL REFERENCES public.submissions(id) ON DELETE CASCADE,
  assignment_id UUID NOT NULL REFERENCES public.assignments(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  school_id UUID REFERENCES public.schools(id) ON DELETE CASCADE,
  question_index INT NOT NULL,
  outcome_code TEXT REFERENCES public.learning_outcomes(outcome_code),
  component_type TEXT NOT NULL DEFAULT 'homework' CHECK (component_type IN ('assessment', 'quiz', 'homework', 'retention', 'classwork')),
  score NUMERIC(5, 2) NOT NULL DEFAULT 0,
  max_score NUMERIC(5, 2) NOT NULL DEFAULT 1,
  difficulty TEXT DEFAULT 'medium' CHECK (difficulty IN ('easy', 'medium', 'hard')),
  hints_used INT DEFAULT 0,
  attempts_count INT DEFAULT 1,
  teacher_confirmed BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_submission_items_student_outcome 
  ON public.submission_items(student_id, outcome_code, created_at DESC);

-- 5. AI TUTOR SESSION LOGGING (Assistance Modifier Source)
CREATE TABLE IF NOT EXISTS public.tutor_sessions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  school_id UUID REFERENCES public.schools(id) ON DELETE CASCADE,
  subject TEXT,
  topic TEXT,
  question_id TEXT,
  hint_depth INT DEFAULT 0, -- 0 = unaided, 1 = 1 hint, >1 = multiple hints
  answer_revealed BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tutor_sessions_student 
  ON public.tutor_sessions(student_id, created_at DESC);

-- 6. PERSISTED TML SCORES (Append-Only TML Score Engine Log)
CREATE TABLE IF NOT EXISTS public.tml_scores (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  school_id UUID REFERENCES public.schools(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  topic_name TEXT NOT NULL,
  outcome_code TEXT,
  score NUMERIC(5, 2) NOT NULL CHECK (score >= 0 AND score <= 100),
  confidence_band TEXT DEFAULT 'provisional' CHECK (confidence_band IN ('insufficient', 'provisional', 'firm')),
  item_count INT DEFAULT 0,
  components JSONB DEFAULT '{}'::jsonb, -- stores assessment_score, quiz_score, hw_score, retention_score, classwork_score
  computed_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tml_scores_student_subject 
  ON public.tml_scores(student_id, subject, computed_at DESC);

CREATE INDEX IF NOT EXISTS idx_tml_scores_school_subject 
  ON public.tml_scores(school_id, subject, computed_at DESC);

-- 7. SEPARATE ENGAGEMENT INDEX (Attendance, App Engagement, Teacher Contact)
CREATE TABLE IF NOT EXISTS public.engagement_scores (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  school_id UUID REFERENCES public.schools(id) ON DELETE CASCADE,
  attendance_score NUMERIC(5, 2) DEFAULT 100,
  app_engagement_score NUMERIC(5, 2) DEFAULT 100,
  teacher_engagement_score NUMERIC(5, 2) DEFAULT 100,
  overall_engagement NUMERIC(5, 2) DEFAULT 100,
  computed_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. ROW LEVEL SECURITY (RLS) POLICIES (P0 Security Hardening)
ALTER TABLE public.submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wellness_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.learning_outcomes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.submission_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tutor_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tml_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.engagement_scores ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- SUBMISSIONS RLS
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Student read own submissions" ON public.submissions;
DROP POLICY IF EXISTS "Student insert own submission" ON public.submissions;
DROP POLICY IF EXISTS "Student update own submission" ON public.submissions;
DROP POLICY IF EXISTS "Teacher update submission grades" ON public.submissions;

CREATE POLICY "Student read own submissions"
ON public.submissions FOR SELECT
USING (
  auth.uid() = student_id OR
  EXISTS (
    SELECT 1 FROM public.users
    WHERE users.id = auth.uid()
    AND users.role IN ('teacher', 'admin', 'superadmin')
    AND users.school_id = submissions.school_id
  )
);

CREATE POLICY "Student insert own submission"
ON public.submissions FOR INSERT
WITH CHECK (auth.uid() = student_id);

CREATE POLICY "Student update own submission"
ON public.submissions FOR UPDATE
USING (auth.uid() = student_id);

CREATE POLICY "Teacher update submission grades"
ON public.submissions FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.users
    WHERE users.id = auth.uid()
    AND users.role IN ('teacher', 'admin', 'superadmin')
    AND users.school_id = submissions.school_id
  )
);

-- ----------------------------------------------------------------------------
-- NOTIFICATIONS RLS (Close Cross-Student Read Leak P0)
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "User read own notifications" ON public.notifications;

CREATE POLICY "User read own notifications"
ON public.notifications FOR SELECT
USING (
  auth.uid() = student_id OR
  EXISTS (
    SELECT 1 FROM public.users
    WHERE users.id = auth.uid()
    AND users.role IN ('teacher', 'admin', 'superadmin')
    AND users.school_id = notifications.school_id
  )
);

-- ----------------------------------------------------------------------------
-- ASSIGNMENTS RLS (Teacher Path Write Security)
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users read school assignments" ON public.assignments;
DROP POLICY IF EXISTS "Teacher create assignments" ON public.assignments;
DROP POLICY IF EXISTS "Teacher update assignments" ON public.assignments;

CREATE POLICY "Users read school assignments"
ON public.assignments FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.users
    WHERE users.id = auth.uid()
    AND users.school_id = assignments.school_id
  )
);

CREATE POLICY "Teacher create assignments"
ON public.assignments FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.users
    WHERE users.id = auth.uid()
    AND users.role IN ('teacher', 'admin', 'superadmin')
    AND users.school_id = assignments.school_id
  )
);

CREATE POLICY "Teacher update assignments"
ON public.assignments FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.users
    WHERE users.id = auth.uid()
    AND users.role IN ('teacher', 'admin', 'superadmin')
    AND users.school_id = assignments.school_id
  )
);

-- ----------------------------------------------------------------------------
-- SUBMISSION ITEMS & TUTOR SESSIONS RLS
-- ----------------------------------------------------------------------------
CREATE POLICY "Student read own submission items"
ON public.submission_items FOR SELECT
USING (
  auth.uid() = student_id OR
  EXISTS (
    SELECT 1 FROM public.users
    WHERE users.id = auth.uid()
    AND users.role IN ('teacher', 'admin', 'superadmin')
    AND users.school_id = submission_items.school_id
  )
);

CREATE POLICY "Student read own tutor sessions"
ON public.tutor_sessions FOR SELECT
USING (
  auth.uid() = student_id OR
  EXISTS (
    SELECT 1 FROM public.users
    WHERE users.id = auth.uid()
    AND users.role IN ('teacher', 'admin', 'superadmin')
    AND users.school_id = tutor_sessions.school_id
  )
);

-- ----------------------------------------------------------------------------
-- TML SCORES & ENGAGEMENT RLS
-- ----------------------------------------------------------------------------
CREATE POLICY "Student read own tml scores"
ON public.tml_scores FOR SELECT
USING (
  auth.uid() = student_id OR
  EXISTS (
    SELECT 1 FROM public.users
    WHERE users.id = auth.uid()
    AND users.role IN ('teacher', 'admin', 'superadmin')
    AND users.school_id = tml_scores.school_id
  )
);

CREATE POLICY "Student read own engagement scores"
ON public.engagement_scores FOR SELECT
USING (
  auth.uid() = student_id OR
  EXISTS (
    SELECT 1 FROM public.users
    WHERE users.id = auth.uid()
    AND users.role IN ('teacher', 'admin', 'superadmin')
    AND users.school_id = engagement_scores.school_id
  )
);

-- ============================================================================
-- 9. HOMEWORK SUBMISSION WORKSPACE (2026-09-21)
-- Adds: per-assignment proctoring + submission mode, and the proctor_alerts
-- table that /api/student/proctor-alert already writes to defensively.
-- ============================================================================

ALTER TABLE public.assignments ADD COLUMN IF NOT EXISTS proctored BOOLEAN NOT NULL DEFAULT false;

-- 'typed'       -> digital per-question form (short answer / MCQ / file-upload questions)
-- 'handwritten' -> student photographs handwritten work; graded by Vision AI as one sheet
ALTER TABLE public.assignments ADD COLUMN IF NOT EXISTS submission_mode TEXT NOT NULL DEFAULT 'handwritten'
  CHECK (submission_mode IN ('typed', 'handwritten'));

CREATE TABLE IF NOT EXISTS public.proctor_alerts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id UUID REFERENCES public.schools(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  student_name TEXT,
  assignment_id UUID REFERENCES public.assignments(id) ON DELETE CASCADE,
  assignment_title TEXT,
  switch_count INT NOT NULL DEFAULT 0,
  flagged_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_proctor_alerts_school
  ON public.proctor_alerts(school_id, flagged_at DESC);

ALTER TABLE public.proctor_alerts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Teacher read school proctor alerts" ON public.proctor_alerts;
DROP POLICY IF EXISTS "Student insert own proctor alert" ON public.proctor_alerts;

CREATE POLICY "Teacher read school proctor alerts"
ON public.proctor_alerts FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.users
    WHERE users.id = auth.uid()
    AND users.role IN ('teacher', 'admin', 'superadmin')
    AND users.school_id = proctor_alerts.school_id
  )
);

CREATE POLICY "Student insert own proctor alert"
ON public.proctor_alerts FOR INSERT
WITH CHECK (auth.uid() = student_id);

-- ============================================================================
-- 10. SCHEMA HARDENING (2026-09-21)
-- Applies the outstanding items from the architect's schema review
-- (Schema_Review_Sthara.md / schema_hardening_patch.sql, 2026-07-23) that were
-- not yet in this file: RLS perf helpers, guardians + consents tables, missing
-- indexes, updated_at triggers. Idempotent — safe to re-run.
--
-- NOT applied here: the patch's `submissions.attempt` multi-attempt model —
-- this file already enforces one submission per (assignment_id, student_id)
-- via `unique_assignment_student` (see section 2 above), which the Homework
-- Workspace (src/app/student/homework/[id]) assumes. Introducing multi-attempt
-- resubmission is a product decision, not a hardening one — revisit separately
-- if needed.
-- ============================================================================

-- ---- 10.1 RLS perf helpers — evaluated once per query, not once per row ----
CREATE SCHEMA IF NOT EXISTS app;
GRANT USAGE ON SCHEMA app TO authenticated;

CREATE OR REPLACE FUNCTION app.current_school_id()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$ SELECT school_id FROM public.users WHERE id = auth.uid() $$;

-- NB: not named current_role() — that is a reserved SQL keyword.
CREATE OR REPLACE FUNCTION app.user_role()
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$ SELECT role FROM public.users WHERE id = auth.uid() $$;

REVOKE ALL ON FUNCTION app.current_school_id() FROM public;
REVOKE ALL ON FUNCTION app.user_role()        FROM public;
GRANT EXECUTE ON FUNCTION app.current_school_id() TO authenticated;
GRANT EXECUTE ON FUNCTION app.user_role()        TO authenticated;

-- ---- 10.2 Rewrite RLS to use the cached helpers ----------------------------
-- Defensive ENABLE — idempotent no-op if already on; closes any gap on tables
-- this migration didn't previously touch.
ALTER TABLE public.schools        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_chats  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_memory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.situations     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.materials      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.classes        ENABLE ROW LEVEL SECURITY;

-- schools : read only your own school
DROP POLICY IF EXISTS "Authenticated users can read schools" ON public.schools;
DROP POLICY IF EXISTS schools_read_own ON public.schools;
CREATE POLICY schools_read_own ON public.schools
  FOR SELECT TO authenticated
  USING (id = app.current_school_id());

-- users : self, plus staff may read their school's roster
DROP POLICY IF EXISTS "Users can read own profile"   ON public.users;
DROP POLICY IF EXISTS "Users can update own profile" ON public.users;
DROP POLICY IF EXISTS users_read_self         ON public.users;
DROP POLICY IF EXISTS users_read_staff_school ON public.users;
DROP POLICY IF EXISTS users_update_self       ON public.users;

CREATE POLICY users_read_self ON public.users
  FOR SELECT TO authenticated
  USING (id = (SELECT auth.uid()));

CREATE POLICY users_read_staff_school ON public.users
  FOR SELECT TO authenticated
  USING (app.user_role() IN ('teacher','admin','superadmin')
         AND school_id = app.current_school_id());

CREATE POLICY users_update_self ON public.users
  FOR UPDATE TO authenticated
  USING (id = (SELECT auth.uid()))
  WITH CHECK (id = (SELECT auth.uid()));

-- assignments : read school-wide; write = staff
DROP POLICY IF EXISTS "Users read school assignments" ON public.assignments;
DROP POLICY IF EXISTS "Teacher create assignments"    ON public.assignments;
DROP POLICY IF EXISTS "Teacher update assignments"    ON public.assignments;
DROP POLICY IF EXISTS assignments_read_school   ON public.assignments;
DROP POLICY IF EXISTS assignments_insert_staff  ON public.assignments;
DROP POLICY IF EXISTS assignments_update_staff  ON public.assignments;

CREATE POLICY assignments_read_school ON public.assignments
  FOR SELECT TO authenticated
  USING (school_id = app.current_school_id());

CREATE POLICY assignments_insert_staff ON public.assignments
  FOR INSERT TO authenticated
  WITH CHECK (school_id = app.current_school_id()
              AND teacher_id = (SELECT auth.uid())
              AND app.user_role() IN ('teacher','admin','superadmin'));

CREATE POLICY assignments_update_staff ON public.assignments
  FOR UPDATE TO authenticated
  USING (school_id = app.current_school_id()
         AND app.user_role() IN ('teacher','admin','superadmin'))
  WITH CHECK (school_id = app.current_school_id());

-- submissions : own row, or staff in same school; only staff can grade
DROP POLICY IF EXISTS "Student read own submissions"      ON public.submissions;
DROP POLICY IF EXISTS "Student insert own submission"     ON public.submissions;
DROP POLICY IF EXISTS "Student update own submission"     ON public.submissions;
DROP POLICY IF EXISTS "Teacher update submission grades"  ON public.submissions;
DROP POLICY IF EXISTS submissions_read_own_or_staff ON public.submissions;
DROP POLICY IF EXISTS submissions_insert_student    ON public.submissions;
DROP POLICY IF EXISTS submissions_update_staff      ON public.submissions;

CREATE POLICY submissions_read_own_or_staff ON public.submissions
  FOR SELECT TO authenticated
  USING (student_id = (SELECT auth.uid())
         OR (school_id = app.current_school_id()
             AND app.user_role() IN ('teacher','admin','superadmin')));

CREATE POLICY submissions_insert_student ON public.submissions
  FOR INSERT TO authenticated
  WITH CHECK (student_id = (SELECT auth.uid()));

-- Staff may correct/confirm a grade; the Homework Workspace's own typed-mode
-- auto-grade insert already sets the score at INSERT time as the student, so
-- this UPDATE policy is for teacher review/override only.
CREATE POLICY submissions_update_staff ON public.submissions
  FOR UPDATE TO authenticated
  USING (school_id = app.current_school_id()
         AND app.user_role() IN ('teacher','admin','superadmin'))
  WITH CHECK (school_id = app.current_school_id());

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'submissions_score_bounds') THEN
    ALTER TABLE public.submissions
      ADD CONSTRAINT submissions_score_bounds
      CHECK (score IS NULL OR (score >= 0 AND (max_score IS NULL OR score <= max_score)))
      NOT VALID;
  END IF;
END $$;

-- student_chats / student_memory : own only
DROP POLICY IF EXISTS "Students access own chats" ON public.student_chats;
DROP POLICY IF EXISTS student_chats_own ON public.student_chats;
CREATE POLICY student_chats_own ON public.student_chats
  FOR ALL TO authenticated
  USING (student_id = (SELECT auth.uid()))
  WITH CHECK (student_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Students access own memory" ON public.student_memory;
DROP POLICY IF EXISTS student_memory_own ON public.student_memory;
CREATE POLICY student_memory_own ON public.student_memory
  FOR ALL TO authenticated
  USING (student_id = (SELECT auth.uid()))
  WITH CHECK (student_id = (SELECT auth.uid()));

-- wellness_logs : own read/write; staff read restricted to admin/counselor
-- (DPDP: do NOT open school-wide to teachers)
DROP POLICY IF EXISTS "Students access own wellness" ON public.wellness_logs;
DROP POLICY IF EXISTS wellness_own         ON public.wellness_logs;
DROP POLICY IF EXISTS wellness_read_staff  ON public.wellness_logs;
CREATE POLICY wellness_own ON public.wellness_logs
  FOR ALL TO authenticated
  USING (student_id = (SELECT auth.uid()))
  WITH CHECK (student_id = (SELECT auth.uid()));
CREATE POLICY wellness_read_staff ON public.wellness_logs
  FOR SELECT TO authenticated
  USING (school_id = app.current_school_id()
         AND app.user_role() IN ('admin','superadmin'));

-- situations : read school-wide; write = staff
DROP POLICY IF EXISTS "School members read situations" ON public.situations;
DROP POLICY IF EXISTS situations_read_school  ON public.situations;
DROP POLICY IF EXISTS situations_insert_staff ON public.situations;
DROP POLICY IF EXISTS situations_update_staff ON public.situations;
CREATE POLICY situations_read_school ON public.situations
  FOR SELECT TO authenticated
  USING (school_id = app.current_school_id());
CREATE POLICY situations_insert_staff ON public.situations
  FOR INSERT TO authenticated
  WITH CHECK (school_id = app.current_school_id()
              AND app.user_role() IN ('teacher','admin','superadmin'));
CREATE POLICY situations_update_staff ON public.situations
  FOR UPDATE TO authenticated
  USING (school_id = app.current_school_id()
         AND app.user_role() IN ('teacher','admin','superadmin'))
  WITH CHECK (school_id = app.current_school_id());

-- notifications : own; admins may read school-wide
DROP POLICY IF EXISTS "User read own notifications" ON public.notifications;
DROP POLICY IF EXISTS notifications_read_own_or_admin ON public.notifications;
CREATE POLICY notifications_read_own_or_admin ON public.notifications
  FOR SELECT TO authenticated
  USING (student_id = (SELECT auth.uid())
         OR (school_id = app.current_school_id()
             AND app.user_role() IN ('admin','superadmin')));

-- materials : read school-wide; write = staff
DROP POLICY IF EXISTS "School members read materials" ON public.materials;
DROP POLICY IF EXISTS materials_read_school  ON public.materials;
DROP POLICY IF EXISTS materials_insert_staff ON public.materials;
CREATE POLICY materials_read_school ON public.materials
  FOR SELECT TO authenticated
  USING (school_id = app.current_school_id());
CREATE POLICY materials_insert_staff ON public.materials
  FOR INSERT TO authenticated
  WITH CHECK (school_id = app.current_school_id()
              AND app.user_role() IN ('teacher','admin','superadmin'));

-- classes : read school-wide
DROP POLICY IF EXISTS "School members read classes" ON public.classes;
DROP POLICY IF EXISTS classes_read_school ON public.classes;
CREATE POLICY classes_read_school ON public.classes
  FOR SELECT TO authenticated
  USING (school_id = app.current_school_id());

-- ---- 10.3 Missing indexes (hot paths) --------------------------------------
CREATE INDEX IF NOT EXISTS idx_notifications_student_unread
  ON public.notifications (student_id) WHERE read = false;
CREATE INDEX IF NOT EXISTS idx_notifications_school
  ON public.notifications (school_id);
CREATE INDEX IF NOT EXISTS idx_wellness_school_created
  ON public.wellness_logs (school_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_situations_unack
  ON public.situations (school_id) WHERE acknowledged = false;
CREATE INDEX IF NOT EXISTS idx_situations_student
  ON public.situations (student_id);
CREATE INDEX IF NOT EXISTS idx_syllabus_school
  ON public.syllabus (school_id);
CREATE INDEX IF NOT EXISTS idx_materials_school_class_subject
  ON public.materials (school_id, class, subject);
CREATE INDEX IF NOT EXISTS idx_classes_school
  ON public.classes (school_id);
CREATE INDEX IF NOT EXISTS idx_assignments_school_class
  ON public.assignments (school_id, class);
CREATE INDEX IF NOT EXISTS idx_assignments_assigned_students
  ON public.assignments USING gin (assigned_student_ids);

-- ---- 10.4 Parent <-> student linkage (parent role was unusable) -----------
CREATE TABLE IF NOT EXISTS public.guardians (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id     UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  student_id    UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  relationship  TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (parent_id, student_id)
);
CREATE INDEX IF NOT EXISTS idx_guardians_student ON public.guardians (student_id);
CREATE INDEX IF NOT EXISTS idx_guardians_parent  ON public.guardians (parent_id);

ALTER TABLE public.guardians ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS guardians_read_involved ON public.guardians;
CREATE POLICY guardians_read_involved ON public.guardians
  FOR SELECT TO authenticated
  USING (parent_id = (SELECT auth.uid())
         OR student_id = (SELECT auth.uid())
         OR (app.user_role() IN ('admin','superadmin')
             AND EXISTS (SELECT 1 FROM public.users u
                         WHERE u.id = guardians.student_id
                           AND u.school_id = app.current_school_id())));

-- ---- 10.5 DPDP consent record + wellness constraint ------------------------
-- Data-model side of the open DPDP compliance flag (energy/wellness check-ins
-- for minors need recorded parental consent before public-facing copy ships).
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'wellness_energy_range') THEN
    ALTER TABLE public.wellness_logs
      ADD CONSTRAINT wellness_energy_range
      CHECK (energy IS NULL OR energy BETWEEN 1 AND 5) NOT VALID;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.consents (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id     UUID NOT NULL REFERENCES public.users(id)   ON DELETE CASCADE,
  school_id      UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  consent_type   TEXT NOT NULL,          -- 'wellness_checkin' | 'ai_tutor' | 'data_processing' ...
  granted        BOOLEAN NOT NULL DEFAULT false,
  granted_by     UUID REFERENCES public.users(id) ON DELETE SET NULL,  -- parent/guardian (DPDP)
  policy_version TEXT,
  granted_at     TIMESTAMPTZ,
  revoked_at     TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (student_id, consent_type)
);
CREATE INDEX IF NOT EXISTS idx_consents_student ON public.consents (student_id);

ALTER TABLE public.consents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS consents_read_involved ON public.consents;
CREATE POLICY consents_read_involved ON public.consents
  FOR SELECT TO authenticated
  USING (student_id = (SELECT auth.uid())
         OR granted_by = (SELECT auth.uid())
         OR (app.user_role() IN ('admin','superadmin')
             AND school_id = app.current_school_id()));

-- ---- 10.6 Hygiene — updated_at + touch trigger -----------------------------
CREATE OR REPLACE FUNCTION app.touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

ALTER TABLE public.schools     ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE public.users       ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE public.assignments ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE public.submissions ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

DROP TRIGGER IF EXISTS trg_touch_schools     ON public.schools;
DROP TRIGGER IF EXISTS trg_touch_users       ON public.users;
DROP TRIGGER IF EXISTS trg_touch_assignments ON public.assignments;
DROP TRIGGER IF EXISTS trg_touch_submissions ON public.submissions;
CREATE TRIGGER trg_touch_schools     BEFORE UPDATE ON public.schools     FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
CREATE TRIGGER trg_touch_users       BEFORE UPDATE ON public.users       FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
CREATE TRIGGER trg_touch_assignments BEFORE UPDATE ON public.assignments FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
CREATE TRIGGER trg_touch_submissions BEFORE UPDATE ON public.submissions FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

-- P3  classes uniqueness (de-dupe (school_id, name) first if this fails)
CREATE UNIQUE INDEX IF NOT EXISTS uq_classes_school_name
  ON public.classes (school_id, name);

-- ============================================================================
-- Manual follow-ups (not auto-applied — need a data/decision call first):
--   1. VALIDATE CONSTRAINT wellness_energy_range once historical rows are clean:
--        ALTER TABLE public.wellness_logs VALIDATE CONSTRAINT wellness_energy_range;
--   2. Superadmin single source of truth: drop either the `superadmins` table
--      or the 'superadmin' role value — currently redundant (unchanged from
--      the original 2026-07-23 review — still your call).
--   3. Add tml_scores / guardians / consents to realtime if the UI needs live
--      updates: ALTER PUBLICATION supabase_realtime ADD TABLE public.guardians;
--   4. This migration REWRITES RLS policies on schools/users/assignments/
--      submissions/student_chats/student_memory/wellness_logs/situations/
--      notifications/materials/classes. Review before running against
--      production — it replaces existing policies (by name) rather than only
--      adding new ones.
-- ============================================================================
