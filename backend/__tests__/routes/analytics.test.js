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
    } catch (_error) {
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

  describe('Error Handling', () => {
    test('should handle database not initialized in agent-events', async () => {
      const appNoDb = express();
      appNoDb.use(express.json());

      const depsNoDb = {
        projectState: { db: null },
        projectDatabases: mockProjectDatabases,
        cacheMiddleware: mockCacheMiddleware,
        analyticsCache: null
      };

      appNoDb.use('/api', createAnalyticsRoutes(depsNoDb));

      const response = await request(appNoDb)
        .get('/api/agent-events')
        .expect(500);

      expect(response.body.error).toContain('Database not initialized');
    });

    test('should handle database not initialized in events-by-agent', async () => {
      const appNoDb = express();
      appNoDb.use(express.json());

      const depsNoDb = {
        projectState: { db: null },
        projectDatabases: mockProjectDatabases,
        cacheMiddleware: mockCacheMiddleware,
        analyticsCache: null
      };

      appNoDb.use('/api', createAnalyticsRoutes(depsNoDb));

      const response = await request(appNoDb)
        .get('/api/events-by-agent/test-agent')
        .expect(500);

      expect(response.body.error).toContain('Database not initialized');
    });

    test('should handle errors in getRecentAgentEvents', async () => {
      const originalFn = testDb.getRecentAgentEvents;
      testDb.getRecentAgentEvents = () => {
        throw new Error('Query failed');
      };

      const response = await request(app)
        .get('/api/agent-events')
        .expect(500);

      expect(response.body.error).toBe('Failed to retrieve agent events');

      testDb.getRecentAgentEvents = originalFn;
    });

    test('should handle errors in getEventsByAgent', async () => {
      const originalFn = testDb.getEventsByAgent;
      testDb.getEventsByAgent = () => {
        throw new Error('Agent query failed');
      };

      const response = await request(app)
        .get('/api/events-by-agent/test-agent')
        .expect(500);

      expect(response.body.error).toBe('Failed to retrieve events by agent');

      testDb.getEventsByAgent = originalFn;
    });

    test('should handle errors in anomaly detection', async () => {
      // Create faulty database that throws during query
      const faultyDb = {
        db: {
          prepare: () => {
            throw new Error('Database error');
          }
        }
      };

      const mockProjectDbs = new Map();
      mockProjectDbs.set('faulty-project', faultyDb);

      const appFaulty = express();
      appFaulty.use(express.json());

      const depsFaulty = {
        projectState: { db: testDb },
        projectDatabases: mockProjectDbs,
        cacheMiddleware: mockCacheMiddleware,
        analyticsCache: null
      };

      appFaulty.use('/api', createAnalyticsRoutes(depsFaulty));

      // Should still return 200 but log the error internally
      const response = await request(appFaulty)
        .get('/api/anomalies/detect')
        .expect(200);

      expect(response.body).toHaveProperty('anomalies');
    });

    test('should handle top-level errors in anomaly detection', async () => {
      // Override the entire request to force error
      const appError = express();
      appError.use(express.json());

      const depsError = {
        projectState: { db: testDb },
        projectDatabases: null, // This will cause error
        cacheMiddleware: mockCacheMiddleware,
        analyticsCache: null
      };

      appError.use('/api', createAnalyticsRoutes(depsError));

      const response = await request(appError)
        .get('/api/anomalies/detect')
        .expect(500);

      expect(response.body).toHaveProperty('error');
    });

    test('should handle errors in historical trends', async () => {
      const appError = express();
      appError.use(express.json());

      const depsError = {
        projectState: { db: testDb },
        projectDatabases: null, // This will cause error
        cacheMiddleware: mockCacheMiddleware,
        analyticsCache: null
      };

      appError.use('/api', createAnalyticsRoutes(depsError));

      const response = await request(appError)
        .get('/api/trends/historical')
        .expect(500);

      expect(response.body).toHaveProperty('error');
    });

    test('should handle database errors in trends aggregation', async () => {
      const faultyDb = {
        db: {
          prepare: () => {
            throw new Error('Trend query failed');
          }
        }
      };

      const mockProjectDbs = new Map();
      mockProjectDbs.set('faulty-project', faultyDb);

      const appFaulty = express();
      appFaulty.use(express.json());

      const depsFaulty = {
        projectState: { db: testDb },
        projectDatabases: mockProjectDbs,
        cacheMiddleware: mockCacheMiddleware,
        analyticsCache: null
      };

      appFaulty.use('/api', createAnalyticsRoutes(depsFaulty));

      // Should still work but skip faulty project
      const response = await request(appFaulty)
        .get('/api/trends/historical')
        .expect(200);

      expect(response.body).toHaveProperty('trends');
    });

    test('should return 404 when agent profile not found', async () => {
      const appWithProfiler = express();
      appWithProfiler.use(express.json());

      const mockProfiler = {
        getAgentProfile: jest.fn().mockReturnValue(null) // No profile found
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
        .expect(404);

      expect(response.body.error).toContain('No data found');
    });

    test('should handle errors in getAgentProfile', async () => {
      const appWithProfiler = express();
      appWithProfiler.use(express.json());

      const mockProfiler = {
        getAgentProfile: jest.fn().mockImplementation(() => {
          throw new Error('Profiler error');
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
        .expect(500);

      expect(response.body).toHaveProperty('error');
    });

    test('should handle errors in detectBehaviorChange', async () => {
      const appWithProfiler = express();
      appWithProfiler.use(express.json());

      const mockProfiler = {
        detectBehaviorChange: jest.fn().mockImplementation(() => {
          throw new Error('Detection error');
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
        .get('/api/agents/test-agent/behavior-change')
        .expect(500);

      expect(response.body).toHaveProperty('error');
    });

    test('should handle errors in compareAgents', async () => {
      const appWithProfiler = express();
      appWithProfiler.use(express.json());

      const mockProfiler = {
        compareAgents: jest.fn().mockImplementation(() => {
          throw new Error('Comparison error');
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
        .get('/api/agents/compare')
        .expect(500);

      expect(response.body).toHaveProperty('error');
    });

    test('should return 404 when project not found in similar changes', async () => {
      const appWithMatcher = express();
      appWithMatcher.use(express.json());

      const mockMatcher = {
        findSimilarChanges: jest.fn()
      };

      const deps = {
        projectState: { db: testDb },
        projectDatabases: new Map(), // Empty - no projects
        cacheMiddleware: mockCacheMiddleware,
        analyticsCache: null,
        patternMatcher: mockMatcher
      };

      appWithMatcher.use('/api', createAnalyticsRoutes(deps));

      const response = await request(appWithMatcher)
        .post('/api/changes/1/similar?project=nonexistent')
        .expect(404);

      expect(response.body.error).toContain('Project not found');
    });

    test('should return 404 when change not found', async () => {
      const appWithMatcher = express();
      appWithMatcher.use(express.json());

      const mockMatcher = {
        findSimilarChanges: jest.fn()
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
        .post('/api/changes/999999/similar')
        .expect(404);

      expect(response.body.error).toContain('Change not found');
    });

    test('should handle errors in findSimilarChanges', async () => {
      const appWithMatcher = express();
      appWithMatcher.use(express.json());

      const mockMatcher = {
        findSimilarChanges: jest.fn().mockImplementation(() => {
          throw new Error('Pattern matching error');
        })
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
        .expect(500);

      expect(response.body).toHaveProperty('error');
    });
  });

  describe('Anomaly Detection - Specific Cases', () => {
    test('should detect excessive deletions anomaly', async () => {
      // Clear and insert many deletion events in a single hour
      const db = testDb.db;
      db.prepare('DELETE FROM events').run();

      // Insert baseline (older events)
      for (let i = 0; i < 5; i++) {
        db.prepare(`
          INSERT INTO events (filepath, change_type, timestamp)
          VALUES (?, 'change', datetime('now', '-48 hours'))
        `).run(`old${i}.js`);
      }

      // Insert spike of deletions in recent hour
      for (let i = 0; i < 15; i++) {
        db.prepare(`
          INSERT INTO events (filepath, change_type, timestamp)
          VALUES (?, 'unlink', datetime('now', '-30 minutes'))
        `).run(`file${i}.js`);
      }

      const response = await request(app)
        .get('/api/anomalies/detect?hours=24')
        .expect(200);

      expect(response.body.anomalies.some(a => a.type === 'excessive_deletions')).toBe(true);
    });

    test('should detect hot file anomaly', async () => {
      // Clear and insert many changes to same file
      const db = testDb.db;
      db.prepare('DELETE FROM events').run();

      for (let i = 0; i < 25; i++) {
        db.prepare(`
          INSERT INTO events (filepath, change_type, timestamp)
          VALUES ('hotfile.js', 'change', datetime('now', '-30 minutes'))
        `).run();
      }

      const response = await request(app)
        .get('/api/anomalies/detect?hours=24')
        .expect(200);

      expect(response.body.anomalies.some(a => a.type === 'hot_file')).toBe(true);
    });

    test('should detect activity spike anomaly', async () => {
      // Insert baseline events (old)
      const db = testDb.db;
      for (let i = 0; i < 5; i++) {
        db.prepare(`
          INSERT INTO events (filepath, change_type, timestamp)
          VALUES (?, 'change', datetime('now', '-48 hours'))
        `).run(`old${i}.js`);
      }

      // Insert spike of recent events
      for (let i = 0; i < 50; i++) {
        db.prepare(`
          INSERT INTO events (filepath, change_type, timestamp)
          VALUES (?, 'change', datetime('now'))
        `).run(`new${i}.js`);
      }

      const response = await request(app)
        .get('/api/anomalies/detect?hours=24&threshold=1.5')
        .expect(200);

      expect(response.body.anomalies.some(a => a.type === 'activity_spike')).toBe(true);
    });
  });

  describe('Advanced Query Parameters', () => {
    test('should handle agent profile with project and days params', async () => {
      const appWithProfiler = express();
      appWithProfiler.use(express.json());

      const mockProfiler = {
        getAgentProfile: jest.fn().mockReturnValue({ name: 'test' })
      };

      const deps = {
        projectState: { db: testDb },
        projectDatabases: mockProjectDatabases,
        cacheMiddleware: mockCacheMiddleware,
        analyticsCache: null,
        behaviorProfiler: mockProfiler
      };

      appWithProfiler.use('/api', createAnalyticsRoutes(deps));

      await request(appWithProfiler)
        .get('/api/agents/test-agent/profile?project=test-project&days=60')
        .expect(200);

      expect(mockProfiler.getAgentProfile).toHaveBeenCalledWith('test-project', 'test-agent', 60);
    });

    test('should handle behavior change with project and hours params', async () => {
      const appWithProfiler = express();
      appWithProfiler.use(express.json());

      const mockProfiler = {
        detectBehaviorChange: jest.fn().mockReturnValue({ detected: false })
      };

      const deps = {
        projectState: { db: testDb },
        projectDatabases: mockProjectDatabases,
        cacheMiddleware: mockCacheMiddleware,
        analyticsCache: null,
        behaviorProfiler: mockProfiler
      };

      appWithProfiler.use('/api', createAnalyticsRoutes(deps));

      await request(appWithProfiler)
        .get('/api/agents/test-agent/behavior-change?project=test-project&hours=48')
        .expect(200);

      expect(mockProfiler.detectBehaviorChange).toHaveBeenCalledWith('test-project', 'test-agent', 48);
    });

    test('should handle similar changes with limit param', async () => {
      const appWithMatcher = express();
      appWithMatcher.use(express.json());

      const mockMatcher = {
        findSimilarChanges: jest.fn().mockReturnValue([])
      };

      const deps = {
        projectState: { db: testDb },
        projectDatabases: mockProjectDatabases,
        cacheMiddleware: mockCacheMiddleware,
        analyticsCache: null,
        patternMatcher: mockMatcher
      };

      appWithMatcher.use('/api', createAnalyticsRoutes(deps));

      await request(appWithMatcher)
        .post('/api/changes/1/similar?limit=10')
        .expect(200);

      expect(mockMatcher.findSimilarChanges).toHaveBeenCalledWith(
        expect.any(Object),
        'test-project',
        10
      );
    });
  });
});
