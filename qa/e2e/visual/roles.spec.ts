/**
 * Dusk role colours (docs/handoffs/sthara-dusk-handoff.md), read-only: each role's shell and home page at
 * desktop, tablet and phone widths, compared with the approved baseline images in roles.spec.ts-snapshots/.
 *
 * The shell (sidebar, icon strip, phone tab bar) is compared exactly; the home page is compared with live
 * figures and dates masked, so a new mark or a new day doesn't fail it. Approve a new look with
 *   npx playwright test --project=prod-setup --project=visual --update-snapshots
 * against the deployment that carries it. Nothing is written.
 */
import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';
import { ACCOUNTS, authFile } from '../support/env';

const ROLES = ['student', 'teacher', 'admin', 'parent', 'operator'] as const;
const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'tablet', width: 820, height: 1180 },
  { name: 'phone', width: 390, height: 844 },
] as const;

/** Figures, dates and names that change from day to day. */
const live = (page: Page) => [
  page.locator('main .vl, main .num, main .chip, main .muted, main time, main .row, main td, main .bar, main .nt, main svg'),
  page.locator('.nb-dot'),
];

async function settle(page: Page) {
  await page.waitForLoadState('networkidle').catch(() => undefined);
  await expect(page.locator('main [aria-busy="true"], main .skel').first()).toHaveCount(0, { timeout: 20_000 }).catch(() => undefined);
  await page.evaluate(() => document.fonts.ready);
}

for (const key of ROLES) {
  const acct = ACCOUNTS.find(a => a.key === key);
  test.describe(`${key}: Dusk shell and home`, () => {
    test.skip(!acct || !fs.existsSync(authFile(key)), `${key} did not sign in (see prod-setup).`);
    test.use({ storageState: authFile(key), reducedMotion: 'reduce' });

    for (const vp of VIEWPORTS) {
      test(vp.name, async ({ page }) => {
        await page.setViewportSize({ width: vp.width, height: vp.height });
        await page.goto(acct!.home);
        await settle(page);

        const role = await page.locator('.canon').getAttribute('data-role');
        expect(role, 'the shell carries its role').toBe(key === 'operator' ? 'ops' : key);

        if (vp.name === 'phone') {
          await expect(page.locator('.canon .tabbar')).toHaveScreenshot(`${key}-tabbar.png`);
        } else {
          await expect(page.locator('.canon > aside')).toHaveScreenshot(`${key}-${vp.name}-sidebar.png`, { mask: [page.locator('.nb-dot')] });
        }
        await expect(page).toHaveScreenshot(`${key}-${vp.name}-home.png`, { mask: live(page), maxDiffPixelRatio: 0.02 });
      });
    }
  });
}
