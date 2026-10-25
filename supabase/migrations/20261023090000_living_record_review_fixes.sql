-- Living Record review fixes (PR 36 review, 2026-10-23).
--  1. Undoing a register import no longer deletes a student who has records of their own since (family, emergency
--     contacts, health, change requests, confirmed siblings): those cascade from students.
--  2. The family import keeps what it replaces: an emergency place is now updated in place (its before-image saved), and a
--     primary contact it takes over from is remembered, so undo puts both back.
--  3. The register import refuses the same Aadhaar, PEN or APAAR ID on two rows of one chunk (the database's unique
--     index used to catch it at commit and roll the whole file back).
--  4. Parents read the register, enrolment and past results only through a verified guardian link, as everywhere else.

-- ── 4. Verified guardians only ──────────────────────────────────────────────

DROP POLICY students_read ON public.students;
CREATE POLICY students_read ON public.students FOR SELECT TO authenticated USING (
  ((SELECT app.has_perm('students.read')) AND school_id = (SELECT app.current_school_id()))
  OR user_id = (SELECT auth.uid())
  OR EXISTS (SELECT 1 FROM public.guardians g WHERE g.student_id = students.user_id AND g.parent_id = (SELECT auth.uid()) AND g.verified)
  OR (SELECT app.is_superadmin()));

DROP POLICY enrolments_read ON public.enrolments;
CREATE POLICY enrolments_read ON public.enrolments FOR SELECT TO authenticated USING (
  ((SELECT app.has_perm('students.read')) AND school_id = (SELECT app.current_school_id()))
  OR EXISTS (SELECT 1 FROM public.students s WHERE s.id = enrolments.student_id AND (s.user_id = (SELECT auth.uid())
     OR EXISTS (SELECT 1 FROM public.guardians g WHERE g.student_id = s.user_id AND g.parent_id = (SELECT auth.uid()) AND g.verified)))
  OR (SELECT app.is_superadmin()));

DROP POLICY legacy_results_read ON public.legacy_results;
CREATE POLICY legacy_results_read ON public.legacy_results FOR SELECT TO authenticated USING (
  ((SELECT app.has_perm('exams.read')) AND school_id = (SELECT app.current_school_id()))
  OR student_id = (SELECT auth.uid())
  OR EXISTS (SELECT 1 FROM public.guardians g WHERE g.student_id = legacy_results.student_id AND g.parent_id = (SELECT auth.uid()) AND g.verified)
  OR (SELECT app.is_superadmin()));

-- ── 2. The family import saves what it replaces ─────────────────────────────

-- 'family_primary' rows remember a primary contact the import took over from (row_id = that family member);
-- 'emergency_contacts' rows are before-images of calling places the import re-pointed.
ALTER TABLE public.import_changes DROP CONSTRAINT import_changes_table_name_check;
ALTER TABLE public.import_changes ADD CONSTRAINT import_changes_table_name_check CHECK (table_name IN ('attendance', 'exam_marks',
  'legacy_results', 'fee_structures', 'fee_invoices', 'admission_applicants', 'students', 'enrolments', 'family_members',
  'student_health', 'emergency_contacts', 'family_primary'));

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
  -- A new primary contact in the file takes over from the one on file, which undo makes primary again.
  WITH old AS (
    UPDATE public.family_members f SET is_primary = false
      WHERE f.is_primary AND f.student_id IN (SELECT sid FROM pg_temp._r WHERE is_primary)
        AND f.id NOT IN (SELECT cur_id FROM pg_temp._r WHERE is_primary AND cur_id IS NOT NULL)
      RETURNING f.id)
  INSERT INTO public.import_changes (job_id, school_id, table_name, row_id, before)
    SELECT p_job, p_school, 'family_primary', id, '{}'::jsonb FROM old
    ON CONFLICT (job_id, table_name, row_id) DO NOTHING;
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
  -- Emergency places: the person at a place is replaced (calling order follows the file). A place already held is
  -- re-pointed in place with its before-image kept; an empty place gets a new row.
  INSERT INTO public.import_changes (job_id, school_id, table_name, row_id, before)
    SELECT p_job, p_school, 'emergency_contacts', e.id, to_jsonb(e) FROM pg_temp._r r
      JOIN public.emergency_contacts e ON e.student_id = r.sid AND e.position = r.emergency
      WHERE r.emergency IS NOT NULL AND e.family_member_id IS DISTINCT FROM r.cur_id
    ON CONFLICT (job_id, table_name, row_id) DO NOTHING;
  UPDATE public.emergency_contacts e SET family_member_id = r.cur_id, name = NULL, relation = NULL, phone = NULL, import_job_id = p_job
    FROM pg_temp._r r WHERE r.emergency IS NOT NULL AND e.student_id = r.sid AND e.position = r.emergency AND e.family_member_id IS DISTINCT FROM r.cur_id;
  INSERT INTO public.emergency_contacts (school_id, student_id, position, family_member_id, import_job_id)
    SELECT p_school, r.sid, r.emergency, r.cur_id, p_job FROM pg_temp._r r
    WHERE r.emergency IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.emergency_contacts e WHERE e.student_id = r.sid AND e.position = r.emergency);
  UPDATE public.students s SET family_code = r.family_code
    FROM (SELECT DISTINCT ON (sid) sid, family_code FROM pg_temp._r WHERE family_code IS NOT NULL ORDER BY sid, n) r
    WHERE s.id = r.sid AND s.family_code IS DISTINCT FROM r.family_code;
  FOR v_sid IN SELECT DISTINCT sid FROM pg_temp._r LOOP PERFORM app.suggest_siblings(v_sid); END LOOP;
  RETURN v_out;
