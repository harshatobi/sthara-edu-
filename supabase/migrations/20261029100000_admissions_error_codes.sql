-- Admissions pipeline follow-up: the "someone else changed it first" refusals used SQLSTATE 40001
-- (serialization_failure), which the API layer treats as a transient conflict and retries until the request times
-- out, sometimes replaying the call later. They now raise a code of their own, SA409; nothing else changes.

CREATE OR REPLACE FUNCTION public.admission_move(p_school uuid, p_applicant uuid, p_from text, p_to text, p_actor uuid, p_note text) RETURNS text
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
  AS $$
DECLARE a public.admission_applicants; v_to text := p_to; v_next text; v_rank int; v_held boolean;
BEGIN
  SELECT * INTO a FROM public.admission_applicants WHERE id = p_applicant AND school_id = p_school FOR UPDATE;
  IF a.id IS NULL THEN RAISE EXCEPTION 'Applicant not found.' USING ERRCODE = 'P0002'; END IF;
  IF a.stage IS DISTINCT FROM p_from THEN RAISE EXCEPTION 'Someone else just moved this applicant. Refresh and try again.' USING ERRCODE = 'SA409'; END IF;

  IF v_to IN ('rejected', 'withdrawn') THEN
    IF a.stage IN ('rejected', 'withdrawn') THEN RAISE EXCEPTION 'This applicant is already closed.' USING ERRCODE = '22023'; END IF;
    IF a.stage = 'enrolled' AND v_to <> 'withdrawn' THEN RAISE EXCEPTION 'An enrolled student can only be marked withdrawn.' USING ERRCODE = '22023'; END IF;
    IF coalesce(trim(p_note), '') = '' THEN RAISE EXCEPTION 'Give a reason — it stays on the applicant''s record.' USING ERRCODE = '22023'; END IF;
    v_held := a.stage IN ('offer', 'enrolled');
    PERFORM app.admission_close_offer(a.id, 'withdrawn', p_actor, p_note);
  ELSIF v_to = 'reopen' THEN
    IF a.stage NOT IN ('rejected', 'withdrawn') THEN RAISE EXCEPTION 'Only a rejected or withdrawn applicant can be reopened.' USING ERRCODE = '22023'; END IF;
    -- Back to the furthest own stage reached that is still in use; someone who got as far as Offer goes back to
    -- the last own stage (a lost seat is not given back: propose again).
    v_rank := app.admission_rank(p_school, a.furthest_stage);
    SELECT s.key INTO v_to FROM public.admission_stages s
      WHERE s.school_id = p_school AND s.system IS NULL AND s.active AND s.position <= v_rank
      ORDER BY s.position DESC LIMIT 1;
    IF v_to IS NULL THEN
      SELECT s.key INTO v_to FROM public.admission_stages s WHERE s.school_id = p_school AND s.system IS NULL AND s.active ORDER BY s.position LIMIT 1;
    END IF;
    IF v_to IS NULL THEN RAISE EXCEPTION 'The pipeline has no stages before Offer.' USING ERRCODE = '22023'; END IF;
  ELSE
    IF EXISTS (SELECT 1 FROM public.admission_stages s WHERE s.school_id = p_school AND s.key = v_to AND s.system = 'offer') THEN
      RAISE EXCEPTION 'An offer needs approval: use Propose offer.' USING ERRCODE = '22023';
    END IF;
    IF EXISTS (SELECT 1 FROM public.admission_stages s WHERE s.school_id = p_school AND s.key = v_to AND s.system = 'enrolled') THEN
      RAISE EXCEPTION 'Enrolment goes through Sthara: open the applicant and use Request enrolment.' USING ERRCODE = '22023';
    END IF;
    IF a.stage IN ('rejected', 'withdrawn', 'offer', 'enrolled') THEN
      RAISE EXCEPTION 'An applicant at this stage can''t move there.' USING ERRCODE = '22023';
    END IF;
    IF EXISTS (SELECT 1 FROM public.admission_offers o WHERE o.applicant_id = a.id AND o.status IN ('proposed', 'waitlisted')) THEN
      RAISE EXCEPTION 'This applicant has an offer waiting. Cancel it before moving them.' USING ERRCODE = '22023';
    END IF;
    v_rank := app.admission_rank(p_school, a.stage);
    SELECT s.key INTO v_next FROM public.admission_stages s
      WHERE s.school_id = p_school AND s.system IS NULL AND s.active AND s.position > v_rank ORDER BY s.position LIMIT 1;
    IF v_next IS DISTINCT FROM v_to THEN RAISE EXCEPTION 'Applicants move forward one stage at a time.' USING ERRCODE = '22023'; END IF;
  END IF;

  UPDATE public.admission_applicants SET stage = v_to, stage_changed_at = now(),
      furthest_stage = CASE WHEN v_to NOT IN ('rejected', 'withdrawn') AND app.admission_rank(p_school, v_to) > app.admission_rank(p_school, a.furthest_stage)
                            THEN v_to ELSE furthest_stage END
    WHERE id = a.id;
  INSERT INTO public.admission_events (applicant_id, school_id, from_stage, to_stage, note, actor_id)
    VALUES (a.id, p_school, a.stage, v_to, nullif(trim(p_note), ''), p_actor);
  IF v_held THEN PERFORM public.admission_promote(p_school, a.session, a.grade, p_actor); END IF;
  RETURN v_to;
