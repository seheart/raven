import { test, expect } from '@playwright/test';

/**
 * Insights → Costs E2E
 *
 * Guards against the regression where the top-line cost tile silently
 * rendered "—" because `summary.total_cost_usd` was undefined and
 * `formatCost` fell through to its dash fallback. The fix wired the
 * subscription-plan path through formatCost(0) so users on plans always
 * see "$0.00" rather than a placeholder.
 */

test.describe('Insights → Costs sub-tab', () => {
  test.setTimeout(60000);

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Dashboard', exact: true }).waitFor({ timeout: 15000 });
    await page.getByRole('button', { name: 'Insights', exact: true }).first().click();
    await page
      .getByRole('navigation', { name: /Sub navigation/i })
      .getByRole('button', { name: 'Costs', exact: true })
      .click();
    await expect(page).toHaveURL(/\/insights\/costs$/);
  });

  test('renders the "Costs" page heading', async ({ page }) => {
    await expect(
      page.getByRole('heading', { name: /Costs/i })
    ).toBeVisible({ timeout: 25000 });
  });

  test('top-line cost tile displays a value (never silent "—")', async ({ page }) => {
    await expect(
      page.getByRole('heading', { name: /Costs/i })
    ).toBeVisible({ timeout: 25000 });
    // Either "Est. Spend" (API mode) or "API equivalent" (subscription mode)
    // is the headline tile — both render the same formatCost output below
    // the label.
    const label = page.getByText(/^(Est\. Spend|API equivalent)$/).first();
    await expect(label).toBeVisible({ timeout: 15000 });

    const card = label.locator('..');
    const value = await card.locator('.font-mono').first().textContent();
    const cleaned = (value || '').trim();

    expect(cleaned).not.toBe('');
    expect(cleaned).not.toBe('—');
    // The figure starts with a $ sign once formatCost has run. A bare "—"
    // is the silent-failure signature the fix corrected.
    expect(cleaned).toMatch(/^\$/);
  });

  test('renders the Requests tile', async ({ page }) => {
    await expect(
      page.getByRole('heading', { name: /Costs/i })
    ).toBeVisible({ timeout: 25000 });
    // The Requests tile uses the same skeleton; if it paints with a number
    // the rest of the summary grid is wired up too.
    await expect(page.getByText('Requests', { exact: true })).toBeVisible({
      timeout: 10000
    });
  });
});
