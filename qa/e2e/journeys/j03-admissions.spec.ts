/**
 * TE.050 SIT-02 steps 1–4 (automated core): an enquiry moves through the admissions pipeline.
 * New enquiry → it opens on its own record at Enquiry → move to Application → reject with a reason
 * → it shows as Rejected with the reason in its history. (Enrolment itself needs a Sthara operator
 * to approve the logins, so it stays a manual step in SIT-02.)
 */
import { test, expect, requireJourney, as, open, RUN_ID } from './_journey';

test.describe.serial('SIT-02 Admissions: enquiry → application → rejected', () => {
  requireJourney('admin');
  const name = `${RUN_ID} Applicant`;
  const reason = `${RUN_ID} automated test, not a real applicant`;

  test('1–4. Office logs, moves and closes an applicant', async ({ browser }) => {
    const a = await as(browser, 'admin');
    await open(a.page, '/admin/admissions');

    await test.step('New enquiry with the required details', async () => {
      await a.page.getByRole('button', { name: /New enquiry/ }).click();
      await a.page.getByRole('button', { name: 'Add enquiry' }).click();
      await expect(a.page.getByRole('alert')).toBeVisible(); // nothing filled: refused with a message
      await a.page.getByLabel("APPLICANT'S FULL NAME").fill(name);
      await a.page.getByLabel('CLASS APPLIED FOR').selectOption('6');
      await a.page.getByLabel('PARENT OR GUARDIAN').fill(`${RUN_ID} Parent`);
      await a.page.getByLabel('MOBILE').fill('9800000000');
      await a.page.getByLabel('HOW THEY HEARD OF US').selectOption('website');
      await a.page.getByRole('button', { name: 'Add enquiry' }).click();
    });

    await test.step('It opens on its own record at the Enquiry stage', async () => {
      await expect(a.page.getByRole('button', { name: /Move to application/ })).toBeVisible();
    });

    await test.step('Move to Application', async () => {
      await a.page.getByRole('button', { name: /Move to application/ }).click();
      await expect(a.page.getByRole('button', { name: /Move to assessment/ })).toBeVisible();
    });

    await test.step('Reject: a reason is required, then it closes', async () => {
      await a.page.getByRole('button', { name: 'Reject', exact: true }).click();
      await expect(a.page.getByRole('button', { name: 'Confirm' })).toBeDisabled();
      await a.page.getByLabel('REASON FOR REJECTION').fill(reason);
      await a.page.getByRole('button', { name: 'Confirm' }).click();
      await expect(a.page.getByRole('button', { name: 'Reopen' })).toBeVisible();
      await expect(a.page.getByText(reason).first()).toBeVisible();
    });
    await a.done();
  });
});
