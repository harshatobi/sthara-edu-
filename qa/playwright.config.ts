import { defineConfig, devices } from '@playwright/test';
import { BASE_URL, IS_LOCAL } from './e2e/support/env';
import { ROOT } from './tools/inventory';

/**
 * Projects
 *   public    sign-in form, routing, not-found, marketing pages and their headers (no account needed)
 *   api       every API route refuses callers without a valid session; the open endpoints behave
 *   warmup    local only: compiles every page once so the demo checks aren't timed against the compiler
 *   demo      local only: every portal page opens in the app's development demo mode
 *   prod-*    the dedicated test school: signs each role in, then read-only checks of every page
 *   journeys  end-to-end business journeys across roles; they write records (E2E_ALLOW_WRITES=1)
 *   visual    each role's shell and home at desktop, tablet and phone widths against approved images
 *
 * Locally (E2E_BASE_URL unset or localhost) the app is started from its own folder with
 * `next dev` on port 3100. That only writes the app's gitignored .next cache; no source changes.
 */
const port = new URL(BASE_URL).port || '3100';

export default defineConfig({
  testDir: './e2e',
  outputDir: './reports/test-results',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  // One browser at a time: next dev compiles pages on demand, and prod runs share one test school.
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  forbidOnly: !!process.env.CI,
  reporter: [
    ['list'],
    ['html', { outputFolder: './reports/playwright', open: 'never' }],
    ['junit', { outputFile: './reports/junit/e2e.xml' }],
    ['json', { outputFile: './reports/e2e-results.json' }],
  ],
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    // Video needs Playwright's ffmpeg (npx playwright install ffmpeg); traces and screenshots don't.
    video: process.env.E2E_VIDEO === '1' ? 'retain-on-failure' : 'off',
    // The installed Google Chrome: nothing to download. E2E_BROWSER=chromium uses Playwright's own build.
    ...(process.env.E2E_BROWSER === 'chromium' ? {} : { channel: 'chrome' }),
    locale: 'en-IN',
    timezoneId: 'Asia/Kolkata',
  },
  projects: [
    { name: 'public', testDir: './e2e/public', testIgnore: /mobile\.spec\.ts/, use: { ...devices['Desktop Chrome'] } },
    { name: 'public-mobile', testDir: './e2e/public', testMatch: /mobile\.spec\.ts/, use: { ...devices['Pixel 7'] } },
    { name: 'api', testDir: './e2e/api' },
    { name: 'warmup', testDir: './e2e/warmup' },
    { name: 'demo', testDir: './e2e/demo', dependencies: ['warmup'], retries: IS_LOCAL ? 1 : 0, use: { ...devices['Desktop Chrome'] } },
    { name: 'prod-setup', testDir: './e2e/prod', testMatch: /auth\.setup\.ts/ },
    { name: 'prod', testDir: './e2e/prod', testIgnore: /auth\.setup\.ts/, dependencies: ['prod-setup'], use: { ...devices['Desktop Chrome'] } },
    { name: 'journeys', testDir: './e2e/journeys', dependencies: ['prod-setup'], use: { ...devices['Desktop Chrome'] } },
    { name: 'visual', testDir: './e2e/visual', dependencies: ['prod-setup'], use: { ...devices['Desktop Chrome'] } },
  ].map(p => ({ ...p, use: { ...p.use, ...(process.env.E2E_BROWSER === 'chromium' ? {} : { channel: 'chrome' }) } })),
  webServer: IS_LOCAL && !process.env.E2E_NO_SERVER ? {
    command: `npx next dev -p ${port}`,
    cwd: ROOT,
    url: `${BASE_URL}/login`,
    reuseExistingServer: true,
    timeout: 240_000,
    stdout: 'ignore',
    stderr: 'pipe',
  } : undefined,
});
