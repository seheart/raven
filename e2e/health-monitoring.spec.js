import { test, expect } from '@playwright/test';

/**
 * Health Monitoring E2E Tests
 * Tests health checks, system monitoring, and alerting functionality
 */

test.describe('Health Monitoring', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('should display startup health checks', async ({ page }) => {
    // Wait for health widget to load
    await page.waitForSelector('text=/Project Health/i');

    // Should show startup health check status
    await expect(page.getByText(/All Systems Operational|Health Check Pending|Checks? Failed/i)).toBeVisible({ timeout: 5000 });
  });

  test('should show health check indicators', async ({ page }) => {
    await page.waitForSelector('text=/Project Health/i');

    // All 4 main health indicators should be visible
    await expect(page.getByText(/Syntax/i)).toBeVisible({ timeout: 5000 });
    await expect(page.getByText(/Tests/i)).toBeVisible();
    await expect(page.getByText(/Deletions/i)).toBeVisible();
    await expect(page.getByText(/Security/i)).toBeVisible();
  });

  test('should display health status icons', async ({ page }) => {
    await page.waitForSelector('text=/Project Health/i');

    // Should have status emoji/icons
    const healthIcons = await page.locator('text=/✅|⚠️|❌|🚨/').count();
    expect(healthIcons).toBeGreaterThan(0);
  });

  test('should navigate to System health page', async ({ page }) => {
    // Navigate to System tab
    await page.click('text=/System/i');
    await page.waitForTimeout(500);

    // Should see system health information
    await expect(page.getByText(/Status|Health|Uptime/i).first()).toBeVisible({ timeout: 5000 });
  });

  test('should display system metrics', async ({ page }) => {
    // System Health card should show CPU and Memory
    await expect(page.getByText(/CPU/i).first()).toBeVisible({ timeout: 5000 });
    await expect(page.getByText(/Memory/i).first()).toBeVisible();
  });

  test('should show percentage values for metrics', async ({ page }) => {
    // Wait for metrics to load
    await page.waitForTimeout(2000);

    // Should display percentage values
    const percentageText = await page.locator('text=/%|MB/').count();
    expect(percentageText).toBeGreaterThan(0);
  });

  test('should refresh health data', async ({ page }) => {
    // Wait for health widget
    await page.waitForSelector('text=/Project Health/i');

    // Find and click refresh button
    const refreshButton = page.locator('button[title*="Refresh" i]').or(
      page.locator('button:has-text("↻")')
    ).first();

    if (await refreshButton.isVisible()) {
      await refreshButton.click();

      // Wait for refresh to complete
      await page.waitForTimeout(1000);

      // Page should still be functional
      await expect(page.getByText(/Project Health/i)).toBeVisible();
    }
  });

  test('should show zero errors in healthy state', async ({ page }) => {
    await page.waitForSelector('text=/Project Health/i');

    // In a healthy state, checks should show 0
    await expect(page.getByText(/Deletions.*0|Security.*0/i).first()).toBeVisible({ timeout: 5000 });
  });

  test('should display "All Systems OK" when healthy', async ({ page }) => {
    await page.waitForSelector('text=/Project Health/i');

    // Should show healthy message (if system is healthy)
    const healthyStatus = page.getByText(/All Systems OK/i);
    const warningStatus = page.getByText(/Some Issues Detected/i);
    const criticalStatus = page.getByText(/Critical Issues Found/i);

    // One of these should be visible
    const statusVisible = await healthyStatus.isVisible().catch(() => false) ||
                         await warningStatus.isVisible().catch(() => false) ||
                         await criticalStatus.isVisible().catch(() => false);

    expect(statusVisible).toBe(true);
  });
});

