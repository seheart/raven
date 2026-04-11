import { test, expect } from '@playwright/test';

/**
 * Critical User Flow Tests
 * Tests the most important user journeys through the application
 */

test.describe('Dashboard', () => {
  test('should load without errors', async ({ page }) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', msg => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    await page.goto('/');

    // Wait for dashboard to be visible
    await expect(page.locator('text=Overview')).toBeVisible({ timeout: 10000 });

    // Check for critical errors (excluding expected warnings)
    const criticalErrors = errors.filter(
      err => !err.includes('Warning') && !err.includes('404') && err.length > 0
    );

    expect(criticalErrors).toHaveLength(0);
  });

  test('should display health status widget', async ({ page }) => {
    await page.goto('/');

    // Health widget should be visible
    await expect(page.locator('text=System Health')).toBeVisible({ timeout: 10000 });
  });
});

test.describe('Navigation', () => {
  test('should navigate between main pages', async ({ page }) => {
    await page.goto('/');

    // Navigate to Activity page
    await page.click('text=Activity');
    await expect(page).toHaveURL(/.*\/activity/);

    // Navigate to System page
    await page.click('text=System');
    await expect(page).toHaveURL(/.*\/system/);

    // Navigate back to Overview
    await page.click('text=Overview');
    await expect(page).toHaveURL(/.*\/overview/);
  });

  test('should handle deep links correctly', async ({ page }) => {
    // Direct navigation to activity page
    await page.goto('/activity/dashboard');
    await expect(page.locator('text=Activity')).toBeVisible({ timeout: 10000 });

    // Direct navigation to system page
    await page.goto('/system/status');
    await expect(page.locator('text=System')).toBeVisible({ timeout: 10000 });
  });
});

test.describe('Notifications', () => {
  test('should display notification panel', async ({ page }) => {
    await page.goto('/system/notifications');

    // Notification panel should load
    await expect(page.locator('text=Notifications').first()).toBeVisible({ timeout: 10000 });
  });

  test('should not have constant API errors', async ({ page }) => {
    const apiErrors = [];

    page.on('response', response => {
      if (response.status() >= 400 && response.url().includes('/api/')) {
        apiErrors.push({ url: response.url(), status: response.status() });
      }
    });

    await page.goto('/system/notifications');
    await page.waitForTimeout(3000); // Wait to observe any repeated requests

    // Should not have excessive failed requests (more than 5 in 3 seconds)
    expect(apiErrors.length).toBeLessThan(5);
  });
});

test.describe('Error Handling', () => {
  test('should handle 404 pages gracefully', async ({ page }) => {
    await page.goto('/nonexistent-page');

    // Should not crash, should show some content
    const bodyText = await page.textContent('body');
    expect(bodyText.length).toBeGreaterThan(0);
  });

  test('should not crash on rapid navigation', async ({ page }) => {
    await page.goto('/');

    // Rapidly navigate between pages
    for (let i = 0; i < 5; i++) {
      await page.click('text=Activity');
      await page.click('text=System');
      await page.click('text=Overview');
    }

    // Should still be responsive
    await expect(page.locator('text=Overview')).toBeVisible();
  });
});

test.describe('Data Loading', () => {
  test('should handle empty states', async ({ page }) => {
    await page.goto('/');

    // Pages should render even with no data
    await expect(page.locator('body')).toBeVisible();
  });

  test('should show loading indicators', async ({ page }) => {
    await page.goto('/');

    // Some loading indicator or content should appear quickly
    const hasContent = await page.locator('body').textContent();
    expect(hasContent.length).toBeGreaterThan(100);
  });
});
