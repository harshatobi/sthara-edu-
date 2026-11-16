-- Knowledge-base grounding (decisions of 2026-11-14, plan ~/.claude/plans/kb-grounding.md): every generator looks in
-- Sthara's knowledge base first, so the AI only writes what the base can't supply.
--   kb_vectors        a meaning vector (384-d, free multilingual model run by our own Python, no AI tokens) for each
--                     bank question, saved material, Copilot output, lesson plan and board paper, with what filters it
--                     (school, owner, class level, subject, chapter). Sthara items have no school and are shared.
--   kb_match()        nearest items to a query vector inside one school's view (Sthara items + its own), server only
--   bank_items        gains what the nightly ML jobs work out: real difficulty and discrimination from students'
--                     answers (IRT), duplicate-of, auto tags; sources gain school uploads and NCERT exemplar
-- Everything is read and written through server routes and the nightly job (RLS on, no policies, service_role only).

CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;

CREATE TABLE public.kb_vectors (
  item_type text NOT NULL CHECK (item_type IN ('bank', 'material', 'copilot', 'lesson', 'paper')),
  item_id uuid NOT NULL,
  school_id uuid REFERENCES public.schools(id) ON DELETE CASCADE,
  owner_id uuid REFERENCES public.users(id) ON DELETE CASCADE,
  grade text NOT NULL CHECK (grade ~ '^[0-9]{1,2}$|^any$'),
  subject text NOT NULL CHECK (length(subject) BETWEEN 1 AND 80),
  chapter_key text CHECK (chapter_key IS NULL OR length(chapter_key) <= 200),
  kind text CHECK (kind IS NULL OR length(kind) <= 40),
  text_hash text NOT NULL CHECK (length(text_hash) BETWEEN 16 AND 128),
  embedding extensions.vector(384) NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (item_type, item_id)
);
CREATE INDEX kb_vectors_embedding ON public.kb_vectors USING hnsw (embedding extensions.vector_cosine_ops);
CREATE INDEX kb_vectors_scope ON public.kb_vectors (school_id, item_type, grade, subject);

ALTER TABLE public.bank_items
  ADD COLUMN IF NOT EXISTS irt_difficulty numeric,
  ADD COLUMN IF NOT EXISTS irt_discrimination numeric,
  ADD COLUMN IF NOT EXISTS irt_n integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS dup_of uuid REFERENCES public.bank_items(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS auto_tags jsonb CHECK (auto_tags IS NULL OR jsonb_typeof(auto_tags) = 'object');
ALTER TABLE public.bank_items DROP CONSTRAINT IF EXISTS bank_items_source_check;
ALTER TABLE public.bank_items ADD CONSTRAINT bank_items_source_check CHECK (source IN (
  'cbse_sqp', 'cbse_board', 'cbse_qbank', 'cbse_practice', 'cbse_competency', 'cbse_skill', 'ncert', 'ncert_exemplar',
  'sthara_ai', 'teacher', 'ai', 'school_upload'));
CREATE INDEX IF NOT EXISTS bank_items_dup ON public.bank_items (dup_of) WHERE dup_of IS NOT NULL;

/**
 * The nearest knowledge-base items to a query vector, as one school sees them: Sthara's shared items and the
 * school's own; Copilot outputs only the asking teacher's. Similarity is cosine (1 = same meaning).
 */
CREATE OR REPLACE FUNCTION public.kb_match(
  p_query extensions.vector(384), p_school uuid, p_types text[], p_grade text, p_subject text,
  p_owner uuid DEFAULT NULL, p_limit integer DEFAULT 20, p_min numeric DEFAULT 0.35
) RETURNS TABLE (item_type text, item_id uuid, owner_id uuid, chapter_key text, kind text, similarity numeric)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public, extensions AS $$
  SELECT v.item_type, v.item_id, v.owner_id, v.chapter_key, v.kind, (1 - (v.embedding <=> p_query))::numeric AS similarity
  FROM public.kb_vectors v
  WHERE v.item_type = ANY (p_types)
    AND (v.school_id IS NULL OR v.school_id = p_school)
    AND (v.grade = p_grade OR v.grade = 'any')
    AND lower(v.subject) = lower(p_subject)
    AND (v.item_type <> 'copilot' OR v.owner_id = p_owner)
    AND 1 - (v.embedding <=> p_query) >= p_min
  ORDER BY v.embedding <=> p_query
  LIMIT least(greatest(p_limit, 1), 100)
$$;

ALTER TABLE public.kb_vectors ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.kb_vectors FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.kb_vectors TO service_role;
REVOKE ALL ON FUNCTION public.kb_match(extensions.vector, uuid, text[], text, text, uuid, integer, numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.kb_match(extensions.vector, uuid, text[], text, text, uuid, integer, numeric) TO service_role;
