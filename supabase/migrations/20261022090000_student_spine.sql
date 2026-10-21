-- Student spine: the admission register, one enrolment row per student per period, and the year-end outcome chain
-- — 2026-10-22 (handoff/living-record/01-student-spine.md; decisions recorded there).
--
--   students          one row per child per school: the admission register entry and the child IDs. A login
--                     (users row) is linked when Sthara issues one; a child can be admitted or imported without one.
--   student_changes   every correction to the register: field, old value, new value, who, when and why. Nothing
--                     in the register is deleted; a wrong entry is cancelled with a reason and its number is kept.
--   enrolments        dated rows: session, grade, section, class, roll number, stream, languages. A mid-year move
--                     closes the open row and opens a new one. The year-end outcome lives on the row it ends, with
--                     the chain that set it (class teacher proposes, principal approves, registrar finalises).
--
-- users.student_class and users.custom_student_id stay as a cache of the current class and the admission number,
-- kept in step by triggers both ways, so every existing reader keeps working. A legacy write to users (Sthara
-- support moving a student, correcting a number, marking a student left) becomes a dated enrolment change.
--
-- Aadhaar is encrypted in the app (AES-GCM, STUDENT_PII_KEY); the database holds the ciphertext and the last 4.

-- ── Roles and permissions ───────────────────────────────────────────────────

ALTER TABLE public.role_grants DROP CONSTRAINT role_grants_role_key_check;
ALTER TABLE public.role_grants ADD CONSTRAINT role_grants_role_key_check CHECK (role_key IN ('school_admin', 'principal',
  'vice_principal', 'finance_head', 'accountant', 'cashier', 'admissions_officer', 'hr_manager', 'academic_coordinator',
  'counsellor', 'dpo', 'registrar'));

INSERT INTO public.role_permissions (role_key, perm) VALUES
  ('school_admin', 'students.read'), ('school_admin', 'students.manage'), ('school_admin', 'students.aadhaar'),
  ('school_admin', 'outcomes.approve'), ('school_admin', 'session.manage'),
  ('principal', 'students.read'), ('principal', 'students.manage'), ('principal', 'students.aadhaar'), ('principal', 'outcomes.approve'),
  ('registrar', 'dashboard.view'), ('registrar', 'students.read'), ('registrar', 'students.manage'), ('registrar', 'students.aadhaar'),
  ('vice_principal', 'students.read'), ('academic_coordinator', 'students.read'), ('admissions_officer', 'students.read'),
  ('finance_head', 'students.read'), ('accountant', 'students.read')
  ON CONFLICT DO NOTHING;

-- ── Session and numbering helpers ───────────────────────────────────────────
-- schools.settings.session = {"startMonth": 4, "current": "2026-27"}; settings.admission = {"prefix": "VN/", "pad": 4};
-- settings.rollRule = alphabetical | admission | manual. Missing values fall back to April, the session of today, no
-- prefix and 4 digits.

CREATE OR REPLACE FUNCTION app.session_start_month(p_school uuid) RETURNS int
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
  AS $$
  SELECT coalesce(CASE WHEN (s.settings -> 'session' ->> 'startMonth') ~ '^(1[0-2]|[1-9])$'
                       THEN (s.settings -> 'session' ->> 'startMonth')::int END, 4)
  FROM public.schools s WHERE s.id = p_school
$$;

-- The session a day falls in, for a school: "2026-27" when it starts in the first year.
CREATE OR REPLACE FUNCTION app.session_of(p_school uuid, p_day date) RETURNS text
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
  AS $$
  SELECT y::text || '-' || lpad(((y + 1) % 100)::text, 2, '0')
  FROM (SELECT CASE WHEN extract(month FROM p_day) >= app.session_start_month(p_school)
                    THEN extract(year FROM p_day)::int ELSE extract(year FROM p_day)::int - 1 END AS y) t
$$;

CREATE OR REPLACE FUNCTION app.current_session(p_school uuid) RETURNS text
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
  AS $$
  SELECT coalesce(CASE WHEN (s.settings -> 'session' ->> 'current') ~ '^\d{4}-\d{2}$' THEN s.settings -> 'session' ->> 'current' END,
                  app.session_of(p_school, app.school_today()))
  FROM public.schools s WHERE s.id = p_school
$$;

-- First and last day of a session at a school.
CREATE OR REPLACE FUNCTION app.session_starts(p_school uuid, p_session text) RETURNS date
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
  AS $$ SELECT make_date(left(p_session, 4)::int, app.session_start_month(p_school), 1) $$;
CREATE OR REPLACE FUNCTION app.session_ends(p_school uuid, p_session text) RETURNS date
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
  AS $$ SELECT (app.session_starts(p_school, p_session) + interval '1 year' - interval '1 day')::date $$;

ALTER TABLE public.doc_counters DROP CONSTRAINT doc_counters_kind_check;
ALTER TABLE public.doc_counters ADD CONSTRAINT doc_counters_kind_check CHECK (kind IN ('invoice', 'receipt', 'admission'));

-- ── The register ────────────────────────────────────────────────────────────

CREATE TABLE public.students (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  user_id uuid UNIQUE REFERENCES public.users(id) ON DELETE SET NULL,
  admission_no text NOT NULL CHECK (length(trim(admission_no)) BETWEEN 1 AND 30),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'left', 'cancelled')),
  full_name text NOT NULL CHECK (length(trim(full_name)) BETWEEN 1 AND 120),
  aadhaar_name text CHECK (aadhaar_name IS NULL OR length(aadhaar_name) <= 120),
  gender text CHECK (gender IN ('male', 'female', 'transgender')),
  date_of_birth date CHECK (date_of_birth IS NULL OR date_of_birth BETWEEN '1980-01-01' AND '2100-01-01'),
  photo_path text CHECK (photo_path IS NULL OR length(photo_path) <= 300),
  pen text CHECK (pen ~ '^\d{11}$'),
  apaar_id text CHECK (apaar_id ~ '^\d{12}$'),
  aadhaar_cipher text CHECK (aadhaar_cipher IS NULL OR length(aadhaar_cipher) <= 200),
  aadhaar_last4 text CHECK (aadhaar_last4 ~ '^\d{4}$'),
  aadhaar_hash text CHECK (aadhaar_hash ~ '^[0-9a-f]{64}$'),   -- HMAC of the number with the same key: finds repeats without decrypting
  no_aadhaar boolean NOT NULL DEFAULT false,
  CHECK ((aadhaar_cipher IS NULL) = (aadhaar_last4 IS NULL) AND (aadhaar_cipher IS NULL) = (aadhaar_hash IS NULL)),
  CHECK (NOT (no_aadhaar AND aadhaar_cipher IS NOT NULL)),
  cbse_reg_no text CHECK (cbse_reg_no IS NULL OR length(cbse_reg_no) BETWEEN 1 AND 20),
  board_roll_no text CHECK (board_roll_no IS NULL OR length(board_roll_no) BETWEEN 1 AND 20),
  admitted_on date,
  admitted_grade smallint CHECK (admitted_grade BETWEEN -3 AND 12),
  previous_school text CHECK (previous_school IS NULL OR length(previous_school) <= 200),
  previous_status text CHECK (previous_status IN ('same_school', 'other_school', 'anganwadi_ecce', 'not_studying')),
  previous_class text CHECK (previous_class IS NULL OR length(previous_class) <= 40),
  previous_tc_no text CHECK (previous_tc_no IS NULL OR length(previous_tc_no) <= 40),
  rte_seat boolean NOT NULL DEFAULT false,
  rte_amount numeric(10,2) CHECK (rte_amount IS NULL OR rte_amount >= 0),
  medium text CHECK (medium IS NULL OR length(medium) <= 40),
  indian_national boolean NOT NULL DEFAULT true,
  left_on date,
  leaving_reason text CHECK (leaving_reason IS NULL OR length(leaving_reason) <= 300),
  cancelled_at timestamptz,
  cancel_reason text CHECK (cancel_reason IS NULL OR length(cancel_reason) <= 300),
  CHECK ((status = 'cancelled') = (cancelled_at IS NOT NULL)),
  applicant_id uuid REFERENCES public.admission_applicants(id) ON DELETE SET NULL,
  import_job_id uuid,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
