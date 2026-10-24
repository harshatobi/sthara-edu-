-- Living Record 05: certificates out. Transfer, bonafide, character and fee paid certificates, and any the school
-- sets up itself, with running numbers per kind, the principal approval, a register of everything issued (cancelled
-- ones stay), duplicates that keep the original number, a public verify link, and the past register import.
-- Every printed value is frozen in `data` when the certificate is issued. Screens read through the server.

CREATE TABLE public.certificate_settings (
  school_id uuid PRIMARY KEY REFERENCES public.schools(id) ON DELETE CASCADE,
  -- portal: state-board TCs come from the state portal (EMIS, SATS, Child Info); Sthara records their number.
  tc_mode text NOT NULL DEFAULT 'sthara' CHECK (tc_mode IN ('sthara', 'portal')),
  udise_code text CHECK (udise_code IS NULL OR udise_code ~ '^\d{11}$'),
  principal_name text CHECK (principal_name IS NULL OR length(principal_name) <= 120),
  signature text CHECK (signature IS NULL OR (signature ~ '^data:image/(png|jpeg);base64,' AND length(signature) <= 400000)),
  stamp text CHECK (stamp IS NULL OR (stamp ~ '^data:image/(png|jpeg);base64,' AND length(stamp) <= 400000)),
  updated_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_touch_certificate_settings BEFORE UPDATE ON public.certificate_settings FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
CREATE TRIGGER trg_audit_certificate_settings AFTER INSERT OR DELETE OR UPDATE ON public.certificate_settings FOR EACH ROW EXECUTE FUNCTION app.audit();

CREATE TABLE public.certificate_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('tc', 'bonafide', 'character', 'fee_paid', 'custom')),
  title text NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 80),
  body text CHECK (body IS NULL OR length(body) <= 4000),
  prefix text NOT NULL CHECK (prefix ~ '^[A-Z0-9/.-]{1,12}$'),
  needs_approval boolean NOT NULL DEFAULT true,
  active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- A TC always needs the principal (brief 05).
  CHECK (kind <> 'tc' OR needs_approval)
);
CREATE UNIQUE INDEX certificate_types_builtin ON public.certificate_types (school_id, kind) WHERE kind <> 'custom';
CREATE UNIQUE INDEX certificate_types_prefix ON public.certificate_types (school_id, prefix);
CREATE TRIGGER trg_touch_certificate_types BEFORE UPDATE ON public.certificate_types FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
CREATE TRIGGER trg_audit_certificate_types AFTER INSERT OR DELETE OR UPDATE ON public.certificate_types FOR EACH ROW EXECUTE FUNCTION app.audit();

CREATE TABLE public.certificates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE RESTRICT,
  type_id uuid NOT NULL REFERENCES public.certificate_types(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'pending', 'issued', 'cancelled')),
  -- The number, given at issue: prefix and a serial that runs forever. A duplicate keeps the original number.
  serial int CHECK (serial IS NULL OR serial > 0),
  number text CHECK (number IS NULL OR length(number) <= 40),
  copy_no smallint NOT NULL DEFAULT 0 CHECK (copy_no BETWEEN 0 AND 20),
  duplicate_of uuid REFERENCES public.certificates(id) ON DELETE RESTRICT,
  CHECK ((copy_no = 0) = (duplicate_of IS NULL)),
  -- Every value the certificate prints (frozen at issue; editable while a draft).
  data jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(data) = 'object'),
  issued_on date,
  CHECK (status NOT IN ('issued', 'cancelled') OR (number IS NOT NULL AND issued_on IS NOT NULL) OR source = 'portal'),
  dues numeric(12,2) CHECK (dues IS NULL OR dues >= 0),
  dues_override text CHECK (dues_override IS NULL OR length(dues_override) BETWEEN 3 AND 300),
  prepared_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  submitted_at timestamptz,
  returned_note text CHECK (returned_note IS NULL OR length(returned_note) <= 300),
  approved_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  approved_at timestamptz,
  cancelled_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  cancelled_at timestamptz,
  cancel_reason text CHECK (cancel_reason IS NULL OR length(cancel_reason) BETWEEN 3 AND 300),
  CHECK (status <> 'cancelled' OR cancel_reason IS NOT NULL),
  verify_token text NOT NULL UNIQUE DEFAULT replace(gen_random_uuid()::text, '-', ''),
  pdf_path text CHECK (pdf_path IS NULL OR length(pdf_path) <= 300),
  -- portal: a state-board TC made on the state portal; portal_ref is its number there.
  source text NOT NULL DEFAULT 'sthara' CHECK (source IN ('sthara', 'portal', 'import')),
  portal_ref text CHECK (portal_ref IS NULL OR length(portal_ref) <= 60),
  import_job_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX certificates_number ON public.certificates (type_id, serial, copy_no) WHERE serial IS NOT NULL;
