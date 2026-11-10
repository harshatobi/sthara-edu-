-- Copilot Studio, PR A (decisions of 2026-11-10; plan ~/.claude/plans/copilot-studio-pr-a.md).
--   bank_items                the question bank: Sthara's starter bank (school_id null) and each school's own items
--   bank_item_uses            where a bank item was used (material, assignment, question position), so marks flow back to it
--   studio_materials          what a teacher made in the Studio: drafts, the library, department sharing and moderation
--   studio_material_versions  every saved version of a material (undo and history)
--   assignment_variants       a student's own version of an assignment's questions (per-student versions, A/B/C sets)
--   student_access_needs      plain access needs (large print, read aloud, ...) set by the class teacher, counsellor or office;
--                             teachers see these, never the health record they may be pre-filled from
-- All six are read and written through server routes that check role, school and teaching scope, so signed-in users
-- and signed-out visitors get no direct access (RLS on, no policies, grants to service_role only).

-- ── Question bank ─────────────────────────────────────────────────────────────
CREATE TABLE public.bank_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope text NOT NULL CHECK (scope IN ('sthara', 'school')),
  school_id uuid REFERENCES public.schools(id) ON DELETE CASCADE,
  class text NOT NULL CHECK (length(trim(class)) BETWEEN 1 AND 40),
  subject text NOT NULL CHECK (length(trim(subject)) BETWEEN 1 AND 80),
  chapter_key text NOT NULL CHECK (length(chapter_key) BETWEEN 1 AND 200),
  topic text CHECK (topic IS NULL OR length(topic) <= 300),
  outcome_code text CHECK (outcome_code IS NULL OR length(outcome_code) <= 40),
  competency text NOT NULL CHECK (competency IN ('remember_understand', 'apply', 'analyse_evaluate')),
  qtype text NOT NULL CHECK (qtype IN ('mcq', 'assertion_reason', 'short', 'long', 'case', 'numerical', 'diagram')),
  marks smallint NOT NULL CHECK (marks BETWEEN 1 AND 10),
  language text NOT NULL DEFAULT 'en' CHECK (length(language) BETWEEN 2 AND 8),
  body jsonb NOT NULL CHECK (jsonb_typeof(body) = 'object'),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'unreviewed', 'approved', 'retired')),
  source text NOT NULL CHECK (source IN ('cbse_sqp', 'cbse_board', 'ncert', 'sthara_ai', 'teacher', 'ai')),
  source_ref text CHECK (source_ref IS NULL OR length(source_ref) <= 300),
  checks jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(checks) = 'object'),
  fingerprint text NOT NULL CHECK (length(fingerprint) BETWEEN 8 AND 128),
  translated_from uuid REFERENCES public.bank_items(id) ON DELETE SET NULL,
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  approved_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((scope = 'sthara') = (school_id IS NULL)),
  CHECK ((status = 'approved') = (approved_at IS NOT NULL))
);
-- One copy of a question per bank (Sthara's, or a school's), per language.
CREATE UNIQUE INDEX bank_items_one_copy ON public.bank_items (coalesce(school_id, '00000000-0000-0000-0000-000000000000'::uuid), language, fingerprint);
CREATE INDEX bank_items_pick ON public.bank_items (lower(subject), class, chapter_key, competency, marks) WHERE status <> 'retired';
CREATE INDEX bank_items_school ON public.bank_items (school_id, created_at DESC) WHERE school_id IS NOT NULL;
CREATE INDEX bank_items_review ON public.bank_items (status, created_at) WHERE scope = 'sthara' AND status = 'unreviewed';
CREATE TRIGGER trg_touch_bank_items BEFORE UPDATE ON public.bank_items FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
CREATE TRIGGER trg_audit_bank_items AFTER INSERT OR DELETE OR UPDATE ON public.bank_items FOR EACH ROW EXECUTE FUNCTION app.audit();

-- ── Studio materials (the library) ────────────────────────────────────────────
CREATE TABLE public.studio_materials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  teacher_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  class text NOT NULL CHECK (length(trim(class)) BETWEEN 1 AND 40),
  subject text NOT NULL CHECK (length(trim(subject)) BETWEEN 1 AND 80),
  chapter_key text CHECK (chapter_key IS NULL OR length(chapter_key) <= 200),
  chapter_name text CHECK (chapter_name IS NULL OR length(chapter_name) <= 200),
  kind text NOT NULL CHECK (kind IN ('worksheet', 'quiz', 'catchup', 'exit_ticket', 'test', 'board_paper', 'lesson', 'ideas', 'visual', 'lab', 'parent_note', 'rubric')),
  title text NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 200),
  content jsonb NOT NULL CHECK (jsonb_typeof(content) = 'object'),
  language text NOT NULL DEFAULT 'en' CHECK (length(language) BETWEEN 2 AND 8),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'ready', 'assigned', 'archived')),
  share text NOT NULL DEFAULT 'private' CHECK (share IN ('private', 'department')),
  common_test boolean NOT NULL DEFAULT false,
  moderation text NOT NULL DEFAULT 'none' CHECK (moderation IN ('none', 'pending', 'approved', 'changes_requested')),
  reviewed_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  review_note text CHECK (review_note IS NULL OR length(review_note) <= 1000),
  assignment_ids uuid[] NOT NULL DEFAULT '{}',
  lesson_plan_id uuid REFERENCES public.lesson_plans(id) ON DELETE SET NULL,
  version integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX studio_materials_teacher ON public.studio_materials (teacher_id, updated_at DESC);