-- A number is never reused, so the uniqueness covers cancelled entries too.
CREATE UNIQUE INDEX students_admission_no ON public.students (school_id, lower(admission_no));
CREATE INDEX students_school ON public.students (school_id, status, full_name);
-- One child, one Aadhaar: the same number on two live entries of a school is refused.
CREATE UNIQUE INDEX students_aadhaar ON public.students (school_id, aadhaar_hash) WHERE aadhaar_hash IS NOT NULL AND status <> 'cancelled';
CREATE INDEX students_import_job ON public.students (import_job_id) WHERE import_job_id IS NOT NULL;
CREATE TRIGGER trg_touch_students BEFORE UPDATE ON public.students FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
-- The audit log gets the row without the Aadhaar ciphertext (app.audit stores rows whole); the masked number is in
-- aadhaar_last4. Imports are audited once, by their job, as everywhere else.
CREATE OR REPLACE FUNCTION app.audit_students() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
  AS $$
DECLARE
  v_old jsonb := CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) - 'aadhaar_cipher' - 'aadhaar_hash' END;
  v_new jsonb := CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) - 'aadhaar_cipher' - 'aadhaar_hash' END;
BEGIN
  IF app.importing() THEN RETURN NULL; END IF;
  IF TG_OP = 'UPDATE' AND (v_old - 'updated_at') = (v_new - 'updated_at') AND OLD.aadhaar_cipher IS NOT DISTINCT FROM NEW.aadhaar_cipher THEN RETURN NULL; END IF;
  INSERT INTO public.audit_log (actor_id, actor_role, action, table_name, row_id, school_id, old_values, new_values)
  VALUES (auth.uid(), CASE WHEN auth.uid() IS NULL THEN 'server' ELSE coalesce(app.user_role(), 'unknown') END,
          TG_OP, 'students', coalesce(NEW.id, OLD.id)::text, coalesce(NEW.school_id, OLD.school_id), v_old, v_new);
  RETURN NULL;
END $$;
CREATE TRIGGER trg_audit_students AFTER INSERT OR DELETE OR UPDATE ON public.students FOR EACH ROW EXECUTE FUNCTION app.audit_students();

CREATE TABLE public.student_changes (
  id bigserial PRIMARY KEY,
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  field text NOT NULL CHECK (field ~ '^[a-z_0-9]{1,40}$'),
  old_value text CHECK (old_value IS NULL OR length(old_value) <= 400),
  new_value text CHECK (new_value IS NULL OR length(new_value) <= 400),
  reason text NOT NULL CHECK (length(trim(reason)) BETWEEN 1 AND 300),
  changed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  changed_by_kind text NOT NULL DEFAULT 'staff' CHECK (changed_by_kind IN ('staff', 'operator', 'import', 'system')),
  changed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX student_changes_student ON public.student_changes (student_id, changed_at DESC);

-- ── Enrolment ───────────────────────────────────────────────────────────────

CREATE TABLE public.enrolments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  session text NOT NULL CHECK (session ~ '^\d{4}-\d{2}$'),
  grade smallint CHECK (grade BETWEEN -3 AND 12),
  section text CHECK (section IS NULL OR length(section) BETWEEN 1 AND 10),
  class_id uuid REFERENCES public.classes(id) ON DELETE SET NULL,
  class_name text CHECK (class_name IS NULL OR length(class_name) BETWEEN 1 AND 40),
  roll_no text CHECK (roll_no IS NULL OR length(roll_no) BETWEEN 1 AND 12),
  stream text CHECK (stream IN ('science', 'commerce', 'humanities', 'vocational', 'other')),
  languages jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(languages) = 'object'),
  vocational jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(vocational) = 'object'),
  facilities text[] NOT NULL DEFAULT '{}',
  starts_on date NOT NULL,
  ends_on date,
  end_reason text CHECK (end_reason IN ('class_change', 'promoted', 'retained', 'left', 'correction')),
  CHECK (ends_on IS NULL OR ends_on >= starts_on),
  CHECK ((ends_on IS NULL) = (end_reason IS NULL)),
  -- Year end: the class teacher proposes, the principal approves (or returns it with a note), the registrar finalises.
  proposed_outcome text CHECK (proposed_outcome IN ('promoted', 'detained', 'promoted_no_exam', 'dropout', 'repeater', 'left')),
  proposed_note text CHECK (proposed_note IS NULL OR length(proposed_note) <= 300),
  proposed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  proposed_at timestamptz,
  approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at timestamptz,
  returned_note text CHECK (returned_note IS NULL OR length(returned_note) <= 300),
  outcome text CHECK (outcome IN ('promoted', 'detained', 'promoted_no_exam', 'dropout', 'repeater', 'left')),
  finalised_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  finalised_at timestamptz,
  CHECK ((outcome IS NULL) = (finalised_at IS NULL)),
  CHECK (approved_at IS NULL OR proposed_at IS NOT NULL),
  published_at timestamptz,
  import_job_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
-- At most one open row per student: a move closes the open row before it opens the next.
CREATE UNIQUE INDEX enrolments_open ON public.enrolments (student_id) WHERE ends_on IS NULL;
CREATE INDEX enrolments_student ON public.enrolments (student_id, session, starts_on);
CREATE INDEX enrolments_school_session ON public.enrolments (school_id, session, grade, section);
CREATE INDEX enrolments_import_job ON public.enrolments (import_job_id) WHERE import_job_id IS NOT NULL;
CREATE TRIGGER trg_touch_enrolments BEFORE UPDATE ON public.enrolments FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
CREATE TRIGGER trg_audit_enrolments AFTER INSERT OR DELETE OR UPDATE ON public.enrolments FOR EACH ROW EXECUTE FUNCTION app.audit();

-- ── Who reads ───────────────────────────────────────────────────────────────
-- Every screen reads through the server; these policies are for completeness. The Aadhaar ciphertext is never
-- granted to signed-in users at all.

ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;
CREATE POLICY students_read ON public.students FOR SELECT TO authenticated USING (
  ((SELECT app.has_perm('students.read')) AND school_id = (SELECT app.current_school_id()))
  OR user_id = (SELECT auth.uid())
  OR EXISTS (SELECT 1 FROM public.guardians g WHERE g.student_id = students.user_id AND g.parent_id = (SELECT auth.uid()))
  OR (SELECT app.is_superadmin()));
GRANT ALL ON public.students TO service_role;
GRANT SELECT (id, school_id, user_id, admission_no, status, full_name, aadhaar_name, gender, date_of_birth, pen, apaar_id,
  aadhaar_last4, no_aadhaar, cbse_reg_no, board_roll_no, admitted_on, admitted_grade, previous_school, previous_status,
  previous_class, previous_tc_no, rte_seat, rte_amount, medium, indian_national, left_on, leaving_reason, cancelled_at,
  cancel_reason, created_at, updated_at) ON public.students TO authenticated;

ALTER TABLE public.student_changes ENABLE ROW LEVEL SECURITY;
CREATE POLICY student_changes_read ON public.student_changes FOR SELECT TO authenticated USING (
  ((SELECT app.has_perm('students.read')) AND school_id = (SELECT app.current_school_id())) OR (SELECT app.is_superadmin()));
GRANT ALL ON public.student_changes TO service_role;
GRANT USAGE ON SEQUENCE public.student_changes_id_seq TO service_role, authenticated;
GRANT SELECT ON public.student_changes TO authenticated;

ALTER TABLE public.enrolments ENABLE ROW LEVEL SECURITY;
CREATE POLICY enrolments_read ON public.enrolments FOR SELECT TO authenticated USING (
  ((SELECT app.has_perm('students.read')) AND school_id = (SELECT app.current_school_id()))
  OR EXISTS (SELECT 1 FROM public.students s WHERE s.id = enrolments.student_id AND (s.user_id = (SELECT auth.uid())
     OR EXISTS (SELECT 1 FROM public.guardians g WHERE g.student_id = s.user_id AND g.parent_id = (SELECT auth.uid()))))
  OR (SELECT app.is_superadmin()));
GRANT ALL ON public.enrolments TO service_role;
GRANT SELECT ON public.enrolments TO authenticated;

-- ── Numbers ─────────────────────────────────────────────────────────────────

-- The next admission number in the school format (prefix + zero-padded number), skipping any number already on the
-- register (imported numbers carry on unchanged; Sthara continues after them).
CREATE OR REPLACE FUNCTION app.next_admission_no(p_school uuid) RETURNS text
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
  AS $$
