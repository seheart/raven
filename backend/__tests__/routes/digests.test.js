/**
 * Tests for the Digest service + /api/digests routes.
 */

import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import { createDigestsRouter } from '../../dist/routes/digests.js';
import { createDigestService } from '../../dist/services/digest-service.js';
import { RavenDB } from '../../dist/db.js';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

let app;
let db;
let tmpDir;
let svc;

// Anchor "now" inside the seeded week so the math is deterministic.
// 2026-04-29 is a Wednesday — so the ISO week starts Mon 2026-04-27 and
// ends Sun 2026-05-03 (UTC).
const NOW = new Date('2026-04-29T12:00:00Z');

function isoOnDay(daysFromMonday, hour = 12) {
  // weekStart = 2026-04-27 (Mon)
  const monday = new Date('2026-04-27T00:00:00Z');
  monday.setUTCDate(monday.getUTCDate() + daysFromMonday);
  monday.setUTCHours(hour, 0, 0, 0);
  return monday.toISOString();
}

function isoDaysBeforeWeek(daysBefore, hour = 10) {
  const t = new Date('2026-04-27T00:00:00Z');
  t.setUTCDate(t.getUTCDate() - daysBefore);
  t.setUTCHours(hour, 0, 0, 0);
  return t.toISOString();
}

