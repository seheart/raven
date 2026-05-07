/**
 * Tests for the Baselines service — per-model p50/p95 + anomaly scoring.
 */

import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import { createBaselinesService } from '../../dist/services/baselines-service.js';
import { RavenDB } from '../../dist/db.js';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

let db;
let tmpDir;
let svc;

beforeAll(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'raven-baselines-'));
  db = new RavenDB(join(tmpDir, 'test.db'));
  svc = createBaselinesService(db);

  const insTok = db.db.prepare(
    `INSERT INTO token_usage (timestamp, session_id, project_name, model, input_tokens, output_tokens, estimated_cost_usd)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  );
  const insLat = db.db.prepare(
    `INSERT INTO api_latency (timestamp, session_id, project_name, model, latency_ms)
     VALUES (?, ?, ?, ?, ?)`
  );
  const now = Date.now();
  function iso(daysAgo, hour = 12) {
    const d = new Date(now - daysAgo * 86_400_000);
    d.setHours(hour, 0, 0, 0);
    return d.toISOString();
  }
  function isoMin(minutesAgo) {
    return new Date(now - minutesAgo * 60_000).toISOString();
  }

  // Baseline window — claude-opus across past 6 days, latency ~ 2000ms,
  // cost ~ $0.50, output ~ 1000.
  for (let d = 1; d <= 6; d++) {
    for (let i = 0; i < 8; i++) {
      const t = iso(d, 8 + i);
      insTok.run(t, `s-${d}-${i}`, 'demo', 'claude-opus-4-7', 5000, 1000, 0.5);
      insLat.run(t, `s-${d}-${i}`, 'demo', 'claude-opus-4-7', 2000);
    }
  }

  // Recent window (last 30 min) — same model, but latency 5000ms (2.5×),
  // cost 1.5 (3×), output 3000 (3×). Should flag all three.
  for (let i = 0; i < 6; i++) {
    insTok.run(isoMin(20 - i), `s-recent-${i}`, 'demo', 'claude-opus-4-7', 5000, 3000, 1.5);
    insLat.run(isoMin(20 - i), `s-recent-${i}`, 'demo', 'claude-opus-4-7', 5000);
  }

  // A "calm" model — claude-haiku — recent activity at baseline rate.
  for (let d = 1; d <= 6; d++) {
    for (let i = 0; i < 8; i++) {
      const t = iso(d, 8 + i);
      insTok.run(t, `h-${d}-${i}`, 'demo', 'claude-haiku-4-5', 1000, 200, 0.05);
      insLat.run(t, `h-${d}-${i}`, 'demo', 'claude-haiku-4-5', 800);
    }
  }
  for (let i = 0; i < 5; i++) {
    insTok.run(isoMin(15 - i), `h-recent-${i}`, 'demo', 'claude-haiku-4-5', 1000, 200, 0.05);
    insLat.run(isoMin(15 - i), `h-recent-${i}`, 'demo', 'claude-haiku-4-5', 800);
  }
});

afterAll(() => {
  if (db) db.close();
  if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
});

describe('BaselinesService', () => {
  test('list() returns one row per model with p50/p95 fields', () => {
    const baselines = svc.list();
    const models = baselines.map(b => b.model);
    expect(models).toContain('claude-opus-4-7');
    expect(models).toContain('claude-haiku-4-5');
    const opus = baselines.find(b => b.model === 'claude-opus-4-7');
    expect(opus.latency_p95_ms).toBeGreaterThan(0);
    expect(opus.cost_p95_usd).toBeGreaterThan(0);
    expect(opus.output_p95).toBeGreaterThan(0);
    expect(opus.first_seen).toBeTruthy();
  });

  test('anomalies() flags a model whose recent stats are 2× baseline', () => {
    const anomalies = svc.anomalies();
    const opus = anomalies.find(a => a.model === 'claude-opus-4-7');
    expect(opus).toBeDefined();
    expect(opus.flagged.length).toBeGreaterThan(0);
    expect(opus.flagged).toContain('latency');
    expect(opus.flagged).toContain('cost');
    expect(opus.flagged).toContain('output');
    expect(opus.summary).toMatch(/drifting/);
    expect(opus.worst_ratio).toBeGreaterThanOrEqual(2);
  });

  test('anomalies() does NOT flag a model running at its baseline', () => {
    const anomalies = svc.anomalies();
    const haiku = anomalies.find(a => a.model === 'claude-haiku-4-5');
    expect(haiku).toBeDefined();
    expect(haiku.flagged.length).toBe(0);
    expect(haiku.summary).toMatch(/within normal/);
  });

  test('anomalies() sorts flagged entries first', () => {
    const anomalies = svc.anomalies();
    const flaggedFirst = anomalies.findIndex(a => a.flagged.length === 0);
    const lastFlagged = anomalies.findLastIndex
      ? anomalies.findLastIndex(a => a.flagged.length > 0)
      : (() => {
          for (let i = anomalies.length - 1; i >= 0; i--) {
            if (anomalies[i].flagged.length > 0) return i;
          }
          return -1;
        })();
    if (flaggedFirst !== -1 && lastFlagged !== -1) {
      expect(lastFlagged).toBeLessThan(flaggedFirst);
    }
  });
});
