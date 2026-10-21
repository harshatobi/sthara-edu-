-- Bulk import writers on the live API connection — 2026-10-21
--
-- Supabase loads safeupdate on every API connection, which refuses an UPDATE without a WHERE clause, even on a
-- temporary table inside a function. Each writer marks its own pg_temp._r rows in one UPDATE with no WHERE, so every
-- database check failed on the live project (the local test database has no safeupdate). The same six functions as
-- 20261021090000_bulk_import, with WHERE true on that one statement; nothing else changes. Grants carry over.

CREATE OR REPLACE FUNCTION public.import_attendance(p_job uuid, p_school uuid, p_actor uuid, p_rows jsonb, p_dry boolean)
  RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
  AS $$
DECLARE v_out jsonb; v_problems jsonb;
BEGIN
  DROP TABLE IF EXISTS pg_temp._r;
  CREATE TEMP TABLE _r ON COMMIT DROP AS
    SELECT x.*, a.id AS cur_id, a.status AS cur_status, a.note AS cur_note, a.class_name AS cur_class
    FROM jsonb_to_recordset(p_rows) AS x(n int, student_id uuid, class_name text, day date, status text, note text)
    LEFT JOIN public.attendance a ON a.student_id = x.student_id AND a.day = x.day;
  SELECT coalesce(jsonb_agg(jsonb_build_object('n', n, 'error', 'That student is not in this school.') ORDER BY n), '[]') INTO v_problems
    FROM pg_temp._r WHERE NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = _r.student_id AND u.school_id = p_school);
  ALTER TABLE pg_temp._r ADD COLUMN changed boolean;
  UPDATE pg_temp._r SET changed = cur_id IS NOT NULL AND (status, coalesce(note, cur_note), class_name) IS DISTINCT FROM (cur_status, cur_note, cur_class) WHERE true;
  SELECT jsonb_build_object('added', count(*) FILTER (WHERE cur_id IS NULL), 'updated', count(*) FILTER (WHERE changed),
    'unchanged', count(*) FILTER (WHERE cur_id IS NOT NULL AND NOT changed), 'problems', v_problems) INTO v_out FROM pg_temp._r;
  IF p_dry OR jsonb_array_length(v_problems) > 0 THEN RETURN v_out; END IF;

  PERFORM set_config('sthara.import_job', p_job::text, true);
  INSERT INTO public.import_changes (job_id, school_id, table_name, row_id, before)
    SELECT p_job, p_school, 'attendance', a.id, to_jsonb(a) FROM pg_temp._r JOIN public.attendance a ON a.id = _r.cur_id WHERE _r.changed
    ON CONFLICT (job_id, table_name, row_id) DO NOTHING;
  UPDATE public.attendance a SET status = r.status, note = coalesce(r.note, a.note), class_name = r.class_name, import_job_id = p_job
    FROM pg_temp._r r WHERE a.id = r.cur_id AND r.changed;
  INSERT INTO public.attendance (school_id, student_id, class_name, day, status, note, marked_by, import_job_id)
    SELECT p_school, student_id, class_name, day, status, note, p_actor, p_job FROM pg_temp._r WHERE cur_id IS NULL;
  RETURN v_out;
END $$;

CREATE OR REPLACE FUNCTION public.import_exam_marks(p_job uuid, p_school uuid, p_actor uuid, p_rows jsonb, p_dry boolean)
  RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
  AS $$
