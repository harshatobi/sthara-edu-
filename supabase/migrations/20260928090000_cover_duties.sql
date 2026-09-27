-- Scheduling, phase 2: cover for absent teachers, duty rosters, visiting staff and comp-off — 2026-09-28
--
-- A person is either an account (user_id) or someone on the staff register with no login (staff_member_id);
-- every table below holds exactly one of the two.
--
-- staff_members        + employment (permanent / contract / visiting), contract window, WhatsApp consent for staff
--                        with no login (their roster goes to the register phone only when they agreed)
-- timetable_slots      + staff_member_id: a visiting dance or music teacher with no login can hold periods
-- staff_absences       absent today (full day, morning, afternoon) or released for some periods; reported on
--                        WhatsApp or entered by the office, and confirmed by the office
-- cover_assignments    who takes an absent teacher's lesson on a date (or that it isn't needed)
-- duty_posts           gate, bus, lunch, corridor, assembly: a post with its days and hours
-- duty_roster          the fixed weekly roster: who holds a post on a weekday
-- duty_assignments     dated duties: exam invigilation (room + session), event duty, one-offs
-- visit_sessions       a visiting teacher's session taken or missed, confirmed by the office (per-session pay)
-- comp_off_grants      a compensatory day HR grants from a duty record; adds to the compensatory leave balance
--
-- Permissions: cover and invigilation need schedule.academic; posts, roster, event duty, visiting staff and
-- comp-off need schedule.workforce. Reads: staff of the school see covers and duties (a teacher needs to know
-- who covers them and where they're on duty); absences, sessions and comp-off only to those who manage them
-- and each person their own. Writes only through the /api/admin/schedule routes (service role).

-- ── Leave: compensatory days come from grants, not a yearly policy ──────────
ALTER TABLE public.leave_requests DROP CONSTRAINT IF EXISTS leave_requests_leave_type_check;
ALTER TABLE public.leave_requests ADD CONSTRAINT leave_requests_leave_type_check
  CHECK (leave_type IN ('casual', 'sick', 'earned', 'duty', 'maternity', 'paternity', 'unpaid', 'compensatory'));

-- ── Staff register ──────────────────────────────────────────────────────────
ALTER TABLE public.staff_members ADD COLUMN IF NOT EXISTS employment text NOT NULL DEFAULT 'permanent'
  CHECK (employment IN ('permanent', 'contract', 'visiting'));
ALTER TABLE public.staff_members ADD COLUMN IF NOT EXISTS contract_from date;
ALTER TABLE public.staff_members ADD COLUMN IF NOT EXISTS contract_to date;
ALTER TABLE public.staff_members ADD COLUMN IF NOT EXISTS whatsapp_opt_in boolean NOT NULL DEFAULT false;
ALTER TABLE public.staff_members DROP CONSTRAINT IF EXISTS staff_members_contract_check;
ALTER TABLE public.staff_members ADD CONSTRAINT staff_members_contract_check
  CHECK (contract_to IS NULL OR contract_from IS NULL OR contract_to >= contract_from);

-- ── Timetable: a lesson's teacher can be a register member with no login ────
ALTER TABLE public.timetable_slots ADD COLUMN IF NOT EXISTS staff_member_id uuid REFERENCES public.staff_members(id) ON DELETE SET NULL;
ALTER TABLE public.timetable_slots DROP CONSTRAINT IF EXISTS timetable_slots_one_teacher;
ALTER TABLE public.timetable_slots ADD CONSTRAINT timetable_slots_one_teacher CHECK (teacher_id IS NULL OR staff_member_id IS NULL);
CREATE INDEX IF NOT EXISTS idx_timetable_slots_staff_member ON public.timetable_slots (staff_member_id, version_id) WHERE staff_member_id IS NOT NULL;

-- The clash check now covers register members as well as accounts.
CREATE OR REPLACE FUNCTION app.check_timetable_slot() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE clash record;
BEGIN
  IF NEW.school_id IS DISTINCT FROM (SELECT school_id FROM public.timetable_versions WHERE id = NEW.version_id) THEN
    RAISE EXCEPTION 'timetable slot and version are in different schools';
  END IF;
  IF NEW.teacher_id IS NOT NULL OR NEW.staff_member_id IS NOT NULL THEN
    SELECT s.class INTO clash FROM public.timetable_slots s
     WHERE s.version_id = NEW.version_id AND s.weekday = NEW.weekday AND s.period_no = NEW.period_no AND s.id <> NEW.id
       AND ((NEW.teacher_id IS NOT NULL AND s.teacher_id = NEW.teacher_id)
            OR (NEW.staff_member_id IS NOT NULL AND s.staff_member_id = NEW.staff_member_id))
       AND NOT (NEW.combined AND s.combined AND lower(s.subject) = lower(NEW.subject))
     LIMIT 1;
    IF FOUND THEN
      RAISE EXCEPTION 'teacher clash: already teaching % in this period', clash.class USING ERRCODE = '23P01';
    END IF;
  END IF;
  IF NEW.room_id IS NOT NULL THEN
    SELECT s.class INTO clash FROM public.timetable_slots s
     WHERE s.version_id = NEW.version_id AND s.weekday = NEW.weekday AND s.period_no = NEW.period_no
       AND s.room_id = NEW.room_id AND s.id <> NEW.id
       AND NOT (NEW.combined AND s.combined AND lower(s.subject) = lower(NEW.subject))
     LIMIT 1;
    IF FOUND THEN
      RAISE EXCEPTION 'room clash: % is already in this room in this period', clash.class USING ERRCODE = '23P01';
    END IF;
  END IF;
  RETURN NEW;
END $$;

-- ── Absences and releases ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.staff_absences (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id        uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  user_id          uuid REFERENCES public.users(id) ON DELETE CASCADE,
  staff_member_id  uuid REFERENCES public.staff_members(id) ON DELETE CASCADE,
  on_date          date NOT NULL,
  kind             text NOT NULL DEFAULT 'absent' CHECK (kind IN ('absent', 'release')),
  portion          text NOT NULL DEFAULT 'full' CHECK (portion IN ('full', 'am', 'pm', 'periods')),
  period_nos       smallint[] NOT NULL DEFAULT '{}',
  reason           text CHECK (length(reason) <= 500),
  status           text NOT NULL DEFAULT 'confirmed' CHECK (status IN ('reported', 'confirmed', 'cancelled')),
  source           text NOT NULL DEFAULT 'office' CHECK (source IN ('office', 'whatsapp')),
  created_by       uuid REFERENCES public.users(id) ON DELETE SET NULL,
  confirmed_by     uuid REFERENCES public.users(id) ON DELETE SET NULL,
  confirmed_at     timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  CHECK (num_nonnulls(user_id, staff_member_id) = 1),
  CHECK (portion <> 'periods' OR cardinality(period_nos) > 0),
  CHECK (period_nos <@ ARRAY[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16]::smallint[]),
  CHECK (kind <> 'release' OR portion = 'periods')
);
CREATE INDEX IF NOT EXISTS idx_staff_absences_school_date ON public.staff_absences (school_id, on_date);

-- ── Cover ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.cover_assignments (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id               uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  on_date                 date NOT NULL,
  slot_id                 uuid NOT NULL REFERENCES public.timetable_slots(id) ON DELETE CASCADE,
  -- A snapshot of the lesson, so reports read the same after the timetable moves on.
  class                   text NOT NULL,
  period_no               smallint NOT NULL,
  subject                 text NOT NULL,
  absent_user_id          uuid REFERENCES public.users(id) ON DELETE SET NULL,
  absent_staff_member_id  uuid REFERENCES public.staff_members(id) ON DELETE SET NULL,
  reason                  text NOT NULL CHECK (reason IN ('leave', 'absent', 'release')),
  status                  text NOT NULL DEFAULT 'assigned' CHECK (status IN ('assigned', 'not_needed')),
  sub_user_id             uuid REFERENCES public.users(id) ON DELETE SET NULL,
  sub_staff_member_id     uuid REFERENCES public.staff_members(id) ON DELETE SET NULL,
  flag_note               text CHECK (length(flag_note) <= 500),
  flagged_at              timestamptz,
  assigned_by             uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  UNIQUE (on_date, slot_id),
  CHECK (status <> 'assigned' OR num_nonnulls(sub_user_id, sub_staff_member_id) = 1),
  CHECK (status <> 'not_needed' OR num_nonnulls(sub_user_id, sub_staff_member_id) = 0)
);
CREATE INDEX IF NOT EXISTS idx_cover_school_date ON public.cover_assignments (school_id, on_date);
CREATE INDEX IF NOT EXISTS idx_cover_sub_user ON public.cover_assignments (sub_user_id, on_date) WHERE sub_user_id IS NOT NULL;

-- ── Duties ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.duty_posts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id   uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  name        text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 80),
  kind        text NOT NULL DEFAULT 'other' CHECK (kind IN ('gate', 'bus', 'lunch', 'corridor', 'assembly', 'event', 'other')),
  weekdays    smallint[] NOT NULL DEFAULT '{1,2,3,4,5}',
  starts_at   time NOT NULL,
  ends_at     time NOT NULL,
  location    text CHECK (length(location) <= 80),
  needed      smallint NOT NULL DEFAULT 1 CHECK (needed BETWEEN 1 AND 20),
  active      boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, name),
  CHECK (ends_at > starts_at),
  CHECK (weekdays <@ ARRAY[1,2,3,4,5,6,7]::smallint[] AND cardinality(weekdays) > 0)
);

