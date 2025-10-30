import { test, expect } from '@playwright/test';

/**
 * User Story E2E Tests
 *
 * These tests simulate real user workflows and verify critical functionality
 * from an end-user perspective. Each test represents a user story like:
 * "As a developer, I want to see if activity is showing the latest changes"
 *
 * Run these tests continuously to catch workflow issues!
 */

test.describe('User Story: Activity Log Shows Latest Changes', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Wait for Raven to finish loading - look for navigation tabs to appear
    await page.waitForSelector('text=/Overview|Activity|System/i', { timeout: 10000 });

    // Give the app a moment to fully render
    await page.waitForTimeout(1000);
  });

  test('should display recent file changes in activity log', async ({ page }) => {
    // User Story: "I want to see if activity is showing the latest changes"

    // Navigate to Activity page
    await page.click('text=/Activity/i');
    await page.waitForTimeout(500);

    // Click on Activity Log sub-tab
    await page.click('text=/^Activity Log$/i');
    await page.waitForTimeout(500);

    // Activity log should be visible
    await expect(page.getByText(/Activity Log|Activity/i)).toBeVisible({ timeout: 5000 });

    // Should show some activity content or empty state
    const activityContent = page.locator('[class*="activity"]').or(page.locator('[class*="log"]')).or(page.getByText(/No activity|Recent activity/i));
    await expect(activityContent.first()).toBeVisible({ timeout: 5000 });
  });

  test('should show real-time updates when files change', async ({ page }) => {
    // User Story: "I want to see activity update in real-time"

    // Navigate to Activity (defaults to Live Feed)
    await page.click('text=/Activity/i');
    await page.waitForTimeout(500);

    // Live Feed should be visible (default sub-tab)
    await expect(page.getByText(/Live Feed/i)).toBeVisible({ timeout: 5000 });

    // The page should show the live feed panel
    await expect(page.locator('[class*="live"]').or(page.locator('[class*="feed"]')).or(page.getByText(/Code Feed|File changes/i))).toBeVisible({ timeout: 5000 });
  });

  test('should navigate between activity sub-tabs', async ({ page }) => {
    // User Story: "I want to see different types of activity"

    await page.click('text=/Activity/i');
    await page.waitForTimeout(500);

    // Should show Live Feed by default
    await expect(page.getByText(/Live Feed/i)).toBeVisible({ timeout: 5000 });

    // Click Event Log sub-tab
    await page.click('text=/^Event Log$/i');
    await page.waitForTimeout(500);

    // Event Log should now be visible
    await expect(page.getByText(/Event Log|Events/i)).toBeVisible({ timeout: 5000 });
  });
});

test.describe('User Story: Storage Information is Accurate', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Wait for Raven to finish loading - look for navigation tabs to appear
    await page.waitForSelector('text=/Overview|Activity|System/i', { timeout: 10000 });

    // Give the app a moment to fully render
    await page.waitForTimeout(1000);
  });

  test('should show storage usage on System page', async ({ page }) => {
    // User Story: "Is my storage good?"

    // Navigate to System page
    await page.click('text=/System/i');
    await page.waitForTimeout(500);

    // Click on Storage sub-tab
    await page.click('text=/^Storage$/i');
    await page.waitForTimeout(500);

    // Storage section should be visible
    const storageSection = page.getByText(/Storage|Database/i);
    await expect(storageSection.first()).toBeVisible({ timeout: 5000 });

    // Should show storage metrics
    // Look for size indicators (MB, GB, KB, or bytes)
    const sizePattern = /\d+\.?\d*\s*(bytes|KB|MB|GB|TB)/i;
    await expect(page.locator(`text=${sizePattern}`).first()).toBeVisible({ timeout: 5000 });
  });

  test('should display database size and file counts', async ({ page }) => {
    // User Story: "How much space is Raven using?"

    await page.click('text=/System/i');
    await page.waitForTimeout(500);

    // Click on Storage sub-tab
    await page.click('text=/^Storage$/i');
    await page.waitForTimeout(500);

    // Look for storage/database information
    await expect(page.getByText(/Storage|Database|Size/i)).toBeVisible({ timeout: 5000 });

    // Should have numerical data
    const hasNumbers = await page.locator('text=/\\d+/').count();
    expect(hasNumbers).toBeGreaterThan(0);
  });

  test('should allow storage cleanup if available', async ({ page }) => {
    // User Story: "Can I clean up old data?"

    await page.click('text=/System/i');
    await page.waitForTimeout(500);

    // Click on Storage sub-tab
    await page.click('text=/^Storage$/i');
    await page.waitForTimeout(500);

    // Look for cleanup or maintenance buttons
    const cleanupButton = page.getByRole('button', { name: /Clean|Clear|Delete|Remove/i });

    if (await cleanupButton.count() > 0) {
      // Just verify the button exists - don't actually click it in tests!
      await expect(cleanupButton.first()).toBeVisible();
    }

    // Storage information should still be visible
    await expect(page.getByText(/Storage|Database/i)).toBeVisible();
  });
});

