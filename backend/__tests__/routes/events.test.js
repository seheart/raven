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
});
