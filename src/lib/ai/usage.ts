import 'server-only';
import { after } from 'next/server';
import type { GoogleGenAI, GenerateContentParameters, GenerateContentResponse } from '@google/genai';
import { createAdminClient } from '@/lib/supabase/server';
import { costUsd, countsFrom, type AiFeature } from './pricing';

/**
 * AI metering: every model call writes one row to public.ai_usage with its
 * tokens and cost, which the operator console's Usage page reads.
 *
 * Recording never blocks or breaks the call it measures: it runs after the
 * response is sent (next/server `after`) and swallows its own errors.
 */
export interface UsageMeta {
  feature: AiFeature;
  userId?: string | null;
  /** Looked up from the user when not given. */
  schoolId?: string | null;
}

interface Row extends UsageMeta {
  model: string;
  usage: unknown;
  ok: boolean;
  latencyMs: number;
  error?: string;
}

async function write(r: Row) {
  try {
    const db = createAdminClient();
    let schoolId = r.schoolId ?? null;
    if (!schoolId && r.userId) {
      const { data } = await db.from('users').select('school_id').eq('id', r.userId).maybeSingle();
      schoolId = data?.school_id ?? null;
    }
    const t = countsFrom(r.usage);
    const { error } = await db.from('ai_usage').insert({
      feature: r.feature,
      model: r.model,
      user_id: r.userId ?? null,
      school_id: schoolId,
      input_tokens: t.input,
      output_tokens: t.output,
      thinking_tokens: t.thinking,
      cached_tokens: t.cached,
      cost_usd: costUsd(r.model, t),
      ok: r.ok,
      latency_ms: r.latencyMs,
      error: r.error ? r.error.slice(0, 300) : null,
    });
    if (error) console.error('[ai_usage] insert failed:', error.message);
  } catch (e) {
    console.error('[ai_usage] not recorded:', e instanceof Error ? e.message : e);
  }
}

/** Record one call. Outside a request (scripts, tests) it writes straight away. */
export function recordUsage(r: Row) {
  try {
    after(() => write(r));
  } catch {
    void write(r);
  }
}

/** ai.models.generateContent with metering. Same arguments, same result, same errors. */
export async function generateMetered(ai: GoogleGenAI, params: GenerateContentParameters, meta: UsageMeta): Promise<GenerateContentResponse> {
  const started = Date.now();
  try {
    const res = await ai.models.generateContent(params);
    recordUsage({ ...meta, model: params.model, usage: res.usageMetadata, ok: true, latencyMs: Date.now() - started });
    return res;
  } catch (e) {
    recordUsage({ ...meta, model: params.model, usage: null, ok: false, latencyMs: Date.now() - started, error: e instanceof Error ? e.message : String(e) });
    throw e;
  }
}

/** For routes that call the REST endpoint with fetch(): pass the parsed JSON body (or null on failure). */
export function recordRestUsage(model: string, body: { usageMetadata?: unknown } | null, meta: UsageMeta, started: number, error?: string) {
  recordUsage({ ...meta, model, usage: body?.usageMetadata, ok: !error, latencyMs: Date.now() - started, error });
}
