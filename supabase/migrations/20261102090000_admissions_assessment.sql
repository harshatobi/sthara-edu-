-- Admissions phase 4a: the admission assessment and merit. The school sets assessment slots (a time, a place, the
-- class or every class, how many can sit); the office, or the family from the apply page when the school allows it,
-- books an applicant into one; the office records attendance and a single score. Offers carry the applicant's merit
-- (score plus the school's sibling and staff-ward points) and the waitlist fills highest merit first.

-- ── The score ───────────────────────────────────────────────────────────────
ALTER TABLE public.admission_applicants ADD COLUMN assessment_score numeric(6,2) CHECK (assessment_score IS NULL OR assessment_score BETWEEN 0 AND 1000);
-- Set when the offer is proposed (lib/admin/meritServer), so the waitlist can be filled in merit order.
ALTER TABLE public.admission_offers ADD COLUMN merit numeric(8,2);

-- ── Slots ───────────────────────────────────────────────────────────────────
CREATE TABLE public.admission_slots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  session text NOT NULL CHECK (session ~ '^\d{4}-\d{2}$'),
  -- Null: any class.
  grade integer CHECK (grade IS NULL OR grade BETWEEN -2 AND 12),
  starts_at timestamptz NOT NULL,
  minutes integer NOT NULL DEFAULT 60 CHECK (minutes BETWEEN 10 AND 480),
  place text CHECK (place IS NULL OR length(place) <= 120),
  capacity integer NOT NULL CHECK (capacity BETWEEN 1 AND 500),
  note text CHECK (note IS NULL OR length(note) <= 300),
  cancelled_at timestamptz,
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX admission_slots_school ON public.admission_slots (school_id, session, starts_at);
CREATE TRIGGER trg_audit_admission_slots AFTER INSERT OR DELETE OR UPDATE ON public.admission_slots FOR EACH ROW EXECUTE FUNCTION app.audit();

-- ── Bookings ────────────────────────────────────────────────────────────────
-- booked → attended (with a score) | no_show | cancelled. One booking at a time per applicant.
CREATE TABLE public.admission_bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  slot_id uuid NOT NULL REFERENCES public.admission_slots(id) ON DELETE CASCADE,
  applicant_id uuid NOT NULL REFERENCES public.admission_applicants(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'booked' CHECK (status IN ('booked', 'attended', 'no_show', 'cancelled')),
  -- Null: the family booked it on the apply page.
  booked_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  booked_at timestamptz NOT NULL DEFAULT now(),
  score numeric(6,2) CHECK (score IS NULL OR score BETWEEN 0 AND 1000),
  scored_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  scored_at timestamptz,
  note text CHECK (note IS NULL OR length(note) <= 500),
  CHECK (score IS NULL OR status = 'attended')
);
CREATE UNIQUE INDEX admission_bookings_live ON public.admission_bookings (applicant_id) WHERE status = 'booked';
CREATE INDEX admission_bookings_slot ON public.admission_bookings (slot_id, status);
CREATE TRIGGER trg_audit_admission_bookings AFTER INSERT OR DELETE OR UPDATE ON public.admission_bookings FOR EACH ROW EXECUTE FUNCTION app.audit();

-- Books an applicant into a slot (a booking they already have is cancelled): the slot must be for their class and
-- admission year, still ahead, not cancelled and not full. Under a lock of the slot, so two bookings never take its
-- last place. Returns the booking.
CREATE OR REPLACE FUNCTION public.admission_book(p_school uuid, p_slot uuid, p_applicant uuid, p_actor uuid) RETURNS uuid
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
  AS $$
DECLARE s public.admission_slots; a record; v_taken int; v_id uuid;
BEGIN
  SELECT * INTO s FROM public.admission_slots WHERE id = p_slot AND school_id = p_school FOR UPDATE;
  IF s.id IS NULL OR s.cancelled_at IS NOT NULL THEN RAISE EXCEPTION 'That slot is no longer offered.' USING ERRCODE = 'P0002'; END IF;
  IF s.starts_at <= now() THEN RAISE EXCEPTION 'That slot has already started.' USING ERRCODE = '22023'; END IF;
  SELECT id, grade, session, stage, student_id INTO a FROM public.admission_applicants WHERE id = p_applicant AND school_id = p_school FOR UPDATE;
  IF a.id IS NULL THEN RAISE EXCEPTION 'Applicant not found.' USING ERRCODE = 'P0002'; END IF;
  IF a.stage IN ('rejected', 'withdrawn') OR a.student_id IS NOT NULL THEN RAISE EXCEPTION 'This application is closed.' USING ERRCODE = '22023'; END IF;
  IF s.session <> a.session OR (s.grade IS NOT NULL AND s.grade <> a.grade) THEN RAISE EXCEPTION 'That slot is for another class or year.' USING ERRCODE = '22023'; END IF;
  SELECT count(*) INTO v_taken FROM public.admission_bookings WHERE slot_id = s.id AND status = 'booked' AND applicant_id <> p_applicant;
  IF v_taken >= s.capacity THEN RAISE EXCEPTION 'That slot is full. Pick another.' USING ERRCODE = 'SA409'; END IF;
  SELECT id INTO v_id FROM public.admission_bookings WHERE applicant_id = p_applicant AND status = 'booked' AND slot_id = s.id;
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;
  UPDATE public.admission_bookings SET status = 'cancelled' WHERE applicant_id = p_applicant AND status = 'booked';
  INSERT INTO public.admission_bookings (school_id, slot_id, applicant_id, booked_by) VALUES (p_school, s.id, p_applicant, p_actor) RETURNING id INTO v_id;
  UPDATE public.admission_applicants SET assessment_on = (s.starts_at AT TIME ZONE 'Asia/Kolkata')::date WHERE id = p_applicant;
  RETURN v_id;
END $$;

-- ── The waitlist fills in merit order ───────────────────────────────────────
-- As in 20261029090000, ordered by the offer's merit (highest first; offers without one after), then waiting time.
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
      ORDER BY merit DESC NULLS LAST, waitlisted_at, created_at LIMIT 1 FOR UPDATE SKIP LOCKED;
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

-- ── Access ──────────────────────────────────────────────────────────────────
ALTER TABLE public.admission_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admission_bookings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.admission_slots FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.admission_bookings FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.admission_slots TO service_role;
GRANT ALL ON public.admission_bookings TO service_role;
REVOKE ALL ON FUNCTION public.admission_book(uuid, uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admission_book(uuid, uuid, uuid, uuid) TO service_role;
