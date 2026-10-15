/**
 * Shared set-up for the end-to-end journeys (TE.050). Each journey runs as signed-in people in the
 * test school, one browser context per person, and writes records tagged with RUN_ID so every
 * artefact of a run is easy to find in the app ("E2E-202609281030 …").
 */
import { test, expect, type Browser, type Page } from '@playwright/test';
import fs from 'node:fs';
import { ALLOW_WRITES, IS_LOCAL, RUN_ID, account, authFile, type RoleKey } from '../support/env';
import { expectPageHealthy, watchHealth } from '../support/app';

export { RUN_ID };

/** Skips the journey unless writes are allowed and every person it needs has signed in. */
export function requireJourney(...who: RoleKey[]) {
  test.skip(IS_LOCAL, 'Journeys run against the test school, not a local dev server.');
  test.skip(!ALLOW_WRITES, 'Journeys write records: set E2E_ALLOW_WRITES=1 (test school only).');
  for (const k of who) test.skip(!account(k) || !fs.existsSync(authFile(k)), `Needs the ${k} account (E2E_${k.toUpperCase()}_EMAIL / _PASSWORD).`);
}

/** A page signed in as `who`, with health watching attached. */
export async function as(browser: Browser, who: RoleKey): Promise<{ page: Page; done: () => Promise<void> }> {
  const ctx = await browser.newContext({ storageState: authFile(who) });
  const page = await ctx.newPage();
  const health = watchHealth(page, test.info());
  return { page, done: async () => { health.assertClean(); await ctx.close(); } };
}

export async function open(page: Page, path: string) {
  await page.goto(path);
  await expectPageHealthy(page);
}

export { test, expect };
