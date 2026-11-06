-- Socratic tutor engine (decisions of 2026-11-06). A session now lives on the server from its first question:
-- one tutor_sessions row per session (open until finished, so it can be resumed), its transcript in
-- tutor_session_messages, and the misconceptions it found in tutor_session_misconceptions, tagged against a
-- per-school misconception bank (tutor_misconceptions) that the AI seeds per chapter and teachers curate.
--
-- A session is staged: diagnose -> scaffold (skipped when the diagnosis is strong) -> transfer (unaided) ->
-- teach-back. Its depth score D = 30% independence + 30% reasoning + 30% transfer + 10% teach-back, kept in
-- depth_score with the parts in rubric. Rows from before this change keep depth_score NULL and are scored from
-- hint_depth / answer_revealed as before.
--
-- Transcripts are kept for the academic session, then deleted (scores, rubric, summary and misconception tags stay).
-- Screens read through the server, so signed-in users get no direct access to the new tables.

-- ── Sessions: open on the server from the first question ───────────────────
ALTER TABLE public.tutor_sessions
  ADD COLUMN status text NOT NULL DEFAULT 'done' CHECK (status IN ('open', 'done')),
  ADD COLUMN stage text CHECK (stage IS NULL OR stage IN ('diagnose', 'scaffold', 'transfer', 'teachback', 'done')),
  ADD COLUMN mode text NOT NULL DEFAULT 'standard' CHECK (mode IN ('standard', 'hots')),
  ADD COLUMN level text CHECK (level IS NULL OR length(level) <= 10),
  ADD COLUMN state jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN seq integer NOT NULL DEFAULT 0,
  ADD COLUMN depth_score numeric(5,2) CHECK (depth_score IS NULL OR depth_score BETWEEN 0 AND 100),
  ADD COLUMN rubric jsonb,
  ADD COLUMN summary jsonb,
  ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN completed_at timestamptz,
  ADD COLUMN transcript_purged_at timestamptz,
  ADD CONSTRAINT tutor_sessions_done_chk CHECK (status <> 'done' OR stage IS NULL OR stage = 'done');

-- Only finished sessions are evidence; open ones are listed for resuming.
CREATE INDEX tutor_sessions_open ON public.tutor_sessions (student_id, updated_at DESC) WHERE status = 'open';
CREATE INDEX tutor_sessions_chapter ON public.tutor_sessions (school_id, subject_key, chapter_key) WHERE status = 'done';
CREATE TRIGGER trg_touch_tutor_sessions BEFORE UPDATE ON public.tutor_sessions FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

-- The policy already shows a student their own rows and learning staff their school's. Writes go through the server.
REVOKE INSERT, UPDATE, DELETE ON public.tutor_sessions FROM authenticated;

-- ── Transcript ──────────────────────────────────────────────────────────────
CREATE TABLE public.tutor_session_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.tutor_sessions(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  school_id uuid REFERENCES public.schools(id) ON DELETE CASCADE,
  -- Order within the session: the session's seq when the turn was written, then position in the turn.
  turn integer NOT NULL CHECK (turn >= 0),
  pos smallint NOT NULL DEFAULT 0 CHECK (pos BETWEEN 0 AND 9),
  role text NOT NULL CHECK (role IN ('tutor', 'student')),
  stage text NOT NULL CHECK (stage IN ('diagnose', 'scaffold', 'transfer', 'teachback', 'done')),
  kind text NOT NULL CHECK (kind IN ('question', 'hint', 'feedback', 'walkthrough', 'answer', 'photo', 'stuck', 'summary')),
  text text NOT NULL CHECK (length(text) <= 4000),
  -- The judge's verdict on a student answer: correct, reasoning 0-3, misconception ids. Never shown to parents.
  judgment jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, turn, pos)
);
CREATE INDEX tutor_session_messages_student ON public.tutor_session_messages (student_id, created_at);

ALTER TABLE public.tutor_session_messages ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.tutor_session_messages FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.tutor_session_messages TO service_role;