DECLARE
  v_set jsonb := (SELECT settings -> 'admission' FROM public.schools WHERE id = p_school);
  v_prefix text := left(coalesce(v_set ->> 'prefix', ''), 12);
  v_pad int := least(greatest(coalesce(CASE WHEN (v_set ->> 'pad') ~ '^\d{1,2}$' THEN (v_set ->> 'pad')::int END, 4), 1), 9);
  v_n int; v_no text;
BEGIN
  LOOP
    INSERT INTO public.doc_counters (school_id, kind, session, last_no) VALUES (p_school, 'admission', 'all', 1)
      ON CONFLICT (school_id, kind, session) DO UPDATE SET last_no = doc_counters.last_no + 1
      RETURNING last_no INTO v_n;
    v_no := v_prefix || lpad(v_n::text, v_pad, '0');
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.students WHERE school_id = p_school AND lower(admission_no) = lower(v_no));
  END LOOP;
  RETURN v_no;
END $$;

-- After numbers come in from outside (an import, a correction): the counter moves past the highest number on the
-- register that is in the school format, so the next one Sthara issues follows it.
CREATE OR REPLACE FUNCTION app.admission_floor(p_school uuid) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
  AS $$
DECLARE
  v_prefix text := left(coalesce((SELECT settings -> 'admission' ->> 'prefix' FROM public.schools WHERE id = p_school), ''), 12);
  v_max int;
BEGIN
  SELECT max(substr(admission_no, length(v_prefix) + 1)::bigint) FILTER (WHERE substr(admission_no, length(v_prefix) + 1) ~ '^\d{1,9}$')::int INTO v_max
    FROM public.students WHERE school_id = p_school AND (v_prefix = '' OR lower(left(admission_no, length(v_prefix))) = lower(v_prefix));
  IF v_max IS NOT NULL THEN
    INSERT INTO public.doc_counters (school_id, kind, session, last_no) VALUES (p_school, 'admission', 'all', v_max)
      ON CONFLICT (school_id, kind, session) DO UPDATE SET last_no = greatest(doc_counters.last_no, EXCLUDED.last_no);
  END IF;
END $$;

-- ── Keeping users (the login) in step ───────────────────────────────────────
-- app.student_sync = 1 while the spine writes users, so the users trigger below does not answer its own write.

-- The cached class and admission number on the login: the class of the latest row in the current session (or, for
-- a student whose latest row is older, that row), and the register number.
CREATE OR REPLACE FUNCTION app.sync_student_login(p_student uuid) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
  AS $$
DECLARE s public.students; v_class text;
BEGIN
  SELECT * INTO s FROM public.students WHERE id = p_student;
  IF s.user_id IS NULL THEN RETURN; END IF;
  SELECT e.class_name INTO v_class FROM public.enrolments e
    WHERE e.student_id = s.id AND e.session <= app.current_session(s.school_id)
    ORDER BY e.session DESC, e.starts_on DESC, e.created_at DESC LIMIT 1;
  PERFORM set_config('app.student_sync', '1', true);
  UPDATE public.users u SET student_class = coalesce(v_class, u.student_class), custom_student_id = s.admission_no
    WHERE u.id = s.user_id AND (u.student_class IS DISTINCT FROM coalesce(v_class, u.student_class) OR u.custom_student_id IS DISTINCT FROM s.admission_no);
  PERFORM set_config('app.student_sync', '', true);
END $$;

CREATE OR REPLACE FUNCTION app.on_enrolment_change() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
  AS $$
BEGIN
  PERFORM app.sync_student_login(coalesce(NEW.student_id, OLD.student_id));
  RETURN NULL;
END $$;
CREATE TRIGGER trg_enrolment_sync AFTER INSERT OR DELETE OR UPDATE OF class_name, session, starts_on, ends_on ON public.enrolments
  FOR EACH ROW EXECUTE FUNCTION app.on_enrolment_change();

CREATE OR REPLACE FUNCTION app.on_student_change() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
  AS $$
BEGIN
  PERFORM app.sync_student_login(NEW.id);
  RETURN NULL;
END $$;
CREATE TRIGGER trg_student_sync AFTER INSERT OR UPDATE OF admission_no, user_id ON public.students
  FOR EACH ROW EXECUTE FUNCTION app.on_student_change();

-- Grade and section from a class name: "Class 10-A" is 10 and A; pre-primary names map to -3..0.
CREATE OR REPLACE FUNCTION app.grade_from_class(t text) RETURNS int
  LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, pg_temp
  AS $$
  SELECT CASE
    WHEN lower(coalesce(t, '')) ~ '(nursery|pre-?kg|pp-?1|playgroup)' THEN -2
    WHEN lower(coalesce(t, '')) ~ '(lkg|pp-?2)' THEN -1
    WHEN lower(coalesce(t, '')) ~ '(ukg|pp-?3)' THEN 0
    ELSE CASE WHEN app.grade_of(t) BETWEEN 1 AND 12 THEN app.grade_of(t) END END
$$;
CREATE OR REPLACE FUNCTION app.section_from_class(t text) RETURNS text
  LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, pg_temp
  AS $$ SELECT upper(substring(coalesce(t, '') from '\d\s*[-\s/]?\s*([A-Za-z]{1,3})\s*$')) $$;

-- Opens an enrolment row for a student in a class from a given day, closing the open row (or correcting it in place
-- when it opened the same day). Used by the users trigger and by the server for a mid-year move.
CREATE OR REPLACE FUNCTION app.move_enrolment(p_student uuid, p_class text, p_from date, p_reason text) RETURNS uuid
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
  AS $$
DECLARE
  s public.students; o public.enrolments; v_id uuid;
  v_session text; v_class_id uuid; v_class text;
BEGIN
  SELECT * INTO s FROM public.students WHERE id = p_student;
  v_session := app.session_of(s.school_id, p_from);
  SELECT c.id, c.name INTO v_class_id, v_class FROM public.classes c
    WHERE c.school_id = s.school_id AND app.norm_class(c.name) = app.norm_class(p_class) ORDER BY c.created_at LIMIT 1;
  v_class := coalesce(v_class, nullif(trim(p_class), ''));
  SELECT * INTO o FROM public.enrolments WHERE student_id = p_student AND ends_on IS NULL;
  IF o.id IS NOT NULL AND app.norm_class(o.class_name) = app.norm_class(v_class) AND o.session = v_session THEN RETURN o.id; END IF;
  IF o.id IS NOT NULL AND (o.starts_on >= p_from OR (o.session = v_session AND o.class_name IS NULL)) THEN
    UPDATE public.enrolments SET class_name = v_class, class_id = v_class_id, grade = app.grade_from_class(v_class),
      section = app.section_from_class(v_class), roll_no = NULL WHERE id = o.id;
    RETURN o.id;
  END IF;
  IF o.id IS NOT NULL THEN
    UPDATE public.enrolments SET ends_on = p_from - 1, end_reason = coalesce(p_reason, 'class_change') WHERE id = o.id;
  END IF;
  INSERT INTO public.enrolments (school_id, student_id, session, grade, section, class_id, class_name, stream, languages, vocational, starts_on)
    VALUES (s.school_id, p_student, v_session, app.grade_from_class(v_class), app.section_from_class(v_class), v_class_id, v_class,
            CASE WHEN o.session = v_session THEN o.stream END, CASE WHEN o.session = v_session THEN o.languages ELSE '{}'::jsonb END,
            CASE WHEN o.session = v_session THEN o.vocational ELSE '{}'::jsonb END, p_from)
    RETURNING id INTO v_id;
  RETURN v_id;
END $$;

-- A student login appears or changes outside the spine (Sthara issuing logins, support moving a student, correcting
-- a number or a name, marking a student left): the register and enrolment follow, with history.
CREATE OR REPLACE FUNCTION app.on_student_login_change() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
  AS $$
DECLARE
  s public.students; v_no text; v_left jsonb; v_today date := app.school_today();
  v_kind text := CASE WHEN auth.uid() IS NULL THEN 'system' ELSE 'operator' END;
