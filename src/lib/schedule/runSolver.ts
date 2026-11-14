import { solve, type SolverInput, type SolverResult } from './solver';

/** Built from solver.worker.ts by scripts/build-workers.mjs (before dev and build); the commit keeps caches honest. */
const WORKER_URL = `/workers/solver.js${process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA ? `?v=${process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA.slice(0, 12)}` : ''}`;
const CPSAT_URL = '/api/cpsat';

/**
 * Runs the in-browser solver in a Web Worker so the page stays usable, and on the main thread if the worker can't
 * start (no Worker support, or the script failed to load). Rejects with the solver's message if the solver itself fails.
 */
export function runSolver(input: SolverInput): Promise<SolverResult> {
  const inPage = () => new Promise<SolverResult>(resolve => setTimeout(() => resolve(solve(input)), 0));
  if (typeof Worker === 'undefined') return inPage();
  return new Promise((resolve, reject) => {
    let worker: Worker;
    try { worker = new Worker(WORKER_URL); } catch { inPage().then(resolve, reject); return; }
    let answered = false;
    worker.onmessage = (e: MessageEvent<{ ok: true; result: SolverResult } | { ok: false; error: string }>) => {
      answered = true;
      worker.terminate();
      if (e.data.ok) resolve(e.data.result); else reject(new Error(e.data.error));
    };
    // The script didn't load or crashed before answering: solve here instead.
    worker.onerror = e => { e.preventDefault(); worker.terminate(); if (!answered) inPage().then(resolve, reject); };
    worker.postMessage(input);
  });
}

const unplacedOf = (r: SolverResult) => r.unplaced.reduce((n, u) => n + u.periods, 0);

export type SolvePhase = 'draft' | 'optimise' | 'fallback';
export interface SolveOptions {
  /** The signed-in user's token; without it only the in-browser solver runs. */
  token?: string | null;
  onPhase?: (p: SolvePhase) => void;
  /** Ranks two results that place the same number of periods (lower is better). Default: the engine's own score. */
  cost?: (r: SolverResult) => number;
  signal?: AbortSignal;
}

/**
 * The full solve: a quick in-browser draft, then Google OR-Tools CP-SAT on the server starting from that draft.
 * CP-SAT keeps the draft's placements unless it finds better, so the answer is never worse than the draft; if the
 * server can't be reached (offline, local development without `npm run dev:solver`), the in-browser solver gets the
 * rest of the time instead. Whichever places more periods wins; on a tie, the lower cost.
 */
export async function solveBest(input: SolverInput, opts: SolveOptions = {}): Promise<SolverResult> {
  const total = input.timeLimitMs ?? 15000;
  const draftMs = Math.max(1500, Math.min(6000, Math.round(total / 4)));
  opts.onPhase?.('draft');
  const draft = await runSolver({ ...input, timeLimitMs: draftMs });
  if (!opts.token || opts.signal?.aborted) return draft;
  const cost = opts.cost ?? ((r: SolverResult) => r.score.total);
  const better = (a: SolverResult, b: SolverResult) => unplacedOf(a) < unplacedOf(b) || (unplacedOf(a) === unplacedOf(b) && cost(a) <= cost(b));
  opts.onPhase?.('optimise');
  try {
    const res = await fetch(CPSAT_URL, {
      method: 'POST', signal: opts.signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${opts.token}` },
      body: JSON.stringify({ ...input, timeLimitMs: Math.max(3000, total - draftMs), hint: draft.lessons.filter(l => !l.locked) }),
    });
    const data = await res.json().catch(() => null) as { ok?: boolean; result?: SolverResult; error?: string } | null;
    // The solver's own refusals (422) are the answer; anything else means it isn't there to ask.
    if (res.status === 422) throw Object.assign(new Error(data?.error || 'The solver could not build a timetable.'), { final: true });
    if (!res.ok || !data?.result) throw new Error(data?.error || `Solver unavailable (${res.status})`);
    const exact = { ...data.result, warnings: [...new Set([...draft.warnings, ...data.result.warnings])] };
    return better(exact, draft) ? exact : { ...draft, warnings: exact.warnings };
  } catch (e) {
    if ((e as { final?: boolean }).final || opts.signal?.aborted) { if (opts.signal?.aborted) return draft; throw e; }
    opts.onPhase?.('fallback');
    const rest = await runSolver({ ...input, start: input.start ?? draft.lessons.filter(l => !l.locked), timeLimitMs: Math.max(2000, total - draftMs) });
    return better(rest, draft) ? rest : draft;
  }
}
