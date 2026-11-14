import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenAI } from '@google/genai';
import { AI_MODELS, CLAUDE_CACHED_FEATURES, CLAUDE_MODELS, GEMINI_ONLY_PLANS, claudeChoice, type AiJob } from '@/lib/settings/limits';
import { getSchoolPolicy, schoolIdOfUser } from '@/lib/settings/server';
import { generateGeminiMetered, recordUsage, type UsageMeta } from './usage';
import { withRetry } from './retry';
import { toClaudeMessages, type AiRequest } from './messages';

/**
 * One way for every route to call a text model, whichever provider runs it.
 *
 *   Aadhara schools      Gemini only.
 *   every other school   Claude first. If Claude fails (down, overloaded, rate
 *                        limited, key missing or rejected) the same request
 *                        runs on Gemini, so the teacher or student still gets
 *                        an answer. Operators and users with no school go
 *                        the Claude route too.
 *
 * Requests are written in the Gemini shape the routes already used (model is
 * an AI_MODELS id naming the job, contents, config) and converted for Claude
 * here. Every call, including a failed Claude attempt, is metered.
 */

export type { AiPart, AiTurn, AiRequest } from './messages';
export interface AiResult {
  text: string;
  provider: 'anthropic' | 'gemini';
  model: string;
}

/** Claude declined on safety grounds (after Anthropic's own fallback model also declined). Not retried on Gemini. */
export class AiRefusal extends Error {
  status = 422;
  constructor(public category: string | null) {
    super('The AI could not help with this request. Try rewording it.');
  }
}

/** Whether any AI provider is configured on this server. */
export const aiConfigured = () => !!(process.env.ANTHROPIC_API_KEY || process.env.GEMINI_API_KEY);

const JSON_RULE = 'Reply with exactly one JSON object and nothing else: no markdown code fences, no text before or after it.';
/** Room for thinking plus the answer. Streaming keeps long replies clear of HTTP timeouts. */
const CLAUDE_MAX_TOKENS = 32_000;

let claudeClient: Anthropic | null = null;
const claude = () => (claudeClient ??= new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
  // One SDK retry on 429/5xx, then we hand over to Gemini rather than keep the user waiting.
  maxRetries: 1,
  timeout: 180_000,
}));
let geminiClient: { key: string; ai: GoogleGenAI } | null = null;
const gemini = (key: string) => (geminiClient?.key === key ? geminiClient.ai : (geminiClient = { key, ai: new GoogleGenAI({ apiKey: key }) }).ai);

const jobOf = (model: string): AiJob | null =>
  (Object.keys(CLAUDE_MODELS) as AiJob[]).find(k => AI_MODELS[k] === model) ?? null;

/** Which provider this user's school runs on. Lookup failures take the default (Claude) route. */
async function geminiOnly(meta: UsageMeta): Promise<{ only: boolean; schoolId: string | null }> {
  try {
    const schoolId = meta.schoolId ?? (meta.userId ? await schoolIdOfUser(meta.userId) : null);
    if (!schoolId) return { only: false, schoolId: null };
    const policy = await getSchoolPolicy(schoolId);
    return { only: !!policy && GEMINI_ONLY_PLANS.includes(policy.plan), schoolId };
  } catch {
    return { only: false, schoolId: meta.schoolId ?? null };
  }
}

