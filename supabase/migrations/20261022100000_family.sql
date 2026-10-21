-- Demographics and family on the student record — 2026-10-22 (handoff/living-record/02-demographics-family.md).
--
--   students (more columns)  mother tongue, social category, religion and minority, BPL / AAY / EWS, family income,
--                            current and permanent address, distance from school, and a family code from the import.
--   family_members           mother, father, guardian and others as contacts on the record. A contact links to a
--                            parent login when Sthara issues one (through guardians); the school never creates logins.
--   emergency_contacts       up to 3 per student in calling order: a family member, or someone else.
--   sibling_links            pairs of students suggested as siblings (shared parent phone, login or family code);
--                            the registrar confirms or rejects.
--   student_change_requests  parents propose changes to family and contact details; the registrar decides.
--
-- Every change keeps history (student_changes for the register columns, the audit log for the rest).

-- ── Demographics on the register ────────────────────────────────────────────

ALTER TABLE public.students
  ADD COLUMN mother_tongue text CHECK (mother_tongue IS NULL OR length(mother_tongue) <= 40),
  ADD COLUMN social_category text CHECK (social_category IN ('general', 'sc', 'st', 'obc')),
  ADD COLUMN religion text CHECK (religion IN ('hindu', 'muslim', 'christian', 'sikh', 'buddhist', 'parsi', 'jain', 'other')),
  ADD COLUMN minority boolean,
  ADD COLUMN bpl boolean,
  ADD COLUMN aay boolean,
  ADD COLUMN ews boolean,
  ADD COLUMN family_income numeric(12,2) CHECK (family_income IS NULL OR family_income >= 0),
  ADD COLUMN address jsonb CHECK (address IS NULL OR jsonb_typeof(address) = 'object'),
  ADD COLUMN permanent_address jsonb CHECK (permanent_address IS NULL OR jsonb_typeof(permanent_address) = 'object'),
  ADD COLUMN permanent_same boolean NOT NULL DEFAULT true,
  ADD COLUMN distance_km numeric(6,2) CHECK (distance_km IS NULL OR distance_km BETWEEN 0 AND 500),
  ADD COLUMN family_code text CHECK (family_code IS NULL OR length(family_code) BETWEEN 1 AND 40);
CREATE INDEX students_family_code ON public.students (school_id, lower(family_code)) WHERE family_code IS NOT NULL;

GRANT SELECT (mother_tongue, social_category, religion, minority, bpl, aay, ews, family_income, address, permanent_address,
  permanent_same, distance_km, family_code) ON public.students TO authenticated;

-- One correction function for every register column: the allow-list is the only place a field is named, and the
-- update builds itself from it (no column-by-column CASE to keep in step). Replaces the 01 version.
CREATE OR REPLACE FUNCTION public.student_correct(p_student uuid, p_school uuid, p_actor uuid, p_kind text, p_patch jsonb, p_reason text, p_masked jsonb DEFAULT '{}')
  RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
  AS $$
DECLARE
  v_old jsonb; f text; v_n int := 0; v_cols text;
  v_fields text[] := ARRAY['admission_no', 'full_name', 'aadhaar_name', 'gender', 'date_of_birth', 'pen', 'apaar_id', 'aadhaar_cipher',
    'aadhaar_hash', 'aadhaar_last4', 'no_aadhaar', 'cbse_reg_no', 'board_roll_no', 'admitted_on', 'admitted_grade', 'previous_school',
    'previous_status', 'previous_class', 'previous_tc_no', 'rte_seat', 'rte_amount', 'medium', 'indian_national', 'photo_path',
    'mother_tongue', 'social_category', 'religion', 'minority', 'bpl', 'aay', 'ews', 'family_income', 'address', 'permanent_address',
    'permanent_same', 'distance_km', 'family_code'];
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
  SELECT string_agg(format('%I', k), ', ') INTO v_cols FROM jsonb_object_keys(p_patch) k;
  EXECUTE format('UPDATE public.students s SET (%s) = (SELECT %s FROM jsonb_populate_record(s, $1)) WHERE s.id = $2', v_cols, v_cols)
    USING p_patch, p_student;
  IF p_patch ? 'admission_no' THEN PERFORM app.admission_floor(p_school); END IF;
  RETURN v_n;
