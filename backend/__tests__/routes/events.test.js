/**
 * Tests for Events Routes
 */

import request from 'supertest';
import express from 'express';
import { createEventsRoutes } from '../../routes/events.js';
import { RavenDB } from '../../db.js';
import { mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('Events Routes', () => {
  let app;
  let testDb;
  let testDir;

  beforeEach(() => {
    app = express();
    app.use(express.json());

    // Create temporary test database
    testDir = join(tmpdir(), `events-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
    const dbPath = join(testDir, 'test.db');
    testDb = new RavenDB(dbPath);

    const mockProjectDatabases = new Map();
    mockProjectDatabases.set('test-project', testDb);

    const deps = {
      projectState: {
        db: testDb,
        watchPath: testDir
      },
      projectDatabases: mockProjectDatabases,
      getDb: () => testDb
    };

    app.use('/api', createEventsRoutes(deps));
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

  describe('GET /api/tracked-files', () => {
    test('should return tracked files list', async () => {
      const response = await request(app)
        .get('/api/tracked-files')
        .expect('Content-Type', /json/)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
    });

    test('should return git-tracked files when in a git repo', async () => {
      // Create new app with backend directory (which IS a git repo) as watchPath
      const gitApp = express();
      gitApp.use(express.json());

      const gitDeps = {
        projectState: {
          db: testDb,
          watchPath: '/home/seth/Projects/raven/backend' // Actual git repo
        },
        projectDatabases: new Map([['test-project', testDb]]),
        getDb: () => testDb
      };

      gitApp.use('/api', createEventsRoutes(gitDeps));

      const response = await request(gitApp)
        .get('/api/tracked-files')
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      // Should have git-tracked files from backend repo
      expect(response.body.length).toBeGreaterThan(0);
    });
  });

  describe('GET /api/file-events', () => {
    test('should return file events', async () => {
      const response = await request(app)
        .get('/api/file-events')
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body).toHaveProperty('events');
      expect(response.body).toHaveProperty('total');
      expect(Array.isArray(response.body.events)).toBe(true);
    });

    test('should handle limit parameter', async () => {
      const response = await request(app)
        .get('/api/file-events?limit=10')
        .expect(200);

      expect(response.body).toHaveProperty('events');
      expect(Array.isArray(response.body.events)).toBe(true);
    });
  });

  describe('GET /api/all-file-events', () => {
    test('should return all file events', async () => {
      const response = await request(app)
        .get('/api/all-file-events')
        .expect('Content-Type', /json/)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
    });

    test('should tag events with project names when events exist', async () => {
      // Insert some events into the database (using correct column names)
      testDb.db.prepare(`
        INSERT INTO events (timestamp, filepath, change_type, diff)
        VALUES
          (datetime('now'), '/test/file1.js', 'modified', 'diff1'),
          (datetime('now'), '/test/file2.js', 'created', 'diff2')
      `).run();

      const response = await request(app)
        .get('/api/all-file-events')
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThan(0);
      // Events should have project property added by the endpoint
      expect(response.body[0]).toHaveProperty('project');
      expect(response.body[0].project).toBe('test-project');
    });
  });

  describe('GET /api/activity-log', () => {
    test('should return activity log', async () => {
      const response = await request(app)
        .get('/api/activity-log')
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body).toHaveProperty('activities');
      expect(response.body).toHaveProperty('total');
      expect(Array.isArray(response.body.activities)).toBe(true);
    });
  });

  describe('GET /api/events-by-session/:sessionId', () => {
    test('should return events for specific session', async () => {
      // Use a valid UUIDv4 for the session ID (required by validation)
      const validSessionId = '550e8400-e29b-41d4-a716-446655440000';
      const response = await request(app)
        .get(`/api/events-by-session/${validSessionId}`)
        .expect('Content-Type', /json/)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
    });

    test('should reject invalid session ID format', async () => {
      const response = await request(app)
        .get('/api/events-by-session/invalid-session-id')
        .expect('Content-Type', /json/)
        .expect(400);

      expect(response.body.error).toBe('Validation failed');
    });
  });

  describe('Error Handling', () => {
    test('should handle project not found in file-events', async () => {
      const response = await request(app)
        .get('/api/file-events?project=nonexistent-project')
        .expect(404);

      expect(response.body.error).toContain('not found');
    });

    test('should handle no active database in file-events', async () => {
      // Create app with no active database
      const appNoDb = express();
      appNoDb.use(express.json());

      const depsNoDb = {
        projectState: {
          db: null, // No active database
          watchPath: testDir
        },
        projectDatabases: new Map()
      };

      appNoDb.use('/api', createEventsRoutes(depsNoDb));

      const response = await request(appNoDb)
        .get('/api/file-events')
        .expect(500);

      expect(response.body.error).toContain('No active project database');
    });

    test('should handle errors in getTrackedFiles', async () => {
      // Override getTrackedFiles to throw error
      const originalFn = testDb.getTrackedFiles;
      testDb.getTrackedFiles = () => {
        throw new Error('Database error');
      };

      const response = await request(app)
        .get('/api/tracked-files')
        .expect(500);

      expect(response.body.error).toBe('Database error');

      // Restore
      testDb.getTrackedFiles = originalFn;
    });

    test('should handle errors in getEventsBySession', async () => {
      // Override getEventsBySession to throw error
      const originalFn = testDb.getEventsBySession;
      testDb.getEventsBySession = () => {
        throw new Error('Session query failed');
      };

      const validSessionId = '550e8400-e29b-41d4-a716-446655440000';
      const response = await request(app)
        .get(`/api/events-by-session/${validSessionId}`)
        .expect(500);

      expect(response.body.error).toBe('Session query failed');

      // Restore
      testDb.getEventsBySession = originalFn;
    });

    test('should handle errors in getRecentFileEvents', async () => {
      // Override getRecentFileEvents to throw error
      const originalFn = testDb.getRecentFileEvents;
      testDb.getRecentFileEvents = () => {
        throw new Error('Events query failed');
      };

      const response = await request(app)
        .get('/api/file-events')
        .expect(500);

      expect(response.body.error).toBe('Events query failed');

      // Restore
      testDb.getRecentFileEvents = originalFn;
    });

    test('should handle errors in all-file-events', async () => {
      // Create a faulty database
      const mockProjectDatabases = new Map();
      mockProjectDatabases.set('faulty-project', {
        getRecentFileEvents: () => {
          throw new Error('Faulty database');
        }
      });

      const appFaulty = express();
      appFaulty.use(express.json());

      const depsFaulty = {
        projectState: {
          db: testDb,
          watchPath: testDir
        },
        projectDatabases: mockProjectDatabases
      };

      appFaulty.use('/api', createEventsRoutes(depsFaulty));

      const response = await request(appFaulty)
        .get('/api/all-file-events')
        .expect(500);

      expect(response.body.error).toContain('Faulty database');
    });

    test('should handle errors in activity log', async () => {
      // Override getActivityLog to throw error
      const originalFn = testDb.getActivityLog;
      testDb.getActivityLog = () => {
        throw new Error('Activity log failed');
      };

      const response = await request(app)
        .get('/api/activity-log')
        .expect(500);

      expect(response.body.error).toBe('Activity log failed');

      // Restore
      testDb.getActivityLog = originalFn;
    });
  });

  describe('Advanced Query Parameters', () => {
    test('should handle diff parameter in file-events', async () => {
      const response = await request(app)
        .get('/api/file-events?diff=true')
        .expect(200);

      expect(response.body).toHaveProperty('events');
    });

    test('should handle project parameter in file-events', async () => {
      const response = await request(app)
        .get('/api/file-events?project=test-project')
        .expect(200);

      expect(response.body).toHaveProperty('events');
      expect(response.body.project).toBe('test-project');
    });

    test('should handle diff parameter in all-file-events', async () => {
      const response = await request(app)
        .get('/api/all-file-events?diff=true')
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
    });

    test('should handle activity log with filters', async () => {
      const response = await request(app)
        .get('/api/activity-log?limit=50&offset=10&search=test')
        .expect(200);

      expect(response.body).toHaveProperty('activities');
      expect(response.body).toHaveProperty('total');
    });

    test('should handle activity log with date filters', async () => {
      const response = await request(app)
        .get('/api/activity-log?startDate=2024-01-01&endDate=2024-12-31')
        .expect(200);

      expect(response.body).toHaveProperty('activities');
    });
  });

  describe('getTotalEventCount Feature', () => {
    test('should use getTotalEventCount when available', async () => {
      // Add getTotalEventCount method
      testDb.getTotalEventCount = () => 42;

      const response = await request(app)
        .get('/api/file-events')
        .expect(200);

      expect(response.body.total).toBe(42);
    });

    test('should fallback to events.length when getTotalEventCount not available', async () => {
      // Ensure getTotalEventCount doesn't exist
      delete testDb.getTotalEventCount;

      const response = await request(app)
        .get('/api/file-events')
        .expect(200);

      expect(response.body).toHaveProperty('total');
      expect(typeof response.body.total).toBe('number');
    });
  });
});