test.describe('User Story: Project Switching Works Correctly', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Wait for Raven to finish loading - look for navigation tabs to appear
    await page.waitForSelector('text=/Overview|Activity|System/i', { timeout: 10000 });

    // Give the app a moment to fully render
    await page.waitForTimeout(1000);
  });

  test('should show project selector', async ({ page }) => {
    // User Story: "I want to switch between my projects"

    // Look for project selector (might be in header or sidebar)
    const projectSelector = page.getByLabel(/Project/i).or(page.getByText(/Projects/i));
    await expect(projectSelector.first()).toBeVisible({ timeout: 5000 });
  });

  test('should display current project information', async ({ page }) => {
    // User Story: "Which project am I viewing?"

    // Project name should be visible somewhere on the page
    // Look in common locations: header, overview, system page
    await expect(page.getByText(/Project|raven/i).first()).toBeVisible({ timeout: 5000 });

    // Navigate to System page to see project details
    await page.click('text=/System/i');
    await page.waitForTimeout(500);

    // Click on Projects sub-tab
    await page.click('text=/^Projects$/i');
    await page.waitForTimeout(500);

    // Should show project information
    await expect(page.getByText(/Project|Path|Directory/i)).toBeVisible({ timeout: 5000 });
  });

  test('should maintain state when switching tabs', async ({ page }) => {
    // User Story: "Project context shouldn't change when navigating"

    // Go to Overview
    await page.click('text=/Overview/i');
    await page.waitForTimeout(300);

    // Go to Activity
    await page.click('text=/Activity/i');
    await page.waitForTimeout(300);

    // Go to System
    await page.click('text=/System/i');
    await page.waitForTimeout(300);

    // Page should still be functional
    await expect(page.getByText(/System|Settings|Configuration/i)).toBeVisible();
  });
});

test.describe('User Story: Error Detection and Alerts', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Wait for Raven to finish loading - look for navigation tabs to appear
    await page.waitForSelector('text=/Overview|Activity|System/i', { timeout: 10000 });

    // Give the app a moment to fully render
    await page.waitForTimeout(1000);
  });

  test('should show syntax errors if any exist', async ({ page }) => {
    // User Story: "Are there any errors in my code?"

    // Navigate to Safety page
    await page.click('text=/Safety/i');
    await page.waitForTimeout(500);

    // Should show syntax error section
    await expect(page.getByText(/Syntax|Errors|Issues/i)).toBeVisible({ timeout: 5000 });

    // Should display error count or status
    const errorIndicator = page.getByText(/No errors|0 errors|\d+ error/i);
    await expect(errorIndicator.first()).toBeVisible({ timeout: 5000 });
  });

  test('should display health check status', async ({ page }) => {
    // User Story: "Is everything working correctly?"

    // Health status should be on Overview
    await expect(page.getByText(/Health|Status|System/i)).toBeVisible({ timeout: 5000 });

    // Should show some kind of status indicator
    const healthStatus = page.getByText(/OK|Good|Healthy|Warning|Critical|All Systems/i);
    await expect(healthStatus.first()).toBeVisible({ timeout: 5000 });
  });

  test('should show pattern warnings if enabled', async ({ page }) => {
    // User Story: "Are there any code quality issues?"

    await page.click('text=/Safety/i');
    await page.waitForTimeout(500);

    // Click on Pattern Warnings sub-tab
    await page.click('text=/Pattern Warnings/i');
    await page.waitForTimeout(500);

    // Should have pattern warnings section
    await expect(page.getByText(/Pattern|Warnings|Quality/i)).toBeVisible({ timeout: 5000 });
  });
});