END $$;
REVOKE ALL ON FUNCTION public.student_correct(uuid, uuid, uuid, text, jsonb, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.student_correct(uuid, uuid, uuid, text, jsonb, text, jsonb) TO service_role;

-- ── Family ──────────────────────────────────────────────────────────────────

-- Indian mobile numbers compare on their last 10 digits.
CREATE OR REPLACE FUNCTION app.phone_key(t text) RETURNS text
  LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, pg_temp
  AS $$ SELECT nullif(right(regexp_replace(coalesce(t, ''), '\D', '', 'g'), 10), '') $$;

CREATE TABLE public.family_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  relation text NOT NULL CHECK (relation IN ('mother', 'father', 'guardian', 'grandparent', 'sibling', 'other')),
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 120),
  phone text CHECK (phone IS NULL OR phone ~ '^\+?\d{10,13}$'),
  email text CHECK (email IS NULL OR (length(email) <= 160 AND email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')),
  education text CHECK (education IN ('none', 'primary', 'upper_primary', 'secondary', 'higher_secondary', 'graduate', 'post_graduate', 'other')),
  occupation text CHECK (occupation IS NULL OR length(occupation) <= 80),
  annual_income numeric(12,2) CHECK (annual_income IS NULL OR annual_income >= 0),
  is_primary boolean NOT NULL DEFAULT false,
  lives_with boolean NOT NULL DEFAULT true,
  user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  import_job_id uuid,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX family_members_student ON public.family_members (student_id);
CREATE INDEX family_members_phone ON public.family_members (school_id, app.phone_key(phone)) WHERE phone IS NOT NULL;
CREATE INDEX family_members_user ON public.family_members (user_id) WHERE user_id IS NOT NULL;
CREATE INDEX family_members_import_job ON public.family_members (import_job_id) WHERE import_job_id IS NOT NULL;
-- One primary contact per student.
CREATE UNIQUE INDEX family_members_primary ON public.family_members (student_id) WHERE is_primary;
CREATE TRIGGER trg_touch_family_members BEFORE UPDATE ON public.family_members FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
CREATE TRIGGER trg_audit_family_members AFTER INSERT OR DELETE OR UPDATE ON public.family_members FOR EACH ROW EXECUTE FUNCTION app.audit();

CREATE TABLE public.emergency_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  position smallint NOT NULL CHECK (position BETWEEN 1 AND 3),
  family_member_id uuid REFERENCES public.family_members(id) ON DELETE CASCADE,
  name text CHECK (name IS NULL OR length(trim(name)) BETWEEN 1 AND 120),
  relation text CHECK (relation IS NULL OR length(relation) <= 40),
  phone text CHECK (phone IS NULL OR phone ~ '^\+?\d{10,13}$'),
  CHECK (family_member_id IS NOT NULL OR (name IS NOT NULL AND phone IS NOT NULL)),
  import_job_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_id, position) DEFERRABLE INITIALLY DEFERRED
);
CREATE INDEX emergency_contacts_import_job ON public.emergency_contacts (import_job_id) WHERE import_job_id IS NOT NULL;
CREATE TRIGGER trg_touch_emergency_contacts BEFORE UPDATE ON public.emergency_contacts FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
CREATE TRIGGER trg_audit_emergency_contacts AFTER INSERT OR DELETE OR UPDATE ON public.emergency_contacts FOR EACH ROW EXECUTE FUNCTION app.audit();

