/**
 * Plan-limits burn-down math.
 *
 * The service reads token_usage through the repository and reports 5h-window
 * usage vs an (estimated) plan budget, an hourly burn rate, and a projected
 * exhaustion time. These tests seed rows directly and pin the arithmetic.
 */

import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { RavenDB } from '../../dist/db.js';
import { createTokenUsageRepository } from '../../dist/repositories/token-usage-repository.js';
import { createPlanLimitsService } from '../../dist/services/plan-limits-service.js';

let db;
let tmpDir;
let service;

function seedUsage(minutesAgo, costUsd) {
  const ts = new Date(Date.now() - minutesAgo * 60 * 1000).toISOString();
  db.db
    .prepare(
      `INSERT INTO token_usage
         (timestamp, session_id, project_name, model, input_tokens, output_tokens,
          cache_creation_tokens, cache_read_tokens, estimated_cost_usd)
       VALUES (?, 'sess-1', 'proj', 'claude-sonnet-5', 1000, 500, 0, 0, ?)`
    )
    .run(ts, costUsd);
}

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'raven-limits-test-'));
  db = new RavenDB(join(tmpDir, 'test.db'));
  service = createPlanLimitsService(createTokenUsageRepository(db));
});

afterEach(() => {
  if (db) db.close();
  if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
});

describe('plan limits snapshot', () => {
  test('idle database → empty window, no projection', () => {
    const snap = service.snapshot('max_5x');
    expect(snap.estimated).toBe(true);
    expect(snap.window.start).toBeNull();
    expect(snap.window.usage_usd).toBe(0);
    expect(snap.window.projected_exhaustion).toBeNull();
    expect(snap.window.on_pace_to_hit_cap).toBe(false);
    expect(snap.weekly.usage_usd).toBe(0);
  });

  test('usage inside the window is summed and pct computed against the plan budget', () => {
    seedUsage(120, 5); // 2h ago
    seedUsage(30, 2); // 30m ago
    const snap = service.snapshot('max_5x'); // default budget $35
    expect(snap.window.usage_usd).toBeCloseTo(7, 2);
    expect(snap.window.budget_usd).toBe(35);
    expect(snap.window.pct_used).toBeCloseTo(20, 1);
    // Window anchored at the earliest row inside the last 5h (~2h ago),
    // so it resets ~3h from now.
    const resetMs = Date.parse(snap.window.resets_at) - Date.now();
    expect(resetMs).toBeGreaterThan(2.5 * 60 * 60 * 1000);
    expect(resetMs).toBeLessThan(3.5 * 60 * 60 * 1000);
  });

  test('usage older than 5h does not open a window', () => {
    seedUsage(6 * 60, 10); // 6h ago
    const snap = service.snapshot('pro');
    expect(snap.window.start).toBeNull();
    expect(snap.window.usage_usd).toBe(0);
    // ...but it still counts toward the rolling week.
    expect(snap.weekly.usage_usd).toBeCloseTo(10, 2);
  });

  test('burn rate is the last hour of spend and projects exhaustion', () => {
    seedUsage(30, 10); // $10 in the last hour → $10/h burn
    const snap = service.snapshot('pro'); // budget $18 → $8 left → ~48min
    expect(snap.window.burn_rate_usd_per_hour).toBeCloseTo(10, 2);
    expect(snap.window.projected_exhaustion).not.toBeNull();
    const minutesOut = (Date.parse(snap.window.projected_exhaustion) - Date.now()) / 60000;
    expect(minutesOut).toBeGreaterThan(40);
    expect(minutesOut).toBeLessThan(56);
    expect(snap.window.on_pace_to_hit_cap).toBe(true);
  });

  test('custom budget override wins over the plan default', () => {
    seedUsage(10, 50);
    const snap = service.snapshot('pro', 100);
    expect(snap.window.budget_usd).toBe(100);
    expect(snap.window.pct_used).toBeCloseTo(50, 1);
  });

  test('weekly budget is only reported when the user supplies one', () => {
    seedUsage(60, 70);
    const without = service.snapshot('max_20x');
    expect(without.weekly.budget_usd).toBeNull();
    expect(without.weekly.pct_used).toBeNull();
    const withBudget = service.snapshot('max_20x', undefined, 140);
    expect(withBudget.weekly.budget_usd).toBe(140);
    expect(withBudget.weekly.pct_used).toBeCloseTo(50, 1);
  });
});