BEGIN
  IF current_setting('app.student_sync', true) = '1' THEN RETURN NULL; END IF;
  IF NEW.role IS DISTINCT FROM 'student' OR NEW.school_id IS NULL THEN RETURN NULL; END IF;
  SELECT * INTO s FROM public.students WHERE user_id = NEW.id;
  IF s.id IS NOT NULL AND s.school_id <> NEW.school_id THEN
    -- A login moved to another school: the old record stays with the old school, unlinked.
    UPDATE public.students SET user_id = NULL WHERE id = s.id;
    s := NULL;
  END IF;
  IF s.id IS NULL THEN
    -- Link to a register entry with the same number (imported before the login was issued), or start one.
    SELECT * INTO s FROM public.students WHERE school_id = NEW.school_id AND user_id IS NULL
      AND lower(admission_no) = lower(trim(coalesce(NEW.custom_student_id, ''))) AND status <> 'cancelled';
    IF s.id IS NOT NULL THEN
      PERFORM set_config('app.student_sync', '1', true);
      UPDATE public.students SET user_id = NEW.id WHERE id = s.id;
      PERFORM set_config('app.student_sync', '', true);
    ELSE
      v_no := coalesce(nullif(trim(NEW.custom_student_id), ''), app.next_admission_no(NEW.school_id));
      INSERT INTO public.students (school_id, user_id, admission_no, full_name, status, admitted_on, left_on, leaving_reason)
        VALUES (NEW.school_id, NEW.id, v_no, left(coalesce(nullif(trim(NEW.name), ''), 'Student'), 120),
                CASE WHEN NEW.metadata ? 'left' THEN 'left' ELSE 'active' END,
                CASE WHEN TG_OP = 'INSERT' THEN v_today END,
                CASE WHEN NEW.metadata ? 'left' THEN coalesce(nullif(NEW.metadata -> 'left' ->> 'on', '')::date, v_today) END,
                left(NEW.metadata -> 'left' ->> 'reason', 300))
        RETURNING * INTO s;
      PERFORM app.admission_floor(NEW.school_id);
    END IF;
    IF nullif(trim(NEW.student_class), '') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.enrolments WHERE student_id = s.id) THEN
      PERFORM app.move_enrolment(s.id, NEW.student_class,
        CASE WHEN TG_OP = 'INSERT' THEN v_today ELSE app.session_starts(NEW.school_id, app.current_session(NEW.school_id)) END, NULL);
    END IF;
    PERFORM app.sync_student_login(s.id);
    RETURN NULL;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF nullif(trim(NEW.student_class), '') IS NOT NULL AND app.norm_class(NEW.student_class) <> app.norm_class(OLD.student_class) THEN
      PERFORM app.move_enrolment(s.id, NEW.student_class, v_today, 'class_change');
    END IF;
    IF nullif(trim(NEW.custom_student_id), '') IS NOT NULL AND NEW.custom_student_id IS DISTINCT FROM OLD.custom_student_id
       AND lower(trim(NEW.custom_student_id)) <> lower(s.admission_no) THEN
      INSERT INTO public.student_changes (school_id, student_id, field, old_value, new_value, reason, changed_by, changed_by_kind)
        VALUES (s.school_id, s.id, 'admission_no', s.admission_no, trim(NEW.custom_student_id), 'Corrected by Sthara support', auth.uid(), v_kind);
      UPDATE public.students SET admission_no = trim(NEW.custom_student_id) WHERE id = s.id;
    END IF;
    IF nullif(trim(NEW.name), '') IS NOT NULL AND NEW.name IS DISTINCT FROM OLD.name AND trim(NEW.name) <> s.full_name THEN
      INSERT INTO public.student_changes (school_id, student_id, field, old_value, new_value, reason, changed_by, changed_by_kind)
        VALUES (s.school_id, s.id, 'full_name', s.full_name, left(trim(NEW.name), 120), 'Corrected by Sthara support', auth.uid(), v_kind);
      UPDATE public.students SET full_name = left(trim(NEW.name), 120) WHERE id = s.id;
    END IF;
    v_left := NEW.metadata -> 'left';
    IF (v_left IS NOT NULL) <> (OLD.metadata ? 'left') THEN
      IF v_left IS NOT NULL AND s.status = 'active' THEN
        UPDATE public.students SET status = 'left', left_on = coalesce(nullif(v_left ->> 'on', '')::date, v_today),
          leaving_reason = left(v_left ->> 'reason', 300) WHERE id = s.id;
        UPDATE public.enrolments SET ends_on = greatest(starts_on, coalesce(nullif(v_left ->> 'on', '')::date, v_today)), end_reason = 'left'
          WHERE student_id = s.id AND ends_on IS NULL;
      ELSIF v_left IS NULL AND s.status = 'left' THEN
        UPDATE public.students SET status = 'active', left_on = NULL, leaving_reason = NULL WHERE id = s.id;
        IF nullif(trim(NEW.student_class), '') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.enrolments WHERE student_id = s.id AND ends_on IS NULL) THEN
          PERFORM app.move_enrolment(s.id, NEW.student_class, v_today, NULL);
        END IF;
      END IF;
    END IF;
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER trg_student_login_change AFTER INSERT OR UPDATE OF student_class, custom_student_id, name, role, school_id, metadata ON public.users
  FOR EACH ROW EXECUTE FUNCTION app.on_student_login_change();

-- ── Corrections ─────────────────────────────────────────────────────────────
-- One call corrects any register fields with one reason: each changed field gets a history row, then the record is
-- updated. Fields not in the list below cannot be corrected this way. p_masked carries what the history shows for a
-- sensitive field (the Aadhaar ciphertext is never written to history).

CREATE OR REPLACE FUNCTION public.student_correct(p_student uuid, p_school uuid, p_actor uuid, p_kind text, p_patch jsonb, p_reason text, p_masked jsonb DEFAULT '{}')
  RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
  AS $$
DECLARE
  v_old jsonb; f text; v_n int := 0;
  v_fields text[] := ARRAY['admission_no', 'full_name', 'aadhaar_name', 'gender', 'date_of_birth', 'pen', 'apaar_id', 'aadhaar_cipher',
    'aadhaar_hash', 'aadhaar_last4', 'no_aadhaar', 'cbse_reg_no', 'board_roll_no', 'admitted_on', 'admitted_grade', 'previous_school', 'previous_status',
    'previous_class', 'previous_tc_no', 'rte_seat', 'rte_amount', 'medium', 'indian_national', 'photo_path'];
