-- The health record — 2026-10-22 (handoff/living-record/03-health.md; decisions recorded there).
--
--   student_health  one current health card per student. The UDISE+ part (blood group, height and weight,
--                   special needs and impairments, disability certificate and percentage, SLD / ASD / ADHD screening)
--                   is kept as a statutory duty. Allergies, conditions and medication need the parent's
--                   health_record consent; the database refuses them without it.
--   health_events   dated entries: annual check-ups and vaccinations. Consent needed for all of them.
--
-- A new office role, Health officer, keeps the record with the principal and the school admin. Teachers see only
-- allergies and alerts, through the server. Withdrawing consent erases the consented part; a student who has left
-- has it erased after the school retention period (default 365 days) unless the parent asked to keep it or a legal
-- hold applies. Every change and erasure is in the audit log.

-- ── Role, permissions, consent type ─────────────────────────────────────────

ALTER TABLE public.role_grants DROP CONSTRAINT role_grants_role_key_check;
ALTER TABLE public.role_grants ADD CONSTRAINT role_grants_role_key_check CHECK (role_key IN ('school_admin', 'principal',
  'vice_principal', 'finance_head', 'accountant', 'cashier', 'admissions_officer', 'hr_manager', 'academic_coordinator',
  'counsellor', 'dpo', 'registrar', 'health_officer'));

INSERT INTO public.role_permissions (role_key, perm) VALUES
  ('school_admin', 'health.read'), ('school_admin', 'health.manage'),
  ('principal', 'health.read'), ('principal', 'health.manage'),
  ('health_officer', 'dashboard.view'), ('health_officer', 'health.read'), ('health_officer', 'health.manage')
  ON CONFLICT DO NOTHING;

ALTER TABLE public.consents DROP CONSTRAINT consents_consent_type_check;
ALTER TABLE public.consents ADD CONSTRAINT consents_consent_type_check CHECK (consent_type IN ('wellness_checkin', 'ai_tutor',
  'data_processing', 'proctoring', 'health_record'));

ALTER TABLE public.student_change_requests DROP CONSTRAINT student_change_requests_kind_check;
ALTER TABLE public.student_change_requests ADD CONSTRAINT student_change_requests_kind_check CHECK (kind IN ('address', 'family', 'emergency', 'health'));

-- Has a verified parent given health consent for this register entry (through the student login)?
CREATE OR REPLACE FUNCTION app.health_consent(p_student uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
  AS $$
  SELECT EXISTS (SELECT 1 FROM public.students s JOIN public.consents c ON c.student_id = s.user_id
                 WHERE s.id = p_student AND c.consent_type = 'health_record' AND c.granted AND c.revoked_at IS NULL)
$$;

-- ── The health card ─────────────────────────────────────────────────────────

CREATE TABLE public.student_health (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL UNIQUE REFERENCES public.students(id) ON DELETE CASCADE,
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  blood_group text CHECK (blood_group IN ('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-')),
  height_cm numeric(5,1) CHECK (height_cm IS NULL OR height_cm BETWEEN 30 AND 250),
  weight_kg numeric(5,1) CHECK (weight_kg IS NULL OR weight_kg BETWEEN 5 AND 250),
  measured_on date,
  cwsn boolean NOT NULL DEFAULT false,
  impairments text[] NOT NULL DEFAULT '{}' CHECK (impairments <@ ARRAY['blindness', 'low_vision', 'hearing', 'speech', 'locomotor',
    'mental_illness', 'specific_learning', 'cerebral_palsy', 'autism', 'multiple', 'intellectual', 'other']::text[]),
  disability_certificate boolean,
  disability_percent smallint CHECK (disability_percent IS NULL OR disability_percent BETWEEN 0 AND 100),
  screening jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(screening) = 'object'),
  allergies jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(allergies) = 'array'),
  conditions jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(conditions) = 'array'),
  medication jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(medication) = 'array'),
  keep_after_leaving boolean NOT NULL DEFAULT false,
  legal_hold boolean NOT NULL DEFAULT false,
  erased_at timestamptz,
  erased_reason text CHECK (erased_reason IS NULL OR length(erased_reason) <= 200),
  import_job_id uuid,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX student_health_school ON public.student_health (school_id);
