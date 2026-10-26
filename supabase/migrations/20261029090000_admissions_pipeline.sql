-- Admissions pipeline, phase 1: stages each school sets for itself, seats per grade with a waitlist, and offers that the
-- principal approves before they go out (maker-checker). Offer and Enrolled are system stages: a school can rename
-- them but not remove or move them; the school adds, renames, reorders or retires every other stage.
--
-- A seat is held by an applicant at Offer (an issued or accepted offer) or Enrolled. Approving an offer when the
-- grade is full puts the applicant on the waitlist instead; when a seat frees (an offer declined, lapsed or
-- withdrawn, or more seats added) the longest-waiting approved applicant gets the offer without a second approval.
-- Offers not accepted by their date lapse in a nightly sweep.
--
-- Screens read through RLS (the admin desk); every write goes through the server and the functions below.

-- ── Stages ──────────────────────────────────────────────────────────────────
CREATE TABLE public.admission_stages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  key text NOT NULL CHECK (key ~ '^[a-z][a-z0-9_]{1,30}$' AND key NOT IN ('rejected', 'withdrawn', 'reopen')),
  label text NOT NULL CHECK (length(trim(label)) BETWEEN 1 AND 40),
  position integer NOT NULL DEFAULT 0,
  -- offer and enrolled are the locked stages; null is one the school added (always before Offer).
  system text CHECK (system IS NULL OR system IN ('offer', 'enrolled')),
  active boolean NOT NULL DEFAULT true,
  -- Offer only: days a family has to accept before the offer lapses.
  respond_days integer CHECK (respond_days IS NULL OR respond_days BETWEEN 1 AND 90),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, key),
  CHECK (system IS NULL OR key = system),
  CHECK (system IS NULL OR active)
);
CREATE UNIQUE INDEX admission_stages_system ON public.admission_stages (school_id, system) WHERE system IS NOT NULL;
CREATE TRIGGER trg_touch_admission_stages BEFORE UPDATE ON public.admission_stages FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
CREATE TRIGGER trg_audit_admission_stages AFTER INSERT OR DELETE OR UPDATE ON public.admission_stages FOR EACH ROW EXECUTE FUNCTION app.audit();

-- The template every school starts from (the five stages the pipeline had before).
CREATE OR REPLACE FUNCTION public.admission_ensure_stages(p_school uuid) RETURNS void
  LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp
  AS $$
  INSERT INTO public.admission_stages (school_id, key, label, position, system, respond_days)
    SELECT p_school, k, l, p, s, d FROM (VALUES
      ('enquiry', 'Enquiry', 1, NULL, NULL::int), ('application', 'Application', 2, NULL, NULL), ('assessment', 'Assessment', 3, NULL, NULL),
      ('offer', 'Offer', 100, 'offer', 14), ('enrolled', 'Enrolled', 101, 'enrolled', NULL)) AS t(k, l, p, s, d)
    WHERE NOT EXISTS (SELECT 1 FROM public.admission_stages x WHERE x.school_id = p_school)
  ON CONFLICT DO NOTHING;
$$;

CREATE OR REPLACE FUNCTION app.seed_admission_stages() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
  AS $$ BEGIN PERFORM public.admission_ensure_stages(NEW.id); RETURN NEW; END $$;
CREATE TRIGGER trg_seed_admission_stages AFTER INSERT ON public.schools FOR EACH ROW EXECUTE FUNCTION app.seed_admission_stages();
SELECT public.admission_ensure_stages(id) FROM public.schools;

-- Order of a stage in the pipeline of a school: its own stages by position, then Offer, then Enrolled. -1 when unknown.
CREATE OR REPLACE FUNCTION app.admission_rank(p_school uuid, p_key text) RETURNS integer
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
  AS $$
  SELECT coalesce((SELECT CASE s.system WHEN 'offer' THEN 1000000 WHEN 'enrolled' THEN 1000001 ELSE s.position END
                   FROM public.admission_stages s WHERE s.school_id = p_school AND s.key = p_key), -1);
$$;

