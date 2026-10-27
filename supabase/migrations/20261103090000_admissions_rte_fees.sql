-- Admissions phase 4b: the RTE quota and admission fees.
--
-- RTE (Right to Education Act, section 12(1)(c)): a class can reserve seats for RTE admissions. RTE applicants hold
-- those seats and everyone else the rest, each with its own waitlist. Seats are allotted the way the school's state
-- works: the state portal's allotment is recorded on the applicant, or the school runs an auditable lottery (a
-- published seed and the list of entrants decide the order; anyone can recompute it). The RTE Act bars screening at
-- entry level, so an RTE waitlist goes by lottery rank, never by score.
--
-- Fees, recorded by the office (no payment gateway yet; mode 'gateway' is kept for one): the application fee (a stage
-- can require it), a seat deposit on an offer (an offer whose deposit is not paid by its date lapses and the seat goes
-- to the waitlist), and the admission fee (needed before enrolment). Each payment gets the school's next receipt
-- number for the admission year; a mistake is voided with a reason, never deleted.

-- ── RTE ─────────────────────────────────────────────────────────────────────
ALTER TABLE public.admission_applicants
  ADD COLUMN rte boolean NOT NULL DEFAULT false,
  ADD COLUMN rte_allotment_no text CHECK (rte_allotment_no IS NULL OR length(rte_allotment_no) <= 60),
  ADD COLUMN rte_allotted_on date,
  -- Place in the school's RTE lottery of the class (1 = first), when it ran one.
  ADD COLUMN rte_rank integer CHECK (rte_rank IS NULL OR rte_rank >= 1);
ALTER TABLE public.admission_seats ADD COLUMN rte_seats integer CHECK (rte_seats IS NULL OR (rte_seats >= 0 AND rte_seats <= capacity));

CREATE TABLE public.admission_rte_lotteries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  session text NOT NULL CHECK (session ~ '^\d{4}-\d{2}$'),
  grade integer NOT NULL CHECK (grade BETWEEN -2 AND 12),
  -- Random, published with the result: the order is sha256(seed || ':' || applicant id), lowest first.
  seed text NOT NULL CHECK (seed ~ '^[0-9a-f]{32}$'),
  seats integer,
  entrants uuid[] NOT NULL,
  ranked uuid[] NOT NULL,
  drawn_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  drawn_at timestamptz NOT NULL DEFAULT now(),
  note text CHECK (note IS NULL OR length(note) <= 300),
  UNIQUE (school_id, session, grade),
  CHECK (cardinality(entrants) = cardinality(ranked))
);
CREATE TRIGGER trg_audit_admission_rte_lotteries AFTER INSERT OR DELETE OR UPDATE ON public.admission_rte_lotteries FOR EACH ROW EXECUTE FUNCTION app.audit();

-- Seats still free in the pool an applicant draws on (RTE or general), or null when the class has no limit. With no
-- RTE seats reserved, everyone shares one pool. Call under the lock of the grade.
CREATE OR REPLACE FUNCTION app.admission_pool_left(p_school uuid, p_session text, p_grade integer, p_rte boolean) RETURNS integer
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
  AS $$
  SELECT CASE
    WHEN s.rte_seats IS NULL THEN s.capacity - (SELECT count(*)::int FROM public.admission_applicants a
      WHERE a.school_id = p_school AND a.session = p_session AND a.grade = p_grade AND a.stage IN ('offer', 'enrolled'))
    WHEN p_rte THEN s.rte_seats - (SELECT count(*)::int FROM public.admission_applicants a
      WHERE a.school_id = p_school AND a.session = p_session AND a.grade = p_grade AND a.stage IN ('offer', 'enrolled') AND a.rte)
    ELSE (s.capacity - s.rte_seats) - (SELECT count(*)::int FROM public.admission_applicants a
      WHERE a.school_id = p_school AND a.session = p_session AND a.grade = p_grade AND a.stage IN ('offer', 'enrolled') AND NOT a.rte)
  END
  FROM public.admission_seats s WHERE s.school_id = p_school AND s.session = p_session AND s.grade = p_grade;
$$;

-- Which pool an applicant is in: 'rte' only when the class reserves RTE seats.
CREATE OR REPLACE FUNCTION app.admission_pool(p_applicant uuid) RETURNS text
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
  AS $$
  SELECT CASE WHEN a.rte AND s.rte_seats IS NOT NULL THEN 'rte' ELSE 'general' END
  FROM public.admission_applicants a
  LEFT JOIN public.admission_seats s ON s.school_id = a.school_id AND s.session = a.session AND s.grade = a.grade
  WHERE a.id = p_applicant;