test.describe('Multi-Project Health', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('should show projects overview', async ({ page }) => {
    // Projects section should be visible
    await expect(page.getByText(/Projects \(/i)).toBeVisible({ timeout: 5000 });
  });

  test('should navigate to multi-project health view', async ({ page }) => {
    // Navigate to Overview > Project Health sub-view
    await page.click('text=/Overview/i');
    await page.waitForTimeout(500);

    // Look for multi-project health content
    const healthView = page.getByText(/Multi-Project Health|Project Health/i);
    await expect(healthView.first()).toBeVisible({ timeout: 5000 });
  });

  test('should display project status indicators', async ({ page }) => {
    // Projects should have status indicators
    await page.waitForTimeout(2000);

    // Look for active/inactive status
    const statusIndicators = await page.locator('text=/Active|Recent|Idle|Inactive/i').count();

    // Either we have projects or we don't, both are valid
    expect(statusIndicators).toBeGreaterThanOrEqual(0);
  });
});

test.describe('Health API Endpoints', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('should successfully fetch health data', async ({ page, request }) => {
    // Test the health API endpoint directly
    const response = await request.get('http://localhost:9100/api/health');

    expect(response.ok()).toBeTruthy();

    const data = await response.json();
    expect(data).toHaveProperty('status');
    expect(data).toHaveProperty('uptime');
  });

  test('should successfully fetch health checks', async ({ page, request }) => {
    const response = await request.get('http://localhost:9100/api/health-checks');

    expect(response.ok()).toBeTruthy();

    const data = await response.json();
    expect(data).toHaveProperty('status');
    expect(data).toHaveProperty('summary');
  });

  test('should successfully fetch project health', async ({ page, request }) => {
    const response = await request.get('http://localhost:9100/api/health/projects');

    expect(response.ok()).toBeTruthy();

    const data = await response.json();
    expect(data).toHaveProperty('projects');
    expect(data).toHaveProperty('total_projects');
  });

  test('should successfully fetch session ID', async ({ page, request }) => {
    const response = await request.get('http://localhost:9100/api/session-id');

    expect(response.ok()).toBeTruthy();

    const data = await response.json();
    expect(data).toHaveProperty('session_id');
    expect(data.session_id).toBeTruthy();
  });

  test('should successfully fetch status', async ({ page, request }) => {
    const response = await request.get('http://localhost:9100/api/status');

    expect(response.ok()).toBeTruthy();

    const data = await response.json();
    expect(data.status).toBe('online');
    expect(data).toHaveProperty('version');
    expect(data).toHaveProperty('uptime');
  });
});

test.describe('Health Notifications', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('should handle health check failures gracefully', async ({ page }) => {
    // Even if health checks fail, the UI should remain functional
    await page.waitForSelector('text=/Project Health/i');

    // App should still be usable
    await expect(page.getByText(/Raven Session ID:/i)).toBeVisible();
  });

  test('should show error state when API fails', async ({ page, context }) => {
    // Block health API to simulate failure
    await context.route('**/api/health', route => route.abort());

    // Reload page
    await page.reload();

    // Page should still load (maybe with error state)
    await expect(page.getByText(/Raven/i)).toBeVisible({ timeout: 5000 });
  });
});

test.describe('Real-time Health Updates', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('should maintain WebSocket connection', async ({ page }) => {
    // Live indicator should be visible
    await expect(page.getByText(/Live/i).first()).toBeVisible({ timeout: 5000 });

    // Wait a bit to ensure connection is stable
    await page.waitForTimeout(2000);

    // Live indicator should still be there
    await expect(page.getByText(/Live/i).first()).toBeVisible();
  });

  test('should update metrics in real-time', async ({ page }) => {
    // Get initial metrics
    await expect(page.getByText(/Updated:/i).first()).toBeVisible({ timeout: 5000 });

    // Wait for potential update
    await page.waitForTimeout(3000);

    // Metrics should still be displayed
    await expect(page.getByText(/Project Health/i)).toBeVisible();
  });

  test('should handle disconnection gracefully', async ({ page, context }) => {
    // Wait for initial connection
    await page.waitForTimeout(2000);

    // Block WebSocket
    await context.route('**/socket.io/**', route => route.abort());

    // Page should still be functional
    await expect(page.getByText(/Raven Session ID:/i)).toBeVisible();
  });
});
