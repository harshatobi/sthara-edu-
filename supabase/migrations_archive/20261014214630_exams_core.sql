-- Exams and report cards, phase 1 (the core loop) — 2026-10-14
--
-- exam_schemes          a school's assessment structure for a session and a set of classes (grades). Starts from a
--                       Sthara CBSE preset and is edited by the exam cell. grading: the grade bands. rules: pass mark,
--                       best-of-N, mandatory subjects, compartment limit, co-scholastic areas, what the card shows.
-- exam_terms            a reporting period with its own report card. components: how the term's result is built from
--                       assessments (a weight, the assessment codes, and sum / average / best-N). weight: its share of
--                       the final result (0 = a progress report only). subject_weights: per-subject component weights
--                       (theory 70 / practical 30 for science, 80 / 20 for languages).
-- exam_assessments      one thing marks are entered for: a periodic test, the half-yearly, a portfolio, a practical.
--                       Code unique in the scheme; subjects: per-subject max marks or "not assessed".
-- exam_sheets           one assessment for one class-subject: the marks sheet. open (the subject teacher enters),
--                       submitted (waiting for the class teacher), locked (its class-term is published).
-- exam_marks            a student's marks on a sheet, or a code: AB absent (counts zero), ML medical, EX exempt
--                       (both left out and the rest rescaled). questions: per-question marks from a scanned script.
-- exam_student_terms    per student per term: the class teacher's remark and the co-scholastic grades.
-- exam_class_terms      one class's term: open -> reviewed (class teacher) -> published (principal). A published term
--                       can be reopened with a reason; publishing again issues revised report cards.
-- report_cards          what was published: a frozen snapshot per student per term per version. Never changes after
--                       publishing, apart from the fee hold and being superseded by a revision.
-- report_card_settings  per school: branding, signatures, and whether to hold report cards while fees are overdue.
--
-- Permissions: exams.manage (academic coordinator; also principal, school admin) builds schemes, opens sheets and
-- watches progress; exams.publish (principal, school admin) locks, publishes and reopens; exams.read sees results
-- (and the vice principal). Subject teachers enter marks for the class-subjects they teach (teacher_subjects); the
-- class teacher (users.teacher_class) reviews their class.
--
-- Access: no browser role reads or writes these tables. Everything goes through /api/admin/exams,
-- /api/teacher/exams and /api/me/report-cards (service role), which check the caller.

INSERT INTO public.role_permissions (role_key, perm)
SELECT r, p FROM (VALUES
  ('school_admin',         ARRAY['exams.read','exams.manage','exams.publish']),
  ('principal',            ARRAY['exams.read','exams.manage','exams.publish']),
  ('vice_principal',       ARRAY['exams.read']),
  ('academic_coordinator', ARRAY['exams.read','exams.manage'])
) AS t(r, ps), unnest(ps) AS p
ON CONFLICT DO NOTHING;

-- ── Structure ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.exam_schemes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id   uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  session     text NOT NULL CHECK (session ~ '^\d{4}-\d{2}$'),
  name        text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 80),
  grades      smallint[] NOT NULL CHECK (cardinality(grades) BETWEEN 1 AND 12 AND grades <@ ARRAY[1,2,3,4,5,6,7,8,9,10,11,12]::smallint[]),
  preset      text CHECK (preset IN ('foundational', 'primary', 'middle', 'secondary', 'senior')),
  grading     jsonb NOT NULL CHECK (jsonb_typeof(grading) = 'array'),
  rules       jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(rules) = 'object'),
  status      text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  created_by  uuid REFERENCES public.users(id) ON DELETE SET NULL,
  updated_by  uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_exam_schemes_school ON public.exam_schemes (school_id, session);

-- A class can follow only one active scheme a session.
CREATE OR REPLACE FUNCTION app.guard_exam_scheme_grades() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.status = 'active' AND EXISTS (
    SELECT 1 FROM public.exam_schemes s
    WHERE s.school_id = NEW.school_id AND s.session = NEW.session AND s.status = 'active' AND s.id <> NEW.id AND s.grades && NEW.grades
  ) THEN
    RAISE EXCEPTION 'another active scheme already covers one of these classes' USING ERRCODE = '23505';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_guard_exam_scheme_grades ON public.exam_schemes;
CREATE TRIGGER trg_guard_exam_scheme_grades BEFORE INSERT OR UPDATE ON public.exam_schemes
  FOR EACH ROW EXECUTE FUNCTION app.guard_exam_scheme_grades();