CREATE TABLE IF NOT EXISTS public.duty_roster (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id        uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  post_id          uuid NOT NULL REFERENCES public.duty_posts(id) ON DELETE CASCADE,
  weekday          smallint NOT NULL CHECK (weekday BETWEEN 1 AND 7),
  user_id          uuid REFERENCES public.users(id) ON DELETE CASCADE,
  staff_member_id  uuid REFERENCES public.staff_members(id) ON DELETE CASCADE,
  created_by       uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  CHECK (num_nonnulls(user_id, staff_member_id) = 1)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_duty_roster_user ON public.duty_roster (post_id, weekday, user_id) WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_duty_roster_staff ON public.duty_roster (post_id, weekday, staff_member_id) WHERE staff_member_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_duty_roster_school ON public.duty_roster (school_id);

CREATE TABLE IF NOT EXISTS public.duty_assignments (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id        uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  on_date          date NOT NULL,
  starts_at        time NOT NULL,
  ends_at          time NOT NULL,
  kind             text NOT NULL CHECK (kind IN ('invigilation', 'event', 'other')),
  title            text NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 120),
  event_id         uuid REFERENCES public.academic_events(id) ON DELETE SET NULL,
  room_id          uuid REFERENCES public.rooms(id) ON DELETE SET NULL,
  user_id          uuid REFERENCES public.users(id) ON DELETE CASCADE,
  staff_member_id  uuid REFERENCES public.staff_members(id) ON DELETE CASCADE,
  note             text CHECK (length(note) <= 500),
  created_by       uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  CHECK (num_nonnulls(user_id, staff_member_id) = 1),
  CHECK (ends_at > starts_at)
);
CREATE INDEX IF NOT EXISTS idx_duty_assignments_school_date ON public.duty_assignments (school_id, on_date);