DECLARE v_out jsonb; v_problems jsonb;
BEGIN
  DROP TABLE IF EXISTS pg_temp._r;
  CREATE TEMP TABLE _r ON COMMIT DROP AS
    SELECT x.*, m.id AS cur_id, m.marks AS cur_marks, m.code AS cur_code, s.status AS sheet_status, s.max_marks AS sheet_max, s.school_id AS sheet_school
    FROM jsonb_to_recordset(p_rows) AS x(n int, sheet_id uuid, student_id uuid, marks numeric, code text)
    LEFT JOIN public.exam_sheets s ON s.id = x.sheet_id
    LEFT JOIN public.exam_marks m ON m.sheet_id = x.sheet_id AND m.student_id = x.student_id;
  SELECT coalesce(jsonb_agg(jsonb_build_object('n', n, 'error', e) ORDER BY n), '[]') INTO v_problems FROM (
    SELECT n, CASE
      WHEN sheet_school IS DISTINCT FROM p_school THEN 'That marks sheet is not in this school.'
      WHEN NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = _r.student_id AND u.school_id = p_school) THEN 'That student is not in this school.'
      WHEN sheet_status <> 'open' THEN 'That marks sheet is ' || sheet_status || '. Reopen it before importing marks.'
      WHEN marks > sheet_max THEN 'Marks are above the maximum of ' || sheet_max || '.'
    END AS e FROM pg_temp._r) p WHERE e IS NOT NULL;
  ALTER TABLE pg_temp._r ADD COLUMN changed boolean;
  UPDATE pg_temp._r SET changed = cur_id IS NOT NULL AND (marks, code) IS DISTINCT FROM (cur_marks, cur_code) WHERE true;
  SELECT jsonb_build_object('added', count(*) FILTER (WHERE cur_id IS NULL), 'updated', count(*) FILTER (WHERE changed),
    'unchanged', count(*) FILTER (WHERE cur_id IS NOT NULL AND NOT changed), 'problems', v_problems) INTO v_out FROM pg_temp._r;
  IF p_dry OR jsonb_array_length(v_problems) > 0 THEN RETURN v_out; END IF;

  PERFORM set_config('sthara.import_job', p_job::text, true);
  INSERT INTO public.import_changes (job_id, school_id, table_name, row_id, before)
    SELECT p_job, p_school, 'exam_marks', m.id, to_jsonb(m) FROM pg_temp._r JOIN public.exam_marks m ON m.id = _r.cur_id WHERE _r.changed
    ON CONFLICT (job_id, table_name, row_id) DO NOTHING;
  UPDATE public.exam_marks m SET marks = r.marks, code = r.code, source = 'import', updated_by = p_actor, updated_at = now(), import_job_id = p_job
    FROM pg_temp._r r WHERE m.id = r.cur_id AND r.changed;
  INSERT INTO public.exam_marks (school_id, sheet_id, student_id, marks, code, source, updated_by, import_job_id)
    SELECT p_school, sheet_id, student_id, marks, code, 'import', p_actor, p_job FROM pg_temp._r WHERE cur_id IS NULL;
  RETURN v_out;
END $$;

CREATE OR REPLACE FUNCTION public.import_legacy_results(p_job uuid, p_school uuid, p_actor uuid, p_rows jsonb, p_dry boolean)
  RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
  AS $$
DECLARE v_out jsonb; v_problems jsonb;
BEGIN
  DROP TABLE IF EXISTS pg_temp._r;
  CREATE TEMP TABLE _r ON COMMIT DROP AS
    SELECT x.*, l.id AS cur_id, l.marks AS cur_marks, l.max_marks AS cur_max, l.grade AS cur_grade, l.code AS cur_code, l.class_name AS cur_class
    FROM jsonb_to_recordset(p_rows) AS x(n int, student_id uuid, session text, class_name text, term text, subject text, marks numeric, max_marks numeric, grade text, code text)
    LEFT JOIN public.legacy_results l ON l.student_id = x.student_id AND l.session = x.session AND l.term = x.term AND l.subject = x.subject;
  SELECT coalesce(jsonb_agg(jsonb_build_object('n', n, 'error', 'That student is not in this school.') ORDER BY n), '[]') INTO v_problems
    FROM pg_temp._r WHERE NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = _r.student_id AND u.school_id = p_school);
  ALTER TABLE pg_temp._r ADD COLUMN changed boolean;
  UPDATE pg_temp._r SET changed = cur_id IS NOT NULL AND (marks, max_marks, grade, code, coalesce(class_name, cur_class))
    IS DISTINCT FROM (cur_marks, cur_max, cur_grade, cur_code, cur_class) WHERE true;
  SELECT jsonb_build_object('added', count(*) FILTER (WHERE cur_id IS NULL), 'updated', count(*) FILTER (WHERE changed),
    'unchanged', count(*) FILTER (WHERE cur_id IS NOT NULL AND NOT changed), 'problems', v_problems) INTO v_out FROM pg_temp._r;
  IF p_dry OR jsonb_array_length(v_problems) > 0 THEN RETURN v_out; END IF;

  PERFORM set_config('sthara.import_job', p_job::text, true);
  INSERT INTO public.import_changes (job_id, school_id, table_name, row_id, before)
    SELECT p_job, p_school, 'legacy_results', l.id, to_jsonb(l) FROM pg_temp._r JOIN public.legacy_results l ON l.id = _r.cur_id WHERE _r.changed
    ON CONFLICT (job_id, table_name, row_id) DO NOTHING;
  UPDATE public.legacy_results l SET marks = r.marks, max_marks = r.max_marks, grade = r.grade, code = r.code,
      class_name = coalesce(r.class_name, l.class_name), import_job_id = p_job
    FROM pg_temp._r r WHERE l.id = r.cur_id AND r.changed;
  INSERT INTO public.legacy_results (school_id, student_id, session, class_name, term, subject, marks, max_marks, grade, code, import_job_id)
    SELECT p_school, student_id, session, class_name, term, subject, marks, max_marks, grade, code, p_job FROM pg_temp._r WHERE cur_id IS NULL;
  RETURN v_out;
