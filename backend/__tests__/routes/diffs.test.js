/**
 * Tests for the Diffs routes — per-event diff lookups + per-line risk
 * annotations.
 */

import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import { createDiffsRouter } from '../../dist/routes/diffs.js';
import { createDiffAnnotationsRepository } from '../../dist/repositories/diff-annotations-repository.js';
import { createFileEventsRepository } from '../../dist/repositories/file-events-repository.js';
import { createDiffAnnotationService } from '../../dist/services/diff-annotation-service.js';
import { RavenDB } from '../../dist/db.js';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

let app;
let db;
let tmpDir;
let annotationsRepo;
let annotationService;
let safeEventId;
let riskyEventId;
let envEventId;

const SAFE_DIFF = `--- a/foo.js
+++ b/foo.js
@@ -1,3 +1,4 @@
 const a = 1;
+const b = 2;
 const c = 3;
`;

const RISKY_DIFF = `--- a/foo.js
+++ b/foo.js
@@ -1,3 +1,5 @@
 // ok
+const password = "hunter2hunter";
+eval(userInput);
 const x = 1;
`;

beforeAll(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'raven-diffs-routes-'));
  db = new RavenDB(join(tmpDir, 'test.db'));
  annotationsRepo = createDiffAnnotationsRepository(db);
  annotationService = createDiffAnnotationService(annotationsRepo);

  // Seed three events: a benign one, a risky one, and an .env edit.
  const now = new Date().toISOString();
  const insert = db.db.prepare(
    `INSERT INTO events (timestamp, filepath, change_type, diff, session_id, project_name)
     VALUES (?, ?, ?, ?, ?, ?)`
  );
  safeEventId = Number(
    insert.run(now, 'src/foo.js', 'change', SAFE_DIFF, 'sess-a', 'demo').lastInsertRowid
  );
  riskyEventId = Number(
    insert.run(now, 'src/foo.js', 'change', RISKY_DIFF, 'sess-a', 'demo').lastInsertRowid
  );
  envEventId = Number(
    insert.run(now, '.env', 'change', SAFE_DIFF, 'sess-a', 'demo').lastInsertRowid
  );

  app = express();
  app.use(express.json());
  app.use(
    '/api/diffs',
    createDiffsRouter(createFileEventsRepository(db), annotationsRepo, annotationService)
  );
});

afterAll(() => {
  if (db) db.close();
  if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
});

describe('Diff Annotation Service (pure)', () => {
  test('returns no matches on a benign diff', () => {
    const matches = annotationService.scan('src/foo.js', SAFE_DIFF);
    expect(matches).toEqual([]);
  });

  test('flags hardcoded password and eval usage on the risky diff', () => {
    const matches = annotationService.scan('src/foo.js', RISKY_DIFF);
    const ids = matches.map(m => m.rule_id);
    expect(ids).toContain('hardcoded-password');
    expect(ids).toContain('eval-usage');
  });

  test('does NOT flag .eval() method calls as eval-usage (PyTorch false positive)', () => {
    const METHOD_EVAL_DIFF = `--- a/model.py
+++ b/model.py
@@ -1,2 +1,4 @@
 import torch
+text_encoder.eval()
+model.eval()
 x = 1
`;
    const matches = annotationService.scan('model.py', METHOD_EVAL_DIFF);
    expect(matches.map(m => m.rule_id)).not.toContain('eval-usage');
  });

  test('flags an .env edit at the file level', () => {
    const matches = annotationService.scan('.env', SAFE_DIFF);
    const envHit = matches.find(m => m.rule_id === 'env-file');
    expect(envHit).toBeDefined();
    expect(envHit.line_number).toBe(0);
    expect(envHit.severity).toBe('warning');
  });

  test('attaches annotations to added-line numbers, not raw diff offsets', () => {
    // RISKY_DIFF starts at @@ -1,3 +1,5 @@, the added password line is line 2.
    const matches = annotationService.scan('src/foo.js', RISKY_DIFF);
    const pw = matches.find(m => m.rule_id === 'hardcoded-password');
    expect(pw).toBeDefined();
    expect(pw.line_number).toBe(2);
  });
});

describe('Diff Routes', () => {
  test('GET /api/diffs/:event_id returns event + annotations (lazy compute on first read)', async () => {
    const res = await request(app).get(`/api/diffs/${riskyEventId}`);
    expect(res.status).toBe(200);
    expect(res.body.event.id).toBe(riskyEventId);
    expect(Array.isArray(res.body.annotations)).toBe(true);
    expect(res.body.annotations.length).toBeGreaterThan(0);
    const ids = res.body.annotations.map(a => a.rule_id);
    expect(ids).toContain('hardcoded-password');
  });

  test('GET /api/diffs/:event_id/annotations returns just the annotation rows', async () => {
    const res = await request(app).get(`/api/diffs/${riskyEventId}/annotations`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
  });

  test('benign event returns 200 with empty annotations array', async () => {
    const res = await request(app).get(`/api/diffs/${safeEventId}`);
    expect(res.status).toBe(200);
    expect(res.body.annotations).toEqual([]);
  });

  test('GET /api/diffs/risk/recent returns a roll-up sorted by severity counts', async () => {
    // Force annotations on both events first.
    await request(app).get(`/api/diffs/${riskyEventId}`);
    await request(app).get(`/api/diffs/${envEventId}`);
    const res = await request(app).get('/api/diffs/risk/recent?limit=10');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    const filenames = res.body.map(s => s.filepath);
    expect(filenames).toContain('src/foo.js');
    expect(filenames).toContain('.env');
    const risky = res.body.find(s => s.event_id === riskyEventId);
    expect(risky.critical_count).toBeGreaterThan(0);
    expect(risky.highest_severity).toBe('critical');
  });

  test('POST /api/diffs/:event_id/annotations/recompute re-runs and replaces prior annotations', async () => {
    const before = await request(app).get(`/api/diffs/${riskyEventId}/annotations`);
    expect(before.body.length).toBeGreaterThan(0);

    const recompute = await request(app).post(`/api/diffs/${riskyEventId}/annotations/recompute`);
    expect(recompute.status).toBe(200);
    expect(recompute.body.event_id).toBe(riskyEventId);
    expect(recompute.body.annotations.length).toEqual(before.body.length);
  });

  test('returns 404 for a missing event_id', async () => {
    const res = await request(app).get('/api/diffs/9999999');
    expect(res.status).toBe(404);
  });

  test('returns 400 for a non-numeric event_id', async () => {
    const res = await request(app).get('/api/diffs/not-a-number');
    expect(res.status).toBe(400);
  });
});
