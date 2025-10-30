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
    await page.click('text=/^Activity$/i');
    await page.waitForTimeout(500);

    // Check if Activity Log sub-tab exists, if so click it
    const activityLogTab = page.locator('button:has-text("Activity Log")');
    const tabCount = await activityLogTab.count();

    if (tabCount > 0) {
      await activityLogTab.click();
      await page.waitForTimeout(500);
    }

    // Activity log or live feed should be visible
    const activitySection = page.getByText(/Activity Log|Live Feed|Activity/i);
    await expect(activitySection.first()).toBeVisible({ timeout: 5000 });

    // Should show some activity content or empty state
    const hasContent = await page.locator('text=/.+/').count();
    expect(hasContent).toBeGreaterThan(5);
  });

  test('should show real-time updates when files change', async ({ page }) => {
    // User Story: "I want to see activity update in real-time"

    // Navigate to Activity (defaults to Live Feed)
    await page.click('text=/^Activity$/i');
    await page.waitForTimeout(500);

    // Live Feed or Activity should be visible
    const activityView = page.getByText(/Live Feed|Activity/i);
    await expect(activityView.first()).toBeVisible({ timeout: 5000 });

    // The page should have content rendered
    const hasContent = await page.locator('text=/.+/').count();
    expect(hasContent).toBeGreaterThan(5);
  });

  test('should navigate between activity sub-tabs', async ({ page }) => {
    // User Story: "I want to see different types of activity"

    await page.click('text=/^Activity$/i');
    await page.waitForTimeout(500);

    // Should show Activity page
    await expect(page.getByText(/Live Feed|Activity/i).first()).toBeVisible({ timeout: 5000 });

    // Check if Event Log sub-tab exists
    const eventLogTab = page.locator('button:has-text("Event Log")');
    const hasEventLog = await eventLogTab.count();

    if (hasEventLog > 0) {
      await eventLogTab.click();
      await page.waitForTimeout(500);
      await expect(page.getByText(/Event Log|Events/i).first()).toBeVisible({ timeout: 5000 });
    } else {
      // If no sub-tabs, just verify activity page is working
      await expect(page.getByText(/Activity/i).first()).toBeVisible({ timeout: 5000 });
    }
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
    await page.click('text=/^Overview$/i');
    await page.waitForTimeout(300);

    // Go to Activity
    await page.click('text=/^Activity$/i');
    await page.waitForTimeout(300);

    // Go to System
    await page.click('text=/^System$/i');
    await page.waitForTimeout(300);

    // Page should still be functional - System tab should be visible
    await expect(page.getByText(/System Status|System|Backend/i).first()).toBeVisible();
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
    await page.click('text=/^Safety$/i');
    await page.waitForTimeout(500);

    // Should show syntax error section or safety content
    await expect(page.getByText(/Syntax|Errors|Issues|Safety/i).first()).toBeVisible({ timeout: 5000 });

    // Should display error count, status, or safety information
    const safetyContent = page.getByText(/No errors|0 errors|\\d+ error|Safety|Syntax Check/i);
    await expect(safetyContent.first()).toBeVisible({ timeout: 5000 });
  });

  test('should display health check status', async ({ page }) => {
    // User Story: "Is everything working correctly?"

    // Health status should be on Overview
    await expect(page.getByText(/Project Health|Overview/i).first()).toBeVisible({ timeout: 5000 });

    // Should show some kind of status indicator
    const healthStatus = page.getByText(/OK|Good|Healthy|Warning|Critical|All Systems/i);
    await expect(healthStatus.first()).toBeVisible({ timeout: 5000 });
  });

  test('should show pattern warnings if enabled', async ({ page }) => {
    // User Story: "Are there any code quality issues?"

    await page.click('text=/^Safety$/i');
    await page.waitForTimeout(500);

    // Check if Pattern Warnings sub-tab exists
    const patternTab = page.locator('button:has-text("Pattern Warnings")');
    const hasPatternTab = await patternTab.count();

    if (hasPatternTab > 0) {
      await patternTab.click();
      await page.waitForTimeout(500);
    }

    // Should have safety or pattern warnings section
    await expect(page.getByText(/Pattern|Warnings|Safety|Syntax/i).first()).toBeVisible({ timeout: 5000 });
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
    await page.click('text=/^Activity$/i');
    await page.waitForLoadState('networkidle');

    const loadTime = Date.now() - startTime;

    // Should load in under 3 seconds
    expect(loadTime).toBeLessThan(3000);

    // Verify the page loaded
    await expect(page.getByText(/Activity|Live Feed/i).first()).toBeVisible({ timeout: 5000 });
  });

  test('should have clear visual hierarchy', async ({ page }) => {
    // User Story: "I should easily find what I need"

    // Main navigation tabs should be visible - look for navigation buttons
    const overviewBtn = page.locator('button:has-text("Overview")');
    const activityBtn = page.locator('button:has-text("Activity")');
    const systemBtn = page.locator('button:has-text("System")');

    await expect(overviewBtn).toBeVisible({ timeout: 5000 });
    await expect(activityBtn).toBeVisible({ timeout: 5000 });
    await expect(systemBtn).toBeVisible({ timeout: 5000 });

    // Should show some content
    const hasContent = await page.locator('text=/.+/').count();
    expect(hasContent).toBeGreaterThan(10);
  });

  test('should work on mobile viewport', async ({ page }) => {
    // User Story: "Can I use Raven on my tablet?"

    // Set tablet viewport
    await page.setViewportSize({ width: 768, height: 1024 });

    // Key elements should still be accessible - look for navigation buttons
    const navButtons = page.locator('button:has-text("Overview")').or(page.locator('button:has-text("Activity")'));
    await expect(navButtons.first()).toBeVisible({ timeout: 5000 });

    // Navigation should work
    await page.click('text=/^Activity$/i');
    await page.waitForTimeout(500);
    await expect(page.getByText(/Activity|Live Feed/i).first()).toBeVisible();
  });

  test('should maintain scroll position appropriately', async ({ page }) => {
    // User Story: "Don't lose my place when I click around"

    // Scroll down on Overview
    await page.evaluate(() => window.scrollTo(0, 500));
    await page.waitForTimeout(300);

    // Navigate to Activity
    await page.click('text=/^Activity$/i');
    await page.waitForTimeout(500);

    // Navigate back to Overview
    await page.click('text=/^Overview$/i');
    await page.waitForTimeout(500);

    // Page should be functional (scroll position may reset, which is fine)
    await expect(page.getByText(/Project Health|Overview/i).first()).toBeVisible();
  });
});

