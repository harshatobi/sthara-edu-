import { test, expect } from '@playwright/test';

test.describe('School Code Input Validation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:3000/login');
    // Ensure we start on the SCHOOL_CODE step
    await expect(page.getByText('Enter your school code to continue')).toBeVisible();
  });

  test('Test 1: Empty input behavior prevents submission', async ({ page }) => {
    const input = page.getByPlaceholder('e.g. DPS101');
    const submitButton = page.getByRole('button', { name: 'Continue' });

    // Verify button is disabled initially
    await expect(submitButton).toBeDisabled();

    // Type spaces
    await input.fill('   ');
    await expect(submitButton).toBeDisabled();
    
    // Attempt to force submission via Enter key
    await input.press('Enter');
    
    // State should not have advanced to ROLE_SELECT
    await expect(page.getByText('Select your role')).not.toBeVisible();
    
    // Explicitly check for error if we forced submit with whitespace (though button disabled prevents this in UI)
    // We can enable the button via JS and click to test backend form validation
    await submitButton.evaluate(node => node.removeAttribute('disabled'));
    await submitButton.click();
    
    await expect(page.getByTestId('school-code-error')).toContainText('School code cannot be empty');
  });

  test('Test 2: Invalid formats block special characters', async ({ page }) => {
    const input = page.getByPlaceholder('e.g. DPS101');
    
    // Try typing special characters
    await input.type('DPS!@#101');
    
    // The input value should strip the special characters
    await expect(input).toHaveValue('DPS101');
    
    // An error should be displayed indicating special characters were removed
    await expect(page.getByTestId('school-code-error')).toContainText('Only letters and numbers are allowed');
  });

  test('Test 3: Capitalization tolerance auto-capitalizes lowercase input', async ({ page }) => {
    const input = page.getByPlaceholder('e.g. DPS101');
    
    // Type lowercase school code
    await input.type('sthara001');
    
    // The input should be automatically capitalized in the DOM/State
    await expect(input).toHaveValue('STHARA001');
    
    // It should allow us to continue
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByText('Select your role')).toBeVisible();
  });

  test('Test 4: Maximum character length constraint', async ({ page }) => {
    const input = page.getByPlaceholder('e.g. DPS101');
    
    // Type a string longer than 10 characters
    await input.type('SUPERLONGCODE123456');
    
    // The input should be constrained to exactly 10 characters
    await expect(input).toHaveValue('SUPERLONGC'); // First 10 chars
  });
});
