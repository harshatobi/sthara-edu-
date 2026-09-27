-- Scheduling, phase 1: bells, the academic calendar, rooms, the period timetable and the staff register — 2026-09-27
--
-- sched_wings         a school's wings (Primary 1-5, Middle 6-8, Senior 9-12); a section belongs to the wing its grade falls in
-- bell_schedules      a day's bell timings for a wing (or every wing). 'regular' schedules apply on their weekdays;
--                     'variant' schedules (Saturday half day, exam day) apply only when the calendar says so
-- bell_periods        the rows of a bell schedule: teaching periods (numbered), breaks, lunch, assembly
-- rooms               classrooms, labs, halls; a classroom can be a section's home room
-- academic_events     holidays, exam windows, PTMs, meetings and events; may swap in a variant bell schedule
--                     and may suspend classes (a holiday) for some or all wings
-- timetable_versions  a draft or published timetable for a session; the published version with the latest
--                     effective_from on or before a date is the one in force
-- timetable_slots     one lesson: section x weekday x period -> subject, teacher, room. A teacher or room can be
--                     in two sections at once only as a combined lesson (both rows flagged, same subject)
-- staff_members       the staff register: everyone who works at the school, including support staff with no login.
--                     A row for a teacher or office account (user_id) holds their designation, wing and phone.
--
-- course_plans.periods_source: 'timetable' once a published timetable sets periods per week for a class + subject,
-- so pacing reads the timetable instead of a figure the teacher typed.
--
-- Permissions: schedule.academic (timetable, bells, calendar, rooms) for the academic coordinator and vice principal;
-- schedule.workforce (staff register, later shifts and staff attendance) for the HR manager; the principal and
-- school admin hold both.
--
-- Reads: staff of the school (RLS); the register's phone numbers only to those who manage the workforce, and each
-- person's own row. Writes: only through the /api/admin/schedule routes (service role), which check the permission.

INSERT INTO public.role_permissions (role_key, perm)
SELECT r, p FROM (VALUES
  ('school_admin',         ARRAY['schedule.academic','schedule.workforce']),
  ('principal',            ARRAY['schedule.academic','schedule.workforce']),
  ('vice_principal',       ARRAY['schedule.academic']),
  ('academic_coordinator', ARRAY['schedule.academic']),
  ('hr_manager',           ARRAY['schedule.workforce'])
) AS t(r, ps), unnest(ps) AS p
ON CONFLICT DO NOTHING;

-- ── Wings ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.sched_wings (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id   uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  name        text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 60),
  grade_from  smallint NOT NULL CHECK (grade_from BETWEEN 0 AND 12),
  grade_to    smallint NOT NULL CHECK (grade_to BETWEEN 0 AND 12),
  created_at  timestamptz NOT NULL DEFAULT now(),
  CHECK (grade_to >= grade_from),
  UNIQUE (school_id, name)
);

-- ── Bell schedules ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.bell_schedules (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id   uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  wing_id     uuid REFERENCES public.sched_wings(id) ON DELETE CASCADE,  -- null: every wing
  name        text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 80),
  kind        text NOT NULL DEFAULT 'regular' CHECK (kind IN ('regular', 'variant')),
  weekdays    smallint[] NOT NULL DEFAULT '{}',                           -- ISO 1 = Monday .. 7 = Sunday; regular only
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CHECK (weekdays <@ ARRAY[1,2,3,4,5,6,7]::smallint[]),
  CHECK (kind = 'regular' OR weekdays = '{}')
);
CREATE INDEX IF NOT EXISTS idx_bell_schedules_school ON public.bell_schedules (school_id);

CREATE TABLE IF NOT EXISTS public.bell_periods (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id  uuid NOT NULL REFERENCES public.bell_schedules(id) ON DELETE CASCADE,
  school_id    uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  seq          smallint NOT NULL CHECK (seq BETWEEN 1 AND 40),
  label        text NOT NULL CHECK (length(trim(label)) BETWEEN 1 AND 40),
  kind         text NOT NULL DEFAULT 'period' CHECK (kind IN ('period', 'break', 'lunch', 'assembly', 'other')),
  period_no    smallint CHECK (period_no BETWEEN 1 AND 16),                -- teaching periods only
  starts_at    time NOT NULL,
  ends_at      time NOT NULL,
  CHECK (ends_at > starts_at),
  CHECK ((kind = 'period') = (period_no IS NOT NULL)),
  UNIQUE (schedule_id, seq)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_bell_periods_no ON public.bell_periods (schedule_id, period_no) WHERE period_no IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_bell_periods_school ON public.bell_periods (school_id);

-- ── Rooms ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.rooms (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id   uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  name        text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 60),
  kind        text NOT NULL DEFAULT 'classroom' CHECK (kind IN ('classroom', 'lab', 'hall', 'library', 'ground', 'other')),
  capacity    int CHECK (capacity BETWEEN 1 AND 5000),
  home_class  text,                                                       -- display form, e.g. "Class 10-A"
  active      boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, name)
);
-- A section has at most one home room.
CREATE UNIQUE INDEX IF NOT EXISTS uq_rooms_home_class ON public.rooms (school_id, app.norm_class(home_class))
  WHERE home_class IS NOT NULL AND active;