$$;

-- ── Fees ────────────────────────────────────────────────────────────────────
ALTER TABLE public.admission_offers
  ADD COLUMN deposit_due date,
  ADD COLUMN deposit_paid_at timestamptz;

CREATE TABLE public.admission_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  applicant_id uuid NOT NULL REFERENCES public.admission_applicants(id) ON DELETE RESTRICT,
  kind text NOT NULL CHECK (kind IN ('application', 'deposit', 'admission')),
  amount numeric(12,2) NOT NULL CHECK (amount > 0 AND amount <= 10000000),
  mode text NOT NULL CHECK (mode IN ('cash', 'upi', 'card', 'cheque', 'bank', 'gateway')),
  -- UPI transaction id, cheque number, bank reference, or the gateway's payment id.
  reference text CHECK (reference IS NULL OR length(reference) <= 80),
  paid_on date NOT NULL,
  receipt_no text NOT NULL,
  received_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  -- What a payment gateway reported, when one is connected.
  gateway jsonb,
  voided_at timestamptz,
  voided_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  void_reason text CHECK (void_reason IS NULL OR length(void_reason) BETWEEN 3 AND 300),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, receipt_no),
  CHECK ((mode IN ('upi', 'card', 'cheque', 'bank', 'gateway')) <= (reference IS NOT NULL)),
  CHECK ((voided_at IS NULL) = (void_reason IS NULL))
);
CREATE UNIQUE INDEX admission_payments_live ON public.admission_payments (applicant_id, kind) WHERE voided_at IS NULL;
CREATE TRIGGER trg_audit_admission_payments AFTER INSERT OR DELETE OR UPDATE ON public.admission_payments FOR EACH ROW EXECUTE FUNCTION app.audit();

-- Records a fee with the school's next receipt number for the admission year (ADM/2027-28/0001), under a lock so
-- two payments never share a number. A seat deposit marks the live offer as paid.
CREATE OR REPLACE FUNCTION public.admission_pay(p_school uuid, p_applicant uuid, p_kind text, p_amount numeric, p_mode text, p_reference text,
  p_paid_on date, p_actor uuid, p_gateway jsonb DEFAULT NULL) RETURNS jsonb
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
  AS $$
DECLARE a record; v_prefix text; v_n int; v_no text; v_id uuid;
BEGIN
  SELECT id, session, stage, student_id INTO a FROM public.admission_applicants WHERE id = p_applicant AND school_id = p_school;
  IF a.id IS NULL THEN RAISE EXCEPTION 'Applicant not found.' USING ERRCODE = 'P0002'; END IF;
  IF a.stage IN ('rejected', 'withdrawn') THEN RAISE EXCEPTION 'This application is closed.' USING ERRCODE = '22023'; END IF;
  IF p_kind = 'deposit' AND NOT EXISTS (SELECT 1 FROM public.admission_offers WHERE applicant_id = p_applicant AND status IN ('issued', 'accepted')) THEN
    RAISE EXCEPTION 'A seat deposit is paid against an offer that has gone out.' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM public.admission_payments WHERE applicant_id = p_applicant AND kind = p_kind AND voided_at IS NULL) THEN
    RAISE EXCEPTION 'This fee is already recorded. Void that receipt first if it was wrong.' USING ERRCODE = 'SA409';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('admission-receipt:' || p_school || ':' || a.session, 0));
  v_prefix := 'ADM/' || a.session || '/';
  SELECT coalesce(max(substring(receipt_no FROM length(v_prefix) + 1)::int), 0) + 1 INTO v_n
    FROM public.admission_payments WHERE school_id = p_school AND receipt_no LIKE v_prefix || '%' AND substring(receipt_no FROM length(v_prefix) + 1) ~ '^\d+$';
  v_no := v_prefix || lpad(v_n::text, 4, '0');
  INSERT INTO public.admission_payments (school_id, applicant_id, kind, amount, mode, reference, paid_on, receipt_no, received_by, gateway)
    VALUES (p_school, p_applicant, p_kind, p_amount, p_mode, nullif(trim(p_reference), ''), p_paid_on, v_no, p_actor, p_gateway) RETURNING id INTO v_id;
  IF p_kind = 'deposit' THEN
    UPDATE public.admission_offers SET deposit_paid_at = now() WHERE applicant_id = p_applicant AND status IN ('issued', 'accepted');
  END IF;
  RETURN jsonb_build_object('id', v_id, 'receiptNo', v_no);
