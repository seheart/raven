/**
 * Tests for Events Routes
 */

import { jest } from '@jest/globals';
import request from 'supertest';
import express from 'express';
import { createEventsRoutes } from '../../routes/events.js';
import { RavenDB } from '../../db.js';
import { analyticsCache } from '../../utils/cache.js';
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
        projectPaths: new Map([['test-project', '/home/seth/Projects/raven/backend']]),
        getDb: () => testDb
      };

      gitApp.use('/api', createEventsRoutes(gitDeps));

      const response = await request(gitApp).get('/api/tracked-files').expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      // Should have git-tracked files from backend repo
      expect(response.body.length).toBeGreaterThan(0);
    });

    test('should return tracked files for specific project', async () => {
      // Create app with projectPaths
      const multiApp = express();
      multiApp.use(express.json());

      const mockProjectDbs = new Map([['test-project', testDb]]);
      const mockProjectPaths = new Map([['test-project', '/home/seth/Projects/raven/backend']]);

      const multiDeps = {
        projectState: {
          db: testDb,
          watchPath: testDir
        },
        projectDatabases: mockProjectDbs,
        projectPaths: mockProjectPaths
      };

      multiApp.use('/api', createEventsRoutes(multiDeps));

      const response = await request(multiApp)
        .get('/api/tracked-files?project=test-project')
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
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
      const response = await request(app).get('/api/file-events?limit=10').expect(200);

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
      testDb.db
        .prepare(
          `
        INSERT INTO events (timestamp, filepath, change_type, diff)
        VALUES
          (datetime('now'), '/test/file1.js', 'modified', 'diff1'),
          (datetime('now'), '/test/file2.js', 'created', 'diff2')
      `
        )
        .run();

      const response = await request(app).get('/api/all-file-events').expect(200);

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

      const response = await request(appNoDb).get('/api/file-events').expect(500);

      expect(response.body.error).toContain('No active project database');
    });

    test('should handle errors in getTrackedFiles', async () => {
      // Override getTrackedFiles to throw error
      const originalFn = testDb.getTrackedFiles;
      testDb.getTrackedFiles = () => {
        throw new Error('Database error');
      };

      const response = await request(app).get('/api/tracked-files').expect(500);

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

      const response = await request(app).get('/api/file-events').expect(500);

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

      const response = await request(appFaulty).get('/api/all-file-events').expect(500);

      expect(response.body.error).toContain('Faulty database');
    });

    test('should handle errors in activity log', async () => {
      analyticsCache.clear(); // Clear cache before error test

      // Override getActivityLog to throw error
      const originalFn = testDb.getActivityLog;
      testDb.getActivityLog = () => {
        throw new Error('Activity log failed');
      };

      const response = await request(app)
        .get('/api/activity-log')
        .set('Cache-Control', 'no-cache')
        .expect(500);

      expect(response.body.error).toBe('Activity log failed');

      // Restore
      testDb.getActivityLog = originalFn;
    });
  });

  describe('Advanced Query Parameters', () => {
    test('should handle diff parameter in file-events', async () => {
      const response = await request(app).get('/api/file-events?diff=true').expect(200);

      expect(response.body).toHaveProperty('events');
    });

    test('should handle project parameter in file-events', async () => {
      const response = await request(app).get('/api/file-events?project=test-project').expect(200);

      expect(response.body).toHaveProperty('events');
      expect(response.body.project).toBe('test-project');
    });

    test('should handle diff parameter in all-file-events', async () => {
      const response = await request(app).get('/api/all-file-events?diff=true').expect(200);

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

      const response = await request(app).get('/api/file-events').expect(200);

      expect(response.body.total).toBe(42);
    });

    test('should fallback to events.length when getTotalEventCount not available', async () => {
      // Ensure getTotalEventCount doesn't exist
      delete testDb.getTotalEventCount;

      const response = await request(app).get('/api/file-events').expect(200);

      expect(response.body).toHaveProperty('total');
      expect(typeof response.body.total).toBe('number');
    });
  });

  describe('GET /api/files/:filepath/history', () => {
    beforeEach(() => {
      // Mock getFileHistory
      testDb.getFileHistory = jest.fn().mockReturnValue([
        {
          id: 1,
          timestamp: '2025-01-01T10:00:00Z',
          filepath: '/test/file.js',
          change_type: 'create',
          diff: 'Initial commit'
        },
        {
          id: 2,
          timestamp: '2025-01-01T11:00:00Z',
          filepath: '/test/file.js',
          change_type: 'edit',
          diff: 'Modified content'
        }
      ]);
    });

    test('should return file history', async () => {
      const response = await request(app)
        .get('/api/files/test/file.js/history')
        .expect('Content-Type', /json/)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body).toHaveLength(2);
      expect(testDb.getFileHistory).toHaveBeenCalledWith('test/file.js');
    });

    test('should map change_type to frontend format', async () => {
      const response = await request(app).get('/api/files/test/file.js/history').expect(200);

      expect(response.body[0].change_type).toBe('created');
      expect(response.body[1].change_type).toBe('modified');
    });

    test('should handle URL-encoded filepath', async () => {
      const response = await request(app)
        .get('/api/files/test%2Fpath%2Ffile.js/history')
        .expect(200);

      expect(testDb.getFileHistory).toHaveBeenCalledWith('test/path/file.js');
    });

    test('should handle filepath with special characters', async () => {
      const response = await request(app)
        .get('/api/files/src/components/Test Component.svelte/history')
        .expect(200);

      expect(testDb.getFileHistory).toHaveBeenCalled();
    });

    test('should handle errors in file history retrieval', async () => {
      testDb.getFileHistory.mockImplementation(() => {
        throw new Error('File history failed');
      });

      const response = await request(app)
        .get('/api/files/test/file.js/history')
        .expect('Content-Type', /json/)
        .expect(500);

      expect(response.body).toHaveProperty('error', 'File history failed');
    });
  });

  describe('GET /api/snapshot/:eventId/:filename', () => {
    let snapshotsDir;

    beforeEach(() => {
      snapshotsDir = join(testDir, 'snapshots');
      mkdirSync(snapshotsDir, { recursive: true });

      // Update projectState with snapshotsDir
      const mockProjectDatabases = new Map();
      mockProjectDatabases.set('test-project', testDb);

      const depsWithSnapshots = {
        projectState: {
          db: testDb,
          watchPath: testDir,
          snapshotsDir
        },
        projectDatabases: mockProjectDatabases
      };

      app = express();
      app.use(express.json());
      app.use('/api', createEventsRoutes(depsWithSnapshots));

      // Mock getEventById
      testDb.getEventById = jest.fn().mockReturnValue({
        id: 1,
        timestamp: '2025-01-01T10:00:00Z',
        filepath: 'test/file.js'
      });
    });

    test('should return 404 when event not found', async () => {
      testDb.getEventById.mockReturnValue(null);

      const response = await request(app)
        .get('/api/snapshot/999/file.js')
        .expect('Content-Type', /json/)
        .expect(404);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('Event 999 not found');
    });

    test('should return 404 when snapshot file not found', async () => {
      const response = await request(app)
        .get('/api/snapshot/1/file.js')
        .expect('Content-Type', /json/)
        .expect(404);

      expect(response.body).toHaveProperty('error', 'Snapshot not found');
      expect(response.body).toHaveProperty('event_id', '1');
    });

    test('should return snapshot content from gzip file', async () => {
      const fs = await import('fs');
      const zlib = await import('zlib');

      const timestamp = new Date('2025-01-01T10:00:00Z').getTime();
      const snapshotFilename = `test_file.js_${timestamp}.gz`;
      const snapshotPath = join(snapshotsDir, snapshotFilename);

      // Create compressed snapshot
      const content = 'const test = "Hello World";\n';
      const compressed = zlib.gzipSync(content);
      fs.writeFileSync(snapshotPath, compressed);

      const response = await request(app)
        .get('/api/snapshot/1/file.js')
        .expect('Content-Type', /text\/plain/)
        .expect(200);

      expect(response.text).toBe(content);
    });

    test('should handle uncompressed snapshots (backwards compatibility)', async () => {
      const fs = await import('fs');

      const timestamp = new Date('2025-01-01T10:00:00Z').getTime();
      const snapshotFilename = `test_file.js_${timestamp}.txt`;
      const snapshotPath = join(snapshotsDir, snapshotFilename);

      const content = 'const test = "Hello World";\n';
      fs.writeFileSync(snapshotPath, content, 'utf8');

      const response = await request(app)
        .get('/api/snapshot/1/file.js')
        .expect('Content-Type', /text\/plain/)
        .expect(200);

      expect(response.text).toBe(content);
    });

    test('should handle errors during snapshot decompression', async () => {
      const fs = await import('fs');

      const timestamp = new Date('2025-01-01T10:00:00Z').getTime();
      const snapshotFilename = `test_file.js_${timestamp}.gz`;
      const snapshotPath = join(snapshotsDir, snapshotFilename);

      // Write invalid gzip data
      fs.writeFileSync(snapshotPath, 'invalid gzip data');

      const response = await request(app)
        .get('/api/snapshot/1/file.js')
        .expect('Content-Type', /json/)
        .expect(500);

      expect(response.body).toHaveProperty('error');
    });

    test('should handle errors in getEventById', async () => {
      testDb.getEventById.mockImplementation(() => {
        throw new Error('Database error');
      });

      const response = await request(app)
        .get('/api/snapshot/1/file.js')
        .expect('Content-Type', /json/)
        .expect(500);

      expect(response.body).toHaveProperty('error', 'Database error');
    });
  });
});
