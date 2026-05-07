/**
 * Tests for the Context Window route.
 */

import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import { createContextWindowRouter } from '../../dist/routes/context-window.js';
import { RavenDB } from '../../dist/db.js';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

let app;
let db;
let tmpDir;

beforeAll(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'raven-ctxwin-'));
  db = new RavenDB(join(tmpDir, 'test.db'));

  // Two sessions, fresh enough to land in the 30-min window.
  const insTok = db.db.prepare(
    `INSERT INTO token_usage (timestamp, session_id, project_name, model, input_tokens, output_tokens, cache_read_tokens, estimated_cost_usd)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const now = Date.now();
  function iso(offsetMin) {
    return new Date(now - offsetMin * 60_000).toISOString();
  }

  // sess-A on claude-opus, latest turn: 50k input + 10k cache = 60k → fraction 0.30 → "ok"
  insTok.run(iso(20), 'sess-A', 'demo', 'claude-opus-4-7', 5000, 1000, 1000, 0.5);
  insTok.run(iso(15), 'sess-A', 'demo', 'claude-opus-4-7', 50000, 2000, 10000, 1.5);

  // sess-B on qwen2.5-coder, latest turn: 30k input → fraction ~0.91 of 32768 → "tight"
  insTok.run(iso(10), 'sess-B', 'demo', 'qwen2.5-coder:14b', 30000, 500, 0, 0);

  // sess-C on claude-haiku — 220k → overflow
  insTok.run(iso(5), 'sess-C', 'demo', 'claude-haiku-4-5', 220000, 1000, 0, 5);

  // An old row (>30 min) — should be excluded.
  insTok.run(iso(60), 'sess-OLD', 'demo', 'claude-opus-4-7', 1000, 100, 0, 0.01);

  app = express();
  app.use(express.json());
  app.use('/api/context', createContextWindowRouter(db));
});

afterAll(() => {
  if (db) db.close();
  if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
});

describe('GET /api/context/current', () => {
  test('returns the latest turn per session in the 30-min window', async () => {
    const res = await request(app).get('/api/context/current?limit=10');
    expect(res.status).toBe(200);
    const ids = res.body.map(w => w.session_id);
    expect(ids).toContain('sess-A');
    expect(ids).toContain('sess-B');
    expect(ids).toContain('sess-C');
    expect(ids).not.toContain('sess-OLD');
  });

  test('takes the latest row per session (not the first)', async () => {
    const res = await request(app).get('/api/context/current?limit=10');
    const a = res.body.find(w => w.session_id === 'sess-A');
    // Latest A turn was input=50000 + cache=10000 = 60000 — not the older 5k+1k row.
    expect(a.context_tokens).toBe(60000);
  });

  test('classifies bands correctly', async () => {
    const res = await request(app).get('/api/context/current?limit=10');
    const a = res.body.find(w => w.session_id === 'sess-A');
    const b = res.body.find(w => w.session_id === 'sess-B');
    const c = res.body.find(w => w.session_id === 'sess-C');
    expect(a.band).toBe('ok'); // 60k / 200k = 0.30
    expect(b.band).toBe('tight'); // 30k / 32_768 ≈ 0.92
    expect(c.band).toBe('overflow'); // 220k / 200k > 1
  });

  test('reports model_family + context_limit per family', async () => {
    const res = await request(app).get('/api/context/current?limit=10');
    const b = res.body.find(w => w.session_id === 'sess-B');
    expect(b.model_family).toBe('qwen2.5-coder');
    expect(b.context_limit).toBe(32_768);
    const a = res.body.find(w => w.session_id === 'sess-A');
    expect(a.model_family).toBe('claude-opus');
    expect(a.context_limit).toBe(200_000);
  });

  test('respects the limit query param', async () => {
    const res = await request(app).get('/api/context/current?limit=1');
    expect(res.body.length).toBe(1);
  });
});
