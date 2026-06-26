import { test, expect } from '@playwright/test';

// We run this sequentially to create a clear presentation for the user
test.describe.serial('Live Demonstration of Injected Data', () => {

  test('Logging into Delhi Public School as a Student', async ({ page }) => {
    // Make the test run slightly slower so the user can watch it
    test.setTimeout(60000);

    // Navigate to the live Vercel site
    await page.goto('https://stharaschoolos.vercel.app/login');
    
    console.log("Navigated to login screen...");
    await page.waitForTimeout(1500); // Pause for dramatic effect

    // 1. Enter School Code
    const schoolInput = page.getByPlaceholder('e.g. DPS101');
    await schoolInput.click();
    await page.waitForTimeout(500);
    // Type slowly like a human
    await schoolInput.pressSequentially('DPS101', { delay: 150 });
    await page.waitForTimeout(1000);
    
    await page.getByRole('button', { name: 'Continue' }).click();
    console.log("School code verified against live Firebase database!");
    
    // 2. Select Role
    await expect(page.getByText('Select your role')).toBeVisible();
    await page.waitForTimeout(1500);
    
    await page.getByRole('button', { name: /student/i }).click();
    console.log("Selected Student Role.");
    await page.waitForTimeout(1000);

    // 3. Enter Credentials
    const emailInput = page.getByPlaceholder('Email Address');
    const passwordInput = page.getByPlaceholder('Password');

    await emailInput.click();
    await emailInput.pressSequentially('student1_sch-dps_class_10@demo.com', { delay: 50 });
    
    await page.waitForTimeout(500);
    
    await passwordInput.click();
    await passwordInput.pressSequentially('PassDPS1011!', { delay: 50 });
    
    await page.waitForTimeout(1000);

    // 4. Submit Login against Live Firebase Auth
    const loginPromise = page.waitForNavigation({ waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'Sign In' }).click();
    console.log("Logging into Firebase Auth...");

    // 5. Arrive at Dashboard
    await loginPromise;
    await expect(page).toHaveURL(/.*\/student/);
    console.log("Successfully routed to the protected Student Dashboard!");
    
    // Let the user look at the loaded dashboard for 5 seconds before closing
    await page.waitForTimeout(5000);
  });

  test('Logging into Oakridge International as a Teacher', async ({ page }) => {
    test.setTimeout(60000);

    // Navigate to the live Vercel site
    await page.goto('https://stharaschoolos.vercel.app/login');
    
    await page.waitForTimeout(1500);

    // 1. Enter School Code
    const schoolInput = page.getByPlaceholder('e.g. DPS101');
    await schoolInput.click();
    // Type slowly
    await schoolInput.pressSequentially('OAK202', { delay: 150 });
    await page.waitForTimeout(1000);
    
    await page.getByRole('button', { name: 'Continue' }).click();
    
    // 2. Select Role
    await expect(page.getByText('Select your role')).toBeVisible();
    await page.waitForTimeout(1000);
    
    await page.getByRole('button', { name: /teacher/i }).click();
    await page.waitForTimeout(1000);

    // 3. Enter Credentials
    const emailInput = page.getByPlaceholder('Email Address');
    const passwordInput = page.getByPlaceholder('Password');

    await emailInput.click();
    await emailInput.pressSequentially('teacher1_sch-oak@demo.com', { delay: 50 });
    
    await page.waitForTimeout(500);
    
    await passwordInput.click();
    await passwordInput.pressSequentially('TeachOAK2021!', { delay: 50 });
    
    await page.waitForTimeout(1000);

    // 4. Submit Login
    const loginPromise = page.waitForNavigation({ waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'Sign In' }).click();

    // 5. Arrive at Dashboard
    await loginPromise;
    await expect(page).toHaveURL(/.*\/teacher/);
    
    // Let the user look at the loaded dashboard for 5 seconds before closing
    await page.waitForTimeout(5000);
  });
});