-- ── Academic calendar ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.academic_events (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id         uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  title             text NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 120),
  kind              text NOT NULL CHECK (kind IN ('holiday', 'exam', 'ptm', 'meeting', 'event', 'other')),
  starts_on         date NOT NULL,
  ends_on           date NOT NULL,
  wing_ids          uuid[],                                               -- null: whole school
  bell_schedule_id  uuid REFERENCES public.bell_schedules(id) ON DELETE SET NULL,
  suspends_classes  boolean NOT NULL DEFAULT false,
  staff_scope       text NOT NULL DEFAULT 'none' CHECK (staff_scope IN ('all', 'teaching', 'office', 'none')),
  starts_at         time,                                                 -- a meeting or PTM's hours, when it has them
  ends_at           time,
  notes             text CHECK (length(notes) <= 2000),
  created_by        uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_on >= starts_on),
  CHECK (ends_on - starts_on <= 366),
  CHECK (starts_at IS NULL OR ends_at IS NULL OR ends_at > starts_at)
);
CREATE INDEX IF NOT EXISTS idx_academic_events_school ON public.academic_events (school_id, starts_on);

-- ── Timetable ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.timetable_versions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id       uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  session         text NOT NULL,
  name            text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 80),
  status          text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  effective_from  date,
  source          text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'import', 'copy', 'solver')),
  notes           text CHECK (length(notes) <= 2000),
  created_by      uuid REFERENCES public.users(id) ON DELETE SET NULL,
  published_by    uuid REFERENCES public.users(id) ON DELETE SET NULL,
  published_at    timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CHECK (status <> 'published' OR (effective_from IS NOT NULL AND published_at IS NOT NULL))
);
-- Two published timetables can't start on the same day.
CREATE UNIQUE INDEX IF NOT EXISTS uq_timetable_versions_effective ON public.timetable_versions (school_id, effective_from)
  WHERE status = 'published';
CREATE INDEX IF NOT EXISTS idx_timetable_versions_school ON public.timetable_versions (school_id, session, status);

CREATE TABLE IF NOT EXISTS public.timetable_slots (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id   uuid NOT NULL REFERENCES public.timetable_versions(id) ON DELETE CASCADE,
  school_id    uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  class        text NOT NULL CHECK (length(trim(class)) BETWEEN 1 AND 40),  -- display form, e.g. "Class 10-A"
  class_key    text GENERATED ALWAYS AS (app.norm_class(class)) STORED,
  group_label  text NOT NULL DEFAULT '' CHECK (length(group_label) <= 40),  -- split groups: "Biology", "Group 2"
  weekday      smallint NOT NULL CHECK (weekday BETWEEN 1 AND 7),
  period_no    smallint NOT NULL CHECK (period_no BETWEEN 1 AND 16),
  subject      text NOT NULL CHECK (length(trim(subject)) BETWEEN 1 AND 80),
  teacher_id   uuid REFERENCES public.users(id) ON DELETE SET NULL,
  room_id      uuid REFERENCES public.rooms(id) ON DELETE SET NULL,
  combined     boolean NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (version_id, class_key, weekday, period_no, group_label)
);
CREATE INDEX IF NOT EXISTS idx_timetable_slots_version ON public.timetable_slots (version_id, weekday, period_no);
CREATE INDEX IF NOT EXISTS idx_timetable_slots_teacher ON public.timetable_slots (teacher_id, version_id) WHERE teacher_id IS NOT NULL;

-- No teacher or room in two places at once, unless both rows are the same combined lesson.
CREATE OR REPLACE FUNCTION app.check_timetable_slot() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE clash record;
BEGIN
  IF NEW.school_id IS DISTINCT FROM (SELECT school_id FROM public.timetable_versions WHERE id = NEW.version_id) THEN
    RAISE EXCEPTION 'timetable slot and version are in different schools';
  END IF;
  IF NEW.teacher_id IS NOT NULL THEN
    SELECT s.class INTO clash FROM public.timetable_slots s
     WHERE s.version_id = NEW.version_id AND s.weekday = NEW.weekday AND s.period_no = NEW.period_no
       AND s.teacher_id = NEW.teacher_id AND s.id <> NEW.id
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
DROP TRIGGER IF EXISTS trg_check_timetable_slot ON public.timetable_slots;
CREATE TRIGGER trg_check_timetable_slot BEFORE INSERT OR UPDATE ON public.timetable_slots
  FOR EACH ROW EXECUTE FUNCTION app.check_timetable_slot();

-- A published timetable is frozen: changes go into a new draft.
CREATE OR REPLACE FUNCTION app.guard_published_slots() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.timetable_versions v
             WHERE v.id = coalesce(NEW.version_id, OLD.version_id) AND v.status <> 'draft') THEN
    RAISE EXCEPTION 'this timetable is published; copy it to a new draft to change it' USING ERRCODE = '42501';
  END IF;
  RETURN coalesce(NEW, OLD);
