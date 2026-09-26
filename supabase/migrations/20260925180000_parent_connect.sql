-- Parent portal: school <-> parent conversations and the WhatsApp channel.
--
--   school_threads / school_messages  a parent writes to their child's teacher (or the school
--                                     office) about one child; staff reply. Written only by the
--                                     server (/api/parent/messages, /api/staff/messages) so the
--                                     sender, child and recipient are always checked.
--   whatsapp_links                    a parent's verified, opted-in WhatsApp number (OTP-verified).
--                                     Never readable by clients: the OTP hash lives here.
--   whatsapp_log                      every message in or out of the WhatsApp channel, including
--                                     'simulated' ones while the Cloud API key is a placeholder.

CREATE TABLE IF NOT EXISTS public.school_threads (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id       uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  student_id      uuid NOT NULL REFERENCES public.users(id)   ON DELETE CASCADE,
  parent_id       uuid NOT NULL REFERENCES public.users(id)   ON DELETE CASCADE,
  -- The teacher it is addressed to; NULL = the school office (admins).
  staff_id        uuid REFERENCES public.users(id) ON DELETE SET NULL,
  audience        text NOT NULL DEFAULT 'teacher' CHECK (audience IN ('teacher', 'office')),
  subject         text NOT NULL CHECK (length(subject) BETWEEN 1 AND 160),
  topic           text NOT NULL DEFAULT 'general'
                  CHECK (topic IN ('general', 'academics', 'homework', 'wellbeing', 'fees', 'meeting', 'leave')),
  status          text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  last_message_at timestamptz NOT NULL DEFAULT now(),
  parent_read_at  timestamptz,
  staff_read_at   timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CHECK ((audience = 'office') = (staff_id IS NULL))
);
CREATE INDEX IF NOT EXISTS idx_school_threads_parent ON public.school_threads (parent_id, last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_school_threads_staff  ON public.school_threads (staff_id, last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_school_threads_school ON public.school_threads (school_id, audience, last_message_at DESC);

CREATE TABLE IF NOT EXISTS public.school_messages (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id   uuid NOT NULL REFERENCES public.school_threads(id) ON DELETE CASCADE,
  school_id   uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  sender_id   uuid REFERENCES public.users(id) ON DELETE SET NULL,
  sender_role text NOT NULL CHECK (sender_role IN ('parent', 'teacher', 'admin')),
  body        text NOT NULL CHECK (length(body) BETWEEN 1 AND 4000),
  channel     text NOT NULL DEFAULT 'web' CHECK (channel IN ('web', 'whatsapp')),
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_school_messages_thread ON public.school_messages (thread_id, created_at);

CREATE TABLE IF NOT EXISTS public.whatsapp_links (
  user_id        uuid PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  school_id      uuid REFERENCES public.schools(id) ON DELETE CASCADE,
  phone_e164     text NOT NULL CHECK (phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  opted_in       boolean NOT NULL DEFAULT false,
  verified_at    timestamptz,
  -- 'simulated' links were verified while the Cloud API key was a placeholder (the code was shown
  -- on screen, not delivered): once the channel is live they must be verified again.
  verified_mode  text CHECK (verified_mode IN ('live', 'simulated')),
  otp_hash       text,
  otp_expires_at timestamptz,
  otp_attempts   int NOT NULL DEFAULT 0,
  -- What the parent wants pushed: grades, homework_due, alerts, fees, messages.
  prefs          jsonb NOT NULL DEFAULT '{"grades":true,"homework_due":true,"alerts":true,"fees":true,"messages":true}'::jsonb,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
-- One verified owner per number, so an inbound message maps to exactly one parent.
CREATE UNIQUE INDEX IF NOT EXISTS uq_whatsapp_links_verified_phone ON public.whatsapp_links (phone_e164) WHERE verified_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.whatsapp_log (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  direction    text NOT NULL CHECK (direction IN ('in', 'out')),
  user_id      uuid REFERENCES public.users(id) ON DELETE SET NULL,
  school_id    uuid REFERENCES public.schools(id) ON DELETE SET NULL,
  phone_e164   text NOT NULL,
  kind         text NOT NULL CHECK (kind IN ('ask', 'answer', 'notify', 'otp', 'message', 'system')),
  body         text NOT NULL,
  status       text NOT NULL CHECK (status IN ('simulated', 'sent', 'failed', 'received', 'ignored')),
  provider_id  text,
  error        text,
  -- Structured context: reply options offered, a message draft awaiting "SEND", the child in focus.
  meta         jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_whatsapp_log_user  ON public.whatsapp_log (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_whatsapp_log_phone ON public.whatsapp_log (phone_e164, created_at DESC);
-- Webhook retries: the same inbound provider message is processed once.
CREATE UNIQUE INDEX IF NOT EXISTS uq_whatsapp_log_inbound ON public.whatsapp_log (provider_id) WHERE direction = 'in' AND provider_id IS NOT NULL;

ALTER TABLE public.school_threads  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.school_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_links  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_log    ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.school_threads, public.school_messages, public.whatsapp_links, public.whatsapp_log FROM anon, authenticated;
GRANT SELECT ON public.school_threads, public.school_messages TO authenticated;
GRANT SELECT ON public.whatsapp_log TO authenticated;
GRANT ALL ON public.school_threads, public.school_messages, public.whatsapp_links, public.whatsapp_log TO service_role;

-- New office permission (mirrors src/lib/admin/rbac.ts): read and answer parents' messages to
-- the office. Added to the catalogue, not a re-seed, so live grants are untouched.
INSERT INTO public.role_permissions (role_key, perm)
SELECT r, p FROM (VALUES
  ('school_admin', ARRAY['messages.office']),
  ('principal', ARRAY['messages.office']),
  ('vice_principal', ARRAY['messages.office']),
  ('counsellor', ARRAY['messages.office'])
) AS t(r, ps), unnest(ps) AS p
ON CONFLICT DO NOTHING;

-- Visible to: the parent who wrote it (still a verified guardian), the teacher it is addressed
-- to, office staff holding messages.office (whole school: they oversee), and operators.
CREATE OR REPLACE FUNCTION app.can_see_thread(p_thread uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.school_threads t
    WHERE t.id = p_thread AND (
      (t.parent_id = auth.uid() AND app.is_parent_of(t.student_id))
      OR t.staff_id = auth.uid()
      OR (t.school_id = app.current_school_id() AND app.has_perm('messages.office'))
      OR app.is_superadmin()
    )
  )
$$;
REVOKE ALL ON FUNCTION app.can_see_thread(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION app.can_see_thread(uuid) TO authenticated;

DROP POLICY IF EXISTS school_threads_read ON public.school_threads;
CREATE POLICY school_threads_read ON public.school_threads FOR SELECT TO authenticated
  USING ((parent_id = (SELECT auth.uid()) AND app.is_parent_of(student_id))
         OR staff_id = (SELECT auth.uid())
         OR (school_id = (SELECT app.current_school_id()) AND (SELECT app.has_perm('messages.office')))
         OR (SELECT app.is_superadmin()));

DROP POLICY IF EXISTS school_messages_read ON public.school_messages;
CREATE POLICY school_messages_read ON public.school_messages FOR SELECT TO authenticated
  USING (app.can_see_thread(thread_id));

-- whatsapp_links: no client policy at all (server only). whatsapp_log: operators only.
DROP POLICY IF EXISTS whatsapp_log_read ON public.whatsapp_log;
CREATE POLICY whatsapp_log_read ON public.whatsapp_log FOR SELECT TO authenticated
  USING ((SELECT app.is_superadmin()));
