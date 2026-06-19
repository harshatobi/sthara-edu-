import { test, expect } from '@playwright/test';

test.describe('Continue Button Functional Tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:3000/login');
    await expect(page.getByText('Enter your school code to continue')).toBeVisible();
  });

  test('State 1: Disabled/Inactive state when input is empty', async ({ page }) => {
    const input = page.getByPlaceholder('e.g. DPS101');
    const submitButton = page.getByRole('button', { name: 'Continue' });

    // Initial state
    await expect(submitButton).toBeDisabled();
    await expect(submitButton).toHaveClass(/disabled:opacity-50/);

    // Type spaces
    await input.fill('   ');
    await expect(submitButton).toBeDisabled();

    // Type valid string
    await input.fill('ABC');
    await expect(submitButton).toBeEnabled();
    
    // Clear it
    await input.fill('');
    await expect(submitButton).toBeDisabled();
  });

  test('State 2: Hover, focus, and active visual states', async ({ page }) => {
    const input = page.getByPlaceholder('e.g. DPS101');
    const submitButton = page.getByRole('button', { name: 'Continue' });

    await input.fill('ABC');
    await expect(submitButton).toBeEnabled();

    // Wait for any animations
    await page.waitForTimeout(100);

    // Check hover class existence in DOM
    await expect(submitButton).toHaveClass(/hover:bg-white\/90/);
    
    // Check focus class
    await expect(submitButton).toHaveClass(/focus:ring-4/);
    
    // Check active class
    await expect(submitButton).toHaveClass(/active:scale-95/);

    // We can simulate focus
    await submitButton.focus();
    
    // We can't perfectly assert rendered CSS pseudo-classes via standard expect,
    // but we check that the tailwind classes exist correctly on the node.
  });

  test('State 3: Click behavior with successful network response', async ({ page }) => {
    // Intercept Firestore network requests and mock a SUCCESSFUL response
    await page.route('**/*firestore.googleapis.com/**', async route => {
      // Return a mock Firestore document indicating the school was found
      const json = [
        {
          document: {
            name: "projects/test/databases/(default)/documents/schools/sch-dps",
            fields: { code: { stringValue: "DPS101" } }
          }
        }
      ];
      await route.fulfill({ json });
    });

    const input = page.getByPlaceholder('e.g. DPS101');
    const submitButton = page.getByRole('button', { name: 'Continue' });

    await input.fill('DPS101');
    await submitButton.click();

    // Verify it changes to "Verifying..."
    await expect(page.getByRole('button', { name: 'Verifying...' })).toBeVisible();

    // Verify it transitions to the next screen
    await expect(page.getByText('Select your role')).toBeVisible();
  });

  test('State 4: Click behavior with failed network response (Not Found)', async ({ page }) => {
    // Intercept Firestore network requests and mock an EMPTY response
    await page.route('**/*firestore.googleapis.com/**', async route => {
      // An empty array means no documents matched the query
      await route.fulfill({ json: [] });
    });

    const input = page.getByPlaceholder('e.g. DPS101');
    const submitButton = page.getByRole('button', { name: 'Continue' });

    await input.fill('INVALID99');
    await submitButton.click();

    // Verify it changes to "Verifying..."
    await expect(page.getByRole('button', { name: 'Verifying...' })).toBeVisible();

    // It should revert back to "Continue" after failure
    await expect(submitButton).toHaveText('Continue');

    // Verify the clear inline error toast/message is shown below the input
    const errorText = page.getByTestId('school-code-error');
    await expect(errorText).toBeVisible();
    await expect(errorText).toContainText('School Code Not Found');
  });
});
