import { solve, type SolverInput, type SolverResult } from './solver';

/** Built from solver.worker.ts by scripts/build-workers.mjs (before dev and build); the commit keeps caches honest. */
const WORKER_URL = `/workers/solver.js${process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA ? `?v=${process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA.slice(0, 12)}` : ''}`;

/**
 * Runs the solver in a Web Worker so the page stays usable, and on the main thread if the worker can't start
 * (no Worker support, or the script failed to load). Rejects with the solver's message if the solver itself fails.
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
