-- Bulk import: one way to load a large dataset into one school from a file Sthara publishes — 2026-10-21
-- (handoff/living-record/09-bulk-import.md; decisions recorded there).
--
--   import_jobs       one row per file: who (school admin, or a Sthara director under an 'import' access window),
--                     which dataset, progress, problems found, counts. It is the audit record of the import.
--   import_changes    the before-image of every row an import overwrote, so a batch can be undone. Purged after
--                     30 days; rows an import added carry its id in import_job_id and stay findable.
--   legacy_results    marks from years before the school used Sthara (no exam sheets exist for them).
--   import_* functions  write one checked chunk; with p_dry they only count what would change. service_role only.
--
-- Writes made inside an import skip the per-row audit triggers (the job is the audit record), so a 300k-row
-- attendance file does not add 300k audit rows. Every other write is still audited per row.
--
-- The worker route is woken right after each step and, as a fallback, once a minute by pg_cron + pg_net while a
-- job is waiting. The URL and secret live in Vault (see the end of this file); until they are set the minute
-- wake-up does nothing and imports still run from the after() kick.

CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- ── Jobs ────────────────────────────────────────────────────────────────────

CREATE TABLE public.import_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  dataset text NOT NULL CHECK (dataset ~ '^[a-z_]{2,40}$'),
  status text NOT NULL DEFAULT 'uploading' CHECK (status IN (
    'uploading',              -- waiting for the file to reach storage
    'checking',               -- dry run in progress
    'rejected',               -- dry run found problems; nothing written
    'checked',                -- clean; waiting for someone to commit
    'committing', 'committed',
    'failed',                 -- a write failed partway; what was written has been rolled back
    'undoing', 'undone',
    'cancelled')),
  phase_cursor integer NOT NULL DEFAULT 0 CHECK (phase_cursor >= 0),
  file_path text CHECK (file_path IS NULL OR length(file_path) <= 300),
  file_name text NOT NULL CHECK (length(file_name) BETWEEN 1 AND 200),
  file_kind text NOT NULL CHECK (file_kind IN ('csv', 'xlsx')),
  file_bytes bigint CHECK (file_bytes IS NULL OR file_bytes >= 0),
  file_sha256 text CHECK (file_sha256 IS NULL OR file_sha256 ~ '^[0-9a-f]{64}$'),
  total_rows integer CHECK (total_rows IS NULL OR total_rows >= 0),
  added integer NOT NULL DEFAULT 0,
  updated integer NOT NULL DEFAULT 0,
  unchanged integer NOT NULL DEFAULT 0,
  kept integer NOT NULL DEFAULT 0,          -- on undo: rows left alone because someone changed them since
  problem_count integer NOT NULL DEFAULT 0,
  problems jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(problems) = 'array'),
  summary jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(summary) = 'object'),
  by_user uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  by_kind text NOT NULL CHECK (by_kind IN ('admin', 'operator')),
  by_name text NOT NULL CHECK (length(by_name) BETWEEN 1 AND 200),
  grant_id uuid REFERENCES public.ops_access_grants(id),
  CHECK ((by_kind = 'operator') = (grant_id IS NOT NULL)),
  attempts integer NOT NULL DEFAULT 0,
  locked_until timestamptz,
  last_error text CHECK (last_error IS NULL OR length(last_error) <= 2000),
  created_at timestamptz NOT NULL DEFAULT now(),
  checked_at timestamptz,
  committed_at timestamptz,
  committed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  undone_at timestamptz,
  undone_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX import_jobs_school ON public.import_jobs (school_id, created_at DESC);
CREATE INDEX import_jobs_waiting ON public.import_jobs (locked_until) WHERE status IN ('checking', 'committing', 'undoing');

CREATE TRIGGER trg_touch_import_jobs BEFORE UPDATE ON public.import_jobs FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

ALTER TABLE public.import_jobs ENABLE ROW LEVEL SECURITY;
-- Read by the office of the school (the history screen goes through the server, this is for completeness); writes only
-- through the server.
CREATE POLICY import_jobs_read ON public.import_jobs FOR SELECT TO authenticated USING (
  ((SELECT app.has_perm('data.import')) AND school_id = (SELECT app.current_school_id())) OR (SELECT app.is_superadmin()));
