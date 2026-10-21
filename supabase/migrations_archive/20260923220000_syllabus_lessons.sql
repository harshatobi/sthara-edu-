-- Syllabus coverage, pacing and lesson planning — 2026-09-23
--
-- course_plans       one per school + class + subject + session: the term window
--                    and timetable load the pacing plan is built from.
-- syllabus_progress  one row per chapter (topic = '') holding its planned window,
--                    and one per curriculum topic holding its coverage status.
--                    Shared by every teacher of that class + subject.
-- lesson_plans       a teacher's plan for one lesson; marking it taught marks its
--                    topics taught.
--
-- Reads: staff of the school (RLS). Writes: only through the teacher API routes
-- (service role), which enforce that the teacher teaches that class + subject.

CREATE TABLE IF NOT EXISTS public.course_plans (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id        uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  class            text NOT NULL,
  subject          text NOT NULL,
  session          text NOT NULL DEFAULT '2026-27',
  term_start       date NOT NULL,
  term_end         date NOT NULL,
  periods_per_week int  NOT NULL DEFAULT 6 CHECK (periods_per_week BETWEEN 1 AND 20),
  period_minutes   int  NOT NULL DEFAULT 40 CHECK (period_minutes BETWEEN 20 AND 120),
  updated_by       uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CHECK (term_end > term_start),
  UNIQUE (school_id, class, subject, session)
);

CREATE TABLE IF NOT EXISTS public.syllabus_progress (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id      uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  class          text NOT NULL,
  subject        text NOT NULL,
  session        text NOT NULL DEFAULT '2026-27',
  chapter_key    text NOT NULL,
  topic          text NOT NULL DEFAULT '',
  status         text NOT NULL DEFAULT 'not_started' CHECK (status IN ('not_started', 'in_progress', 'taught', 'revisit')),
  taught_on      date,
  planned_start  date,
  planned_end    date,
  note           text CHECK (note IS NULL OR char_length(note) <= 2000),
  updated_by     uuid REFERENCES public.users(id) ON DELETE SET NULL,
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CHECK (planned_end IS NULL OR planned_start IS NULL OR planned_end >= planned_start),
  UNIQUE (school_id, class, subject, session, chapter_key, topic)
);
CREATE INDEX IF NOT EXISTS idx_syllabus_progress_course ON public.syllabus_progress (school_id, class, subject, session);

CREATE TABLE IF NOT EXISTS public.lesson_plans (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id        uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  teacher_id       uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  class            text NOT NULL,
  subject          text NOT NULL,
  session          text NOT NULL DEFAULT '2026-27',
  chapter_key      text NOT NULL,
  chapter_name     text NOT NULL,
  topics           text[] NOT NULL DEFAULT '{}',
  title            text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
  lesson_date      date,
  period           int CHECK (period IS NULL OR period BETWEEN 1 AND 12),
  duration_min     int NOT NULL DEFAULT 40 CHECK (duration_min BETWEEN 10 AND 240),
  objectives       text[] NOT NULL DEFAULT '{}',
  success_criteria text[] NOT NULL DEFAULT '{}',
  prior_knowledge  text,
  materials        jsonb NOT NULL DEFAULT '[]'::jsonb,   -- [{label, url?}]
  stages           jsonb NOT NULL DEFAULT '[]'::jsonb,   -- [{name, minutes, teacher, students}]
  differentiation  jsonb NOT NULL DEFAULT '{}'::jsonb,   -- {support, stretch}
  check_for_understanding text,
  homework_assignment_id uuid REFERENCES public.assignments(id) ON DELETE SET NULL,
  status           text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'ready', 'taught')),
  reflection       text,
  taught_on        date,
  ai_drafted       boolean NOT NULL DEFAULT false,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_lesson_plans_course ON public.lesson_plans (school_id, class, subject, lesson_date);
CREATE INDEX IF NOT EXISTS idx_lesson_plans_teacher ON public.lesson_plans (teacher_id, lesson_date);

ALTER TABLE public.course_plans      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.syllabus_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lesson_plans      ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.course_plans, public.syllabus_progress, public.lesson_plans FROM anon;
GRANT SELECT ON public.course_plans, public.syllabus_progress, public.lesson_plans TO authenticated;
GRANT ALL ON public.course_plans, public.syllabus_progress, public.lesson_plans TO service_role;

DROP POLICY IF EXISTS course_plans_staff_read ON public.course_plans;
CREATE POLICY course_plans_staff_read ON public.course_plans FOR SELECT TO authenticated
  USING (((SELECT app.is_staff()) AND school_id = (SELECT app.current_school_id())) OR (SELECT app.is_superadmin()));
DROP POLICY IF EXISTS syllabus_progress_staff_read ON public.syllabus_progress;
CREATE POLICY syllabus_progress_staff_read ON public.syllabus_progress FOR SELECT TO authenticated
  USING (((SELECT app.is_staff()) AND school_id = (SELECT app.current_school_id())) OR (SELECT app.is_superadmin()));
DROP POLICY IF EXISTS lesson_plans_staff_read ON public.lesson_plans;
CREATE POLICY lesson_plans_staff_read ON public.lesson_plans FOR SELECT TO authenticated
  USING (((SELECT app.is_staff()) AND school_id = (SELECT app.current_school_id())) OR (SELECT app.is_superadmin()));

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['course_plans', 'syllabus_progress', 'lesson_plans'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_touch_%1$s ON public.%1$I', t);
    EXECUTE format('CREATE TRIGGER trg_touch_%1$s BEFORE UPDATE ON public.%1$I FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at()', t);
  END LOOP;
END $$;
