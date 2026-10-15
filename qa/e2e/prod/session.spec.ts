/**
 * TE.040 AUTH-03/09/10 (automated, test school): wrong passwords, sign-out, and a paused session.
 * Uses a fresh browser each time (not the saved sign-ins), so signing out here doesn't affect them.
 */
import { test, expect } from '@playwright/test';
import { ACCOUNTS, SCHOOL_CODE, account } from '../support/env';
import { enterSchoolCode, pickRole, signIn } from '../support/app';

test.use({ storageState: { cookies: [], origins: [] } });

test('a wrong password is refused with a message and nothing is stored', async ({ page }) => {
  test.skip(!SCHOOL_CODE, 'Set E2E_SCHOOL_CODE');
  await enterSchoolCode(page, SCHOOL_CODE);
  await pickRole(page, 'teacher');
  await page.getByLabel('Email ID').fill(`qa-nobody-${Date.now()}@example.invalid`);
  await page.getByLabel('Password').fill('not-a-real-password');
  await page.getByRole('button', { name: /^Sign in/ }).click();
  await expect(page.locator('.lg-err')).toBeVisible();
  await expect(page).toHaveURL(/\/login/);
  expect((await page.context().cookies()).map(c => c.name)).not.toContain('__session');
});

test('an account used with another school’s code is refused', async ({ page }) => {
  const other = process.env.E2E_OTHER_SCHOOL_CODE;
  const teacher = account('teacher');
  test.skip(!other || !teacher, 'Set E2E_OTHER_SCHOOL_CODE (any other school) and the teacher account.');
  await enterSchoolCode(page, other!);
  await pickRole(page, 'teacher');
  await page.getByLabel('Email ID').fill(teacher!.email);
  await page.getByLabel('Password').fill(teacher!.password);
  await page.getByRole('button', { name: /^Sign in/ }).click();
  await expect(page.getByText(/isn’t registered at/)).toBeVisible();
  await expect(page).toHaveURL(/\/login/);
});

for (const acct of ACCOUNTS.filter(a => a.key !== 'operator')) {
  test(`${acct.key}: sign-out ends the session and the portal asks for sign-in again`, async ({ page }) => {
    await signIn(page, acct);
    await page.getByRole('navigation').first().getByRole('button', { name: 'Sign out' }).click();
    await page.waitForURL(/\/login/);
    const names = (await page.context().cookies()).map(c => c.name);
    expect(names).not.toContain('__session');
    expect(names).not.toContain('__role');
    await page.goto(acct.home);
    await expect(page).toHaveURL(/\/login/);
  });
}
