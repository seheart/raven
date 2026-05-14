import { test, expect } from '@playwright/test';

/**
 * User-Story E2E
 *
 * High-level flows phrased as "as a developer, I want to…" — kept lean so
 * regressions surface as named stories rather than a wall of selector noise.
 * Updated for the May 2026 IA refactor: top-level nav is Dashboard / Activity
 * / Agents / Insights / System; the old History and Analysis tabs are
 * rehomed under Activity (timeline, files, search) and split between Agents
 * (models, performance) and Insights (costs/trends).
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
  test.setTimeout(60000);
  test.beforeEach(({ page }) => gotoDashboard(page));

  test('the dashboard heading and chrome are visible', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible({
      timeout: 25000
    });
    // PageHeader internally renders a <header> — use the banner role to pin
    // the assertion to the top-level Header.svelte.
    await expect(page.getByRole('banner')).toBeVisible();
    await expect(page.locator('footer')).toBeVisible();
  });

  test('first-run wizard does not block me when seen', async ({ page }) => {
    await expect(page.locator('[role="dialog"][aria-modal="true"]')).toHaveCount(0);
  });

  test('the active models card mounts on the dashboard', async ({ page }) => {
    await expect(page.getByText('Active Models', { exact: true })).toBeVisible({ timeout: 25000 });
  });
});

test.describe('Story: I can read storage usage', () => {
  test.setTimeout(60000);
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
  // History was rehomed under Activity in the May 2026 IA refactor.
  // Timeline, Files, and Search all live as Activity sub-tabs now.
  test.setTimeout(60000);
  test.beforeEach(({ page }) => gotoDashboard(page));

  test('Activity → Live loads the default view', async ({ page }) => {
    await page.getByRole('button', { name: 'Activity', exact: true }).click();
    await expect(page).toHaveURL(/\/activity(\/|$)/);
    await expect(
      page
        .getByRole('navigation', { name: /Sub navigation/i })
        .getByRole('button', { name: 'Live', exact: true })
    ).toBeVisible();
  });

  test('Activity → Timeline routes through', async ({ page }) => {
    await page.getByRole('button', { name: 'Activity', exact: true }).click();
    await page
      .getByRole('navigation', { name: /Sub navigation/i })
      .getByRole('button', { name: 'Timeline', exact: true })
      .click();
    await expect(page).toHaveURL(/\/activity\/timeline$/);
  });

  test('Activity → Search routes through', async ({ page }) => {
    await page.getByRole('button', { name: 'Activity', exact: true }).click();
    await page
      .getByRole('navigation', { name: /Sub navigation/i })
      .getByRole('button', { name: 'Search', exact: true })
      .click();
    await expect(page).toHaveURL(/\/activity\/search$/);
  });
});

test.describe('Story: I can check analysis pages', () => {
  // The old Analysis tab was split: Token Usage moved to Insights → Costs,
  // Models and Performance moved to Agents.
  test.setTimeout(60000);
  test.beforeEach(({ page }) => gotoDashboard(page));

  test('Insights → Costs routes through (was Analysis → Token Usage)', async ({ page }) => {
    await page.getByRole('button', { name: 'Insights', exact: true }).click();
    await page
      .getByRole('navigation', { name: /Sub navigation/i })
      .getByRole('button', { name: 'Costs', exact: true })
      .click();
    await expect(page).toHaveURL(/\/insights\/costs$/);
  });

  test('Agents → Models routes through (was Analysis → Models)', async ({ page }) => {
    await page.getByRole('button', { name: 'Agents', exact: true }).first().click();
    await page
      .getByRole('navigation', { name: /Sub navigation/i })
      .getByRole('button', { name: 'Models', exact: true })
      .click();
    await expect(page).toHaveURL(/\/agents\/models$/);
  });
});

test.describe('Story: rapid navigation does not break the chrome', () => {
  test.setTimeout(60000);
  test.beforeEach(({ page }) => gotoDashboard(page));

  test('hammering tabs leaves the header intact', async ({ page }) => {
    const labels = ['System', 'Activity', 'Agents', 'Insights', 'Dashboard'];
    for (let i = 0; i < 2; i++) {
      for (const label of labels) {
        await page.getByRole('button', { name: label, exact: true }).first().click();
      }
    }
    await expect(page.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible({
      timeout: 25000
    });
    await expect(page.locator('footer')).toBeVisible();
  });
});

test.describe('Story: backend stays reachable through the app', () => {
  test.setTimeout(60000);
  test.beforeEach(({ page }) => gotoDashboard(page));

  test('the dashboard issues at least one /api/dashboard-stats call', async ({ page }) => {
    const responsePromise = page.waitForResponse(
      r => r.url().includes('/api/dashboard-stats'),
      { timeout: 15000 }
    );
    await page.reload();
    const r = await responsePromise;
    expect(r.status()).toBeLessThan(500);
  });

  test('switching to Agents hits its data endpoints', async ({ page }) => {
    // AgentMonitoringPage fetches /agents and related stats on mount. Any
    // 2xx/3xx/4xx (i.e. < 500) on an agent-flavored endpoint is enough
    // proof the page wired up to the backend.
    const responsePromise = page.waitForResponse(
      r => /\/api\/(agents|agent-stats|sessions|sub-agents)/.test(r.url()),
      { timeout: 15000 }
    );
    await page.getByRole('button', { name: 'Agents', exact: true }).first().click();
    const r = await responsePromise;
    expect(r.status()).toBeLessThan(500);
  });
});

test.describe('Story: theme toggle persists across reload', () => {
  test.setTimeout(60000);
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