GRANT ALL ON public.import_jobs TO service_role;
GRANT SELECT ON public.import_jobs TO authenticated;

CREATE TABLE public.import_changes (
  id bigserial PRIMARY KEY,
  job_id uuid NOT NULL REFERENCES public.import_jobs(id) ON DELETE CASCADE,
  school_id uuid NOT NULL,
  table_name text NOT NULL CHECK (table_name IN ('attendance', 'exam_marks', 'legacy_results', 'fee_structures', 'fee_invoices', 'admission_applicants')),
  row_id uuid NOT NULL,
  before jsonb NOT NULL,
  UNIQUE (job_id, table_name, row_id)
);
ALTER TABLE public.import_changes ENABLE ROW LEVEL SECURITY;
-- No policy: before-images hold personal data and are only ever read by the undo function.
GRANT ALL ON public.import_changes TO service_role;
GRANT USAGE ON SEQUENCE public.import_changes_id_seq TO service_role;

-- ── Marks from before Sthara ────────────────────────────────────────────────

CREATE TABLE public.legacy_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  session text NOT NULL CHECK (session ~ '^\d{4}-\d{2}$'),
  class_name text CHECK (class_name IS NULL OR length(class_name) BETWEEN 1 AND 40),
  term text NOT NULL CHECK (length(term) BETWEEN 1 AND 60),
  subject text NOT NULL CHECK (length(subject) BETWEEN 1 AND 80),
  marks numeric(7,2) CHECK (marks IS NULL OR marks >= 0),
  max_marks numeric(7,2) CHECK (max_marks IS NULL OR max_marks > 0),
  grade text CHECK (grade IS NULL OR length(grade) BETWEEN 1 AND 8),
  code text CHECK (code IS NULL OR code IN ('AB', 'ML', 'EX')),
  import_job_id uuid REFERENCES public.import_jobs(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_id, session, term, subject),
  CHECK (marks IS NULL OR max_marks IS NULL OR marks <= max_marks),
  CHECK (code IS NULL OR marks IS NULL),
  CHECK (marks IS NOT NULL OR grade IS NOT NULL OR code IS NOT NULL)
);
CREATE INDEX legacy_results_school ON public.legacy_results (school_id, session);
CREATE TRIGGER trg_touch_legacy_results BEFORE UPDATE ON public.legacy_results FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
CREATE TRIGGER trg_audit_legacy_results AFTER INSERT OR DELETE OR UPDATE ON public.legacy_results FOR EACH ROW EXECUTE FUNCTION app.audit();

ALTER TABLE public.legacy_results ENABLE ROW LEVEL SECURITY;
CREATE POLICY legacy_results_read ON public.legacy_results FOR SELECT TO authenticated USING (
  ((SELECT app.has_perm('exams.read')) AND school_id = (SELECT app.current_school_id()))
  OR student_id = (SELECT auth.uid())
  OR EXISTS (SELECT 1 FROM public.guardians g WHERE g.student_id = legacy_results.student_id AND g.parent_id = (SELECT auth.uid()))
  OR (SELECT app.is_superadmin()));
GRANT ALL ON public.legacy_results TO service_role;
GRANT SELECT ON public.legacy_results TO authenticated;

-- ── Tagging written rows ────────────────────────────────────────────────────

ALTER TABLE public.attendance ADD COLUMN import_job_id uuid;
ALTER TABLE public.exam_marks ADD COLUMN import_job_id uuid;
ALTER TABLE public.fee_structures ADD COLUMN import_job_id uuid;
ALTER TABLE public.fee_invoices ADD COLUMN import_job_id uuid;
ALTER TABLE public.fee_payments ADD COLUMN import_job_id uuid;
ALTER TABLE public.admission_applicants ADD COLUMN import_job_id uuid;
CREATE INDEX attendance_import_job ON public.attendance (import_job_id) WHERE import_job_id IS NOT NULL;
CREATE INDEX exam_marks_import_job ON public.exam_marks (import_job_id) WHERE import_job_id IS NOT NULL;
CREATE INDEX fee_structures_import_job ON public.fee_structures (import_job_id) WHERE import_job_id IS NOT NULL;
CREATE INDEX fee_invoices_import_job ON public.fee_invoices (import_job_id) WHERE import_job_id IS NOT NULL;
CREATE INDEX fee_payments_import_job ON public.fee_payments (import_job_id) WHERE import_job_id IS NOT NULL;
CREATE INDEX admission_applicants_import_job ON public.admission_applicants (import_job_id) WHERE import_job_id IS NOT NULL;
CREATE INDEX legacy_results_import_job ON public.legacy_results (import_job_id) WHERE import_job_id IS NOT NULL;

