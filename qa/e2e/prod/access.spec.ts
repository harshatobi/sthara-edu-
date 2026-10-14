/**
 * TE.040 AUTH-08, ADM-ACC-05, NFR-SEC-07 (automated, test school, read-only): with real sessions,
 * each role is kept to its own portal and its own APIs, and office roles to their permissions.
 * Every request here is refused before the route does anything, so nothing is written.
 */
import { test, expect, type APIRequestContext, type Browser } from '@playwright/test';
import fs from 'node:fs';
import { account, authFile, type RoleKey } from '../support/env';
import { accessToken } from '../support/app';

async function tokenOf(browser: Browser, key: RoleKey): Promise<string | null> {
  if (!account(key) || !fs.existsSync(authFile(key))) return null;
  const ctx = await browser.newContext({ storageState: authFile(key) });
  const page = await ctx.newPage();
  await page.goto(account(key)!.home);
  const t = await accessToken(page);
  await ctx.close();
  return t;
}

async function call(request: APIRequestContext, token: string, method: string, url: string, data?: unknown) {
  return request.fetch(url, { method, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, data: data === undefined ? undefined : JSON.stringify(data), failOnStatusCode: false });
}

test.describe('Portals by role (real sessions)', () => {
  const cases: [RoleKey, string, RegExp][] = [
    ['teacher', '/admin', /\/teacher/], ['student', '/teacher', /\/student/], ['parent', '/admin/fees', /\/parent/],
    ['student', '/parent', /\/student/], ['admin', '/student', /\/admin/],
  ];
  for (const [key, path, lands] of cases) {
    test(`${key} opening ${path} lands in their own portal`, async ({ browser }) => {
      test.skip(!account(key) || !fs.existsSync(authFile(key)), `${key} not signed in`);
      const ctx = await browser.newContext({ storageState: authFile(key) });
      const page = await ctx.newPage();
      await page.goto(path);
      await expect(page).toHaveURL(lands);
      await ctx.close();
    });
  }

  test('a school admin who is not a Sthara operator gets a plain 404 at /ops', async ({ browser }) => {
    test.skip(!account('admin') || !fs.existsSync(authFile('admin')), 'admin not signed in');
    const ctx = await browser.newContext({ storageState: authFile('admin') });
    const page = await ctx.newPage();
    const res = await page.goto('/ops');
    expect(res?.status()).toBe(404);
    await expect(page.getByText('Page not found.')).toBeVisible();
    await ctx.close();
  });
});

test.describe('APIs by role (real tokens)', () => {
  const cases: { who: RoleKey; method: string; url: string; body?: unknown; status: number; says?: RegExp }[] = [
    { who: 'teacher', method: 'POST', url: '/api/admin/fees', body: { action: 'payment' }, status: 403, says: /Only school office accounts/ },
    { who: 'student', method: 'POST', url: '/api/teacher/assignments', body: {}, status: 403, says: /Only teachers and school admins/ },
    { who: 'parent', method: 'GET', url: '/api/staff/messages', status: 403 },
    { who: 'student', method: 'GET', url: '/api/parent/desk', status: 403, says: /Only parent accounts/ },
    { who: 'parent', method: 'POST', url: '/api/student/submit-typed', body: {}, status: 403, says: /Only students submit homework/ },
    { who: 'teacher', method: 'POST', url: '/api/tutor/session', body: { action: 'start', topic: 'x' }, status: 403, says: /only students can run them/ },
    { who: 'student', method: 'POST', url: '/api/staff/ask', body: { question: 'x' }, status: 403 },
    { who: 'teacher', method: 'GET', url: '/api/ops/overview', status: 404 },
    { who: 'admin', method: 'GET', url: '/api/ops/schools', status: 404 },
    { who: 'parent', method: 'GET', url: '/api/ops/people', status: 404 },
    // Office permissions: a cashier records payments but cannot void, bill, approve concessions, close the day,
    // approve leave or manage access. Each is refused before any validation or write.
    { who: 'cashier', method: 'POST', url: '/api/admin/fees', body: { action: 'void_payment' }, status: 403, says: /doesn't allow this/ },
    { who: 'cashier', method: 'POST', url: '/api/admin/fees', body: { action: 'structure' }, status: 403, says: /doesn't allow this/ },
    { who: 'cashier', method: 'POST', url: '/api/admin/fees', body: { action: 'concession_decide' }, status: 403 },
    { who: 'cashier', method: 'POST', url: '/api/admin/fees', body: { action: 'day_close' }, status: 403 },
    { who: 'cashier', method: 'PATCH', url: '/api/admin/leave', body: {}, status: 403 },
    { who: 'cashier', method: 'POST', url: '/api/admin/access', body: {}, status: 403 },
    { who: 'cashier', method: 'PUT', url: '/api/admin/schedule/setup', body: {}, status: 403 },
    { who: 'cashier', method: 'POST', url: '/api/admin/probe', body: {}, status: 403 },
  ];

  for (const c of cases) {
    test(`${c.who}: ${c.method} ${c.url}${c.body && (c.body as { action?: string }).action ? ` (${(c.body as { action: string }).action})` : ''} is refused with ${c.status}`, async ({ browser, request }) => {
      const token = await tokenOf(browser, c.who);
      test.skip(!token, `${c.who} not configured`);
      const res = await call(request, token!, c.method, c.url, c.body);
      expect(res.status()).toBe(c.status);
      if (c.says) expect((await res.json()).error).toMatch(c.says);
    });
  }

  test('a school admin cannot read another school’s directory', async ({ browser, request }) => {
    const other = process.env.E2E_OTHER_SCHOOL_ID;
    test.skip(!other, 'Set E2E_OTHER_SCHOOL_ID to a school id that is not the test school.');
    const token = await tokenOf(browser, 'admin');
    test.skip(!token, 'admin not configured');
    const res = await call(request, token!, 'GET', `/api/admin/users?schoolId=${encodeURIComponent(other!)}`);
    expect([403, 404]).toContain(res.status());
  });
});
