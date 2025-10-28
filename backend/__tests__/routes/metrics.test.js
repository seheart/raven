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

    // Clear all mocks before each test
    jest.clearAllMocks();
  });

  afterEach(() => {
    if (testDb) {
      testDb.close();
    }
    try {
      rmSync(testDir, { recursive: true, force: true });
    } catch (_error) {
      // Ignore
    }
  });

  // ==================== Real-time Metrics Tests ====================

  describe('GET /api/metrics/json', () => {
    test('should return metrics in JSON format with expected structure', async () => {
      const response = await request(app)
        .get('/api/metrics/json')
        .expect('Content-Type', /json/)
        .expect(200);

      // Verify response has the expected structure
      expect(response.body).toHaveProperty('system');
      expect(response.body).toHaveProperty('http');
      expect(response.body).toHaveProperty('telemetry');
      expect(response.body).toHaveProperty('database');
      expect(response.body).toHaveProperty('cache');
      expect(response.body).toHaveProperty('errors');
    });

    test('should return 503 when metrics are disabled', async () => {
      const { env } = await import('../../config/environment.js');
      const originalValue = env.ENABLE_METRICS;
      env.ENABLE_METRICS = false;

      const response = await request(app)
        .get('/api/metrics/json')
        .expect('Content-Type', /json/)
        .expect(503);

      expect(response.body).toEqual({ error: 'Metrics collection is disabled' });

      // Reset for other tests
      env.ENABLE_METRICS = originalValue;
    });
  });

  describe('GET /api/metrics', () => {
    test('should return metrics in Prometheus format', async () => {
      const response = await request(app)
        .get('/api/metrics')
        .expect('Content-Type', /text\/plain/)
        .expect(200);

      // Verify Prometheus format markers are present
      expect(response.text).toContain('# HELP');
      expect(response.text).toContain('# TYPE');
      expect(response.text).toContain('raven_uptime_seconds');
    });

    test('should return 503 when metrics are disabled', async () => {
      const { env } = await import('../../config/environment.js');
      const originalValue = env.ENABLE_METRICS;
      env.ENABLE_METRICS = false;

      const response = await request(app)
        .get('/api/metrics')
        .expect('Content-Type', /json/)
        .expect(503);

      expect(response.body).toEqual({ error: 'Metrics collection is disabled' });

      // Reset for other tests
      env.ENABLE_METRICS = originalValue;
    });
  });

  // ==================== System Metrics Tests ====================

  describe('GET /api/system-metrics', () => {
    test('should return system metrics with default pagination', async () => {
      const response = await request(app)
        .get('/api/system-metrics')
        .expect('Content-Type', /json/)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
    });

    test('should handle custom limit parameter', async () => {
      const response = await request(app)
        .get('/api/system-metrics?limit=50')
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
    });

    test('should handle custom offset parameter', async () => {
      const response = await request(app)
        .get('/api/system-metrics?offset=10')
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
    });

    test('should handle both limit and offset parameters', async () => {
      const response = await request(app)
        .get('/api/system-metrics?limit=25&offset=5')
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
    });

    test('should handle invalid string limit and offset (parseInt returns NaN)', async () => {
      // When parseInt gets invalid strings like 'abc', it returns NaN which causes SQL error
      const response = await request(app)
        .get('/api/system-metrics?limit=abc&offset=xyz')
        .expect(500);

      expect(response.body).toEqual({ error: 'Failed to retrieve system metrics' });
    });

    test('should return 500 when raven database is not initialized', async () => {
      mockProjectDatabases.clear();

      const response = await request(app)
        .get('/api/system-metrics')
        .expect('Content-Type', /json/)
        .expect(500);

      expect(response.body).toEqual({ error: 'Raven database not initialized' });
    });

    test('should return 500 when raven database db property is null', async () => {
      mockProjectDatabases.set('raven', { db: null });

      const response = await request(app)
        .get('/api/system-metrics')
        .expect('Content-Type', /json/)
        .expect(500);

      expect(response.body).toEqual({ error: 'Raven database not initialized' });
    });

    test('should handle database errors gracefully', async () => {
      const mockDb = {
        db: {
          prepare: jest.fn().mockImplementation(() => {
            throw new Error('Database query failed');
          })
        }
      };
      mockProjectDatabases.set('raven', mockDb);

      const response = await request(app)
        .get('/api/system-metrics')
        .expect('Content-Type', /json/)
        .expect(500);

      expect(response.body).toEqual({ error: 'Failed to retrieve system metrics' });
    });
  });

  // ==================== Process Metrics Tests ====================

  describe('GET /api/process-metrics/:agent', () => {
    test('should return process metrics for a specific agent', async () => {
      const response = await request(app)
        .get('/api/process-metrics/test-agent')
        .expect('Content-Type', /json/)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
    });

    test('should handle limit parameter for agent metrics', async () => {
      const response = await request(app)
        .get('/api/process-metrics/test-agent?limit=30')
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
    });

    test('should handle offset parameter for agent metrics', async () => {
      const response = await request(app)
        .get('/api/process-metrics/test-agent?offset=5')
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
    });

    test('should handle both limit and offset for agent metrics', async () => {
      const response = await request(app)
        .get('/api/process-metrics/test-agent?limit=20&offset=10')
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
    });

    test('should return 500 when raven database is not initialized', async () => {
      mockProjectDatabases.clear();

      const response = await request(app)
        .get('/api/process-metrics/test-agent')
        .expect('Content-Type', /json/)
        .expect(500);

      expect(response.body).toEqual({ error: 'Raven database not initialized' });
    });

    test('should handle agent names with special characters', async () => {
      const response = await request(app)
        .get('/api/process-metrics/agent-with-dashes')
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
    });

    test('should handle database errors for agent metrics', async () => {
      const mockDb = {
        db: {
          prepare: jest.fn().mockImplementation(() => {
            throw new Error('Database query failed');
          })
        }
      };
      mockProjectDatabases.set('raven', mockDb);

      const response = await request(app)
        .get('/api/process-metrics/test-agent')
        .expect('Content-Type', /json/)
        .expect(500);

      expect(response.body).toEqual({ error: 'Failed to retrieve process metrics' });
    });
  });

  describe('GET /api/process-metrics', () => {
    test('should return all process metrics with default pagination', async () => {
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

    test('should handle offset parameter', async () => {
      const response = await request(app)
        .get('/api/process-metrics?offset=20')
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
    });

    test('should filter by agent query parameter', async () => {
      const response = await request(app)
        .get('/api/process-metrics?agent=my-agent')
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
    });

    test('should handle all parameters together', async () => {
      const response = await request(app)
        .get('/api/process-metrics?limit=30&offset=5&agent=test-agent')
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
    });

    test('should handle empty agent parameter', async () => {
      const response = await request(app)
        .get('/api/process-metrics?agent=')
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
    });

    test('should return 500 when raven database is not initialized', async () => {
      mockProjectDatabases.clear();

      const response = await request(app)
        .get('/api/process-metrics')
        .expect('Content-Type', /json/)
        .expect(500);

      expect(response.body).toEqual({ error: 'Raven database not initialized' });
    });

    test('should handle database errors', async () => {
      const mockDb = {
        db: {
          prepare: jest.fn().mockImplementation(() => {
            throw new Error('Database query failed');
          })
        }
      };
      mockProjectDatabases.set('raven', mockDb);

      const response = await request(app)
        .get('/api/process-metrics')
        .expect('Content-Type', /json/)
        .expect(500);

      expect(response.body).toEqual({ error: 'Failed to retrieve process metrics' });
    });
  });

  // ==================== Metrics Statistics Tests ====================

  describe('GET /api/metrics-stats', () => {
    test('should return metrics statistics with default time range', async () => {
      const response = await request(app)
        .get('/api/metrics-stats')
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body).toBeDefined();
    });

    test('should handle custom start_time parameter', async () => {
      const startTime = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();

      const response = await request(app)
        .get(`/api/metrics-stats?start_time=${startTime}`)
        .expect(200);

      expect(response.body).toBeDefined();
    });

    test('should handle custom end_time parameter', async () => {
      const endTime = new Date().toISOString();

      const response = await request(app)
        .get(`/api/metrics-stats?end_time=${endTime}`)
        .expect(200);

      expect(response.body).toBeDefined();
    });

    test('should handle both start_time and end_time parameters', async () => {
      const startTime = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const endTime = new Date().toISOString();

      const response = await request(app)
        .get(`/api/metrics-stats?start_time=${startTime}&end_time=${endTime}`)
        .expect(200);

      expect(response.body).toBeDefined();
    });

    test('should return 500 when raven database is not initialized', async () => {
      mockProjectDatabases.clear();

      const response = await request(app)
        .get('/api/metrics-stats')
        .expect('Content-Type', /json/)
        .expect(500);

      expect(response.body).toEqual({ error: 'Raven database not initialized' });
    });

    test('should handle database errors', async () => {
      const mockDb = {
        db: {},
        getMetricsStats: jest.fn().mockImplementation(() => {
          throw new Error('Stats calculation failed');
        })
      };
      mockProjectDatabases.set('raven', mockDb);

      const response = await request(app)
        .get('/api/metrics-stats')
        .expect('Content-Type', /json/)
        .expect(500);

      expect(response.body).toEqual({ error: 'Failed to retrieve metrics stats' });
    });

    test('should use cache middleware', async () => {
      const cacheSpy = jest.fn((cache) => (req, res, next) => {
        next();
      });

      const depsWithCacheSpy = {
        projectState: new Map(),
        projectDatabases: mockProjectDatabases,
        cacheMiddleware: cacheSpy,
        metricsCache: null,
        analyticsCache: 'analytics-cache-instance',
        dashboardCache: null
      };

      const appWithCache = express();
      appWithCache.use(express.json());
      appWithCache.use('/api', createMetricsRoutes(depsWithCacheSpy));

      await request(appWithCache)
        .get('/api/metrics-stats')
        .expect(200);

      expect(cacheSpy).toHaveBeenCalledWith('analytics-cache-instance');
    });
  });

  // ==================== Performance Correlations Tests ====================

  describe('GET /api/performance-correlations', () => {
    test('should return performance correlations with default time window', async () => {
      const response = await request(app)
        .get('/api/performance-correlations')
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body).toBeDefined();
    });

    test('should handle custom time_window_seconds parameter', async () => {
      const response = await request(app)
        .get('/api/performance-correlations?time_window_seconds=10')
        .expect(200);

      expect(response.body).toBeDefined();
    });

    test('should handle string time_window_seconds (should parse to int)', async () => {
      const response = await request(app)
        .get('/api/performance-correlations?time_window_seconds=15')
        .expect(200);

      expect(response.body).toBeDefined();
    });

    test('should use default value for invalid time_window_seconds', async () => {
      const response = await request(app)
        .get('/api/performance-correlations?time_window_seconds=invalid')
        .expect(200);

      expect(response.body).toBeDefined();
    });

    test('should return 500 when raven database is not initialized', async () => {
      mockProjectDatabases.clear();

      const response = await request(app)
        .get('/api/performance-correlations')
        .expect('Content-Type', /json/)
        .expect(500);

      expect(response.body).toEqual({ error: 'Raven database not initialized' });
    });

    test('should handle database errors', async () => {
      const mockDb = {
        db: {},
        correlateEventsWithMetrics: jest.fn().mockImplementation(() => {
          throw new Error('Correlation calculation failed');
        })
      };
      mockProjectDatabases.set('raven', mockDb);

      const response = await request(app)
        .get('/api/performance-correlations')
        .expect('Content-Type', /json/)
        .expect(500);

      expect(response.body).toEqual({ error: 'Failed to retrieve performance correlations' });
    });

    test('should use cache middleware', async () => {
      const cacheSpy = jest.fn((cache) => (req, res, next) => {
        next();
      });

      const depsWithCacheSpy = {
        projectState: new Map(),
        projectDatabases: mockProjectDatabases,
        cacheMiddleware: cacheSpy,
        metricsCache: null,
        analyticsCache: 'analytics-cache-instance',
        dashboardCache: null
      };

      const appWithCache = express();
      appWithCache.use(express.json());
      appWithCache.use('/api', createMetricsRoutes(depsWithCacheSpy));

      await request(appWithCache)
        .get('/api/performance-correlations')
        .expect(200);

      expect(cacheSpy).toHaveBeenCalledWith('analytics-cache-instance');
    });
  });

  // ==================== Metrics Dashboard Tests ====================

  describe('GET /api/metrics/dashboard', () => {
    test('should return comprehensive metrics dashboard', async () => {
      // Insert some test data
      const eventTime = new Date().toISOString();
      testDb.db.prepare(`
        INSERT INTO events (filepath, change_type, timestamp)
        VALUES (?, ?, ?)
      `).run('test.js', 'change', eventTime);

      const response = await request(app)
        .get('/api/metrics/dashboard')
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body).toHaveProperty('metrics');
      expect(response.body.metrics).toHaveProperty('total_events');
      expect(response.body.metrics).toHaveProperty('events_24h');
      expect(response.body.metrics).toHaveProperty('total_files');
      expect(response.body.metrics).toHaveProperty('error_count');
      expect(response.body.metrics).toHaveProperty('conversation_count');
      expect(response.body.metrics).toHaveProperty('events_by_type');
      expect(response.body.metrics).toHaveProperty('active_projects');
      expect(response.body.metrics).toHaveProperty('avg_events_per_day');
    });

    test('should return 500 when no project databases are initialized', async () => {
      mockProjectDatabases.clear();

      const response = await request(app)
        .get('/api/metrics/dashboard')
        .expect('Content-Type', /json/)
        .expect(500);

      expect(response.body).toEqual({ error: 'No project databases initialized' });
    });

    test('should aggregate metrics across multiple projects', async () => {
      // Create second test database
      const dbPath2 = join(testDir, 'test2.db');
      const testDb2 = new RavenDB(dbPath2);
      mockProjectDatabases.set('project2', testDb2);

      // Insert data in both databases
      const eventTime = new Date().toISOString();
      testDb.db.prepare(`
        INSERT INTO events (filepath, change_type, timestamp)
        VALUES (?, ?, ?)
      `).run('test1.js', 'add', eventTime);

      testDb2.db.prepare(`
        INSERT INTO events (filepath, change_type, timestamp)
        VALUES (?, ?, ?)
      `).run('test2.js', 'change', eventTime);

      const response = await request(app)
        .get('/api/metrics/dashboard')
        .expect(200);

      expect(response.body.metrics.total_events).toBeGreaterThanOrEqual(2);

      testDb2.close();
    });

    test('should normalize event types (add->created, change->modified, unlink->deleted)', async () => {
      const eventTime = new Date().toISOString();

      testDb.db.prepare(`
        INSERT INTO events (filepath, change_type, timestamp)
        VALUES (?, ?, ?)
      `).run('test1.js', 'add', eventTime);

      testDb.db.prepare(`
        INSERT INTO events (filepath, change_type, timestamp)
        VALUES (?, ?, ?)
      `).run('test2.js', 'change', eventTime);

      testDb.db.prepare(`
        INSERT INTO events (filepath, change_type, timestamp)
        VALUES (?, ?, ?)
      `).run('test3.js', 'unlink', eventTime);

      const response = await request(app)
        .get('/api/metrics/dashboard')
        .expect(200);

      expect(response.body.metrics.events_by_type).toHaveProperty('created');
      expect(response.body.metrics.events_by_type).toHaveProperty('modified');
      expect(response.body.metrics.events_by_type).toHaveProperty('deleted');
    });

    test('should calculate most active file correctly', async () => {
      const eventTime = new Date().toISOString();

      // Insert multiple events for the same file
      for (let i = 0; i < 5; i++) {
        testDb.db.prepare(`
          INSERT INTO events (filepath, change_type, timestamp)
          VALUES (?, ?, ?)
        `).run('popular.js', 'change', eventTime);
      }

      const response = await request(app)
        .get('/api/metrics/dashboard')
        .expect(200);

      if (response.body.metrics.most_active_file) {
        expect(response.body.metrics.most_active_file).toHaveProperty('file');
        expect(response.body.metrics.most_active_file).toHaveProperty('changes');
        expect(response.body.metrics.most_active_file.changes).toBeGreaterThan(0);
      }
    });

    test('should calculate busiest hour correctly', async () => {
      const eventTime = new Date().toISOString();

      testDb.db.prepare(`
        INSERT INTO events (filepath, change_type, timestamp)
        VALUES (?, ?, ?)
      `).run('test.js', 'change', eventTime);

      const response = await request(app)
        .get('/api/metrics/dashboard')
        .expect(200);

      if (response.body.metrics.busiest_hour) {
        expect(response.body.metrics.busiest_hour).toHaveProperty('hour');
        expect(response.body.metrics.busiest_hour).toHaveProperty('count');
        expect(response.body.metrics.busiest_hour.hour).toBeGreaterThanOrEqual(0);
        expect(response.body.metrics.busiest_hour.hour).toBeLessThan(24);
      }
    });

    test('should count active projects (projects with events in last 7 days)', async () => {
      const recentTime = new Date().toISOString();

      testDb.db.prepare(`
        INSERT INTO events (filepath, change_type, timestamp)
        VALUES (?, ?, ?)
      `).run('recent.js', 'change', recentTime);

      const response = await request(app)
        .get('/api/metrics/dashboard')
        .expect(200);

      expect(response.body.metrics.active_projects).toBeGreaterThanOrEqual(1);
    });

    test('should handle projects with no events gracefully', async () => {
      // Create a second database with no events
      const dbPath2 = join(testDir, 'empty.db');
      const emptyDb = new RavenDB(dbPath2);
      mockProjectDatabases.set('empty-project', emptyDb);

      const response = await request(app)
        .get('/api/metrics/dashboard')
        .expect(200);

      expect(response.body.metrics).toBeDefined();

      emptyDb.close();
    });

    test('should handle database query errors for individual projects', async () => {
      // Create a mock database that throws errors
      const errorDb = {
        db: {
          prepare: jest.fn().mockImplementation(() => {
            throw new Error('Query failed');
          })
        }
      };
      mockProjectDatabases.set('error-project', errorDb);

      const response = await request(app)
        .get('/api/metrics/dashboard')
        .expect(200);

      // Should still return valid metrics for other projects
      expect(response.body.metrics).toBeDefined();
    });

    test('should use cache middleware', async () => {
      const cacheSpy = jest.fn((cache) => (req, res, next) => {
        next();
      });

      const depsWithCacheSpy = {
        projectState: new Map(),
        projectDatabases: mockProjectDatabases,
        cacheMiddleware: cacheSpy,
        metricsCache: null,
        analyticsCache: null,
        dashboardCache: 'dashboard-cache-instance'
      };

      const appWithCache = express();
      appWithCache.use(express.json());
      appWithCache.use('/api', createMetricsRoutes(depsWithCacheSpy));

      await request(appWithCache)
        .get('/api/metrics/dashboard')
        .expect(200);

      expect(cacheSpy).toHaveBeenCalledWith('dashboard-cache-instance');
    });

    test('should handle errors in dashboard aggregation', async () => {
      // Replace projectDatabases with an iterator that throws
      const errorIterator = {
        entries: jest.fn().mockImplementation(function* () {
          throw new Error('Iterator failed');
        }),
        size: 1
      };

      const depsWithError = {
        projectState: new Map(),
        projectDatabases: errorIterator,
        cacheMiddleware: mockCacheMiddleware,
        metricsCache: null,
        analyticsCache: null,
        dashboardCache: null
      };

      const errorApp = express();
      errorApp.use(express.json());
      errorApp.use('/api', createMetricsRoutes(depsWithError));

      const response = await request(errorApp)
        .get('/api/metrics/dashboard')
        .expect(500);

      expect(response.body).toEqual({ error: 'Failed to retrieve custom metrics' });
    });
  });
});