CREATE TABLE IF NOT EXISTS public.exam_terms (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id       uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  scheme_id       uuid NOT NULL REFERENCES public.exam_schemes(id) ON DELETE CASCADE,
  name            text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 60),
  seq             smallint NOT NULL CHECK (seq BETWEEN 1 AND 12),
  starts_on       date NOT NULL,
  ends_on         date NOT NULL,
  weight          numeric(5,2) NOT NULL DEFAULT 0 CHECK (weight BETWEEN 0 AND 100),
  components      jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(components) = 'array'),
  subject_weights jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(subject_weights) = 'object'),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_on >= starts_on),
  UNIQUE (scheme_id, seq)
);

CREATE TABLE IF NOT EXISTS public.exam_assessments (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id   uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  scheme_id   uuid NOT NULL REFERENCES public.exam_schemes(id) ON DELETE CASCADE,
  term_id     uuid NOT NULL REFERENCES public.exam_terms(id) ON DELETE CASCADE,
  code        text NOT NULL CHECK (code ~ '^[A-Z][A-Z0-9]{0,11}$'),
  name        text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 80),
  kind        text NOT NULL DEFAULT 'written' CHECK (kind IN ('written', 'internal', 'practical', 'project', 'oral')),
  max_marks   numeric(6,2) NOT NULL CHECK (max_marks > 0 AND max_marks <= 1000),
  seq         smallint NOT NULL DEFAULT 1,
  subjects    jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(subjects) = 'object'),
  held_from   date,
  held_to     date,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (scheme_id, code)
);
CREATE INDEX IF NOT EXISTS idx_exam_assessments_term ON public.exam_assessments (term_id);

-- ── Marks ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.exam_sheets (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id         uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  assessment_id     uuid NOT NULL REFERENCES public.exam_assessments(id) ON DELETE CASCADE,
  class_subject_id  uuid NOT NULL REFERENCES public.class_subjects(id) ON DELETE CASCADE,
  class_id          uuid NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  status            text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'submitted', 'locked')),
  max_marks         numeric(6,2) NOT NULL CHECK (max_marks > 0),
  submitted_by      uuid REFERENCES public.users(id) ON DELETE SET NULL,
  submitted_at      timestamptz,
  returned_note     text CHECK (length(returned_note) <= 1000),
  returned_by       uuid REFERENCES public.users(id) ON DELETE SET NULL,
  returned_at       timestamptz,
  reopened_reason   text CHECK (length(reopened_reason) <= 1000),
  reopened_by       uuid REFERENCES public.users(id) ON DELETE SET NULL,
  reopened_at       timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (assessment_id, class_subject_id)
);
CREATE INDEX IF NOT EXISTS idx_exam_sheets_class ON public.exam_sheets (class_id);
CREATE INDEX IF NOT EXISTS idx_exam_sheets_school ON public.exam_sheets (school_id, status);

CREATE TABLE IF NOT EXISTS public.exam_marks (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id   uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  sheet_id    uuid NOT NULL REFERENCES public.exam_sheets(id) ON DELETE CASCADE,
  student_id  uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  marks       numeric(6,2) CHECK (marks >= 0),
  code        text CHECK (code IN ('AB', 'ML', 'EX')),
  questions   jsonb CHECK (questions IS NULL OR jsonb_typeof(questions) = 'array'),
  source      text NOT NULL DEFAULT 'grid' CHECK (source IN ('grid', 'import', 'online', 'script')),
  source_ref  uuid,
  updated_by  uuid REFERENCES public.users(id) ON DELETE SET NULL,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CHECK (NOT (marks IS NOT NULL AND code IS NOT NULL)),
  UNIQUE (sheet_id, student_id)
);
CREATE INDEX IF NOT EXISTS idx_exam_marks_student ON public.exam_marks (student_id);

-- Marks change only while their sheet is open; a mark above the sheet's maximum is refused.
CREATE OR REPLACE FUNCTION app.guard_exam_marks() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE s record;
BEGIN
  -- Removing a whole school or sheet takes its marks with it.
  IF TG_OP = 'DELETE' AND NOT EXISTS (SELECT 1 FROM public.exam_sheets WHERE id = OLD.sheet_id) THEN RETURN OLD; END IF;
  SELECT status, max_marks INTO s FROM public.exam_sheets WHERE id = coalesce(NEW.sheet_id, OLD.sheet_id);
  IF s.status <> 'open' THEN
    RAISE EXCEPTION 'marks sheet is not open' USING ERRCODE = '42501';
  END IF;
  IF TG_OP <> 'DELETE' AND NEW.marks IS NOT NULL AND NEW.marks > s.max_marks THEN
    RAISE EXCEPTION 'marks above the maximum' USING ERRCODE = '23514';
  END IF;
  RETURN coalesce(NEW, OLD);