END $$;
REVOKE ALL ON FUNCTION public.import_family(uuid, uuid, uuid, jsonb, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.import_family(uuid, uuid, uuid, jsonb, boolean) TO service_role;

-- ── 3. The register import: one Aadhaar, PEN and APAAR ID per row of a chunk ──

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
      WHEN length(trim(admission_no)) NOT BETWEEN 1 AND 30 THEN 'An admission number has up to 30 characters.'
      WHEN cur_status = 'cancelled' THEN 'Admission number ' || admission_no || ' was cancelled on the register and cannot be used again.'
      WHEN cur_id IS NULL AND NOT row ? 'full_name' THEN 'A new register entry needs a full name.'
      WHEN (row ->> 'no_aadhaar')::boolean IS TRUE AND row ? 'aadhaar_last4' THEN 'The row says the student has no Aadhaar but also gives a number.'
      WHEN row ? 'pen' AND EXISTS (SELECT 1 FROM public.students o WHERE o.school_id = p_school AND o.pen = _r.row ->> 'pen' AND o.id IS DISTINCT FROM _r.cur_id)
        THEN 'PEN ' || (row ->> 'pen') || ' is already on another student.'
      WHEN row ? 'pen' AND EXISTS (SELECT 1 FROM pg_temp._r o WHERE o.row ->> 'pen' = _r.row ->> 'pen' AND o.n < _r.n AND lower(o.admission_no) <> lower(_r.admission_no))
        THEN 'PEN ' || (row ->> 'pen') || ' is also on row ' || (SELECT min(o.n) FROM pg_temp._r o WHERE o.row ->> 'pen' = _r.row ->> 'pen') || ' of this file.'
      WHEN row ? 'apaar_id' AND EXISTS (SELECT 1 FROM public.students o WHERE o.school_id = p_school AND o.apaar_id = _r.row ->> 'apaar_id' AND o.id IS DISTINCT FROM _r.cur_id)
        THEN 'APAAR ID ' || (row ->> 'apaar_id') || ' is already on another student.'
      WHEN row ? 'apaar_id' AND EXISTS (SELECT 1 FROM pg_temp._r o WHERE o.row ->> 'apaar_id' = _r.row ->> 'apaar_id' AND o.n < _r.n AND lower(o.admission_no) <> lower(_r.admission_no))
        THEN 'APAAR ID ' || (row ->> 'apaar_id') || ' is also on row ' || (SELECT min(o.n) FROM pg_temp._r o WHERE o.row ->> 'apaar_id' = _r.row ->> 'apaar_id') || ' of this file.'
      WHEN row ? 'aadhaar_hash' AND EXISTS (SELECT 1 FROM public.students o WHERE o.school_id = p_school AND o.aadhaar_hash = _r.row ->> 'aadhaar_hash'
        AND o.status <> 'cancelled' AND o.id IS DISTINCT FROM _r.cur_id)
        THEN 'This Aadhaar number (ending ' || (row ->> 'aadhaar_last4') || ') is already on another student.'
      WHEN row ? 'aadhaar_hash' AND EXISTS (SELECT 1 FROM pg_temp._r o WHERE o.row ->> 'aadhaar_hash' = _r.row ->> 'aadhaar_hash' AND o.n < _r.n AND lower(o.admission_no) <> lower(_r.admission_no))
        THEN 'This Aadhaar number (ending ' || (row ->> 'aadhaar_last4') || ') is also on row '
          || (SELECT min(o.n) FROM pg_temp._r o WHERE o.row ->> 'aadhaar_hash' = _r.row ->> 'aadhaar_hash') || ' of this file.'
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

-- ── 1 and 2. Undo ───────────────────────────────────────────────────────────

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
    'enrolments', 'family_members', 'student_health', 'emergency_contacts'] LOOP
    SELECT string_agg(format('%I', attname), ', ' ORDER BY attnum) INTO v_cols FROM pg_attribute
      WHERE attrelid = format('public.%I', t)::regclass AND attnum > 0 AND NOT attisdropped AND attname NOT IN ('id', 'updated_at');
    EXECUTE format($q$
      WITH c AS (SELECT id, row_id, %s AS before FROM public.import_changes i WHERE job_id = $1 AND table_name = %L ORDER BY id LIMIT $2),
      done AS (
        UPDATE public.%I x SET (%s) = (SELECT %s FROM jsonb_populate_record(NULL::public.%I, c.before))
        FROM c WHERE x.id = c.row_id AND x.updated_at <= $3 %s
        RETURNING c.id),
      gone AS (DELETE FROM public.import_changes d USING c WHERE d.id = c.id RETURNING d.id, (d.id IN (SELECT id FROM done)) AS restored)
      SELECT count(*) FILTER (WHERE restored), count(*) FILTER (WHERE NOT restored) FROM gone$q$,
      -- A primary contact the import took over from comes back as primary only after step 2 (one primary per student).
      CASE WHEN t = 'family_members' THEN 'CASE WHEN EXISTS (SELECT 1 FROM public.import_changes m WHERE m.job_id = $1
        AND m.table_name = ''family_primary'' AND m.row_id = i.row_id) THEN i.before || ''{"is_primary": false}'' ELSE i.before END' ELSE 'i.before' END,
      t, t, v_cols, v_cols, t,
      CASE t
        WHEN 'exam_marks' THEN 'AND EXISTS (SELECT 1 FROM public.exam_sheets s WHERE s.id = x.sheet_id AND s.status = ''open'')'
        -- Someone else made primary since: this member is kept as it is.
        WHEN 'family_members' THEN 'AND NOT ((c.before ->> ''is_primary'')::boolean AND EXISTS (SELECT 1 FROM public.family_members o
          WHERE o.student_id = x.student_id AND o.is_primary AND o.id <> x.id))'
        ELSE '' END)
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
        -- A register entry with a login, or with records from anywhere but this import (they would cascade away), stays.
        WHEN 'students' THEN 'OR x.user_id IS NOT NULL
          OR EXISTS (SELECT 1 FROM public.enrolments e WHERE e.student_id = x.id AND e.import_job_id IS DISTINCT FROM $1)
          OR EXISTS (SELECT 1 FROM public.family_members f WHERE f.student_id = x.id AND f.import_job_id IS DISTINCT FROM $1)
          OR EXISTS (SELECT 1 FROM public.emergency_contacts e WHERE e.student_id = x.id AND e.import_job_id IS DISTINCT FROM $1)
          OR EXISTS (SELECT 1 FROM public.student_health h WHERE h.student_id = x.id AND h.import_job_id IS DISTINCT FROM $1)
          OR EXISTS (SELECT 1 FROM public.health_events h WHERE h.student_id = x.id AND h.import_job_id IS DISTINCT FROM $1)
          OR EXISTS (SELECT 1 FROM public.student_change_requests r WHERE r.student_id = x.id)
          OR EXISTS (SELECT 1 FROM public.sibling_links l WHERE (l.a = x.id OR l.b = x.id) AND l.status <> ''suggested'')'
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
    -- The primary contacts the import took over from, once the members it added are gone (one primary per student).
    IF t = 'family_members' THEN
      WITH c AS (SELECT id, row_id FROM public.import_changes WHERE job_id = p_job AND table_name = 'family_primary' ORDER BY id LIMIT p_limit),
      done AS (
        UPDATE public.family_members f SET is_primary = true FROM c
        WHERE f.id = c.row_id AND NOT f.is_primary AND f.updated_at <= j.committed_at
          AND NOT EXISTS (SELECT 1 FROM public.family_members o WHERE o.student_id = f.student_id AND o.is_primary)
        RETURNING c.id),
      gone AS (DELETE FROM public.import_changes d USING c WHERE d.id = c.id RETURNING d.id, (d.id IN (SELECT id FROM done)) AS restored)
      SELECT count(*) FILTER (WHERE restored), count(*) FILTER (WHERE NOT restored) INTO v_n, v_kept FROM gone;
      v_restored := v_restored + v_n;
      j.kept := j.kept + v_kept;
      IF v_n + v_kept >= p_limit THEN
        UPDATE public.import_jobs SET kept = j.kept WHERE id = p_job;
        RETURN jsonb_build_object('done', false, 'restored', v_restored, 'removed', v_removed);
      END IF;
      -- Members the import made primary that were kept (changed since) also keep that, so the old primary stays as it is.
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
REVOKE ALL ON FUNCTION public.import_undo(uuid, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.import_undo(uuid, int) TO service_role;