CREATE INDEX student_health_import_job ON public.student_health (import_job_id) WHERE import_job_id IS NOT NULL;
CREATE TRIGGER trg_touch_student_health BEFORE UPDATE ON public.student_health FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
CREATE TRIGGER trg_audit_student_health AFTER INSERT OR DELETE OR UPDATE ON public.student_health FOR EACH ROW EXECUTE FUNCTION app.audit();

CREATE TABLE public.health_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('checkup', 'vaccination')),
  on_date date NOT NULL CHECK (on_date BETWEEN '1990-01-01' AND '2100-01-01'),
  data jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(data) = 'object'),
  note text CHECK (note IS NULL OR length(note) <= 500),
  recorded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  import_job_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX health_events_student ON public.health_events (student_id, on_date DESC);
CREATE INDEX health_events_import_job ON public.health_events (import_job_id) WHERE import_job_id IS NOT NULL;
CREATE TRIGGER trg_touch_health_events BEFORE UPDATE ON public.health_events FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
CREATE TRIGGER trg_audit_health_events AFTER INSERT OR DELETE OR UPDATE ON public.health_events FOR EACH ROW EXECUTE FUNCTION app.audit();

-- The consented part never lands without consent, whichever path writes it.
CREATE OR REPLACE FUNCTION app.guard_health() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
  AS $$
BEGIN
  IF TG_TABLE_NAME = 'student_health' THEN
    IF (NEW.allergies <> '[]'::jsonb OR NEW.conditions <> '[]'::jsonb OR NEW.medication <> '[]'::jsonb)
       AND (TG_OP = 'INSERT' OR (NEW.allergies, NEW.conditions, NEW.medication) IS DISTINCT FROM (OLD.allergies, OLD.conditions, OLD.medication))
       AND NOT app.health_consent(NEW.student_id) THEN
      RAISE EXCEPTION 'Allergies, conditions and medication need the parent''s health consent' USING ERRCODE = '42501';
    END IF;
  ELSIF (TG_OP = 'INSERT' OR (NEW.kind, NEW.on_date, NEW.data, NEW.note) IS DISTINCT FROM (OLD.kind, OLD.on_date, OLD.data, OLD.note))
        AND NOT app.health_consent(NEW.student_id) THEN
    RAISE EXCEPTION 'Check-ups and vaccinations need the parent''s health consent' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_guard_student_health BEFORE INSERT OR UPDATE ON public.student_health FOR EACH ROW EXECUTE FUNCTION app.guard_health();
CREATE TRIGGER trg_guard_health_events BEFORE INSERT OR UPDATE ON public.health_events FOR EACH ROW EXECUTE FUNCTION app.guard_health();

-- Erases the consented part for one student (consent withdrawn, or retention over). The UDISE+ part stays.
CREATE OR REPLACE FUNCTION app.erase_health(p_student uuid, p_reason text) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
  AS $$
BEGIN
  UPDATE public.student_health SET allergies = '[]', conditions = '[]', medication = '[]', erased_at = now(), erased_reason = left(p_reason, 200)
    WHERE student_id = p_student AND (allergies <> '[]'::jsonb OR conditions <> '[]'::jsonb OR medication <> '[]'::jsonb);
  DELETE FROM public.health_events WHERE student_id = p_student;
END $$;

CREATE OR REPLACE FUNCTION app.on_health_consent() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
  AS $$
BEGIN
  IF NEW.consent_type = 'health_record' AND NOT NEW.granted AND (TG_OP = 'INSERT' OR OLD.granted) THEN
    PERFORM app.erase_health(s.id, 'Health consent withdrawn') FROM public.students s WHERE s.user_id = NEW.student_id;
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER trg_health_consent AFTER INSERT OR UPDATE OF granted ON public.consents FOR EACH ROW EXECUTE FUNCTION app.on_health_consent();

-- Retention: for students who left more than the school period ago (settings.health.retentionDays, default 365).
CREATE OR REPLACE FUNCTION public.health_retention_purge() RETURNS int
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
  AS $$