END $$;

CREATE OR REPLACE FUNCTION public.admission_offer_decide(p_school uuid, p_offer uuid, p_actor uuid, p_approve boolean, p_note text) RETURNS text
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
  AS $$
DECLARE o public.admission_offers; v_left int; v_stage text;
BEGIN
  SELECT * INTO o FROM public.admission_offers WHERE id = p_offer AND school_id = p_school;
  IF o.id IS NULL THEN RAISE EXCEPTION 'That offer no longer exists.' USING ERRCODE = 'P0002'; END IF;
  PERFORM app.admission_lock_grade(p_school, o.session, o.grade);
  SELECT * INTO o FROM public.admission_offers WHERE id = p_offer FOR UPDATE;
  IF o.status <> 'proposed' THEN RAISE EXCEPTION 'That offer isn''t waiting for approval.' USING ERRCODE = 'SA409'; END IF;
  IF o.proposed_by = p_actor THEN RAISE EXCEPTION 'You proposed this offer, so someone else has to approve it.' USING ERRCODE = '42501'; END IF;
  SELECT stage INTO v_stage FROM public.admission_applicants WHERE id = o.applicant_id;

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
  v_left := app.admission_seats_left(p_school, o.session, o.grade);
  -- Someone already waiting keeps their place in the queue ahead of a new approval.
  IF (v_left IS NULL OR v_left > 0) AND NOT EXISTS (SELECT 1 FROM public.admission_offers w WHERE w.school_id = p_school AND w.session = o.session
                                                    AND w.grade = o.grade AND w.status = 'waitlisted') THEN
    PERFORM app.admission_issue(o.id, p_actor, nullif(trim(p_note), ''));
    RETURN 'issued';
  END IF;
  UPDATE public.admission_offers SET status = 'waitlisted', waitlisted_at = now() WHERE id = o.id;
  INSERT INTO public.admission_events (applicant_id, school_id, from_stage, to_stage, note, actor_id, offer_status)
    VALUES (o.applicant_id, p_school, v_stage, v_stage, 'Approved; grade ' || o.grade || ' is full, so on the waitlist', p_actor, 'waitlisted');
  PERFORM public.admission_promote(p_school, o.session, o.grade, p_actor);
  RETURN (SELECT status FROM public.admission_offers WHERE id = o.id);
END $$;

CREATE OR REPLACE FUNCTION public.admission_offer_respond(p_school uuid, p_offer uuid, p_actor uuid, p_accept boolean, p_note text) RETURNS text
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
  AS $$