CREATE TABLE public.sibling_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  a uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  b uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  CHECK (a < b),
  status text NOT NULL DEFAULT 'suggested' CHECK (status IN ('suggested', 'confirmed', 'rejected')),
  source text NOT NULL CHECK (source IN ('phone', 'login', 'family_code', 'office')),
  decided_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (a, b)
);
CREATE INDEX sibling_links_b ON public.sibling_links (b);
CREATE INDEX sibling_links_open ON public.sibling_links (school_id) WHERE status = 'suggested';
CREATE TRIGGER trg_touch_sibling_links BEFORE UPDATE ON public.sibling_links FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
CREATE TRIGGER trg_audit_sibling_links AFTER INSERT OR DELETE OR UPDATE ON public.sibling_links FOR EACH ROW EXECUTE FUNCTION app.audit('status');

CREATE TABLE public.student_change_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  requested_by uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('address', 'family', 'emergency')),
  target_id uuid,
  proposed jsonb NOT NULL CHECK (jsonb_typeof(proposed) = 'object'),
  note text CHECK (note IS NULL OR length(note) <= 300),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'withdrawn')),
  decided_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  decided_at timestamptz,
  decision_note text CHECK (decision_note IS NULL OR length(decision_note) <= 300),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX student_change_requests_open ON public.student_change_requests (school_id, created_at) WHERE status = 'pending';
CREATE INDEX student_change_requests_student ON public.student_change_requests (student_id, created_at DESC);
CREATE TRIGGER trg_touch_student_change_requests BEFORE UPDATE ON public.student_change_requests FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
CREATE TRIGGER trg_audit_student_change_requests AFTER INSERT OR UPDATE ON public.student_change_requests FOR EACH ROW EXECUTE FUNCTION app.audit('status');

-- ── Who reads ───────────────────────────────────────────────────────────────
-- Screens read through the server. For completeness: register readers of the school, and a verified parent of the
-- student for the family and emergency rows and their own requests.