-- ── Visiting staff sessions ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.visit_sessions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id        uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  staff_member_id  uuid NOT NULL REFERENCES public.staff_members(id) ON DELETE CASCADE,
  on_date          date NOT NULL,
  slot_id          uuid REFERENCES public.timetable_slots(id) ON DELETE SET NULL,
  class            text,
  subject          text,
  status           text NOT NULL CHECK (status IN ('taken', 'missed')),
  note             text CHECK (length(note) <= 500),
  confirmed_by     uuid REFERENCES public.users(id) ON DELETE SET NULL,
  confirmed_at     timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_visit_sessions ON public.visit_sessions (staff_member_id, on_date, slot_id) WHERE slot_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_visit_sessions_school ON public.visit_sessions (school_id, on_date);

-- ── Comp-off ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.comp_off_grants (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id        uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  user_id          uuid REFERENCES public.users(id) ON DELETE CASCADE,
  staff_member_id  uuid REFERENCES public.staff_members(id) ON DELETE CASCADE,
  days             numeric(2,1) NOT NULL CHECK (days IN (0.5, 1)),
  duty_on          date NOT NULL,
  source           text NOT NULL CHECK (source IN ('roster', 'duty', 'cover', 'other')),
  source_id        uuid,
  note             text NOT NULL CHECK (length(trim(note)) BETWEEN 1 AND 500),
  granted_by       uuid REFERENCES public.users(id) ON DELETE SET NULL,
  granted_at       timestamptz NOT NULL DEFAULT now(),
  revoked_at       timestamptz,
  revoked_by       uuid REFERENCES public.users(id) ON DELETE SET NULL,
  CHECK (num_nonnulls(user_id, staff_member_id) = 1)
);
CREATE INDEX IF NOT EXISTS idx_comp_off_school ON public.comp_off_grants (school_id, duty_on);

