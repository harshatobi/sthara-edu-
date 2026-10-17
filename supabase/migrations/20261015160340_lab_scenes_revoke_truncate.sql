-- New tables inherit Supabase's default grants; TRUNCATE ignores row-level security, so signed-in users must not
-- hold it (every other public table already has it revoked). Writes to lab_scenes go through the server only.
REVOKE TRUNCATE, TRIGGER, REFERENCES ON public.lab_scenes FROM authenticated, anon;