BEGIN
  IF length(trim(coalesce(p_reason, ''))) = 0 THEN RAISE EXCEPTION 'A correction needs a reason' USING ERRCODE = '22023'; END IF;
  SELECT to_jsonb(s) INTO v_old FROM public.students s WHERE s.id = p_student AND s.school_id = p_school FOR UPDATE;
  IF v_old IS NULL THEN RAISE EXCEPTION 'Student not found at this school' USING ERRCODE = 'P0002'; END IF;
  IF v_old ->> 'status' = 'cancelled' THEN RAISE EXCEPTION 'A cancelled entry cannot be corrected' USING ERRCODE = '22023'; END IF;
  FOR f IN SELECT jsonb_object_keys(p_patch) LOOP
    IF NOT f = ANY (v_fields) THEN RAISE EXCEPTION 'Field % cannot be corrected', f USING ERRCODE = '22023'; END IF;
    IF (v_old -> f) IS DISTINCT FROM (p_patch -> f) AND f NOT IN ('aadhaar_cipher', 'aadhaar_hash') THEN
      INSERT INTO public.student_changes (school_id, student_id, field, old_value, new_value, reason, changed_by, changed_by_kind)
        VALUES (p_school, p_student, CASE WHEN f = 'aadhaar_last4' THEN 'aadhaar' ELSE f END,
                left(coalesce(p_masked -> 'old' ->> f, v_old ->> f), 400), left(coalesce(p_masked -> 'new' ->> f, p_patch ->> f), 400),
                left(trim(p_reason), 300), p_actor, p_kind);
      v_n := v_n + 1;
    END IF;
  END LOOP;
  IF v_n = 0 THEN RETURN 0; END IF;
  UPDATE public.students s SET
    admission_no = CASE WHEN p_patch ? 'admission_no' THEN p_patch ->> 'admission_no' ELSE s.admission_no END,
    full_name = CASE WHEN p_patch ? 'full_name' THEN p_patch ->> 'full_name' ELSE s.full_name END,
    aadhaar_name = CASE WHEN p_patch ? 'aadhaar_name' THEN p_patch ->> 'aadhaar_name' ELSE s.aadhaar_name END,
    gender = CASE WHEN p_patch ? 'gender' THEN p_patch ->> 'gender' ELSE s.gender END,
    date_of_birth = CASE WHEN p_patch ? 'date_of_birth' THEN (p_patch ->> 'date_of_birth')::date ELSE s.date_of_birth END,
    pen = CASE WHEN p_patch ? 'pen' THEN p_patch ->> 'pen' ELSE s.pen END,
    apaar_id = CASE WHEN p_patch ? 'apaar_id' THEN p_patch ->> 'apaar_id' ELSE s.apaar_id END,
    aadhaar_cipher = CASE WHEN p_patch ? 'aadhaar_cipher' THEN p_patch ->> 'aadhaar_cipher' ELSE s.aadhaar_cipher END,
    aadhaar_last4 = CASE WHEN p_patch ? 'aadhaar_last4' THEN p_patch ->> 'aadhaar_last4' ELSE s.aadhaar_last4 END,
    aadhaar_hash = CASE WHEN p_patch ? 'aadhaar_hash' THEN p_patch ->> 'aadhaar_hash' ELSE s.aadhaar_hash END,
    no_aadhaar = CASE WHEN p_patch ? 'no_aadhaar' THEN (p_patch ->> 'no_aadhaar')::boolean ELSE s.no_aadhaar END,
    cbse_reg_no = CASE WHEN p_patch ? 'cbse_reg_no' THEN p_patch ->> 'cbse_reg_no' ELSE s.cbse_reg_no END,
    board_roll_no = CASE WHEN p_patch ? 'board_roll_no' THEN p_patch ->> 'board_roll_no' ELSE s.board_roll_no END,
    admitted_on = CASE WHEN p_patch ? 'admitted_on' THEN (p_patch ->> 'admitted_on')::date ELSE s.admitted_on END,
    admitted_grade = CASE WHEN p_patch ? 'admitted_grade' THEN (p_patch ->> 'admitted_grade')::smallint ELSE s.admitted_grade END,
    previous_school = CASE WHEN p_patch ? 'previous_school' THEN p_patch ->> 'previous_school' ELSE s.previous_school END,
    previous_status = CASE WHEN p_patch ? 'previous_status' THEN p_patch ->> 'previous_status' ELSE s.previous_status END,
    previous_class = CASE WHEN p_patch ? 'previous_class' THEN p_patch ->> 'previous_class' ELSE s.previous_class END,
    previous_tc_no = CASE WHEN p_patch ? 'previous_tc_no' THEN p_patch ->> 'previous_tc_no' ELSE s.previous_tc_no END,
    rte_seat = CASE WHEN p_patch ? 'rte_seat' THEN (p_patch ->> 'rte_seat')::boolean ELSE s.rte_seat END,
    rte_amount = CASE WHEN p_patch ? 'rte_amount' THEN (p_patch ->> 'rte_amount')::numeric ELSE s.rte_amount END,
    medium = CASE WHEN p_patch ? 'medium' THEN p_patch ->> 'medium' ELSE s.medium END,
    indian_national = CASE WHEN p_patch ? 'indian_national' THEN (p_patch ->> 'indian_national')::boolean ELSE s.indian_national END,
    photo_path = CASE WHEN p_patch ? 'photo_path' THEN p_patch ->> 'photo_path' ELSE s.photo_path END
  WHERE s.id = p_student;
  IF p_patch ? 'admission_no' THEN PERFORM app.admission_floor(p_school); END IF;
  RETURN v_n;
END $$;

-- Roll numbers for one class in one session by the school rule: alphabetical (by name), or by admission number.
-- Manual leaves them alone. Only open rows are numbered.
CREATE OR REPLACE FUNCTION public.student_renumber(p_school uuid, p_session text, p_class text, p_rule text)
  RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
  AS $$
DECLARE v_n int;
BEGIN
  IF p_rule NOT IN ('alphabetical', 'admission') THEN RETURN 0; END IF;
  WITH r AS (
    SELECT e.id, row_number() OVER (ORDER BY CASE WHEN p_rule = 'alphabetical' THEN lower(s.full_name) END,
      CASE WHEN substring(s.admission_no from '(\d+)\s*$') IS NOT NULL THEN substring(s.admission_no from '(\d+)\s*$')::bigint END,
      lower(s.admission_no)) AS n
    FROM public.enrolments e JOIN public.students s ON s.id = e.student_id
    WHERE e.school_id = p_school AND e.session = p_session AND e.ends_on IS NULL AND app.norm_class(e.class_name) = app.norm_class(p_class)
      AND s.status = 'active')
  UPDATE public.enrolments e SET roll_no = r.n::text FROM r WHERE e.id = r.id AND e.roll_no IS DISTINCT FROM r.n::text;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END $$;

-- Year end, last step: every finalised row in a session and class becomes history and the next row opens. Promoted
-- (or promoted without exam) students go to p_to_class; detained and repeaters stay in the same grade in
-- p_same_class; dropouts and leavers close and the register marks them left. Rows with no final outcome are refused
-- as a whole. Returns {promoted, retained, left}.
CREATE OR REPLACE FUNCTION public.student_promote(p_school uuid, p_session text, p_class text, p_to_class text, p_same_class text, p_actor uuid)
  RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
  AS $$
DECLARE
  v_next text := (left(p_session, 4)::int + 1)::text || '-' || lpad(((left(p_session, 4)::int + 2) % 100)::text, 2, '0');
  v_end date := app.session_ends(p_school, p_session);
  v_start date := app.session_starts(p_school, v_next);
  r record; v_up int := 0; v_stay int := 0; v_left int := 0;
BEGIN
  IF EXISTS (SELECT 1 FROM public.enrolments e JOIN public.students s ON s.id = e.student_id
             WHERE e.school_id = p_school AND e.session = p_session AND e.ends_on IS NULL AND s.status = 'active'
               AND app.norm_class(e.class_name) = app.norm_class(p_class) AND e.outcome IS NULL) THEN
    RAISE EXCEPTION 'Some students in % have no final outcome yet', p_class USING ERRCODE = '22023';
  END IF;
  FOR r IN SELECT e.id, e.student_id, e.outcome FROM public.enrolments e JOIN public.students s ON s.id = e.student_id
           WHERE e.school_id = p_school AND e.session = p_session AND e.ends_on IS NULL AND s.status = 'active'
             AND app.norm_class(e.class_name) = app.norm_class(p_class) LOOP
    IF r.outcome IN ('promoted', 'promoted_no_exam') THEN
      UPDATE public.enrolments SET ends_on = greatest(starts_on, v_end), end_reason = 'promoted' WHERE id = r.id;
      PERFORM app.move_enrolment(r.student_id, p_to_class, v_start, NULL);
      v_up := v_up + 1;
    ELSIF r.outcome IN ('detained', 'repeater') THEN
      UPDATE public.enrolments SET ends_on = greatest(starts_on, v_end), end_reason = 'retained' WHERE id = r.id;
      PERFORM app.move_enrolment(r.student_id, coalesce(nullif(trim(p_same_class), ''), p_class), v_start, NULL);
      v_stay := v_stay + 1;
    ELSE
      UPDATE public.enrolments SET ends_on = greatest(starts_on, v_end), end_reason = 'left' WHERE id = r.id;
      UPDATE public.students SET status = 'left', left_on = v_end, leaving_reason = CASE WHEN r.outcome = 'dropout' THEN 'Dropped out' ELSE 'Left at year end' END
        WHERE id = r.student_id;
      v_left := v_left + 1;
    END IF;
  END LOOP;
  RETURN jsonb_build_object('promoted', v_up, 'retained', v_stay, 'left', v_left);
END $$;

-- For the server (service_role cannot reach schema app): the next admission number, and a mid-year move for one
-- student of a school (refused for another school).
CREATE OR REPLACE FUNCTION public.student_next_admission_no(p_school uuid) RETURNS text
  LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp
  AS $$ SELECT app.next_admission_no(p_school) $$;

CREATE OR REPLACE FUNCTION public.student_move(p_school uuid, p_student uuid, p_class text, p_from date, p_reason text) RETURNS uuid
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
  AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.students WHERE id = p_student AND school_id = p_school AND status = 'active') THEN
    RAISE EXCEPTION 'Student not found at this school, or not active' USING ERRCODE = 'P0002';
  END IF;
  RETURN app.move_enrolment(p_student, p_class, p_from, p_reason);
END $$;

-- After the school opens a new session: every login shows the class of the new session.
CREATE OR REPLACE FUNCTION public.student_sync_school(p_school uuid) RETURNS int
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
  AS $$