-- Applicants now carry the stage keys of their school.
ALTER TABLE public.admission_applicants DROP CONSTRAINT admission_applicants_stage_check;
ALTER TABLE public.admission_applicants DROP CONSTRAINT admission_applicants_furthest_stage_check;
ALTER TABLE public.admission_applicants ADD CONSTRAINT admission_applicants_stage_check CHECK (stage ~ '^[a-z][a-z0-9_]{1,30}$');
ALTER TABLE public.admission_applicants ADD CONSTRAINT admission_applicants_furthest_stage_check
  CHECK (furthest_stage ~ '^[a-z][a-z0-9_]{1,30}$' AND furthest_stage NOT IN ('rejected', 'withdrawn'));
CREATE INDEX IF NOT EXISTS admission_applicants_seat ON public.admission_applicants (school_id, session, grade, stage);

-- An offer step in the history of an applicant (to_stage stays the stage they were in).
ALTER TABLE public.admission_events ADD COLUMN offer_status text
  CHECK (offer_status IS NULL OR offer_status IN ('proposed', 'returned', 'waitlisted', 'issued', 'accepted', 'declined', 'lapsed', 'withdrawn', 'enrolled'));

-- ── Seats ───────────────────────────────────────────────────────────────────
-- Seats for new admissions in a grade for a session. No row: no limit (offers are never waitlisted).
CREATE TABLE public.admission_seats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  session text NOT NULL CHECK (session ~ '^\d{4}-\d{2}$'),
  grade integer NOT NULL CHECK (grade BETWEEN 1 AND 12),
  capacity integer NOT NULL CHECK (capacity BETWEEN 0 AND 5000),
  updated_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, session, grade)
);
CREATE TRIGGER trg_touch_admission_seats BEFORE UPDATE ON public.admission_seats FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
CREATE TRIGGER trg_audit_admission_seats AFTER INSERT OR DELETE OR UPDATE ON public.admission_seats FOR EACH ROW EXECUTE FUNCTION app.audit();

-- ── Offers ──────────────────────────────────────────────────────────────────
-- proposed → (approved) issued | waitlisted → issued → accepted → enrolled; or returned / declined / lapsed / withdrawn.
CREATE TABLE public.admission_offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  applicant_id uuid NOT NULL REFERENCES public.admission_applicants(id) ON DELETE CASCADE,
  session text NOT NULL CHECK (session ~ '^\d{4}-\d{2}$'),
  grade integer NOT NULL CHECK (grade BETWEEN 1 AND 12),
  status text NOT NULL DEFAULT 'proposed'
    CHECK (status IN ('proposed', 'returned', 'waitlisted', 'issued', 'accepted', 'declined', 'lapsed', 'withdrawn', 'enrolled')),
  proposed_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  proposed_at timestamptz NOT NULL DEFAULT now(),
  proposal_note text CHECK (proposal_note IS NULL OR length(proposal_note) <= 1000),
  decided_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  decided_at timestamptz,
  decision_note text CHECK (decision_note IS NULL OR length(decision_note) <= 1000),
  waitlisted_at timestamptz,
  issued_at timestamptz,
  -- Asked for by the proposer; set from the days set on the Offer stage when the offer is issued, if blank.
  respond_by date,
  responded_at timestamptz,
  response_note text CHECK (response_note IS NULL OR length(response_note) <= 1000),
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- The person who proposed an offer never approves it.
  CHECK (decided_by IS NULL OR proposed_by IS NULL OR decided_by <> proposed_by)
);
CREATE UNIQUE INDEX admission_offers_live ON public.admission_offers (applicant_id) WHERE status IN ('proposed', 'waitlisted', 'issued', 'accepted');
CREATE INDEX admission_offers_queue ON public.admission_offers (school_id, session, grade, status, waitlisted_at);
CREATE INDEX admission_offers_lapse ON public.admission_offers (respond_by) WHERE status = 'issued';
CREATE TRIGGER trg_touch_admission_offers BEFORE UPDATE ON public.admission_offers FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
CREATE TRIGGER trg_audit_admission_offers AFTER INSERT OR DELETE OR UPDATE ON public.admission_offers FOR EACH ROW EXECUTE FUNCTION app.audit();

-- An applicant put at Offer some other way (before offers needed approval, or by a bulk import) gets an issued
-- offer with no deadline, so the seat count and the enrolment check see them like anyone else.
CREATE OR REPLACE FUNCTION app.admission_offer_backfill() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
  AS $$
