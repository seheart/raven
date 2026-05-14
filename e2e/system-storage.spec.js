import { test, expect } from '@playwright/test';

/**
 * System → Storage E2E
 *
 * Guards two recent regressions:
 *   1. The "tracked files" count silently rendered as "—" because the page
 *      gated the value behind `projectDisk?.totals` without a fallback for
 *      the still-loading state.
 *   2. The Raven DB size tile rendered "0 B" on hosts where the database
 *      file existed but its size hadn't been reported yet.
 *
 * The spec asserts both tiles display real values, not their placeholder
 * fallbacks.
 */

test.describe('System → Storage sub-tab', () => {
  test.setTimeout(60000);

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Dashboard', exact: true }).waitFor({ timeout: 15000 });
    await page.getByRole('button', { name: 'System', exact: true }).first().click();
    await page
      .getByRole('navigation', { name: /Sub navigation/i })
      .getByRole('button', { name: 'Storage', exact: true })
      .click();
    await expect(page).toHaveURL(/\/system\/storage$/);
  });

  test('renders the "Storage" page heading', async ({ page }) => {
    // Two heading nodes can briefly say "Storage": the PlaceholderPage shown
    // while the lazy chunk loads, and the real SystemStoragePage. Wait for
    // the description copy that's unique to the loaded page.
    await expect(
      page.getByText('Database sizes, project usage, and retention')
    ).toBeVisible({ timeout: 25000 });
  });

  test('tracked files tile displays a value (not "—" / not empty)', async ({ page }) => {
    // Two heading nodes can briefly say "Storage": the PlaceholderPage shown
    // while the lazy chunk loads, and the real SystemStoragePage. Wait for
    // the description copy that's unique to the loaded page.
    await expect(
      page.getByText('Database sizes, project usage, and retention')
    ).toBeVisible({ timeout: 25000 });
    // The tile label flips between "Files on disk" (post-scan) and
    // "Tracked file events" (pre-scan). Either is fine — both must render
    // a numeric count instead of the loading-dash fallback.
    const label = page.getByText(/^(Files on disk|Tracked file events)$/).first();
    await expect(label).toBeVisible({ timeout: 15000 });

    const card = label.locator('..');
    const value = await card.locator('.font-mono').first().textContent();
    const cleaned = (value || '').trim();

    expect(cleaned).not.toBe('');
    expect(cleaned).not.toBe('—');
    // The disk scan can briefly render "…" before resolving — allow it
    // only if the post-scan value also comes through within the timeout.
    if (cleaned === '…') {
      await expect(card.locator('.font-mono').first()).not.toHaveText('…', {
        timeout: 10000
      });
    }
  });

  test('Raven DB size tile displays a non-empty byte value', async ({ page }) => {
    // Two heading nodes can briefly say "Storage": the PlaceholderPage shown
    // while the lazy chunk loads, and the real SystemStoragePage. Wait for
    // the description copy that's unique to the loaded page.
    await expect(
      page.getByText('Database sizes, project usage, and retention')
    ).toBeVisible({ timeout: 25000 });
    const label = page.getByText('Raven DB', { exact: true });
    await expect(label).toBeVisible({ timeout: 15000 });

    const card = label.locator('..');
    const value = await card.locator('.font-mono').first().textContent();
    const cleaned = (value || '').trim();

    expect(cleaned).not.toBe('');
    expect(cleaned).not.toBe('—');
    // formatBytes always returns "<n> <unit>" with units in B / KB / MB / GB.
    expect(cleaned).toMatch(/\d/);
    expect(cleaned).toMatch(/\b(B|KB|MB|GB)\b/);

    // The DB file always exists once the test backend has booted, so the
    // size should be a positive value. "0 B" is the silent-failure signature.
    const match = cleaned.match(/^([\d.,]+)\s*(B|KB|MB|GB)/);
    expect(match).not.toBeNull();
    const numeric = parseFloat((match?.[1] || '0').replace(/,/g, ''));
    expect(numeric).toBeGreaterThan(0);
  });
});