DECLARE r record; v_n int := 0;
BEGIN
  FOR r IN SELECT id FROM public.students WHERE school_id = p_school AND user_id IS NOT NULL LOOP
    PERFORM app.sync_student_login(r.id);
    v_n := v_n + 1;
  END LOOP;
  RETURN v_n;
END $$;

DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY['student_correct(uuid, uuid, uuid, text, jsonb, text, jsonb)', 'student_renumber(uuid, text, text, text)',
    'student_promote(uuid, text, text, text, text, uuid)', 'student_sync_school(uuid)',
    'student_next_admission_no(uuid)', 'student_move(uuid, uuid, text, date, text)'] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon, authenticated', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO service_role', f);
  END LOOP;
END $$;
REVOKE ALL ON FUNCTION app.move_enrolment(uuid, text, date, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.next_admission_no(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.admission_floor(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.sync_student_login(uuid) FROM PUBLIC;

-- ── Photos ──────────────────────────────────────────────────────────────────
-- Private; read through short-lived links the server signs for people who may see the student.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  VALUES ('student-photos', 'student-photos', false, 5242880, '{image/jpeg,image/png,image/webp}'::text[])
  ON CONFLICT (id) DO NOTHING;

-- ── Bulk import: the register and enrolment history ─────────────────────────

ALTER TABLE public.import_changes DROP CONSTRAINT import_changes_table_name_check;
ALTER TABLE public.import_changes ADD CONSTRAINT import_changes_table_name_check CHECK (table_name IN ('attendance', 'exam_marks',
  'legacy_results', 'fee_structures', 'fee_invoices', 'admission_applicants', 'students', 'enrolments'));

-- Register rows: matched on admission number. A new number adds an entry (no login); an existing one is corrected
-- field by field, blank cells leaving what is stored alone. Aadhaar arrives already encrypted by the server.
CREATE OR REPLACE FUNCTION public.import_students(p_job uuid, p_school uuid, p_actor uuid, p_rows jsonb, p_dry boolean)
  RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
  AS $$
DECLARE v_out jsonb; v_problems jsonb;
BEGIN
  DROP TABLE IF EXISTS pg_temp._r;
  CREATE TEMP TABLE _r ON COMMIT DROP AS
    SELECT x.*, s.id AS cur_id, s.status AS cur_status, to_jsonb(s) AS cur
    FROM jsonb_to_recordset(p_rows) AS x(n int, admission_no text, full_name text, aadhaar_name text, gender text, date_of_birth date,
      pen text, apaar_id text, aadhaar_cipher text, aadhaar_last4 text, aadhaar_hash text, no_aadhaar boolean, cbse_reg_no text, board_roll_no text,
      admitted_on date, admitted_grade int, previous_school text, previous_status text, previous_class text, previous_tc_no text,
      rte_seat boolean, rte_amount numeric, medium text, indian_national boolean)
    LEFT JOIN public.students s ON s.school_id = p_school AND lower(s.admission_no) = lower(x.admission_no);
  ALTER TABLE pg_temp._r ADD COLUMN patch jsonb;
  UPDATE pg_temp._r SET patch = jsonb_strip_nulls(to_jsonb(_r) - ARRAY['n', 'admission_no', 'cur_id', 'cur_status', 'cur', 'patch']) WHERE true;
  ALTER TABLE pg_temp._r ADD COLUMN changed boolean;
  -- The ciphertext differs on every encryption; the hash says whether the number changed.
  UPDATE pg_temp._r SET changed = cur_id IS NOT NULL AND EXISTS (SELECT 1 FROM jsonb_each(patch - 'aadhaar_cipher') p WHERE (cur -> p.key) IS DISTINCT FROM p.value) WHERE true;
  SELECT coalesce(jsonb_agg(jsonb_build_object('n', n, 'error', e) ORDER BY n), '[]') INTO v_problems FROM (
    SELECT n, CASE
      WHEN cur_status = 'cancelled' THEN 'Admission number ' || admission_no || ' was cancelled on the register and cannot be used again.'
      WHEN cur_id IS NULL AND full_name IS NULL THEN 'A new register entry needs a full name.'
      WHEN coalesce(no_aadhaar, (cur ->> 'no_aadhaar')::boolean, false) AND coalesce(aadhaar_last4, cur ->> 'aadhaar_last4') IS NOT NULL
        THEN 'The row says the student has no Aadhaar but also gives a number.'
      WHEN pen IS NOT NULL AND EXISTS (SELECT 1 FROM public.students o WHERE o.school_id = p_school AND o.pen = _r.pen AND o.id IS DISTINCT FROM _r.cur_id)
        THEN 'PEN ' || pen || ' is already on another student.'
      WHEN apaar_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.students o WHERE o.school_id = p_school AND o.apaar_id = _r.apaar_id AND o.id IS DISTINCT FROM _r.cur_id)
        THEN 'APAAR ID ' || apaar_id || ' is already on another student.'
      WHEN aadhaar_hash IS NOT NULL AND EXISTS (SELECT 1 FROM public.students o WHERE o.school_id = p_school AND o.aadhaar_hash = _r.aadhaar_hash
        AND o.status <> 'cancelled' AND o.id IS DISTINCT FROM _r.cur_id)
        THEN 'This Aadhaar number (ending ' || aadhaar_last4 || ') is already on another student.'
    END AS e FROM pg_temp._r) p WHERE e IS NOT NULL;
  SELECT jsonb_build_object('added', count(*) FILTER (WHERE cur_id IS NULL), 'updated', count(*) FILTER (WHERE changed),
    'unchanged', count(*) FILTER (WHERE cur_id IS NOT NULL AND NOT changed), 'problems', v_problems) INTO v_out FROM pg_temp._r;
  IF p_dry OR jsonb_array_length(v_problems) > 0 THEN RETURN v_out; END IF;

  PERFORM set_config('sthara.import_job', p_job::text, true);
  INSERT INTO public.import_changes (job_id, school_id, table_name, row_id, before)
    SELECT p_job, p_school, 'students', s.id, to_jsonb(s) FROM pg_temp._r JOIN public.students s ON s.id = _r.cur_id WHERE _r.changed
    ON CONFLICT (job_id, table_name, row_id) DO NOTHING;
  INSERT INTO public.student_changes (school_id, student_id, field, old_value, new_value, reason, changed_by, changed_by_kind)
    SELECT p_school, r.cur_id, CASE WHEN p.key = 'aadhaar_last4' THEN 'aadhaar' ELSE p.key END,
      left(CASE WHEN p.key = 'aadhaar_last4' THEN 'XXXX XXXX ' || (r.cur ->> p.key) ELSE r.cur ->> p.key END, 400),
      left(CASE WHEN p.key = 'aadhaar_last4' THEN 'XXXX XXXX ' || (p.value #>> '{}') ELSE p.value #>> '{}' END, 400),
      'Bulk import', p_actor, 'import'
    FROM pg_temp._r r, jsonb_each(r.patch) p
    WHERE r.changed AND p.key NOT IN ('aadhaar_cipher', 'aadhaar_hash') AND (r.cur -> p.key) IS DISTINCT FROM p.value;
  UPDATE public.students s SET
    full_name = coalesce(r.full_name, s.full_name), aadhaar_name = coalesce(r.aadhaar_name, s.aadhaar_name), gender = coalesce(r.gender, s.gender),
    date_of_birth = coalesce(r.date_of_birth, s.date_of_birth), pen = coalesce(r.pen, s.pen), apaar_id = coalesce(r.apaar_id, s.apaar_id),
    aadhaar_cipher = CASE WHEN r.no_aadhaar THEN NULL ELSE coalesce(r.aadhaar_cipher, s.aadhaar_cipher) END,
    aadhaar_last4 = CASE WHEN r.no_aadhaar THEN NULL ELSE coalesce(r.aadhaar_last4, s.aadhaar_last4) END,
    aadhaar_hash = CASE WHEN r.no_aadhaar THEN NULL ELSE coalesce(r.aadhaar_hash, s.aadhaar_hash) END,
    no_aadhaar = coalesce(r.no_aadhaar, s.no_aadhaar), cbse_reg_no = coalesce(r.cbse_reg_no, s.cbse_reg_no),
    board_roll_no = coalesce(r.board_roll_no, s.board_roll_no), admitted_on = coalesce(r.admitted_on, s.admitted_on),
    admitted_grade = coalesce(r.admitted_grade, s.admitted_grade), previous_school = coalesce(r.previous_school, s.previous_school),
    previous_status = coalesce(r.previous_status, s.previous_status), previous_class = coalesce(r.previous_class, s.previous_class),
    previous_tc_no = coalesce(r.previous_tc_no, s.previous_tc_no), rte_seat = coalesce(r.rte_seat, s.rte_seat),
    rte_amount = coalesce(r.rte_amount, s.rte_amount), medium = coalesce(r.medium, s.medium),
    indian_national = coalesce(r.indian_national, s.indian_national), import_job_id = p_job
  FROM pg_temp._r r WHERE s.id = r.cur_id AND r.changed;
  INSERT INTO public.students (school_id, admission_no, full_name, aadhaar_name, gender, date_of_birth, pen, apaar_id, aadhaar_cipher,
      aadhaar_last4, aadhaar_hash, no_aadhaar, cbse_reg_no, board_roll_no, admitted_on, admitted_grade, previous_school, previous_status, previous_class,
      previous_tc_no, rte_seat, rte_amount, medium, indian_national, created_by, import_job_id)
    SELECT p_school, trim(admission_no), full_name, aadhaar_name, gender, date_of_birth, pen, apaar_id, aadhaar_cipher, aadhaar_last4,
      aadhaar_hash, coalesce(no_aadhaar, false), cbse_reg_no, board_roll_no, admitted_on, admitted_grade, previous_school, previous_status, previous_class,
      previous_tc_no, coalesce(rte_seat, false), rte_amount, medium, coalesce(indian_national, true), p_actor, p_job
    FROM pg_temp._r WHERE cur_id IS NULL;
  PERFORM app.admission_floor(p_school);
  RETURN v_out;
END $$;

-- Enrolment history: one row per student per session (the class they ended the year in), matched on admission number
-- and session. Rows for the current session are refused (the current class is set in the app); past rows are added
-- closed, or corrected.
CREATE OR REPLACE FUNCTION public.import_enrolments(p_job uuid, p_school uuid, p_actor uuid, p_rows jsonb, p_dry boolean)
  RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
  AS $$
DECLARE v_out jsonb; v_problems jsonb; v_current text := app.current_session(p_school);
BEGIN
  DROP TABLE IF EXISTS pg_temp._r;
  CREATE TEMP TABLE _r ON COMMIT DROP AS
    SELECT x.*, s.id AS sid, s.status AS s_status,
      (SELECT e.id FROM public.enrolments e WHERE e.student_id = s.id AND e.session = x.session ORDER BY e.starts_on DESC LIMIT 1) AS cur_id,
      (SELECT count(*) FROM public.enrolments e WHERE e.student_id = s.id AND e.session = x.session) AS cur_rows
    FROM jsonb_to_recordset(p_rows) AS x(n int, admission_no text, session text, grade int, section text, class_name text, roll_no text,
      stream text, languages jsonb, outcome text)
    LEFT JOIN public.students s ON s.school_id = p_school AND lower(s.admission_no) = lower(x.admission_no);
  ALTER TABLE pg_temp._r ADD COLUMN changed boolean;
  UPDATE pg_temp._r r SET changed = r.cur_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.enrolments e WHERE e.id = r.cur_id AND
    (r.grade, coalesce(r.section, e.section), coalesce(r.class_name, e.class_name), coalesce(r.roll_no, e.roll_no), coalesce(r.stream, e.stream),
     coalesce(r.languages, e.languages), coalesce(r.outcome, e.outcome))
    IS DISTINCT FROM (e.grade, e.section, e.class_name, e.roll_no, e.stream, e.languages, e.outcome)) WHERE true;
  SELECT coalesce(jsonb_agg(jsonb_build_object('n', n, 'error', e) ORDER BY n), '[]') INTO v_problems FROM (
    SELECT n, CASE
      WHEN sid IS NULL THEN 'No student with admission number ' || admission_no || ' on the register. Import the register first.'
      WHEN s_status = 'cancelled' THEN 'Admission number ' || admission_no || ' was cancelled on the register.'
      WHEN session >= v_current THEN 'Only past sessions can be imported here; ' || session || ' is the current session or later.'
      WHEN cur_rows > 1 THEN 'This student has more than one row in ' || session || ' (a mid-year move). Correct it on the student record.'
    END AS e FROM pg_temp._r) p WHERE e IS NOT NULL;
  SELECT jsonb_build_object('added', count(*) FILTER (WHERE cur_id IS NULL), 'updated', count(*) FILTER (WHERE changed),
    'unchanged', count(*) FILTER (WHERE cur_id IS NOT NULL AND NOT changed), 'problems', v_problems) INTO v_out FROM pg_temp._r;
  IF p_dry OR jsonb_array_length(v_problems) > 0 THEN RETURN v_out; END IF;

  PERFORM set_config('sthara.import_job', p_job::text, true);
  INSERT INTO public.import_changes (job_id, school_id, table_name, row_id, before)
    SELECT p_job, p_school, 'enrolments', e.id, to_jsonb(e) FROM pg_temp._r JOIN public.enrolments e ON e.id = _r.cur_id WHERE _r.changed
    ON CONFLICT (job_id, table_name, row_id) DO NOTHING;
  UPDATE public.enrolments e SET grade = r.grade, section = coalesce(r.section, e.section), class_name = coalesce(r.class_name, e.class_name),
      roll_no = coalesce(r.roll_no, e.roll_no), stream = coalesce(r.stream, e.stream), languages = coalesce(r.languages, e.languages),
      outcome = coalesce(r.outcome, e.outcome), finalised_at = CASE WHEN coalesce(r.outcome, e.outcome) IS NOT NULL THEN coalesce(e.finalised_at, now()) END,
      finalised_by = CASE WHEN r.outcome IS NOT NULL AND e.outcome IS NULL THEN p_actor ELSE e.finalised_by END, import_job_id = p_job
    FROM pg_temp._r r WHERE e.id = r.cur_id AND r.changed;
  INSERT INTO public.enrolments (school_id, student_id, session, grade, section, class_name, class_id, roll_no, stream, languages, starts_on, ends_on,
      end_reason, outcome, finalised_at, finalised_by, import_job_id)
    SELECT p_school, r.sid, r.session, r.grade, r.section, coalesce(r.class_name, r.grade::text || coalesce('-' || r.section, '')),
      (SELECT c.id FROM public.classes c WHERE c.school_id = p_school AND app.norm_class(c.name) = app.norm_class(coalesce(r.class_name, r.grade::text || coalesce('-' || r.section, ''))) LIMIT 1),
      r.roll_no, r.stream, coalesce(r.languages, '{}'::jsonb), app.session_starts(p_school, r.session), app.session_ends(p_school, r.session),
      CASE WHEN r.outcome IN ('dropout', 'left') THEN 'left' WHEN r.outcome IN ('detained', 'repeater') THEN 'retained' ELSE 'promoted' END,
      r.outcome, CASE WHEN r.outcome IS NOT NULL THEN now() END, CASE WHEN r.outcome IS NOT NULL THEN p_actor END, p_job
    FROM pg_temp._r r WHERE r.cur_id IS NULL;
  RETURN v_out;
END $$;

-- Undo learns the two new tables: overwritten register and enrolment rows are restored like the others, added
-- enrolment rows are removed, and added register entries are removed unless a login has been linked to them since or
-- they hold enrolment rows the import did not add.
CREATE OR REPLACE FUNCTION public.import_undo(p_job uuid, p_limit int DEFAULT 5000)
  RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
  AS $$
DECLARE
  j public.import_jobs;
  t text;
  v_cols text;
  v_n int;
  v_restored int := 0; v_removed int := 0; v_kept int := 0;
BEGIN
  SELECT * INTO j FROM public.import_jobs WHERE id = p_job FOR UPDATE;
  IF j.id IS NULL OR j.committed_at IS NULL THEN RAISE EXCEPTION 'import % has not been committed', p_job; END IF;
  PERFORM set_config('sthara.import_job', p_job::text, true);

  -- 1. Overwritten rows: restore the before-image, unless the row changed after the import.
  FOREACH t IN ARRAY ARRAY['attendance', 'exam_marks', 'legacy_results', 'fee_structures', 'fee_invoices', 'admission_applicants', 'students', 'enrolments'] LOOP
    SELECT string_agg(format('%I', attname), ', ' ORDER BY attnum) INTO v_cols FROM pg_attribute
      WHERE attrelid = format('public.%I', t)::regclass AND attnum > 0 AND NOT attisdropped AND attname NOT IN ('id', 'updated_at');
    EXECUTE format($q$
      WITH c AS (SELECT id, row_id, before FROM public.import_changes WHERE job_id = $1 AND table_name = %L ORDER BY id LIMIT $2),
      done AS (
        UPDATE public.%I x SET (%s) = (SELECT %s FROM jsonb_populate_record(NULL::public.%I, c.before))
        FROM c WHERE x.id = c.row_id AND x.updated_at <= $3 %s
        RETURNING c.id),
      gone AS (DELETE FROM public.import_changes d USING c WHERE d.id = c.id RETURNING d.id, (d.id IN (SELECT id FROM done)) AS restored)
      SELECT count(*) FILTER (WHERE restored), count(*) FILTER (WHERE NOT restored) FROM gone$q$,
      t, t, v_cols, v_cols, t,
      CASE WHEN t = 'exam_marks' THEN 'AND EXISTS (SELECT 1 FROM public.exam_sheets s WHERE s.id = x.sheet_id AND s.status = ''open'')' ELSE '' END)
      INTO v_n, v_kept USING p_job, p_limit, j.committed_at;
    v_restored := v_restored + coalesce(v_n, 0);
    j.kept := j.kept + coalesce(v_kept, 0);
    IF v_n + v_kept >= p_limit THEN
      UPDATE public.import_jobs SET kept = j.kept WHERE id = p_job;
      RETURN jsonb_build_object('done', false, 'restored', v_restored, 'removed', 0);
    END IF;
  END LOOP;

  -- 2. Added rows: remove them (unless changed since, or still referenced), untagging what is kept.
  FOREACH t IN ARRAY ARRAY['attendance', 'exam_marks', 'legacy_results', 'fee_structures', 'enrolments', 'students', 'admission_applicants', 'fee_invoices'] LOOP
    EXECUTE format($q$
      WITH c AS (SELECT id, updated_at FROM public.%I WHERE import_job_id = $1 LIMIT $2),
      keep AS (
        UPDATE public.%I x SET import_job_id = NULL FROM c
        WHERE x.id = c.id AND (c.updated_at > $3 %s)
        RETURNING x.id),
      del AS (DELETE FROM public.%I x USING c WHERE x.id = c.id AND x.id NOT IN (SELECT id FROM keep) RETURNING x.id)
      SELECT (SELECT count(*) FROM del), (SELECT count(*) FROM keep)$q$,
      t, t,
      CASE t
        WHEN 'exam_marks' THEN 'OR NOT EXISTS (SELECT 1 FROM public.exam_sheets s WHERE s.id = x.sheet_id AND s.status = ''open'')'
        -- A receipt (even a voided one) holds its invoice, and a concession request would go with it.
        WHEN 'fee_invoices' THEN 'OR EXISTS (SELECT 1 FROM public.fee_payments p WHERE p.invoice_id = x.id)
          OR EXISTS (SELECT 1 FROM public.fee_concession_requests r WHERE r.invoice_id = x.id)'
        -- An applicant since enrolled, or with a login request, has a life of its own now.
        WHEN 'admission_applicants' THEN 'OR x.student_id IS NOT NULL OR EXISTS (SELECT 1 FROM public.account_requests r WHERE r.applicant_id = x.id)'
        -- A register entry with a login, or with enrolment rows from elsewhere, stays.
        WHEN 'students' THEN 'OR x.user_id IS NOT NULL OR EXISTS (SELECT 1 FROM public.enrolments e WHERE e.student_id = x.id AND e.import_job_id IS DISTINCT FROM $1)'
        ELSE '' END,
      t)
      INTO v_n, v_kept USING p_job, p_limit, j.committed_at;
    v_removed := v_removed + coalesce(v_n, 0);
    j.kept := j.kept + coalesce(v_kept, 0);
    IF v_n + v_kept >= p_limit THEN
      UPDATE public.import_jobs SET kept = j.kept WHERE id = p_job;
      RETURN jsonb_build_object('done', false, 'restored', v_restored, 'removed', v_removed);
    END IF;
    -- Receipts first, so the invoices they belong to can go.
    IF t = 'admission_applicants' THEN
      WITH c AS (SELECT id FROM public.fee_payments WHERE import_job_id = p_job AND voided_at IS NULL LIMIT p_limit),
      kept AS (UPDATE public.fee_payments p SET import_job_id = NULL FROM c WHERE p.id = c.id AND app.day_closed(p.school_id, p.paid_on) RETURNING p.id),
      v AS (UPDATE public.fee_payments p SET voided_at = now(), void_reason = 'import undone',
            voided_by = (SELECT u.id FROM public.users u WHERE u.id = j.undone_by)
            FROM c WHERE p.id = c.id AND p.id NOT IN (SELECT id FROM kept) RETURNING p.id)
      SELECT (SELECT count(*) FROM v), (SELECT count(*) FROM kept) INTO v_n, v_kept;
      v_removed := v_removed + v_n;
      j.kept := j.kept + v_kept;
      IF v_n + v_kept >= p_limit THEN
        UPDATE public.import_jobs SET kept = j.kept WHERE id = p_job;
        RETURN jsonb_build_object('done', false, 'restored', v_restored, 'removed', v_removed);
      END IF;
    END IF;
  END LOOP;

  UPDATE public.import_jobs SET kept = j.kept WHERE id = p_job;
  RETURN jsonb_build_object('done', true, 'restored', v_restored, 'removed', v_removed);
END $$;

DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY['import_students(uuid, uuid, uuid, jsonb, boolean)', 'import_enrolments(uuid, uuid, uuid, jsonb, boolean)'] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon, authenticated', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO service_role', f);
  END LOOP;
END $$;

-- ── Back-fill ───────────────────────────────────────────────────────────────
-- Every student login gets its register entry and a current-session enrolment row from the cached class, opening on
-- the first day of the session. Earlier years come in through the enrolment-history import.

DO $$
DECLARE u record;
BEGIN
  FOR u IN SELECT id, school_id, name, custom_student_id, student_class, metadata FROM public.users
           WHERE role = 'student' AND school_id IS NOT NULL ORDER BY school_id, created_at, id LOOP
    PERFORM set_config('app.student_sync', '1', true);
    WITH s AS (
      INSERT INTO public.students (school_id, user_id, admission_no, full_name, status, left_on, leaving_reason)
      VALUES (u.school_id, u.id, coalesce(nullif(trim(u.custom_student_id), ''), app.next_admission_no(u.school_id)),
              left(coalesce(nullif(trim(u.name), ''), 'Student'), 120),
              CASE WHEN u.metadata ? 'left' THEN 'left' ELSE 'active' END,
              CASE WHEN u.metadata ? 'left' THEN coalesce(nullif(u.metadata -> 'left' ->> 'on', '')::date, app.school_today()) END,
              left(u.metadata -> 'left' ->> 'reason', 300))
      ON CONFLICT (school_id, lower(admission_no)) DO NOTHING
      RETURNING id)
    INSERT INTO public.enrolments (school_id, student_id, session, grade, section, class_id, class_name, roll_no, starts_on, ends_on, end_reason)
      SELECT u.school_id, s.id, app.current_session(u.school_id), app.grade_from_class(u.student_class), app.section_from_class(u.student_class),
        (SELECT c.id FROM public.classes c WHERE c.school_id = u.school_id AND app.norm_class(c.name) = app.norm_class(u.student_class) ORDER BY c.created_at LIMIT 1),
        nullif(trim(u.student_class), ''), left(nullif(coalesce(u.metadata ->> 'roll_no', u.metadata ->> 'rollNo'), ''), 12),
        app.session_starts(u.school_id, app.current_session(u.school_id)),
        CASE WHEN u.metadata ? 'left' THEN greatest(app.session_starts(u.school_id, app.current_session(u.school_id)), coalesce(nullif(u.metadata -> 'left' ->> 'on', '')::date, app.school_today())) END,
        CASE WHEN u.metadata ? 'left' THEN 'left' END
      FROM s WHERE nullif(trim(u.student_class), '') IS NOT NULL;
  END LOOP;
  PERFORM set_config('app.student_sync', '', true);
  PERFORM app.admission_floor(id) FROM public.schools;
END $$;
