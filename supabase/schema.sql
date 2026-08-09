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
