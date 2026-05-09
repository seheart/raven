/**
 * Tests for the Journey route — first-week vs current-week comparison.
 */

import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import { createJourneyRouter } from '../../dist/routes/journey.js';
import { createJourneyRepository } from '../../dist/repositories/journey-repository.js';
import { RavenDB } from '../../dist/db.js';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

let app;
let db;
let tmpDir;

beforeAll(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'raven-journey-'));
  db = new RavenDB(join(tmpDir, 'test.db'));

  const insEv = db.db.prepare(
    `INSERT INTO events (timestamp, filepath, change_type, project_name, session_id)
     VALUES (?, ?, ?, ?, ?)`
  );
  const insTok = db.db.prepare(
    `INSERT INTO token_usage (timestamp, session_id, project_name, model, input_tokens, output_tokens, estimated_cost_usd)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  );

  const now = Date.now();
  function iso(daysAgo, hour = 12) {
    const d = new Date(now - daysAgo * 86_400_000);
    d.setHours(hour, 0, 0, 0);
    return d.toISOString();
  }

  // First week: 30..23 days ago — 5 events on 'demo', 2 sessions, claude-haiku
  insEv.run(iso(30, 9), 'demo/a.ts', 'add', 'demo', 'fw-1');
  insEv.run(iso(30, 10), 'demo/b.ts', 'change', 'demo', 'fw-1');
  insEv.run(iso(28, 14), 'demo/c.ts', 'change', 'demo', 'fw-2');
  insEv.run(iso(27, 9), 'demo/d.ts', 'change', 'demo', 'fw-3');
  insEv.run(iso(25, 9), 'demo/e.ts', 'change', 'demo', 'fw-4');
  insTok.run(iso(30, 9), 'fw-1', 'demo', 'claude-haiku-4-5', 1000, 200, 0.05);
  insTok.run(iso(28, 14), 'fw-2', 'demo', 'claude-haiku-4-5', 2000, 400, 0.1);

  // Current week: last 7 days — many more events on 'raven', claude-opus.
  // Use daysAgo in 1..6 so all timestamps are reliably in the past
  // regardless of what time of day the suite runs.
  for (let i = 0; i < 30; i++) {
    const daysAgo = 1 + (i % 6);
    insEv.run(iso(daysAgo, 9 + (i % 8)), `raven/x${i}.ts`, 'change', 'raven', `cw-${i % 5}`);
  }
  for (let i = 0; i < 10; i++) {
    const daysAgo = 1 + (i % 6);
    insTok.run(iso(daysAgo, 9), `cw-${i % 5}`, 'raven', 'claude-opus-4-7', 5000, 1000, 0.5);
  }

  app = express();
  app.use(express.json());
  app.use('/api/journey', createJourneyRouter(createJourneyRepository(db)));
});

afterAll(() => {
  if (db) db.close();
  if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
});

describe('GET /api/journey/before-after', () => {
  test('returns both windows when there is enough history (>= 14 days)', async () => {
    const res = await request(app).get('/api/journey/before-after');
    expect(res.status).toBe(200);
    expect(res.body.too_early).toBe(false);
    expect(res.body.first_week).not.toBeNull();
    expect(res.body.current_week).toBeDefined();
    expect(res.body.span_days).toBeGreaterThanOrEqual(28);
  });

  test('first_week reflects the seeded earliest 7-day slice', async () => {
    const res = await request(app).get('/api/journey/before-after');
    expect(res.body.first_week.events).toBe(5);
    expect(res.body.first_week.top_project).toBe('demo');
    expect(res.body.first_week.top_model).toBe('claude-haiku-4-5');
  });

  test('current_week reflects the most recent 7 days', async () => {
    const res = await request(app).get('/api/journey/before-after');
    expect(res.body.current_week.events).toBe(30);
    expect(res.body.current_week.top_project).toBe('raven');
    expect(res.body.current_week.top_model).toBe('claude-opus-4-7');
    expect(res.body.current_week.cost_usd).toBeCloseTo(5.0, 5);
  });

  test('returns too_early=true when DB is empty', async () => {
    const tmp2 = mkdtempSync(join(tmpdir(), 'raven-journey-empty-'));
    const db2 = new RavenDB(join(tmp2, 'test.db'));
    try {
      const app2 = express();
      app2.use('/journey-empty', createJourneyRouter(createJourneyRepository(db2)));
      const res = await request(app2).get('/journey-empty/before-after');
      expect(res.status).toBe(200);
      expect(res.body.too_early).toBe(true);
      expect(res.body.first_week).toBeNull();
    } finally {
      db2.close();
      rmSync(tmp2, { recursive: true, force: true });
    }
  });
});