-- ── Misconception bank: per school, per chapter ─────────────────────────────
CREATE TABLE public.tutor_misconceptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  level text NOT NULL CHECK (length(level) BETWEEN 1 AND 10),
  subject_key text NOT NULL CHECK (length(subject_key) BETWEEN 1 AND 80),
  chapter_key text NOT NULL CHECK (length(chapter_key) BETWEEN 1 AND 200),
  label text NOT NULL CHECK (length(trim(label)) BETWEEN 3 AND 120),
  description text NOT NULL DEFAULT '' CHECK (length(description) <= 400),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'retired')),
  source text NOT NULL CHECK (source IN ('ai', 'teacher')),
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX tutor_misconceptions_label ON public.tutor_misconceptions (school_id, level, subject_key, chapter_key, lower(label));
CREATE INDEX tutor_misconceptions_chapter ON public.tutor_misconceptions (school_id, level, subject_key, chapter_key) WHERE status = 'active';
CREATE TRIGGER trg_touch_tutor_misconceptions BEFORE UPDATE ON public.tutor_misconceptions FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
CREATE TRIGGER trg_audit_tutor_misconceptions AFTER INSERT OR DELETE OR UPDATE ON public.tutor_misconceptions FOR EACH ROW EXECUTE FUNCTION app.audit();

ALTER TABLE public.tutor_misconceptions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.tutor_misconceptions FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.tutor_misconceptions TO service_role;