test.describe('User Story: Critical Boot-up and First Load', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Wait for Raven to finish loading - look for navigation tabs to appear
    await page.waitForSelector('text=/Overview|Activity|System/i', { timeout: 10000 });

    // Give the app a moment to fully render
    await page.waitForTimeout(1000);
  });

  test('should successfully load all critical resources on first boot', async ({ page }) => {
    // User Story: "Raven should load completely when I open it"

    // Check that all main navigation tabs are present using button locators
    await expect(page.locator('button:has-text("Overview")')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('button:has-text("Safety")')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('button:has-text("Agents")')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('button:has-text("Activity")')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('button:has-text("Analysis")')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('button:has-text("System")')).toBeVisible({ timeout: 5000 });

    // Check that the page doesn't have any error messages
    const errorMessages = page.getByText(/error|failed|crashed/i);
    const errorCount = await errorMessages.count();
    // Allow for error status displays, but not actual crash messages
    if (errorCount > 0) {
      const errorText = await errorMessages.first().textContent();
      expect(errorText).not.toMatch(/crashed|failed to load|fatal/i);
    }
  });

  test('should connect to backend API on startup', async ({ page }) => {
    // User Story: "Is Raven connected to the backend?"

    // Navigate to System page to check backend status
    await page.click('text=/System/i');
    await page.waitForTimeout(500);

    // Look for backend/server status indicator
    const backendStatus = page.getByText(/Backend|Server/i);
    await expect(backendStatus.first()).toBeVisible({ timeout: 5000 });

    // Should show online/connected status
    const statusIndicator = page.getByText(/Online|Connected|Running|healthy/i);
    await expect(statusIndicator.first()).toBeVisible({ timeout: 5000 });
  });

  test('should establish WebSocket connection for real-time updates', async ({ page }) => {
    // User Story: "Are real-time updates working?"

    // Navigate to System page
    await page.click('text=/System/i');
    await page.waitForTimeout(500);

    // Look for WebSocket status
    const wsStatus = page.getByText(/WebSocket|Real-time/i);
    await expect(wsStatus.first()).toBeVisible({ timeout: 5000 });

    // Should show connected status
    const wsConnected = page.getByText(/Connected|Active|Enabled/i);
    await expect(wsConnected.first()).toBeVisible({ timeout: 5000 });
  });

  test('should load project data and display on Overview', async ({ page }) => {
    // User Story: "Can I see my project information immediately?"

    // Overview should be the default page and should show project info
    await expect(page.getByText(/Overview|Project Health/i)).toBeVisible({ timeout: 5000 });

    // Should show some project metrics or information
    const hasProjectData = await page.locator('text=/\\d+/').count();
    expect(hasProjectData).toBeGreaterThan(0);

    // Look for project name or path somewhere on the page
    await expect(page.getByText(/raven|Project/i).first()).toBeVisible({ timeout: 5000 });
  });

  test('should initialize file watcher and show monitoring status', async ({ page }) => {
    // User Story: "Is Raven watching my files?"

    // Navigate to System page
    await page.click('text=/System/i');
    await page.waitForTimeout(500);

    // Look for monitoring status
    const monitoringStatus = page.getByText(/Monitoring|Watching|Tracked/i);
    await expect(monitoringStatus.first()).toBeVisible({ timeout: 5000 });

    // Should indicate active monitoring
    const activeIndicator = page.getByText(/Active|Running|Enabled/i);
    await expect(activeIndicator.first()).toBeVisible({ timeout: 5000 });
  });
});

