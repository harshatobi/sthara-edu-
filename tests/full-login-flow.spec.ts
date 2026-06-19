import { test, expect } from '@playwright/test';

test.describe('Full E2E Login Flow and Route Protection', () => {

  test('Successful login forwards to the correct dashboard', async ({ page }) => {
    // 1. Navigate to login
    await page.goto('http://localhost:3000/login');
    await expect(page.getByText('Enter your school code to continue')).toBeVisible();

    // 2. Mock the school code network request
    await page.route('**/*firestore.googleapis.com/**', async route => {
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

    // Enter school code and continue
    const schoolInput = page.getByPlaceholder('e.g. DPS101');
    await schoolInput.fill('DPS101');
    await page.getByRole('button', { name: 'Continue' }).click();

    // 3. We are now on the role select or credentials screen depending on state mapping
    // Our app transitions to ROLE_SELECT, then CREDENTIALS.
    await expect(page.getByText('Select your role')).toBeVisible();
    
    // Choose Student role
    await page.getByRole('button', { name: /student/i }).click();

    // 4. Fill in credentials
    await expect(page.getByPlaceholder('Enter your email')).toBeVisible();
    await page.getByPlaceholder('Enter your email').fill('student1_sch-dps_class_10@demo.com');
    await page.getByPlaceholder('Enter your password').fill('PassDPS1011!');

    // Mock the Google Identity Toolkit Auth API to simulate successful sign-in
    await page.route('**/*identitytoolkit.googleapis.com/v1/accounts:signInWithPassword**', async route => {
      const json = {
        idToken: "mock-id-token",
        email: "student1_sch-dps_class_10@demo.com",
        refreshToken: "mock-refresh-token",
        expiresIn: "3600",
        localId: "mock-uid-12345",
        registered: true
      };
      await route.fulfill({ json });
    });

    // Mock the user profile document fetch that determines routing
    await page.route('**/*firestore.googleapis.com/**/global_users/mock-uid-12345*', async route => {
      const json = {
        name: "projects/test/databases/(default)/documents/global_users/mock-uid-12345",
        fields: {
          role: { stringValue: "student" },
          email: { stringValue: "student1_sch-dps_class_10@demo.com" }
        }
      };
      await route.fulfill({ json });
    });

    // 5. Submit the final login form
    const loginPromise = page.waitForNavigation(); // Wait for the routing push
    await page.getByRole('button', { name: 'Sign In' }).click();

    // 6. Assert application forwards routing state to the correct dashboard
    await loginPromise;
    await expect(page).toHaveURL(/.*\/student/);
  });

  test('Unauthenticated URL manipulation redirects to login', async ({ page }) => {
    // Attempt to bypass login by directly hitting the protected student dashboard
    await page.goto('http://localhost:3000/student');

    // Wait for the app to detect no active session and perform the redirect
    // Assert that the URL matches the login route
    await expect(page).toHaveURL(/.*\/login/);

    // Verify the login screen is actually rendered
    await expect(page.getByText('The Unified School OS')).toBeVisible();
  });

});
