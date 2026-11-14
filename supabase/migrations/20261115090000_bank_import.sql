-- A school's own past papers into its question bank through Data Import (decisions of 2026-11-14): usable at once,
-- marked 'school_upload' and 'unreviewed' until a subject lead approves; an upload can be undone like any import.
--   bank_items.import_job_id   which import added or last changed a question (for undo)
--   import_question_bank()     the writer (dry run and commit), as the other import_* writers
--   import_undo()              learns bank_items: changed questions get their before-image back; added ones go, unless
--                              a set already used them or they are the original a copy points at

ALTER TABLE public.bank_items ADD COLUMN IF NOT EXISTS import_job_id uuid REFERENCES public.import_jobs(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS bank_items_import_job ON public.bank_items (import_job_id) WHERE import_job_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.import_question_bank(p_job uuid, p_school uuid, p_actor uuid, p_rows jsonb, p_dry boolean)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_out jsonb; v_problems jsonb;
BEGIN
  DROP TABLE IF EXISTS pg_temp._r;
  CREATE TEMP TABLE _r ON COMMIT DROP AS
    SELECT x.*, (SELECT b.id FROM public.bank_items b WHERE b.school_id = p_school AND b.language = x.language AND b.fingerprint = x.fingerprint LIMIT 1) AS cur_id
    FROM jsonb_to_recordset(p_rows) AS x(n int, class text, subject text, chapter_key text, topic text, competency text, qtype text, marks int,
      language text, body jsonb, fingerprint text, source_ref text, session text);
  ALTER TABLE pg_temp._r ADD COLUMN changed boolean;
  UPDATE pg_temp._r r SET changed = r.cur_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.bank_items b WHERE b.id = r.cur_id AND
    (r.class, r.subject, CASE WHEN r.chapter_key = 'untagged' THEN b.chapter_key ELSE r.chapter_key END, coalesce(r.topic, b.topic), r.competency, r.qtype, r.marks, r.body,
     coalesce(r.source_ref, b.source_ref), coalesce(r.session, b.session))
    IS DISTINCT FROM (b.class, b.subject, b.chapter_key, b.topic, b.competency, b.qtype, b.marks, b.body, b.source_ref, b.session)) WHERE true;
  SELECT coalesce(jsonb_agg(jsonb_build_object('n', n, 'error', e) ORDER BY n), '[]') INTO v_problems FROM (
    SELECT n, CASE
      WHEN (SELECT b.scope FROM public.bank_items b WHERE b.id = cur_id) = 'sthara' THEN 'This question is already in Sthara''s bank.'
      WHEN qtype NOT IN ('mcq', 'assertion_reason', 'short', 'long', 'case', 'numerical', 'diagram') THEN 'Unknown question type.'
    END AS e FROM pg_temp._r) p WHERE e IS NOT NULL;
  SELECT jsonb_build_object('added', count(*) FILTER (WHERE cur_id IS NULL), 'updated', count(*) FILTER (WHERE changed),
    'unchanged', count(*) FILTER (WHERE cur_id IS NOT NULL AND NOT changed), 'problems', v_problems) INTO v_out FROM pg_temp._r;
  IF p_dry OR jsonb_array_length(v_problems) > 0 THEN RETURN v_out; END IF;

  PERFORM set_config('sthara.import_job', p_job::text, true);
  INSERT INTO public.import_changes (job_id, school_id, table_name, row_id, before)
    SELECT p_job, p_school, 'bank_items', b.id, to_jsonb(b) FROM pg_temp._r JOIN public.bank_items b ON b.id = _r.cur_id WHERE _r.changed
    ON CONFLICT (job_id, table_name, row_id) DO NOTHING;
  UPDATE public.bank_items b SET class = r.class, subject = r.subject,
      chapter_key = CASE WHEN r.chapter_key = 'untagged' THEN b.chapter_key ELSE r.chapter_key END, topic = coalesce(r.topic, b.topic),
      competency = r.competency, qtype = r.qtype, marks = r.marks, body = r.body, source_ref = coalesce(r.source_ref, b.source_ref),
      session = coalesce(r.session, b.session), import_job_id = p_job
    FROM pg_temp._r r WHERE b.id = r.cur_id AND r.changed;
  INSERT INTO public.bank_items (scope, school_id, class, subject, chapter_key, topic, competency, qtype, marks, language, body, status, source,
      source_ref, fingerprint, session, checks, created_by, import_job_id)
    SELECT 'school', p_school, class, subject, chapter_key, topic, competency, qtype, marks, language, body, 'unreviewed', 'school_upload',
      source_ref, fingerprint, session, '{}'::jsonb, p_actor, p_job
    FROM pg_temp._r WHERE cur_id IS NULL;
  RETURN v_out;
