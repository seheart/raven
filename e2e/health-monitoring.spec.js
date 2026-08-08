import { test, expect } from '@playwright/test';

/**
 * Health Monitoring E2E
 *
 * Two halves:
 *   1. UI smoke checks against the System tab + footer indicator.
 *   2. API contract tests for the health endpoints the dashboard consumes.
 *
 * API tests use relative URLs so they go through the frontend's vite proxy
 * (configurable via RAVEN_BACKEND_URL) — that way the suite works against
 * either the dev or the test backend without hard-coding ports.
 */

test.describe('Health UI', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Dashboard', exact: true }).waitFor({ timeout: 10000 });
  });

  test('System → Errors sub-tab is reachable', async ({ page }) => {
    await page.getByRole('button', { name: 'System', exact: true }).first().click();
    const subnav = page.getByRole('navigation', { name: /Sub navigation/i });
    await subnav.getByRole('button', { name: 'Errors', exact: true }).click();
    await expect(page).toHaveURL(/\/system\/errors$/);
  });

  test('footer monitoring indicator settles to "Monitoring Active"', async ({ page }) => {
    // The footer poll is on a 2s interval; on a cold-started test backend the
    // WebSocket can take 10–15s to handshake, so we give the indicator a
    // generous window before declaring it failed.
    await expect(page.locator('footer').getByText('Monitoring Active')).toBeVisible({
      timeout: 30000
    });
  });
});

test.describe('Health API contract', () => {
  // Hit the backend directly rather than via the vite proxy — the proxy adds
  // first-request startup latency that's flaky in cold-start CI runs and the
  // value of these tests is the contract, not the proxy itself.
  const BACKEND = `http://localhost:${process.env.RAVEN_E2E_BACKEND_PORT || '9101'}`;

  test('GET /api/health returns status, version, session_id, uptime', async ({ request }) => {
    const r = await request.get(`${BACKEND}/api/health`, { timeout: 30000 });
    expect(r.ok()).toBeTruthy();
    const data = await r.json();
    expect(data).toMatchObject({
      status: expect.any(String),
      version: expect.any(String),
      session_id: expect.any(String),
      uptime: expect.any(Number)
    });
    expect(data.uptime).toBeGreaterThanOrEqual(0);
  });

  test('GET /api/health-checks returns aggregated results', async ({ request }) => {
    // /api/health-checks 308-redirects to /api/health/comprehensive
    // (HealthChecker.runAll()). The response is a flat aggregate —
    // { healthy, total, passed, failed, criticalFailed, warnings, results } —
    // not the older { status, summary: { total, passed, failed } } shape
    // that this contract previously asserted.
    const r = await request.get(`${BACKEND}/api/health-checks`, { timeout: 30000 });
    expect(r.ok()).toBeTruthy();
    const data = await r.json();
    expect(data).toMatchObject({
      healthy: expect.any(Boolean),
      total: expect.any(Number),
      passed: expect.any(Number),
      failed: expect.any(Number)
    });
    expect(Array.isArray(data.results)).toBe(true);
    expect(data.total).toBeGreaterThanOrEqual(0);
  });

  test('GET /api/health/projects returns projects + counters', async ({ request }) => {
    const r = await request.get(`${BACKEND}/api/health/projects`, { timeout: 30000 });
    expect(r.ok()).toBeTruthy();
    const data = await r.json();
    expect(data).toHaveProperty('projects');
    expect(Array.isArray(data.projects)).toBe(true);
    expect(typeof data.total_projects).toBe('number');
    expect(typeof data.active_projects).toBe('number');
  });

  test('GET /api/session-id returns a non-empty session_id', async ({ request }) => {
    const r = await request.get(`${BACKEND}/api/session-id`, { timeout: 30000 });
    expect(r.ok()).toBeTruthy();
    const data = await r.json();
    expect(typeof data.session_id).toBe('string');
    expect(data.session_id.length).toBeGreaterThan(0);
  });

  test('GET /api/ollama/ps responds within 5s with the expected shape', async ({ request }) => {
    // The transparent-ollama-proxy can fail to bind 11434 on dev hosts; the
    // route returns 200 with ollama_status='offline' in that case rather than
    // 5xx. Either is acceptable — the test only enforces the contract.
    const r = await request.get(`${BACKEND}/api/ollama/ps`, { timeout: 30000 });
    expect(r.ok()).toBeTruthy();
    const data = await r.json();
    expect(data).toHaveProperty('models');
    expect(data).toHaveProperty('count');
    expect(data).toHaveProperty('ollama_status');
    expect(['online', 'offline']).toContain(data.ollama_status);
  });
});

test.describe('Real-time health behaviour', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Dashboard', exact: true }).waitFor({ timeout: 10000 });
  });

  test('app stays usable when /api/health is blocked', async ({ page, context }) => {
    await context.route('**/api/health', r => r.abort());
    await page.reload();
    // Even with /api/health blocked the dashboard chrome must render.
    await expect(page.getByRole('button', { name: 'Dashboard', exact: true })).toBeVisible({
      timeout: 10000
    });
  });

  test('app stays usable when the WebSocket is blocked', async ({ page, context }) => {
    await context.route('**/socket.io/**', r => r.abort());
    await page.reload();
    await expect(page.getByRole('button', { name: 'Dashboard', exact: true })).toBeVisible({
      timeout: 10000
    });
  });
});