BEGIN
  IF NEW.stage = 'offer' AND NOT EXISTS (SELECT 1 FROM public.admission_offers o WHERE o.applicant_id = NEW.id AND o.status IN ('proposed', 'waitlisted', 'issued', 'accepted')) THEN
    INSERT INTO public.admission_offers (school_id, applicant_id, session, grade, status, proposal_note, issued_at)
      VALUES (NEW.school_id, NEW.id, NEW.session, NEW.grade, 'issued', 'Recorded at Offer without an approval step', now());
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_admission_offer_backfill AFTER INSERT OR UPDATE OF stage ON public.admission_applicants
  FOR EACH ROW EXECUTE FUNCTION app.admission_offer_backfill();
INSERT INTO public.admission_offers (school_id, applicant_id, session, grade, status, proposal_note, issued_at)
  SELECT a.school_id, a.id, a.session, a.grade, 'issued', 'Recorded at Offer without an approval step', a.stage_changed_at
  FROM public.admission_applicants a WHERE a.stage = 'offer';

-- ── Pipeline functions (server only) ────────────────────────────────────────
CREATE OR REPLACE FUNCTION app.admission_today() RETURNS date
  LANGUAGE sql STABLE AS $$ SELECT (now() AT TIME ZONE 'Asia/Kolkata')::date $$;

-- Seats still free in a grade, or null when the school set no limit. Call under the lock of the grade.
CREATE OR REPLACE FUNCTION app.admission_seats_left(p_school uuid, p_session text, p_grade integer) RETURNS integer
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
  AS $$
  SELECT s.capacity - (SELECT count(*)::int FROM public.admission_applicants a
                       WHERE a.school_id = p_school AND a.session = p_session AND a.grade = p_grade AND a.stage IN ('offer', 'enrolled'))
  FROM public.admission_seats s WHERE s.school_id = p_school AND s.session = p_session AND s.grade = p_grade;
$$;

CREATE OR REPLACE FUNCTION app.admission_lock_grade(p_school uuid, p_session text, p_grade integer) RETURNS void
  LANGUAGE sql AS $$ SELECT pg_advisory_xact_lock(hashtextextended('admission:' || p_school || ':' || p_session || ':' || p_grade, 0)) $$;

-- Issues one offer: the applicant moves to Offer and holds a seat. Caller holds the lock of the grade.
CREATE OR REPLACE FUNCTION app.admission_issue(p_offer uuid, p_actor uuid, p_note text) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
  AS $$
DECLARE o public.admission_offers; v_days int; v_from text;
BEGIN
  SELECT * INTO o FROM public.admission_offers WHERE id = p_offer FOR UPDATE;
  SELECT coalesce(respond_days, 14) INTO v_days FROM public.admission_stages WHERE school_id = o.school_id AND system = 'offer';
  UPDATE public.admission_offers SET status = 'issued', issued_at = now(),
      respond_by = CASE WHEN respond_by IS NOT NULL AND respond_by >= app.admission_today() THEN respond_by ELSE app.admission_today() + coalesce(v_days, 14) END
    WHERE id = p_offer;
  SELECT stage INTO v_from FROM public.admission_applicants WHERE id = o.applicant_id;
  UPDATE public.admission_applicants SET stage = 'offer', stage_changed_at = now(),
      furthest_stage = CASE WHEN furthest_stage = 'enrolled' THEN furthest_stage ELSE 'offer' END
    WHERE id = o.applicant_id;
  INSERT INTO public.admission_events (applicant_id, school_id, from_stage, to_stage, note, actor_id, offer_status)
    VALUES (o.applicant_id, o.school_id, v_from, 'offer', p_note, p_actor, 'issued');
END $$;

-- Fills free seats in a grade from its waitlist, longest-waiting first. Returns how many offers went out.
CREATE OR REPLACE FUNCTION public.admission_promote(p_school uuid, p_session text, p_grade integer, p_actor uuid) RETURNS integer
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
  AS $$
DECLARE v_left int; v_next public.admission_offers; v_n int := 0; v_name text;
BEGIN
  PERFORM app.admission_lock_grade(p_school, p_session, p_grade);
  LOOP
    v_left := app.admission_seats_left(p_school, p_session, p_grade);
    EXIT WHEN v_left IS NOT NULL AND v_left <= 0;
    SELECT * INTO v_next FROM public.admission_offers
      WHERE school_id = p_school AND session = p_session AND grade = p_grade AND status = 'waitlisted'
      ORDER BY waitlisted_at, created_at LIMIT 1 FOR UPDATE SKIP LOCKED;
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