END $$;

CREATE OR REPLACE FUNCTION public.admission_void_payment(p_school uuid, p_payment uuid, p_actor uuid, p_reason text) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
  AS $$
DECLARE p public.admission_payments;
BEGIN
  IF length(trim(coalesce(p_reason, ''))) < 3 THEN RAISE EXCEPTION 'Say why the receipt is voided.' USING ERRCODE = '22023'; END IF;
  SELECT * INTO p FROM public.admission_payments WHERE id = p_payment AND school_id = p_school FOR UPDATE;
  IF p.id IS NULL THEN RAISE EXCEPTION 'Receipt not found.' USING ERRCODE = 'P0002'; END IF;
  IF p.voided_at IS NOT NULL THEN RAISE EXCEPTION 'That receipt is already void.' USING ERRCODE = 'SA409'; END IF;
  UPDATE public.admission_payments SET voided_at = now(), voided_by = p_actor, void_reason = left(trim(p_reason), 300) WHERE id = p.id;
  -- A voided deposit is unpaid again: the offer lapses on its deposit date unless it is paid.
  IF p.kind = 'deposit' THEN
    UPDATE public.admission_offers SET deposit_paid_at = NULL WHERE applicant_id = p.applicant_id AND status IN ('issued', 'accepted');
  END IF;
END $$;

-- ── Offers: pools and the deposit ───────────────────────────────────────────
-- As in 20261029090000, plus: the deposit's due date when the school asks for one.
CREATE OR REPLACE FUNCTION app.admission_issue(p_offer uuid, p_actor uuid, p_note text) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
  AS $$
DECLARE o public.admission_offers; v_days int; v_from text; v_fees jsonb; v_deposit numeric; v_dep_days int;
BEGIN
  SELECT * INTO o FROM public.admission_offers WHERE id = p_offer FOR UPDATE;
  SELECT coalesce(respond_days, 14) INTO v_days FROM public.admission_stages WHERE school_id = o.school_id AND system = 'offer';
  SELECT settings->'admissions'->'fees' INTO v_fees FROM public.schools WHERE id = o.school_id;
  v_deposit := CASE WHEN jsonb_typeof(v_fees->'deposit') = 'number' THEN (v_fees->>'deposit')::numeric END;
  v_dep_days := CASE WHEN jsonb_typeof(v_fees->'depositDays') = 'number' THEN (v_fees->>'depositDays')::int END;
  UPDATE public.admission_offers SET status = 'issued', issued_at = now(),
      respond_by = CASE WHEN respond_by IS NOT NULL AND respond_by >= app.admission_today() THEN respond_by ELSE app.admission_today() + coalesce(v_days, 14) END,
      deposit_due = CASE WHEN coalesce(v_deposit, 0) > 0 THEN app.admission_today() + coalesce(v_dep_days, coalesce(v_days, 14)) END
    WHERE id = p_offer;
  SELECT stage INTO v_from FROM public.admission_applicants WHERE id = o.applicant_id;
  UPDATE public.admission_applicants SET stage = 'offer', stage_changed_at = now(),
      furthest_stage = CASE WHEN furthest_stage = 'enrolled' THEN furthest_stage ELSE 'offer' END
    WHERE id = o.applicant_id;
  INSERT INTO public.admission_events (applicant_id, school_id, from_stage, to_stage, note, actor_id, offer_status)
    VALUES (o.applicant_id, o.school_id, v_from, 'offer', p_note, p_actor, 'issued');
END $$;

-- As in 20261029100000, with the seat counted in the applicant's pool (RTE or general), and a new approval queued
-- only behind those waiting in the same pool.
CREATE OR REPLACE FUNCTION public.admission_offer_decide(p_school uuid, p_offer uuid, p_actor uuid, p_approve boolean, p_note text) RETURNS text
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
  AS $$
