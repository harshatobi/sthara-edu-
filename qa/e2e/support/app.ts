/** Page helpers shared by every end-to-end spec. Locators use what a user sees: labels, roles and text. */
import { expect, type Page, type Response, type TestInfo } from '@playwright/test';
import { SCHOOL_CODE, SCHOOL_NAME_PATTERN, type Account } from './env';

export const ROLE_LABEL = { student: 'Student', teacher: 'Teacher', admin: 'Admin', parent: 'Parent' } as const;
export const ROLE_SUB = { student: 'Honest Desk', teacher: 'Teaching Copilot', admin: 'Command Centre', parent: 'Growth Feed' } as const;

/** Text that only appears when a page, or the data behind it, failed. */
export const FAILURE_TEXT = [
  "This page didn't load.", 'This page didn’t load.', 'This teacher view could not load',
  'We couldn’t open your workspace', "We couldn't open your workspace",
  'Messages didn’t load', 'Your family’s records didn’t load', 'Application error', 'Unhandled Runtime Error',
];

export async function enterSchoolCode(page: Page, code: string) {
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: 'Welcome' })).toBeVisible();
  await page.getByPlaceholder('School code').fill(code);
  await page.getByRole('button', { name: /Continue/ }).click();
}

export async function pickRole(page: Page, role: keyof typeof ROLE_LABEL) {
  await expect(page.getByRole('heading', { name: 'Select your role' })).toBeVisible();
  await page.getByRole('button', { name: new RegExp(`^${ROLE_LABEL[role]}\\b`) }).click();
  await expect(page.getByRole('heading', { name: `Sign in as ${ROLE_LABEL[role]}` })).toBeVisible();
}

/**
 * Signs in through the real form. Refuses to type a password unless the school the code
 * resolved to matches SCHOOL_NAME_PATTERN (the test school), so a wrong code can't touch a real school.
 */
export async function signIn(page: Page, acct: Account) {
  if (!SCHOOL_CODE) throw new Error('Set E2E_SCHOOL_CODE to the test school’s code.');
  await enterSchoolCode(page, SCHOOL_CODE);
  await expect(page.getByRole('heading', { name: 'Select your role' })).toBeVisible();
  const school = (await page.locator('.lg-card .sub').first().innerText()).trim();
  if (!SCHOOL_NAME_PATTERN.test(school)) {
    throw new Error(`Refusing to sign in: code ${SCHOOL_CODE} is "${school}", which doesn't look like the test school (E2E_SCHOOL_NAME_PATTERN).`);
  }
  await pickRole(page, acct.loginRole);
  await page.getByLabel('Email ID').fill(acct.email);
  await page.getByLabel('Password').fill(acct.password);
  await page.getByRole('button', { name: /^Sign in/ }).click();
  await page.waitForURL(u => u.pathname.startsWith(acct.home), { timeout: 30_000 });
  await expectPageHealthy(page);
}

/**
 * Collects what a user would experience as broken: uncaught exceptions and 5xx answers from the
 * app's own APIs. Call `assertClean()` at the end of a test.
 */
export function watchHealth(page: Page, info?: TestInfo) {
  const problems: string[] = [];
  page.on('pageerror', err => problems.push(`uncaught: ${err.message.split('\n')[0]}`));
  page.on('response', (res: Response) => {
    const url = new URL(res.url());
    if (res.status() >= 500 && url.pathname.startsWith('/api/') && url.pathname !== '/api/health') {
      problems.push(`${res.request().method()} ${url.pathname} -> ${res.status()}`);
    }
  });
  return {
    problems,
    assertClean() {
      if (info && problems.length) info.annotations.push({ type: 'problems', description: problems.join('\n') });
      expect(problems, 'uncaught errors or server errors while using the page').toEqual([]);
    },
  };
}

/** The page rendered, and isn't an error boundary or a failed-load screen. */
export async function expectPageHealthy(page: Page) {
  await page.waitForLoadState('domcontentloaded');
  for (const t of FAILURE_TEXT) await expect(page.getByText(t, { exact: false }), `"${t}" on ${page.url()}`).toHaveCount(0);
}

/** The access token of a signed-in page (the __session cookie), for calling APIs as that person. */
export async function accessToken(page: Page): Promise<string> {
  const c = (await page.context().cookies()).find(k => k.name === '__session');
  if (!c?.value) throw new Error('No __session cookie: not signed in.');
  return decodeURIComponent(c.value);
}

/** Dates as the app's date inputs take them. */
export const isoDay = (d: Date) => d.toISOString().slice(0, 10);
/** The next weekday at least `days` ahead (Monday–Friday), so leave and cover land on a school day. */
export function schoolDayAhead(days: number): string {
  const d = new Date(Date.now() + days * 86_400_000);
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() + 1);
  return isoDay(d);
}