beforeAll(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'raven-digests-'));
  db = new RavenDB(join(tmpDir, 'test.db'));
  svc = createDigestService(db);

  const insEvent = db.db.prepare(
    `INSERT INTO events (timestamp, filepath, change_type, project_name, session_id)
     VALUES (?, ?, ?, ?, ?)`
  );

  // Day 0 (Mon) — 4 events on raven, 1 session 'sess-mon' with span 60min
  insEvent.run(isoOnDay(0, 9), 'raven/a.ts', 'change', 'raven', 'sess-mon');
  insEvent.run(isoOnDay(0, 9.5), 'raven/b.ts', 'change', 'raven', 'sess-mon');
  insEvent.run(isoOnDay(0, 10), 'raven/c.ts', 'change', 'raven', 'sess-mon');
  insEvent.run(isoOnDay(0, 10), 'raven/a.ts', 'change', 'raven', 'sess-mon');

  // Day 1 — 5 events on raven across two sessions
  insEvent.run(isoOnDay(1, 9), 'raven/x.ts', 'change', 'raven', 'sess-tu1');
  insEvent.run(isoOnDay(1, 9.5), 'raven/y.ts', 'change', 'raven', 'sess-tu1');
  insEvent.run(isoOnDay(1, 14), 'raven/z.ts', 'change', 'raven', 'sess-tu2');
  insEvent.run(isoOnDay(1, 15), 'raven/z.ts', 'change', 'raven', 'sess-tu2');
  insEvent.run(isoOnDay(1, 16), 'raven/z.ts', 'change', 'raven', 'sess-tu2');

  // Day 2 — 3 events on raven
  insEvent.run(isoOnDay(2, 10), 'raven/p.ts', 'change', 'raven', 'sess-wed');
  insEvent.run(isoOnDay(2, 11), 'raven/q.ts', 'change', 'raven', 'sess-wed');
  insEvent.run(isoOnDay(2, 12), 'raven/r.ts', 'change', 'raven', 'sess-wed');

  // 'atf' returning project — last seen 10 days before the week starts
  insEvent.run(isoDaysBeforeWeek(10, 9), 'atf/old.js', 'change', 'atf', 'sess-old');
  // ... and now back this week, on day 2
  insEvent.run(isoOnDay(2, 14), 'atf/new.js', 'change', 'atf', 'sess-atf-back');
  insEvent.run(isoOnDay(2, 15), 'atf/new.js', 'change', 'atf', 'sess-atf-back');

  // Token usage rows — for cost + top model
  const insTok = db.db.prepare(
    `INSERT INTO token_usage (timestamp, session_id, project_name, model, input_tokens, output_tokens, estimated_cost_usd)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  );
  insTok.run(isoOnDay(0, 9), 'sess-mon', 'raven', 'claude-opus-4-7', 100, 200, 1.5);
  insTok.run(isoOnDay(1, 9), 'sess-tu1', 'raven', 'claude-opus-4-7', 200, 300, 2.0);
  insTok.run(isoOnDay(2, 10), 'sess-wed', 'raven', 'claude-sonnet-4-6', 50, 100, 0.5);

  app = express();
  app.use(express.json());
  app.use('/api/digests', createDigestsRouter(svc));
});

afterAll(() => {
  if (db) db.close();
  if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
});

describe('Digest Service', () => {
  test('produces a stable week_key + Mon-anchored bounds', () => {
    const d = svc.getOrCompute(NOW);
    expect(d.week_key).toMatch(/^\d{4}-W\d{2}$/);
    expect(d.week_start.startsWith('2026-04-27')).toBe(true);
    expect(d.week_end.startsWith('2026-05-03')).toBe(true);
  });

  test('tallies per-project totals and total events', () => {
    const d = svc.getOrCompute(NOW);
    expect(d.stats.events).toBe(14); // 4 + 5 + 3 + 2 (atf-back)
    const raven = d.stats.projects.find(p => p.project === 'raven');
    expect(raven).toMatchObject({ project: 'raven', events: 12, days_active: 3 });
    const atf = d.stats.projects.find(p => p.project === 'atf');
    expect(atf).toMatchObject({ project: 'atf', events: 2, days_active: 1 });
  });

  test('selects "returning" lead when a project comes back after >= 7 days', () => {
    const d = svc.getOrCompute(NOW);
    expect(d.lead.kind).toBe('returning');
    expect(d.lead.text).toMatch(/atf/);
    // atf was last seen 10 days BEFORE the week starts; first re-edit is on
    // day 2 of the week, so the elapsed gap to the comeback edit is 12 days.
    expect(d.lead.text).toMatch(/12 days/);
    expect(d.stats.returning_project).toEqual({ project: 'atf', days_since_last: 12 });
  });

  test('rolls up cost + top_model from token_usage', () => {
    const d = svc.getOrCompute(NOW);
    expect(d.stats.cost_usd).toBeCloseTo(4.0, 5);
    expect(d.stats.requests).toBe(3);
    expect(d.stats.top_model).toBe('claude-opus-4-7');
    expect(d.stats.top_model_requests).toBe(2);
  });

  test('beats include cost + files + model + days-active', () => {
    const d = svc.getOrCompute(NOW);
    const text = d.beats.map(b => b.text).join(' | ');
    expect(text).toMatch(/\$4\.00/);
    // Model is prettified for display ("claude-opus-4-7" → "Claude Opus 4.7"),
    // while stats.top_model keeps the raw id (asserted above).
    expect(text).toMatch(/Claude Opus 4\.7/);
    expect(text).toMatch(/3 of 7 days/);
  });

  test('caches identical results across calls inside the TTL', () => {
    const a = svc.getOrCompute(NOW);
    const b = svc.getOrCompute(NOW);
    expect(b.week_key).toEqual(a.week_key);
    expect(b.stats.events).toEqual(a.stats.events);
    // recompute() persists a fresh row even when cache is warm
    const c = svc.recompute(NOW);
    expect(c.week_key).toEqual(a.week_key);
  });

  test('quiet-week lead when the target window has no events', () => {
    const futureWeek = new Date('2027-01-04T12:00:00Z'); // arbitrary future Mon
    const d = svc.getOrCompute(futureWeek);
    expect(d.lead.kind).toBe('quiet-week');
    expect(d.stats.events).toBe(0);
    expect(d.beats.length).toBe(0);
  });
});

describe('Digest Routes', () => {
  test('GET /api/digests/weekly?at=ISO returns the digest', async () => {
    const res = await request(app).get('/api/digests/weekly?at=2026-04-29T12:00:00Z');
    expect(res.status).toBe(200);
    expect(res.body.week_key).toMatch(/^\d{4}-W\d{2}$/);
    expect(res.body.lead.kind).toBe('returning');
    expect(Array.isArray(res.body.beats)).toBe(true);
  });

  test('GET /api/digests/weekly with no `at` defaults to now', async () => {
    const res = await request(app).get('/api/digests/weekly');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('week_key');
  });

  test('GET /api/digests/weekly rejects an invalid `at`', async () => {
    const res = await request(app).get('/api/digests/weekly?at=not-a-date');
    expect(res.status).toBe(400);
  });

  test('POST /api/digests/weekly/recompute returns a fresh digest', async () => {
    const res = await request(app)
      .post('/api/digests/weekly/recompute')
      .send({ at: '2026-04-29T12:00:00Z' });
    expect(res.status).toBe(200);
    expect(res.body.week_key).toMatch(/^\d{4}-W\d{2}$/);
  });

  test('GET /api/digests/list returns persisted digests', async () => {
    // Make sure at least one digest is persisted.
    await request(app).get('/api/digests/weekly?at=2026-04-29T12:00:00Z');
    const res = await request(app).get('/api/digests/list?limit=5');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body[0]).toHaveProperty('week_key');
  });
});

describe('Daily Digest', () => {
  // The day-2 events (Wed) include a 12:00 UTC edit, which stays on the same
  // calendar day across all common timezones — so these assertions hold
  // regardless of the test machine's TZ (daily uses local-day boundaries).
  const DAY = new Date('2026-04-29T12:00:00Z');

  test('computes a well-formed digest for the day', () => {
    const d = svc.getDailyOrCompute(DAY);
    expect(d.day).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(typeof d.day_label).toBe('string');
    expect(typeof d.lead.text).toBe('string');
    expect(d.lead.text.length).toBeGreaterThan(0);
    expect(Array.isArray(d.beats)).toBe(true);
    expect(d.stats.events).toBeGreaterThanOrEqual(1);
    expect(typeof d.stats.top_project).toBe('string');
  });

  test('flags atf as a returning project after its multi-day gap', () => {
    const d = svc.getDailyOrCompute(DAY);
    // atf was last touched 12 days before its day-2 comeback edit.
    expect(d.stats.returning_project).not.toBeNull();
    expect(d.stats.returning_project.project).toBe('atf');
    expect(d.stats.returning_project.days_since_last).toBeGreaterThanOrEqual(2);
  });

  test('quiet lead when the day has no events', () => {
    const d = svc.getDailyOrCompute(new Date('2027-01-04T12:00:00Z'));
    expect(d.lead.kind).toBe('quiet');
    expect(d.stats.events).toBe(0);
    expect(d.beats.length).toBe(0);
  });

  test('GET /api/digests/daily?at=ISO returns the digest', async () => {
    const res = await request(app).get('/api/digests/daily?at=2026-04-29T12:00:00Z');
    expect(res.status).toBe(200);
    expect(res.body.day).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(res.body.lead).toHaveProperty('text');
    expect(Array.isArray(res.body.beats)).toBe(true);
  });

  test('GET /api/digests/daily rejects an invalid `at`', async () => {
    const res = await request(app).get('/api/digests/daily?at=not-a-date');
    expect(res.status).toBe(400);
  });

  test('POST /api/digests/daily/recompute returns a fresh digest', async () => {
    const res = await request(app)
      .post('/api/digests/daily/recompute')
      .send({ at: '2026-04-29T12:00:00Z' });
    expect(res.status).toBe(200);
    expect(res.body.day).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