-- Closes the live offer of an applicant (when they are rejected, withdraw, decline or lapse); callers refill the seat.
CREATE OR REPLACE FUNCTION app.admission_close_offer(p_applicant uuid, p_status text, p_actor uuid, p_note text) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
  AS $$
DECLARE o public.admission_offers;
BEGIN
  SELECT * INTO o FROM public.admission_offers WHERE applicant_id = p_applicant AND status IN ('proposed', 'waitlisted', 'issued', 'accepted') FOR UPDATE;
  IF o.id IS NULL THEN RETURN; END IF;
  UPDATE public.admission_offers SET status = p_status, closed_at = now(),
      response_note = CASE WHEN p_status IN ('declined', 'lapsed') THEN p_note ELSE response_note END,
      responded_at = CASE WHEN p_status = 'declined' THEN now() ELSE responded_at END,
      decision_note = CASE WHEN p_status = 'withdrawn' THEN coalesce(p_note, decision_note) ELSE decision_note END
    WHERE id = o.id;
END $$;

-- Moves an applicant: to the next stage of the school (one at a time), to rejected or withdrawn (with a
-- reason), or reopen (back to the furthest own stage reached). Offer and Enrolled are reached only through an
-- approved offer and enrolment by Sthara. p_from guards against a concurrent move.
CREATE OR REPLACE FUNCTION public.admission_move(p_school uuid, p_applicant uuid, p_from text, p_to text, p_actor uuid, p_note text) RETURNS text
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
  AS $$
DECLARE a public.admission_applicants; v_to text := p_to; v_next text; v_rank int; v_held boolean;
BEGIN
  SELECT * INTO a FROM public.admission_applicants WHERE id = p_applicant AND school_id = p_school FOR UPDATE;
  IF a.id IS NULL THEN RAISE EXCEPTION 'Applicant not found.' USING ERRCODE = 'P0002'; END IF;
  IF a.stage IS DISTINCT FROM p_from THEN RAISE EXCEPTION 'Someone else just moved this applicant. Refresh and try again.' USING ERRCODE = '40001'; END IF;

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

-- Proposes an offer for an applicant at the last of the stages of the school. Returns the offer id.
CREATE OR REPLACE FUNCTION public.admission_offer_propose(p_school uuid, p_applicant uuid, p_actor uuid, p_note text, p_respond_by date) RETURNS uuid
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
  AS $$
DECLARE a public.admission_applicants; v_id uuid;
BEGIN
  SELECT * INTO a FROM public.admission_applicants WHERE id = p_applicant AND school_id = p_school FOR UPDATE;
  IF a.id IS NULL THEN RAISE EXCEPTION 'Applicant not found.' USING ERRCODE = 'P0002'; END IF;
  IF a.stage IN ('rejected', 'withdrawn', 'offer', 'enrolled') THEN RAISE EXCEPTION 'Only an open applicant before Offer can be proposed for one.' USING ERRCODE = '22023'; END IF;
  IF EXISTS (SELECT 1 FROM public.admission_stages s WHERE s.school_id = p_school AND s.system IS NULL AND s.active
             AND s.position > app.admission_rank(p_school, a.stage)) THEN
    RAISE EXCEPTION 'Take them through the remaining stages first.' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM public.admission_offers o WHERE o.applicant_id = a.id AND o.status IN ('proposed', 'waitlisted', 'issued', 'accepted')) THEN
    RAISE EXCEPTION 'This applicant already has an offer in progress.' USING ERRCODE = '23505';
  END IF;
  IF p_respond_by IS NOT NULL AND p_respond_by < app.admission_today() THEN RAISE EXCEPTION 'The reply-by date has passed.' USING ERRCODE = '22023'; END IF;
  INSERT INTO public.admission_offers (school_id, applicant_id, session, grade, status, proposed_by, proposal_note, respond_by)
    VALUES (p_school, a.id, a.session, a.grade, 'proposed', p_actor, nullif(trim(p_note), ''), p_respond_by) RETURNING id INTO v_id;
  INSERT INTO public.admission_events (applicant_id, school_id, from_stage, to_stage, note, actor_id, offer_status)
    VALUES (a.id, p_school, a.stage, a.stage, nullif(trim(p_note), ''), p_actor, 'proposed');
  RETURN v_id;
