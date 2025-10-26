/**
 * Tests for Search Routes
 */

import { jest} from '@jest/globals';
import request from 'supertest';
import express from 'express';
import { createSearchRoutes } from '../../routes/search.js';
import { RavenDB } from '../../db.js';
import { mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('Search Routes', () => {
  let app;
  let testDb;
  let testDir;

  beforeEach(() => {
    app = express();
    app.use(express.json());

    // Create temporary test database
    testDir = join(tmpdir(), `search-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
    const dbPath = join(testDir, 'test.db');
    testDb = new RavenDB(dbPath);

    // Insert test data
    testDb.db.prepare(`
      INSERT INTO events (filepath, change_type, timestamp, project_name)
      VALUES ('src/test.js', 'modified', datetime('now'), 'test-project')
    `).run();

    testDb.db.prepare(`
      INSERT INTO conversations (tool_name, content, timestamp, project_name)
      VALUES ('test-tool', 'test conversation content', datetime('now'), 'test-project')
    `).run();

    testDb.db.prepare(`
      INSERT INTO error_logs (message, severity, context, timestamp)
      VALUES ('test error message', 'high', '{}', datetime('now'))
    `).run();

    testDb.db.prepare(`
      INSERT INTO notifications (title, message, timestamp)
      VALUES ('Test Notification', 'test notification message', datetime('now'))
    `).run();

    const deps = {
      projectState: {
        db: testDb
      }
    };

    app.use('/api', createSearchRoutes(deps));
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

  describe('GET /api/search/global', () => {
    test('should return empty results for empty query', async () => {
      const response = await request(app)
        .get('/api/search/global?q=')
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body).toHaveProperty('results');
      expect(response.body.results).toEqual([]);
      expect(response.body.total).toBe(0);
    });

    test('should return empty results for short query', async () => {
      const response = await request(app)
        .get('/api/search/global?q=a')
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body.results).toEqual([]);
    });

    test('should search across events', async () => {
      const response = await request(app)
        .get('/api/search/global?q=test.js')
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body).toHaveProperty('results');
      expect(response.body).toHaveProperty('query', 'test.js');
      expect(response.body).toHaveProperty('categories');
      expect(Array.isArray(response.body.results)).toBe(true);
    });

    test('should search across conversations', async () => {
      const response = await request(app)
        .get('/api/search/global?q=conversation')
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body.results.length).toBeGreaterThan(0);
      const hasConversation = response.body.results.some(r => r.type === 'conversation');
      expect(hasConversation).toBe(true);
    });

    test('should search across errors', async () => {
      const response = await request(app)
        .get('/api/search/global?q=error')
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body.results.length).toBeGreaterThan(0);
      const hasError = response.body.results.some(r => r.type === 'error');
      expect(hasError).toBe(true);
    });

    test('should search across notifications', async () => {
      const response = await request(app)
        .get('/api/search/global?q=notification')
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body.results.length).toBeGreaterThan(0);
      const hasNotification = response.body.results.some(r => r.type === 'notification');
      expect(hasNotification).toBe(true);
    });

    test('should handle limit parameter', async () => {
      const response = await request(app)
        .get('/api/search/global?q=test&limit=2')
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body.results.length).toBeLessThanOrEqual(2);
    });

    test('should include category counts', async () => {
      const response = await request(app)
        .get('/api/search/global?q=test')
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body).toHaveProperty('categories');
      expect(response.body.categories).toHaveProperty('events');
      expect(response.body.categories).toHaveProperty('conversations');
      expect(response.body.categories).toHaveProperty('errors');
      expect(response.body.categories).toHaveProperty('notifications');
    });

    test('should sort results by timestamp', async () => {
      const response = await request(app)
        .get('/api/search/global?q=test')
        .expect('Content-Type', /json/)
        .expect(200);

      const timestamps = response.body.results.map(r => new Date(r.timestamp).getTime());
      const isSorted = timestamps.every((t, i) => i === 0 || timestamps[i - 1] >= t);
      expect(isSorted).toBe(true);
    });
  });
});