END $$;
DROP TRIGGER IF EXISTS trg_guard_published_slots ON public.timetable_slots;
CREATE TRIGGER trg_guard_published_slots BEFORE INSERT OR UPDATE OR DELETE ON public.timetable_slots
  FOR EACH ROW EXECUTE FUNCTION app.guard_published_slots();

-- ── Staff register ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.staff_members (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id    uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  user_id      uuid REFERENCES public.users(id) ON DELETE SET NULL,     -- null: no login (drivers, security, ayahs)
  name         text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 120),
  category     text NOT NULL CHECK (category IN ('teaching', 'office', 'support', 'assistant')),
  designation  text NOT NULL DEFAULT '' CHECK (length(designation) <= 80),
  wing_id      uuid REFERENCES public.sched_wings(id) ON DELETE SET NULL,
  phone_e164   text CHECK (phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  employee_code text CHECK (length(employee_code) <= 40),
  joined_on    date,
  active       boolean NOT NULL DEFAULT true,
  created_by   uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_staff_members_user ON public.staff_members (school_id, user_id) WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_staff_members_code ON public.staff_members (school_id, employee_code) WHERE employee_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_staff_members_school ON public.staff_members (school_id, active);

-- ── Pacing reads the timetable ──────────────────────────────────────────────
ALTER TABLE public.course_plans ADD COLUMN IF NOT EXISTS periods_source text NOT NULL DEFAULT 'manual'
  CHECK (periods_source IN ('manual', 'timetable'));

-- ── Access ──────────────────────────────────────────────────────────────────
ALTER TABLE public.sched_wings        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bell_schedules     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bell_periods       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rooms              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.academic_events    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.timetable_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.timetable_slots    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_members      ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.sched_wings, public.bell_schedules, public.bell_periods, public.rooms, public.academic_events,
  public.timetable_versions, public.timetable_slots, public.staff_members FROM anon, authenticated;
GRANT SELECT ON public.sched_wings, public.bell_schedules, public.bell_periods, public.rooms, public.academic_events,
  public.timetable_versions, public.timetable_slots, public.staff_members TO authenticated;
GRANT ALL ON public.sched_wings, public.bell_schedules, public.bell_periods, public.rooms, public.academic_events,
  public.timetable_versions, public.timetable_slots, public.staff_members TO service_role;

-- Every teacher and office account in the school reads the school's bells, calendar, rooms and timetables.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['sched_wings', 'bell_schedules', 'bell_periods', 'rooms', 'academic_events', 'timetable_versions', 'timetable_slots'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %1$s_read ON public.%1$I', t);
    EXECUTE format('CREATE POLICY %1$s_read ON public.%1$I FOR SELECT TO authenticated
      USING (((SELECT app.is_staff()) AND school_id = (SELECT app.current_school_id())) OR (SELECT app.is_superadmin()))', t);
  END LOOP;
END $$;

-- Draft timetables are for the people building them; everyone else sees published and archived ones.
DROP POLICY IF EXISTS timetable_versions_read ON public.timetable_versions;
CREATE POLICY timetable_versions_read ON public.timetable_versions FOR SELECT TO authenticated
  USING (((SELECT app.is_staff()) AND school_id = (SELECT app.current_school_id())
          AND (status <> 'draft' OR (SELECT app.has_perm('schedule.academic'))))
         OR (SELECT app.is_superadmin()));
DROP POLICY IF EXISTS timetable_slots_read ON public.timetable_slots;
CREATE POLICY timetable_slots_read ON public.timetable_slots FOR SELECT TO authenticated
  USING (((SELECT app.is_staff()) AND school_id = (SELECT app.current_school_id())
          AND ((SELECT app.has_perm('schedule.academic'))
               OR EXISTS (SELECT 1 FROM public.timetable_versions v WHERE v.id = version_id AND v.status <> 'draft')))
         OR (SELECT app.is_superadmin()));

-- The register holds phone numbers: those who manage the workforce, and each person their own row.
DROP POLICY IF EXISTS staff_members_read ON public.staff_members;
CREATE POLICY staff_members_read ON public.staff_members FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid())
         OR (school_id = (SELECT app.current_school_id())
             AND ((SELECT app.has_perm('schedule.workforce')) OR (SELECT app.has_perm('workforce.read'))))
         OR (SELECT app.is_superadmin()));

-- ── Audit ───────────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_audit_timetable_versions ON public.timetable_versions;
CREATE TRIGGER trg_audit_timetable_versions AFTER INSERT OR UPDATE OR DELETE ON public.timetable_versions
  FOR EACH ROW EXECUTE FUNCTION app.audit('status,effective_from,name');
DROP TRIGGER IF EXISTS trg_audit_academic_events ON public.academic_events;
CREATE TRIGGER trg_audit_academic_events AFTER INSERT OR UPDATE OR DELETE ON public.academic_events
  FOR EACH ROW EXECUTE FUNCTION app.audit();
DROP TRIGGER IF EXISTS trg_audit_staff_members ON public.staff_members;
CREATE TRIGGER trg_audit_staff_members AFTER INSERT OR UPDATE OR DELETE ON public.staff_members
  FOR EACH ROW EXECUTE FUNCTION app.audit('name,category,designation,phone_e164,active,user_id');