END $$;

-- Approves (issued, or waitlisted when the grade is full) or returns a proposed offer. Returns the new status.
CREATE OR REPLACE FUNCTION public.admission_offer_decide(p_school uuid, p_offer uuid, p_actor uuid, p_approve boolean, p_note text) RETURNS text
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
  AS $$
DECLARE o public.admission_offers; v_left int; v_stage text;
BEGIN
  SELECT * INTO o FROM public.admission_offers WHERE id = p_offer AND school_id = p_school;
  IF o.id IS NULL THEN RAISE EXCEPTION 'That offer no longer exists.' USING ERRCODE = 'P0002'; END IF;
  PERFORM app.admission_lock_grade(p_school, o.session, o.grade);
  SELECT * INTO o FROM public.admission_offers WHERE id = p_offer FOR UPDATE;
  IF o.status <> 'proposed' THEN RAISE EXCEPTION 'That offer isn''t waiting for approval.' USING ERRCODE = '40001'; END IF;
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

-- The answer of the family to an issued offer. A decline withdraws the applicant and frees the seat.
CREATE OR REPLACE FUNCTION public.admission_offer_respond(p_school uuid, p_offer uuid, p_actor uuid, p_accept boolean, p_note text) RETURNS text
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
  AS $$
DECLARE o public.admission_offers;
BEGIN
  SELECT * INTO o FROM public.admission_offers WHERE id = p_offer AND school_id = p_school FOR UPDATE;
  IF o.id IS NULL THEN RAISE EXCEPTION 'That offer no longer exists.' USING ERRCODE = 'P0002'; END IF;
  IF o.status <> 'issued' THEN RAISE EXCEPTION 'Only an offer that has gone out can be accepted or declined.' USING ERRCODE = '40001'; END IF;
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

-- Cancels an offer still waiting for approval or a seat; the applicant stays where they are.
CREATE OR REPLACE FUNCTION public.admission_offer_cancel(p_school uuid, p_offer uuid, p_actor uuid, p_note text) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
  AS $$
DECLARE o public.admission_offers; v_stage text;
BEGIN
  SELECT * INTO o FROM public.admission_offers WHERE id = p_offer AND school_id = p_school FOR UPDATE;
  IF o.id IS NULL THEN RAISE EXCEPTION 'That offer no longer exists.' USING ERRCODE = 'P0002'; END IF;
  IF o.status NOT IN ('proposed', 'waitlisted') THEN
    RAISE EXCEPTION 'An offer that has gone out ends when the family declines, or by withdrawing or rejecting the applicant.' USING ERRCODE = '40001';
  END IF;
  UPDATE public.admission_offers SET status = 'withdrawn', closed_at = now(), decision_note = coalesce(nullif(trim(p_note), ''), decision_note) WHERE id = o.id;
  SELECT stage INTO v_stage FROM public.admission_applicants WHERE id = o.applicant_id;
  INSERT INTO public.admission_events (applicant_id, school_id, from_stage, to_stage, note, actor_id, offer_status)
    VALUES (o.applicant_id, p_school, v_stage, v_stage, coalesce(nullif(trim(p_note), ''), 'Offer cancelled'), p_actor, 'withdrawn');
END $$;

-- Nightly (and on demand for one school): lapses offers past their reply-by date, then fills free seats from
-- the waitlist of each grade. Returns {lapsed, issued}.
CREATE OR REPLACE FUNCTION public.admission_sweep(p_school uuid DEFAULT NULL) RETURNS jsonb
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
  AS $$
DECLARE o record; g record; v_lapsed int := 0; v_issued int := 0;
BEGIN
  FOR o IN SELECT * FROM public.admission_offers
           WHERE status = 'issued' AND respond_by < app.admission_today() AND (p_school IS NULL OR school_id = p_school) FOR UPDATE SKIP LOCKED LOOP
    PERFORM app.admission_close_offer(o.applicant_id, 'lapsed', NULL, 'Not accepted by ' || to_char(o.respond_by, 'DD Mon YYYY'));
    UPDATE public.admission_applicants SET stage = 'withdrawn', stage_changed_at = now() WHERE id = o.applicant_id AND stage = 'offer';
    INSERT INTO public.admission_events (applicant_id, school_id, from_stage, to_stage, note, actor_id, offer_status)
      VALUES (o.applicant_id, o.school_id, 'offer', 'withdrawn', 'Offer lapsed: not accepted by ' || to_char(o.respond_by, 'DD Mon YYYY'), NULL, 'lapsed');
    v_lapsed := v_lapsed + 1;
  END LOOP;
  FOR g IN SELECT DISTINCT school_id, session, grade FROM public.admission_offers
           WHERE status = 'waitlisted' AND (p_school IS NULL OR school_id = p_school) LOOP
    v_issued := v_issued + public.admission_promote(g.school_id, g.session, g.grade, NULL);
  END LOOP;
  RETURN jsonb_build_object('lapsed', v_lapsed, 'issued', v_issued);
