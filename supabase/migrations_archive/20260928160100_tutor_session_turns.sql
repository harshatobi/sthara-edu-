-- Tutor session tokens work once — 2026-09-28
--
-- The tutor's scoring state rides in a signed token, and a signature alone
-- let a student resend an older token (dropping a hint) or replay the final
-- one (a fresh full-marks tutor_sessions row each time). Each session now has
-- a row here holding the turn it is on; the API claims a turn with
-- UPDATE ... WHERE seq = <token's seq>, so each token is accepted exactly once.
-- Service role only: no policies, nothing for browsers to read or write.

CREATE TABLE IF NOT EXISTS public.tutor_session_turns (
  sid uuid PRIMARY KEY,
  student_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  seq integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS tutor_session_turns_student_idx ON public.tutor_session_turns (student_id, created_at);
ALTER TABLE public.tutor_session_turns ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.tutor_session_turns FROM anon, authenticated;
