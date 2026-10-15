/**
 * TE.050 SIT-11 (automated core): a parent writes to the school office and gets a reply.
 * Parent → New message → School office → the office reads it in Parent Messages and replies →
 * the parent sees the reply in the same conversation.
 */
import { test, expect, requireJourney, as, open, RUN_ID } from './_journey';

test.describe.serial('SIT-11 Messages: parent → school office → reply → parent', () => {
  requireJourney('parent', 'admin');
  const subject = `${RUN_ID} test message`;
  const body = `${RUN_ID}: automated end-to-end test of parent messages. Please ignore.`;
  const reply = `${RUN_ID}: reply from the office (automated).`;

  test('1. Parent sends a message to the school office', async ({ browser }) => {
    const p = await as(browser, 'parent');
    await open(p.page, '/parent/messages');
    await p.page.getByRole('button', { name: /New message/ }).click();
    const to = p.page.locator('select').filter({ has: p.page.locator('option[value="office"]') });
    await to.selectOption('office');
    await p.page.getByLabel('SUBJECT').fill(subject);
    await p.page.getByLabel('MESSAGE').fill(body);
    await p.page.getByRole('button', { name: /^Send$/ }).click();
    await expect(p.page.getByText(body)).toBeVisible();
    await p.done();
  });

  test('2. The office finds it in Parent Messages and replies', async ({ browser }) => {
    const a = await as(browser, 'admin');
    await open(a.page, '/admin/messages');
    await a.page.getByText(subject).first().click();
    await expect(a.page.getByText(body)).toBeVisible();
    await a.page.locator('#st-reply').fill(reply);
    await a.page.getByRole('button', { name: 'Send reply' }).click();
    await expect(a.page.getByText(reply)).toBeVisible();
    await a.done();
  });

  test('3. The parent sees the reply in the same conversation', async ({ browser }) => {
    const p = await as(browser, 'parent');
    await open(p.page, '/parent/messages');
    await p.page.getByText(subject).first().click();
    await expect(p.page.getByText(body)).toBeVisible();
    await expect(p.page.getByText(reply)).toBeVisible();
    await p.done();
  });
});