CREATE INDEX certificates_student ON public.certificates (student_id, created_at DESC);
CREATE INDEX certificates_open ON public.certificates (school_id, status) WHERE status IN ('draft', 'pending');
CREATE INDEX certificates_import_job ON public.certificates (import_job_id) WHERE import_job_id IS NOT NULL;
CREATE TRIGGER trg_touch_certificates BEFORE UPDATE ON public.certificates FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
CREATE TRIGGER trg_audit_certificates AFTER INSERT OR DELETE OR UPDATE ON public.certificates FOR EACH ROW EXECUTE FUNCTION app.audit('status');

-- Issued certificates are a permanent register: never deleted, and their printed values never change.
CREATE OR REPLACE FUNCTION app.guard_certificate() RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status IN ('issued', 'cancelled') AND coalesce(current_setting('sthara.import_job', true), '') = '' THEN
      RAISE EXCEPTION 'an issued certificate stays on the register; cancel it instead' USING ERRCODE = '42501';
    END IF;
    RETURN OLD;
  END IF;
  IF OLD.status IN ('issued', 'cancelled') AND coalesce(current_setting('sthara.import_job', true), '') = '' AND (
      NEW.data IS DISTINCT FROM OLD.data OR NEW.number IS DISTINCT FROM OLD.number OR NEW.serial IS DISTINCT FROM OLD.serial
      OR NEW.issued_on IS DISTINCT FROM OLD.issued_on OR NEW.student_id IS DISTINCT FROM OLD.student_id OR NEW.type_id IS DISTINCT FROM OLD.type_id
      OR (OLD.status = 'cancelled' AND NEW.status <> 'cancelled')) THEN
    RAISE EXCEPTION 'an issued certificate can''t be changed; cancel it and issue a new one' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_guard_certificates BEFORE UPDATE OR DELETE ON public.certificates FOR EACH ROW EXECUTE FUNCTION app.guard_certificate();

ALTER TABLE public.certificate_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.certificate_settings FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.certificate_settings TO service_role;
ALTER TABLE public.certificate_types ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.certificate_types FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.certificate_types TO service_role;
ALTER TABLE public.certificates ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.certificates FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.certificates TO service_role;

-- Stored PDFs, and the PDF a state portal produced for a state-board TC.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  VALUES ('certificates', 'certificates', false, 26214400, '{application/pdf,image/jpeg,image/png}'::text[])
  ON CONFLICT (id) DO NOTHING;

-- ── Who does what ───────────────────────────────────────────────────────────
-- The registrar prepares; the principal (and school admin) approves and sets up. The server checks these.

INSERT INTO public.role_permissions (role_key, perm) VALUES
  ('school_admin', 'certificates.prepare'), ('school_admin', 'certificates.approve'), ('school_admin', 'certificates.setup'),
  ('principal', 'certificates.prepare'), ('principal', 'certificates.approve'), ('principal', 'certificates.setup'),
  ('registrar', 'certificates.prepare')
  ON CONFLICT DO NOTHING;

-- ── Issuing ─────────────────────────────────────────────────────────────────

-- Certificate numbers run per kind of certificate: counter kind 'cert:<type id>', session 'all'.
ALTER TABLE public.doc_counters DROP CONSTRAINT doc_counters_kind_check;
ALTER TABLE public.doc_counters ADD CONSTRAINT doc_counters_kind_check
  CHECK (kind IN ('invoice', 'receipt', 'admission') OR kind ~ '^cert:[0-9a-f-]{36}$');


-- Issues one certificate in one step: the next number of its kind (a duplicate keeps its original), the values
-- frozen as given, approved by p_actor. Called by the server after its checks (dues, permissions).
CREATE OR REPLACE FUNCTION public.certificate_issue(p_cert uuid, p_school uuid, p_actor uuid, p_data jsonb, p_issued_on date, p_dues numeric, p_override text)
  RETURNS public.certificates LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
  AS $$
