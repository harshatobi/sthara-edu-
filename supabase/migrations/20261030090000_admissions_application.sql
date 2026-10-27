-- Admissions phase 2a: the full application (the register fields, address and family the school will need for the
-- register and, later, the transfer certificate), documents with the application, checks a stage can require, and
-- pre-primary classes (Nursery, LKG, UKG: grades -2 to 0, as on the register).
--
-- Application documents sit in the private student-docs bucket under <school>/applicants/<applicant>/; when the
-- student is admitted onto the register they move to the student record, keeping who verified them and when.
-- Screens read applicant documents through the server only (signed links), never through RLS.

-- ── Pre-primary ─────────────────────────────────────────────────────────────
ALTER TABLE public.admission_applicants DROP CONSTRAINT admission_applicants_grade_check;
ALTER TABLE public.admission_applicants ADD CONSTRAINT admission_applicants_grade_check CHECK (grade BETWEEN -2 AND 12);
ALTER TABLE public.admission_seats DROP CONSTRAINT admission_seats_grade_check;
ALTER TABLE public.admission_seats ADD CONSTRAINT admission_seats_grade_check CHECK (grade BETWEEN -2 AND 12);
ALTER TABLE public.admission_offers DROP CONSTRAINT admission_offers_grade_check;
ALTER TABLE public.admission_offers ADD CONSTRAINT admission_offers_grade_check CHECK (grade BETWEEN -2 AND 12);

-- ── The application ─────────────────────────────────────────────────────────
-- form: {fields: {register key: value}, address, permanent_same, permanent_address, family: [member]}, checked by the
-- server with the register rules (lib/students/register) so admission copies it across as it is.
ALTER TABLE public.admission_applicants
  ADD COLUMN form jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(form) = 'object' AND pg_column_size(form) <= 32768),
  ADD COLUMN applied_on date,
  ADD COLUMN channel text NOT NULL DEFAULT 'office' CHECK (channel IN ('office', 'online', 'portal', 'import'));

-- A stage can require checks before an applicant leaves it: documents (every checklist document for the grade
-- verified) and age (old enough, not too old, for the grade on the cut-off date).
ALTER TABLE public.admission_stages ADD COLUMN requires text[] NOT NULL DEFAULT '{}'
  CHECK (requires <@ ARRAY['documents', 'age']::text[]);

