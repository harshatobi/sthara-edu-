import { test, expect } from '@playwright/test';

test.describe('Login Screen UI/UX', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the live login page
    await page.goto('https://sthara.in/login');
  });

  test('1. Logo and main text are present and visible', async ({ page }) => {
    // Check for 'Sthara' main heading
    const mainHeading = page.getByRole('heading', { name: 'Sthara', exact: true });
    await expect(mainHeading).toBeVisible();

    // Check for 'The Unified School OS' sub-heading
    const subHeading = page.getByRole('heading', { name: 'The Unified School OS' });
    await expect(subHeading).toBeVisible();

    // Check for sub-description text
    const description = page.getByText('High-integrity educational platform powered by advanced diagnostics and adaptive learning.');
    await expect(description).toBeVisible();

    // Logo (Shield icon) container
    // Since lucide-react sets class="lucide lucide-shield", we can check for its existence
    const logoContainer = page.locator('.lucide-shield').first();
    await expect(logoContainer).toBeVisible();
  });

  test('2. Card container aligns correctly on desktop viewport', async ({ page }) => {
    // Set viewport to a standard desktop size
    await page.setViewportSize({ width: 1280, height: 720 });
    
    // Check if the main 2-column grid is rendered
    const mainGrid = page.locator('.grid.md\\:grid-cols-2');
    await expect(mainGrid).toBeVisible();
    
    // Check if the login card is rendered (it has the backdrop-blur-md class)
    const loginCard = page.locator('.backdrop-blur-md');
    await expect(loginCard).toBeVisible();
    
    // Get bounding box of the card to verify its width is constrained and not full width
    const boundingBox = await loginCard.boundingBox();
    expect(boundingBox).not.toBeNull();
    if (boundingBox) {
      expect(boundingBox.width).toBeLessThan(1280);
      expect(boundingBox.width).toBeGreaterThan(300);
    }
  });

  test('2b. Card container aligns correctly on mobile viewport', async ({ page }) => {
    // Set viewport to a standard mobile size (e.g., iPhone 12/13)
    await page.setViewportSize({ width: 390, height: 844 });
    
    // The login card should still be visible and take up most of the width
    const loginCard = page.locator('.backdrop-blur-md');
    await expect(loginCard).toBeVisible();
    
    const boundingBox = await loginCard.boundingBox();
    expect(boundingBox).not.toBeNull();
    if (boundingBox) {
      // Allow minor margins, so width should be close to viewport width or slightly less
      expect(boundingBox.width).toBeLessThanOrEqual(390);
    }
  });

  test('3. Color contrast ratios meet accessibility guidelines', async ({ page }) => {
    // For automated contrast checking, we verify computed styles
    // The background is a gradient from #001229 to #002147
    
    const subHeading = page.getByRole('heading', { name: 'The Unified School OS' });
    const description = page.getByText('High-integrity educational platform');
    
    // Ensure text is white
    const color = await subHeading.evaluate((el) => window.getComputedStyle(el).color);
    expect(color).toBe('rgb(255, 255, 255)');

    // Ensure description is white with 70% opacity (text-white/70)
    const descColor = await description.evaluate((el) => window.getComputedStyle(el).color);
    expect(descColor).toBe('rgba(255, 255, 255, 0.7)');
    
    // Because Playwright doesn't run contrast algorithms natively without plugins like axe-core,
    // we assert the exact foreground colors against the known dark background.
    // Contrast of rgb(255,255,255) on rgb(0,18,41) is ~16:1 which easily passes AAA guidelines.
  });
});