END $$;
DROP TRIGGER IF EXISTS trg_guard_exam_marks ON public.exam_marks;
CREATE TRIGGER trg_guard_exam_marks BEFORE INSERT OR UPDATE OR DELETE ON public.exam_marks
  FOR EACH ROW EXECUTE FUNCTION app.guard_exam_marks();

-- Once a sheet has been submitted, every change to its marks is kept: who, when, before and after.
CREATE OR REPLACE FUNCTION app.audit_exam_marks() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_was_submitted boolean;
BEGIN
  SELECT submitted_at IS NOT NULL INTO v_was_submitted FROM public.exam_sheets WHERE id = coalesce(NEW.sheet_id, OLD.sheet_id);
  IF NOT coalesce(v_was_submitted, false) THEN RETURN NULL; END IF;
  IF TG_OP = 'UPDATE' AND NEW.marks IS NOT DISTINCT FROM OLD.marks AND NEW.code IS NOT DISTINCT FROM OLD.code THEN RETURN NULL; END IF;
  INSERT INTO public.audit_log (actor_id, actor_role, action, table_name, row_id, school_id, old_values, new_values)
  VALUES (coalesce(auth.uid(), (coalesce(NEW, OLD)).updated_by), CASE WHEN auth.uid() IS NULL THEN 'server' ELSE coalesce(app.user_role(), 'unknown') END,
          TG_OP, 'exam_marks', (coalesce(NEW, OLD)).id::text, (coalesce(NEW, OLD)).school_id,
          CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE jsonb_build_object('sheet_id', OLD.sheet_id, 'student_id', OLD.student_id, 'marks', OLD.marks, 'code', OLD.code) END,
          CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE jsonb_build_object('sheet_id', NEW.sheet_id, 'student_id', NEW.student_id, 'marks', NEW.marks, 'code', NEW.code, 'source', NEW.source) END);
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS trg_audit_exam_marks ON public.exam_marks;
CREATE TRIGGER trg_audit_exam_marks AFTER INSERT OR UPDATE OR DELETE ON public.exam_marks
  FOR EACH ROW EXECUTE FUNCTION app.audit_exam_marks();

-- ── Review and publishing ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.exam_class_terms (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id       uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  term_id         uuid NOT NULL REFERENCES public.exam_terms(id) ON DELETE CASCADE,
  class_id        uuid NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  status          text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'reviewed', 'published')),
  version         integer NOT NULL DEFAULT 0 CHECK (version >= 0),
  reviewed_by     uuid REFERENCES public.users(id) ON DELETE SET NULL,
  reviewed_at     timestamptz,
  published_by    uuid REFERENCES public.users(id) ON DELETE SET NULL,
  published_at    timestamptz,
  reopen_reason   text CHECK (length(reopen_reason) <= 1000),
  reopened_by     uuid REFERENCES public.users(id) ON DELETE SET NULL,
  reopened_at     timestamptz,
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (term_id, class_id)
);

CREATE TABLE IF NOT EXISTS public.exam_student_terms (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id     uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  term_id       uuid NOT NULL REFERENCES public.exam_terms(id) ON DELETE CASCADE,
  student_id    uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  remark        text CHECK (length(remark) <= 600),
  coscholastic  jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(coscholastic) = 'object'),
  updated_by    uuid REFERENCES public.users(id) ON DELETE SET NULL,
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (term_id, student_id)
);

-- Remarks and co-scholastic grades freeze with the class's term.
CREATE OR REPLACE FUNCTION app.guard_exam_student_terms() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE v_student uuid := coalesce(NEW.student_id, OLD.student_id); v_term uuid := coalesce(NEW.term_id, OLD.term_id);
BEGIN
  IF TG_OP = 'DELETE' AND NOT EXISTS (SELECT 1 FROM public.exam_terms WHERE id = v_term) THEN RETURN OLD; END IF;
  IF EXISTS (
    SELECT 1 FROM public.exam_class_terms ct JOIN public.classes c ON c.id = ct.class_id JOIN public.users u ON u.id = v_student
    WHERE ct.term_id = v_term AND ct.status = 'published'
      AND regexp_replace(lower(c.name), 'class|[^a-z0-9]', '', 'g') = regexp_replace(lower(coalesce(u.student_class, '')), 'class|[^a-z0-9]', '', 'g')
  ) THEN
    RAISE EXCEPTION 'class term is published' USING ERRCODE = '42501';
  END IF;
  RETURN coalesce(NEW, OLD);