DECLARE o public.admission_offers;
BEGIN
  SELECT * INTO o FROM public.admission_offers WHERE id = p_offer AND school_id = p_school FOR UPDATE;
  IF o.id IS NULL THEN RAISE EXCEPTION 'That offer no longer exists.' USING ERRCODE = 'P0002'; END IF;
  IF o.status <> 'issued' THEN RAISE EXCEPTION 'Only an offer that has gone out can be accepted or declined.' USING ERRCODE = 'SA409'; END IF;
  IF p_accept THEN
    UPDATE public.admission_offers SET status = 'accepted', responded_at = now(), response_note = nullif(trim(p_note), '') WHERE id = o.id;
    INSERT INTO public.admission_events (applicant_id, school_id, from_stage, to_stage, note, actor_id, offer_status)
      VALUES (o.applicant_id, p_school, 'offer', 'offer', nullif(trim(p_note), ''), p_actor, 'accepted');
    RETURN 'accepted';
  END IF;
  IF coalesce(trim(p_note), '') = '' THEN RAISE EXCEPTION 'Say why the family declined.' USING ERRCODE = '22023'; END IF;
  PERFORM app.admission_close_offer(o.applicant_id, 'declined', p_actor, trim(p_note));
  UPDATE public.admission_applicants SET stage = 'withdrawn', stage_changed_at = now() WHERE id = o.applicant_id;
  INSERT INTO public.admission_events (applicant_id, school_id, from_stage, to_stage, note, actor_id, offer_status)
    VALUES (o.applicant_id, p_school, 'offer', 'withdrawn', 'Declined the offer: ' || trim(p_note), p_actor, 'declined');
  PERFORM public.admission_promote(p_school, o.session, o.grade, p_actor);
  RETURN 'declined';
END $$;

CREATE OR REPLACE FUNCTION public.admission_offer_cancel(p_school uuid, p_offer uuid, p_actor uuid, p_note text) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
  AS $$
DECLARE o public.admission_offers; v_stage text;
BEGIN
  SELECT * INTO o FROM public.admission_offers WHERE id = p_offer AND school_id = p_school FOR UPDATE;
  IF o.id IS NULL THEN RAISE EXCEPTION 'That offer no longer exists.' USING ERRCODE = 'P0002'; END IF;
  IF o.status NOT IN ('proposed', 'waitlisted') THEN
    RAISE EXCEPTION 'An offer that has gone out ends when the family declines, or by withdrawing or rejecting the applicant.' USING ERRCODE = 'SA409';
  END IF;
  UPDATE public.admission_offers SET status = 'withdrawn', closed_at = now(), decision_note = coalesce(nullif(trim(p_note), ''), decision_note) WHERE id = o.id;
  SELECT stage INTO v_stage FROM public.admission_applicants WHERE id = o.applicant_id;
  INSERT INTO public.admission_events (applicant_id, school_id, from_stage, to_stage, note, actor_id, offer_status)
    VALUES (o.applicant_id, p_school, v_stage, v_stage, coalesce(nullif(trim(p_note), ''), 'Offer cancelled'), p_actor, 'withdrawn');
END $$;

CREATE OR REPLACE FUNCTION public.admission_set_stages(p_school uuid, p_stages jsonb) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
  AS $$
DECLARE r jsonb; i int := 0; v_key text; v_base text; v_label text; v_keys text[] := '{}'; v_n int; v_stuck record; v_days int;
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
    v_key := nullif(r->>'key', '');
    IF v_key IS NULL THEN
      v_base := left(trim(both '_' from regexp_replace(lower(v_label), '[^a-z0-9]+', '_', 'g')), 24);
      IF v_base !~ '^[a-z]' THEN v_base := 's_' || v_base; END IF;
      IF length(v_base) < 2 OR v_base IN ('rejected', 'withdrawn', 'reopen', 'offer', 'enrolled') THEN v_base := 'stage_' || i; END IF;
      v_key := v_base; v_n := 1;
      WHILE EXISTS (SELECT 1 FROM public.admission_stages WHERE school_id = p_school AND key = v_key) LOOP
        v_n := v_n + 1; v_key := left(v_base, 24) || '_' || v_n;
      END LOOP;
      INSERT INTO public.admission_stages (school_id, key, label, position, system, active) VALUES (p_school, v_key, v_label, i, NULL, coalesce((r->>'active')::boolean, true));
    ELSE
      UPDATE public.admission_stages SET label = v_label, position = i, active = coalesce((r->>'active')::boolean, true)
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
  IF (SELECT count(*) FROM public.admission_stages WHERE school_id = p_school AND active) <>
     (SELECT count(DISTINCT lower(label)) FROM public.admission_stages WHERE school_id = p_school AND active) THEN
    RAISE EXCEPTION 'Two stages have the same name.' USING ERRCODE = '22023';
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