END $function$;

REVOKE ALL ON FUNCTION public.import_question_bank(uuid, uuid, uuid, jsonb, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.import_question_bank(uuid, uuid, uuid, jsonb, boolean) TO service_role;

CREATE OR REPLACE FUNCTION public.import_undo(p_job uuid, p_limit integer DEFAULT 5000)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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

  -- 0. House placements this import opened go first (unless changed since), so the ones it closed can reopen:
  --    a student has one open placement at a time.
  WITH del AS (DELETE FROM public.house_members x WHERE x.import_job_id = p_job AND x.to_date IS NULL AND x.updated_at <= j.committed_at
      AND NOT EXISTS (SELECT 1 FROM public.import_changes i WHERE i.job_id = p_job AND i.table_name = 'house_members' AND i.row_id = x.id)
    RETURNING x.id)
  SELECT count(*) INTO v_n FROM del;
  v_removed := v_removed + v_n;

  -- 1. Overwritten rows: restore the before-image, unless the row changed after the import.
  FOREACH t IN ARRAY ARRAY['attendance', 'exam_marks', 'legacy_results', 'fee_structures', 'fee_invoices', 'admission_applicants', 'students',
    'enrolments', 'family_members', 'student_health', 'emergency_contacts', 'student_documents', 'certificates', 'house_members', 'cc_memberships', 'kirti_entries', 'bank_items'] LOOP
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
        -- Another open placement since (opened by hand after the import): the closed one stays closed.
        WHEN 'house_members' THEN 'AND NOT ((c.before ->> ''to_date'') IS NULL AND EXISTS (SELECT 1 FROM public.house_members o
          WHERE o.student_id = x.student_id AND o.to_date IS NULL AND o.id <> x.id))'
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
    'certificates', 'kirti_entries', 'cc_memberships', 'house_members', 'emergency_contacts', 'family_members', 'enrolments', 'students', 'admission_applicants', 'fee_invoices', 'bank_items'] LOOP
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
          OR EXISTS (SELECT 1 FROM public.house_members h WHERE h.student_id = x.id AND h.import_job_id IS DISTINCT FROM $1)
          OR EXISTS (SELECT 1 FROM public.cc_memberships m WHERE m.student_id = x.id AND m.import_job_id IS DISTINCT FROM $1)
          OR EXISTS (SELECT 1 FROM public.kirti_entries k WHERE k.student_id = x.id AND k.import_job_id IS DISTINCT FROM $1)
          OR EXISTS (SELECT 1 FROM public.discipline_actions a WHERE a.student_id = x.id)
          OR EXISTS (SELECT 1 FROM public.counselling_cases c WHERE c.student_id = x.id)
          OR EXISTS (SELECT 1 FROM public.counselling_referrals r WHERE r.student_id = x.id)
          OR EXISTS (SELECT 1 FROM public.student_change_requests r WHERE r.student_id = x.id)
          OR EXISTS (SELECT 1 FROM public.sibling_links l WHERE (l.a = x.id OR l.b = x.id) AND l.status <> ''suggested'')'
        -- A family member linked to a parent login since stays.
        WHEN 'family_members' THEN 'OR x.user_id IS NOT NULL'
        -- A question already used in a set or marked as the original of a copy stays in the bank.
        WHEN 'bank_items' THEN 'OR EXISTS (SELECT 1 FROM public.bank_item_uses u WHERE u.item_id = x.id) OR EXISTS (SELECT 1 FROM public.bank_items o WHERE o.dup_of = x.id)'
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
END $function$
;
