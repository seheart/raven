/**
 * Tests for Today Narrative Routes — aggregations powering Today's beats.
 */

import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import { createTodayNarrativeRouter } from '../../dist/routes/today-narrative.js';
import { RavenDB } from '../../dist/db.js';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

let app;
let db;
let tmpDir;

const todayStart = new Date();
todayStart.setHours(0, 0, 0, 0);

function isoDaysAgo(days, hour = 12) {
  const d = new Date(todayStart);
  d.setDate(d.getDate() - days);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
}

function isoToday(hour = 10, minute = 0) {
  const d = new Date(todayStart);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

beforeAll(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'raven-today-narrative-'));
  db = new RavenDB(join(tmpDir, 'test.db'));

  // Seed events: today's activity on 'atf', a returning project after a 4-day gap.
  const insert = db.db.prepare(
    'INSERT INTO events (timestamp, filepath, change_type, project_name, session_id) VALUES (?, ?, ?, ?, ?)'
  );

  // Today: 5 events on 'atf' across 3 files, all in one session
  insert.run(isoToday(9, 0), 'atf/a.js', 'change', 'atf', 'sess-today');
  insert.run(isoToday(9, 5), 'atf/b.js', 'change', 'atf', 'sess-today');
  insert.run(isoToday(9, 30), 'atf/a.js', 'change', 'atf', 'sess-today');
  insert.run(isoToday(10, 15), 'atf/c.js', 'change', 'atf', 'sess-today');
  insert.run(isoToday(11, 0), 'atf/a.js', 'change', 'atf', 'sess-today');

  // Today: a few events on 'raven'
  insert.run(isoToday(14, 0), 'raven/x.ts', 'change', 'raven', 'sess-raven');
  insert.run(isoToday(14, 30), 'raven/y.ts', 'change', 'raven', 'sess-raven');

  // Past week (not today): activity on 'raven' yesterday and 3 days ago
  insert.run(isoDaysAgo(1, 10), 'raven/old.ts', 'change', 'raven', 'sess-y');
  insert.run(isoDaysAgo(3, 10), 'raven/older.ts', 'change', 'raven', 'sess-z');

  // 'atf' was last touched 4 days ago — should appear in `returning`.
  insert.run(isoDaysAgo(4, 10), 'atf/legacy.js', 'change', 'atf', 'sess-old');

  app = express();
  app.use('/api/today', createTodayNarrativeRouter(db));
});

afterAll(() => {
  if (db) db.close();
  if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
});

describe('Today Narrative Route', () => {
  test('GET /api/today/narrative returns the structured shape', async () => {
    const res = await request(app).get('/api/today/narrative');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('today');
    expect(res.body).toHaveProperty('week');
    expect(res.body).toHaveProperty('returning');
  });

  test('today section reports per-project totals and a top_project', async () => {
    const res = await request(app).get('/api/today/narrative');
    expect(res.body.today.events).toBe(7);
    expect(res.body.today.top_project).toBe('atf');

    const atf = res.body.today.projects.find(p => p.project === 'atf');
    expect(atf).toMatchObject({ project: 'atf', events: 5, files: 3 });

    const raven = res.body.today.projects.find(p => p.project === 'raven');
    expect(raven).toMatchObject({ project: 'raven', events: 2, files: 2 });
  });

  test('today longest_session_seconds reflects the largest in-day session span', async () => {
    const res = await request(app).get('/api/today/narrative');
    // sess-today spans 9:00 → 11:00 = 7200s. sess-raven spans 14:00 → 14:30 = 1800s.
    expect(res.body.today.longest_session_seconds).toBeGreaterThan(7000);
    expect(res.body.today.longest_session_seconds).toBeLessThan(7400);
  });

  test('week section aggregates 7 days and counts distinct active days', async () => {
    const res = await request(app).get('/api/today/narrative');
    // 4 distinct calendar days: today, yesterday, 3 days ago, 4 days ago
    expect(res.body.week.days_active).toBe(4);
    expect(res.body.week.events).toBe(10);
    // atf wins the week with 6 events (5 today + 1 four-days-ago) vs raven's 4.
    expect(res.body.week.top_project).toBe('atf');
  });

  test('returning lists projects whose last edit was ≥ 2 days before today', async () => {
    const res = await request(app).get('/api/today/narrative');
    const atf = res.body.returning.find(r => r.project === 'atf');
    expect(atf).toBeDefined();
    expect(atf.days_since_last_event).toBe(4);
    // raven was touched yesterday (1 day ago) — must NOT be in returning.
    const raven = res.body.returning.find(r => r.project === 'raven');
    expect(raven).toBeUndefined();
  });
});
