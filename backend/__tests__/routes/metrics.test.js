/**
 * Tests for Metrics Routes
 */

import { jest } from '@jest/globals';
import request from 'supertest';
import express from 'express';
import { createMetricsRoutes } from '../../routes/metrics.js';
import { RavenDB } from '../../db.js';
import { mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('Metrics Routes', () => {
  let app;
  let testDb;
  let testDir;

  beforeEach(() => {
    app = express();
    app.use(express.json());

    testDir = join(tmpdir(), `metrics-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
    const dbPath = join(testDir, 'test.db');
    testDb = new RavenDB(dbPath);

    const deps = {
      projectState: new Map(),
      getDb: () => testDb
    };

    app.use('/api/metrics', createMetricsRoutes(deps));
  });

  afterEach(() => {
    if (testDb) {
      testDb.close();
    }
    try {
      rmSync(testDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore
    }
  });

  describe('GET /api/metrics/system', () => {
    test('should return system metrics', async () => {
      const response = await request(app)
        .get('/api/metrics/system')
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body).toHaveProperty('cpu');
      expect(response.body).toHaveProperty('memory');
    });
  });

  describe('GET /api/metrics/recent', () => {
    test('should return recent metrics', async () => {
      const response = await request(app)
        .get('/api/metrics/recent')
        .expect('Content-Type', /json/)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
    });

    test('should handle limit parameter', async () => {
      const response = await request(app)
        .get('/api/metrics/recent?limit=50')
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
    });
  });

  describe('GET /api/metrics/summary', () => {
    test('should return metrics summary', async () => {
      const response = await request(app)
        .get('/api/metrics/summary')
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body).toBeDefined();
    });
  });
});