DECLARE r record; v_n int := 0;
BEGIN
  FOR r IN SELECT s.id FROM public.students s JOIN public.student_health h ON h.student_id = s.id JOIN public.schools sc ON sc.id = s.school_id
           WHERE s.status = 'left' AND s.left_on IS NOT NULL AND NOT h.keep_after_leaving AND NOT h.legal_hold
             AND s.left_on + coalesce(CASE WHEN (sc.settings -> 'health' ->> 'retentionDays') ~ '^\d{1,5}$' THEN (sc.settings -> 'health' ->> 'retentionDays')::int END, 365) < app.school_today()
             AND (h.allergies <> '[]'::jsonb OR h.conditions <> '[]'::jsonb OR h.medication <> '[]'::jsonb
                  OR EXISTS (SELECT 1 FROM public.health_events e WHERE e.student_id = s.id)) LOOP
    PERFORM app.erase_health(r.id, 'Retention period after leaving');
    v_n := v_n + 1;
  END LOOP;
  RETURN v_n;
END $$;
REVOKE ALL ON FUNCTION public.health_retention_purge() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.health_retention_purge() TO service_role;
SELECT cron.schedule('health-retention', '30 20 * * *', $$ SELECT public.health_retention_purge() $$);

-- ── Who reads ───────────────────────────────────────────────────────────────

ALTER TABLE public.student_health ENABLE ROW LEVEL SECURITY;
CREATE POLICY student_health_read ON public.student_health FOR SELECT TO authenticated USING (
  ((SELECT app.has_perm('health.read')) AND school_id = (SELECT app.current_school_id())) OR (SELECT app.is_superadmin()));
GRANT ALL ON public.student_health TO service_role;
GRANT SELECT ON public.student_health TO authenticated;

ALTER TABLE public.health_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY health_events_read ON public.health_events FOR SELECT TO authenticated USING (
  ((SELECT app.has_perm('health.read')) AND school_id = (SELECT app.current_school_id())) OR (SELECT app.is_superadmin()));
GRANT ALL ON public.health_events TO service_role;
GRANT SELECT ON public.health_events TO authenticated;

-- For the server: which register entries have health consent (the check the import and the record make).
CREATE OR REPLACE FUNCTION public.health_consented(p_school uuid, p_students uuid[]) RETURNS SETOF uuid
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
  AS $$
  SELECT s.id FROM public.students s JOIN public.consents c ON c.student_id = s.user_id
  WHERE s.school_id = p_school AND s.id = ANY (p_students) AND c.consent_type = 'health_record' AND c.granted AND c.revoked_at IS NULL
