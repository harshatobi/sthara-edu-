-- Ask the School OS for school leadership, and WhatsApp for teachers and staff.
--
-- os.ask: ask the School OS about the whole school (web and WhatsApp). Leadership only:
-- school admin, principal and vice principal. Teachers ask about their own classes
-- without a permission (their scope comes from what they teach).
--
-- whatsapp_links / whatsapp_log already key on user_id, so teachers and office staff
-- link the same way parents do; this adds the lookups the staff flows need.

INSERT INTO public.role_permissions (role_key, perm)
SELECT r, p FROM (VALUES
  ('school_admin',   ARRAY['os.ask']),
  ('principal',      ARRAY['os.ask']),
  ('vice_principal', ARRAY['os.ask'])
) AS t(r, ps), unnest(ps) AS p
ON CONFLICT DO NOTHING;

-- "Has today's digest gone out?" and "what was the last thing we sent this person?"
CREATE INDEX IF NOT EXISTS idx_whatsapp_log_user_kind ON public.whatsapp_log (user_id, direction, kind, created_at DESC);
