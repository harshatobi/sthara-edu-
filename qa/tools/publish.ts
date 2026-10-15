/**
 * Uploads a regression run to the ops console (Platform Manager > Quality). Called by run-regression.sh at the end of
 * every run; does nothing without QA_UPLOAD_URL and QA_UPLOAD_TOKEN (from the environment or e2e.env).
 *
 *   npx tsx tools/publish.ts <run started, ISO>
 *
 * Sends the stage results (reports/stages.tsv), test counts and failing tests (Node test logs, the JUnit file and
 * Playwright's JSON), then the files written during this run: the five workbooks, JUnit and JSON results, stage logs.
 * The files go straight to private storage through signed upload URLs. Never fails the run: problems are printed.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const QA = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APP = path.resolve(process.env.STHARA_APP_DIR || path.join(QA, '..'));
const REPORTS = path.join(QA, 'reports');

function env(k: string): string {
  if (process.env[k]) return process.env[k]!.trim();
  const f = path.join(QA, 'e2e.env');
  if (!fs.existsSync(f)) return '';
  const line = fs.readFileSync(f, 'utf8').split('\n').find(l => l.trim().startsWith(`${k}=`));
  return line ? line.slice(line.indexOf('=') + 1).trim().replace(/^['"]|['"]$/g, '') : '';
}
const git = (...a: string[]) => { try { return execFileSync('git', ['-C', APP, ...a], { encoding: 'utf8' }).trim(); } catch { return ''; } };
const strip = (s: string) => s.replace(/\u001b\[[0-9;]*m/g, '');

interface Counts { pass: number; fail: number; skip: number; flaky?: number }
interface Failure { suite: string; name: string; file: string | null; message: string }

/** Counts and failures from a Node test runner log (the "ℹ pass N" summary and the "failing tests" list). */
function nodeLog(file: string, suite: string): { counts: Counts | null; failures: Failure[] } {
  if (!fs.existsSync(file)) return { counts: null, failures: [] };
  const text = strip(fs.readFileSync(file, 'utf8'));
  const num = (k: string) => Number(text.match(new RegExp(`^ℹ ${k} (\\d+)`, 'm'))?.[1] ?? NaN);
  const counts = Number.isFinite(num('pass')) ? { pass: num('pass'), fail: num('fail') || 0, skip: (num('skipped') || 0) + (num('todo') || 0) } : null;
  const failures: Failure[] = [];
  const tail = text.split(/^✖ failing tests:$/m)[1] ?? '';
  for (const block of tail.split(/^test at /m).slice(1)) {
    const lines = block.split('\n');
    const where = lines[0].trim().replace(/:\d+:\d+$/, '');
    const name = (lines.find(l => l.startsWith('✖ ')) ?? '').replace(/^✖ /, '').replace(/ \([\d.]+ms\)$/, '');
    const message = lines.slice(2).filter(l => l.trim() && !/^\s+at /.test(l)).slice(0, 12).join('\n');
    if (name) failures.push({ suite, name, file: path.relative(APP, where.startsWith('/') ? where : path.join(QA, where)) || where, message });
  }
  return { counts, failures };
}

/** Counts and failures from Playwright's JSON report. */
function playwright(file: string, startedMs: number): { counts: Counts | null; failures: Failure[] } {
  if (!fs.existsSync(file) || fs.statSync(file).mtimeMs < startedMs) return { counts: null, failures: [] };
  const r = JSON.parse(fs.readFileSync(file, 'utf8'));
  const s = r.stats || {};
  const failures: Failure[] = [];
  const walk = (suite: any) => {
    for (const spec of suite.specs || []) for (const t of spec.tests || []) {
      if (t.status !== 'unexpected') continue;
      const res = (t.results || []).at(-1) || {};
      failures.push({ suite: `e2e:${t.projectName || 'e2e'}`, name: [...(suite.title && !suite.title.endsWith('.ts') ? [suite.title] : []), spec.title].join(' › '), file: `qa/e2e/${spec.file}`, message: strip(res.error?.message || res.errors?.[0]?.message || '').slice(0, 1500) });
    }
    for (const sub of suite.suites || []) walk(sub);
  };
  for (const suite of r.suites || []) walk(suite);
  return { counts: { pass: s.expected || 0, fail: s.unexpected || 0, skip: s.skipped || 0, flaky: s.flaky || 0 }, failures };
}

