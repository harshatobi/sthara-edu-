-- Copilot Studio, PR B: after marking (plan ~/.claude/plans/copilot-studio-pr-b.md; decisions of 2026-11-10, rounds 4 and 6).
--   assignments.type          gains 'classwork': the teacher desk and the Studio (exit tickets) already write it, and the
--                             old check rejected every such insert
--   studio_followups          retention checks, auto-scheduled 2-3 weeks after the work (the teacher can skip or move them)
--   studio_analyses           a marked assignment's question analysis, kept so the AI wording of misconceptions is paid once
--   studio_tallies            hands raised per option in present mode: class-level evidence only, never a student's TML
--   studio_sheets             the code printed on each student's bubble sheet for a paper quiz
--   bank_item_stats()         how a bank question has gone: Sthara's items pooled across schools (counts only, no school
--                             or student is identifiable), a school's own items from that school only
-- Everything is read and written through server routes (RLS on, no policies, service_role only).

ALTER TABLE public.assignments DROP CONSTRAINT assignments_type_check;
ALTER TABLE public.assignments ADD CONSTRAINT assignments_type_check CHECK (type = ANY (ARRAY['homework', 'quiz', 'task', 'classwork']));

-- ── Follow-ups: retention checks ───────────────────────────────────────────────
CREATE TABLE public.studio_followups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  teacher_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'retention' CHECK (kind = 'retention'),
  source_assignment_id uuid REFERENCES public.assignments(id) ON DELETE CASCADE,
  material_id uuid REFERENCES public.studio_materials(id) ON DELETE SET NULL,
  class text NOT NULL CHECK (length(trim(class)) BETWEEN 1 AND 40),
  subject text NOT NULL CHECK (length(trim(subject)) BETWEEN 1 AND 80),
  chapter_key text CHECK (chapter_key IS NULL OR length(chapter_key) <= 200),
  chapter_name text CHECK (chapter_name IS NULL OR length(chapter_name) <= 200),
  topics text[] NOT NULL DEFAULT '{}' CHECK (cardinality(topics) <= 30),
  -- empty = the whole class
  student_ids uuid[] NOT NULL DEFAULT '{}',
  due_on date NOT NULL,
  status text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'skipped', 'assigned', 'failed')),
  note text CHECK (note IS NULL OR length(note) <= 300),
  assignment_id uuid REFERENCES public.assignments(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
-- One retention check per piece of work.
CREATE UNIQUE INDEX studio_followups_one_retention ON public.studio_followups (source_assignment_id) WHERE kind = 'retention';
CREATE INDEX studio_followups_due ON public.studio_followups (due_on) WHERE status = 'scheduled';
CREATE INDEX studio_followups_teacher ON public.studio_followups (teacher_id, class, due_on);
CREATE UNIQUE INDEX studio_followups_assignment ON public.studio_followups (assignment_id) WHERE assignment_id IS NOT NULL;
CREATE TRIGGER trg_touch_studio_followups BEFORE UPDATE ON public.studio_followups FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
CREATE TRIGGER trg_audit_studio_followups AFTER INSERT OR DELETE OR UPDATE ON public.studio_followups FOR EACH ROW EXECUTE FUNCTION app.audit();

-- ── Question analysis of a marked assignment ─────────────────────────────────
CREATE TABLE public.studio_analyses (
  assignment_id uuid PRIMARY KEY REFERENCES public.assignments(id) ON DELETE CASCADE,
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  -- what the analysis was built from, so new marks rebuild it
  basis text NOT NULL CHECK (length(basis) <= 200),
  content jsonb NOT NULL CHECK (jsonb_typeof(content) = 'object'),
  built_at timestamptz NOT NULL DEFAULT now()
);

-- ── Present-mode hands ─────────────────────────────────────────────────────────
CREATE TABLE public.studio_tallies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  material_id uuid NOT NULL REFERENCES public.studio_materials(id) ON DELETE CASCADE,
  item_key text NOT NULL CHECK (length(item_key) BETWEEN 1 AND 60),
  bank_item_id uuid REFERENCES public.bank_items(id) ON DELETE SET NULL,
  class text NOT NULL CHECK (length(trim(class)) BETWEEN 1 AND 40),
  option_counts integer[] NOT NULL CHECK (cardinality(option_counts) BETWEEN 2 AND 6 AND 0 <= ALL (option_counts) AND 500 >= ALL (option_counts)),
  answer smallint NOT NULL CHECK (answer BETWEEN 0 AND 5),
  recorded_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX studio_tallies_material ON public.studio_tallies (material_id, item_key);
CREATE INDEX studio_tallies_item ON public.studio_tallies (bank_item_id) WHERE bank_item_id IS NOT NULL;

-- ── Bubble sheets ──────────────────────────────────────────────────────────────
CREATE TABLE public.studio_sheets (
  assignment_id uuid NOT NULL REFERENCES public.assignments(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  code text NOT NULL CHECK (code ~ '^[A-Z0-9]{4}-[0-9]{1,3}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (assignment_id, student_id),
  UNIQUE (assignment_id, code)
);
CREATE INDEX studio_sheets_code ON public.studio_sheets (school_id, code);

-- ── Server-only access ────────────────────────────────────────────────────────
ALTER TABLE public.studio_followups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.studio_analyses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.studio_tallies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.studio_sheets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.studio_followups, public.studio_analyses, public.studio_tallies, public.studio_sheets FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.studio_followups TO service_role;
GRANT ALL ON public.studio_analyses TO service_role;
GRANT ALL ON public.studio_tallies TO service_role;
GRANT ALL ON public.studio_sheets TO service_role;

-- ── How bank questions have gone ─────────────────────────────────────────────
-- attempts / full_marks / mean_share: confirmed marks where the item was used.
-- option_counts: which option students picked (choice questions answered on Sthara or on a bubble sheet).
-- discrimination: correlation between the item's share and the student's share of the whole paper (near 0 or below =
--   the question doesn't separate students who know the work from those who don't).
-- hands_total / hands_correct: present-mode tallies (class-level).
-- Sthara items: every school's uses (counts only). School items: that school's only, and only for that school.
CREATE OR REPLACE FUNCTION public.bank_item_stats(p_items uuid[], p_school uuid)
RETURNS TABLE (item_id uuid, pooled boolean, attempts integer, full_marks integer, mean_share numeric, option_counts jsonb, discrimination numeric, hands_total integer, hands_correct integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  WITH items AS (
    SELECT bi.id, bi.scope, bi.school_id FROM bank_items bi
    WHERE bi.id = ANY (p_items) AND (bi.scope = 'sthara' OR bi.school_id = p_school)
  ),
  marks AS (
    SELECT u.item_id, si.score::numeric AS score, si.max_score::numeric AS max_score,
           CASE WHEN s.max_score > 0 THEN s.score::numeric / s.max_score::numeric END AS paper_share,
           s.answers -> u.question_index::text AS pick
    FROM items i
    JOIN bank_item_uses u ON u.item_id = i.id AND (i.scope = 'sthara' OR u.school_id = i.school_id)
    JOIN submission_items si ON si.assignment_id = u.assignment_id AND si.question_index = u.question_index AND si.teacher_confirmed
      AND (u.student_id IS NOT NULL AND si.student_id = u.student_id
        OR u.student_id IS NULL AND NOT EXISTS (SELECT 1 FROM assignment_variants v WHERE v.assignment_id = u.assignment_id AND v.student_id = si.student_id))
    LEFT JOIN submissions s ON s.id = si.submission_id
    WHERE u.assignment_id IS NOT NULL AND si.max_score > 0
  ),
  picks AS (
    SELECT item_id, jsonb_object_agg(pick, n) AS counts FROM (
      SELECT item_id, pick #>> '{}' AS pick, count(*)::int AS n FROM marks
      WHERE jsonb_typeof(pick) IN ('number', 'string') AND (pick #>> '{}') ~ '^[0-5]$'
      GROUP BY 1, 2
    ) x GROUP BY item_id
  ),
  agg AS (
    SELECT item_id, count(*)::int AS attempts, count(*) FILTER (WHERE score >= max_score)::int AS full_marks,
           round(avg(score / max_score), 3) AS mean_share,
           CASE WHEN count(paper_share) >= 10 THEN round(corr(score / max_score, paper_share)::numeric, 2) END AS discrimination
    FROM marks GROUP BY item_id
  ),
  hands AS (
    SELECT t.bank_item_id AS item_id, sum((SELECT sum(c) FROM unnest(t.option_counts) c))::int AS total,
           sum(t.option_counts[t.answer + 1])::int AS correct
    FROM studio_tallies t JOIN items i ON i.id = t.bank_item_id AND (i.scope = 'sthara' OR t.school_id = i.school_id)
    GROUP BY 1
  )
  SELECT i.id, i.scope = 'sthara', coalesce(a.attempts, 0), coalesce(a.full_marks, 0), a.mean_share, coalesce(p.counts, '{}'::jsonb), a.discrimination,
         coalesce(h.total, 0), coalesce(h.correct, 0)
  FROM items i LEFT JOIN agg a ON a.item_id = i.id LEFT JOIN picks p ON p.item_id = i.id LEFT JOIN hands h ON h.item_id = i.id;
$$;
REVOKE ALL ON FUNCTION public.bank_item_stats(uuid[], uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bank_item_stats(uuid[], uuid) TO service_role;