END $$;

CREATE OR REPLACE FUNCTION public.import_fee_structures(p_job uuid, p_school uuid, p_actor uuid, p_rows jsonb, p_dry boolean)
  RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
  AS $$
DECLARE v_out jsonb;
BEGIN
  DROP TABLE IF EXISTS pg_temp._r;
  CREATE TEMP TABLE _r ON COMMIT DROP AS
    SELECT x.*, f.id AS cur_id, f.annual_fee AS cur_fee, f.schedule AS cur_schedule
    FROM jsonb_to_recordset(p_rows) AS x(n int, session text, grade int, annual_fee numeric, schedule jsonb)
    LEFT JOIN public.fee_structures f ON f.school_id = p_school AND f.session = x.session AND f.grade = x.grade;
  ALTER TABLE pg_temp._r ADD COLUMN changed boolean;
  UPDATE pg_temp._r SET changed = cur_id IS NOT NULL AND (annual_fee, coalesce(schedule, cur_schedule)) IS DISTINCT FROM (cur_fee, cur_schedule) WHERE true;
  SELECT jsonb_build_object('added', count(*) FILTER (WHERE cur_id IS NULL), 'updated', count(*) FILTER (WHERE changed),
    'unchanged', count(*) FILTER (WHERE cur_id IS NOT NULL AND NOT changed), 'problems', '[]'::jsonb) INTO v_out FROM pg_temp._r;
  IF p_dry THEN RETURN v_out; END IF;

  PERFORM set_config('sthara.import_job', p_job::text, true);
  INSERT INTO public.import_changes (job_id, school_id, table_name, row_id, before)
    SELECT p_job, p_school, 'fee_structures', f.id, to_jsonb(f) FROM pg_temp._r JOIN public.fee_structures f ON f.id = _r.cur_id WHERE _r.changed
    ON CONFLICT (job_id, table_name, row_id) DO NOTHING;
  UPDATE public.fee_structures f SET annual_fee = r.annual_fee, schedule = coalesce(r.schedule, f.schedule), updated_by = p_actor, import_job_id = p_job
    FROM pg_temp._r r WHERE f.id = r.cur_id AND r.changed;
  INSERT INTO public.fee_structures (school_id, session, grade, annual_fee, schedule, updated_by, import_job_id)
    SELECT p_school, session, grade, annual_fee, coalesce(schedule, '[]'::jsonb), p_actor, p_job FROM pg_temp._r WHERE cur_id IS NULL;
  RETURN v_out;
END $$;

CREATE OR REPLACE FUNCTION public.import_fee_invoices(p_job uuid, p_school uuid, p_actor uuid, p_rows jsonb, p_dry boolean)
  RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
  AS $$
