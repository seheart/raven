/**
 * Tests for Insights Routes
 */

import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import { createInsightsRouter } from '../../dist/routes/insights.js';
import { InsightsService } from '../../dist/services/insights-service.js';
import { RavenDB } from '../../dist/db.js';
import { createDiffRiskRepository } from '../../dist/repositories/diff-risk-repository.js';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

let app;
let db;
let diffRiskRepo;
let tmpDir;

beforeAll(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'raven-insights-routes-'));
  db = new RavenDB(join(tmpDir, 'test.db'));
  diffRiskRepo = createDiffRiskRepository(db);
  const service = new InsightsService(db, 'http://localhost:99999', 'test-model');

  app = express();
  app.use(express.json());
  app.use('/api/insights', createInsightsRouter(service, db, diffRiskRepo));
});

afterAll(() => {
  if (db) db.close();
  if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
});

describe('Insights Routes', () => {
  test('GET /api/insights returns empty array initially', async () => {
    const res = await request(app).get('/api/insights');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  test('GET /api/insights/status returns availability info', async () => {
    const res = await request(app).get('/api/insights/status');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('available');
    expect(res.body).toHaveProperty('generating');
    expect(res.body).toHaveProperty('models');
    expect(res.body.available).toBe(false); // Ollama offline
  });

  test('GET /api/insights/latest returns empty object when no insights', async () => {
    const res = await request(app).get('/api/insights/latest');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({});
  });

  test('POST /api/insights/generate/summary returns 202 with no data', async () => {
    const res = await request(app)
      .post('/api/insights/generate/summary')
      .send({ windowMinutes: 60 });
    expect(res.status).toBe(202);
    expect(res.body.message).toBeTruthy();
  });

  test('POST /api/insights/generate/review returns 202 with no diffs', async () => {
    const res = await request(app).post('/api/insights/generate/review').send({});
    expect(res.status).toBe(202);
  });

  test('POST /api/insights/generate/digest returns 202 with no data', async () => {
    const res = await request(app).post('/api/insights/generate/digest').send({});
    expect(res.status).toBe(202);
  });

  test('POST /api/insights/generate/agent-comparison returns 202 with no agents', async () => {
    const res = await request(app).post('/api/insights/generate/agent-comparison').send({});
    expect(res.status).toBe(202);
  });

  test('POST /api/insights/generate/project-health requires projectName', async () => {
    const res = await request(app).post('/api/insights/generate/project-health').send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('projectName is required');
  });

  test('POST /api/insights/generate/project-health returns 202 with no project data', async () => {
    const res = await request(app)
      .post('/api/insights/generate/project-health')
      .send({ projectName: 'nonexistent' });
    expect(res.status).toBe(202);
  });

  test('GET /api/insights/diff-risk-scores returns empty array initially', async () => {
    const res = await request(app).get('/api/insights/diff-risk-scores');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  test('GET /api/insights/diff-risk-scores returns scores after insert', async () => {
    diffRiskRepo.insert(
      1,
      '/test.js',
      6,
      'Moderate risk',
      new Date().toISOString(),
      'test-model',
      'sess'
    );

    const res = await request(app).get('/api/insights/diff-risk-scores?limit=5');
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(1);
    expect(res.body[0].score).toBe(6);
    expect(res.body[0].filepath).toBe('/test.js');
  });

  test('GET /api/insights/diff-risk-scores respects limit', async () => {
    diffRiskRepo.insert(
      2,
      '/a.js',
      3,
      'Low risk',
      new Date().toISOString(),
      'test-model',
      'sess'
    );
    diffRiskRepo.insert(
      3,
      '/b.js',
      8,
      'High risk',
      new Date().toISOString(),
      'test-model',
      'sess'
    );

    const res = await request(app).get('/api/insights/diff-risk-scores?limit=2');
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(2);
  });

  test('PUT /api/insights/model requires model field', async () => {
    const res = await request(app).put('/api/insights/model').send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('model is required');
  });

  test('GET /api/insights with type filter works', async () => {
    // Insert insights of different types
    db.db
      .prepare(
        'INSERT INTO insights (id, timestamp, type, title, content, model, duration_ms, context_events) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      )
      .run(
        'sum_1',
        new Date().toISOString(),
        'session_summary',
        'Summary',
        'content',
        'test',
        100,
        5
      );
    db.db
      .prepare(
        'INSERT INTO insights (id, timestamp, type, title, content, model, duration_ms, context_events) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      )
      .run('dig_1', new Date().toISOString(), 'daily_digest', 'Digest', 'content', 'test', 100, 5);

    const allRes = await request(app).get('/api/insights');
    expect(allRes.body.length).toBe(2);

    const digestRes = await request(app).get('/api/insights?type=daily_digest');
    expect(digestRes.body.length).toBe(1);
    expect(digestRes.body[0].type).toBe('daily_digest');
  });
});