END $$;
DROP TRIGGER IF EXISTS trg_guard_exam_student_terms ON public.exam_student_terms;
CREATE TRIGGER trg_guard_exam_student_terms BEFORE INSERT OR UPDATE OR DELETE ON public.exam_student_terms
  FOR EACH ROW EXECUTE FUNCTION app.guard_exam_student_terms();

CREATE TABLE IF NOT EXISTS public.report_cards (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id        uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  student_id       uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  term_id          uuid NOT NULL REFERENCES public.exam_terms(id) ON DELETE CASCADE,
  class_id         uuid REFERENCES public.classes(id) ON DELETE SET NULL,
  version          integer NOT NULL CHECK (version >= 1),
  snapshot         jsonb NOT NULL CHECK (jsonb_typeof(snapshot) = 'object'),
  revised          boolean NOT NULL DEFAULT false,
  revision_reason  text CHECK (length(revision_reason) <= 1000),
  published_by     uuid REFERENCES public.users(id) ON DELETE SET NULL,
  published_at     timestamptz NOT NULL DEFAULT now(),
  superseded_at    timestamptz,
  held             boolean NOT NULL DEFAULT false,
  hold_reason      text CHECK (length(hold_reason) <= 300),
  held_at          timestamptz,
  released_by      uuid REFERENCES public.users(id) ON DELETE SET NULL,
  released_at      timestamptz,
  UNIQUE (student_id, term_id, version)
);
CREATE INDEX IF NOT EXISTS idx_report_cards_student ON public.report_cards (student_id) WHERE superseded_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_report_cards_term ON public.report_cards (term_id, class_id);

-- A published card's content never changes; only its hold and whether a revision replaced it.
CREATE OR REPLACE FUNCTION app.guard_report_cards() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF NOT EXISTS (SELECT 1 FROM public.schools WHERE id = OLD.school_id)
       OR NOT EXISTS (SELECT 1 FROM public.users WHERE id = OLD.student_id)
       OR NOT EXISTS (SELECT 1 FROM public.exam_terms WHERE id = OLD.term_id) THEN RETURN OLD; END IF;
    RAISE EXCEPTION 'report cards are kept' USING ERRCODE = '42501';
  END IF;
  IF NEW.snapshot IS DISTINCT FROM OLD.snapshot OR NEW.version <> OLD.version OR NEW.student_id <> OLD.student_id OR NEW.term_id <> OLD.term_id
     OR NEW.published_at <> OLD.published_at OR NEW.revised <> OLD.revised OR NEW.revision_reason IS DISTINCT FROM OLD.revision_reason
     OR (OLD.superseded_at IS NOT NULL AND NEW.superseded_at IS DISTINCT FROM OLD.superseded_at) THEN
    RAISE EXCEPTION 'published report card is frozen' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_guard_report_cards ON public.report_cards;
CREATE TRIGGER trg_guard_report_cards BEFORE UPDATE OR DELETE ON public.report_cards
  FOR EACH ROW EXECUTE FUNCTION app.guard_report_cards();

CREATE TABLE IF NOT EXISTS public.report_card_settings (
  school_id       uuid PRIMARY KEY REFERENCES public.schools(id) ON DELETE CASCADE,
  logo            text CHECK (logo IS NULL OR (logo ~ '^data:image/(png|jpeg|webp);base64,' AND length(logo) <= 400000)),
  accent          text NOT NULL DEFAULT '#002147' CHECK (accent ~ '^#[0-9a-fA-F]{6}$'),
  affiliation     text CHECK (length(affiliation) <= 120),
  address         text CHECK (length(address) <= 300),
  signatures      jsonb NOT NULL DEFAULT '["Class teacher","Principal","Parent"]' CHECK (jsonb_typeof(signatures) = 'array'),
  show            jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(show) = 'object'),
  hold_on_dues    boolean NOT NULL DEFAULT false,
  hold_min_amount numeric(12,2) NOT NULL DEFAULT 1 CHECK (hold_min_amount >= 0),
  updated_by      uuid REFERENCES public.users(id) ON DELETE SET NULL,
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- ── Helpers for publishing (service role only) ──────────────────────────────
-- Attendance per student between two dates, and how many days each class's register was taken.
CREATE OR REPLACE FUNCTION public.exam_attendance(p_school uuid, p_from date, p_to date)
RETURNS TABLE (student_id uuid, class_name text, present bigint, late bigint, absent bigint, excused bigint, class_days bigint)
LANGUAGE sql STABLE SET search_path = public, pg_temp AS $$
  WITH a AS (
    SELECT student_id, class_name, day, status FROM public.attendance
    WHERE school_id = p_school AND day BETWEEN p_from AND p_to
  ), days AS (
    SELECT regexp_replace(lower(class_name), 'class|[^a-z0-9]', '', 'g') AS k, count(DISTINCT day) AS n FROM a GROUP BY 1
  )
  SELECT a.student_id, max(a.class_name),
         count(*) FILTER (WHERE status = 'present'), count(*) FILTER (WHERE status = 'late'),
         count(*) FILTER (WHERE status = 'absent'), count(*) FILTER (WHERE status = 'excused'),
         max(d.n)
  FROM a JOIN days d ON d.k = regexp_replace(lower(a.class_name), 'class|[^a-z0-9]', '', 'g')
  GROUP BY a.student_id
