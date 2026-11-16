-- Ask the School OS, revamped (decisions of 2026-11-13).
--   ask_conversations  each person's saved conversations: every device, searchable, pinnable, kept until the person
--                      deletes them (Moses chose no automatic expiry)
--   ask_turns          the questions and answers; an answer keeps the permissions its sources needed ("needs"), so a
--                      shared copy is re-checked against the colleague's own role
--   ask_shares         an answer one staff member sent to another inside the school (parents cannot share)
-- Everything is read and written through server routes (RLS on, no policies, service_role only).

CREATE TABLE public.ask_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 120),
  pinned boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ask_conversations_user ON public.ask_conversations (user_id, pinned DESC, last_at DESC);

CREATE TABLE public.ask_turns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.ask_conversations(id) ON DELETE CASCADE,
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('me', 'os')),
  text text NOT NULL CHECK (length(text) <= 6000),
  reply jsonb CHECK (reply IS NULL OR jsonb_typeof(reply) = 'object'),
  needs text[] NOT NULL DEFAULT '{}' CHECK (cardinality(needs) <= 40),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ask_turns_conversation ON public.ask_turns (conversation_id, created_at);
-- Search over a person's own questions and answers.
CREATE INDEX ask_turns_search ON public.ask_turns USING gin (to_tsvector('simple', text));

CREATE TABLE public.ask_shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  turn_id uuid NOT NULL REFERENCES public.ask_turns(id) ON DELETE CASCADE,
  from_user uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  to_user uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  note text CHECK (note IS NULL OR length(note) <= 500),
  created_at timestamptz NOT NULL DEFAULT now(),
  seen_at timestamptz,
  CHECK (from_user <> to_user)
);
CREATE INDEX ask_shares_to ON public.ask_shares (to_user, created_at DESC);
CREATE UNIQUE INDEX ask_shares_once ON public.ask_shares (turn_id, to_user);

ALTER TABLE public.ask_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ask_turns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ask_shares ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ask_conversations, public.ask_turns, public.ask_shares FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.ask_conversations TO service_role;
GRANT ALL ON public.ask_turns TO service_role;
GRANT ALL ON public.ask_shares TO service_role;
