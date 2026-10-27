-- Admissions phase 3: working enquiries. Each applicant has a counsellor who owns them and a next follow-up date;
-- every call, visit and message is logged; families get a WhatsApp message as they reach a stage (each school writes
-- its own, per stage; a family can reply STOP); the public can ask about admission from the school's apply page or
-- its QR poster, without signing in; and the office is warned of likely duplicates.

-- ── Ownership and follow-up ──────────────────────────────────────────────────
ALTER TABLE public.admission_applicants
  ADD COLUMN owner_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN follow_up_on date,
  -- The family asked for no WhatsApp messages about this application (STOP, or told the office).
  ADD COLUMN whatsapp_opt_out boolean NOT NULL DEFAULT false;
CREATE INDEX admission_applicants_follow_up ON public.admission_applicants (school_id, follow_up_on) WHERE follow_up_on IS NOT NULL;
CREATE INDEX admission_applicants_guardian_phone ON public.admission_applicants (guardian_phone) WHERE guardian_phone IS NOT NULL;

-- How they heard: the QR poster too.
ALTER TABLE public.admission_applicants DROP CONSTRAINT admission_applicants_source_check;
ALTER TABLE public.admission_applicants ADD CONSTRAINT admission_applicants_source_check
  CHECK (source IN ('walk_in', 'website', 'qr', 'referral', 'sibling', 'event', 'advertisement', 'other'));

-- ── The contact log ─────────────────────────────────────────────────────────
-- kind: how; outcome: for calls; auto: written by Sthara (a stage message sent, an enquiry made again online).
CREATE TABLE public.admission_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  applicant_id uuid NOT NULL REFERENCES public.admission_applicants(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('call', 'whatsapp', 'visit', 'email', 'sms', 'note')),
  direction text CHECK (direction IS NULL OR direction IN ('out', 'in')),
  outcome text CHECK (outcome IS NULL OR outcome IN ('reached', 'no_answer', 'busy', 'wrong_number', 'callback', 'interested', 'not_interested')),
  note text CHECK (note IS NULL OR length(note) <= 1000),
  follow_up_on date,
  auto boolean NOT NULL DEFAULT false,
  actor_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX admission_contacts_applicant ON public.admission_contacts (applicant_id, at DESC);

-- ── Stage messages ──────────────────────────────────────────────────────────
-- The WhatsApp message a family gets on reaching a stage ({child}, {school}, {stage} filled in); blank sends nothing.
ALTER TABLE public.admission_stages ADD COLUMN message text CHECK (message IS NULL OR length(message) BETWEEN 1 AND 600);

-- The outbox: a row for each message owed, written as the applicant reaches the stage (also by the overnight sweep,
-- when a waitlisted family gets a seat); the server sends what is queued (lib/admin/crmServer flushOutbox).
CREATE TABLE public.admission_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  applicant_id uuid NOT NULL REFERENCES public.admission_applicants(id) ON DELETE CASCADE,
  stage text NOT NULL,
  phone_e164 text NOT NULL,
  body text NOT NULL CHECK (length(body) <= 1200),
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'sending', 'sent', 'simulated', 'skipped', 'failed')),
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz
);
CREATE INDEX admission_messages_queue ON public.admission_messages (school_id, created_at) WHERE status = 'queued';
CREATE INDEX admission_messages_applicant ON public.admission_messages (applicant_id, created_at DESC);

-- An Indian mobile as +91 and ten digits; anything else written in full is kept; otherwise null.
CREATE OR REPLACE FUNCTION app.admission_e164(p text) RETURNS text
  LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN d ~ '^(91)?[6-9]\d{9}$' THEN '+91' || right(d, 10)
    WHEN d ~ '^0[6-9]\d{9}$' THEN '+91' || right(d, 10)
    WHEN p ~ '^\+[1-9]\d{7,14}$' THEN p
    ELSE NULL END
  FROM (SELECT regexp_replace(coalesce(p, ''), '\D', '', 'g') AS d) x
$$;

CREATE OR REPLACE FUNCTION app.admission_queue_message() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
  AS $$
