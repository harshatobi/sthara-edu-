/**
 * Signs each configured test-school account in through the real sign-in form, once, and saves
 * the browser state to .auth/<role>.json for the prod and journeys projects.
 * Refuses to type a password unless the school code resolves to a school whose name matches
 * E2E_SCHOOL_NAME_PATTERN (see support/app.ts `signIn`).
 */
import { test as setup, expect } from '@playwright/test';
import fs from 'node:fs';
import { ACCOUNTS, AUTH_DIR, IS_LOCAL, SCHOOL_CODE, authFile } from '../support/env';
import { signIn } from '../support/app';

setup.skip(IS_LOCAL, 'The test-school suites run against a deployed environment (set E2E_BASE_URL).');
setup.skip(!SCHOOL_CODE || !ACCOUNTS.length, 'Set E2E_SCHOOL_CODE and at least one E2E_<ROLE>_EMAIL / _PASSWORD in e2e.env.');

fs.mkdirSync(AUTH_DIR, { recursive: true });

for (const acct of ACCOUNTS) {
  setup(`sign in: ${acct.key}`, async ({ page }) => {
    await signIn(page, acct);
    await expect(page).toHaveURL(new RegExp(`${acct.home}(/|$|\\?)`));
    await page.context().storageState({ path: authFile(acct.key) });
  });
}