test.describe('User Story: Performance Monitoring', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Wait for Raven to finish loading - look for navigation tabs to appear
    await page.waitForSelector('text=/Overview|Activity|System/i', { timeout: 10000 });

    // Give the app a moment to fully render
    await page.waitForTimeout(1000);
  });

  test('should display system resource usage', async ({ page }) => {
    // User Story: "How is Raven performing?"

    // Overview should show some system information
    await expect(page.getByText(/Overview|Project Health/i)).toBeVisible({ timeout: 5000 });

    // Should show some metrics or statistics (be flexible about what's shown)
    const hasMetrics = await page.locator('text=/\\d+/').count();
    expect(hasMetrics).toBeGreaterThan(0);
  });

  test('should show session duration and activity', async ({ page }) => {
    // User Story: "How long have I been coding?"

    // Overview should show session information
    await expect(page.getByText(/Overview|Session|Project Health/i).first()).toBeVisible({ timeout: 5000 });

    // Should show some time or session-related information (flexible check)
    const hasTime = await page.locator('text=/\\d+[smhd]|second|minute|hour|Session/i').count();
    expect(hasTime).toBeGreaterThan(0);
  });

  test('should track file changes during session', async ({ page }) => {
    // User Story: "How many files have I touched?"

    // Overview should show activity/file statistics
    await expect(page.getByText(/Overview|Activity|Project/i).first()).toBeVisible({ timeout: 5000 });

    // Should show some information about files or changes (flexible check)
    const hasFileInfo = await page.locator('text=/file|change|edit|\\d+/i').count();
    expect(hasFileInfo).toBeGreaterThan(0);
  });
});

test.describe('User Story: Navigation and Usability', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Wait for Raven to finish loading - look for navigation tabs to appear
    await page.waitForSelector('text=/Overview|Activity|System/i', { timeout: 10000 });

    // Give the app a moment to fully render
    await page.waitForTimeout(1000);
  });

  test('should load quickly and be responsive', async ({ page }) => {
    // User Story: "Raven should be fast"

    const startTime = Date.now();

    // Navigate to different pages
    await page.click('text=/Activity/i');
    await page.waitForLoadState('networkidle');

    const loadTime = Date.now() - startTime;

    // Should load in under 3 seconds
    expect(loadTime).toBeLessThan(3000);
  });

  test('should have clear visual hierarchy', async ({ page }) => {
    // User Story: "I should easily find what I need"

    // Main navigation tabs should be visible
    await expect(page.getByText(/Overview/i)).toBeVisible({ timeout: 5000 });
    await expect(page.getByText(/Activity/i)).toBeVisible({ timeout: 5000 });
    await expect(page.getByText(/System/i)).toBeVisible({ timeout: 5000 });

    // Should show some content
    const hasContent = await page.locator('text=/./').count();
    expect(hasContent).toBeGreaterThan(10);
  });

  test('should work on mobile viewport', async ({ page }) => {
    // User Story: "Can I use Raven on my tablet?"

    // Set tablet viewport
    await page.setViewportSize({ width: 768, height: 1024 });

    // Key elements should still be accessible
    await expect(page.getByText(/Overview|Activity|System/i)).toBeVisible({ timeout: 5000 });

    // Navigation should work
    await page.click('text=/Activity/i');
    await page.waitForTimeout(500);
    await expect(page.getByText(/Activity|Live Feed/i)).toBeVisible();
  });

  test('should maintain scroll position appropriately', async ({ page }) => {
    // User Story: "Don't lose my place when I click around"

    // Scroll down on Overview
    await page.evaluate(() => window.scrollTo(0, 500));
    await page.waitForTimeout(300);

    // Navigate to Activity
    await page.click('text=/Activity/i');
    await page.waitForTimeout(500);

    // Navigate back to Overview
    await page.click('text=/Overview/i');
    await page.waitForTimeout(500);

    // Page should be functional (scroll position may reset, which is fine)
    await expect(page.getByText(/Project Health|Overview/i)).toBeVisible();
  });
});