-- ── Audit: one entry per import, not per row ────────────────────────────────

CREATE OR REPLACE FUNCTION app.importing() RETURNS boolean
  LANGUAGE sql STABLE SET search_path = pg_catalog, pg_temp
  AS $$ SELECT coalesce(current_setting('sthara.import_job', true), '') <> '' $$;
REVOKE ALL ON FUNCTION app.importing() FROM PUBLIC;

CREATE OR REPLACE FUNCTION app.audit() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_old jsonb := CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) END;
  v_new jsonb := CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) END;
  v_row jsonb := coalesce(v_new, v_old);
  v_school uuid;
BEGIN
  -- Bulk imports are audited once, by their import_jobs row.
  IF app.importing() THEN RETURN NULL; END IF;
  IF TG_OP = 'UPDATE' AND TG_NARGS > 0 THEN
    IF NOT EXISTS (SELECT 1 FROM unnest(string_to_array(TG_ARGV[0], ',')) f
                   WHERE v_old -> f IS DISTINCT FROM v_new -> f) THEN
      RETURN NULL;
    END IF;
  END IF;
  v_school := CASE WHEN TG_TABLE_NAME = 'guardians'
                   THEN (SELECT school_id FROM public.users WHERE id = (v_row ->> 'student_id')::uuid)
                   ELSE nullif(v_row ->> 'school_id', '')::uuid END;
  INSERT INTO public.audit_log (actor_id, actor_role, action, table_name, row_id, school_id, old_values, new_values)
  VALUES (auth.uid(), CASE WHEN auth.uid() IS NULL THEN 'server' ELSE coalesce(app.user_role(), 'unknown') END,
          TG_OP, TG_TABLE_NAME, v_row ->> 'id', v_school, v_old, v_new);
  RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION app.audit_exam_marks() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE v_was_submitted boolean;
BEGIN
  IF app.importing() THEN RETURN NULL; END IF;
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

-- ── Writers ─────────────────────────────────────────────────────────────────
-- Each takes rows the server has already parsed and resolved to ids (n = its line in the file), checks what
-- only the database can check, and returns {added, updated, unchanged, problems: [{n, error}]}. With p_dry it writes
-- nothing. A chunk with any problem writes nothing either (the caller dry-runs the whole file first). Blank cells
-- arrive as null and leave the stored value alone.

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
  UPDATE pg_temp._r SET changed = cur_id IS NOT NULL AND (status, coalesce(note, cur_note), class_name) IS DISTINCT FROM (cur_status, cur_note, cur_class);
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
  UPDATE pg_temp._r SET changed = cur_id IS NOT NULL AND (marks, code) IS DISTINCT FROM (cur_marks, cur_code);
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
    IS DISTINCT FROM (cur_marks, cur_max, cur_grade, cur_code, cur_class);
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
  UPDATE pg_temp._r SET changed = cur_id IS NOT NULL AND (annual_fee, coalesce(schedule, cur_schedule)) IS DISTINCT FROM (cur_fee, cur_schedule);
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
    IS DISTINCT FROM (cur_label, cur_due, cur_amount, cur_concession, cur_reason);
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

CREATE OR REPLACE FUNCTION public.import_fee_payments(p_job uuid, p_school uuid, p_actor uuid, p_rows jsonb, p_dry boolean)
  RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
  AS $$
