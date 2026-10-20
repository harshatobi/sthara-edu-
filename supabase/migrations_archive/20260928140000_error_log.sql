-- The platform's own error log, read in the ops console (Platform Manager > Error log).
--
-- app_error_groups  one row per distinct problem (a fingerprint of where it happened and its normalised message):
--                   how often, when first and last seen, in which release, and its triage status. A resolved problem
--                   that happens again reopens (regressed_at).
-- app_errors        each occurrence: the stack, route, request path (never the query string), school, user, release,
--                   browser; kept 30 days.
-- log_app_error()   records an occurrence and updates its group in one step (service role only).
--
-- Written only by the server (the service role): uncaught request errors, errors the routes log, and browser errors
-- posted to /api/errors. Read only by operators through /api/ops/errors. No school account can read either table.

CREATE TABLE IF NOT EXISTS public.app_error_groups (
  fingerprint     text PRIMARY KEY CHECK (length(fingerprint) BETWEEN 8 AND 80),
  source          text NOT NULL CHECK (source IN ('server', 'client')),
  kind            text NOT NULL CHECK (kind IN ('uncaught', 'logged', 'client', 'render', 'unhandled')),
  message         text NOT NULL CHECK (length(message) <= 2000),
  route           text CHECK (route IS NULL OR length(route) <= 300),
  status          text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'ignored')),
  events          bigint NOT NULL DEFAULT 0,
  first_seen      timestamptz NOT NULL DEFAULT now(),
  last_seen       timestamptz NOT NULL DEFAULT now(),
  last_release    text,
  last_environment text,
  resolved_at     timestamptz,
  resolved_by     uuid REFERENCES public.users(id) ON DELETE SET NULL,
  regressed_at    timestamptz,
  note            text CHECK (note IS NULL OR length(note) <= 2000)
);
CREATE INDEX IF NOT EXISTS ix_app_error_groups_seen ON public.app_error_groups (last_seen DESC);

CREATE TABLE IF NOT EXISTS public.app_errors (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  fingerprint  text NOT NULL REFERENCES public.app_error_groups(fingerprint) ON DELETE CASCADE,
  at           timestamptz NOT NULL DEFAULT now(),
  source       text NOT NULL,
  kind         text NOT NULL,
  message      text NOT NULL CHECK (length(message) <= 2000),
  stack        text CHECK (stack IS NULL OR length(stack) <= 8000),
  route        text CHECK (route IS NULL OR length(route) <= 300),
  method       text CHECK (method IS NULL OR length(method) <= 10),
  path         text CHECK (path IS NULL OR length(path) <= 500),
  school_id    uuid REFERENCES public.schools(id) ON DELETE SET NULL,
  user_id      uuid REFERENCES public.users(id) ON DELETE SET NULL,
  user_role    text,
  release      text,
  environment  text,
  user_agent   text CHECK (user_agent IS NULL OR length(user_agent) <= 400),
  digest       text,
  repeats      integer NOT NULL DEFAULT 1 CHECK (repeats >= 1),
  context      jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS ix_app_errors_group ON public.app_errors (fingerprint, at DESC);
CREATE INDEX IF NOT EXISTS ix_app_errors_at ON public.app_errors (at DESC);

ALTER TABLE public.app_error_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_errors ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.app_error_groups, public.app_errors FROM anon, authenticated;
GRANT ALL ON public.app_error_groups, public.app_errors TO service_role;

-- Records one occurrence (p_repeats > 1 when the server folded identical errors from the last few seconds into one).
CREATE OR REPLACE FUNCTION public.log_app_error(
  p_fingerprint text, p_source text, p_kind text, p_message text, p_stack text, p_route text, p_method text, p_path text,
  p_school uuid, p_user uuid, p_user_role text, p_release text, p_environment text, p_user_agent text, p_digest text,
  p_repeats integer, p_context jsonb
) RETURNS void
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  msg text := left(coalesce(nullif(p_message, ''), 'Unknown error'), 2000);
  n integer := greatest(1, least(coalesce(p_repeats, 1), 100000));
BEGIN
  INSERT INTO public.app_error_groups AS g (fingerprint, source, kind, message, route, events, first_seen, last_seen, last_release, last_environment)
  VALUES (p_fingerprint, p_source, p_kind, msg, left(p_route, 300), n, now(), now(), p_release, p_environment)
  ON CONFLICT (fingerprint) DO UPDATE SET
    events = g.events + n,
    last_seen = now(),
    last_release = coalesce(excluded.last_release, g.last_release),
    last_environment = coalesce(excluded.last_environment, g.last_environment),
    -- A resolved problem that happens again is open again; an ignored one stays ignored.
    regressed_at = CASE WHEN g.status = 'resolved' THEN now() ELSE g.regressed_at END,
    status = CASE WHEN g.status = 'resolved' THEN 'open' ELSE g.status END;

  INSERT INTO public.app_errors (fingerprint, source, kind, message, stack, route, method, path, school_id, user_id, user_role,
                                 release, environment, user_agent, digest, repeats, context)
  VALUES (p_fingerprint, p_source, p_kind, msg, left(p_stack, 8000), left(p_route, 300), left(p_method, 10), left(p_path, 500),
          (SELECT id FROM public.schools WHERE id = p_school), (SELECT id FROM public.users WHERE id = p_user), left(p_user_role, 40),
          left(p_release, 80), left(p_environment, 40), left(p_user_agent, 400), left(p_digest, 120), n, coalesce(p_context, '{}'::jsonb));

  -- Keep 30 days of occurrences (checked now and then rather than on every write).
  IF random() < 0.02 THEN
    DELETE FROM public.app_errors WHERE at < now() - interval '30 days';
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.log_app_error(text, text, text, text, text, text, text, text, uuid, uuid, text, text, text, text, text, integer, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.log_app_error(text, text, text, text, text, text, text, text, uuid, uuid, text, text, text, text, text, integer, jsonb) TO service_role;