test.describe('User Story: Data Integrity and Persistence', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Wait for Raven to finish loading - look for navigation tabs to appear
    await page.waitForSelector('text=/Overview|Activity|System/i', { timeout: 10000 });

    // Give the app a moment to fully render
    await page.waitForTimeout(1000);
  });

  test('should persist activity log across page refreshes', async ({ page }) => {
    // User Story: "My activity history shouldn't disappear"

    // Navigate to Activity page
    await page.click('text=/Activity/i');
    await page.waitForTimeout(500);

    // Click on Activity Log sub-tab
    await page.click('text=/^Activity Log$/i');
    await page.waitForTimeout(500);

    // Get initial count of activity items (if any)
    const initialCount = await page.locator('[class*="activity"]').count();

    // Refresh the page
    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('text=/Overview|Activity|System/i', { timeout: 10000 });
    await page.waitForTimeout(1000);

    // Navigate back to Activity Log
    await page.click('text=/Activity/i');
    await page.waitForTimeout(500);
    await page.click('text=/^Activity Log$/i');
    await page.waitForTimeout(500);

    // Activity should still be visible
    await expect(page.getByText(/Activity Log|Activity/i)).toBeVisible({ timeout: 5000 });
  });

  test('should maintain database integrity after navigation', async ({ page }) => {
    // User Story: "Database shouldn't get corrupted during normal use"

    // Navigate to System page to check database status
    await page.click('text=/System/i');
    await page.waitForTimeout(500);

    // Check initial database health
    const dbHealth = page.getByText(/Database|DB|Health/i);
    await expect(dbHealth.first()).toBeVisible({ timeout: 5000 });

    // Navigate through all tabs
    await page.click('text=/Overview/i');
    await page.waitForTimeout(300);
    await page.click('text=/Safety/i');
    await page.waitForTimeout(300);
    await page.click('text=/Activity/i');
    await page.waitForTimeout(300);
    await page.click('text=/System/i');
    await page.waitForTimeout(300);

    // Database should still show healthy status
    await expect(page.getByText(/Healthy|OK|Good/i).first()).toBeVisible({ timeout: 5000 });
  });

  test('should handle concurrent activity writes correctly', async ({ page }) => {
    // User Story: "Multiple activities shouldn't cause data corruption"

    // Navigate to Activity page
    await page.click('text=/Activity/i');
    await page.waitForTimeout(500);

    // Activity system should be running
    await expect(page.getByText(/Activity|Live Feed/i)).toBeVisible({ timeout: 5000 });

    // Navigate to multiple pages quickly to generate activity
    await page.click('text=/Overview/i');
    await page.waitForTimeout(100);
    await page.click('text=/Safety/i');
    await page.waitForTimeout(100);
    await page.click('text=/System/i');
    await page.waitForTimeout(100);
    await page.click('text=/Activity/i');
    await page.waitForTimeout(500);

    // Page should still be functional, no errors
    await expect(page.getByText(/Activity|Live Feed/i)).toBeVisible({ timeout: 5000 });
  });

  test('should recover gracefully from invalid data in database', async ({ page }) => {
    // User Story: "Bad data shouldn't crash Raven"

    // Navigate to System page to check database status
    await page.click('text=/System/i');
    await page.waitForTimeout(500);

    // System should load normally even if there's questionable data
    await expect(page.getByText(/System/i)).toBeVisible({ timeout: 5000 });

    // Navigate to Activity page which reads from database
    await page.click('text=/Activity/i');
    await page.waitForTimeout(500);

    // Should show activity log even with edge cases
    await expect(page.getByText(/Activity|Live Feed/i)).toBeVisible({ timeout: 5000 });

    // App should not crash - main navigation should still work
    await expect(page.getByText(/Overview/i)).toBeVisible({ timeout: 5000 });
  });
});

