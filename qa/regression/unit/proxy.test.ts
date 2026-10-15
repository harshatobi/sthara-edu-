/**
 * TE.040 AUTH-06/07 (automated): the route guard in src/proxy.ts, called directly with crafted requests.
 * The proxy is a routing convenience, not the security boundary: it reads cookies the browser sets.
 * The APIs and the database (RLS) enforce access; the API gate sweep (e2e/api) proves that side.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import { proxy, config } from '@/proxy';
import { ROOT } from '../../tools/inventory';

// The app's own copy of Next (the one proxy.ts uses); this pack doesn't install Next.
const { NextRequest } = createRequire(path.join(ROOT, 'package.json'))('next/server') as {
  NextRequest: new (input: URL, init?: { headers?: Record<string, string> }) => Parameters<typeof proxy>[0];
};

const env = process.env as Record<string, string | undefined>;
function run(path: string, cookies: Record<string, string> = {}, nodeEnv: 'production' | 'development' = 'production') {
  const before = env.NODE_ENV;
  env.NODE_ENV = nodeEnv;
  try {
    const cookie = Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; ');
    const res = proxy(new NextRequest(new URL(path, 'https://app.sthara.test'), { headers: cookie ? { cookie } : {} }));
    const loc = res.headers.get('location');
    return { status: res.status, to: loc ? new URL(loc).pathname + new URL(loc).search : null, passed: res.headers.get('x-middleware-next') === '1' };
  } finally { env.NODE_ENV = before; }
}

test('public routes pass straight through', () => {
  for (const p of ['/', '/login', '/onboard', '/privacy', '/terms', '/trial-expired', '/api/health', '/_next/static/x.js']) {
    assert.equal(run(p).passed, true, p);
  }
});

test('portals need a session: a signed-out visitor goes to sign-in with the page they wanted', () => {
  for (const p of ['/student', '/teacher/homework', '/admin/fees', '/parent/messages']) {
    const r = run(p);
    assert.equal(r.status, 307, p);
    assert.equal(r.to, `/login?redirect=${encodeURIComponent(p)}`, p);
  }
});

test('in production a role cookie without a session is not enough; in development it opens the demo', () => {
  assert.equal(run('/teacher', { __role: 'teacher' }, 'production').to, '/login?redirect=%2Fteacher');
  assert.equal(run('/teacher', { __role: 'teacher' }, 'development').passed, true);
});

test('an ended pilot or a paused school goes to the paused page, before any role check', () => {
  for (const state of ['expired', 'suspended']) {
    assert.equal(run('/admin', { __session: 't', __role: 'admin', __trial_ok: state }).to, '/trial-expired', state);
  }
  assert.equal(run('/admin', { __session: 't', __role: 'admin', __trial_ok: 'ok' }).passed, true);
});

test('each role reaches only its own portal; operators reach every portal', () => {
  const matrix: Record<string, Record<string, boolean>> = {
    student: { '/student': true, '/teacher': false, '/admin': false, '/parent': false },
    teacher: { '/student': false, '/teacher': true, '/admin': false, '/parent': false },
    admin: { '/student': false, '/teacher': false, '/admin': true, '/parent': false },
    parent: { '/student': false, '/teacher': false, '/admin': false, '/parent': true },
    superadmin: { '/student': true, '/teacher': true, '/admin': true, '/parent': true },
  };
  for (const [role, row] of Object.entries(matrix)) {
    for (const [path, allowed] of Object.entries(row)) {
      const r = run(`${path}/x`, { __session: 't', __role: role });
      assert.equal(r.passed, allowed, `${role} -> ${path}`);
      if (!allowed) assert.equal(r.to, `/${role === 'superadmin' ? 'ops' : role}`, `${role} -> ${path} lands home`);
    }
  }
});

test('an unknown role cookie is sent to sign-in, never let through', () => {
  const r = run('/admin', { __session: 't', __role: 'root' });
  assert.equal(r.status, 307);
  assert.equal(r.to, '/login');
});

test('the proxy runs on the four portals and on /api (timing stamps only); /ops is gated by its own server layout (404 for non-operators)', () => {
  assert.deepEqual([...config.matcher].sort(), ['/admin/:path*', '/api/:path*', '/parent/:path*', '/student/:path*', '/teacher/:path*']);
});

test('on /api the proxy only stamps the request for the request explorer: no redirect, no session needed', () => {
  // API routes authenticate themselves (e2e/api/auth-gates.spec.ts); the proxy must never block or redirect them.
  for (const p of ['/api/admin/exams', '/api/health', '/api/ops/desk']) assert.equal(run(p, {}).passed, true, p);
});

test('design note, pinned: the proxy trusts the browser-set __role cookie (OBS-005). APIs must not.', () => {
  // A forged cookie pair passes the proxy. This is acceptable only because every API route
  // re-derives the role from the database; e2e/api/auth-gates.spec.ts proves they do.
  assert.equal(run('/admin', { __session: 'anything', __role: 'admin' }).passed, true);
});