DECLARE v_out jsonb; v_problems jsonb;
BEGIN
  DROP TABLE IF EXISTS pg_temp._r;
  CREATE TEMP TABLE _r ON COMMIT DROP AS
    SELECT x.*, i.id AS cur_id, i.label AS cur_label, i.due_on AS cur_due, i.amount AS cur_amount, i.concession AS cur_concession,
      i.concession_reason AS cur_reason, i.voided_at IS NOT NULL AS cur_void,
      coalesce((SELECT sum(p.amount) FROM public.fee_payments p WHERE p.invoice_id = i.id AND p.voided_at IS NULL), 0) AS paid
    FROM jsonb_to_recordset(p_rows) AS x(n int, student_id uuid, session text, instalment_no int, label text, due_on date, amount numeric, concession numeric, concession_reason text)
    LEFT JOIN public.fee_invoices i ON i.student_id = x.student_id AND i.session = x.session AND i.instalment_no = x.instalment_no;
  ALTER TABLE pg_temp._r ADD COLUMN changed boolean;
  UPDATE pg_temp._r SET changed = cur_id IS NOT NULL AND (coalesce(label, cur_label), coalesce(due_on, cur_due), amount, coalesce(concession, cur_concession), coalesce(concession_reason, cur_reason))
    IS DISTINCT FROM (cur_label, cur_due, cur_amount, cur_concession, cur_reason) WHERE true;
  SELECT coalesce(jsonb_agg(jsonb_build_object('n', n, 'error', e) ORDER BY n), '[]') INTO v_problems FROM (
    SELECT n, CASE
      WHEN NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = _r.student_id AND u.school_id = p_school) THEN 'That student is not in this school.'
      WHEN cur_id IS NULL AND (label IS NULL OR due_on IS NULL) THEN 'A new invoice needs a label and a due date.'
      WHEN cur_void AND changed THEN 'That instalment''s invoice was voided. Raise it again in Fees instead.'
      WHEN changed AND amount - coalesce(concession, cur_concession) < paid THEN 'More than the new amount has already been paid against this invoice (' || paid || ').'
      WHEN coalesce(concession, cur_concession, 0) > 0 AND coalesce(concession_reason, cur_reason) IS NULL THEN 'A concession needs a reason.'
    END AS e FROM pg_temp._r) p WHERE e IS NOT NULL;
  SELECT jsonb_build_object('added', count(*) FILTER (WHERE cur_id IS NULL), 'updated', count(*) FILTER (WHERE changed),
    'unchanged', count(*) FILTER (WHERE cur_id IS NOT NULL AND NOT changed), 'problems', v_problems) INTO v_out FROM pg_temp._r;
  IF p_dry OR jsonb_array_length(v_problems) > 0 THEN RETURN v_out; END IF;

  PERFORM set_config('sthara.import_job', p_job::text, true);
  INSERT INTO public.import_changes (job_id, school_id, table_name, row_id, before)
    SELECT p_job, p_school, 'fee_invoices', i.id, to_jsonb(i) FROM pg_temp._r JOIN public.fee_invoices i ON i.id = _r.cur_id WHERE _r.changed
    ON CONFLICT (job_id, table_name, row_id) DO NOTHING;
  UPDATE public.fee_invoices i SET label = coalesce(r.label, i.label), due_on = coalesce(r.due_on, i.due_on), amount = r.amount,
      concession = coalesce(r.concession, i.concession), concession_reason = coalesce(r.concession_reason, i.concession_reason), import_job_id = p_job
    FROM pg_temp._r r WHERE i.id = r.cur_id AND r.changed;
  -- Numbers are taken only for rows that are really new, so none is burnt on a re-run.
  INSERT INTO public.fee_invoices (school_id, student_id, session, instalment_no, label, invoice_no, due_on, amount, concession, concession_reason, created_by, import_job_id)
    SELECT p_school, student_id, session, instalment_no, label, app.next_doc_no(p_school, 'invoice', session), due_on, amount,
      coalesce(concession, 0), concession_reason, p_actor, p_job
    FROM pg_temp._r WHERE cur_id IS NULL ORDER BY n;
  RETURN v_out;
END $$;

CREATE OR REPLACE FUNCTION public.import_admission_applicants(p_job uuid, p_school uuid, p_actor uuid, p_rows jsonb, p_dry boolean)
  RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
  AS $$