CREATE OR REPLACE FUNCTION app.parent_of_student(p_student uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
  AS $$
  SELECT EXISTS (SELECT 1 FROM public.students s JOIN public.guardians g ON g.student_id = s.user_id
                 WHERE s.id = p_student AND g.parent_id = auth.uid() AND g.verified)
$$;

ALTER TABLE public.family_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY family_members_read ON public.family_members FOR SELECT TO authenticated USING (
  ((SELECT app.has_perm('students.read')) AND school_id = (SELECT app.current_school_id())) OR app.parent_of_student(student_id) OR (SELECT app.is_superadmin()));
GRANT ALL ON public.family_members TO service_role;
GRANT SELECT ON public.family_members TO authenticated;

ALTER TABLE public.emergency_contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY emergency_contacts_read ON public.emergency_contacts FOR SELECT TO authenticated USING (
  ((SELECT app.has_perm('students.read')) AND school_id = (SELECT app.current_school_id())) OR app.parent_of_student(student_id) OR (SELECT app.is_superadmin()));
GRANT ALL ON public.emergency_contacts TO service_role;
GRANT SELECT ON public.emergency_contacts TO authenticated;

ALTER TABLE public.sibling_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY sibling_links_read ON public.sibling_links FOR SELECT TO authenticated USING (
  ((SELECT app.has_perm('students.read')) AND school_id = (SELECT app.current_school_id())) OR (SELECT app.is_superadmin()));
GRANT ALL ON public.sibling_links TO service_role;
GRANT SELECT ON public.sibling_links TO authenticated;

ALTER TABLE public.student_change_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY student_change_requests_read ON public.student_change_requests FOR SELECT TO authenticated USING (
  ((SELECT app.has_perm('students.read')) AND school_id = (SELECT app.current_school_id())) OR requested_by = (SELECT auth.uid()) OR (SELECT app.is_superadmin()));
GRANT ALL ON public.student_change_requests TO service_role;
GRANT SELECT ON public.student_change_requests TO authenticated;

-- ── Siblings ────────────────────────────────────────────────────────────────

-- Suggests siblings for one student: other students of the school sharing a family phone, a parent login or the
-- family code. A pair the registrar already decided is left alone.
CREATE OR REPLACE FUNCTION app.suggest_siblings(p_student uuid) RETURNS int
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
  AS $$
DECLARE v_n int;
BEGIN
  WITH me AS (SELECT id, school_id, family_code FROM public.students WHERE id = p_student AND status <> 'cancelled'),
  hits AS (
    SELECT o.student_id AS other, 'phone' AS source FROM me
      JOIN public.family_members f ON f.student_id = me.id AND f.phone IS NOT NULL AND f.relation <> 'sibling'
      JOIN public.family_members o ON o.school_id = me.school_id AND app.phone_key(o.phone) = app.phone_key(f.phone) AND o.student_id <> me.id AND o.relation <> 'sibling'
    UNION
    SELECT o.student_id, 'login' FROM me
      JOIN public.family_members f ON f.student_id = me.id AND f.user_id IS NOT NULL
      JOIN public.family_members o ON o.user_id = f.user_id AND o.student_id <> me.id
    UNION
    SELECT s.id, 'family_code' FROM me JOIN public.students s ON s.school_id = me.school_id AND me.family_code IS NOT NULL
      AND lower(s.family_code) = lower(me.family_code) AND s.id <> me.id AND s.status <> 'cancelled'),
  best AS (SELECT DISTINCT ON (other) other, source FROM hits ORDER BY other, CASE source WHEN 'login' THEN 1 WHEN 'family_code' THEN 2 ELSE 3 END)
  INSERT INTO public.sibling_links (school_id, a, b, source)
    SELECT me.school_id, least(me.id, best.other), greatest(me.id, best.other), best.source FROM me, best
    ON CONFLICT (a, b) DO NOTHING;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END $$;

CREATE OR REPLACE FUNCTION app.on_family_change() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
  AS $$
BEGIN
  IF app.importing() THEN RETURN NULL; END IF;  -- an import suggests once, at the end of each chunk
  PERFORM app.suggest_siblings(NEW.student_id);
  RETURN NULL;
END $$;
CREATE TRIGGER trg_family_siblings AFTER INSERT OR UPDATE OF phone, user_id ON public.family_members FOR EACH ROW EXECUTE FUNCTION app.on_family_change();

CREATE OR REPLACE FUNCTION app.on_family_code_change() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
  AS $$
BEGIN
  IF app.importing() THEN RETURN NULL; END IF;
  PERFORM app.suggest_siblings(NEW.id);
  RETURN NULL;
END $$;
CREATE TRIGGER trg_student_family_code AFTER UPDATE OF family_code ON public.students FOR EACH ROW
  WHEN (NEW.family_code IS NOT NULL AND NEW.family_code IS DISTINCT FROM OLD.family_code) EXECUTE FUNCTION app.on_family_code_change();

-- ── Parent logins ───────────────────────────────────────────────────────────
-- A parent login linked to a student (guardians) becomes, or links to, a family contact: matched by email, else
-- added from the login. Unlinking the login leaves the contact (it is the family, not the account).

CREATE OR REPLACE FUNCTION app.link_guardian_family(p_parent uuid, p_student_user uuid, p_relationship text) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
  AS $$
DECLARE s public.students; p public.users; v_rel text; v_id uuid;
BEGIN
  SELECT * INTO s FROM public.students WHERE user_id = p_student_user;
  SELECT * INTO p FROM public.users WHERE id = p_parent;
  IF s.id IS NULL OR p.id IS NULL THEN RETURN; END IF;
  IF EXISTS (SELECT 1 FROM public.family_members WHERE student_id = s.id AND user_id = p.id) THEN RETURN; END IF;
  v_rel := CASE WHEN lower(coalesce(p_relationship, '')) IN ('mother', 'father', 'guardian', 'grandparent') THEN lower(p_relationship) ELSE 'guardian' END;
  SELECT id INTO v_id FROM public.family_members
    WHERE student_id = s.id AND user_id IS NULL AND p.email IS NOT NULL AND lower(email) = lower(p.email) LIMIT 1;
  IF v_id IS NOT NULL THEN
    UPDATE public.family_members SET user_id = p.id WHERE id = v_id;
  ELSE
    INSERT INTO public.family_members (school_id, student_id, relation, name, email, user_id, is_primary)
      VALUES (s.school_id, s.id, v_rel, left(coalesce(nullif(trim(p.name), ''), 'Parent'), 120),
              CASE WHEN p.email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN left(p.email, 160) END, p.id,
              NOT EXISTS (SELECT 1 FROM public.family_members WHERE student_id = s.id AND is_primary));
  END IF;
END $$;

CREATE OR REPLACE FUNCTION app.on_guardian_link() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
  AS $$
BEGIN
  PERFORM app.link_guardian_family(NEW.parent_id, NEW.student_id, NEW.relationship);
  RETURN NULL;
END $$;
CREATE TRIGGER trg_guardian_family AFTER INSERT ON public.guardians FOR EACH ROW EXECUTE FUNCTION app.on_guardian_link();

-- ── Bulk import: family and emergency contacts ──────────────────────────────

ALTER TABLE public.import_changes DROP CONSTRAINT import_changes_table_name_check;
ALTER TABLE public.import_changes ADD CONSTRAINT import_changes_table_name_check CHECK (table_name IN ('attendance', 'exam_marks',
  'legacy_results', 'fee_structures', 'fee_invoices', 'admission_applicants', 'students', 'enrolments', 'family_members'));

-- One row per family member: matched on admission number, relation and name. emergency (1 to 3) puts them at that
-- place in the calling order; family_code goes on the student. Siblings are suggested for every student the chunk
-- touched once it is written.
CREATE OR REPLACE FUNCTION public.import_family(p_job uuid, p_school uuid, p_actor uuid, p_rows jsonb, p_dry boolean)
  RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
  AS $$
DECLARE v_out jsonb; v_problems jsonb; v_sid uuid;
BEGIN
  DROP TABLE IF EXISTS pg_temp._r;
  CREATE TEMP TABLE _r ON COMMIT DROP AS
    SELECT x.*, s.id AS sid, s.status AS s_status, s.family_code AS cur_code,
      (SELECT f.id FROM public.family_members f WHERE f.student_id = s.id AND f.relation = x.relation AND lower(f.name) = lower(x.name) LIMIT 1) AS cur_id
    FROM jsonb_to_recordset(p_rows) AS x(n int, admission_no text, relation text, name text, phone text, email text, education text,
      occupation text, annual_income numeric, is_primary boolean, lives_with boolean, emergency int, family_code text)
    LEFT JOIN public.students s ON s.school_id = p_school AND lower(s.admission_no) = lower(x.admission_no);
  ALTER TABLE pg_temp._r ADD COLUMN changed boolean;
  UPDATE pg_temp._r r SET changed = r.cur_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.family_members f WHERE f.id = r.cur_id AND
    (coalesce(r.phone, f.phone), coalesce(r.email, f.email), coalesce(r.education, f.education), coalesce(r.occupation, f.occupation),
     coalesce(r.annual_income, f.annual_income), coalesce(r.is_primary, f.is_primary), coalesce(r.lives_with, f.lives_with))
    IS DISTINCT FROM (f.phone, f.email, f.education, f.occupation, f.annual_income, f.is_primary, f.lives_with)) WHERE true;
  SELECT coalesce(jsonb_agg(jsonb_build_object('n', n, 'error', e) ORDER BY n), '[]') INTO v_problems FROM (
    SELECT n, CASE
      WHEN sid IS NULL THEN 'No student with admission number ' || admission_no || ' on the register. Import the register first.'
      WHEN s_status = 'cancelled' THEN 'Admission number ' || admission_no || ' was cancelled on the register.'
      WHEN is_primary AND EXISTS (SELECT 1 FROM pg_temp._r o WHERE o.sid = _r.sid AND o.is_primary AND o.n < _r.n)
        THEN 'Two primary contacts for the same student in this file. Keep one.'
      WHEN emergency IS NOT NULL AND EXISTS (SELECT 1 FROM pg_temp._r o WHERE o.sid = _r.sid AND o.emergency = _r.emergency AND o.n < _r.n)
        THEN 'Two people are emergency contact ' || emergency || ' for the same student in this file.'
    END AS e FROM pg_temp._r) p WHERE e IS NOT NULL;
  SELECT jsonb_build_object('added', count(*) FILTER (WHERE cur_id IS NULL), 'updated', count(*) FILTER (WHERE changed),
    'unchanged', count(*) FILTER (WHERE cur_id IS NOT NULL AND NOT changed), 'problems', v_problems) INTO v_out FROM pg_temp._r;
  IF p_dry OR jsonb_array_length(v_problems) > 0 THEN RETURN v_out; END IF;

  PERFORM set_config('sthara.import_job', p_job::text, true);
  INSERT INTO public.import_changes (job_id, school_id, table_name, row_id, before)
    SELECT p_job, p_school, 'family_members', f.id, to_jsonb(f) FROM pg_temp._r JOIN public.family_members f ON f.id = _r.cur_id WHERE _r.changed
    ON CONFLICT (job_id, table_name, row_id) DO NOTHING;
  -- A new primary contact in the file takes over from the one on file.
  UPDATE public.family_members f SET is_primary = false
    WHERE f.is_primary AND f.student_id IN (SELECT sid FROM pg_temp._r WHERE is_primary) AND f.id NOT IN (SELECT cur_id FROM pg_temp._r WHERE is_primary AND cur_id IS NOT NULL);
  UPDATE public.family_members f SET phone = coalesce(r.phone, f.phone), email = coalesce(r.email, f.email), education = coalesce(r.education, f.education),
      occupation = coalesce(r.occupation, f.occupation), annual_income = coalesce(r.annual_income, f.annual_income),
      is_primary = coalesce(r.is_primary, f.is_primary), lives_with = coalesce(r.lives_with, f.lives_with), import_job_id = p_job
    FROM pg_temp._r r WHERE f.id = r.cur_id AND r.changed;
  WITH ins AS (
    INSERT INTO public.family_members (school_id, student_id, relation, name, phone, email, education, occupation, annual_income, is_primary, lives_with, created_by, import_job_id)
      SELECT p_school, sid, relation, name, phone, email, education, occupation, annual_income, coalesce(is_primary, false), coalesce(lives_with, true), p_actor, p_job
      FROM pg_temp._r WHERE cur_id IS NULL
      RETURNING id, student_id, relation, name)
  UPDATE pg_temp._r r SET cur_id = ins.id FROM ins WHERE r.cur_id IS NULL AND r.sid = ins.student_id AND r.relation = ins.relation AND lower(r.name) = lower(ins.name);
  -- Emergency places: the person at a place is replaced (calling order follows the file).
  DELETE FROM public.emergency_contacts e USING pg_temp._r r WHERE r.emergency IS NOT NULL AND e.student_id = r.sid AND e.position = r.emergency;
  INSERT INTO public.emergency_contacts (school_id, student_id, position, family_member_id, import_job_id)
    SELECT p_school, sid, emergency, cur_id, p_job FROM pg_temp._r WHERE emergency IS NOT NULL;
  UPDATE public.students s SET family_code = r.family_code
    FROM (SELECT DISTINCT ON (sid) sid, family_code FROM pg_temp._r WHERE family_code IS NOT NULL ORDER BY sid, n) r
    WHERE s.id = r.sid AND s.family_code IS DISTINCT FROM r.family_code;
  FOR v_sid IN SELECT DISTINCT sid FROM pg_temp._r LOOP PERFORM app.suggest_siblings(v_sid); END LOOP;
  RETURN v_out;
