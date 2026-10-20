-- AI metering: one row per model call (tokens, cost at call time, outcome), written by the
-- server after each call (src/lib/ai/usage.ts) and read by the operator console's Usage page.
--
--   ai_usage            append-only call log. No client access at all: service role only.
--   ops_ai_usage(from, to)
--                       everything the Usage page shows for a window, aggregated in SQL
--                       (totals, per day in IST, per feature / school / model, top users).

CREATE TABLE IF NOT EXISTS public.ai_usage (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  at              timestamptz NOT NULL DEFAULT now(),
  feature         text NOT NULL CHECK (length(feature) BETWEEN 1 AND 60),
  model           text NOT NULL CHECK (length(model) BETWEEN 1 AND 80),
  user_id         uuid REFERENCES public.users(id)   ON DELETE SET NULL,
  school_id       uuid REFERENCES public.schools(id) ON DELETE SET NULL,
  -- Gemini's promptTokenCount; includes cached_tokens.
  input_tokens    integer NOT NULL DEFAULT 0 CHECK (input_tokens >= 0),
  output_tokens   integer NOT NULL DEFAULT 0 CHECK (output_tokens >= 0),
  thinking_tokens integer NOT NULL DEFAULT 0 CHECK (thinking_tokens >= 0),
  cached_tokens   integer NOT NULL DEFAULT 0 CHECK (cached_tokens >= 0),
  -- USD at the list price when the call was made; NULL = model has no price on file.
  cost_usd        numeric(14, 8),
  ok              boolean NOT NULL DEFAULT true,
  latency_ms      integer,
  error           text
);
CREATE INDEX IF NOT EXISTS idx_ai_usage_at        ON public.ai_usage (at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_usage_school_at ON public.ai_usage (school_id, at DESC);

ALTER TABLE public.ai_usage ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ai_usage FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.ops_ai_usage(p_from timestamptz, p_to timestamptz)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH u AS (
    SELECT *, input_tokens + output_tokens + thinking_tokens AS tokens
    FROM public.ai_usage WHERE at >= p_from AND at < p_to
  )
  SELECT jsonb_build_object(
    'totals', (SELECT jsonb_build_object(
        'calls', count(*), 'failed', count(*) FILTER (WHERE NOT ok),
        'input', coalesce(sum(input_tokens), 0), 'output', coalesce(sum(output_tokens), 0),
        'thinking', coalesce(sum(thinking_tokens), 0), 'cached', coalesce(sum(cached_tokens), 0),
        'tokens', coalesce(sum(tokens), 0), 'cost', coalesce(sum(cost_usd), 0),
        'unpriced', count(*) FILTER (WHERE cost_usd IS NULL AND ok),
        'avgLatency', round(avg(latency_ms) FILTER (WHERE ok)),
        'users', count(DISTINCT user_id), 'schools', count(DISTINCT school_id)) FROM u),
    'daily', coalesce((SELECT jsonb_agg(d ORDER BY d->>'day') FROM (
        SELECT jsonb_build_object('day', (at AT TIME ZONE 'Asia/Kolkata')::date, 'calls', count(*),
          'tokens', sum(tokens), 'cost', coalesce(sum(cost_usd), 0)) d
        FROM u GROUP BY (at AT TIME ZONE 'Asia/Kolkata')::date) x), '[]'::jsonb),
    'features', coalesce((SELECT jsonb_agg(f ORDER BY (f->>'cost')::numeric DESC, (f->>'tokens')::bigint DESC) FROM (
        SELECT jsonb_build_object('key', feature, 'calls', count(*), 'failed', count(*) FILTER (WHERE NOT ok),
          'input', sum(input_tokens), 'output', sum(output_tokens) + sum(thinking_tokens),
          'tokens', sum(tokens), 'cost', coalesce(sum(cost_usd), 0), 'avgLatency', round(avg(latency_ms) FILTER (WHERE ok))) f
        FROM u GROUP BY feature) x), '[]'::jsonb),
    'schools', coalesce((SELECT jsonb_agg(s ORDER BY (s->>'cost')::numeric DESC) FROM (
        SELECT jsonb_build_object('id', u.school_id, 'name', coalesce(sc.name, CASE WHEN u.school_id IS NULL THEN 'No school (operators)' ELSE 'Deleted school' END),
          'calls', count(*), 'users', count(DISTINCT u.user_id), 'tokens', sum(u.tokens), 'cost', coalesce(sum(u.cost_usd), 0)) s
        FROM u LEFT JOIN public.schools sc ON sc.id = u.school_id GROUP BY u.school_id, sc.name) x), '[]'::jsonb),
    'models', coalesce((SELECT jsonb_agg(m ORDER BY (m->>'cost')::numeric DESC) FROM (
        SELECT jsonb_build_object('model', model, 'calls', count(*), 'input', sum(input_tokens), 'cached', sum(cached_tokens),
          'output', sum(output_tokens), 'thinking', sum(thinking_tokens), 'cost', coalesce(sum(cost_usd), 0)) m
        FROM u GROUP BY model) x), '[]'::jsonb),
    'users', coalesce((SELECT jsonb_agg(p ORDER BY (p->>'cost')::numeric DESC) FROM (
        SELECT jsonb_build_object('id', u.user_id, 'name', coalesce(us.name, us.email, 'Deleted user'), 'role', us.role,
          'school', sc.name, 'calls', count(*), 'tokens', sum(u.tokens), 'cost', coalesce(sum(u.cost_usd), 0)) p
        FROM u LEFT JOIN public.users us ON us.id = u.user_id LEFT JOIN public.schools sc ON sc.id = u.school_id
        WHERE u.user_id IS NOT NULL GROUP BY u.user_id, us.name, us.email, us.role, sc.name
        ORDER BY coalesce(sum(u.cost_usd), 0) DESC LIMIT 25) x), '[]'::jsonb),
    'recent', coalesce((SELECT jsonb_agg(r ORDER BY r->>'at' DESC) FROM (
        SELECT jsonb_build_object('id', u.id, 'at', u.at, 'feature', u.feature, 'model', u.model, 'school', sc.name,
          'user', coalesce(us.name, us.email), 'input', u.input_tokens, 'output', u.output_tokens + u.thinking_tokens,
          'cost', u.cost_usd, 'ok', u.ok, 'latency', u.latency_ms, 'error', u.error) r
        FROM u LEFT JOIN public.users us ON us.id = u.user_id LEFT JOIN public.schools sc ON sc.id = u.school_id
        ORDER BY u.at DESC LIMIT 50) x), '[]'::jsonb)
  );
$$;

REVOKE ALL ON FUNCTION public.ops_ai_usage(timestamptz, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ops_ai_usage(timestamptz, timestamptz) TO service_role;