$$;

-- Fees overdue per student today: invoices due on or before today, less concessions and payments.
CREATE OR REPLACE FUNCTION public.exam_fee_dues(p_school uuid, p_today date)
RETURNS TABLE (student_id uuid, overdue numeric)
LANGUAGE sql STABLE SET search_path = public, pg_temp AS $$
  SELECT i.student_id, sum(i.amount - coalesce(i.concession, 0) - coalesce(p.paid, 0))
  FROM public.fee_invoices i
  LEFT JOIN (SELECT invoice_id, sum(amount) AS paid FROM public.fee_payments WHERE school_id = p_school AND voided_at IS NULL GROUP BY invoice_id) p ON p.invoice_id = i.id
  WHERE i.school_id = p_school AND i.voided_at IS NULL AND i.due_on <= p_today
  GROUP BY i.student_id
  HAVING sum(i.amount - coalesce(i.concession, 0) - coalesce(p.paid, 0)) > 0
$$;

REVOKE ALL ON FUNCTION public.exam_attendance(uuid, date, date) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.exam_fee_dues(uuid, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.exam_attendance(uuid, date, date) TO service_role;
GRANT EXECUTE ON FUNCTION public.exam_fee_dues(uuid, date) TO service_role;

-- ── Access ──────────────────────────────────────────────────────────────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['exam_schemes', 'exam_terms', 'exam_assessments', 'exam_sheets', 'exam_marks', 'exam_class_terms',
    'exam_student_terms', 'report_cards', 'report_card_settings'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon, authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
  END LOOP;
  FOREACH t IN ARRAY ARRAY['exam_schemes', 'exam_terms', 'exam_assessments', 'exam_sheets', 'exam_class_terms', 'exam_student_terms', 'report_card_settings'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_touch_%1$s ON public.%1$I', t);
    EXECUTE format('CREATE TRIGGER trg_touch_%1$s BEFORE UPDATE ON public.%1$I FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at()', t);
  END LOOP;
END $$;

-- ── Audit ───────────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_audit_exam_schemes ON public.exam_schemes;
CREATE TRIGGER trg_audit_exam_schemes AFTER INSERT OR UPDATE OR DELETE ON public.exam_schemes
  FOR EACH ROW EXECUTE FUNCTION app.audit('name,grades,grading,rules,status');
DROP TRIGGER IF EXISTS trg_audit_exam_terms ON public.exam_terms;
CREATE TRIGGER trg_audit_exam_terms AFTER INSERT OR UPDATE OR DELETE ON public.exam_terms
  FOR EACH ROW EXECUTE FUNCTION app.audit('name,weight,components,subject_weights,starts_on,ends_on');
DROP TRIGGER IF EXISTS trg_audit_exam_assessments ON public.exam_assessments;
CREATE TRIGGER trg_audit_exam_assessments AFTER INSERT OR UPDATE OR DELETE ON public.exam_assessments
  FOR EACH ROW EXECUTE FUNCTION app.audit('code,name,max_marks,subjects');
DROP TRIGGER IF EXISTS trg_audit_exam_sheets ON public.exam_sheets;
CREATE TRIGGER trg_audit_exam_sheets AFTER UPDATE ON public.exam_sheets
  FOR EACH ROW EXECUTE FUNCTION app.audit('status,returned_note,reopened_reason');
DROP TRIGGER IF EXISTS trg_audit_exam_class_terms ON public.exam_class_terms;
CREATE TRIGGER trg_audit_exam_class_terms AFTER INSERT OR UPDATE ON public.exam_class_terms
  FOR EACH ROW EXECUTE FUNCTION app.audit('status,version,reopen_reason');
-- report_cards (hold and release) and report_card_settings are audited by the API with the actor and without the
-- snapshot or the logo, which would copy large rows into the trail on every change.
