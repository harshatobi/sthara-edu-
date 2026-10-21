-- Scheduling, phase 3: shifts and staff attendance; leave for staff with no login; admissions -> enrolment — 2026-09-28
--
-- A person is an account (user_id) or a register member with no login (staff_member_id); each table holds one.
--
-- attendance_settings    per school: teachers' reporting time and day end, office hours, grace minutes, the late and
--                         short-day rules (each switchable), the campus geofence, no-show alerts
-- shifts                  named hours (Morning 06:00-14:00, Night 22:00-06:00 crosses midnight)
-- staff_shift_plans       one per person: a fixed shift or a weekly rotation of shifts; a fixed or rotating weekly off;
--                         works on holidays; exempt from the late rules; their own grace
-- shift_overrides         one day for one person: another shift, a day off, or a working day (swaps are two rows)
-- staff_punches           check-ins and check-outs from the biometric device, the app (with an on-campus yes/no, never
--                         coordinates) and WhatsApp; every punch is kept
-- staff_day_marks         the supervisor's register or an HR/principal correction for a day; always wins
-- attendance_devices      biometric devices that push punches (token stored hashed)
-- attendance_month_reviews the month-end review: proposed half days / loss of pay, confirmed or waived by HR
-- staff_noshow_alerts     one no-show alert per person per day
-- leave_requests          + staff_member_id (leave for staff with no login), source, entered_by
-- admission_applicants    + student_id, parent_id (the accounts created at enrolment)
-- admin_invoice_student() bills a newly enrolled student every instalment already raised for their grade this session
--
-- Permissions: schedule.workforce manages all of it; workforce.read reads it. Each person reads their own punches,
-- marks, plan and month review. Writes only through the API routes (service role).

-- ── Settings ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.attendance_settings (
  school_id          uuid PRIMARY KEY REFERENCES public.schools(id) ON DELETE CASCADE,
  teacher_start      time NOT NULL DEFAULT '07:45',
  teacher_end        time NOT NULL DEFAULT '15:00',
  office_start       time NOT NULL DEFAULT '09:00',
  office_end         time NOT NULL DEFAULT '17:00',
  grace_min          smallint NOT NULL DEFAULT 10 CHECK (grace_min BETWEEN 0 AND 120),
  lates_rule         boolean NOT NULL DEFAULT true,
  lates_per_half_day smallint NOT NULL DEFAULT 3 CHECK (lates_per_half_day BETWEEN 1 AND 31),
  short_rule         boolean NOT NULL DEFAULT true,
  min_full_hours     numeric(4,2) NOT NULL DEFAULT 6 CHECK (min_full_hours BETWEEN 1 AND 16),
  absent_rule        boolean NOT NULL DEFAULT true,
  geofence_lat       numeric(9,6) CHECK (geofence_lat BETWEEN -90 AND 90),
  geofence_lng       numeric(9,6) CHECK (geofence_lng BETWEEN -180 AND 180),
  geofence_radius_m  int NOT NULL DEFAULT 200 CHECK (geofence_radius_m BETWEEN 50 AND 5000),
  noshow_alerts      boolean NOT NULL DEFAULT true,
  updated_by         uuid REFERENCES public.users(id) ON DELETE SET NULL,
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CHECK (teacher_end > teacher_start AND office_end > office_start)
);

-- ── Shifts and plans ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.shifts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id   uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  name        text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 60),
  starts_at   time NOT NULL,
  ends_at     time NOT NULL,        -- earlier than starts_at means the shift ends the next morning
  active      boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, name),
  CHECK (ends_at <> starts_at)
);

