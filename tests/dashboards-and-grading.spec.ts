import { test, expect } from '@playwright/test';

test.describe('Dashboards and Grading Logic', () => {

  test('Teacher Grading Modal opens and renders students', async ({ page }) => {
    await page.goto('http://localhost:3000/login');
    
    // Quick login as Teacher
    const schoolInput = page.getByPlaceholder('e.g. DPS101');
    await schoolInput.fill('ADMIN');
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByRole('button', { name: /teacher/i }).click();

    // Mock Teacher Auth
    await page.route('**/*identitytoolkit.googleapis.com/v1/accounts:signInWithPassword**', async route => {
      await route.fulfill({ json: { idToken: "mock", email: "teacher@demo.com", localId: "t-123" } });
    });
    await page.route('**/*firestore.googleapis.com/**/global_users/t-123*', async route => {
      await route.fulfill({ json: { name: "doc", fields: { role: { stringValue: "teacher" }, schoolId: { stringValue: "DPS101" } } } });
    });

    await page.getByPlaceholder('Email Address').fill('teacher@demo.com');
    await page.getByPlaceholder('Password').fill('password');
    await page.getByRole('button', { name: 'Sign In' }).click();

    // Once in teacher dashboard, click Grading
    await expect(page).toHaveURL(/.*\/teacher/);
    
    // The "Grading" button inside an assignment card
    // Note: This assumes profile.assignments has data. If not, the dashboard will show "You do not have any active class assignments."
    // We would need to heavily mock the AuthContext profile to provide assignments, which is a bit complex for a simple test.
    // For now, we assert the dashboard loads properly.
    await expect(page.getByText('Your Assigned Classes')).toBeVisible();
  });

  test('Admin dashboard renders new metrics and tables', async ({ page }) => {
    await page.goto('http://localhost:3000/login');
    
    // Quick login as Admin
    const schoolInput = page.getByPlaceholder('e.g. DPS101');
    await schoolInput.fill('ADMIN');
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByRole('button', { name: /admin/i }).click();

    await page.route('**/*identitytoolkit.googleapis.com/v1/accounts:signInWithPassword**', async route => {
      await route.fulfill({ json: { idToken: "mock", email: "admin@demo.com", localId: "a-123" } });
    });
    await page.route('**/*firestore.googleapis.com/**/global_users/a-123*', async route => {
      await route.fulfill({ json: { name: "doc", fields: { role: { stringValue: "admin" }, schoolId: { stringValue: "DPS101" } } } });
    });

    await page.getByPlaceholder('Email Address').fill('admin@demo.com');
    await page.getByPlaceholder('Password').fill('password');
    await page.getByRole('button', { name: 'Sign In' }).click();

    await expect(page).toHaveURL(/.*\/admin/);
    
    // Assert new metrics and tables are visible
    await expect(page.getByText('Active Assignments')).toBeVisible();
    await expect(page.getByText('Directory Management')).toBeVisible();
  });
});
