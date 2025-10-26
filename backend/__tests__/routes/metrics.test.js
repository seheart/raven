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
  let mockProjectDatabases;

  // Mock cache middleware
  const mockCacheMiddleware = () => (req, res, next) => next();

  beforeEach(() => {
    app = express();
    app.use(express.json());

    testDir = join(tmpdir(), `metrics-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
    const dbPath = join(testDir, 'test.db');
    testDb = new RavenDB(dbPath);

    mockProjectDatabases = new Map();
    mockProjectDatabases.set('raven', testDb);

    const deps = {
      projectState: new Map(),
      projectDatabases: mockProjectDatabases,
      cacheMiddleware: mockCacheMiddleware,
      metricsCache: null,
      analyticsCache: null,
      dashboardCache: null,
      getDb: () => testDb
    };

    app.use('/api', createMetricsRoutes(deps));
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

  describe('GET /api/system-metrics', () => {
    test('should return system metrics', async () => {
      const response = await request(app)
        .get('/api/system-metrics')
        .expect('Content-Type', /json/)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
    });
  });

  describe('GET /api/process-metrics', () => {
    test('should return process metrics', async () => {
      const response = await request(app)
        .get('/api/process-metrics')
        .expect('Content-Type', /json/)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
    });

    test('should handle limit parameter', async () => {
      const response = await request(app)
        .get('/api/process-metrics?limit=50')
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
    });
  });

  describe('GET /api/metrics-stats', () => {
    test('should return metrics statistics', async () => {
      const response = await request(app)
        .get('/api/metrics-stats')
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body).toBeDefined();
    });
  });
});
