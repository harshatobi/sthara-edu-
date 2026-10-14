/**
 * TE.050 SIT-04 (automated core): homework to a confirmed grade the family can see.
 * Teacher posts typed homework with one short-answer question → the student sees it, answers and
 * submits → it waits for the teacher (written answers are never auto-marked) → the teacher marks it
 * and confirms → the student sees the confirmed grade and feedback → the parent sees it under
 * Recently graded. No AI is called anywhere in this journey.
 */
import { test, expect, requireJourney, as, open, RUN_ID } from './_journey';
import { TEST_CLASS, account } from '../support/env';
import { isoDay } from '../support/app';

test.describe.serial('SIT-04 Homework: post → submit → mark → confirm → student and parent see it', () => {
  requireJourney('teacher', 'student', 'parent');
  const title = `${RUN_ID} homework`;
  const question = 'In one line: why do plants need sunlight?';
  const answer = `${RUN_ID}: to make food by photosynthesis.`;
  const feedback = `${RUN_ID}: clear and correct.`;
  const due = isoDay(new Date(Date.now() + 7 * 86_400_000));

  test('1. Teacher posts typed homework to the class', async ({ browser }) => {
    const t = await as(browser, 'teacher');
    await open(t.page, '/teacher/homework');
    await t.page.getByRole('button', { name: /Assign homework/ }).click();
    const dialog = t.page.getByRole('dialog');
    await test.step('Posting with no title is refused', async () => {
      await dialog.getByRole('button', { name: /^Post to/ }).click();
      await expect(dialog.getByText('Give it a title.')).toBeVisible();
    });
    await dialog.getByLabel('TITLE').fill(title);
    await dialog.getByLabel('DUE DATE').fill(due);
    if (TEST_CLASS) await dialog.getByLabel('CLASS').selectOption({ label: TEST_CLASS });
    await dialog.getByRole('button', { name: 'Typed in the app' }).click();
    await test.step('Posting with no question is refused', async () => {
      await dialog.getByRole('button', { name: /^Post to/ }).click();
      await expect(dialog.getByText('Add at least one question before posting.')).toBeVisible();
    });
    await dialog.getByRole('button', { name: /Short answer/ }).click();
    await dialog.getByPlaceholder('Question').first().fill(question);
    await dialog.getByRole('button', { name: /^Post to/ }).click();
    await expect(t.page.getByText(title).first()).toBeVisible({ timeout: 20_000 });
    await t.done();
  });

  test('2. The student finds it, answers and submits; it waits for the teacher', async ({ browser }) => {
    const s = await as(browser, 'student');
    await open(s.page, '/student/homework');
    const card = s.page.locator('div', { hasText: title }).filter({ has: s.page.getByRole('link', { name: /Open/ }) }).last();
    await card.getByRole('link', { name: /Open/ }).click();
    await expect(s.page.getByText(question)).toBeVisible();
    await s.page.getByPlaceholder('Type your answer…').fill(answer);
    await s.page.getByRole('button', { name: /Review & submit/ }).click();
    await s.page.getByRole('button', { name: 'Submit assignment' }).click();
    await expect(s.page.getByRole('heading', { name: 'Submitted' })).toBeVisible({ timeout: 20_000 });
    await test.step('A second submission is not possible', async () => {
      await s.page.reload();
      await expect(s.page.getByRole('button', { name: /Review & submit/ })).toHaveCount(0);
    });
    await s.done();
  });

  test('3. The teacher marks it and confirms the grade', async ({ browser }) => {
    const t = await as(browser, 'teacher');
    await open(t.page, '/teacher/homework');
    const card = t.page.locator('div', { hasText: title }).filter({ has: t.page.getByRole('button', { name: /Open/ }) }).last();
    await card.getByRole('button', { name: /Open/ }).click();
    await t.page.getByTitle('Open submission').first().click();
    await expect(t.page.getByText(answer)).toBeVisible();
    await t.page.getByLabel('Marks for question 1').fill('1');
    await t.page.getByPlaceholder('What they did well, and what to work on next').fill(feedback);
    await t.page.getByRole('button', { name: /Confirm grade/ }).click();
    await expect(t.page.getByRole('button', { name: /Update grade/ })).toBeVisible({ timeout: 20_000 });
    await t.done();
  });

  test('4. The student sees the confirmed grade and the teacher’s feedback', async ({ browser }) => {
    const s = await as(browser, 'student');
    await open(s.page, '/student/homework');
    const row = s.page.locator('div', { hasText: title }).filter({ has: s.page.getByRole('button', { name: 'View report' }) }).last();
    await row.getByRole('button', { name: 'View report' }).click();
    await expect(s.page.getByText('From your teacher:')).toBeVisible();
    await expect(s.page.getByText(feedback)).toBeVisible();
    await expect(s.page.getByText(/Confirmed by your teacher/)).toBeVisible();
    await s.done();
  });

  test('5. The parent sees it under Recently graded', async ({ browser }) => {
    test.skip(!account('parent'), 'parent not configured');
    const p = await as(browser, 'parent');
    await open(p.page, '/parent');
    await expect(p.page.getByText(title).first()).toBeVisible({ timeout: 20_000 });
    await open(p.page, '/parent/schoolwork');
    await expect(p.page.getByText(title).first()).toBeVisible();
    await p.done();
  });
});