DECLARE c public.certificates; t public.certificate_types; o public.certificates; n int;
BEGIN
  SELECT * INTO c FROM public.certificates WHERE id = p_cert AND school_id = p_school FOR UPDATE;
  IF c.id IS NULL THEN RAISE EXCEPTION 'certificate not found' USING ERRCODE = 'P0002'; END IF;
  IF c.status NOT IN ('draft', 'pending') THEN RAISE EXCEPTION 'this certificate has already been issued' USING ERRCODE = '55000'; END IF;
  SELECT * INTO t FROM public.certificate_types WHERE id = c.type_id;
  IF c.duplicate_of IS NOT NULL THEN
    SELECT * INTO o FROM public.certificates WHERE id = c.duplicate_of;
    c.serial := o.serial; c.number := o.number;
  ELSE
    INSERT INTO public.doc_counters (school_id, kind, session, last_no) VALUES (p_school, 'cert:' || c.type_id::text, 'all', 1)
      ON CONFLICT (school_id, kind, session) DO UPDATE SET last_no = doc_counters.last_no + 1
      RETURNING last_no INTO n;
    c.serial := n; c.number := t.prefix || '/' || lpad(n::text, 4, '0');
  END IF;
  UPDATE public.certificates SET status = 'issued', serial = c.serial, number = c.number, data = p_data, issued_on = p_issued_on,
      dues = p_dues, dues_override = p_override, approved_by = p_actor, approved_at = now(), returned_note = NULL
    WHERE id = c.id RETURNING * INTO c;
  RETURN c;
