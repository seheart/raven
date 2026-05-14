import { test, expect } from '@playwright/test';

/**
 * Agents → Monitor E2E
 *
 * Guards a recent regression where the three summary cards (Total Agents,
 * Currently Running, Idle Agents) silently rendered as 0 because the backend
 * didn't return `is_running` and the frontend's `.catch(() => [])` swallowed
 * the fault. The fix removed the silent swallow and added confidence
 * normalisation; this spec pins the contract — the cards must render numeric
 * values (or skeleton-loaders that resolve to numerics), never an empty
 * string or a "—" placeholder.
 */

test.describe('Agents → Monitor sub-tab', () => {
  // Cold-start: the dynamic import + Chart.js chunk takes ~15s on the
  // test backend before the page heading paints. 30s default is tight.
  test.setTimeout(60000);

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Dashboard', exact: true }).waitFor({ timeout: 15000 });
    await page.getByRole('button', { name: 'Agents', exact: true }).first().click();
    // The Monitor sub-tab has id '' so it lands on bare /agents.
    await expect(page).toHaveURL(/\/agents$/);
  });

  test('renders the "Live Agents" page heading', async ({ page }) => {
    await expect(
      page.getByRole('heading', { name: /Live Agents/i })
    ).toBeVisible({ timeout: 25000 });
  });

  test('summary cards render numeric values (not "—" / not empty / not "NaN")', async ({ page }) => {
    // Wait for the page heading first so we know the lazy chunk landed.
    await expect(
      page.getByRole('heading', { name: /Live Agents/i })
    ).toBeVisible({ timeout: 25000 });
    // Then wait for the cards to come out of their loading skeleton.
    await expect(page.getByText('Total Agents', { exact: true })).toBeVisible({
      timeout: 15000
    });
    await expect(page.getByText('Currently Running', { exact: true })).toBeVisible();
    await expect(page.getByText('Idle Agents', { exact: true })).toBeVisible();

    // Each card label is followed by a font-mono numeric readout. We grab
    // the text node directly via the label's parent container.
    const labels = ['Total Agents', 'Currently Running', 'Idle Agents'];
    for (const label of labels) {
      const card = page.locator('div').filter({ hasText: new RegExp(`^${label}$`) }).first().locator('..');
      const value = await card.locator('.font-mono').first().textContent();
      const cleaned = (value || '').trim();
      expect(cleaned).not.toBe('');
      expect(cleaned).not.toBe('—');
      expect(cleaned).not.toBe('NaN');
      // Must parse to a finite number once commas are stripped.
      expect(Number.isFinite(Number(cleaned.replace(/,/g, '')))).toBe(true);
    }
  });

  test('renders an agents list section (Currently Running or All Agents)', async ({ page }) => {
    await expect(
      page.getByRole('heading', { name: /Live Agents/i })
    ).toBeVisible({ timeout: 25000 });
    await expect(
      page.getByText(/Currently Running Agents/i)
    ).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/All Agents Status/i)).toBeVisible();
  });
});