END $$;
REVOKE ALL ON FUNCTION public.import_family(uuid, uuid, uuid, jsonb, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.import_family(uuid, uuid, uuid, jsonb, boolean) TO service_role;

-- Undo learns family_members (emergency rows the import made go with their family member, or are removed by job).
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
  FOREACH t IN ARRAY ARRAY['attendance', 'exam_marks', 'legacy_results', 'fee_structures', 'fee_invoices', 'admission_applicants', 'students', 'enrolments', 'family_members'] LOOP
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
  FOREACH t IN ARRAY ARRAY['attendance', 'exam_marks', 'legacy_results', 'fee_structures', 'emergency_contacts', 'family_members', 'enrolments', 'students', 'admission_applicants', 'fee_invoices'] LOOP
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
        -- A family member linked to a parent login since stays.
        WHEN 'family_members' THEN 'OR x.user_id IS NOT NULL'
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

-- The register import learns the demographic and address columns too.
CREATE OR REPLACE FUNCTION public.import_students(p_job uuid, p_school uuid, p_actor uuid, p_rows jsonb, p_dry boolean)
  RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
  AS $$
DECLARE v_out jsonb; v_problems jsonb; v_cols text;
BEGIN
  DROP TABLE IF EXISTS pg_temp._r;
  CREATE TEMP TABLE _r ON COMMIT DROP AS
    SELECT x.n, x.admission_no, x.row, s.id AS cur_id, s.status AS cur_status, to_jsonb(s) AS cur
    FROM (SELECT (e ->> 'n')::int AS n, e ->> 'admission_no' AS admission_no, jsonb_strip_nulls(e - 'n' - 'admission_no') AS row
          FROM jsonb_array_elements(p_rows) e) x
    LEFT JOIN public.students s ON s.school_id = p_school AND lower(s.admission_no) = lower(x.admission_no);
  ALTER TABLE pg_temp._r ADD COLUMN changed boolean;
  -- The ciphertext differs on every encryption; the hash says whether the number changed.
  UPDATE pg_temp._r SET changed = cur_id IS NOT NULL AND EXISTS (SELECT 1 FROM jsonb_each(row - 'aadhaar_cipher') p WHERE (cur -> p.key) IS DISTINCT FROM p.value) WHERE true;
  SELECT coalesce(jsonb_agg(jsonb_build_object('n', n, 'error', e) ORDER BY n), '[]') INTO v_problems FROM (
    SELECT n, CASE
      WHEN EXISTS (SELECT 1 FROM jsonb_object_keys(row) k WHERE k NOT IN ('full_name', 'aadhaar_name', 'gender', 'date_of_birth', 'pen', 'apaar_id',
        'aadhaar_cipher', 'aadhaar_last4', 'aadhaar_hash', 'no_aadhaar', 'cbse_reg_no', 'board_roll_no', 'admitted_on', 'admitted_grade', 'previous_school',
        'previous_status', 'previous_class', 'previous_tc_no', 'rte_seat', 'rte_amount', 'medium', 'indian_national', 'mother_tongue', 'social_category',
        'religion', 'minority', 'bpl', 'aay', 'ews', 'family_income', 'address', 'permanent_address', 'permanent_same', 'distance_km', 'family_code'))
        THEN 'The row has a field the register does not hold.'
      WHEN cur_status = 'cancelled' THEN 'Admission number ' || admission_no || ' was cancelled on the register and cannot be used again.'
      WHEN cur_id IS NULL AND NOT row ? 'full_name' THEN 'A new register entry needs a full name.'
      WHEN (row ->> 'no_aadhaar')::boolean IS TRUE AND row ? 'aadhaar_last4' THEN 'The row says the student has no Aadhaar but also gives a number.'
      WHEN row ? 'pen' AND EXISTS (SELECT 1 FROM public.students o WHERE o.school_id = p_school AND o.pen = _r.row ->> 'pen' AND o.id IS DISTINCT FROM _r.cur_id)
        THEN 'PEN ' || (row ->> 'pen') || ' is already on another student.'
      WHEN row ? 'apaar_id' AND EXISTS (SELECT 1 FROM public.students o WHERE o.school_id = p_school AND o.apaar_id = _r.row ->> 'apaar_id' AND o.id IS DISTINCT FROM _r.cur_id)
        THEN 'APAAR ID ' || (row ->> 'apaar_id') || ' is already on another student.'
      WHEN row ? 'aadhaar_hash' AND EXISTS (SELECT 1 FROM public.students o WHERE o.school_id = p_school AND o.aadhaar_hash = _r.row ->> 'aadhaar_hash'
        AND o.status <> 'cancelled' AND o.id IS DISTINCT FROM _r.cur_id)
        THEN 'This Aadhaar number (ending ' || (row ->> 'aadhaar_last4') || ') is already on another student.'
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
    FROM pg_temp._r r, jsonb_each(r.row) p
    WHERE r.changed AND p.key NOT IN ('aadhaar_cipher', 'aadhaar_hash') AND (r.cur -> p.key) IS DISTINCT FROM p.value;
  -- "No Aadhaar" clears any number on file.
  UPDATE pg_temp._r SET row = row || '{"aadhaar_cipher": null, "aadhaar_last4": null, "aadhaar_hash": null}'::jsonb
    WHERE (row ->> 'no_aadhaar')::boolean IS TRUE;
  UPDATE pg_temp._r SET row = row || jsonb_build_object('import_job_id', p_job) WHERE changed;
  -- Each changed row updates the columns it carries (blank cells were dropped and leave what is stored alone).
  FOR v_cols IN SELECT DISTINCT (SELECT string_agg(format('%I', k), ', ' ORDER BY k) FROM jsonb_object_keys(row) k) FROM pg_temp._r WHERE changed LOOP
    EXECUTE format('UPDATE public.students s SET (%s) = (SELECT %s FROM jsonb_populate_record(s, r.row)) FROM pg_temp._r r
      WHERE s.id = r.cur_id AND r.changed AND (SELECT string_agg(format(''%%I'', k), '', '' ORDER BY k) FROM jsonb_object_keys(r.row) k) = $1', v_cols, v_cols)
      USING v_cols;
  END LOOP;
  INSERT INTO public.students SELECT (jsonb_populate_record(NULL::public.students,
      jsonb_build_object('id', gen_random_uuid(), 'school_id', p_school, 'admission_no', trim(r.admission_no), 'status', 'active', 'no_aadhaar', false,
        'rte_seat', false, 'indian_national', true, 'permanent_same', true, 'created_by', p_actor, 'import_job_id', p_job,
        'created_at', now(), 'updated_at', now()) || r.row)).*
    FROM pg_temp._r r WHERE r.cur_id IS NULL;
  PERFORM app.admission_floor(p_school);
  RETURN v_out;
END $$;
REVOKE ALL ON FUNCTION public.import_students(uuid, uuid, uuid, jsonb, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.import_students(uuid, uuid, uuid, jsonb, boolean) TO service_role;

-- ── Back-fill ───────────────────────────────────────────────────────────────
-- Parent logins already linked to students become family contacts; then siblings are suggested school by school.

DO $$
DECLARE g record;
BEGIN
  FOR g IN SELECT parent_id, student_id, relationship FROM public.guardians ORDER BY created_at LOOP
    PERFORM app.link_guardian_family(g.parent_id, g.student_id, g.relationship);
  END LOOP;
END $$;
