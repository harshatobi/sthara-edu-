-- TML history (Moses, 2026-11-07): one row per student, subject, topic and week (the Monday of an India week), so the
-- Mastery Tracker can show trends, week-on-week movement and the class's biggest movers. tml_scores stays the
-- append-only record of every recompute; this is its weekly roll-up (latest computation in the week wins), small
-- enough to read a whole class at once. Past weeks were rebuilt from graded evidence dates (scripts/tml-backfill.ts):
-- evidence dated after a week is excluded and ages are measured from that week's end; engagement uses the values
-- known at backfill time (engagement_scores keeps no history).
CREATE TABLE public.tml_history (
  student_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  subject text NOT NULL,
  topic_key text NOT NULL,                -- lower(trim(collapsed spaces)) of topic_name, as the engine groups topics
  topic_name text NOT NULL,
  week date NOT NULL,                     -- Monday of the week, Asia/Kolkata
  score numeric(5,1) NOT NULL,            -- final TML (academic 70% + engagement 30%)
  academic numeric(5,1),
  homework numeric(5,1),
  quiz numeric(5,1),
  tutor numeric(5,1),
  item_count integer NOT NULL DEFAULT 0,
  confidence_band text NOT NULL CHECK (confidence_band IN ('insufficient', 'provisional', 'firm')),
  source text NOT NULL DEFAULT 'live' CHECK (source IN ('live', 'backfill')),
  computed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (student_id, subject, topic_key, week),
  CHECK (extract(isodow FROM week) = 1)
);

CREATE INDEX tml_history_school_week ON public.tml_history (school_id, week);
CREATE INDEX tml_history_student_week ON public.tml_history (student_id, week);

ALTER TABLE public.tml_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY tml_history_read ON public.tml_history FOR SELECT TO authenticated USING (
  ((student_id = ( SELECT auth.uid() AS uid)) OR (( SELECT app.sees_learning() AS sees_learning) AND (school_id = ( SELECT app.current_school_id() AS current_school_id))) OR (student_id IN ( SELECT app.my_child_ids() AS my_child_ids)) OR ( SELECT app.is_superadmin() AS is_superadmin))
);

-- Written only by the server (service role) through the TML engine and the backfill.
REVOKE ALL ON TABLE public.tml_history FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.tml_history TO authenticated;
GRANT ALL ON TABLE public.tml_history TO service_role;
