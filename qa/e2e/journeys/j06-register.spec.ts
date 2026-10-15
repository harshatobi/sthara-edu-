/**
 * TE.050 SIT-11 step 1 (automated core): the class register, taken by the class teacher and seen
 * by the family. Teacher opens today's register → Mark all present → saves → the parent's
 * Attendance & Calendar page opens with this month's register.
 * Skipped on Sundays (no register is expected).
 */
import { test, expect, requireJourney, as, open } from './_journey';
import { TEST_CLASS } from '../support/env';

test.describe.serial('SIT-11 Register: teacher marks today → family calendar', () => {
  requireJourney('teacher', 'parent');
  test.skip(new Date().toLocaleDateString('en-IN', { weekday: 'long', timeZone: 'Asia/Kolkata' }) === 'Sunday', 'No register on Sundays.');

  test('1. The class teacher marks everyone present and saves', async ({ browser }) => {
    const t = await as(browser, 'teacher');
    await open(t.page, '/teacher/attendance');
    if (TEST_CLASS) await t.page.getByLabel('Class').selectOption({ label: TEST_CLASS });
    await t.page.getByRole('button', { name: 'Today' }).click();
    await t.page.getByRole('button', { name: 'Mark all present' }).click();
    const save = t.page.getByRole('button', { name: /Save register|Save changes|Saved/ });
    if (await save.isEnabled()) {
      await save.click();
      await expect(t.page.getByText(/Register saved/)).toBeVisible({ timeout: 20_000 });
    }
    await expect(t.page.getByRole('button', { name: 'Saved' })).toBeVisible();
    await t.done();
  });

  test('2. The parent’s calendar shows this month’s register', async ({ browser }) => {
    const p = await as(browser, 'parent');
    await open(p.page, '/parent/attendance');
    await expect(p.page.getByLabel('Attendance this month')).toBeVisible();
    await p.done();
  });
});