$$;
REVOKE ALL ON FUNCTION public.health_consented(uuid, uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.health_consented(uuid, uuid[]) TO service_role;

-- ── Bulk import ─────────────────────────────────────────────────────────────

ALTER TABLE public.import_changes DROP CONSTRAINT import_changes_table_name_check;
ALTER TABLE public.import_changes ADD CONSTRAINT import_changes_table_name_check CHECK (table_name IN ('attendance', 'exam_marks',
  'legacy_results', 'fee_structures', 'fee_invoices', 'admission_applicants', 'students', 'enrolments', 'family_members', 'student_health'));

-- Health cards: matched on admission number. The UDISE+ part loads for everyone; allergies, conditions and medication
-- only where the parent has given health consent (otherwise they are left out and counted as withheld).
CREATE OR REPLACE FUNCTION public.import_health(p_job uuid, p_school uuid, p_actor uuid, p_rows jsonb, p_dry boolean)
  RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
  AS $$
DECLARE v_out jsonb; v_problems jsonb;
BEGIN
  DROP TABLE IF EXISTS pg_temp._r;
  CREATE TEMP TABLE _r ON COMMIT DROP AS
    SELECT x.*, s.id AS sid, s.status AS s_status, h.id AS cur_id, to_jsonb(h) AS cur, app.health_consent(s.id) AS consent
    FROM jsonb_to_recordset(p_rows) AS x(n int, admission_no text, blood_group text, height_cm numeric, weight_kg numeric, measured_on date,
      cwsn boolean, impairments text[], disability_certificate boolean, disability_percent int, screening jsonb,
      allergies jsonb, conditions jsonb, medication jsonb)
    LEFT JOIN public.students s ON s.school_id = p_school AND lower(s.admission_no) = lower(x.admission_no)
    LEFT JOIN public.student_health h ON h.student_id = s.id;
  ALTER TABLE pg_temp._r ADD COLUMN withheld boolean;
  UPDATE pg_temp._r SET withheld = NOT consent AND (allergies IS NOT NULL OR conditions IS NOT NULL OR medication IS NOT NULL) WHERE true;
  UPDATE pg_temp._r SET allergies = NULL, conditions = NULL, medication = NULL WHERE withheld;
  ALTER TABLE pg_temp._r ADD COLUMN changed boolean;
  UPDATE pg_temp._r SET changed = cur_id IS NOT NULL AND (
    coalesce(blood_group, cur ->> 'blood_group'), coalesce(height_cm, (cur ->> 'height_cm')::numeric), coalesce(weight_kg, (cur ->> 'weight_kg')::numeric),
    coalesce(measured_on, (cur ->> 'measured_on')::date), coalesce(cwsn, (cur ->> 'cwsn')::boolean), coalesce(to_jsonb(impairments), cur -> 'impairments'),
    coalesce(disability_certificate, (cur ->> 'disability_certificate')::boolean), coalesce(disability_percent, (cur ->> 'disability_percent')::int),
    coalesce(screening, cur -> 'screening'), coalesce(allergies, cur -> 'allergies'), coalesce(conditions, cur -> 'conditions'), coalesce(medication, cur -> 'medication'))
    IS DISTINCT FROM (cur ->> 'blood_group', (cur ->> 'height_cm')::numeric, (cur ->> 'weight_kg')::numeric, (cur ->> 'measured_on')::date,
      (cur ->> 'cwsn')::boolean, cur -> 'impairments', (cur ->> 'disability_certificate')::boolean, (cur ->> 'disability_percent')::int,
      cur -> 'screening', cur -> 'allergies', cur -> 'conditions', cur -> 'medication') WHERE true;
  SELECT coalesce(jsonb_agg(jsonb_build_object('n', n, 'error', e) ORDER BY n), '[]') INTO v_problems FROM (
    SELECT n, CASE
      WHEN sid IS NULL THEN 'No student with admission number ' || admission_no || ' on the register. Import the register first.'
      WHEN s_status = 'cancelled' THEN 'Admission number ' || admission_no || ' was cancelled on the register.'
    END AS e FROM pg_temp._r) p WHERE e IS NOT NULL;
  SELECT jsonb_build_object('added', count(*) FILTER (WHERE cur_id IS NULL), 'updated', count(*) FILTER (WHERE changed),
    'unchanged', count(*) FILTER (WHERE cur_id IS NOT NULL AND NOT changed), 'withheld', count(*) FILTER (WHERE withheld),
    'problems', v_problems) INTO v_out FROM pg_temp._r;
  IF p_dry OR jsonb_array_length(v_problems) > 0 THEN RETURN v_out; END IF;

  PERFORM set_config('sthara.import_job', p_job::text, true);
  INSERT INTO public.import_changes (job_id, school_id, table_name, row_id, before)
    SELECT p_job, p_school, 'student_health', h.id, to_jsonb(h) FROM pg_temp._r JOIN public.student_health h ON h.id = _r.cur_id WHERE _r.changed
    ON CONFLICT (job_id, table_name, row_id) DO NOTHING;
  UPDATE public.student_health h SET blood_group = coalesce(r.blood_group, h.blood_group), height_cm = coalesce(r.height_cm, h.height_cm),
      weight_kg = coalesce(r.weight_kg, h.weight_kg), measured_on = coalesce(r.measured_on, h.measured_on), cwsn = coalesce(r.cwsn, h.cwsn),
      impairments = coalesce(r.impairments, h.impairments), disability_certificate = coalesce(r.disability_certificate, h.disability_certificate),
      disability_percent = coalesce(r.disability_percent, h.disability_percent), screening = coalesce(r.screening, h.screening),
      allergies = coalesce(r.allergies, h.allergies), conditions = coalesce(r.conditions, h.conditions), medication = coalesce(r.medication, h.medication),
      updated_by = p_actor, import_job_id = p_job
    FROM pg_temp._r r WHERE h.id = r.cur_id AND r.changed;
  INSERT INTO public.student_health (student_id, school_id, blood_group, height_cm, weight_kg, measured_on, cwsn, impairments, disability_certificate,
      disability_percent, screening, allergies, conditions, medication, updated_by, import_job_id)
    SELECT sid, p_school, blood_group, height_cm, weight_kg, measured_on, coalesce(cwsn, false), coalesce(impairments, '{}'), disability_certificate,
      disability_percent, coalesce(screening, '{}'), coalesce(allergies, '[]'), coalesce(conditions, '[]'), coalesce(medication, '[]'), p_actor, p_job
    FROM pg_temp._r WHERE cur_id IS NULL;
  RETURN v_out;
END $$;

-- Check-ups and vaccinations: added as dated entries (one per student, kind, date and vaccine), only with consent.
CREATE OR REPLACE FUNCTION public.import_health_events(p_job uuid, p_school uuid, p_actor uuid, p_rows jsonb, p_dry boolean)
  RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
  AS $$
DECLARE v_out jsonb; v_problems jsonb;
BEGIN
  DROP TABLE IF EXISTS pg_temp._r;
  CREATE TEMP TABLE _r ON COMMIT DROP AS
    SELECT x.*, s.id AS sid, s.status AS s_status, app.health_consent(s.id) AS consent,
      (SELECT e.id FROM public.health_events e WHERE e.student_id = s.id AND e.kind = x.kind AND e.on_date = x.on_date
         AND coalesce(e.data ->> 'vaccine', '') = coalesce(x.data ->> 'vaccine', '') LIMIT 1) AS cur_id
    FROM jsonb_to_recordset(p_rows) AS x(n int, admission_no text, kind text, on_date date, data jsonb, note text)
    LEFT JOIN public.students s ON s.school_id = p_school AND lower(s.admission_no) = lower(x.admission_no);
  SELECT coalesce(jsonb_agg(jsonb_build_object('n', n, 'error', e) ORDER BY n), '[]') INTO v_problems FROM (
    SELECT n, CASE
      WHEN sid IS NULL THEN 'No student with admission number ' || admission_no || ' on the register. Import the register first.'
      WHEN s_status = 'cancelled' THEN 'Admission number ' || admission_no || ' was cancelled on the register.'
    END AS e FROM pg_temp._r) p WHERE e IS NOT NULL;
  SELECT jsonb_build_object('added', count(*) FILTER (WHERE cur_id IS NULL AND consent), 'updated', 0,
    'unchanged', count(*) FILTER (WHERE cur_id IS NOT NULL AND consent), 'withheld', count(*) FILTER (WHERE NOT consent),
    'problems', v_problems) INTO v_out FROM pg_temp._r;
  IF p_dry OR jsonb_array_length(v_problems) > 0 THEN RETURN v_out; END IF;
  PERFORM set_config('sthara.import_job', p_job::text, true);
  INSERT INTO public.health_events (school_id, student_id, kind, on_date, data, note, recorded_by, import_job_id)
    SELECT p_school, sid, kind, on_date, coalesce(data, '{}'), note, p_actor, p_job FROM pg_temp._r WHERE cur_id IS NULL AND consent;
  RETURN v_out;
END $$;

DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY['import_health(uuid, uuid, uuid, jsonb, boolean)', 'import_health_events(uuid, uuid, uuid, jsonb, boolean)'] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon, authenticated', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO service_role', f);
  END LOOP;
END $$;

-- Undo learns the health tables.
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
  FOREACH t IN ARRAY ARRAY['attendance', 'exam_marks', 'legacy_results', 'fee_structures', 'fee_invoices', 'admission_applicants', 'students',
    'enrolments', 'family_members', 'student_health'] LOOP
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
  FOREACH t IN ARRAY ARRAY['attendance', 'exam_marks', 'legacy_results', 'fee_structures', 'health_events', 'student_health', 'emergency_contacts',
    'family_members', 'enrolments', 'students', 'admission_applicants', 'fee_invoices'] LOOP
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