DECLARE v_out jsonb;
BEGIN
  -- An applicant has no number of their own: the same session, name and date of birth (or, without a date of
  -- birth, guardian phone) is the same applicant.
  DROP TABLE IF EXISTS pg_temp._r;
  CREATE TEMP TABLE _r ON COMMIT DROP AS
    SELECT x.*, (SELECT a.id FROM public.admission_applicants a
                 WHERE a.school_id = p_school AND a.session = x.session AND lower(a.name) = lower(x.name)
                   AND (a.date_of_birth = x.date_of_birth OR (x.date_of_birth IS NULL AND a.guardian_phone = x.guardian_phone))
                 ORDER BY a.created_at LIMIT 1) AS cur_id
    FROM jsonb_to_recordset(p_rows) AS x(n int, session text, name text, grade int, date_of_birth date, guardian_name text, guardian_phone text,
      guardian_email text, previous_school text, source text, stage text);
  ALTER TABLE pg_temp._r ADD COLUMN changed boolean;
  UPDATE pg_temp._r r SET changed = r.cur_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.admission_applicants a WHERE a.id = r.cur_id AND
    (r.grade, coalesce(r.guardian_name, a.guardian_name), coalesce(r.guardian_phone, a.guardian_phone), coalesce(r.guardian_email, a.guardian_email),
     coalesce(r.previous_school, a.previous_school), coalesce(r.source, a.source), coalesce(r.stage, a.stage), coalesce(r.date_of_birth, a.date_of_birth))
    IS DISTINCT FROM (a.grade, a.guardian_name, a.guardian_phone, a.guardian_email, a.previous_school, a.source, a.stage, a.date_of_birth))
    WHERE true;
  SELECT jsonb_build_object('added', count(*) FILTER (WHERE cur_id IS NULL), 'updated', count(*) FILTER (WHERE changed),
    'unchanged', count(*) FILTER (WHERE cur_id IS NOT NULL AND NOT changed), 'problems', '[]'::jsonb) INTO v_out FROM pg_temp._r;
  IF p_dry THEN RETURN v_out; END IF;

  PERFORM set_config('sthara.import_job', p_job::text, true);
  INSERT INTO public.import_changes (job_id, school_id, table_name, row_id, before)
    SELECT p_job, p_school, 'admission_applicants', a.id, to_jsonb(a) FROM pg_temp._r JOIN public.admission_applicants a ON a.id = _r.cur_id WHERE _r.changed
    ON CONFLICT (job_id, table_name, row_id) DO NOTHING;
  UPDATE public.admission_applicants a SET grade = r.grade, date_of_birth = coalesce(r.date_of_birth, a.date_of_birth),
      guardian_name = coalesce(r.guardian_name, a.guardian_name), guardian_phone = coalesce(r.guardian_phone, a.guardian_phone),
      guardian_email = coalesce(r.guardian_email, a.guardian_email), previous_school = coalesce(r.previous_school, a.previous_school),
      source = coalesce(r.source, a.source), stage = coalesce(r.stage, a.stage),
      furthest_stage = CASE WHEN array_position(ARRAY['enquiry','application','assessment','offer','enrolled'], coalesce(r.stage, a.stage))
                              > array_position(ARRAY['enquiry','application','assessment','offer','enrolled'], a.furthest_stage)
                            THEN coalesce(r.stage, a.stage) ELSE a.furthest_stage END,
      stage_changed_at = CASE WHEN coalesce(r.stage, a.stage) <> a.stage THEN now() ELSE a.stage_changed_at END,
      import_job_id = p_job
    FROM pg_temp._r r WHERE a.id = r.cur_id AND r.changed;
  INSERT INTO public.admission_applicants (school_id, session, name, grade, date_of_birth, guardian_name, guardian_phone, guardian_email,
      previous_school, source, stage, furthest_stage, created_by, import_job_id)
    SELECT p_school, session, name, grade, date_of_birth, guardian_name, guardian_phone, guardian_email, previous_school,
      coalesce(source, 'other'), coalesce(stage, 'enquiry'),
      CASE WHEN coalesce(stage, 'enquiry') IN ('rejected', 'withdrawn') THEN 'enquiry' ELSE coalesce(stage, 'enquiry') END, p_actor, p_job
    FROM pg_temp._r WHERE cur_id IS NULL;
  RETURN v_out;
END $$;
