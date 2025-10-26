/**
 * Tests for Analytics Routes
 */

import { jest } from '@jest/globals';
import request from 'supertest';
import express from 'express';
import { createAnalyticsRoutes } from '../../routes/analytics.js';
import { RavenDB } from '../../db.js';
import { mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('Analytics Routes', () => {
  let app;
  let testDb;
  let testDir;
  let mockProjectDatabases;

  // Mock cache middleware
  const mockCacheMiddleware = () => (req, res, next) => next();

  beforeEach(() => {
    app = express();
    app.use(express.json());

    // Create temporary test database
    testDir = join(tmpdir(), `analytics-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
    const dbPath = join(testDir, 'test.db');
    testDb = new RavenDB(dbPath);

    // Insert test data
    testDb.db.prepare(`
      INSERT INTO events (filepath, change_type, timestamp)
      VALUES
        ('src/test.js', 'change', datetime('now', '-1 hour')),
        ('src/test2.js', 'add', datetime('now', '-2 hours')),
        ('src/test3.js', 'unlink', datetime('now', '-3 hours'))
    `).run();

    mockProjectDatabases = new Map();
    mockProjectDatabases.set('test-project', testDb);

    const deps = {
      projectState: { db: testDb },
      projectDatabases: mockProjectDatabases,
      cacheMiddleware: mockCacheMiddleware,
      analyticsCache: null
    };

    app.use('/api', createAnalyticsRoutes(deps));
  });

  afterEach(() => {
    if (testDb) {
      testDb.close();
    }
    try {
      rmSync(testDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('GET /api/agent-events', () => {
    test('should return recent agent events', async () => {
      const response = await request(app)
        .get('/api/agent-events')
        .expect('Content-Type', /json/)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
    });

    test('should handle limit parameter', async () => {
      const response = await request(app)
        .get('/api/agent-events?limit=10')
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
    });
  });

  describe('GET /api/events-by-agent/:agent', () => {
    test('should return events filtered by agent', async () => {
      const response = await request(app)
        .get('/api/events-by-agent/test-agent')
        .expect('Content-Type', /json/)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
    });

    test('should handle limit parameter', async () => {
      const response = await request(app)
        .get('/api/events-by-agent/test-agent?limit=5')
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
    });
  });

  describe('GET /api/anomalies/detect', () => {
    test('should detect anomalies across projects', async () => {
      const response = await request(app)
        .get('/api/anomalies/detect')
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body).toHaveProperty('anomalies');
      expect(response.body).toHaveProperty('total_anomalies');
      expect(response.body).toHaveProperty('projects_scanned');
      expect(Array.isArray(response.body.anomalies)).toBe(true);
    });

    test('should handle hours parameter', async () => {
      const response = await request(app)
        .get('/api/anomalies/detect?hours=48')
        .expect(200);

      expect(response.body.lookback_hours).toBe(48);
    });

    test('should handle threshold parameter', async () => {
      const response = await request(app)
        .get('/api/anomalies/detect?threshold=3.0')
        .expect(200);

      expect(response.body.threshold).toBe(3.0);
    });
  });

  describe('GET /api/trends/historical', () => {
    test('should return historical trends', async () => {
      const response = await request(app)
        .get('/api/trends/historical')
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body).toHaveProperty('period');
      expect(response.body).toHaveProperty('days');
      expect(response.body).toHaveProperty('trends');
      expect(Array.isArray(response.body.trends)).toBe(true);
    });

    test('should handle period parameter', async () => {
      const response = await request(app)
        .get('/api/trends/historical?period=daily')
        .expect(200);

      expect(response.body.period).toBe('daily');
    });

    test('should handle days parameter', async () => {
      const response = await request(app)
        .get('/api/trends/historical?days=14')
        .expect(200);

      expect(response.body.days).toBe(14);
    });

    test('should handle empty database', async () => {
      // Clear project databases
      mockProjectDatabases.clear();

      const response = await request(app)
        .get('/api/trends/historical')
        .expect(200);

      expect(response.body.trends).toEqual([]);
    });
  });

  describe('GET /api/agents/:agent/profile', () => {
    test('should return 503 when profiler not initialized', async () => {
      const response = await request(app)
        .get('/api/agents/test-agent/profile')
        .expect('Content-Type', /json/)
        .expect(503);

      expect(response.body).toHaveProperty('error');
    });

    test('should return agent profile when profiler exists', async () => {
      const appWithProfiler = express();
      appWithProfiler.use(express.json());

      const mockProfiler = {
        getAgentProfile: jest.fn().mockReturnValue({
          name: 'test-agent',
          totalChanges: 100,
          averageQuality: 85
        })
      };

      const deps = {
        projectState: { db: testDb },
        projectDatabases: mockProjectDatabases,
        cacheMiddleware: mockCacheMiddleware,
        analyticsCache: null,
        behaviorProfiler: mockProfiler
      };

      appWithProfiler.use('/api', createAnalyticsRoutes(deps));

      const response = await request(appWithProfiler)
        .get('/api/agents/test-agent/profile')
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body).toHaveProperty('profile');
    });
  });

  describe('GET /api/agents/:agent/behavior-change', () => {
    test('should return 503 when profiler not initialized', async () => {
      const response = await request(app)
        .get('/api/agents/test-agent/behavior-change')
        .expect('Content-Type', /json/)
        .expect(503);

      expect(response.body).toHaveProperty('error');
    });
  });

  describe('GET /api/agents/compare', () => {
    test('should return 503 when profiler not initialized', async () => {
      const response = await request(app)
        .get('/api/agents/compare')
        .expect('Content-Type', /json/)
        .expect(503);

      expect(response.body).toHaveProperty('error');
    });
  });

  describe('POST /api/changes/:id/similar', () => {
    test('should return 503 when pattern matcher not initialized', async () => {
      const response = await request(app)
        .post('/api/changes/1/similar')
        .expect('Content-Type', /json/)
        .expect(503);

      expect(response.body).toHaveProperty('error');
    });

    test('should find similar changes when matcher exists', async () => {
      const appWithMatcher = express();
      appWithMatcher.use(express.json());

      const mockMatcher = {
        findSimilarChanges: jest.fn().mockReturnValue([
          { id: 2, filepath: 'similar.js', similarity: 0.9 }
        ])
      };

      const deps = {
        projectState: { db: testDb },
        projectDatabases: mockProjectDatabases,
        cacheMiddleware: mockCacheMiddleware,
        analyticsCache: null,
        patternMatcher: mockMatcher
      };

      appWithMatcher.use('/api', createAnalyticsRoutes(deps));

      const response = await request(appWithMatcher)
        .post('/api/changes/1/similar')
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body).toHaveProperty('similar');
    });
  });
});