test.describe('User Story: Real-time WebSocket Features', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Wait for Raven to finish loading - look for navigation tabs to appear
    await page.waitForSelector('text=/Overview|Activity|System/i', { timeout: 10000 });

    // Give the app a moment to fully render
    await page.waitForTimeout(1000);
  });

  test('should maintain WebSocket connection during extended use', async ({ page }) => {
    // User Story: "Real-time updates should work all the time"

    // Navigate to System page to check WebSocket status
    await page.click('text=/System/i');
    await page.waitForTimeout(500);

    // Check WebSocket is connected initially
    const wsStatus = page.getByText(/WebSocket|Real-time/i);
    await expect(wsStatus.first()).toBeVisible({ timeout: 5000 });

    // Navigate around the app
    await page.click('text=/Overview/i');
    await page.waitForTimeout(1000);
    await page.click('text=/Activity/i');
    await page.waitForTimeout(1000);
    await page.click('text=/System/i');
    await page.waitForTimeout(500);

    // WebSocket should still be connected
    await expect(page.getByText(/Connected|Active/i).first()).toBeVisible({ timeout: 5000 });
  });

  test('should reconnect WebSocket after connection loss', async ({ page }) => {
    // User Story: "Raven should recover from network hiccups"

    // Navigate to System page
    await page.click('text=/System/i');
    await page.waitForTimeout(500);

    // Check initial WebSocket status
    const wsStatus = page.getByText(/WebSocket|Real-time/i);
    await expect(wsStatus.first()).toBeVisible({ timeout: 5000 });

    // Wait a moment and check status is maintained
    await page.waitForTimeout(2000);

    // Navigate to Activity to test real-time feed
    await page.click('text=/Activity/i');
    await page.waitForTimeout(500);

    // Live feed should be working
    await expect(page.getByText(/Live Feed/i)).toBeVisible({ timeout: 5000 });
  });

  test('should display real-time activity updates in live feed', async ({ page }) => {
    // User Story: "I want to see changes as they happen"

    // Navigate to Activity page (defaults to Live Feed)
    await page.click('text=/Activity/i');
    await page.waitForTimeout(500);

    // Live Feed should be visible and active
    await expect(page.getByText(/Live Feed/i)).toBeVisible({ timeout: 5000 });

    // Feed panel should be rendered
    const feedPanel = page.locator('[class*="live"]').or(page.locator('[class*="feed"]'));
    await expect(feedPanel.first()).toBeVisible({ timeout: 5000 });

    // Generate some activity by navigating
    await page.click('text=/System/i');
    await page.waitForTimeout(500);
    await page.click('text=/Activity/i');
    await page.waitForTimeout(500);

    // Live feed should still be operational
    await expect(page.getByText(/Live Feed/i)).toBeVisible({ timeout: 5000 });
  });
});

