import { test, expect } from '@playwright/test';

test.describe('Forgot Password Flow', () => {

  test('Shows error when email is empty', async ({ page }) => {
    await page.goto('http://localhost:3000/login');
    
    // Quick navigate to credentials
    const schoolInput = page.getByPlaceholder('e.g. DPS101');
    await schoolInput.fill('ADMIN');
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByRole('button', { name: /student/i }).click();

    // Click Forgot Password without entering email
    await page.getByRole('button', { name: 'Forgot Password?' }).click();
    
    // Assert error message
    await expect(page.getByText('Please enter your email first')).toBeVisible();
  });

  test('Shows success message and sends email when email is provided', async ({ page }) => {
    await page.goto('http://localhost:3000/login');
    
    // Quick navigate to credentials
    const schoolInput = page.getByPlaceholder('e.g. DPS101');
    await schoolInput.fill('ADMIN');
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByRole('button', { name: /student/i }).click();

    // Mock Firebase auth password reset API
    await page.route('**/*identitytoolkit.googleapis.com/v1/accounts:sendOobCode**', async route => {
      const json = { email: 'test@example.com' };
      await route.fulfill({ json });
    });

    // Enter email and click Forgot Password
    await page.getByPlaceholder('Email Address').fill('test@example.com');
    await page.getByRole('button', { name: 'Forgot Password?' }).click();
    
    // Assert success message
    await expect(page.getByText('Password reset email sent!')).toBeVisible();
  });
});
