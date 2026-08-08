import { test, expect } from '@playwright/test';

/**
 * Navigation E2E
 *
 * Verifies the canonical chrome — header tabs, sub-tabs, footer, and theme
 * toggle — against the current UI. The May 2026 IA refactor reduced the
 * header to five top-level tabs (Dashboard / Activity / Agents / Insights /
 * System); Code Changes / Analysis / History are gone, with their content
 * rehomed under Activity, Agents, and Insights.
 */

const TOP_TABS = ['Dashboard', 'Activity', 'Agents', 'Insights', 'System'];

test.describe('Header navigation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    // Wait for the nav to render — `domcontentloaded` is enough; `networkidle`
    // doesn't fire while the WebSocket pings keep the connection warm.
    await page.getByRole('button', { name: 'Dashboard', exact: true }).waitFor({ timeout: 10000 });
  });

  test('renders the Raven logo and brand', async ({ page }) => {
    // Logo aria-label is "Go to Today" — the root route id is still 'today'
    // so existing /today links keep working even though the tab now reads
    // "Dashboard".
    await expect(page.getByRole('button', { name: /Go to Today/i })).toBeVisible();
  });

  test('renders all 5 top-level tabs', async ({ page }) => {
    for (const label of TOP_TABS) {
      await expect(
        page.getByRole('button', { name: label, exact: true }).first()
      ).toBeVisible();
    }
  });

  test('Dashboard tab routes to /today', async ({ page }) => {
    await page.getByRole('button', { name: 'Dashboard', exact: true }).click();
    await expect(page).toHaveURL(/\/today$/);
  });

  test('Insights tab routes to /insights', async ({ page }) => {
    await page.getByRole('button', { name: 'Insights', exact: true }).click();
    await expect(page).toHaveURL(/\/insights(\/|$)/);
  });

  test('Activity tab routes to /activity', async ({ page }) => {
    await page.getByRole('button', { name: 'Activity', exact: true }).click();
    await expect(page).toHaveURL(/\/activity(\/|$)/);
  });

  test('Agents tab routes to /agents', async ({ page }) => {
    await page.getByRole('button', { name: 'Agents', exact: true }).first().click();
    await expect(page).toHaveURL(/\/agents(\/|$)/);
  });

  test('System tab routes to /system', async ({ page }) => {
    await page.getByRole('button', { name: 'System', exact: true }).first().click();
    await expect(page).toHaveURL(/\/system(\/|$)/);
  });

  test('clicking the logo returns to /today', async ({ page }) => {
    await page.getByRole('button', { name: 'System', exact: true }).first().click();
    await page.getByRole('button', { name: /Go to Today/i }).click();
    await expect(page).toHaveURL(/\/today$/);
  });
});

test.describe('Sub-navigation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Dashboard', exact: true }).waitFor({ timeout: 10000 });
  });

  test('System has sub-tabs (Projects, Errors, Storage, Plugins)', async ({ page }) => {
    await page.getByRole('button', { name: 'System', exact: true }).first().click();
    const subnav = page.getByRole('navigation', { name: /Sub navigation/i });
    await expect(subnav.getByRole('button', { name: 'Projects', exact: true })).toBeVisible();
    await expect(subnav.getByRole('button', { name: 'Errors', exact: true })).toBeVisible();
    await expect(subnav.getByRole('button', { name: 'Storage', exact: true })).toBeVisible();
    await expect(subnav.getByRole('button', { name: 'Plugins', exact: true })).toBeVisible();
  });

  test('Activity has sub-tabs (Changes, Search)', async ({ page }) => {
    await page.getByRole('button', { name: 'Activity', exact: true }).click();
    const subnav = page.getByRole('navigation', { name: /Sub navigation/i });
    await expect(subnav.getByRole('button', { name: 'Changes', exact: true })).toBeVisible();
    await expect(subnav.getByRole('button', { name: 'Search', exact: true })).toBeVisible();
  });

  test('Agents has sub-tabs (Conversations, Models)', async ({ page }) => {
    await page.getByRole('button', { name: 'Agents', exact: true }).first().click();
    const subnav = page.getByRole('navigation', { name: /Sub navigation/i });
    await expect(subnav.getByRole('button', { name: 'Conversations', exact: true })).toBeVisible();
    await expect(subnav.getByRole('button', { name: 'Models', exact: true })).toBeVisible();
  });

  test('Dashboard, Insights, and Activity all expose a sub-nav', async ({ page }) => {
    // Post-refactor every top-level tab except a few labs has at least one
    // sub-tab — the previous "no sub-tab" trio (Dashboard, Insights, Code
    // Changes) doesn't exist anymore. Surface the new contract instead.
    for (const label of ['Dashboard', 'Insights', 'Activity']) {
      await page.getByRole('button', { name: label, exact: true }).first().click();
      await expect(
        page.getByRole('navigation', { name: /Sub navigation/i })
      ).toBeVisible();
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
    // /api/health populates the version pill asynchronously — give it a
    // generous window on cold-started test backends.
    await expect(page.locator('footer').getByText(/^Raven v\d+\.\d+\.\d+$/)).toBeVisible({
      timeout: 15000
    });
  });

  test('shows the live monitoring indicator', async ({ page }) => {
    await expect(
      page.locator('footer').getByText(/Monitoring Active|Disconnected/)
    ).toBeVisible();
  });

  test('has About / Design / Roadmap / Diagnostic nav links', async ({ page }) => {
    // Footer nav post-refactor: About / Design / Roadmap / Diagnostic /
    // Feedback / GitHub / Settings / theme / monitoring indicator. The old
    // "System" footer link was dropped — System lives in the header tabs.
    const footer = page.locator('footer');
    for (const label of ['About', 'Design', 'Roadmap', 'Diagnostic']) {
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
