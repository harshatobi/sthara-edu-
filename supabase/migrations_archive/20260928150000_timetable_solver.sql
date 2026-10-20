-- Scheduling phase 4: what each section needs taught (the solver's input), each teacher's load rules, and locking
-- lessons so the solver keeps them.
--
-- sched_requirements     per session, section and subject (and split group): periods a week, the teacher, double
--                        periods, a room kind or a specific room, how often a day, and a combined key (sections
--                        taught together as one lesson share it)
-- teacher_load_rules     per person (account or register member): target periods a week (the contracted load that
--                        load analytics compares against), caps per day / week / in a row, and times they're not in
-- sched_solver_settings  per school: the defaults for those rules, and the class-teacher-first and subject-spread rules
-- timetable_slots        + locked: the solver keeps a locked lesson where it is
-- timetable_versions     + solver_report: the score and what couldn't be placed, for a solver-built draft
--
-- Reads: timetable builders (schedule.academic) and those who see staff load (schedule.workforce, workforce.read).
-- Writes only through the API routes (service role).

CREATE TABLE IF NOT EXISTS public.sched_requirements (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id        uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  session          text NOT NULL CHECK (session ~ '^\d{4}-\d{2}$'),
  class            text NOT NULL CHECK (length(class) BETWEEN 1 AND 40),
  class_key        text GENERATED ALWAYS AS (app.norm_class(class)) STORED,
  subject          text NOT NULL CHECK (length(subject) BETWEEN 1 AND 80),
  group_label      text NOT NULL DEFAULT '' CHECK (length(group_label) <= 40),
  teacher_id       uuid REFERENCES public.users(id) ON DELETE SET NULL,
  staff_member_id  uuid REFERENCES public.staff_members(id) ON DELETE SET NULL,
  periods_per_week smallint NOT NULL CHECK (periods_per_week BETWEEN 1 AND 20),
  doubles          smallint NOT NULL DEFAULT 0 CHECK (doubles >= 0 AND doubles * 2 <= periods_per_week),
  room_kind        text CHECK (room_kind IS NULL OR room_kind IN ('classroom', 'lab', 'hall', 'library', 'ground', 'other')),
  room_id          uuid REFERENCES public.rooms(id) ON DELETE SET NULL,
  max_per_day      smallint NOT NULL DEFAULT 1 CHECK (max_per_day BETWEEN 1 AND 4),
  combined_key     text CHECK (combined_key IS NULL OR length(combined_key) BETWEEN 1 AND 40),
  notes            text CHECK (notes IS NULL OR length(notes) <= 500),
  updated_by       uuid REFERENCES public.users(id) ON DELETE SET NULL,
  updated_at       timestamptz NOT NULL DEFAULT now(),
  created_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sched_requirements_one_teacher CHECK (teacher_id IS NULL OR staff_member_id IS NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_sched_requirements ON public.sched_requirements (school_id, session, class_key, lower(subject), group_label);
CREATE INDEX IF NOT EXISTS ix_sched_requirements_school ON public.sched_requirements (school_id, session);

CREATE TABLE IF NOT EXISTS public.teacher_load_rules (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id        uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  user_id          uuid REFERENCES public.users(id) ON DELETE CASCADE,
  staff_member_id  uuid REFERENCES public.staff_members(id) ON DELETE CASCADE,
  target_per_week  smallint CHECK (target_per_week IS NULL OR target_per_week BETWEEN 0 AND 60),
  max_per_day      smallint CHECK (max_per_day IS NULL OR max_per_day BETWEEN 1 AND 12),
  max_per_week     smallint CHECK (max_per_week IS NULL OR max_per_week BETWEEN 1 AND 60),
  max_consecutive  smallint CHECK (max_consecutive IS NULL OR max_consecutive BETWEEN 1 AND 12),
  -- [{ "weekday": 1-7, "periods": [1, 2] }]; no periods = the whole day
  unavailable      jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(unavailable) = 'array' AND jsonb_array_length(unavailable) <= 14),
  updated_by       uuid REFERENCES public.users(id) ON DELETE SET NULL,
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT teacher_load_rules_one_person CHECK ((user_id IS NULL) <> (staff_member_id IS NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_teacher_load_rules_user ON public.teacher_load_rules (user_id) WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_teacher_load_rules_staff ON public.teacher_load_rules (staff_member_id) WHERE staff_member_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_teacher_load_rules_school ON public.teacher_load_rules (school_id);

CREATE TABLE IF NOT EXISTS public.sched_solver_settings (
  school_id               uuid PRIMARY KEY REFERENCES public.schools(id) ON DELETE CASCADE,
  default_target_per_week smallint NOT NULL DEFAULT 30 CHECK (default_target_per_week BETWEEN 1 AND 60),
  default_max_per_day     smallint NOT NULL DEFAULT 7 CHECK (default_max_per_day BETWEEN 1 AND 12),
  default_max_consecutive smallint NOT NULL DEFAULT 4 CHECK (default_max_consecutive BETWEEN 1 AND 12),
  class_teacher_first     boolean NOT NULL DEFAULT true,
  subject_spread          boolean NOT NULL DEFAULT true,
  updated_by              uuid REFERENCES public.users(id) ON DELETE SET NULL,
  updated_at              timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.timetable_slots ADD COLUMN IF NOT EXISTS locked boolean NOT NULL DEFAULT false;
ALTER TABLE public.timetable_versions ADD COLUMN IF NOT EXISTS solver_report jsonb;

ALTER TABLE public.sched_requirements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teacher_load_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sched_solver_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sched_requirements, public.teacher_load_rules, public.sched_solver_settings FROM anon, authenticated;
GRANT SELECT ON public.sched_requirements, public.teacher_load_rules, public.sched_solver_settings TO authenticated;
GRANT ALL ON public.sched_requirements, public.teacher_load_rules, public.sched_solver_settings TO service_role;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['sched_requirements', 'teacher_load_rules', 'sched_solver_settings'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %1$s_read ON public.%1$I', t);
    EXECUTE format('CREATE POLICY %1$s_read ON public.%1$I FOR SELECT TO authenticated
      USING ((school_id = (SELECT app.current_school_id())
              AND ((SELECT app.has_perm(''schedule.academic'')) OR (SELECT app.has_perm(''schedule.workforce'')) OR (SELECT app.has_perm(''workforce.read''))))
             OR (SELECT app.is_superadmin()))', t);
  END LOOP;
END $$;