CREATE INDEX studio_materials_dept ON public.studio_materials (school_id, lower(subject), updated_at DESC) WHERE share = 'department';
CREATE INDEX studio_materials_review ON public.studio_materials (school_id, moderation) WHERE moderation = 'pending';
CREATE TRIGGER trg_touch_studio_materials BEFORE UPDATE ON public.studio_materials FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
CREATE TRIGGER trg_audit_studio_materials AFTER INSERT OR DELETE OR UPDATE ON public.studio_materials FOR EACH ROW EXECUTE FUNCTION app.audit();

CREATE TABLE public.studio_material_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  material_id uuid NOT NULL REFERENCES public.studio_materials(id) ON DELETE CASCADE,
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  version integer NOT NULL CHECK (version >= 1),
  content jsonb NOT NULL CHECK (jsonb_typeof(content) = 'object'),
  change_note text CHECK (change_note IS NULL OR length(change_note) <= 300),
  changed_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (material_id, version)
);

-- ── Where bank items were used ────────────────────────────────────────────────
CREATE TABLE public.bank_item_uses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL REFERENCES public.bank_items(id) ON DELETE CASCADE,
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  material_id uuid REFERENCES public.studio_materials(id) ON DELETE SET NULL,
  assignment_id uuid REFERENCES public.assignments(id) ON DELETE CASCADE,
  -- null for a whole-class set; a student's id when the item sits in their own version
  student_id uuid REFERENCES public.users(id) ON DELETE CASCADE,
  question_index smallint NOT NULL CHECK (question_index BETWEEN 0 AND 99),
  used_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  used_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX bank_item_uses_item ON public.bank_item_uses (item_id, school_id);
CREATE INDEX bank_item_uses_assignment ON public.bank_item_uses (assignment_id, student_id) WHERE assignment_id IS NOT NULL;

-- ── A student's own version of an assignment ──────────────────────────────────
CREATE TABLE public.assignment_variants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id uuid NOT NULL REFERENCES public.assignments(id) ON DELETE CASCADE,
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  label text CHECK (label IS NULL OR length(label) <= 20),
  questions jsonb NOT NULL CHECK (jsonb_typeof(questions) = 'array'),
  item_ids uuid[] NOT NULL DEFAULT '{}',
  reason text CHECK (reason IS NULL OR length(reason) <= 300),
  access text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (assignment_id, student_id)
);
CREATE INDEX assignment_variants_student ON public.assignment_variants (student_id);

-- ── Access needs ──────────────────────────────────────────────────────────────
CREATE TABLE public.student_access_needs (
  student_id uuid PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  needs text[] NOT NULL DEFAULT '{}' CHECK (needs <@ ARRAY['large_print', 'read_aloud', 'extra_time', 'no_figures', 'simplified_language']::text[]),
  note text CHECK (note IS NULL OR length(note) <= 300),
  set_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX student_access_needs_school ON public.student_access_needs (school_id);
CREATE TRIGGER trg_touch_student_access_needs BEFORE UPDATE ON public.student_access_needs FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
CREATE TRIGGER trg_audit_student_access_needs AFTER INSERT OR DELETE OR UPDATE ON public.student_access_needs FOR EACH ROW EXECUTE FUNCTION app.audit();

-- ── Server-only access ────────────────────────────────────────────────────────
ALTER TABLE public.bank_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.studio_materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.studio_material_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_item_uses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assignment_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_access_needs ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.bank_items, public.studio_materials, public.studio_material_versions, public.bank_item_uses,
  public.assignment_variants, public.student_access_needs FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.bank_items TO service_role;
GRANT ALL ON public.studio_materials TO service_role;
GRANT ALL ON public.studio_material_versions TO service_role;
GRANT ALL ON public.bank_item_uses TO service_role;
GRANT ALL ON public.assignment_variants TO service_role;
GRANT ALL ON public.student_access_needs TO service_role;