async function runClaude(req: AiRequest, job: AiJob, meta: UsageMeta): Promise<AiResult> {
  const chosen = claudeChoice(job, meta.feature);
  // Past 70% of the student's yearly AI allowance, Sonnet work runs on Haiku (cost cap, 2026-11-06).
  const { model, effort } = meta.economy && chosen.model !== 'claude-haiku-5-5' ? { model: 'claude-haiku-5-5' as const, effort: chosen.effort } : chosen;
  const json = req.config?.responseMimeType === 'application/json';
  const systemText = [req.config?.systemInstruction, json ? JSON_RULE : null].filter(Boolean).join('\n\n');
  // Conversations: the system prompt (with its data brief) is the same every turn, so it gets its own cache
  // breakpoint, and automatic caching covers the growing history after it. Prompts under 512 tokens silently don't cache.
  const cached = CLAUDE_CACHED_FEATURES.includes(meta.feature);
  const system = !systemText ? undefined
    : cached ? [{ type: 'text' as const, text: systemText, cache_control: { type: 'ephemeral' as const } }]
      : systemText;
  const started = Date.now();
  let usedModel: string = model;
  try {
    const msg = await claude().beta.messages.stream({
      model,
      max_tokens: Math.max(req.config?.maxOutputTokens ?? 0, CLAUDE_MAX_TOKENS),
      ...(system ? { system } : {}),
      messages: toClaudeMessages(req.contents),
      output_config: { effort },
      ...(cached ? { cache_control: { type: 'ephemeral' as const } } : {}),
      // Sonnet only (Haiku has no server-side fallback): if Sonnet 5.5's safety check declines, Anthropic
      // reruns the request on Claude Sonnet 5. Never an Opus model.
      ...(model === 'claude-sonnet-5-5' ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const } : {}),
    }, req.config?.abortSignal ? { signal: req.config.abortSignal } : undefined).finalMessage();
    usedModel = msg.model || model;
    if (msg.stop_reason === 'refusal') {
      const category = msg.stop_details?.category ?? null;
      recordUsage({ ...meta, model: usedModel, usage: msg.usage, ok: false, latencyMs: Date.now() - started, error: `refusal${category ? ` (${category})` : ''}` });
      throw new AiRefusal(category);
    }
    if (msg.stop_reason === 'max_tokens') console.warn(`[ai] ${meta.feature}: Claude hit max_tokens; reply may be cut short`);
    recordUsage({ ...meta, model: usedModel, usage: msg.usage, ok: true, latencyMs: Date.now() - started });
    const text = msg.content.map(b => (b.type === 'text' ? b.text : '')).join('').trim();
    return { text, provider: 'anthropic', model: usedModel };
  } catch (e) {
    if (!(e instanceof AiRefusal)) {
      recordUsage({ ...meta, model: usedModel, usage: null, ok: false, latencyMs: Date.now() - started, error: e instanceof Error ? e.message : String(e) });
    }
    throw e;
  }
}

async function runGemini(req: AiRequest, meta: UsageMeta): Promise<AiResult> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw Object.assign(new Error('AI isn’t configured on this server (no Gemini key).'), { status: 503 });
  // Economy (past 70% of a student's AI allowance): text work drops to Flash-Lite.
  const r = meta.economy && req.model !== AI_MODELS.fast ? { ...req, model: AI_MODELS.fast } : req;
  // One more try when Google is briefly busy ("high demand" 503): the backup shouldn't fail a whole request on
  // a blip. A stopped request is never retried. Each attempt is metered on its own.
  const res = await withRetry(() => {
    if (req.config?.abortSignal?.aborted) throw new Error('aborted');
    return generateGeminiMetered(gemini(key), r, meta);
  }, { tries: 2, baseMs: 1500, maxWaitS: 5 });
  return { text: res.text ?? '', provider: 'gemini', model: r.model };
}

/** Run one text request on the right provider for the user's school. Throws as the last provider threw. */
export async function generateAi(req: AiRequest, meta: UsageMeta): Promise<AiResult> {
  const route = await geminiOnly(meta);
  const m: UsageMeta = { ...meta, schoolId: route.schoolId };
  const job = jobOf(req.model);
  if (route.only || !job || !process.env.ANTHROPIC_API_KEY) return runGemini(req, m);
  try {
    return await runClaude(req, job, m);
  } catch (e) {
    if (e instanceof AiRefusal || req.config?.abortSignal?.aborted || !process.env.GEMINI_API_KEY) throw e;
    const why = e instanceof Anthropic.APIError ? `${e.status ?? 'network'} ${e.message}` : e instanceof Error ? e.message : String(e);
    console.warn(`[ai] ${meta.feature}: Claude failed, using Gemini backup: ${why.slice(0, 300)}`);
    return runGemini(req, m);
  }
}
