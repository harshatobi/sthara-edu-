/**
 * Test runs from the test pack (qa/): what an upload must look like, and how a run reads in the console.
 * Pure, no I/O, so the rules are unit-tested.
 */

/** A private bucket of its own (see the qa_runs migration). */
export const QA_BUCKET = 'qa-runs';
/** Files are kept this long unless the run is pinned. */
export const FILE_DAYS = 90;
export const MAX_FILES = 40;
export const MAX_FILE_BYTES = 15 * 1024 * 1024;
export const MAX_RUN_BYTES = 60 * 1024 * 1024;
export const MAX_FAILURES = 300;

export type StageStatus = 'PASS' | 'FAIL' | 'WARN' | 'SKIP';
export interface Stage { name: string; status: StageStatus; ms: number | null }
export interface Counts { pass: number; fail: number; skip: number; flaky?: number }
export interface Failure { suite: string; name: string; file: string | null; message: string }
export type FileKind = 'workbook' | 'junit' | 'results' | 'log';
export interface RunFile { name: string; kind: FileKind; size: number }

export interface RunUpload {
  startedAt: string; finishedAt: string; machine: string | null;
  git: { commit: string | null; branch: string | null; dirty: boolean };
  target: string | null;
  stages: Stage[];
  totals: Record<string, Counts>;
  failures: Failure[];
  files: RunFile[];
}

const s = (v: unknown, n: number) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n) : '');
const int = (v: unknown) => { const x = Number(v); return Number.isInteger(x) && x >= 0 && x < 1e7 ? x : 0; };
/** A byte count; anything not a whole, non-negative number reads as too big, so it is refused rather than let through. */
const bytes = (v: unknown) => { const x = Number(v); return Number.isInteger(x) && x >= 0 ? x : Number.MAX_SAFE_INTEGER; };

/** File names the pack may upload, and what they are. Anything else is refused. */
export function fileKind(name: string): FileKind | null {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/.test(name) || name.includes('..')) return null;
  if (/\.xlsx$/i.test(name)) return 'workbook';
  if (/\.xml$/i.test(name)) return 'junit';
  if (/\.json$/i.test(name)) return 'results';
  if (/\.(log|txt)$/i.test(name)) return 'log';
  return null;
}

export const CONTENT_TYPE: Record<FileKind, string> = {
  workbook: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  junit: 'application/xml', results: 'application/json', log: 'text/plain',
};

/** Validates an upload; returns the clean run or the first problem. */
export function parseUpload(b: any): { ok: true; run: RunUpload } | { ok: false; error: string } {
  if (!b || typeof b !== 'object') return { ok: false, error: 'Send the run as JSON.' };
  const started = Date.parse(b.startedAt), finished = Date.parse(b.finishedAt);
  if (!Number.isFinite(started) || !Number.isFinite(finished) || finished < started) return { ok: false, error: 'startedAt and finishedAt must be times, finishing after the start.' };
  if (finished > Date.now() + 10 * 60_000) return { ok: false, error: 'The run finishes in the future. Check the machine clock.' };
  const stages = (Array.isArray(b.stages) ? b.stages : []).slice(0, 40).map((x: any) => ({
    name: s(x?.name, 80), status: (['PASS', 'FAIL', 'WARN', 'SKIP'].includes(x?.status) ? x.status : 'FAIL') as StageStatus,
    ms: x?.ms === null || x?.ms === undefined ? null : int(x.ms),
  })).filter((x: Stage) => x.name);
  if (!stages.length) return { ok: false, error: 'A run needs at least one stage.' };
  const totals: Record<string, Counts> = {};
  for (const [k, v] of Object.entries(b.totals && typeof b.totals === 'object' ? b.totals : {}).slice(0, 10)) {
    if (!/^[a-z][a-z0-9_-]{0,30}$/.test(k) || !v || typeof v !== 'object') continue;
    const c = v as any;
    totals[k] = { pass: int(c.pass), fail: int(c.fail), skip: int(c.skip), ...(c.flaky !== undefined ? { flaky: int(c.flaky) } : {}) };
  }
  const failures = (Array.isArray(b.failures) ? b.failures : []).slice(0, MAX_FAILURES).map((x: any) => ({
    suite: s(x?.suite, 80), name: s(x?.name, 300), file: s(x?.file, 200) || null, message: s(x?.message, 1500),
  })).filter((x: Failure) => x.name);
  const seen = new Set<string>();
  const files: RunFile[] = [];
  let total = 0;
  for (const f of (Array.isArray(b.files) ? b.files : []).slice(0, MAX_FILES + 1)) {
    const name = s(f?.name, 120), size = bytes(f?.size), kind = fileKind(name);
    if (!kind) return { ok: false, error: `"${name || 'a file'}" isn't a file the console keeps (workbooks, JUnit XML, JSON results, logs).` };
    if (seen.has(name)) return { ok: false, error: `${name} is listed twice.` };
    if (size > MAX_FILE_BYTES) return { ok: false, error: `${name} is over ${MAX_FILE_BYTES / 1024 / 1024} MB.` };
    seen.add(name); total += size;
    files.push({ name, kind, size });
  }
  if (files.length > MAX_FILES) return { ok: false, error: `At most ${MAX_FILES} files a run.` };
  if (total > MAX_RUN_BYTES) return { ok: false, error: `A run's files are at most ${MAX_RUN_BYTES / 1024 / 1024} MB together.` };
  const commit = s(b.git?.commit, 40).toLowerCase();
  return {
    ok: true,
    run: {
      startedAt: new Date(started).toISOString(), finishedAt: new Date(finished).toISOString(),
      machine: s(b.machine, 120) || null,
      git: { commit: /^[0-9a-f]{7,40}$/.test(commit) ? commit : null, branch: s(b.git?.branch, 200) || null, dirty: b.git?.dirty === true },
      target: s(b.target, 300) || null,
      stages, totals, failures, files,
    },
  };
}

/** A run passes when no stage failed. */
export const runStatus = (stages: Stage[]): 'pass' | 'fail' => (stages.some(x => x.status === 'FAIL') ? 'fail' : 'pass');

/** Where a run's files live in the bucket. */
export const filePath = (runId: string, name: string) => `qa/${runId}/${name}`;

/** Unpinned runs whose files are past keeping, given their start times. */
export function expired(runs: { id: string; started_at: string; pinned: boolean; files_purged_at: string | null }[], now = Date.now()): string[] {
  const cutoff = now - FILE_DAYS * 86_400_000;
  return runs.filter(r => !r.pinned && !r.files_purged_at && Date.parse(r.started_at) < cutoff).map(r => r.id);
}

/** The stage names of recent runs, in the order they usually run (for the console's grid). */
export function stageColumns(runs: { stages: Stage[] }[]): string[] {
  const order = new Map<string, number>();
  for (const r of runs) r.stages.forEach((st, i) => { if (!order.has(st.name)) order.set(st.name, i + order.size * 0.001); });
  return [...order.entries()].sort((a, b) => a[1] - b[1]).map(([k]) => k);
}
