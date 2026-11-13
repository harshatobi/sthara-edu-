-- Timetable solver: richer rules (Moses, 2026-11-12). Columns only, on three existing tables; no new table, so no
-- new grants (the tables' own grants and RLS policies cover added columns).
--
--   sched_requirements    where a subject may sit in the day
--   teacher_load_rules    days in school a week, and the first / last period a teacher would rather not take
--   sched_solver_settings how much each soft rule matters, and whether a section's day may have free periods inside it
--
-- Every column is nullable or defaulted, so rows written before this migration read as "no rule".

ALTER TABLE public.sched_requirements
  ADD COLUMN IF NOT EXISTS time_pref text,
  ADD COLUMN IF NOT EXISTS never_last boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS not_after text;

ALTER TABLE public.sched_requirements
  DROP CONSTRAINT IF EXISTS sched_requirements_time_pref_check,
  ADD CONSTRAINT sched_requirements_time_pref_check CHECK (time_pref IS NULL OR time_pref IN ('morning', 'afternoon')),
  DROP CONSTRAINT IF EXISTS sched_requirements_not_after_check,
  ADD CONSTRAINT sched_requirements_not_after_check CHECK (not_after IS NULL OR (length(not_after) >= 1 AND length(not_after) <= 80));

ALTER TABLE public.teacher_load_rules
  ADD COLUMN IF NOT EXISTS max_days smallint,
  ADD COLUMN IF NOT EXISTS avoid_first boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS avoid_last boolean NOT NULL DEFAULT false;

ALTER TABLE public.teacher_load_rules
  DROP CONSTRAINT IF EXISTS teacher_load_rules_max_days_check,
  ADD CONSTRAINT teacher_load_rules_max_days_check CHECK (max_days IS NULL OR (max_days >= 1 AND max_days <= 7));

-- The availability picker marks single periods across the week, so a teacher can have more entries than 14.
ALTER TABLE public.teacher_load_rules
  DROP CONSTRAINT IF EXISTS teacher_load_rules_unavailable_check,
  ADD CONSTRAINT teacher_load_rules_unavailable_check CHECK (jsonb_typeof(unavailable) = 'array' AND jsonb_array_length(unavailable) <= 28);

ALTER TABLE public.sched_solver_settings
  ADD COLUMN IF NOT EXISTS no_student_gaps boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS weights jsonb;

ALTER TABLE public.sched_solver_settings
  DROP CONSTRAINT IF EXISTS sched_solver_settings_weights_check,
  ADD CONSTRAINT sched_solver_settings_weights_check CHECK (weights IS NULL OR jsonb_typeof(weights) = 'object');
