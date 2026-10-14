/**
 * TE.050 SIT-06 steps 1–4 (automated core): a multiple-choice quiz is marked the moment it is
 * submitted, with no teacher review and no AI. Teacher posts a one-question quiz → the student
 * picks the right option and submits → the result shows as Graded 1/1 straight away → the teacher's
 * quiz shows one hand-in. (The proctoring half of SIT-06, three tab switches, stays manual.)
 */
import { test, expect, requireJourney, as, open, RUN_ID } from './_journey';
import { TEST_CLASS } from '../support/env';
import { isoDay } from '../support/app';

test.describe.serial('SIT-06 Quiz: post → answer → graded instantly', () => {
  requireJourney('teacher', 'student');
  const title = `${RUN_ID} quiz`;
  const due = isoDay(new Date(Date.now() + 7 * 86_400_000));

  test('1. Teacher posts a one-question multiple-choice quiz', async ({ browser }) => {
    const t = await as(browser, 'teacher');
    await open(t.page, '/teacher/quiz');
    await t.page.getByRole('button', { name: /New quiz/ }).click();
    const dialog = t.page.getByRole('dialog');
    await dialog.getByLabel('TITLE').fill(title);
    await dialog.getByLabel('DUE DATE').fill(due);
    if (TEST_CLASS) await dialog.getByLabel('CLASS').selectOption({ label: TEST_CLASS });
    await expect(dialog.getByRole('button', { name: /Short answer/ })).toHaveCount(0); // quizzes are multiple choice only
    await dialog.getByRole('button', { name: /Multiple choice/ }).click();
    await dialog.getByPlaceholder('Question').first().fill('2 + 2 = ?');
    for (const [i, v] of ['3', '4', '5', '22'].entries()) await dialog.getByPlaceholder(`Option ${'ABCD'[i]}`).first().fill(v);
    await dialog.getByTitle('Mark as the correct answer').nth(1).click();
    await dialog.getByRole('button', { name: /^Post to/ }).click();
    await expect(t.page.getByText(title).first()).toBeVisible({ timeout: 20_000 });
    await t.done();
  });

  test('2–3. The student answers correctly and is graded on submit', async ({ browser }) => {
    const s = await as(browser, 'student');
    await open(s.page, '/student/homework');
    const card = s.page.locator('div', { hasText: title }).filter({ has: s.page.getByRole('link', { name: /Open/ }) }).last();
    await card.getByRole('link', { name: /Open/ }).click();
    await s.page.getByRole('radio', { name: /4/ }).first().click();
    await s.page.getByRole('button', { name: /Review & submit/ }).click();
    await s.page.getByRole('button', { name: 'Submit assignment' }).click();
    await expect(s.page.getByRole('heading', { name: 'Graded' })).toBeVisible({ timeout: 20_000 });
    await expect(s.page.getByText('1/1').first()).toBeVisible();
    await s.done();
  });

  test('4. The teacher’s quiz shows the hand-in', async ({ browser }) => {
    const t = await as(browser, 'teacher');
    await open(t.page, '/teacher/quiz');
    const card = t.page.locator('div', { hasText: title }).filter({ has: t.page.getByRole('button', { name: /Open/ }) }).last();
    await expect(card).toContainText(/[1-9]\d*\/\d+ IN/);
    await t.done();
  });
});
