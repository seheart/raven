/**
 * Tests for Multi-Project Health route — `/api/health/projects`.
 *
 * Regression guards from commit 4acd993:
 *  - Earlier the handler hardcoded a single row named after PROJECT_NAME, so
 *    every page that listed projects was a one-row Potemkin village.
 *  - The `?days=` window was silently ignored — recent counts were lifetime
 *    counts, not "last N days".
 *  - There was no real filtering by `?project=` either.
 */

import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import { createHealthProjectsRouter } from '../../dist/routes/health-projects.js';
import { createDashboardRepository } from '../../dist/repositories/dashboard-repository.js';
import { RavenDB } from '../../dist/db.js';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

function isoDaysAgo(days, hour = 12) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
}

function mountRouter(db) {
  const app = express();
  // Mount under a unique base so the cache middleware keys don't collide
  // across the suite — `cacheMiddleware` keys on req.originalUrl.
  const base = '/api/health-' + Math.random().toString(36).slice(2, 10);
  app.use(base, createHealthProjectsRouter({ dashboardRepo: createDashboardRepository(db) }));
  return { app, base };
}

describe('GET /api/health/projects — no events', () => {
  let db;
  let tmpDir;
  let app;
  let base;

  beforeAll(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'raven-health-projects-empty-'));
    db = new RavenDB(join(tmpDir, 'test.db'));
    ({ app, base } = mountRouter(db));
  });

  afterAll(() => {
    if (db) db.close();
    if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
  });

  test('returns empty projects list, not a hardcoded single project', async () => {
    const res = await request(app).get(`${base}/projects`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('projects');
    expect(Array.isArray(res.body.projects)).toBe(true);
    expect(res.body.projects).toEqual([]);
    expect(res.body.total_projects).toBe(0);
    expect(res.body.active_projects).toBe(0);
    expect(res.body.recent_projects).toBe(0);
    expect(res.body.total_events).toBe(0);
    expect(res.body.recent_window_events).toBe(0);
  });
});

describe('GET /api/health/projects — multi-project seed', () => {
  let db;
  let tmpDir;
  let app;
  let base;

  beforeAll(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'raven-health-projects-multi-'));
    db = new RavenDB(join(tmpDir, 'test.db'));

    const insertEvent = db.db.prepare(
      `INSERT INTO events (timestamp, filepath, change_type, project_name, session_id)
       VALUES (?, ?, ?, ?, ?)`
    );

    // Project A: 2 events at day -1 (within a 7-day window).
    insertEvent.run(isoDaysAgo(1, 10), 'A/a1.ts', 'change', 'A', 'sess-A');
    insertEvent.run(isoDaysAgo(1, 11), 'A/a2.ts', 'change', 'A', 'sess-A');

    // Project B: 1 event at day -1 (within window), 1 event at day -30 (outside
    // a 7-day window). Used by both "filter to single project" and "days=N
    // respects time window" tests.
    insertEvent.run(isoDaysAgo(1, 10), 'B/b1.ts', 'change', 'B', 'sess-B-1');
    insertEvent.run(isoDaysAgo(30, 10), 'B/b-old.ts', 'change', 'B', 'sess-B-2');

    // Project C: 1 event at day -1.
    insertEvent.run(isoDaysAgo(1, 10), 'C/c1.ts', 'change', 'C', 'sess-C');

    ({ app, base } = mountRouter(db));
  });

  afterAll(() => {
    if (db) db.close();
    if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
  });

  test('?project=B filters to a single project only', async () => {
    const res = await request(app).get(`${base}/projects?project=B`);
    expect(res.status).toBe(200);
    expect(res.body.projects).toHaveLength(1);
    expect(res.body.projects[0].project_name).toBe('B');
    expect(res.body.total_projects).toBe(1);

    // Sanity: without a filter we see all three projects.
    const all = await request(app).get(`${base}/projects?project=all`);
    const names = all.body.projects.map(p => p.project_name).sort();
    expect(names).toEqual(['A', 'B', 'C']);
  });

  test('?days=N respects the time window for recent_events count', async () => {
    // Project B has one event at day-1 and one at day-30. A 7-day window must
    // count only the day-1 event for `recent_events`. Earlier the days param
    // was silently ignored and the recent count was effectively lifetime.
    const res = await request(app).get(`${base}/projects?project=B&days=7`);
    expect(res.status).toBe(200);
    expect(res.body.days).toBe(7);
    const b = res.body.projects.find(p => p.project_name === 'B');
    expect(b).toBeDefined();
    expect(b.recent_events).toBe(1);
    // The lifetime counter (maintained by trigger) should still see both events.
    expect(b.total_events).toBe(2);

    // A 60-day window should pick up both.
    const wide = await request(app).get(`${base}/projects?project=B&days=60`);
    const bWide = wide.body.projects.find(p => p.project_name === 'B');
    expect(bWide.recent_events).toBe(2);
  });
});