DECLARE o public.admission_offers; v_left int; v_stage text; v_rte boolean; v_pool text;
BEGIN
  SELECT * INTO o FROM public.admission_offers WHERE id = p_offer AND school_id = p_school;
  IF o.id IS NULL THEN RAISE EXCEPTION 'That offer no longer exists.' USING ERRCODE = 'P0002'; END IF;
  PERFORM app.admission_lock_grade(p_school, o.session, o.grade);
  SELECT * INTO o FROM public.admission_offers WHERE id = p_offer FOR UPDATE;
  IF o.status <> 'proposed' THEN RAISE EXCEPTION 'That offer isn''t waiting for approval.' USING ERRCODE = 'SA409'; END IF;
  IF o.proposed_by = p_actor THEN RAISE EXCEPTION 'You proposed this offer, so someone else has to approve it.' USING ERRCODE = '42501'; END IF;
  SELECT stage, rte INTO v_stage, v_rte FROM public.admission_applicants WHERE id = o.applicant_id;

  IF NOT p_approve THEN
    IF coalesce(trim(p_note), '') = '' THEN RAISE EXCEPTION 'Say why the offer is sent back.' USING ERRCODE = '22023'; END IF;
    UPDATE public.admission_offers SET status = 'returned', decided_by = p_actor, decided_at = now(), decision_note = trim(p_note), closed_at = now() WHERE id = o.id;
    INSERT INTO public.admission_events (applicant_id, school_id, from_stage, to_stage, note, actor_id, offer_status)
      VALUES (o.applicant_id, p_school, v_stage, v_stage, trim(p_note), p_actor, 'returned');
    IF o.proposed_by IS NOT NULL THEN
      INSERT INTO public.notifications (school_id, user_id, type, title, body, metadata)
        SELECT p_school, o.proposed_by, 'admissions', 'Offer for ' || a.name || ' sent back', trim(p_note), jsonb_build_object('applicantId', a.id)
        FROM public.admission_applicants a WHERE a.id = o.applicant_id;
    END IF;
    RETURN 'returned';
  END IF;

  UPDATE public.admission_offers SET decided_by = p_actor, decided_at = now(), decision_note = nullif(trim(p_note), '') WHERE id = o.id;
  v_pool := app.admission_pool(o.applicant_id);
  v_left := app.admission_pool_left(p_school, o.session, o.grade, v_rte);
  -- Someone already waiting in the same pool keeps their place ahead of a new approval.
  IF (v_left IS NULL OR v_left > 0) AND NOT EXISTS (SELECT 1 FROM public.admission_offers w WHERE w.school_id = p_school AND w.session = o.session
                                                    AND w.grade = o.grade AND w.status = 'waitlisted' AND app.admission_pool(w.applicant_id) = v_pool) THEN
    PERFORM app.admission_issue(o.id, p_actor, nullif(trim(p_note), ''));
    RETURN 'issued';
  END IF;
  UPDATE public.admission_offers SET status = 'waitlisted', waitlisted_at = now() WHERE id = o.id;
  INSERT INTO public.admission_events (applicant_id, school_id, from_stage, to_stage, note, actor_id, offer_status)
    VALUES (o.applicant_id, p_school, v_stage, v_stage,
      CASE WHEN v_pool = 'rte' THEN 'Approved; the RTE seats in grade ' || o.grade || ' are full, so on the RTE waitlist'
           ELSE 'Approved; grade ' || o.grade || ' is full, so on the waitlist' END, p_actor, 'waitlisted');
  PERFORM public.admission_promote(p_school, o.session, o.grade, p_actor);
  RETURN (SELECT status FROM public.admission_offers WHERE id = o.id);
END $$;

-- As in 20261102090000, per pool: the next waitlisted offer whose pool has a seat, by RTE lottery rank, then merit,
-- then waiting time.
CREATE OR REPLACE FUNCTION public.admission_promote(p_school uuid, p_session text, p_grade integer, p_actor uuid) RETURNS integer
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
  AS $$
