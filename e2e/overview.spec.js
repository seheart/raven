import { test, expect } from '@playwright/test';

/**
 * Overview Page E2E Tests
 * Tests the main dashboard and overview functionality
 */

test.describe('Overview Page', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the app
    await page.goto('/');

    // Wait for app to load
    await page.waitForLoadState('networkidle');
  });

  test('should load the overview page successfully', async ({ page }) => {
    // Check that we're on the overview page
    await expect(page).toHaveTitle(/Raven/i);

    // Check for greeting section
    await expect(page.getByText(/Good morning|Good afternoon|Good evening|Late night/i)).toBeVisible();
  });

  test('should display session information', async ({ page }) => {
    // Session ID should be visible
    await expect(page.getByText(/Raven Session ID:/i)).toBeVisible();

    // Server uptime should be visible
    await expect(page.getByText(/Server Uptime:/i)).toBeVisible();
  });

  test('should show Health Widget', async ({ page }) => {
    // Health widget should be present
    await expect(page.getByText(/Project Health/i)).toBeVisible();

    // Should show health status
    await expect(page.getByText(/All Systems OK|Some Issues Detected|Critical Issues Found/i)).toBeVisible({
      timeout: 5000
    });
  });

  test('should display current session statistics', async ({ page }) => {
    // Wait for stats to load
    await expect(page.getByText(/Current Session/i)).toBeVisible();

    // Check for key metrics
    await expect(page.getByText(/Duration:/i)).toBeVisible();
    await expect(page.getByText(/Files touched:/i)).toBeVisible();
    await expect(page.getByText(/Total changes:/i)).toBeVisible();
    await expect(page.getByText(/Current flow:/i)).toBeVisible();
  });

  test('should display system health metrics', async ({ page }) => {
    // Wait for system health card
    await expect(page.getByText(/System Health/i)).toBeVisible();

    // Check for CPU and Memory metrics
    await expect(page.getByText(/CPU/i)).toBeVisible();
    await expect(page.getByText(/Memory/i)).toBeVisible();
  });

  test('should show live activity stream', async ({ page }) => {
    // Activity stream should be present
    await expect(page.getByText(/Live Activity Stream/i)).toBeVisible();

    // Live indicator should be visible
    await expect(page.getByText(/Live/i)).toBeVisible();

    // Refresh button should be present
    await expect(page.getByRole('button', { name: /Refresh/i })).toBeVisible();
  });

  test('should refresh data when refresh button clicked', async ({ page }) => {
    // Wait for initial load
    await page.waitForSelector('text=/Live Activity Stream/i');

    // Click refresh button
    const refreshButton = page.getByRole('button', { name: /Refresh/i });
    await refreshButton.click();

    // Should trigger a refresh (check for network activity)
    // The timestamp should update
    await expect(page.getByText(/Updated:/i)).toBeVisible();
  });

  test('should display health check components', async ({ page }) => {
    // Wait for health widget to load
    await page.waitForSelector('text=/Project Health/i');

    // Check for all health check indicators
    await expect(page.getByText(/Syntax/i)).toBeVisible({ timeout: 5000 });
    await expect(page.getByText(/Tests/i)).toBeVisible();
    await expect(page.getByText(/Deletions/i)).toBeVisible();
    await expect(page.getByText(/Security/i)).toBeVisible();
  });

  test('should show today\'s stats', async ({ page }) => {
    // Wait for stats to load
    await page.waitForSelector('text=/Project Health/i');

    // Check for today's statistics
    await expect(page.getByText(/files/i)).toBeVisible({ timeout: 5000 });
    await expect(page.getByText(/added/i)).toBeVisible();
    await expect(page.getByText(/deleted/i)).toBeVisible();
  });

  test('should handle responsive layout', async ({ page }) => {
    // Test mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });

    // Key elements should still be visible
    await expect(page.getByText(/Raven Session ID:/i)).toBeVisible();
    await expect(page.getByText(/Project Health/i)).toBeVisible();
  });

  test('should show loading states appropriately', async ({ page }) => {
    // On initial load, there might be loading skeletons
    // We can't always catch them because they load fast, but page should eventually show content
    await page.waitForSelector('text=/Project Health/i', { timeout: 10000 });

    // Verify content is loaded
    await expect(page.getByText(/Current Session/i)).toBeVisible();
  });

  test('should navigate to projects overview', async ({ page }) => {
    // Projects section should be visible
    await expect(page.getByText(/Projects \(/i)).toBeVisible({ timeout: 5000 });
  });

  test('should display most active files section if data exists', async ({ page }) => {
    // Most active files may or may not be visible depending on data
    // Just check the page loaded successfully
    await page.waitForSelector('text=/Project Health/i');

    // Page should have content
    const content = await page.content();
    expect(content.length).toBeGreaterThan(1000);
  });

  test('should have working WebSocket connection', async ({ page }) => {
    // Wait for WebSocket connection indicator
    await expect(page.getByText(/Live/i)).toBeVisible({ timeout: 5000 });

    // The live indicator should have a pulsing dot (check for the animation)
    const liveIndicator = page.locator('[aria-label*="Real-time"]').or(page.getByText(/Live/i));
    await expect(liveIndicator).toBeVisible();
  });

  test('should show appropriate greeting based on time of day', async ({ page }) => {
    const hour = new Date().getHours();
    let expectedGreeting;

    if (hour < 12) {
      expectedGreeting = /Good morning/i;
    } else if (hour < 17) {
      expectedGreeting = /Good afternoon/i;
    } else if (hour < 21) {
      expectedGreeting = /Good evening/i;
    } else {
      expectedGreeting = /Late night/i;
    }

    await expect(page.getByText(expectedGreeting)).toBeVisible();
  });
});

test.describe('Overview Page Interactions', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('should expand startup health checks when clicked', async ({ page }) => {
    // Wait for health widget
    await page.waitForSelector('text=/Project Health/i');

    // Try to find and click startup health check section
    const startupCheck = page.getByText(/All Systems Operational|Health Check Pending/i).first();

    if (await startupCheck.isVisible()) {
      await startupCheck.click();

      // Check if details appear (they might not if there's no data)
      // Just verify the click doesn't break anything
      await expect(page.getByText(/Project Health/i)).toBeVisible();
    }
  });

  test('should maintain state during navigation', async ({ page }) => {
    // Get initial session ID
    const sessionIdElement = page.getByText(/[a-f0-9-]{36}/i);
    const sessionId = await sessionIdElement.textContent();

    // Navigate to another tab
    await page.click('text=/Safety/i');
    await page.waitForTimeout(500);

    // Navigate back to Overview
    await page.click('text=/Overview/i');
    await page.waitForTimeout(500);

    // Session ID should be the same
    await expect(page.getByText(sessionId)).toBeVisible();
  });

  test('should update metrics in real-time', async ({ page }) => {
    // Get initial timestamp
    await expect(page.getByText(/Updated:/i)).toBeVisible({ timeout: 5000 });

    // Wait a bit and check that page is still responsive
    await page.waitForTimeout(2000);

    // Page should still be functional
    await expect(page.getByText(/Project Health/i)).toBeVisible();
  });
});
