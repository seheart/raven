import { test, expect } from '@playwright/test';

/**
 * Navigation E2E
 *
 * Verifies the canonical chrome — header tabs, sub-tabs, footer, and theme
 * toggle — against the current UI. The earlier version of this file referenced
 * a long-removed nav (Overview/Safety/Agents/Activity/Analysis/System) and was
 * rewritten when the test scheme was modernised.
 */

const TOP_TABS = ['Dashboard', 'Insights', 'Analysis', 'Code Changes', 'History', 'System'];

test.describe('Header navigation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    // Wait for the nav to render — `domcontentloaded` is enough; `networkidle`
    // doesn't fire while the WebSocket pings keep the connection warm.
    await page.getByRole('button', { name: 'Dashboard', exact: true }).waitFor({ timeout: 10000 });
  });

  test('renders the Raven logo and brand', async ({ page }) => {
    await expect(page.getByRole('button', { name: /Go to Dashboard/i })).toBeVisible();
  });

  test('renders all 6 top-level tabs', async ({ page }) => {
    for (const label of TOP_TABS) {
      await expect(
        page.getByRole('button', { name: label, exact: true }).first()
      ).toBeVisible();
    }
  });

  test('Dashboard tab routes to /overview', async ({ page }) => {
    await page.getByRole('button', { name: 'Dashboard', exact: true }).click();
    await expect(page).toHaveURL(/\/overview$/);
  });

  test('Insights tab routes to /insights', async ({ page }) => {
    await page.getByRole('button', { name: 'Insights', exact: true }).click();
    await expect(page).toHaveURL(/\/insights$/);
  });

  test('Analysis tab routes to /analysis', async ({ page }) => {
    await page.getByRole('button', { name: 'Analysis', exact: true }).click();
    await expect(page).toHaveURL(/\/analysis(\/|$)/);
  });

  test('Code Changes tab routes to /live', async ({ page }) => {
    await page.getByRole('button', { name: 'Code Changes', exact: true }).first().click();
    await expect(page).toHaveURL(/\/live$/);
  });

  test('History tab routes to /history', async ({ page }) => {
    await page.getByRole('button', { name: 'History', exact: true }).click();
    await expect(page).toHaveURL(/\/history(\/|$)/);
  });

  test('System tab routes to /system', async ({ page }) => {
    await page.getByRole('button', { name: 'System', exact: true }).first().click();
    await expect(page).toHaveURL(/\/system(\/|$)/);
  });

  test('clicking the logo returns to /overview', async ({ page }) => {
    await page.getByRole('button', { name: 'System', exact: true }).first().click();
    await page.getByRole('button', { name: /Go to Dashboard/i }).click();
    await expect(page).toHaveURL(/\/overview$/);
  });
});

test.describe('Sub-navigation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Dashboard', exact: true }).waitFor({ timeout: 10000 });
  });

  test('System has sub-tabs (Code Health, Safety, Errors, Storage)', async ({ page }) => {
    await page.getByRole('button', { name: 'System', exact: true }).first().click();
    const subnav = page.getByRole('navigation', { name: /Sub navigation/i });
    await expect(subnav.getByRole('button', { name: 'Code Health', exact: true })).toBeVisible();
    await expect(subnav.getByRole('button', { name: 'Safety', exact: true })).toBeVisible();
    await expect(subnav.getByRole('button', { name: 'Errors', exact: true })).toBeVisible();
    await expect(subnav.getByRole('button', { name: 'Storage', exact: true })).toBeVisible();
  });

  test('History has sub-tabs (Activity Log, Timeline, File Browser)', async ({ page }) => {
    await page.getByRole('button', { name: 'History', exact: true }).click();
    const subnav = page.getByRole('navigation', { name: /Sub navigation/i });
    await expect(subnav.getByRole('button', { name: 'Activity Log', exact: true })).toBeVisible();
    await expect(subnav.getByRole('button', { name: 'Timeline', exact: true })).toBeVisible();
    await expect(subnav.getByRole('button', { name: 'File Browser', exact: true })).toBeVisible();
  });

  test('Analysis has sub-tabs (Token Usage, Models, Performance)', async ({ page }) => {
    await page.getByRole('button', { name: 'Analysis', exact: true }).click();
    const subnav = page.getByRole('navigation', { name: /Sub navigation/i });
    await expect(subnav.getByRole('button', { name: 'Token Usage', exact: true })).toBeVisible();
    await expect(subnav.getByRole('button', { name: 'Models', exact: true })).toBeVisible();
    await expect(subnav.getByRole('button', { name: 'Performance', exact: true })).toBeVisible();
  });

  test('Dashboard, Insights, and Code Changes have no sub-tabs', async ({ page }) => {
    for (const label of ['Dashboard', 'Insights', 'Code Changes']) {
      await page.getByRole('button', { name: label, exact: true }).first().click();
      await expect(page.getByRole('navigation', { name: /Sub navigation/i })).toHaveCount(0);
    }
  });

  test('clicking a System sub-tab updates the URL', async ({ page }) => {
    await page.getByRole('button', { name: 'System', exact: true }).first().click();
    const subnav = page.getByRole('navigation', { name: /Sub navigation/i });
    await subnav.getByRole('button', { name: 'Storage', exact: true }).click();
    await expect(page).toHaveURL(/\/system\/storage$/);
  });
});

test.describe('Footer', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Dashboard', exact: true }).waitFor({ timeout: 10000 });
  });

  test('is visible at the bottom of every page', async ({ page }) => {
    await expect(page.locator('footer')).toBeVisible();
  });

  test('shows the Raven version', async ({ page }) => {
    await expect(page.locator('footer').getByText(/^Raven v\d+\.\d+\.\d+$/)).toBeVisible();
  });

  test('shows the live monitoring indicator', async ({ page }) => {
    await expect(
      page.locator('footer').getByText(/Monitoring Active|Disconnected/)
    ).toBeVisible();
  });

  test('has About / System / Design / Roadmap nav links', async ({ page }) => {
    const footer = page.locator('footer');
    for (const label of ['About', 'System', 'Design', 'Roadmap']) {
      await expect(footer.getByRole('button', { name: label, exact: true })).toBeVisible();
    }
  });

  test('theme toggle switches the html.dark class', async ({ page }) => {
    const before = await page.locator('html').getAttribute('class');
    const isDarkBefore = (before || '').includes('dark');
    await page
      .locator('footer')
      .getByRole('button', { name: /Switch to (light|dark) theme/ })
      .click();
    await page.waitForTimeout(150);
    const after = await page.locator('html').getAttribute('class');
    const isDarkAfter = (after || '').includes('dark');
    expect(isDarkAfter).not.toBe(isDarkBefore);
  });
});