END $$;
REVOKE ALL ON FUNCTION public.certificate_issue(uuid, uuid, uuid, jsonb, date, numeric, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.certificate_issue(uuid, uuid, uuid, jsonb, date, numeric, text) TO service_role;

-- ── Bulk import: the past register ──────────────────────────────────────────

ALTER TABLE public.import_changes DROP CONSTRAINT import_changes_table_name_check;
ALTER TABLE public.import_changes ADD CONSTRAINT import_changes_table_name_check CHECK (table_name IN ('attendance', 'exam_marks',
  'legacy_results', 'fee_structures', 'fee_invoices', 'admission_applicants', 'students', 'enrolments', 'family_members',
  'student_health', 'emergency_contacts', 'family_primary', 'student_documents', 'certificates'));

-- One row per certificate issued before Sthara: matched on kind and number (and copy). Numbers are kept as printed;
-- Sthara own numbering for the kind continues past the highest serial. The server has resolved the kind to its
-- type (a kind the school has not set up is refused) and checked the printed values.
CREATE OR REPLACE FUNCTION public.import_certificates(p_job uuid, p_school uuid, p_actor uuid, p_rows jsonb, p_dry boolean)
  RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
  AS $$
DECLARE v_out jsonb; v_problems jsonb;
BEGIN
  DROP TABLE IF EXISTS pg_temp._r;
  CREATE TEMP TABLE _r ON COMMIT DROP AS
    SELECT x.*, s.id AS sid, s.status AS s_status, t.id AS tid,
      (SELECT c.id FROM public.certificates c WHERE c.type_id = t.id AND c.number = x.number AND c.copy_no = coalesce(x.copy_no, 0) LIMIT 1) AS cur_id
    FROM jsonb_to_recordset(p_rows) AS x(n int, admission_no text, type_id uuid, number text, serial int, copy_no int, issued_on date,
      cancelled boolean, cancel_reason text, data jsonb)
    LEFT JOIN public.students s ON s.school_id = p_school AND lower(s.admission_no) = lower(x.admission_no)
    LEFT JOIN public.certificate_types t ON t.id = x.type_id AND t.school_id = p_school;
  ALTER TABLE pg_temp._r ADD COLUMN changed boolean;
  UPDATE pg_temp._r r SET changed = r.cur_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.certificates c WHERE c.id = r.cur_id AND
    (c.data IS DISTINCT FROM c.data || coalesce(r.data, '{}') OR c.issued_on IS DISTINCT FROM r.issued_on
     OR (c.status = 'cancelled') IS DISTINCT FROM coalesce(r.cancelled, false))) WHERE true;
  SELECT coalesce(jsonb_agg(jsonb_build_object('n', n, 'error', e) ORDER BY n), '[]') INTO v_problems FROM (
    SELECT n, CASE
      WHEN sid IS NULL THEN 'No student with admission number ' || admission_no || ' on the register. Import the register first.'
      WHEN tid IS NULL THEN 'Unknown kind of certificate.'
      WHEN cur_id IS NOT NULL AND (SELECT c.student_id FROM public.certificates c WHERE c.id = _r.cur_id) <> sid
        THEN 'Certificate ' || number || ' is already on the register for another student.'
      WHEN cur_id IS NOT NULL AND (SELECT c.import_job_id IS NULL AND c.source <> 'import' FROM public.certificates c WHERE c.id = _r.cur_id)
        THEN 'Certificate ' || number || ' was issued in Sthara; the past register can''t change it.'
      WHEN coalesce(copy_no, 0) > 0 AND NOT EXISTS (SELECT 1 FROM pg_temp._r o WHERE o.tid = _r.tid AND o.number = _r.number AND coalesce(o.copy_no, 0) = 0)
        AND NOT EXISTS (SELECT 1 FROM public.certificates c WHERE c.type_id = _r.tid AND c.number = _r.number AND c.copy_no = 0)
        THEN 'A duplicate needs its original (copy 0) in the file or on the register.'
    END AS e FROM pg_temp._r) p WHERE e IS NOT NULL;
  SELECT jsonb_build_object('added', count(*) FILTER (WHERE cur_id IS NULL), 'updated', count(*) FILTER (WHERE changed),
    'unchanged', count(*) FILTER (WHERE cur_id IS NOT NULL AND NOT changed), 'problems', v_problems) INTO v_out FROM pg_temp._r;
  IF p_dry OR jsonb_array_length(v_problems) > 0 THEN RETURN v_out; END IF;

  PERFORM set_config('sthara.import_job', p_job::text, true);
  INSERT INTO public.import_changes (job_id, school_id, table_name, row_id, before)
    SELECT p_job, p_school, 'certificates', c.id, to_jsonb(c) FROM pg_temp._r JOIN public.certificates c ON c.id = _r.cur_id WHERE _r.changed
    ON CONFLICT (job_id, table_name, row_id) DO NOTHING;
  UPDATE public.certificates c SET data = c.data || coalesce(r.data, '{}'), issued_on = r.issued_on,
      status = CASE WHEN r.cancelled THEN 'cancelled' ELSE 'issued' END,
      cancel_reason = CASE WHEN r.cancelled THEN coalesce(r.cancel_reason, c.cancel_reason, 'Cancelled before Sthara') END,
      cancelled_at = CASE WHEN r.cancelled THEN coalesce(c.cancelled_at, now()) END, import_job_id = p_job
    FROM pg_temp._r r WHERE c.id = r.cur_id AND r.changed;
  -- Originals first, so duplicates can point at them.
  INSERT INTO public.certificates (school_id, student_id, type_id, status, serial, number, copy_no, data, issued_on, prepared_by, approved_at,
      cancelled_at, cancel_reason, source, import_job_id)
    SELECT p_school, sid, tid, CASE WHEN cancelled THEN 'cancelled' ELSE 'issued' END, serial, number, 0, coalesce(data, '{}'), issued_on, p_actor, now(),
      CASE WHEN cancelled THEN now() END, CASE WHEN cancelled THEN coalesce(cancel_reason, 'Cancelled before Sthara') END, 'import', p_job
    FROM pg_temp._r WHERE cur_id IS NULL AND coalesce(copy_no, 0) = 0;
  INSERT INTO public.certificates (school_id, student_id, type_id, status, serial, number, copy_no, duplicate_of, data, issued_on, prepared_by, approved_at,
      cancelled_at, cancel_reason, source, import_job_id)
    SELECT p_school, r.sid, r.tid, CASE WHEN r.cancelled THEN 'cancelled' ELSE 'issued' END, r.serial, r.number, r.copy_no,
      (SELECT o.id FROM public.certificates o WHERE o.type_id = r.tid AND o.number = r.number AND o.copy_no = 0), coalesce(r.data, '{}'), r.issued_on, p_actor, now(),
      CASE WHEN r.cancelled THEN now() END, CASE WHEN r.cancelled THEN coalesce(r.cancel_reason, 'Cancelled before Sthara') END, 'import', p_job
    FROM pg_temp._r r WHERE r.cur_id IS NULL AND coalesce(r.copy_no, 0) > 0;
  -- Sthara numbering continues past the highest imported serial of each kind.
  INSERT INTO public.doc_counters (school_id, kind, session, last_no)
    SELECT p_school, 'cert:' || tid::text, 'all', max(serial) FROM pg_temp._r WHERE serial IS NOT NULL GROUP BY tid
    ON CONFLICT (school_id, kind, session) DO UPDATE SET last_no = greatest(doc_counters.last_no, EXCLUDED.last_no);
  RETURN v_out;
END $$;
REVOKE ALL ON FUNCTION public.import_certificates(uuid, uuid, uuid, jsonb, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.import_certificates(uuid, uuid, uuid, jsonb, boolean) TO service_role;

-- Undo learns certificates (imported ones removed, or put back), and a register entry with a certificate stays.
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
    'enrolments', 'family_members', 'student_health', 'emergency_contacts', 'student_documents', 'certificates'] LOOP
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
  FOREACH t IN ARRAY ARRAY['attendance', 'exam_marks', 'legacy_results', 'fee_structures', 'health_events', 'student_health', 'student_documents',
    'certificates', 'emergency_contacts', 'family_members', 'enrolments', 'students', 'admission_applicants', 'fee_invoices'] LOOP
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
          OR EXISTS (SELECT 1 FROM public.student_documents d WHERE d.student_id = x.id AND d.import_job_id IS DISTINCT FROM $1)
          OR EXISTS (SELECT 1 FROM public.certificates c WHERE c.student_id = x.id AND c.import_job_id IS DISTINCT FROM $1)
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
