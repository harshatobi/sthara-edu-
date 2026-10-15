/**
 * TE.040 NFR-REG-01 (automated, local only): every page in every portal's menu opens without
 * crashing, in the app's development demo mode (sign-in's "Open local demo"; no database).
 * This is the smoke test to run before every release: a page that throws while rendering, or
 * hits an error boundary, fails here. Menus are read from the portals' own layout files.
 *
 * In development with no signed-in user, the Admin and Teacher layouts render their demo portals
 * (AdminDemoPortal, TeacherDemoPortal) instead of the real pages, so here those two portals prove
 * only that every URL renders the demo without crashing. Their real pages are covered by the
 * signed-in sweep of the test school (e2e/prod). Student and Parent use the real shell in demo mode.
 */
import { test, expect } from '@playwright/test';
import { navigation } from '../../tools/inventory';
import { DEMO_CODE, IS_LOCAL } from '../support/env';
import { ROLE_LABEL, enterSchoolCode, expectPageHealthy, pickRole } from '../support/app';

test.skip(!IS_LOCAL, 'Demo sign-in only exists in local development (next dev).');

const PORTALS = ['student', 'teacher', 'admin', 'parent'] as const;
/** Portals whose real shell renders in demo mode (the others show a demo portal). */
const REAL_SHELL = new Set(['student', 'parent']);
const nav = navigation();

for (const portal of PORTALS) {
  test.describe(`${ROLE_LABEL[portal]} portal (demo)`, () => {
    test.beforeEach(async ({ page }) => {
      await enterSchoolCode(page, DEMO_CODE);
      await pickRole(page, portal);
      await page.getByRole('button', { name: 'Open local demo' }).click();
      await page.waitForURL(u => u.pathname.startsWith(`/${portal}`), { timeout: 120_000, waitUntil: 'domcontentloaded' });
    });

    for (const item of nav.filter(n => n.portal === portal)) {
      test(`${item.label} (${item.href}) opens without errors`, async ({ page }) => {
        const crashes: string[] = [];
        page.on('pageerror', e => crashes.push(e.message.split('\n')[0]));
        const res = await page.goto(item.href, { waitUntil: 'domcontentloaded', timeout: 120_000 });
        expect(res?.status(), item.href).toBeLessThan(400);
        await expect(page).toHaveURL(new RegExp(`${item.href}(\\?|$)`));
        if (REAL_SHELL.has(portal)) await expect(page.getByRole('link', { name: 'Skip to content' })).toHaveCount(1);
        await expect(page.getByRole('main')).toBeVisible();
        await expectPageHealthy(page);
        await page.waitForTimeout(500);
        expect(crashes, `uncaught errors on ${item.href}`).toEqual([]);
      });
    }

    test('sign-out clears the session and returns to sign-in', async ({ page }) => {
      test.skip(!REAL_SHELL.has(portal), 'The demo portal\'s "Sign Out" is a plain link; the real sign-out is tested on the test school.');
      await page.getByRole('button', { name: 'Sign out' }).first().click();
      await page.waitForURL(/\/login/);
      const cookies = (await page.context().cookies()).map(c => c.name);
      expect(cookies).not.toContain('__role');
      await page.goto(`/${portal}`);
      await expect(page).toHaveURL(/\/login/);
    });
  });
}