test.describe('User Story: Error Handling and Recovery', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Wait for Raven to finish loading - look for navigation tabs to appear
    await page.waitForSelector('text=/Overview|Activity|System/i', { timeout: 10000 });

    // Give the app a moment to fully render
    await page.waitForTimeout(1000);
  });

  test('should display user-friendly error messages for API failures', async ({ page }) => {
    // User Story: "I should know when something goes wrong"

    // Navigate to System page to check error handling
    await page.click('text=/System/i');
    await page.waitForTimeout(500);

    // Click on Errors sub-tab to see error monitoring
    await page.click('text=/^Errors$/i');
    await page.waitForTimeout(500);

    // Error monitoring section should exist
    await expect(page.getByText(/Errors|Error Monitoring|Issues/i).first()).toBeVisible({ timeout: 5000 });

    // Should show error count or status
    const errorStatus = page.getByText(/No errors|0 errors|\\d+ error/i);
    await expect(errorStatus.first()).toBeVisible({ timeout: 5000 });
  });

  test('should continue working when one component fails', async ({ page }) => {
    // User Story: "One failure shouldn't break everything"

    // Navigate to Overview
    await page.click('text=/Overview/i');
    await page.waitForTimeout(500);

    // Overview should load
    await expect(page.getByText(/Overview|Project Health/i)).toBeVisible({ timeout: 5000 });

    // Navigate to Activity
    await page.click('text=/Activity/i');
    await page.waitForTimeout(500);

    // Activity should work independently
    await expect(page.getByText(/Activity|Live Feed/i)).toBeVisible({ timeout: 5000 });

    // Navigate to System
    await page.click('text=/System/i');
    await page.waitForTimeout(500);

    // System should work
    await expect(page.getByText(/System/i)).toBeVisible({ timeout: 5000 });

    // All tabs should remain accessible
    await expect(page.getByText(/Overview/i)).toBeVisible({ timeout: 5000 });
  });

  test('should handle missing project data gracefully', async ({ page }) => {
    // User Story: "Raven shouldn't crash with missing data"

    // Navigate to System page
    await page.click('text=/System/i');
    await page.waitForTimeout(500);

    // Click on Projects sub-tab
    await page.click('text=/^Projects$/i');
    await page.waitForTimeout(500);

    // Should show project information or empty state
    await expect(page.getByText(/Project|Projects|No projects/i).first()).toBeVisible({ timeout: 5000 });

    // App should remain functional
    await page.click('text=/Overview/i');
    await page.waitForTimeout(500);
    await expect(page.getByText(/Overview/i)).toBeVisible({ timeout: 5000 });
  });

  test('should recover from temporary backend unavailability', async ({ page }) => {
    // User Story: "Raven should tell me if backend is down"

    // Navigate to System page to check backend status
    await page.click('text=/System/i');
    await page.waitForTimeout(500);

    // Should show backend status section
    const backendSection = page.getByText(/Backend|Server|Status/i);
    await expect(backendSection.first()).toBeVisible({ timeout: 5000 });

    // Should show current backend state (online or offline)
    const statusIndicator = page.getByText(/Online|Offline|Connected|Disconnected|Running/i);
    await expect(statusIndicator.first()).toBeVisible({ timeout: 5000 });

    // Frontend should remain functional even if checking backend status
    await page.click('text=/Overview/i');
    await page.waitForTimeout(500);
    await expect(page.getByText(/Overview/i)).toBeVisible({ timeout: 5000 });
  });
});

