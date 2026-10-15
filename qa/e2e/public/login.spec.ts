/**
 * TE.040 AUTH-01..05 (automated part): the three-step sign-in form. School code, then role,
 * then ID and password. Runs against any environment; no account is signed in here.
 * Uses the live test school's code (looked up in the database). The old demo code SCH-VSN-2026
 * works in local development only; elsewhere it must be refused like any unknown code.
 */
import { test, expect } from '@playwright/test';
import { DEMO_CODE, TEST_SCHOOL, TEST_SCHOOL_CODE } from '../support/env';
import { ROLE_LABEL, ROLE_SUB, enterSchoolCode, pickRole, watchHealth } from '../support/app';

test.describe('Sign-in: school code step', () => {
  test('sign-in opens at the school code step', async ({ page }, info) => {
    const health = watchHealth(page, info);
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: 'Welcome' })).toBeVisible();
    await expect(page.getByText('Enter your school code to continue.')).toBeVisible();
    await expect(page.getByPlaceholder('School code')).toBeFocused();
    await expect(page.getByRole('button', { name: /Continue/ })).toBeEnabled();
    await expect(page.getByRole('heading', { name: 'The Unified School OS' })).toBeVisible();
    health.assertClean();
  });

  test('an empty school code is refused with a message', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('button', { name: /Continue/ }).click();
    await expect(page.getByText('Enter your school code.')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Welcome' })).toBeVisible();
  });

  test('spaces alone count as an empty code', async ({ page }) => {
    await page.goto('/login');
    await page.getByPlaceholder('School code').fill('    ');
    await page.getByPlaceholder('School code').press('Enter');
    await expect(page.getByText('Enter your school code.')).toBeVisible();
  });

  test('an unknown school code is refused and the form stays on the code step', async ({ page }) => {
    await enterSchoolCode(page, 'ZZQA-NO-SUCH-SCHOOL');
    await expect(page.locator('.lg-err')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Welcome' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Select your role' })).toHaveCount(0);
  });

  test('the code is case-insensitive and trimmed', async ({ page }) => {
    await enterSchoolCode(page, `  ${TEST_SCHOOL_CODE.toLowerCase()}  `);
    await expect(page.getByRole('heading', { name: 'Select your role' })).toBeVisible();
    await expect(page.getByText(TEST_SCHOOL)).toBeVisible();
  });

  test('the local-development demo code is refused outside development', async ({ page }) => {
    await enterSchoolCode(page, DEMO_CODE);
    await expect(page.locator('.lg-err')).toBeVisible();
    await expect(page.getByText('Sthara Demo School')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Select your role' })).toHaveCount(0);
  });

  test('privacy and terms are real links', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('link', { name: 'Privacy Policy' })).toHaveAttribute('href', '/privacy');
    await expect(page.getByRole('link', { name: 'Terms of Service' })).toHaveAttribute('href', '/terms');
  });

  test('new schools are sent to the paid pilot section of the website', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('link', { name: /Book a paid pilot/ })).toHaveAttribute('href', '/#pricing');
  });
});

test.describe('Sign-in: role and credentials steps', () => {
  test('the four roles are offered with their desk names', async ({ page }) => {
    await enterSchoolCode(page, TEST_SCHOOL_CODE);
    for (const r of Object.keys(ROLE_LABEL) as (keyof typeof ROLE_LABEL)[]) {
      const card = page.getByRole('button', { name: new RegExp(`^${ROLE_LABEL[r]}\\b`) });
      await expect(card).toBeVisible();
      await expect(card).toContainText(ROLE_SUB[r]);
    }
  });

  for (const r of Object.keys(ROLE_LABEL) as (keyof typeof ROLE_LABEL)[]) {
    test(`${ROLE_LABEL[r]}: the credentials form names the school and desk, and back returns to the roles`, async ({ page }) => {
      await enterSchoolCode(page, TEST_SCHOOL_CODE);
      await pickRole(page, r);
      await expect(page.getByText(`${TEST_SCHOOL} · ${ROLE_SUB[r]}`)).toBeVisible();
      await expect(page.getByLabel('Email ID')).toBeFocused();
      await expect(page.getByLabel('Password')).toHaveAttribute('type', 'password');
      await page.getByRole('button', { name: 'Back to role selection' }).click();
      await expect(page.getByRole('heading', { name: 'Select your role' })).toBeVisible();
      await page.getByRole('button', { name: 'Back to school code' }).click();
      await expect(page.getByRole('heading', { name: 'Welcome' })).toBeVisible();
      await expect(page.getByPlaceholder('School code')).toHaveValue(TEST_SCHOOL_CODE);
    });
  }

  test('signing in with no ID or password is refused before anything is sent', async ({ page }) => {
    await enterSchoolCode(page, TEST_SCHOOL_CODE);
    await pickRole(page, 'teacher');
    let authCalls = 0;
    page.on('request', r => { if (/\/auth\/v1\/token/.test(r.url())) authCalls++; });
    await page.getByRole('button', { name: /^Sign in/ }).click();
    await expect(page.getByText('Enter your ID and password.')).toBeVisible();
    await page.getByLabel('Email ID').fill('someone@example.com');
    await page.getByRole('button', { name: /^Sign in/ }).click();
    await expect(page.getByText('Enter your ID and password.')).toBeVisible();
    expect(authCalls).toBe(0);
  });

  test('picking another role clears what was typed', async ({ page }) => {
    await enterSchoolCode(page, TEST_SCHOOL_CODE);
    await pickRole(page, 'teacher');
    await page.getByLabel('Email ID').fill('typed@example.com');
    await page.getByRole('button', { name: 'Back to role selection' }).click();
    await pickRole(page, 'parent');
    await expect(page.getByLabel('Email ID')).toHaveValue('');
    await expect(page.getByLabel('Password')).toHaveValue('');
  });
});

test.describe('Sign-in: fixed defects (regression checks)', () => {
  test('DEF-002 (fixed): "Forgot password?" says how to get a new password', async ({ page }) => {
    await enterSchoolCode(page, TEST_SCHOOL_CODE);
    await pickRole(page, 'teacher');
    await page.getByRole('button', { name: 'Forgot password?' }).click();
    await expect(page.getByText(/Ask your school office/)).toBeVisible();
  });

  test('DEF-003 (fixed): the privacy policy and terms are linked from sign-in', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('link', { name: 'Privacy Policy' })).toHaveAttribute('href', /privacy/, { timeout: 3_000 });
    await expect(page.getByRole('link', { name: 'Terms of Service' })).toHaveAttribute('href', /terms/, { timeout: 3_000 });
  });
});
