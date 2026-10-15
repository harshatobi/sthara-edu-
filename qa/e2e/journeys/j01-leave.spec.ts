/**
 * TE.050 SIT-08 (automated core): leave, teacher to office and back.
 * Teacher applies for a day of casual leave → it shows as awaiting approval → the school office
 * rejects it with a reason → the teacher sees it as not approved, with the office's reason.
 * Rejecting keeps the test school's leave balances and cover board untouched.
 */
import { test, expect, requireJourney, as, open, RUN_ID } from './_journey';
import { schoolDayAhead } from '../support/app';

test.describe.serial('SIT-08 Leave: apply → decide → teacher sees the decision', () => {
  requireJourney('teacher', 'admin');
  const day = schoolDayAhead(75);
  const reason = `${RUN_ID} automated leave test, please ignore`;
  const note = `${RUN_ID} rejected by the automated test`;

  test('1. Teacher applies for one day of casual leave', async ({ browser }) => {
    const t = await as(browser, 'teacher');
    await open(t.page, '/teacher/leave');
    await t.page.getByLabel('LEAVE TYPE').selectOption('casual');
    await t.page.getByLabel('FROM').fill(day);
    await t.page.getByLabel('TO').fill(day);
    await t.page.getByLabel('REASON').fill(reason);
    await t.page.getByRole('button', { name: 'Send for approval' }).click();
    await expect(t.page.getByText('Leave request sent')).toBeVisible();
    const row = t.page.locator('.row', { hasText: reason });
    await expect(row).toContainText('AWAITING APPROVAL');
    await t.done();
  });

  test('2. The office sees the request with the reason and rejects it with a note', async ({ browser }) => {
    const a = await as(browser, 'admin');
    await open(a.page, '/admin/staff');
    const card = a.page.locator('div', { has: a.page.getByText(`“${reason}”`) }).filter({ has: a.page.getByRole('button', { name: 'Reject' }) }).last();
    await expect(card).toBeVisible();
    await card.getByRole('button', { name: 'Reject' }).click();
    await a.page.getByPlaceholder('Reason the teacher will see').fill(note);
    await a.page.getByRole('button', { name: 'Confirm reject' }).click();
    await expect(a.page.getByText(`“${reason}”`)).toHaveCount(0, { timeout: 20_000 });
    await a.done();
  });

  test('3. The teacher sees it as not approved, with the office’s reason', async ({ browser }) => {
    const t = await as(browser, 'teacher');
    await open(t.page, '/teacher/leave');
    const row = t.page.locator('.row', { hasText: reason });
    await expect(row).toContainText('NOT APPROVED');
    await expect(row).toContainText(`Office: “${note}”`);
    await expect(row.getByRole('button', { name: 'Withdraw' })).toHaveCount(0);
    await t.done();
  });
});