CREATE TABLE IF NOT EXISTS public.staff_shift_plans (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id        uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  user_id          uuid REFERENCES public.users(id) ON DELETE CASCADE,
  staff_member_id  uuid REFERENCES public.staff_members(id) ON DELETE CASCADE,
  mode             text NOT NULL DEFAULT 'fixed' CHECK (mode IN ('fixed', 'rotating')),
  shift_id         uuid REFERENCES public.shifts(id) ON DELETE SET NULL,
  rotation         uuid[] NOT NULL DEFAULT '{}',          -- shift ids, one per week, repeating
  off_mode         text NOT NULL DEFAULT 'fixed' CHECK (off_mode IN ('fixed', 'rotating', 'none')),
  off_days         smallint[] NOT NULL DEFAULT '{7}',     -- ISO weekdays off every week
  off_cycle        smallint[] NOT NULL DEFAULT '{}',      -- rotating: this week's off day, next week's, ...
  anchor_date      date NOT NULL DEFAULT current_date,    -- week 0 of the rotations
  works_holidays   boolean NOT NULL DEFAULT false,
  rules_exempt     boolean NOT NULL DEFAULT false,
  grace_min        smallint CHECK (grace_min BETWEEN 0 AND 120),
  note             text CHECK (length(note) <= 500),
  updated_by       uuid REFERENCES public.users(id) ON DELETE SET NULL,
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CHECK (num_nonnulls(user_id, staff_member_id) = 1),
  CHECK (mode <> 'fixed' OR shift_id IS NOT NULL),
  CHECK (mode <> 'rotating' OR cardinality(rotation) > 0),
  CHECK (off_mode <> 'rotating' OR cardinality(off_cycle) > 0),
  CHECK (off_days <@ ARRAY[1,2,3,4,5,6,7]::smallint[] AND off_cycle <@ ARRAY[1,2,3,4,5,6,7]::smallint[])
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_shift_plans_user ON public.staff_shift_plans (user_id) WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_shift_plans_staff ON public.staff_shift_plans (staff_member_id) WHERE staff_member_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_shift_plans_school ON public.staff_shift_plans (school_id);

CREATE TABLE IF NOT EXISTS public.shift_overrides (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id        uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  user_id          uuid REFERENCES public.users(id) ON DELETE CASCADE,
  staff_member_id  uuid REFERENCES public.staff_members(id) ON DELETE CASCADE,
  on_date          date NOT NULL,
  kind             text NOT NULL CHECK (kind IN ('shift', 'off', 'work')),
  shift_id         uuid REFERENCES public.shifts(id) ON DELETE CASCADE,
  swap_group       uuid,
  reason           text NOT NULL CHECK (length(trim(reason)) BETWEEN 1 AND 300),
  created_by       uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  CHECK (num_nonnulls(user_id, staff_member_id) = 1),
  CHECK (kind <> 'shift' OR shift_id IS NOT NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_shift_overrides_user ON public.shift_overrides (user_id, on_date) WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_shift_overrides_staff ON public.shift_overrides (staff_member_id, on_date) WHERE staff_member_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_shift_overrides_school ON public.shift_overrides (school_id, on_date);

-- ── Punches, marks, devices ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.attendance_devices (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id     uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  name          text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 80),
  vendor        text CHECK (length(vendor) <= 60),
  token_hash    text NOT NULL UNIQUE,
  active        boolean NOT NULL DEFAULT true,
  last_seen_at  timestamptz,
  created_by    uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.staff_punches (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id        uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  user_id          uuid REFERENCES public.users(id) ON DELETE CASCADE,
  staff_member_id  uuid REFERENCES public.staff_members(id) ON DELETE CASCADE,
  at               timestamptz NOT NULL,
  direction        text NOT NULL DEFAULT 'unknown' CHECK (direction IN ('in', 'out', 'unknown')),
  source           text NOT NULL CHECK (source IN ('biometric', 'app', 'whatsapp')),
  on_campus        boolean,
  device_id        uuid REFERENCES public.attendance_devices(id) ON DELETE SET NULL,
  created_by       uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  CHECK (num_nonnulls(user_id, staff_member_id) = 1)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_punch_user ON public.staff_punches (user_id, at, source) WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_punch_staff ON public.staff_punches (staff_member_id, at, source) WHERE staff_member_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_punches_school_at ON public.staff_punches (school_id, at);

CREATE TABLE IF NOT EXISTS public.staff_day_marks (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id        uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  user_id          uuid REFERENCES public.users(id) ON DELETE CASCADE,
  staff_member_id  uuid REFERENCES public.staff_members(id) ON DELETE CASCADE,
  on_date          date NOT NULL,
  status           text NOT NULL CHECK (status IN ('present', 'absent', 'half_day', 'off')),
  in_at            time,
  out_at           time,
  source           text NOT NULL CHECK (source IN ('register', 'override')),
  reason           text CHECK (length(reason) <= 300),
  created_by       uuid REFERENCES public.users(id) ON DELETE SET NULL,
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CHECK (num_nonnulls(user_id, staff_member_id) = 1),
  CHECK (source <> 'override' OR length(trim(coalesce(reason, ''))) > 0)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_marks_user ON public.staff_day_marks (user_id, on_date) WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_marks_staff ON public.staff_day_marks (staff_member_id, on_date) WHERE staff_member_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_marks_school_date ON public.staff_day_marks (school_id, on_date);

-- ── Month-end review ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.attendance_month_reviews (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id        uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  user_id          uuid REFERENCES public.users(id) ON DELETE CASCADE,
  staff_member_id  uuid REFERENCES public.staff_members(id) ON DELETE CASCADE,
  month            date NOT NULL CHECK (extract(day FROM month) = 1),
  status           text NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed')),
  summary          jsonb NOT NULL,                    -- the computed month as it stood when confirmed
  waived           text[] NOT NULL DEFAULT '{}',      -- proposal keys HR waived
  lop_days         numeric(5,1) NOT NULL DEFAULT 0 CHECK (lop_days >= 0),
  note             text CHECK (length(note) <= 1000),
  confirmed_by     uuid REFERENCES public.users(id) ON DELETE SET NULL,
  confirmed_at     timestamptz NOT NULL DEFAULT now(),
  CHECK (num_nonnulls(user_id, staff_member_id) = 1)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_review_user ON public.attendance_month_reviews (user_id, month) WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_review_staff ON public.attendance_month_reviews (staff_member_id, month) WHERE staff_member_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.staff_noshow_alerts (
  school_id   uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  on_date     date NOT NULL,
  alerted_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, on_date)
);

-- ── Leave for staff with no login ───────────────────────────────────────────
ALTER TABLE public.leave_requests ALTER COLUMN staff_id DROP NOT NULL;
ALTER TABLE public.leave_requests ADD COLUMN IF NOT EXISTS staff_member_id uuid REFERENCES public.staff_members(id) ON DELETE CASCADE;
ALTER TABLE public.leave_requests ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'app' CHECK (source IN ('app', 'office', 'whatsapp'));
ALTER TABLE public.leave_requests ADD COLUMN IF NOT EXISTS entered_by uuid REFERENCES public.users(id) ON DELETE SET NULL;
ALTER TABLE public.leave_requests DROP CONSTRAINT IF EXISTS leave_requests_one_person;
ALTER TABLE public.leave_requests ADD CONSTRAINT leave_requests_one_person CHECK (num_nonnulls(staff_id, staff_member_id) = 1);
CREATE INDEX IF NOT EXISTS idx_leave_requests_member ON public.leave_requests (staff_member_id, from_date DESC) WHERE staff_member_id IS NOT NULL;

-- ── Admissions -> enrolment ─────────────────────────────────────────────────
ALTER TABLE public.admission_applicants ADD COLUMN IF NOT EXISTS student_id uuid REFERENCES public.users(id) ON DELETE SET NULL;
ALTER TABLE public.admission_applicants ADD COLUMN IF NOT EXISTS parent_id uuid REFERENCES public.users(id) ON DELETE SET NULL;

-- A student enrolled mid-session is billed every instalment already raised for their grade (same amounts and due dates).
CREATE OR REPLACE FUNCTION public.admin_invoice_student(p_school uuid, p_student uuid, p_session text, p_actor uuid)
RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE fs record; e jsonb; n int := 0; v_no int;
BEGIN
  SELECT s.annual_fee, s.schedule INTO fs FROM public.users u
    JOIN public.fee_structures s ON s.school_id = u.school_id AND s.session = p_session AND s.grade = app.grade_of(u.student_class)
   WHERE u.id = p_student AND u.school_id = p_school AND u.role = 'student';
  IF NOT FOUND THEN RETURN 0; END IF;
  FOR e IN SELECT * FROM jsonb_array_elements(fs.schedule) LOOP
    v_no := (e ->> 'no')::int;
    CONTINUE WHEN NOT EXISTS (SELECT 1 FROM public.fee_invoices i JOIN public.users x ON x.id = i.student_id
                              WHERE i.school_id = p_school AND i.session = p_session AND i.instalment_no = v_no AND i.voided_at IS NULL
                                AND app.grade_of(x.student_class) = (SELECT app.grade_of(student_class) FROM public.users WHERE id = p_student));
    CONTINUE WHEN EXISTS (SELECT 1 FROM public.fee_invoices WHERE student_id = p_student AND session = p_session AND instalment_no = v_no);
    INSERT INTO public.fee_invoices (school_id, student_id, session, instalment_no, label, invoice_no, due_on, amount, created_by)
    VALUES (p_school, p_student, p_session, v_no, coalesce(e ->> 'label', 'Instalment ' || v_no),
            app.next_doc_no(p_school, 'invoice', p_session), (e ->> 'due_on')::date, round(fs.annual_fee * (e ->> 'share')::numeric, 2), p_actor);
    n := n + 1;
  END LOOP;
  RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.admin_invoice_student(uuid, uuid, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_invoice_student(uuid, uuid, text, uuid) TO service_role;

-- ── Access ──────────────────────────────────────────────────────────────────
ALTER TABLE public.attendance_settings      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shifts                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_shift_plans        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shift_overrides          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_devices       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_punches            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_day_marks          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_month_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_noshow_alerts      ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.attendance_settings, public.shifts, public.staff_shift_plans, public.shift_overrides, public.attendance_devices,
  public.staff_punches, public.staff_day_marks, public.attendance_month_reviews, public.staff_noshow_alerts FROM anon, authenticated;
GRANT SELECT ON public.attendance_settings, public.shifts, public.staff_shift_plans, public.shift_overrides, public.attendance_devices,
  public.staff_punches, public.staff_day_marks, public.attendance_month_reviews TO authenticated;
GRANT ALL ON public.attendance_settings, public.shifts, public.staff_shift_plans, public.shift_overrides, public.attendance_devices,
  public.staff_punches, public.staff_day_marks, public.attendance_month_reviews, public.staff_noshow_alerts TO service_role;

-- Settings and shift names: every teacher and office account of the school.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['attendance_settings', 'shifts'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %1$s_read ON public.%1$I', t);
    EXECUTE format('CREATE POLICY %1$s_read ON public.%1$I FOR SELECT TO authenticated
      USING (((SELECT app.is_staff()) AND school_id = (SELECT app.current_school_id())) OR (SELECT app.is_superadmin()))', t);
  END LOOP;
  -- A person's own rows, or everyone's for those who manage or oversee staff.
  FOREACH t IN ARRAY ARRAY['staff_shift_plans', 'shift_overrides', 'staff_punches', 'staff_day_marks', 'attendance_month_reviews'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %1$s_read ON public.%1$I', t);
    EXECUTE format('CREATE POLICY %1$s_read ON public.%1$I FOR SELECT TO authenticated
      USING (user_id = (SELECT auth.uid())
             OR (school_id = (SELECT app.current_school_id())
                 AND ((SELECT app.has_perm(''schedule.workforce'')) OR (SELECT app.has_perm(''workforce.read'')) OR (SELECT app.has_perm(''schedule.academic''))))
             OR (SELECT app.is_superadmin()))', t);
  END LOOP;
END $$;
DROP POLICY IF EXISTS attendance_devices_read ON public.attendance_devices;
CREATE POLICY attendance_devices_read ON public.attendance_devices FOR SELECT TO authenticated
  USING ((school_id = (SELECT app.current_school_id()) AND (SELECT app.has_perm('schedule.workforce'))) OR (SELECT app.is_superadmin()));

-- Register staff's leave is office business: the leave read policy already lets office accounts of the school read it.

-- ── Audit ───────────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_audit_staff_day_marks ON public.staff_day_marks;
CREATE TRIGGER trg_audit_staff_day_marks AFTER INSERT OR UPDATE OR DELETE ON public.staff_day_marks
  FOR EACH ROW EXECUTE FUNCTION app.audit('status,in_at,out_at,reason');
DROP TRIGGER IF EXISTS trg_audit_month_reviews ON public.attendance_month_reviews;
CREATE TRIGGER trg_audit_month_reviews AFTER INSERT OR UPDATE OR DELETE ON public.attendance_month_reviews
  FOR EACH ROW EXECUTE FUNCTION app.audit('lop_days,waived');
DROP TRIGGER IF EXISTS trg_audit_shift_plans ON public.staff_shift_plans;
CREATE TRIGGER trg_audit_shift_plans AFTER INSERT OR UPDATE OR DELETE ON public.staff_shift_plans
  FOR EACH ROW EXECUTE FUNCTION app.audit('mode,shift_id,rotation,off_mode,off_days,off_cycle,rules_exempt,grace_min');
DROP TRIGGER IF EXISTS trg_audit_attendance_settings ON public.attendance_settings;
CREATE TRIGGER trg_audit_attendance_settings AFTER INSERT OR UPDATE ON public.attendance_settings
  FOR EACH ROW EXECUTE FUNCTION app.audit();
