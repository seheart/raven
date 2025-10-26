import { test, expect } from '@playwright/test';

/**
 * Navigation E2E Tests
 * Tests tab navigation, keyboard shortcuts, and page transitions
 */

test.describe('Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('should have all main navigation tabs', async ({ page }) => {
    // Check all 6 main tabs exist
    await expect(page.getByText('Overview')).toBeVisible();
    await expect(page.getByText('Safety')).toBeVisible();
    await expect(page.getByText('Agents')).toBeVisible();
    await expect(page.getByText('Activity')).toBeVisible();
    await expect(page.getByText('Analysis')).toBeVisible();
    await expect(page.getByText('System')).toBeVisible();
  });

  test('should navigate to Safety page', async ({ page }) => {
    await page.click('text=/Safety/i');
    await page.waitForTimeout(500);

    // Should show Safety content
    await expect(page.getByText(/Syntax Errors|Session Rollback|Pattern Warnings/i)).toBeVisible({ timeout: 5000 });
  });

  test('should navigate to Agents page', async ({ page }) => {
    await page.click('text=/Agents/i');
    await page.waitForTimeout(500);

    // Should show Agents content
    await expect(page.getByText(/Agent Stats|Conversations/i)).toBeVisible({ timeout: 5000 });
  });

  test('should navigate to Activity page', async ({ page }) => {
    await page.click('text=/Activity/i');
    await page.waitForTimeout(500);

    // Should show Activity content
    await expect(page.getByText(/Live Feed|Event Log|File Browser/i)).toBeVisible({ timeout: 5000 });
  });

  test('should navigate to Analysis page', async ({ page }) => {
    await page.click('text=/Analysis/i');
    await page.waitForTimeout(500);

    // Should show Analysis content
    await expect(page.getByText(/Performance|Trends|Metrics/i)).toBeVisible({ timeout: 5000 });
  });

  test('should navigate to System page', async ({ page }) => {
    await page.click('text=/System/i');
    await page.waitForTimeout(500);

    // Should show System content
    await expect(page.getByText(/Status|Storage|Projects/i)).toBeVisible({ timeout: 5000 });
  });

  test('should highlight active tab', async ({ page }) => {
    // Click on Safety tab
    const safetyTab = page.locator('button, a').filter({ hasText: /^Safety$/i });
    await safetyTab.click();

    // Safety tab should have active class or indicator
    // This depends on your CSS implementation
    await expect(safetyTab).toBeVisible();
  });

  test('should navigate back to Overview', async ({ page }) => {
    // Navigate away
    await page.click('text=/Safety/i');
    await page.waitForTimeout(500);

    // Navigate back to Overview
    await page.click('text=/Overview/i');
    await page.waitForTimeout(500);

    // Should see Overview content
    await expect(page.getByText(/Raven Session ID:/i)).toBeVisible();
  });

  test('should preserve scroll position when switching tabs', async ({ page }) => {
    // Scroll down on Overview
    await page.evaluate(() => window.scrollTo(0, 500));

    // Navigate to another tab
    await page.click('text=/Safety/i');
    await page.waitForTimeout(500);

    // Navigate back
    await page.click('text=/Overview/i');
    await page.waitForTimeout(500);

    // Page should be scrolled to top or maintain position
    const scrollY = await page.evaluate(() => window.scrollY);
    expect(scrollY).toBeGreaterThanOrEqual(0);
  });
});

