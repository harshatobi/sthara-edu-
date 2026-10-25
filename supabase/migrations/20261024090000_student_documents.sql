-- Living Record 04: documents in. The documents a school keeps on a student's record (birth certificate, TC,
-- certificates, signed forms), the parent's request to erase one, and the documents import (a manifest plus the files).
--
-- Files live in the private 'student-docs' bucket, up to 25 MB, any type; the server signs short-lived links, and only
-- PDFs and images ever open in the browser. Kept permanently: removed only on an approved DPDP erasure request or when
-- the school leaves Sthara. Screens read through the server, so signed-in users get no direct access to the table.

CREATE TABLE public.student_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind ~ '^[a-z_]{2,40}$'),
  title text NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 120),
  document_no text CHECK (document_no IS NULL OR length(document_no) <= 60),
  issued_on date,
  valid_until date CHECK (valid_until IS NULL OR issued_on IS NULL OR valid_until >= issued_on),
  storage_path text NOT NULL UNIQUE CHECK (length(storage_path) <= 400),
  file_name text NOT NULL CHECK (length(file_name) BETWEEN 1 AND 200),
  size_bytes bigint CHECK (size_bytes IS NULL OR size_bytes BETWEEN 0 AND 26214400),
  -- What the first bytes say it is (application/pdf or an image), once the server has looked; anything else downloads.
  inline_type text CHECK (inline_type IS NULL OR inline_type IN ('application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'none')),
  status text NOT NULL DEFAULT 'awaiting' CHECK (status IN ('awaiting', 'verified', 'rejected')),
  source text NOT NULL CHECK (source IN ('office', 'parent', 'import')),
  uploaded_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  verified_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  verified_at timestamptz,
  reject_note text CHECK (reject_note IS NULL OR length(reject_note) <= 300),
  CHECK (status <> 'verified' OR verified_at IS NOT NULL),
  CHECK (status <> 'rejected' OR reject_note IS NOT NULL),
  import_job_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX student_documents_student ON public.student_documents (student_id, kind);
CREATE INDEX student_documents_awaiting ON public.student_documents (school_id, created_at) WHERE status = 'awaiting';
CREATE INDEX student_documents_import_job ON public.student_documents (import_job_id) WHERE import_job_id IS NOT NULL;
CREATE TRIGGER trg_touch_student_documents BEFORE UPDATE ON public.student_documents FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
CREATE TRIGGER trg_audit_student_documents AFTER INSERT OR DELETE OR UPDATE ON public.student_documents FOR EACH ROW EXECUTE FUNCTION app.audit();

ALTER TABLE public.student_documents ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.student_documents FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.student_documents TO service_role;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  VALUES ('student-docs', 'student-docs', false, 26214400, NULL)
  ON CONFLICT (id) DO NOTHING;

-- A parent asks the school to erase a document (DPDP); target_id is the document.
ALTER TABLE public.student_change_requests DROP CONSTRAINT student_change_requests_kind_check;
ALTER TABLE public.student_change_requests ADD CONSTRAINT student_change_requests_kind_check
  CHECK (kind IN ('address', 'family', 'emergency', 'health', 'document_erasure'));

-- ── Bulk import: documents ──────────────────────────────────────────────────

ALTER TABLE public.import_changes DROP CONSTRAINT import_changes_table_name_check;
ALTER TABLE public.import_changes ADD CONSTRAINT import_changes_table_name_check CHECK (table_name IN ('attendance', 'exam_marks',
  'legacy_results', 'fee_structures', 'fee_invoices', 'admission_applicants', 'students', 'enrolments', 'family_members',
  'student_health', 'emergency_contacts', 'family_primary', 'student_documents'));

-- One row per document: matched on admission number, kind and file name. The server has already found each file in
-- the job's upload folder and passes where it is. A match keeps its file and takes the new details; verified = true
-- marks it verified by whoever commits (an operator leaves verified_by empty).
CREATE OR REPLACE FUNCTION public.import_documents(p_job uuid, p_school uuid, p_actor uuid, p_rows jsonb, p_dry boolean)
  RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
  AS $$
DECLARE v_out jsonb; v_problems jsonb;
BEGIN
  DROP TABLE IF EXISTS pg_temp._r;
  CREATE TEMP TABLE _r ON COMMIT DROP AS
    SELECT x.*, s.id AS sid, s.status AS s_status,
      (SELECT d.id FROM public.student_documents d WHERE d.student_id = s.id AND d.kind = x.kind AND lower(d.file_name) = lower(x.file_name)
        ORDER BY d.created_at LIMIT 1) AS cur_id
    FROM jsonb_to_recordset(p_rows) AS x(n int, admission_no text, kind text, title text, default_title text, document_no text, issued_on date, valid_until date,
      verified boolean, storage_path text, file_name text, size_bytes bigint)
    LEFT JOIN public.students s ON s.school_id = p_school AND lower(s.admission_no) = lower(x.admission_no);
  ALTER TABLE pg_temp._r ADD COLUMN changed boolean;
  UPDATE pg_temp._r r SET changed = r.cur_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.student_documents d WHERE d.id = r.cur_id AND
    ((coalesce(r.title, d.title), coalesce(r.document_no, d.document_no), coalesce(r.issued_on, d.issued_on), coalesce(r.valid_until, d.valid_until))
      IS DISTINCT FROM (d.title, d.document_no, d.issued_on, d.valid_until)
     OR (r.verified IS TRUE AND d.status <> 'verified'))) WHERE true;
  SELECT coalesce(jsonb_agg(jsonb_build_object('n', n, 'error', e) ORDER BY n), '[]') INTO v_problems FROM (
    SELECT n, CASE
      WHEN sid IS NULL THEN 'No student with admission number ' || admission_no || ' on the register. Import the register first.'
      WHEN s_status = 'cancelled' THEN 'Admission number ' || admission_no || ' was cancelled on the register.'
      WHEN storage_path IS NULL OR storage_path NOT LIKE p_school::text || '/import/' || p_job::text || '/%' THEN 'The file for this row is not part of this import.'
      WHEN valid_until < issued_on THEN 'It can''t expire before it was issued.'
    END AS e FROM pg_temp._r) p WHERE e IS NOT NULL;
  SELECT jsonb_build_object('added', count(*) FILTER (WHERE cur_id IS NULL), 'updated', count(*) FILTER (WHERE changed),
    'unchanged', count(*) FILTER (WHERE cur_id IS NOT NULL AND NOT changed), 'problems', v_problems) INTO v_out FROM pg_temp._r;
  IF p_dry OR jsonb_array_length(v_problems) > 0 THEN RETURN v_out; END IF;

  PERFORM set_config('sthara.import_job', p_job::text, true);
  INSERT INTO public.import_changes (job_id, school_id, table_name, row_id, before)
    SELECT p_job, p_school, 'student_documents', d.id, to_jsonb(d) FROM pg_temp._r JOIN public.student_documents d ON d.id = _r.cur_id WHERE _r.changed
    ON CONFLICT (job_id, table_name, row_id) DO NOTHING;
  UPDATE public.student_documents d SET title = coalesce(r.title, d.title), document_no = coalesce(r.document_no, d.document_no),
      issued_on = coalesce(r.issued_on, d.issued_on), valid_until = coalesce(r.valid_until, d.valid_until),
      status = CASE WHEN r.verified IS TRUE THEN 'verified' ELSE d.status END,
      verified_by = CASE WHEN r.verified IS TRUE AND d.status <> 'verified' THEN p_actor ELSE d.verified_by END,
      verified_at = CASE WHEN r.verified IS TRUE AND d.status <> 'verified' THEN now() ELSE d.verified_at END,
      reject_note = CASE WHEN r.verified IS TRUE THEN NULL ELSE d.reject_note END,
      import_job_id = p_job
    FROM pg_temp._r r WHERE d.id = r.cur_id AND r.changed;
  INSERT INTO public.student_documents (school_id, student_id, kind, title, document_no, issued_on, valid_until, storage_path, file_name, size_bytes,
      status, source, uploaded_by, verified_by, verified_at, import_job_id)
    SELECT p_school, sid, kind, left(coalesce(title, default_title, 'Document'), 120), document_no, issued_on, valid_until, storage_path, file_name, size_bytes,
      CASE WHEN verified IS TRUE THEN 'verified' ELSE 'awaiting' END, 'import', p_actor,
      CASE WHEN verified IS TRUE THEN p_actor END, CASE WHEN verified IS TRUE THEN now() END, p_job
    FROM pg_temp._r WHERE cur_id IS NULL;
  RETURN v_out;
END $$;
REVOKE ALL ON FUNCTION public.import_documents(uuid, uuid, uuid, jsonb, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.import_documents(uuid, uuid, uuid, jsonb, boolean) TO service_role;

-- Undo learns student_documents (the files of removed rows are cleared from storage by the server afterwards), and a
-- register entry with documents from anywhere else stays.
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
    'enrolments', 'family_members', 'student_health', 'emergency_contacts', 'student_documents'] LOOP
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
    'emergency_contacts', 'family_members', 'enrolments', 'students', 'admission_applicants', 'fee_invoices'] LOOP
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