-- ── Documents with the application ──────────────────────────────────────────
CREATE TABLE public.admission_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  applicant_id uuid NOT NULL REFERENCES public.admission_applicants(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind ~ '^[a-z_]{2,40}$'),
  title text NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 120),
  document_no text CHECK (document_no IS NULL OR length(document_no) <= 60),
  issued_on date,
  valid_until date CHECK (valid_until IS NULL OR issued_on IS NULL OR valid_until >= issued_on),
  storage_path text NOT NULL UNIQUE CHECK (length(storage_path) <= 400),
  file_name text NOT NULL CHECK (length(file_name) BETWEEN 1 AND 200),
  size_bytes bigint CHECK (size_bytes IS NULL OR size_bytes BETWEEN 0 AND 26214400),
  inline_type text CHECK (inline_type IS NULL OR inline_type IN ('application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'none')),
  status text NOT NULL DEFAULT 'awaiting' CHECK (status IN ('awaiting', 'verified', 'rejected')),
  -- office: staff uploaded it; family: the family did (online application, phase 2b).
  source text NOT NULL CHECK (source IN ('office', 'family')),
  uploaded_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  verified_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  verified_at timestamptz,
  reject_note text CHECK (reject_note IS NULL OR length(reject_note) <= 300),
  -- Set when the student is admitted and the file moves to their record.
  moved_to uuid REFERENCES public.student_documents(id) ON DELETE SET NULL,
  moved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX admission_documents_applicant ON public.admission_documents (applicant_id);
CREATE TRIGGER trg_touch_admission_documents BEFORE UPDATE ON public.admission_documents FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
CREATE TRIGGER trg_audit_admission_documents AFTER INSERT OR DELETE OR UPDATE ON public.admission_documents FOR EACH ROW EXECUTE FUNCTION app.audit();

ALTER TABLE public.admission_documents ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.admission_documents FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.admission_documents TO service_role;

-- Documents moved from an application keep where they came from on the student record.
ALTER TABLE public.student_documents DROP CONSTRAINT student_documents_source_check;
ALTER TABLE public.student_documents ADD CONSTRAINT student_documents_source_check CHECK (source IN ('office', 'parent', 'import', 'admission'));

-- ── Stages: save the checks too ─────────────────────────────────────────────
-- As in 20261029100000, plus requires on each own stage ({key?, label, active, requires}).
CREATE OR REPLACE FUNCTION public.admission_set_stages(p_school uuid, p_stages jsonb) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
  AS $$
DECLARE r jsonb; i int := 0; v_key text; v_base text; v_label text; v_keys text[] := '{}'; v_n int; v_stuck record; v_days int; v_req text[];
BEGIN
  PERFORM public.admission_ensure_stages(p_school);
  PERFORM pg_advisory_xact_lock(hashtextextended('admission-stages:' || p_school, 0));
  IF jsonb_typeof(p_stages->'own') IS DISTINCT FROM 'array' OR jsonb_array_length(p_stages->'own') = 0 THEN
    RAISE EXCEPTION 'Keep at least one stage before Offer.' USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(p_stages->'own') > 12 THEN RAISE EXCEPTION 'At most 12 stages before Offer.' USING ERRCODE = '22023'; END IF;
  FOR r IN SELECT * FROM jsonb_array_elements(p_stages->'own') LOOP
    i := i + 1;
    v_label := trim(coalesce(r->>'label', ''));
    IF length(v_label) NOT BETWEEN 1 AND 40 THEN RAISE EXCEPTION 'Give every stage a name of up to 40 characters.' USING ERRCODE = '22023'; END IF;
    v_req := CASE WHEN jsonb_typeof(r->'requires') = 'array' THEN ARRAY(SELECT DISTINCT jsonb_array_elements_text(r->'requires')) ELSE '{}'::text[] END;
    IF NOT v_req <@ ARRAY['documents', 'age']::text[] THEN RAISE EXCEPTION 'A stage can require documents or the age check.' USING ERRCODE = '22023'; END IF;
    v_key := nullif(r->>'key', '');
    IF v_key IS NULL THEN
      v_base := left(trim(both '_' from regexp_replace(lower(v_label), '[^a-z0-9]+', '_', 'g')), 24);
      IF v_base !~ '^[a-z]' THEN v_base := 's_' || v_base; END IF;
      IF length(v_base) < 2 OR v_base IN ('rejected', 'withdrawn', 'reopen', 'offer', 'enrolled') THEN v_base := 'stage_' || i; END IF;
      v_key := v_base; v_n := 1;
      WHILE EXISTS (SELECT 1 FROM public.admission_stages WHERE school_id = p_school AND key = v_key) LOOP
        v_n := v_n + 1; v_key := left(v_base, 24) || '_' || v_n;
      END LOOP;
      INSERT INTO public.admission_stages (school_id, key, label, position, system, active, requires)
        VALUES (p_school, v_key, v_label, i, NULL, coalesce((r->>'active')::boolean, true), v_req);
    ELSE
      UPDATE public.admission_stages SET label = v_label, position = i, active = coalesce((r->>'active')::boolean, true), requires = v_req
        WHERE school_id = p_school AND key = v_key AND system IS NULL;
      IF NOT FOUND THEN RAISE EXCEPTION 'A stage changed while you were editing. Reload and try again.' USING ERRCODE = 'SA409'; END IF;
    END IF;
    v_keys := v_keys || v_key;
  END LOOP;
  IF EXISTS (SELECT 1 FROM public.admission_stages WHERE school_id = p_school AND system IS NULL AND NOT key = ANY (v_keys)) THEN
    RAISE EXCEPTION 'A stage changed while you were editing. Reload and try again.' USING ERRCODE = 'SA409';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.admission_stages WHERE school_id = p_school AND system IS NULL AND active) THEN
    RAISE EXCEPTION 'Keep at least one stage before Offer in use.' USING ERRCODE = '22023';
  END IF;
  SELECT s.label, count(*) AS n INTO v_stuck FROM public.admission_stages s JOIN public.admission_applicants a ON a.school_id = s.school_id AND a.stage = s.key
    WHERE s.school_id = p_school AND s.system IS NULL AND NOT s.active GROUP BY s.label ORDER BY count(*) DESC LIMIT 1;
  IF v_stuck.label IS NOT NULL THEN
    RAISE EXCEPTION '% applicant(s) are at %. Move them on before retiring it.', v_stuck.n, v_stuck.label USING ERRCODE = '22023';
  END IF;

  v_label := trim(coalesce(p_stages->'offer'->>'label', ''));
  v_days := nullif(p_stages->'offer'->>'respondDays', '')::int;
  IF v_label <> '' THEN
    IF length(v_label) > 40 THEN RAISE EXCEPTION 'Give every stage a name of up to 40 characters.' USING ERRCODE = '22023'; END IF;
    UPDATE public.admission_stages SET label = v_label WHERE school_id = p_school AND system = 'offer';
  END IF;
  IF v_days IS NOT NULL THEN
    IF v_days NOT BETWEEN 1 AND 90 THEN RAISE EXCEPTION 'Families need between 1 and 90 days to accept.' USING ERRCODE = '22023'; END IF;
    UPDATE public.admission_stages SET respond_days = v_days WHERE school_id = p_school AND system = 'offer';
  END IF;
  v_label := trim(coalesce(p_stages->'enrolled'->>'label', ''));
  IF v_label <> '' THEN
    IF length(v_label) > 40 THEN RAISE EXCEPTION 'Give every stage a name of up to 40 characters.' USING ERRCODE = '22023'; END IF;
    UPDATE public.admission_stages SET label = v_label WHERE school_id = p_school AND system = 'enrolled';
  END IF;
  IF (SELECT count(*) FROM public.admission_stages WHERE school_id = p_school AND active) <>
     (SELECT count(DISTINCT lower(label)) FROM public.admission_stages WHERE school_id = p_school AND active) THEN
    RAISE EXCEPTION 'Two stages have the same name.' USING ERRCODE = '22023';
  END IF;
END $$;
