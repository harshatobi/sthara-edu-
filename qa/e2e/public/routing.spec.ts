/**
 * TE.040 AUTH-06/07, NFR-SEC-02/03 (automated part): what a signed-out visitor can reach.
 * Portals send them to sign-in, the operator console is a plain 404, unknown pages get the
 * Sthara not-found page, and the marketing site is served with its security headers.
 */
import { test, expect } from '@playwright/test';
import { pages } from '../../tools/inventory';

const PORTALS = ['/student', '/teacher', '/admin', '/parent'];

test.describe('Signed-out routing', () => {
  for (const p of PORTALS) {
    test(`${p} sends a signed-out visitor to sign-in and remembers where they were going`, async ({ page }) => {
      await page.goto(`${p}`);
      await expect(page).toHaveURL(new RegExp(`/login\\?redirect=${encodeURIComponent(p)}`));
      await expect(page.getByRole('heading', { name: 'Welcome' })).toBeVisible();
    });
  }

  test('every portal page (not only the home page) is behind sign-in', async ({ request }) => {
    const portalPages = pages().filter(p => PORTALS.some(x => p.route === x || p.route.startsWith(`${x}/`)) && !p.route.includes('['));
    expect(portalPages.length).toBeGreaterThan(30);
    for (const p of portalPages) {
      const res = await request.get(p.route, { maxRedirects: 0 });
      expect(res.status(), p.route).toBe(307);
      expect(res.headers()['location'], p.route).toContain('/login?redirect=');
    }
  });

  test('a forged role cookie without a session still goes to sign-in (outside development)', async ({ request, baseURL }) => {
    test.skip(/localhost|127\.0\.0\.1/.test(baseURL || ''), 'next dev lets the __role cookie stand in for a session (demo mode).');
    const res = await request.get('/admin', { maxRedirects: 0, headers: { cookie: '__role=admin' } });
    expect(res.status()).toBe(307);
    expect(res.headers()['location']).toContain('/login');
  });

  test('a school whose pilot ended or was paused is sent to the paused page', async ({ request }) => {
    for (const state of ['expired', 'suspended']) {
      const res = await request.get('/teacher', { maxRedirects: 0, headers: { cookie: `__session=x; __role=teacher; __trial_ok=${state}` } });
      expect(res.status(), state).toBe(307);
      expect(res.headers()['location'], state).toContain('/trial-expired');
    }
  });

  test('a signed-in role opening another portal is sent to its own', async ({ request }) => {
    const cases: [string, string, string][] = [
      ['teacher', '/admin', '/teacher'], ['student', '/teacher', '/student'], ['parent', '/admin/fees', '/parent'],
      ['admin', '/student', '/admin'], ['student', '/parent', '/student'],
    ];
    for (const [role, path, home] of cases) {
      const res = await request.get(path, { maxRedirects: 0, headers: { cookie: `__session=x; __role=${role}` } });
      expect(res.status(), `${role} -> ${path}`).toBe(307);
      expect(new URL(res.headers()['location'], 'http://x').pathname, `${role} -> ${path}`).toBe(home);
    }
  });

  test('the operator console is a plain 404 for anyone who is not an operator', async ({ page }) => {
    for (const p of ['/ops', '/ops/schools', '/ops/settings']) {
      const res = await page.goto(p);
      expect(res?.status(), p).toBe(404);
      await expect(page.getByText('Page not found.')).toBeVisible();
      await expect(page.getByText('Platform Manager')).toHaveCount(0);
    }
  });

  test('an unknown address shows the Sthara not-found page with a way back', async ({ page }) => {
    const res = await page.goto('/this-page-does-not-exist-qa');
    expect(res?.status()).toBe(404);
    await expect(page.getByText('Page not found.')).toBeVisible();
    await expect(page.getByRole('link', { name: /Sign in/ })).toBeVisible();
  });
});

test.describe('Public pages', () => {
  const MARKETING = ['/', '/about', '/privacy', '/dpdp', '/contact', '/for/students', '/for/teachers', '/for/administrators', '/for/parents'];

  test('the marketing site is served with its security headers', async ({ request }) => {
    for (const p of MARKETING) {
      const res = await request.get(p);
      expect(res.status(), p).toBe(200);
      const h = res.headers();
      expect(h['x-frame-options'], p).toBe('DENY');
      expect(h['x-content-type-options'], p).toBe('nosniff');
      expect(h['content-security-policy'], p).toContain("frame-ancestors 'none'");
      expect(h['referrer-policy'], p).toBe('strict-origin-when-cross-origin');
    }
  });

  test('robots.txt and the sitemap are published', async ({ request }) => {
    expect((await request.get('/robots.txt')).status()).toBe(200);
    const sitemap = await request.get('/sitemap.xml');
    expect(sitemap.status()).toBe(200);
    expect(await sitemap.text()).toContain('<urlset');
  });

  test('the onboarding page points new schools at the team and existing ones at sign-in', async ({ page }) => {
    await page.goto('/onboard');
    await expect(page.getByText('We set Sthara up with you')).toBeVisible();
    await expect(page.getByRole('link', { name: /Sign in/ })).toBeVisible();
  });

  test('the terms page and the TML whitepaper render', async ({ page, request }) => {
    for (const p of ['/terms', '/tml-whitepaper']) {
      expect((await request.get(p)).status(), p).toBe(200);
      // The whitepaper pulls its fonts from Google (OBS-009): wait for the page, not for every font.
      await page.goto(p, { waitUntil: 'domcontentloaded' });
      await expect(page.locator('body')).not.toContainText("This page didn't load.");
      await expect(page.locator('h1, h2').first()).toBeVisible();
    }
  });
});
