-- Follow-up to admin_lockdown, applied to the live database on 2026-09-25 without a file here; committed so a
-- rebuilt database matches. rls_auto_enable() is the event-trigger function that turns RLS on for new tables:
-- nobody should be able to call it through the API.
DO $$
BEGIN
  IF to_regprocedure('public.rls_auto_enable()') IS NOT NULL THEN
    REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM public, anon, authenticated;
  END IF;
END $$;