DECLARE a record; v_msg text; v_label text; v_school text; v_phone text;
BEGIN
  IF NEW.from_stage IS NOT DISTINCT FROM NEW.to_stage THEN RETURN NEW; END IF;
  SELECT message, label INTO v_msg, v_label FROM public.admission_stages WHERE school_id = NEW.school_id AND key = NEW.to_stage;
  IF v_msg IS NULL THEN RETURN NEW; END IF;
  SELECT name, family_phone, guardian_phone, whatsapp_opt_out, channel, submitted_at INTO a FROM public.admission_applicants WHERE id = NEW.applicant_id;
  -- A family's online draft gets nothing until they send it (sending writes its own event).
  IF a.whatsapp_opt_out OR (a.channel IN ('online', 'portal') AND a.submitted_at IS NULL) THEN RETURN NEW; END IF;
  v_phone := coalesce(a.family_phone, app.admission_e164(a.guardian_phone));
  IF v_phone IS NULL THEN RETURN NEW; END IF;
  -- Once a stage: reaching it again (reopened, or an office applicant the family then sends) sends nothing more.
  IF EXISTS (SELECT 1 FROM public.admission_messages WHERE applicant_id = NEW.applicant_id AND stage = NEW.to_stage AND status <> 'failed') THEN RETURN NEW; END IF;
  SELECT name INTO v_school FROM public.schools WHERE id = NEW.school_id;
  INSERT INTO public.admission_messages (school_id, applicant_id, stage, phone_e164, body)
    VALUES (NEW.school_id, NEW.applicant_id, NEW.to_stage, v_phone,
      left(replace(replace(replace(v_msg, '{child}', a.name), '{school}', coalesce(v_school, 'the school')), '{stage}', v_label), 1100));
  RETURN NEW;
END $$;
CREATE TRIGGER trg_admission_queue_message AFTER INSERT ON public.admission_events FOR EACH ROW EXECUTE FUNCTION app.admission_queue_message();

-- ── Stages: save the messages too ───────────────────────────────────────────
-- As in 20261030090000, plus message on each own stage, on Offer and on Enrolled.
CREATE OR REPLACE FUNCTION public.admission_set_stages(p_school uuid, p_stages jsonb) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
  AS $$
DECLARE r jsonb; i int := 0; v_key text; v_base text; v_label text; v_keys text[] := '{}'; v_n int; v_stuck record; v_days int; v_req text[]; v_msg text;
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
    v_msg := nullif(trim(coalesce(r->>'message', '')), '');
    IF length(v_msg) > 600 THEN RAISE EXCEPTION 'Stage messages are up to 600 characters.' USING ERRCODE = '22023'; END IF;
    v_key := nullif(r->>'key', '');
    IF v_key IS NULL THEN
      v_base := left(trim(both '_' from regexp_replace(lower(v_label), '[^a-z0-9]+', '_', 'g')), 24);
      IF v_base !~ '^[a-z]' THEN v_base := 's_' || v_base; END IF;
      IF length(v_base) < 2 OR v_base IN ('rejected', 'withdrawn', 'reopen', 'offer', 'enrolled') THEN v_base := 'stage_' || i; END IF;
      v_key := v_base; v_n := 1;
      WHILE EXISTS (SELECT 1 FROM public.admission_stages WHERE school_id = p_school AND key = v_key) LOOP
        v_n := v_n + 1; v_key := left(v_base, 24) || '_' || v_n;
      END LOOP;
      INSERT INTO public.admission_stages (school_id, key, label, position, system, active, requires, message)
        VALUES (p_school, v_key, v_label, i, NULL, coalesce((r->>'active')::boolean, true), v_req, v_msg);
    ELSE
      UPDATE public.admission_stages SET label = v_label, position = i, active = coalesce((r->>'active')::boolean, true), requires = v_req, message = v_msg
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
  -- Messages on Offer and Enrolled: only when sent (a key left out keeps what is saved).
  FOREACH v_key IN ARRAY ARRAY['offer', 'enrolled'] LOOP
    IF p_stages->v_key ? 'message' THEN
      v_msg := nullif(trim(coalesce(p_stages->v_key->>'message', '')), '');
      IF length(v_msg) > 600 THEN RAISE EXCEPTION 'Stage messages are up to 600 characters.' USING ERRCODE = '22023'; END IF;
      UPDATE public.admission_stages SET message = v_msg WHERE school_id = p_school AND system = v_key;
    END IF;
  END LOOP;
  IF (SELECT count(*) FROM public.admission_stages WHERE school_id = p_school AND active) <>
     (SELECT count(DISTINCT lower(label)) FROM public.admission_stages WHERE school_id = p_school AND active) THEN
    RAISE EXCEPTION 'Two stages have the same name.' USING ERRCODE = '22023';
  END IF;
END $$;

-- ── Access ──────────────────────────────────────────────────────────────────
-- Served by the server only (service role), like the documents.
ALTER TABLE public.admission_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admission_messages ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.admission_contacts FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.admission_messages FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.admission_contacts TO service_role;
GRANT ALL ON public.admission_messages TO service_role;
REVOKE ALL ON FUNCTION app.admission_queue_message() FROM PUBLIC;
