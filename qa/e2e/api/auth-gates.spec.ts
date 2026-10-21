/**
 * TE.040 NFR-SEC-01 (automated): the API gate sweep.
 *
 * Every route and method in src/app/api is found from the source on each run (tools/inventory.ts),
 * so a route added tomorrow is swept tomorrow without anyone editing this file. Each one is called
 * with no credentials and with a forged token, and must refuse: 401 for school routes, a plain 404
 * for the operator console (its existence isn't revealed), 401/403 for the cron, device and WhatsApp
 * endpoints. A 2xx means an open route; a 5xx means the gate isn't the first thing the route does.
 * Neither may leak a stack trace.
 */
import { test, expect, type APIResponse } from '@playwright/test';
import { apiRoutes, sampleUrl } from '../../tools/inventory';
import { IS_LOCAL } from '../support/env';

const routes = apiRoutes();
const FORGED = 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIwMDAwMDAwMC0wMDAwLTAwMDAtMDAwMC0wMDAwMDAwMDAwMDAiLCJyb2xlIjoiYXV0aGVudGljYXRlZCJ9.Zm9yZ2VkLXNpZ25hdHVyZS1ub3QtdmFsaWQ';

async function call(request: import('@playwright/test').APIRequestContext, method: string, url: string, auth?: string): Promise<APIResponse> {
  const headers: Record<string, string> = { 'content-type': 'application/json', 'x-forwarded-for': `10.0.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` };
  if (auth) headers.authorization = auth;
  return request.fetch(url, { method, headers, data: method === 'GET' ? undefined : '{}', maxRedirects: 0, failOnStatusCode: false });
}

async function expectNoLeak(res: APIResponse, label: string) {
  const body = await res.text();
  expect(body, `${label} leaks a stack trace`).not.toMatch(/\n\s+at \S+ \(|node_modules\/|\.tsx?:\d+:\d+/);
  expect(body, `${label} leaks a key`).not.toMatch(/service_role|SUPABASE_SERVICE_ROLE_KEY|GEMINI_API_KEY|sk-[A-Za-z0-9]{20}/);
}

test('the sweep found the whole API, and every route has a known guard', () => {
  expect(routes.length).toBeGreaterThanOrEqual(80);
  const unguarded = routes.filter(r => r.guard === 'unguarded').map(r => r.route);
  expect(unguarded, 'routes with no recognised guard (add a guard, or list them as public in tools/inventory.ts)').toEqual([]);
  const noMethods = routes.filter(r => !r.methods.length).map(r => r.route);
  expect(noMethods, 'route files exporting no handler').toEqual([]);
});

for (const r of routes) {
  for (const method of r.methods) {
    const expected = r.anonymous[method];
    const label = `${method} ${r.route}`;

    test(`${label} [${r.guard}] refuses a caller with no credentials`, async ({ request }) => {
      const res = await call(request, method, sampleUrl(r.route));
      expect(expected, `${label}: expected statuses`).toContain(res.status());
      await expectNoLeak(res, label);
    });

    if (r.guard === 'public') continue;
    test(`${label} [${r.guard}] refuses a forged token`, async ({ request }) => {
      // Locally there is no service key: a device token that gets as far as the database lookup can't be checked.
      test.skip(IS_LOCAL && r.guard === 'device', 'Needs the database to look the device token up.');
      const res = await call(request, method, sampleUrl(r.route), FORGED);
      // Operator routes and hidden machine routes (the import worker) answer 404, as if there were no route.
      const allowed = r.guard === 'operator' || expected.includes(404) ? [404] : r.guard === 'meta' ? expected : [401, 403];
      expect(allowed, `${label} with a forged token: got ${res.status()}`).toContain(res.status());
      await expectNoLeak(res, label);
    });
  }
}

test('operator routes answer a stranger exactly like a route that does not exist', async ({ request }) => {
  const real = await call(request, 'GET', '/api/ops/overview');
  const missing = await call(request, 'GET', '/api/ops/qa-no-such-route');
  expect(real.status()).toBe(404);
  expect(missing.status()).toBe(404);
  expect(await real.text()).not.toMatch(/operator|superadmin|unauthori[sz]ed/i);
});
