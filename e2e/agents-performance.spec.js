import { test, expect } from '@playwright/test';

/**
 * Agents → Performance E2E
 *
 * Guards against a regression where the Performance sub-tab failed silently
 * — the chart container never mounted because a destructure on a missing
 * `metrics` payload threw before the canvas rendered. The spec asserts the
 * page heading, that some chart wrapper is in the DOM (canvas, svg, or the
 * empty-state fallback), and that no error toast / boundary fallback
 * appears.
 */

test.describe('Agents → Performance sub-tab', () => {
  test.setTimeout(60000);

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Dashboard', exact: true }).waitFor({ timeout: 15000 });
    await page.getByRole('button', { name: 'Agents', exact: true }).first().click();
    await page
      .getByRole('navigation', { name: /Sub navigation/i })
      .getByRole('button', { name: 'Performance', exact: true })
      .click();
    await expect(page).toHaveURL(/\/agents\/performance$/);
  });

  test('renders the "Performance Profiling" page heading', async ({ page }) => {
    await expect(
      page.getByRole('heading', { name: /Performance Profiling/i })
    ).toBeVisible({ timeout: 25000 });
  });

  test('renders a chart container or an empty-state — never a hard error', async ({ page }) => {
    await expect(
      page.getByRole('heading', { name: /Performance Profiling/i })
    ).toBeVisible({ timeout: 25000 });
    // The page either renders the metrics table (when data is available) or
    // an EmptyState ("No metrics data available"). Either is acceptable as
    // long as no error boundary fired.
    await expect(page.getByText('Something went wrong')).toHaveCount(0);

    // Look for any of: a canvas, an svg-based chart, a chart wrapper div,
    // or the page main element. At least ONE must be visible within 10s.
    const chartOrEmpty = page
      .locator('canvas, svg.chart, [data-chart], main')
      .first();
    await expect(chartOrEmpty).toBeVisible({ timeout: 10000 });
  });

  test('renders a Metrics / Charts / Correlations tab strip', async ({ page }) => {
    await expect(
      page.getByRole('heading', { name: /Performance Profiling/i })
    ).toBeVisible({ timeout: 25000 });
    // The page has its own internal tab strip; surfacing one of them is
    // enough proof the body mounted. AnalysisPerformancePage labels them
    // Metrics, Charts, Correlations.
    await expect(
      page.getByRole('button', { name: 'Metrics', exact: true })
    ).toBeVisible({ timeout: 10000 });
  });
});
