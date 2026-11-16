-- Applied to the live database 2026-11-15 (approved by Moses).
-- Review fixes for the knowledge base (2026-11-15).
--   bank_items' touch trigger skips the knowledge-base jobs (they set sthara.kb_job = 'on'): auto-tags, difficulty,
--   duplicate marks and answer checks are not edits, so they must not make an uploaded question look "changed since"
--   and survive an import undo.
--   import_question_bank(): a question already in Sthara's shared bank is not copied into the school's bank (counted as
--   in_sthara_bank); the check that could never fire is gone.

CREATE OR REPLACE FUNCTION app.touch_bank_items() RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public', 'pg_temp'
AS $function$ BEGIN
  IF coalesce(current_setting('sthara.kb_job', true), '') <> 'on' THEN NEW.updated_at := now(); END IF;
  RETURN NEW;
END $function$;
REVOKE ALL ON FUNCTION app.touch_bank_items() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_touch_bank_items ON public.bank_items;
CREATE TRIGGER trg_touch_bank_items BEFORE UPDATE ON public.bank_items FOR EACH ROW EXECUTE FUNCTION app.touch_bank_items();

CREATE OR REPLACE FUNCTION public.import_question_bank(p_job uuid, p_school uuid, p_actor uuid, p_rows jsonb, p_dry boolean)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_out jsonb; v_problems jsonb;
BEGIN
  DROP TABLE IF EXISTS pg_temp._r;
  CREATE TEMP TABLE _r ON COMMIT DROP AS
    SELECT x.*, (SELECT b.id FROM public.bank_items b WHERE b.school_id = p_school AND b.language = x.language AND b.fingerprint = x.fingerprint LIMIT 1) AS cur_id,
      (SELECT b.id FROM public.bank_items b WHERE b.school_id IS NULL AND b.language = x.language AND b.fingerprint = x.fingerprint LIMIT 1) AS sthara_id
    FROM jsonb_to_recordset(p_rows) AS x(n int, class text, subject text, chapter_key text, topic text, competency text, qtype text, marks int,
      language text, body jsonb, fingerprint text, source_ref text, session text);
  ALTER TABLE pg_temp._r ADD COLUMN changed boolean;
  UPDATE pg_temp._r r SET changed = r.cur_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.bank_items b WHERE b.id = r.cur_id AND
    (r.class, r.subject, CASE WHEN r.chapter_key = 'untagged' THEN b.chapter_key ELSE r.chapter_key END, coalesce(r.topic, b.topic), r.competency, r.qtype, r.marks, r.body,
     coalesce(r.source_ref, b.source_ref), coalesce(r.session, b.session))
    IS DISTINCT FROM (b.class, b.subject, b.chapter_key, b.topic, b.competency, b.qtype, b.marks, b.body, b.source_ref, b.session)) WHERE true;
  SELECT coalesce(jsonb_agg(jsonb_build_object('n', n, 'error', e) ORDER BY n), '[]') INTO v_problems FROM (
    SELECT n, CASE
      WHEN qtype NOT IN ('mcq', 'assertion_reason', 'short', 'long', 'case', 'numerical', 'diagram') THEN 'Unknown question type.'
    END AS e FROM pg_temp._r) p WHERE e IS NOT NULL;
  SELECT jsonb_build_object('added', count(*) FILTER (WHERE cur_id IS NULL AND sthara_id IS NULL), 'in_sthara_bank', count(*) FILTER (WHERE cur_id IS NULL AND sthara_id IS NOT NULL), 'updated', count(*) FILTER (WHERE changed),
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
    FROM pg_temp._r WHERE cur_id IS NULL AND sthara_id IS NULL;
  RETURN v_out;
END $function$;

REVOKE ALL ON FUNCTION public.import_question_bank(uuid, uuid, uuid, jsonb, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.import_question_bank(uuid, uuid, uuid, jsonb, boolean) TO service_role;