DECLARE v_out jsonb; v_problems jsonb;
BEGIN
  -- Receipts are never edited (app.guard_fee_payment): a receipt number already on file is either the same receipt
  -- (left alone) or a clash (refused).
  DROP TABLE IF EXISTS pg_temp._r;
  CREATE TEMP TABLE _r ON COMMIT DROP AS
    SELECT x.*, i.id AS invoice_id, i.amount - i.concession AS net, i.voided_at IS NOT NULL AS invoice_void,
      p.id AS cur_id, (p.invoice_id, p.amount, p.mode, p.paid_on) IS NOT DISTINCT FROM (i.id, x.amount, x.mode, x.paid_on) AS same
    FROM jsonb_to_recordset(p_rows) AS x(n int, student_id uuid, session text, instalment_no int, amount numeric, mode text, reference text, paid_on date, receipt_no text)
    LEFT JOIN public.fee_invoices i ON i.student_id = x.student_id AND i.session = x.session AND i.instalment_no = x.instalment_no AND i.school_id = p_school
    LEFT JOIN public.fee_payments p ON p.school_id = p_school AND p.receipt_no = x.receipt_no;
  SELECT coalesce(jsonb_agg(jsonb_build_object('n', n, 'error', e) ORDER BY n), '[]') INTO v_problems FROM (
    SELECT n, CASE
      WHEN NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = r.student_id AND u.school_id = p_school) THEN 'That student is not in this school.'
      WHEN invoice_id IS NULL THEN 'No invoice for instalment ' || instalment_no || ' of ' || session || '. Import the invoices first.'
      WHEN invoice_void THEN 'The invoice for this instalment was voided.'
      WHEN cur_id IS NOT NULL AND NOT same THEN 'Receipt ' || receipt_no || ' is already on file with different details.'
      WHEN cur_id IS NULL AND amount + coalesce((SELECT sum(q.amount) FROM public.fee_payments q WHERE q.invoice_id = r.invoice_id AND q.voided_at IS NULL), 0)
        + coalesce((SELECT sum(o.amount) FROM pg_temp._r o WHERE o.invoice_id = r.invoice_id AND o.cur_id IS NULL AND o.n < r.n), 0) > net
        THEN 'This payment takes the instalment above its amount (' || net || ').'
    END AS e FROM pg_temp._r r) p WHERE e IS NOT NULL;
  SELECT jsonb_build_object('added', count(*) FILTER (WHERE cur_id IS NULL), 'updated', 0,
    'unchanged', count(*) FILTER (WHERE cur_id IS NOT NULL AND same), 'problems', v_problems) INTO v_out FROM pg_temp._r;
  IF p_dry OR jsonb_array_length(v_problems) > 0 THEN RETURN v_out; END IF;

  PERFORM set_config('sthara.import_job', p_job::text, true);
  -- Receipt numbers Sthara issues carry on after the highest imported one in its format. Moved first, so a row with
  -- no receipt number is numbered after every imported one (the server sends numbered rows before blank ones).
  INSERT INTO public.doc_counters (school_id, kind, session, last_no)
    SELECT p_school, 'receipt', m[1], max(m[2]::int)
    FROM (SELECT regexp_match(receipt_no, '^RCT/(\d{4}-\d{2})/(\d{1,9})$') AS m FROM pg_temp._r WHERE cur_id IS NULL AND receipt_no IS NOT NULL) s
    WHERE m IS NOT NULL GROUP BY m[1]
    ON CONFLICT (school_id, kind, session) DO UPDATE SET last_no = greatest(doc_counters.last_no, EXCLUDED.last_no);
  INSERT INTO public.fee_payments (school_id, invoice_id, student_id, amount, mode, reference, paid_on, receipt_no, recorded_by, import_job_id)
    SELECT p_school, invoice_id, student_id, amount, mode, reference, paid_on,
      coalesce(receipt_no, app.next_doc_no(p_school, 'receipt', session)), p_actor, p_job
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
    IS DISTINCT FROM (a.grade, a.guardian_name, a.guardian_phone, a.guardian_email, a.previous_school, a.source, a.stage, a.date_of_birth));
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

