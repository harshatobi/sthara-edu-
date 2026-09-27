/// <reference lib="webworker" />
// Runs the timetable solver off the main thread so the page stays responsive while it works.
import { solve, type SolverInput } from './solver';

self.onmessage = (e: MessageEvent<SolverInput>) => {
  try {
    self.postMessage({ ok: true, result: solve(e.data) });
  } catch (err) {
    self.postMessage({ ok: false, error: err instanceof Error ? err.message : 'The solver stopped unexpectedly.' });
  }
};