-- A chapter is seeded once per school; this row claims the seeding so two first sessions don't both pay for it.
CREATE TABLE public.tutor_misconception_seeds (
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  level text NOT NULL,
  subject_key text NOT NULL,
  chapter_key text NOT NULL,
  status text NOT NULL DEFAULT 'seeding' CHECK (status IN ('seeding', 'ready', 'failed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (school_id, level, subject_key, chapter_key)
);
CREATE TRIGGER trg_touch_tutor_misconception_seeds BEFORE UPDATE ON public.tutor_misconception_seeds FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
ALTER TABLE public.tutor_misconception_seeds ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.tutor_misconception_seeds FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.tutor_misconception_seeds TO service_role;

-- ── Misconceptions a session found (kept after the transcript goes) ─────────
CREATE TABLE public.tutor_session_misconceptions (
  session_id uuid NOT NULL REFERENCES public.tutor_sessions(id) ON DELETE CASCADE,
  misconception_id uuid NOT NULL REFERENCES public.tutor_misconceptions(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  school_id uuid REFERENCES public.schools(id) ON DELETE CASCADE,
  subject_key text,
  chapter_key text,
  stage text NOT NULL CHECK (stage IN ('diagnose', 'scaffold', 'transfer', 'teachback')),
  seen integer NOT NULL DEFAULT 1 CHECK (seen >= 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (session_id, misconception_id)
);
CREATE INDEX tutor_session_misconceptions_student ON public.tutor_session_misconceptions (student_id, created_at DESC);
CREATE INDEX tutor_session_misconceptions_chapter ON public.tutor_session_misconceptions (school_id, subject_key, chapter_key);
ALTER TABLE public.tutor_session_misconceptions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.tutor_session_misconceptions FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.tutor_session_misconceptions TO service_role;

-- ── Academic session start, per school ──────────────────────────────────────
-- First day of the school's current academic session (settings.session.startMonth, April by default).
CREATE OR REPLACE FUNCTION app.academic_session_start(p_school uuid) RETURNS date
  LANGUAGE sql STABLE SET search_path = public, pg_temp
  AS $$
  WITH m AS (
    SELECT coalesce(CASE WHEN (sc.settings -> 'session' ->> 'startMonth') ~ '^([1-9]|1[0-2])$'
                         THEN (sc.settings -> 'session' ->> 'startMonth')::int END, 4) AS start_month
    FROM public.schools sc WHERE sc.id = p_school
  )
  SELECT make_date(extract(year FROM app.school_today())::int
                     - CASE WHEN extract(month FROM app.school_today())::int >= coalesce(m.start_month, 4) THEN 0 ELSE 1 END,
                   coalesce(m.start_month, 4), 1)
  FROM (SELECT 1) one LEFT JOIN m ON true
$$;
REVOKE ALL ON FUNCTION app.academic_session_start(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.academic_session_start(uuid) TO service_role;

-- ── Retention: transcripts for the academic session ─────────────────────────
-- A session's transcript goes once the academic session it was held in has ended. Its score, rubric, summary
-- and misconception tags stay. Open sessions from an ended academic session are closed without a score.
CREATE OR REPLACE FUNCTION public.tutor_transcript_purge() RETURNS int
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
  AS $$
DECLARE v_n int := 0;
BEGIN
  WITH old AS (
    SELECT t.id FROM public.tutor_sessions t
    WHERE t.transcript_purged_at IS NULL AND t.school_id IS NOT NULL
      AND t.created_at < app.academic_session_start(t.school_id)::timestamp AT TIME ZONE 'Asia/Kolkata'
  ), gone AS (
    DELETE FROM public.tutor_session_messages m USING old WHERE m.session_id = old.id RETURNING m.session_id
  )
  UPDATE public.tutor_sessions t
     SET transcript_purged_at = now(), state = '{}'::jsonb, status = 'done',
         stage = CASE WHEN t.status = 'open' THEN NULL ELSE t.stage END
    FROM old WHERE t.id = old.id;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END $$;
REVOKE ALL ON FUNCTION public.tutor_transcript_purge() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tutor_transcript_purge() TO service_role;
SELECT cron.schedule('tutor-transcript-retention', '15 21 * * *', $$ SELECT public.tutor_transcript_purge() $$);

-- ── AI cost cap: attribute every AI call to a student where one is known ────
-- Moses, 2026-11-06: AI cost per student per year must never pass 50% of the price charged per student.
-- Counted: everything attributable to the student (their own calls, AI grading of their work, their parents'
-- Ask) plus an equal share of the school's other AI (teachers, office). A call a student makes is attributed to
-- them automatically; a staff call about a student passes the student explicitly.
ALTER TABLE public.ai_usage ADD COLUMN student_id uuid REFERENCES public.users(id) ON DELETE SET NULL;
CREATE INDEX ai_usage_student_at ON public.ai_usage (student_id, at) WHERE student_id IS NOT NULL;
CREATE INDEX ai_usage_school_shared_at ON public.ai_usage (school_id, at) WHERE student_id IS NULL;

CREATE OR REPLACE FUNCTION app.ai_usage_attribute() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
  AS $$
BEGIN
  IF NEW.student_id IS NULL AND NEW.user_id IS NOT NULL THEN
    SELECT u.id INTO NEW.student_id FROM public.users u WHERE u.id = NEW.user_id AND u.role = 'student';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION app.ai_usage_attribute() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER trg_ai_usage_attribute BEFORE INSERT ON public.ai_usage FOR EACH ROW EXECUTE FUNCTION app.ai_usage_attribute();

-- Backfill: past calls students made themselves.
UPDATE public.ai_usage a SET student_id = a.user_id
  FROM public.users u WHERE u.id = a.user_id AND u.role = 'student' AND a.student_id IS NULL;

-- One student's AI spend this academic session (USD): their own plus their share of the school's shared AI.
CREATE OR REPLACE FUNCTION public.student_ai_spend(p_student uuid) RETURNS jsonb
  LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
  AS $$
DECLARE v_school uuid; v_since timestamptz; v_own numeric; v_shared numeric; v_students int;
BEGIN
  SELECT school_id INTO v_school FROM public.users WHERE id = p_student AND role = 'student';
  IF v_school IS NULL THEN RETURN NULL; END IF;
  v_since := app.academic_session_start(v_school)::timestamp AT TIME ZONE 'Asia/Kolkata';
  SELECT coalesce(sum(cost_usd), 0) INTO v_own FROM public.ai_usage WHERE student_id = p_student AND at >= v_since;
  SELECT coalesce(sum(cost_usd), 0) INTO v_shared FROM public.ai_usage WHERE school_id = v_school AND student_id IS NULL AND at >= v_since;
  SELECT count(*) INTO v_students FROM public.users WHERE school_id = v_school AND role = 'student';
  RETURN jsonb_build_object(
    'schoolId', v_school, 'since', v_since,
    'ownUsd', v_own, 'sharedUsd', CASE WHEN v_students > 0 THEN v_shared / v_students ELSE 0 END,
    'students', v_students);
END $$;
REVOKE ALL ON FUNCTION public.student_ai_spend(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.student_ai_spend(uuid) TO service_role;
