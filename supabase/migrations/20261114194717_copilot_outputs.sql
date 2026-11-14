-- Teacher Copilot: everything it makes is kept, and the same request is answered from what was kept
-- (Moses, 2026-11-14: "make sure all generated papers, items, materials from Ask get saved ... so AI cost is not getting
-- hammered on redoing the same worksheet or board paper again and again").
--   copilot_outputs  one row per thing the Copilot made: a reply with a worksheet, quiz, lesson, document, diagram,
--                    Live Lab demo or bundle (kind 'reply'); a board paper (kind 'paper', shared by the school's
--                    teachers of that class and subject); a picture (kind 'image', the stored file's path).
--                    request_key is a hash of the request (class, subject, chapter, settings and the conversation),
--                    so an identical request is served from here at no AI cost.
-- Read and written through server routes only (RLS on, no policies, service_role only).

CREATE TABLE public.copilot_outputs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  teacher_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('reply', 'paper', 'image')),
  class text NOT NULL CHECK (length(trim(class)) BETWEEN 1 AND 40),
  subject text NOT NULL CHECK (length(trim(subject)) BETWEEN 1 AND 80),
  chapter text CHECK (chapter IS NULL OR length(chapter) <= 200),
  request_key text NOT NULL CHECK (length(request_key) BETWEEN 16 AND 128),
  title text NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 200),
  artifact_kind text CHECK (artifact_kind IS NULL OR length(artifact_kind) <= 30),
  reply jsonb CHECK (reply IS NULL OR jsonb_typeof(reply) = 'object'),
  image_path text CHECK (image_path IS NULL OR length(image_path) <= 300),
  reuse_count integer NOT NULL DEFAULT 0 CHECK (reuse_count >= 0),
  last_used_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((kind = 'image') = (image_path IS NOT NULL))
);
CREATE INDEX copilot_outputs_request ON public.copilot_outputs (school_id, kind, request_key, created_at DESC);
CREATE INDEX copilot_outputs_teacher ON public.copilot_outputs (teacher_id, class, subject, created_at DESC);
CREATE INDEX copilot_outputs_class ON public.copilot_outputs (school_id, class, subject, kind, created_at DESC);

ALTER TABLE public.copilot_outputs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.copilot_outputs FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.copilot_outputs TO service_role;