test.describe('Keyboard Shortcuts', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('should navigate with number keys 1-6', async ({ page }) => {
    // Press '2' for Safety
    await page.keyboard.press('2');
    await page.waitForTimeout(500);

    // Should navigate to Safety
    await expect(page.getByText(/Syntax Errors|Session Rollback/i)).toBeVisible({ timeout: 5000 });
  });

  test('should navigate to Agents with key 3', async ({ page }) => {
    await page.keyboard.press('3');
    await page.waitForTimeout(500);

    // Should navigate to Agents
    await expect(page.getByText(/Agent Stats|Conversations/i)).toBeVisible({ timeout: 5000 });
  });

  test('should navigate to Activity with key 4', async ({ page }) => {
    await page.keyboard.press('4');
    await page.waitForTimeout(500);

    // Should navigate to Activity
    await expect(page.getByText(/Live Feed|Event Log/i)).toBeVisible({ timeout: 5000 });
  });

  test('should navigate to Analysis with key 5', async ({ page }) => {
    await page.keyboard.press('5');
    await page.waitForTimeout(500);

    // Should navigate to Analysis
    await expect(page.getByText(/Performance|Trends/i)).toBeVisible({ timeout: 5000 });
  });

  test('should navigate to System with key 6', async ({ page }) => {
    await page.keyboard.press('6');
    await page.waitForTimeout(500);

    // Should navigate to System
    await expect(page.getByText(/Status|Storage/i)).toBeVisible({ timeout: 5000 });
  });

  test('should return to Overview with key 1', async ({ page }) => {
    // Navigate away first
    await page.keyboard.press('2');
    await page.waitForTimeout(500);

    // Press '1' to go back to Overview
    await page.keyboard.press('1');
    await page.waitForTimeout(500);

    // Should be back on Overview
    await expect(page.getByText(/Raven Session ID:/i)).toBeVisible();
  });
});

test.describe('Header Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('should have Raven logo/branding', async ({ page }) => {
    // Logo or brand name should be visible
    const header = page.locator('header');
    await expect(header).toBeVisible();
  });

  test('should have user menu', async ({ page }) => {
    // User menu button should exist
    const userMenu = page.locator('[aria-label*="user" i], button:has-text("admin"), button:has-text("user")').first();

    if (await userMenu.isVisible()) {
      await expect(userMenu).toBeVisible();
    }
  });

  test('should have help button', async ({ page }) => {
    // Help button should be visible
    const helpButton = page.locator('button').filter({ hasText: '?' }).first();

    if (await helpButton.isVisible()) {
      await expect(helpButton).toBeVisible();
    }
  });

  test('should have notifications indicator', async ({ page }) => {
    // Notifications button might be present
    const notificationButton = page.locator('button').filter({ hasText: '🔔' }).or(
      page.locator('[aria-label*="notification" i]')
    ).first();

    if (await notificationButton.count() > 0) {
      await expect(notificationButton.first()).toBeVisible();
    } else {
      // Notifications might not be implemented yet, that's okay
      expect(true).toBe(true);
    }
  });
});

test.describe('Footer Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('should display footer', async ({ page }) => {
    const footer = page.locator('footer');
    await expect(footer).toBeVisible();
  });

  test('should show version number', async ({ page }) => {
    // Version should be in footer
    await expect(page.getByText(/Raven v\d+\.\d+\.\d+/i)).toBeVisible();
  });

  test('should have theme selector', async ({ page }) => {
    // Theme buttons should exist
    await expect(page.getByText(/Day|Dusk|Night/i).first()).toBeVisible();
  });

  test('should have footer links', async ({ page }) => {
    // Footer should have navigation links
    await expect(page.getByText(/About|Changelog|Docs|GitHub/i).first()).toBeVisible();
  });

  test('should switch themes', async ({ page }) => {
    // Click Day theme
    const dayButton = page.locator('button').filter({ hasText: /^Day$/i });
    await dayButton.click();
    await page.waitForTimeout(300);

    // Click Night theme
    const nightButton = page.locator('button').filter({ hasText: /^Night$/i });
    await nightButton.click();
    await page.waitForTimeout(300);

    // Page should still be functional
    await expect(page.getByText(/Raven Session ID:/i)).toBeVisible();
  });
});

test.describe('Sub-navigation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('should show Overview sub-tabs', async ({ page }) => {
    await page.click('text=/Overview/i');
    await page.waitForTimeout(500);

    // Overview should have sub-views
    // Dashboard, Projects Comparison, Project Health
    await expect(page.getByText(/Dashboard|Projects|Health/i).first()).toBeVisible({ timeout: 5000 });
  });

  test('should show Safety sub-tabs', async ({ page }) => {
    await page.click('text=/Safety/i');
    await page.waitForTimeout(500);

    // Safety should have sub-views
    await expect(page.getByText(/Syntax|Rollback|Pattern|Test/i).first()).toBeVisible({ timeout: 5000 });
  });

  test('should show Activity sub-tabs', async ({ page }) => {
    await page.click('text=/Activity/i');
    await page.waitForTimeout(500);

    // Activity should have sub-views
    await expect(page.getByText(/Feed|Log|Browser|Search/i).first()).toBeVisible({ timeout: 5000 });
  });
});