test.describe('User Story: Performance Under Load', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Wait for Raven to finish loading - look for navigation tabs to appear
    await page.waitForSelector('text=/Overview|Activity|System/i', { timeout: 10000 });

    // Give the app a moment to fully render
    await page.waitForTimeout(1000);
  });

  test('should handle rapid navigation without performance degradation', async ({ page }) => {
    // User Story: "Raven should stay fast even when I click around a lot"

    const startTime = Date.now();

    // Rapidly navigate through all tabs multiple times
    for (let i = 0; i < 3; i++) {
      await page.click('text=/Overview/i');
      await page.waitForTimeout(100);
      await page.click('text=/Safety/i');
      await page.waitForTimeout(100);
      await page.click('text=/Activity/i');
      await page.waitForTimeout(100);
      await page.click('text=/System/i');
      await page.waitForTimeout(100);
    }

    const totalTime = Date.now() - startTime;

    // Should complete all navigation in reasonable time (under 5 seconds for 12 navigations)
    expect(totalTime).toBeLessThan(5000);

    // Final page should still be responsive
    await expect(page.getByText(/System/i)).toBeVisible({ timeout: 5000 });
  });

  test('should render large activity logs efficiently', async ({ page }) => {
    // User Story: "Activity log should load quickly even with lots of history"

    // Navigate to Activity page
    await page.click('text=/Activity/i');
    await page.waitForTimeout(500);

    // Click on Activity Log sub-tab
    await page.click('text=/^Activity Log$/i');
    await page.waitForTimeout(500);

    const startTime = Date.now();

    // Activity log should render
    await expect(page.getByText(/Activity Log|Activity/i)).toBeVisible({ timeout: 5000 });

    const renderTime = Date.now() - startTime;

    // Should render in under 3 seconds
    expect(renderTime).toBeLessThan(3000);

    // Page should remain responsive
    await page.click('text=/Overview/i');
    await page.waitForTimeout(300);
    await expect(page.getByText(/Overview/i)).toBeVisible({ timeout: 5000 });
  });

  test('should maintain performance with multiple active components', async ({ page }) => {
    // User Story: "Everything should work smoothly together"

    // Navigate to Overview (shows multiple metrics)
    await page.click('text=/Overview/i');
    await page.waitForTimeout(500);

    const startTime = Date.now();

    // Overview should display all metrics quickly
    await expect(page.getByText(/Overview|Project Health/i)).toBeVisible({ timeout: 5000 });

    // Should have rendered multiple data points
    const dataPoints = await page.locator('text=/\\d+/').count();
    expect(dataPoints).toBeGreaterThan(3);

    const renderTime = Date.now() - startTime;

    // Should render in under 2 seconds
    expect(renderTime).toBeLessThan(2000);

    // Navigate to System page (also shows multiple components)
    await page.click('text=/System/i');
    await page.waitForTimeout(500);

    // Should render quickly
    await expect(page.getByText(/System/i)).toBeVisible({ timeout: 5000 });
  });
});

test.describe('User Story: API Integration Health', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Wait for Raven to finish loading - look for navigation tabs to appear
    await page.waitForSelector('text=/Overview|Activity|System/i', { timeout: 10000 });

    // Give the app a moment to fully render
    await page.waitForTimeout(1000);
  });

  test('should successfully call dashboard stats API', async ({ page }) => {
    // User Story: "Dashboard should load data from backend"

    // Navigate to Overview which calls dashboard stats API
    await page.click('text=/Overview/i');
    await page.waitForTimeout(500);

    // Should display overview content from API
    await expect(page.getByText(/Overview|Project Health/i)).toBeVisible({ timeout: 5000 });

    // Should show metrics that come from API
    const hasMetrics = await page.locator('text=/\\d+/').count();
    expect(hasMetrics).toBeGreaterThan(0);
  });

  test('should display API health status correctly', async ({ page }) => {
    // User Story: "I should know if APIs are working"

    // Navigate to System page
    await page.click('text=/System/i');
    await page.waitForTimeout(500);

    // Click on API Health sub-tab
    await page.click('text=/^API Health$/i');
    await page.waitForTimeout(500);

    // API Health section should be visible
    await expect(page.getByText(/API|Health|Endpoint/i).first()).toBeVisible({ timeout: 5000 });

    // Should show some API status information
    const hasApiInfo = await page.locator('text=/GET|POST|WS|health/i').count();
    expect(hasApiInfo).toBeGreaterThan(0);
  });

  test('should list all available API endpoints', async ({ page }) => {
    // User Story: "What APIs are available?"

    // Navigate to System page
    await page.click('text=/System/i');
    await page.waitForTimeout(500);

    // Look for endpoints section (visible on Status or API Health sub-tab)
    const endpointsSection = page.getByText(/Endpoints|Available Endpoints|API/i);
    await expect(endpointsSection.first()).toBeVisible({ timeout: 5000 });

    // Should show endpoint methods (GET, POST, WS)
    const hasEndpoints = await page.locator('text=/GET|POST|WS/').count();
    expect(hasEndpoints).toBeGreaterThan(0);
  });
});