END $$;

-- Saves the stages of a school in one go: p_stages = {own: [{key?, label, active}] in order, offer: {label, respondDays},
-- enrolled: {label}}. Own stages without a key are new (the key is made from the label and never changes after).
-- Every existing own stage must be listed; a stage is retired (active false), never deleted, so history keeps its
-- name. A stage with open applicants in it cannot be retired.
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
      IF NOT FOUND THEN RAISE EXCEPTION 'A stage changed while you were editing. Reload and try again.' USING ERRCODE = '40001'; END IF;
    END IF;
    v_keys := v_keys || v_key;
  END LOOP;
  IF EXISTS (SELECT 1 FROM public.admission_stages WHERE school_id = p_school AND system IS NULL AND NOT key = ANY (v_keys)) THEN
    RAISE EXCEPTION 'A stage changed while you were editing. Reload and try again.' USING ERRCODE = '40001';
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

-- 00:15 IST.
SELECT cron.schedule('admission-sweep', '45 18 * * *', $$ SELECT public.admission_sweep() $$);

-- ── Permissions ─────────────────────────────────────────────────────────────
INSERT INTO public.role_permissions (role_key, perm) VALUES
  ('school_admin', 'admissions.approve'), ('school_admin', 'admissions.setup'),
  ('principal', 'admissions.approve'), ('principal', 'admissions.setup')
  ON CONFLICT DO NOTHING;

-- ── Access ──────────────────────────────────────────────────────────────────
ALTER TABLE public.admission_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admission_seats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admission_offers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.admission_stages, public.admission_seats, public.admission_offers FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.admission_stages, public.admission_seats, public.admission_offers TO authenticated;
GRANT ALL ON public.admission_stages TO service_role;
GRANT ALL ON public.admission_seats TO service_role;
GRANT ALL ON public.admission_offers TO service_role;
CREATE POLICY admission_stages_read ON public.admission_stages FOR SELECT TO authenticated USING (
  ((SELECT app.has_perm('admissions.read')) AND school_id = (SELECT app.current_school_id())) OR (SELECT app.is_superadmin()));
CREATE POLICY admission_seats_read ON public.admission_seats FOR SELECT TO authenticated USING (
  ((SELECT app.has_perm('admissions.read')) AND school_id = (SELECT app.current_school_id())) OR (SELECT app.is_superadmin()));
CREATE POLICY admission_offers_read ON public.admission_offers FOR SELECT TO authenticated USING (
  ((SELECT app.has_perm('admissions.read')) AND school_id = (SELECT app.current_school_id())) OR (SELECT app.is_superadmin()));

DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY['admission_ensure_stages(uuid)', 'admission_promote(uuid, text, integer, uuid)',
    'admission_move(uuid, uuid, text, text, uuid, text)', 'admission_offer_propose(uuid, uuid, uuid, text, date)',
    'admission_offer_decide(uuid, uuid, uuid, boolean, text)', 'admission_offer_respond(uuid, uuid, uuid, boolean, text)',
    'admission_offer_cancel(uuid, uuid, uuid, text)', 'admission_sweep(uuid)', 'admission_set_stages(uuid, jsonb)'] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon, authenticated', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO service_role', f);
  END LOOP;
END $$;
REVOKE ALL ON FUNCTION app.seed_admission_stages() FROM PUBLIC;
REVOKE ALL ON FUNCTION app.admission_offer_backfill() FROM PUBLIC;
REVOKE ALL ON FUNCTION app.admission_issue(uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.admission_close_offer(uuid, text, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.admission_rank(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.admission_seats_left(uuid, text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.admission_lock_grade(uuid, text, integer) FROM PUBLIC;
