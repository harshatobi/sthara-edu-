import { test } from 'node:test';
import assert from 'node:assert/strict';
import { expired, fileKind, parseUpload, runStatus, stageColumns, FILE_DAYS, MAX_FILE_BYTES } from './runs';

const ago = (min: number) => new Date(Date.now() - min * 60_000).toISOString();
const base = {
  startedAt: ago(20), finishedAt: ago(8), machine: 'MacBook', target: 'http://localhost:3100',
  git: { commit: 'EA5FFCE1', branch: 'ops-quality', dirty: true },
  stages: [{ name: 'App unit tests', status: 'PASS', ms: 9000 }, { name: 'App lint', status: 'FAIL', ms: 12000 }],
  totals: { unit: { pass: 345, fail: 0, skip: 2 }, e2e: { pass: 441, fail: 11, skip: 1, flaky: 2 } },
  failures: [{ suite: 'e2e', name: 'GET /api/admin/exams refuses', file: 'e2e/api/auth-gates.spec.ts', message: 'Expected 401' }],
  files: [{ name: 'Sthara_TE040_System_Test_Scripts.xlsx', size: 126009 }, { name: 'unit.xml', size: 52000 }, { name: 'e2e-results.json', size: 520000 }, { name: 'App_lint.log', size: 900 }],
};

test('a run upload is cleaned and classified', () => {
  const p = parseUpload(base);
  assert.ok(p.ok);
  if (!p.ok) return;
  assert.equal(p.run.git.commit, 'ea5ffce1');
  assert.equal(p.run.git.dirty, true);
  assert.deepEqual(p.run.files.map(f => f.kind), ['workbook', 'junit', 'results', 'log']);
  assert.equal(p.run.totals.e2e.flaky, 2);
  assert.equal(runStatus(p.run.stages), 'fail');
  assert.equal(runStatus([{ name: 'a', status: 'PASS', ms: 1 }, { name: 'b', status: 'WARN', ms: null }]), 'pass');
});

test('uploads that are refused', () => {
  const bad = (o: Record<string, unknown>) => parseUpload({ ...base, ...o });
  assert.equal(bad({ finishedAt: ago(30) }).ok, false);
  assert.equal(bad({ stages: [] }).ok, false);
  assert.equal(bad({ files: [{ name: '../../etc/passwd.log', size: 1 }] }).ok, false);
  assert.equal(bad({ files: [{ name: 'report.html', size: 1 }] }).ok, false);
  assert.equal(bad({ files: [{ name: 'a.log', size: 1 }, { name: 'a.log', size: 1 }] }).ok, false);
  assert.equal(bad({ files: [{ name: 'big.json', size: MAX_FILE_BYTES + 1 }] }).ok, false);
  assert.equal(bad({ files: [{ name: 'huge.json', size: 5e9 }] }).ok, false);
  assert.equal(bad({ files: [{ name: 'odd.json', size: 'lots' }] }).ok, false);
  assert.equal(bad({ finishedAt: new Date(Date.now() + 3_600_000).toISOString() }).ok, false);
  // A bad commit is dropped, not fatal; an unknown stage status counts as a failure.
  const p = bad({ git: { commit: 'not-a-sha' }, stages: [{ name: 'x', status: 'BROKEN' }] });
  assert.ok(p.ok && p.run.git.commit === null && p.run.stages[0].status === 'FAIL');
});

test('file names: only plain names of the kinds the console keeps', () => {
  assert.equal(fileKind('Sthara_BR030_Solution_Matrix.xlsx'), 'workbook');
  assert.equal(fileKind('E2E_public,_mobile_and_API.log'), null);
  assert.equal(fileKind('E2E_public_mobile_and_API.log'), 'log');
  assert.equal(fileKind('.env'), null);
  assert.equal(fileKind('a/b.json'), null);
});

test('files expire after the keeping period unless pinned', () => {
  const now = Date.parse('2026-10-15T00:00:00Z');
  const old = new Date(now - (FILE_DAYS + 1) * 86_400_000).toISOString();
  const fresh = new Date(now - 5 * 86_400_000).toISOString();
  assert.deepEqual(expired([
    { id: 'a', started_at: old, pinned: false, files_purged_at: null },
    { id: 'b', started_at: old, pinned: true, files_purged_at: null },
    { id: 'c', started_at: fresh, pinned: false, files_purged_at: null },
    { id: 'd', started_at: old, pinned: false, files_purged_at: old },
  ], now), ['a']);
});

test('stage columns follow the order runs use', () => {
  const st = (...n: string[]) => ({ stages: n.map(name => ({ name, status: 'PASS' as const, ms: null })) });
  assert.deepEqual(stageColumns([st('type', 'lint', 'unit'), st('type', 'lint', 'unit', 'e2e')]), ['type', 'lint', 'unit', 'e2e']);
});
