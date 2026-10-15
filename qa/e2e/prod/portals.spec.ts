/**
 * TE.040 NFR-REG-02 (automated, test school, read-only): each signed-in role opens every page of
 * its portal. A page passes when it renders its heading, shows no failure screen, throws nothing,
 * and none of the app's own API calls answer with a server error. Nothing is written.
 */
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { navigation } from '../../tools/inventory';
import { ACCOUNTS, authFile, type Account } from '../support/env';
import { expectPageHealthy, watchHealth } from '../support/app';

const PORTAL_OF: Record<string, string> = { admin: 'admin', teacher: 'teacher', student: 'student', parent: 'parent', operator: 'ops', cashier: 'admin', teacher2: 'teacher' };
const NAV_LABEL: Record<string, string> = { admin: 'Admin navigation', teacher: 'Teacher navigation', student: 'Student navigation', parent: 'Parent navigation', ops: 'Platform Manager' };

function sweep(acct: Account) {
  const portal = PORTAL_OF[acct.key];
  test.describe(`${acct.key}: every page of the ${portal} portal`, () => {
    test.use({ storageState: authFile(acct.key) });
    test.skip(!fs.existsSync(authFile(acct.key)), `${acct.key} did not sign in (see prod-setup).`);

    for (const item of navigation().filter(n => n.portal === portal)) {
      test(`${item.label} (${item.href})`, async ({ page }, info) => {
        const health = watchHealth(page, info);
        await page.goto(item.href);
        await expect(page).toHaveURL(new RegExp(`${item.href}(\\?|$)`));
        await expect(page.locator('main h1, main h2').first()).toBeVisible();
        await expectPageHealthy(page);
        await page.waitForLoadState('networkidle').catch(() => undefined);
        health.assertClean();
      });
    }
  });
}

for (const acct of ACCOUNTS.filter(a => a.key !== 'cashier')) sweep(acct);

test.describe('cashier: the menu shows only what the Cashier role allows', () => {
  const cashier = ACCOUNTS.find(a => a.key === 'cashier');
  test.skip(!cashier, 'Set E2E_CASHIER_EMAIL / _PASSWORD (an office account holding only the Cashier role).');
  test.use({ storageState: authFile('cashier') });

  test('Dashboard, Fees and Schedule, nothing else', async ({ page }) => {
    await page.goto('/admin');
    const nav = page.getByRole('navigation', { name: 'Admin navigation' });
    await expect(nav.getByRole('link', { name: 'Fees' })).toBeVisible();
    const labels = (await nav.getByRole('link').allInnerTexts()).map(t => t.trim()).filter(Boolean);
    expect(labels).toEqual(['Dashboard', 'Fees', 'Schedule']);
  });

  test('evidence for TE.040 ADM-ACC-06: pages outside the role, opened by typed address', async ({ page }, info) => {
    // A cashier holds no academics, workforce, compliance or access permission. Each page must open
    // without crashing; whether it shows school data is judged by the tester from these screenshots
    // (script ADM-ACC-06). The legacy pages (results, vault, heat map) are OBS-006.
    for (const href of ['/admin/staff', '/admin/academic', '/admin/compliance', '/admin/access', '/admin/results', '/admin/vault', '/admin/heatmap']) {
      await page.goto(href);
      await expectPageHealthy(page);
      await page.waitForLoadState('networkidle').catch(() => undefined);
      await info.attach(`cashier ${href}`, { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
    }
  });
});
