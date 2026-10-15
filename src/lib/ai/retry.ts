/**
 * Gemini fails in two ways that need different answers:
 *   busy   503 UNAVAILABLE / "high demand": Google's side, usually gone in seconds; wait and retry
 *   quota  429 RESOURCE_EXHAUSTED: a per-minute limit may clear after its retryDelay; a daily or
 *          billing limit won't, and retrying only burns more of it
 */

export type AiFailure = 'busy' | 'quota' | 'other';

export function aiFailure(e: unknown): AiFailure {
  const m = e instanceof Error ? e.message : String(e ?? '');
  if (/"code":\s*503|UNAVAILABLE|high demand|overloaded/i.test(m)) return 'busy';
  if (/"code":\s*429|RESOURCE_EXHAUSTED|exceeded your current quota/i.test(m)) return 'quota';
  return 'other';
}

/** Seconds Google asks us to wait before retrying a 429, when it says. */
export function retryDelaySeconds(e: unknown): number | null {
  const m = e instanceof Error ? e.message : String(e ?? '');
  const d = /retryDelay"?\s*:\s*"?(\d+(?:\.\d+)?)s/.exec(m);
  return d ? Number(d[1]) : null;
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

/**
 * Runs `call` again when Gemini is busy (with growing waits), and when a quota
 * error says it clears within `maxWaitS` seconds. Anything else, or the last
 * attempt, throws as it came. `attempt` lets the caller switch to a fallback model.
 */
export async function withRetry<T>(call: (attempt: number) => Promise<T>, opts: { tries?: number; baseMs?: number; maxWaitS?: number } = {}): Promise<T> {
  const tries = opts.tries ?? 3, base = opts.baseMs ?? 2500, maxWaitS = opts.maxWaitS ?? 20;
  for (let attempt = 0; ; attempt++) {
    try {
      return await call(attempt);
    } catch (e) {
      const kind = aiFailure(e);
      const delay = retryDelaySeconds(e);
      const retryable = kind === 'busy' || (kind === 'quota' && delay !== null && delay <= maxWaitS);
      if (!retryable || attempt >= tries - 1) throw e;
      await sleep(kind === 'quota' ? delay! * 1000 + 250 : base * 2 ** attempt + Math.random() * 500);
    }
  }
}

/** Runs tasks with at most `limit` in flight, keeping results in order. */
export async function pooled<T>(tasks: (() => Promise<T>)[], limit: number): Promise<T[]> {
  const out: T[] = new Array(tasks.length);
  let next = 0;
  const worker = async () => { while (next < tasks.length) { const i = next++; out[i] = await tasks[i](); } };
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker));
  return out;
}
