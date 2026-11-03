/**
 * TE.040 NFR-SEC-01 (automated, static): every API route has a gate, read from the source.
 * Complements the live sweep in e2e/api: this one runs without a server, so it catches an
 * unguarded route at review time. Also pins the input helpers the office routes rely on.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { apiRoutes, ROOT } from '../../tools/inventory';
import { PERMS } from '@/lib/admin/rbac';
import { money, str, ISO_DAY, isUuid } from '@/lib/admin/serverAuth';
import { verifyApiToken } from '@/lib/auth/verifyToken';
import { operatorFromToken, notFoundResponse } from '@/lib/ops/auth';

const routes = apiRoutes();

test('no API route is without a recognised gate', () => {
  assert.deepEqual(routes.filter(r => r.guard === 'unguarded').map(r => r.route), []);
});

test('only the deliberate public endpoints are open', () => {
  assert.deepEqual(routes.filter(r => r.guard === 'public').map(r => r.route).sort(),
    ['/api/apply', '/api/auth/verify-school', '/api/contact', '/api/errors', '/api/health', '/api/platform/public']);
});

test('every /api/ops route is operator-only; every /api/admin route checks the office or the caller’s role', () => {
  for (const r of routes.filter(r => r.route.startsWith('/api/ops/'))) assert.equal(r.guard, 'operator', r.route);
  for (const r of routes.filter(r => r.route.startsWith('/api/admin/'))) assert.ok(['office', 'signed-in'].includes(r.guard), r.route);
});

/** Office routes any office account may use, whatever its roles: asking Sthara for help (layout: Help & Support). */
const OPEN_TO_EVERY_OFFICE_ACCOUNT = new Set(['/api/admin/support']);

test('office routes that use requireAdmin name real permissions', () => {
  for (const r of routes.filter(r => r.guard === 'office')) {
    if (OPEN_TO_EVERY_OFFICE_ACCOUNT.has(r.route)) { assert.equal(r.perms.length, 0, `${r.route} is listed as open but checks a permission`); continue; }
    assert.ok(r.perms.length, `${r.route} checks no permission`);
    for (const p of r.perms) assert.ok(p in PERMS, `${r.route} checks unknown permission ${p}`);
  }
});

test('signed-in routes under /api/admin check the caller’s school and role themselves', () => {
  for (const r of routes.filter(r => r.route.startsWith('/api/admin/') && r.guard === 'signed-in')) {
    const src = fs.readFileSync(path.join(ROOT, r.file), 'utf8');
    assert.match(src, /status: 403/, `${r.route} never refuses with 403`);
    assert.match(src, /school_id/, `${r.route} doesn't compare schools`);
  }
});

test('every handler passes its gate before it touches the database', () => {
  const GATE = /require(Admin|Staff|Parent|FeedCaller)\(|verifyApiToken\(|operatorFromRequest\(|operatorFor\(/;
  const DB = /createAdminClient\(|\bdb\.(from|rpc|storage)\b|supabase\.(from|rpc|storage)\b/;
  const early: string[] = [];
  for (const r of routes.filter(r => !['public', 'meta', 'cron', 'device'].includes(r.guard))) {
    const src = fs.readFileSync(path.join(ROOT, r.file), 'utf8');
    // Local helpers that run the gate themselves (e.g. `load(req, id)` calling requireStaff) count as the gate.
    const helpers = [...src.matchAll(/(?:async\s+)?function\s+(\w+)\s*\([^)]*\)[^{]*\{([\s\S]*?)\n\}/g)]
      .filter(m => !/^(GET|POST|PUT|PATCH|DELETE)$/.test(m[1]) && GATE.test(m[2])).map(m => m[1]);
    const gateRe = new RegExp([GATE.source, ...helpers.map(h => `\\b${h}\\(`)].join('|'));
    for (const m of src.matchAll(/export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE)\b[^{]*\{([\s\S]*?)\n\}/g)) {
      const gate = m[2].search(gateRe), db = m[2].search(DB);
      if (gate < 0 || (db >= 0 && db < gate)) early.push(`${m[1]} ${r.route}`);
    }
  }
  assert.deepEqual(early, [], 'handlers that reach the database before (or without) their gate');
});

test('input helpers: rupees to the paisa, trimmed strings, ISO days and ids', () => {
  assert.equal(money('1,20,000.50'), 120000.5);
  assert.equal(money(0), 0);
  for (const bad of [-1, '12.345', 'abc', 1e10, NaN, Infinity]) assert.equal(money(bad), null, String(bad));
  assert.equal(str('  hello  '), 'hello');
  assert.equal(str('x'.repeat(5000)).length, 2000);
  assert.equal(str(42), '');
  assert.ok(ISO_DAY.test('2026-09-27') && !ISO_DAY.test('27-09-2026'));
  assert.ok(isUuid('00000000-0000-0000-0000-000000000000') && !isUuid('1; drop table users'));
});

test('no Authorization header, or a non-Bearer one, is refused before anything is looked up', async () => {
  for (const h of [null, undefined, '', 'Basic dXNlcjpwYXNz', 'bearer x']) {
    const r = await verifyApiToken(h as never);
    assert.equal(r.user, null, String(h));
    assert.match(r.error!, /Missing or invalid Authorization header/);
  }
});

test('operator checks fail closed, and strangers get a plain 404', async () => {
  assert.equal(await operatorFromToken(null), null);
  assert.equal(await operatorFromToken(''), null);
  const res = notFoundResponse();
  assert.equal(res.status, 404);
  assert.equal(res.headers.get('content-type'), 'text/plain');
  assert.equal(await res.text(), 'Not Found');
});
