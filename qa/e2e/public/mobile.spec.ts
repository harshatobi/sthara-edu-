/** TE.040 NFR-UX-01 (automated part): sign-in works on a phone: no sideways scroll, card on screen, 16px inputs (no iOS zoom). */
import { test, expect } from '@playwright/test';
import { DEMO_CODE, IS_LOCAL, TEST_SCHOOL_CODE } from '../support/env';
import { enterSchoolCode, pickRole } from '../support/app';

test('sign-in fits a phone screen at every step', async ({ page }) => {
  await page.goto('/login');
  const noSideScroll = async () => expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  await noSideScroll();
  const input = page.getByPlaceholder('School code');
  await expect(input).toBeInViewport();
  expect(parseFloat(await input.evaluate(el => getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(16);
  // The demo code only works on a local dev server; a deployment (production, preview) refuses it by design.
  await enterSchoolCode(page, IS_LOCAL ? DEMO_CODE : TEST_SCHOOL_CODE);
  await noSideScroll();
  await pickRole(page, 'parent');
  await noSideScroll();
  await expect(page.getByLabel('Email ID')).toBeInViewport();
});