DECLARE v_next public.admission_offers; v_n int := 0; v_name text;
BEGIN
  PERFORM app.admission_lock_grade(p_school, p_session, p_grade);
  LOOP
    SELECT o.* INTO v_next FROM public.admission_offers o JOIN public.admission_applicants a ON a.id = o.applicant_id
      WHERE o.school_id = p_school AND o.session = p_session AND o.grade = p_grade AND o.status = 'waitlisted'
        AND coalesce(app.admission_pool_left(p_school, p_session, p_grade, a.rte), 1) > 0
      ORDER BY CASE WHEN app.admission_pool(a.id) = 'rte' THEN a.rte_rank END ASC NULLS LAST, o.merit DESC NULLS LAST, o.waitlisted_at, o.created_at
      LIMIT 1 FOR UPDATE OF o SKIP LOCKED;
    EXIT WHEN v_next.id IS NULL;
    PERFORM app.admission_issue(v_next.id, p_actor, 'A seat came free: offer issued from the waitlist');
    SELECT name INTO v_name FROM public.admission_applicants WHERE id = v_next.applicant_id;
    IF v_next.proposed_by IS NOT NULL THEN
      INSERT INTO public.notifications (school_id, user_id, type, title, body, metadata)
        VALUES (p_school, v_next.proposed_by, 'admissions', v_name || ' has an offer from the waitlist',
                'A grade ' || p_grade || ' seat came free. Tell the family and record their answer.', jsonb_build_object('applicantId', v_next.applicant_id));
    END IF;
    v_n := v_n + 1;
    v_next := NULL;
  END LOOP;
  RETURN v_n;
END $$;

-- As in 20261029090000, plus: an offer (out or accepted) whose seat deposit was not paid by its date lapses too.
CREATE OR REPLACE FUNCTION public.admission_sweep(p_school uuid DEFAULT NULL) RETURNS jsonb
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
  AS $$
DECLARE o record; g record; v_lapsed int := 0; v_issued int := 0; v_why text;
BEGIN
  FOR o IN SELECT * FROM public.admission_offers
           WHERE ((status = 'issued' AND respond_by < app.admission_today())
               OR (status IN ('issued', 'accepted') AND deposit_due < app.admission_today() AND deposit_paid_at IS NULL))
             AND (p_school IS NULL OR school_id = p_school) FOR UPDATE SKIP LOCKED LOOP
    v_why := CASE WHEN o.deposit_due < app.admission_today() AND o.deposit_paid_at IS NULL
                  THEN 'Seat deposit not paid by ' || to_char(o.deposit_due, 'DD Mon YYYY')
                  ELSE 'Not accepted by ' || to_char(o.respond_by, 'DD Mon YYYY') END;
    PERFORM app.admission_close_offer(o.applicant_id, 'lapsed', NULL, v_why);
    UPDATE public.admission_applicants SET stage = 'withdrawn', stage_changed_at = now() WHERE id = o.applicant_id AND stage = 'offer';
    INSERT INTO public.admission_events (applicant_id, school_id, from_stage, to_stage, note, actor_id, offer_status)
      VALUES (o.applicant_id, o.school_id, 'offer', 'withdrawn', 'Offer lapsed: ' || lower(left(v_why, 1)) || substring(v_why FROM 2), NULL, 'lapsed');
    v_lapsed := v_lapsed + 1;
  END LOOP;
  FOR g IN SELECT DISTINCT school_id, session, grade FROM public.admission_offers
           WHERE status = 'waitlisted' AND (p_school IS NULL OR school_id = p_school) LOOP
    v_issued := v_issued + public.admission_promote(g.school_id, g.session, g.grade, NULL);
  END LOOP;
  RETURN jsonb_build_object('lapsed', v_lapsed, 'issued', v_issued);
END $$;

-- ── A stage can require the application fee ─────────────────────────────────
ALTER TABLE public.admission_stages DROP CONSTRAINT admission_stages_requires_check;
ALTER TABLE public.admission_stages ADD CONSTRAINT admission_stages_requires_check CHECK (requires <@ ARRAY['documents', 'age', 'fee']::text[]);

-- As in 20261101090000, with 'fee' among the checks a stage can require.
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
    IF NOT v_req <@ ARRAY['documents', 'age', 'fee']::text[] THEN RAISE EXCEPTION 'A stage can require documents, the age check or the application fee.' USING ERRCODE = '22023'; END IF;
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
ALTER TABLE public.admission_rte_lotteries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admission_payments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.admission_rte_lotteries FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.admission_payments FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.admission_rte_lotteries TO service_role;
GRANT ALL ON public.admission_payments TO service_role;
DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY['admission_pay(uuid, uuid, text, numeric, text, text, date, uuid, jsonb)', 'admission_void_payment(uuid, uuid, uuid, text)'] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon, authenticated', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO service_role', f);
  END LOOP;
END $$;
REVOKE ALL ON FUNCTION app.admission_pool_left(uuid, text, integer, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.admission_pool(uuid) FROM PUBLIC;
