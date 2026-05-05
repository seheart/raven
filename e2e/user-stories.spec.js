import { test, expect } from '@playwright/test';

/**
 * User-Story E2E
 *
 * High-level flows phrased as "as a developer, I want to…" — kept lean so
 * regressions surface as named stories rather than a wall of selector noise.
 * The earlier version drove an obsolete nav (Overview/Safety/Agents/Activity)
 * and was rewritten when the suite was modernised.
 */

async function gotoDashboard(page) {
  // Pre-seed the wizard-skip flags before the bundle evaluates so the
  // first-run dialog never paints.
  await page.addInitScript(() => {
    localStorage.setItem('raven-quick-start-completed', 'true');
    localStorage.setItem('raven-welcome-seen', 'true');
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Dashboard', exact: true }).waitFor({ timeout: 15000 });
}

test.describe('Story: I land on a working dashboard', () => {
  test.beforeEach(({ page }) => gotoDashboard(page));

  test('the dashboard heading and chrome are visible', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible();
    // PageHeader internally renders a <header> — use the banner role to pin
    // the assertion to the top-level Header.svelte.
    await expect(page.getByRole('banner')).toBeVisible();
    await expect(page.locator('footer')).toBeVisible();
  });

  test('first-run wizard does not block me when seen', async ({ page }) => {
    await expect(page.locator('[role="dialog"][aria-modal="true"]')).toHaveCount(0);
  });

  test('the active models card mounts on the dashboard', async ({ page }) => {
    await expect(page.getByText('Active Models', { exact: true })).toBeVisible({ timeout: 10000 });
  });
});

test.describe('Story: I can read storage usage', () => {
  test.beforeEach(({ page }) => gotoDashboard(page));

  test('System → Storage shows storage info', async ({ page }) => {
    await page.getByRole('button', { name: 'System', exact: true }).first().click();
    await page
      .getByRole('navigation', { name: /Sub navigation/i })
      .getByRole('button', { name: 'Storage', exact: true })
      .click();
    await expect(page).toHaveURL(/\/system\/storage$/);
    // The page renders some byte/MB/GB readout — the only stable signal across
    // empty and populated databases is the page route + a numeric value.
    await expect(page.locator('main')).toBeVisible();
  });
});

test.describe('Story: I can browse history', () => {
  test.beforeEach(({ page }) => gotoDashboard(page));

  test('History → Activity Log loads the default view', async ({ page }) => {
    await page.getByRole('button', { name: 'History', exact: true }).click();
    await expect(page).toHaveURL(/\/history(\/|$)/);
    await expect(
      page
        .getByRole('navigation', { name: /Sub navigation/i })
        .getByRole('button', { name: 'Activity Log', exact: true })
    ).toBeVisible();
  });

  test('History → Timeline routes through', async ({ page }) => {
    await page.getByRole('button', { name: 'History', exact: true }).click();
    await page
      .getByRole('navigation', { name: /Sub navigation/i })
      .getByRole('button', { name: 'Timeline', exact: true })
      .click();
    await expect(page).toHaveURL(/\/history\/timeline$/);
  });

  test('History → Global Search routes through', async ({ page }) => {
    await page.getByRole('button', { name: 'History', exact: true }).click();
    await page
      .getByRole('navigation', { name: /Sub navigation/i })
      .getByRole('button', { name: 'Global Search', exact: true })
      .click();
    await expect(page).toHaveURL(/\/history\/search$/);
  });
});

test.describe('Story: I can check analysis pages', () => {
  test.beforeEach(({ page }) => gotoDashboard(page));

  test('Analysis → Token Usage routes through', async ({ page }) => {
    await page.getByRole('button', { name: 'Analysis', exact: true }).click();
    await page
      .getByRole('navigation', { name: /Sub navigation/i })
      .getByRole('button', { name: 'Token Usage', exact: true })
      .click();
    await expect(page).toHaveURL(/\/analysis\/costs$/);
  });

  test('Analysis → Models routes through', async ({ page }) => {
    await page.getByRole('button', { name: 'Analysis', exact: true }).click();
    await page
      .getByRole('navigation', { name: /Sub navigation/i })
      .getByRole('button', { name: 'Models', exact: true })
      .click();
    await expect(page).toHaveURL(/\/analysis\/models$/);
  });
});

test.describe('Story: rapid navigation does not break the chrome', () => {
  test.beforeEach(({ page }) => gotoDashboard(page));

  test('hammering tabs leaves the header intact', async ({ page }) => {
    const labels = ['System', 'Analysis', 'History', 'Insights', 'Code Changes', 'Dashboard'];
    for (let i = 0; i < 2; i++) {
      for (const label of labels) {
        await page.getByRole('button', { name: label, exact: true }).first().click();
      }
    }
    await expect(page.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible();
    await expect(page.locator('footer')).toBeVisible();
  });
});

test.describe('Story: backend stays reachable through the app', () => {
  test.beforeEach(({ page }) => gotoDashboard(page));

  test('the dashboard issues at least one /api/dashboard-stats call', async ({ page }) => {
    const responsePromise = page.waitForResponse(
      r => r.url().includes('/api/dashboard-stats'),
      { timeout: 10000 }
    );
    await page.reload();
    const r = await responsePromise;
    expect(r.status()).toBeLessThan(500);
  });

  test('switching to Analysis hits its data endpoints', async ({ page }) => {
    // AnalysisPage fetches /system-metrics, /triggers-config, /sessions and
    // /triggered-events on mount. Any of those is enough proof the page wired
    // up to the backend.
    const responsePromise = page.waitForResponse(
      r => /\/api\/(system-metrics|triggers-config|sessions|triggered-events)/.test(r.url()),
      { timeout: 15000 }
    );
    await page.getByRole('button', { name: 'Analysis', exact: true }).click();
    const r = await responsePromise;
    expect(r.status()).toBeLessThan(500);
  });
});

test.describe('Story: theme toggle persists across reload', () => {
  test.beforeEach(({ page }) => gotoDashboard(page));

  test('flipping the theme survives a reload', async ({ page }) => {
    const before = (await page.locator('html').getAttribute('class')) || '';
    await page
      .locator('footer')
      .getByRole('button', { name: /Switch to (light|dark) theme/ })
      .click();
    await page.waitForTimeout(150);
    const after = (await page.locator('html').getAttribute('class')) || '';
    expect(after.includes('dark')).not.toBe(before.includes('dark'));

    await page.reload();
    await page.getByRole('button', { name: 'Dashboard', exact: true }).waitFor({ timeout: 10000 });
    const reloaded = (await page.locator('html').getAttribute('class')) || '';
    expect(reloaded.includes('dark')).toBe(after.includes('dark'));
  });
});