-- ── Access ──────────────────────────────────────────────────────────────────
ALTER TABLE public.staff_absences    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cover_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.duty_posts        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.duty_roster       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.duty_assignments  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.visit_sessions    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comp_off_grants   ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.staff_absences, public.cover_assignments, public.duty_posts, public.duty_roster, public.duty_assignments,
  public.visit_sessions, public.comp_off_grants FROM anon, authenticated;
GRANT SELECT ON public.staff_absences, public.cover_assignments, public.duty_posts, public.duty_roster, public.duty_assignments,
  public.visit_sessions, public.comp_off_grants TO authenticated;
GRANT ALL ON public.staff_absences, public.cover_assignments, public.duty_posts, public.duty_roster, public.duty_assignments,
  public.visit_sessions, public.comp_off_grants TO service_role;

-- Covers and duties: every teacher and office account of the school.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['cover_assignments', 'duty_posts', 'duty_roster', 'duty_assignments'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %1$s_read ON public.%1$I', t);
    EXECUTE format('CREATE POLICY %1$s_read ON public.%1$I FOR SELECT TO authenticated
      USING (((SELECT app.is_staff()) AND school_id = (SELECT app.current_school_id())) OR (SELECT app.is_superadmin()))', t);
  END LOOP;
END $$;

-- Absences (with their reasons): the person, and those who arrange cover or manage staff.
DROP POLICY IF EXISTS staff_absences_read ON public.staff_absences;
CREATE POLICY staff_absences_read ON public.staff_absences FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid())
         OR (school_id = (SELECT app.current_school_id())
             AND ((SELECT app.has_perm('schedule.academic')) OR (SELECT app.has_perm('schedule.workforce')) OR (SELECT app.has_perm('workforce.read'))))
         OR (SELECT app.is_superadmin()));

DROP POLICY IF EXISTS visit_sessions_read ON public.visit_sessions;
CREATE POLICY visit_sessions_read ON public.visit_sessions FOR SELECT TO authenticated
  USING ((school_id = (SELECT app.current_school_id())
          AND ((SELECT app.has_perm('schedule.academic')) OR (SELECT app.has_perm('schedule.workforce')) OR (SELECT app.has_perm('workforce.read'))))
         OR (SELECT app.is_superadmin()));

DROP POLICY IF EXISTS comp_off_grants_read ON public.comp_off_grants;
CREATE POLICY comp_off_grants_read ON public.comp_off_grants FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid())
         OR (school_id = (SELECT app.current_school_id())
             AND ((SELECT app.has_perm('schedule.workforce')) OR (SELECT app.has_perm('workforce.read')) OR (SELECT app.has_perm('leave.approve'))))
         OR (SELECT app.is_superadmin()));

-- ── Audit ───────────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_audit_staff_absences ON public.staff_absences;
CREATE TRIGGER trg_audit_staff_absences AFTER INSERT OR UPDATE OR DELETE ON public.staff_absences
  FOR EACH ROW EXECUTE FUNCTION app.audit('status,portion,period_nos');
DROP TRIGGER IF EXISTS trg_audit_cover_assignments ON public.cover_assignments;
CREATE TRIGGER trg_audit_cover_assignments AFTER INSERT OR UPDATE OR DELETE ON public.cover_assignments
  FOR EACH ROW EXECUTE FUNCTION app.audit('status,sub_user_id,sub_staff_member_id');
DROP TRIGGER IF EXISTS trg_audit_comp_off_grants ON public.comp_off_grants;
CREATE TRIGGER trg_audit_comp_off_grants AFTER INSERT OR UPDATE OR DELETE ON public.comp_off_grants
  FOR EACH ROW EXECUTE FUNCTION app.audit('days,revoked_at');
DROP TRIGGER IF EXISTS trg_audit_visit_sessions ON public.visit_sessions;
CREATE TRIGGER trg_audit_visit_sessions AFTER INSERT OR UPDATE OR DELETE ON public.visit_sessions
  FOR EACH ROW EXECUTE FUNCTION app.audit('status');