-- ── Undo ────────────────────────────────────────────────────────────────────
-- Puts back the before-image of rows the import overwrote and removes rows it added, up to p_limit rows per call
-- (the worker calls again until done). Rows someone changed after the import committed are left alone and
-- counted as kept; so are marks on sheets no longer open, invoices holding a receipt or concession request, and
-- applicants since enrolled. Imported receipts are voided ("import undone"), never deleted, unless their day book is
-- closed (kept). Undo the newest import of a dataset first (the server
-- enforces that), so a row two imports touched is restored in the right order.

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
  FOREACH t IN ARRAY ARRAY['attendance', 'exam_marks', 'legacy_results', 'fee_structures', 'fee_invoices', 'admission_applicants'] LOOP
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
  FOREACH t IN ARRAY ARRAY['attendance', 'exam_marks', 'legacy_results', 'fee_structures', 'admission_applicants', 'fee_invoices'] LOOP
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
      v AS (UPDATE public.fee_payments p SET voided_at = now(), void_reason = 'import undone', voided_by = j.undone_by
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

-- ── Worker claim ────────────────────────────────────────────────────────────
-- Hands the worker jobs that are waiting and not held by another run, holding each for p_seconds.

CREATE OR REPLACE FUNCTION public.import_claim(p_limit int DEFAULT 3, p_seconds int DEFAULT 90)
  RETURNS SETOF public.import_jobs LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp
  AS $$
  UPDATE public.import_jobs j SET locked_until = now() + make_interval(secs => p_seconds), attempts = j.attempts + 1
  WHERE j.id IN (
    SELECT id FROM public.import_jobs
    WHERE status IN ('checking', 'committing', 'undoing') AND (locked_until IS NULL OR locked_until < now())
    ORDER BY created_at LIMIT p_limit FOR UPDATE SKIP LOCKED)
  RETURNING j.*;
$$;

DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'import_attendance(uuid, uuid, uuid, jsonb, boolean)', 'import_exam_marks(uuid, uuid, uuid, jsonb, boolean)',
    'import_legacy_results(uuid, uuid, uuid, jsonb, boolean)', 'import_fee_structures(uuid, uuid, uuid, jsonb, boolean)',
    'import_fee_invoices(uuid, uuid, uuid, jsonb, boolean)', 'import_fee_payments(uuid, uuid, uuid, jsonb, boolean)',
    'import_admission_applicants(uuid, uuid, uuid, jsonb, boolean)', 'import_undo(uuid, int)', 'import_claim(int, int)'] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon, authenticated', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO service_role', f);
  END LOOP;
END $$;

-- ── Who may import ──────────────────────────────────────────────────────────
-- School side: principal and school admin (data.import). Sthara side: a director with an open 'import' window.

INSERT INTO public.role_permissions (role_key, perm) VALUES ('school_admin', 'data.import'), ('principal', 'data.import')
  ON CONFLICT DO NOTHING;

ALTER TABLE public.ops_access_grants DROP CONSTRAINT ops_access_grants_scope_check;
ALTER TABLE public.ops_access_grants ADD CONSTRAINT ops_access_grants_scope_check CHECK (scope IN ('records', 'view_as', 'import'));

-- ── Files ───────────────────────────────────────────────────────────────────
-- Kept for the life of the school; removed only on a DPDP erasure request or when the school leaves Sthara.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types) VALUES ('imports', 'imports', false, 52428800,
  '{text/csv,text/plain,text/tab-separated-values,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/octet-stream}'::text[])
  ON CONFLICT (id) DO NOTHING;

-- ── Schedules ───────────────────────────────────────────────────────────────

-- Undo lasts 30 days: after that the before-images go.
SELECT cron.schedule('import-undo-purge', '45 19 * * *', $$
  DELETE FROM public.import_changes c USING public.import_jobs j
  WHERE c.job_id = j.id AND j.committed_at < now() - interval '30 days'
$$);

-- Wakes the worker once a minute while a job is waiting. Set up once, by hand, in the SQL editor:
--   SELECT vault.create_secret('https://www.sthara.in/api/import/worker', 'import_worker_url');
--   SELECT vault.create_secret('<same value as IMPORT_WORKER_SECRET in Vercel>', 'import_worker_secret');
SELECT cron.schedule('import-worker', '* * * * *', $$
  SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'import_worker_url'),
    headers := jsonb_build_object('content-type', 'application/json',
      'x-worker-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'import_worker_secret')),
    body := '{}'::jsonb, timeout_milliseconds := 5000)
  WHERE EXISTS (SELECT 1 FROM public.import_jobs WHERE status IN ('checking', 'committing', 'undoing'))
    AND EXISTS (SELECT 1 FROM vault.decrypted_secrets WHERE name = 'import_worker_url')
$$);
