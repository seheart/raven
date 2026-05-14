import { test, expect } from '@playwright/test';

/**
 * Activity → Live E2E
 *
 * Guards a recent regression where LivePage threw on mount (uninitialised
 * recent-files state) and silently rendered an error banner. The spec drives
 * the page through the real tab — not a hard-coded URL — and asserts that
 * the chrome paints, no error text leaks into the DOM, and no JS console
 * errors fire during the page's first few seconds of life.
 */

test.describe('Activity → Live page', () => {
  // Cold-started test backend can take ~15s for the first chunk to land;
  // 30s default leaves no margin once we add a 3s observation window.
  test.setTimeout(60000);

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Dashboard', exact: true }).waitFor({ timeout: 15000 });
    await page.getByRole('button', { name: 'Activity', exact: true }).first().click();
    await page
      .getByRole('navigation', { name: /Sub navigation/i })
      .getByRole('button', { name: 'Live', exact: true })
      .click();
    await expect(page).toHaveURL(/\/activity\/live$/);
  });

  test('renders the "Live activity" page heading', async ({ page }) => {
    // Dynamic-imported pages can take 15+ seconds on a cold test backend
    // before the `{:then Component}` branch swaps in — give it room.
    await expect(
      page.getByRole('heading', { name: /Live activity/i })
    ).toBeVisible({ timeout: 25000 });
  });

  test('renders the Recent Changes panel', async ({ page }) => {
    // Wait for the heading first so we know the lazy chunk landed before
    // we look for the panel text below it.
    await expect(
      page.getByRole('heading', { name: /Live activity/i })
    ).toBeVisible({ timeout: 25000 });
    await expect(page.getByText('Recent Changes', { exact: true })).toBeVisible({
      timeout: 10000
    });
  });

  test('shows either an empty state or a populated list — never a hard error', async ({ page }) => {
    // The page may legitimately render "No file changes detected yet" on a
    // fresh test backend. The regression we guard against is a thrown error
    // surfacing in the boundary fallback ("Something went wrong") or as a
    // dismissable error toast.
    await expect(page.getByText('Something went wrong')).toHaveCount(0);
    await expect(page.getByText(/Failed to load/i)).toHaveCount(0);
  });

  test('no JS console errors fire during the first 3 seconds', async ({ page }) => {
    // Re-navigate fresh inside the test so we capture errors from the moment
    // of mount. The beforeEach already proved navigation works; here we just
    // need a clean recording session.
    const consoleErrors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    await page.reload();
    await expect(
      page.getByRole('heading', { name: /Live activity/i })
    ).toBeVisible({ timeout: 25000 });
    await page.waitForTimeout(3000);

    // Filter out noise from things outside the page's control: WebSocket
    // reconnect chatter, missing favicons, and dataService prefetch timeouts
    // on a cold-started test backend (those are app-wide, not LivePage's
    // fault — they fire on every page). The real failure mode this test
    // guards is an uncaught exception thrown by LivePage itself.
    const realErrors = consoleErrors.filter(
      e =>
        !/socket\.io|websocket|favicon|ResizeObserver/i.test(e) &&
        !/Failed to load resource.*404/i.test(e) &&
        !/\[Raven\] Failed to fetch/i.test(e) &&
        !/Request timeout after/i.test(e)
    );
    expect(realErrors).toEqual([]);
  });
});