async function main() {
  const url = env('QA_UPLOAD_URL').replace(/\/$/, ''), token = env('QA_UPLOAD_TOKEN');
  if (!url || !token) { console.log('(Not uploaded: set QA_UPLOAD_URL and QA_UPLOAD_TOKEN in qa/e2e.env to send runs to the ops console.)'); return; }
  const startedAt = process.argv[2] || new Date().toISOString();
  const startedMs = Date.parse(startedAt);
  const stagesFile = path.join(REPORTS, 'stages.tsv');
  if (!fs.existsSync(stagesFile)) { console.log('(Not uploaded: no stage results in reports/stages.tsv.)'); return; }
  const stages = fs.readFileSync(stagesFile, 'utf8').split('\n').filter(Boolean).map(l => { const [name, status, secs] = l.split('\t'); return { name, status, ms: secs ? Number(secs) * 1000 : null }; });

  const logs = path.join(REPORTS, 'logs');
  const logFor = (stage: string) => path.join(logs, `${stage.replace(/[ /]/g, '_')}.log`);
  const app = nodeLog(logFor('App unit tests'), 'app unit');
  const qa = nodeLog(logFor('QA regression unit tests'), 'qa unit');
  const tml = nodeLog(logFor('App TML engine checks'), 'tml');
  const e2e = playwright(path.join(REPORTS, 'e2e-results.json'), startedMs);
  const totals: Record<string, Counts> = {};
  if (app.counts) totals.unit = app.counts;
  if (qa.counts) totals.qa = qa.counts;
  if (e2e.counts) totals.e2e = e2e.counts;
  const failures = [...app.failures, ...qa.failures, ...tml.failures, ...e2e.failures];

  // Files written during this run, under names the console accepts.
  const fresh = (f: string) => fs.existsSync(f) && fs.statSync(f).mtimeMs >= startedMs - 1000;
  const safe = (n: string) => n.replace(/[^A-Za-z0-9._-]/g, '_').replace(/_+/g, '_');
  const files: { name: string; from: string }[] = [];
  const add = (from: string, name = path.basename(from)) => { if (fresh(from)) files.push({ name: safe(name), from }); };
  const wb = path.join(QA, 'workbooks');
  if (fs.existsSync(wb)) for (const f of fs.readdirSync(wb).filter(f => f.endsWith('.xlsx'))) add(path.join(wb, f));
  for (const f of ['unit.xml', 'e2e.xml']) add(path.join(REPORTS, 'junit', f), f === 'unit.xml' ? 'qa-unit.junit.xml' : 'e2e.junit.xml');
  add(path.join(REPORTS, 'e2e-results.json'));
  if (fs.existsSync(logs)) for (const f of fs.readdirSync(logs).filter(f => f.endsWith('.log'))) add(path.join(logs, f));

  const body = {
    startedAt, finishedAt: new Date().toISOString(), machine: os.hostname(),
    git: { commit: git('rev-parse', 'HEAD'), branch: git('branch', '--show-current'), dirty: git('status', '--porcelain', '--', '.', ':!qa').length > 0 },
    target: env('E2E_BASE_URL') || 'http://localhost:3100',
    stages, totals, failures,
    files: files.map(f => ({ name: f.name, size: fs.statSync(f.from).size })),
  };
  const res = await fetch(`${url}/api/qa/runs`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-qa-token': token }, body: JSON.stringify(body) });
  const j: any = await res.json().catch(() => ({}));
  if (!res.ok) { console.log(`Upload refused (${res.status}): ${j.error || 'no reason given'}`); return; }
  let sent = 0;
  for (const u of j.uploads as { name: string; url: string; contentType: string }[]) {
    const f = files.find(x => x.name === u.name)!;
    const put = await fetch(u.url, { method: 'PUT', headers: { 'Content-Type': u.contentType, 'x-upsert': 'true' }, body: fs.readFileSync(f.from) });
    if (put.ok) sent++; else console.log(`  ${u.name}: upload failed (${put.status})`);
  }
  const done = await fetch(`${url}/api/qa/runs/${j.id}/complete`, { method: 'POST', headers: { 'x-qa-token': token } });
  const d: any = await done.json().catch(() => ({}));
  console.log(done.ok ? `Uploaded to the ops console: ${d.status === 'pass' ? 'passed' : 'failed'}, ${sent} file(s). ${url}/ops/quality` : `Upload not finished (${done.status}): ${d.error || ''}`);
}

main().catch(e => console.log(`Upload failed: ${e?.message || e}`));
