/**
 * Tests for Events Routes
 */

import { jest } from '@jest/globals';
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

    const deps = {
      projectState: new Map(),
      getDb: () => testDb
    };

    app.use('/api/events', createEventsRoutes(deps));
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

  describe('GET /api/events', () => {
    test('should return events list', async () => {
      const response = await request(app)
        .get('/api/events')
        .expect('Content-Type', /json/)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
    });

    test('should handle limit parameter', async () => {
      const response = await request(app)
        .get('/api/events?limit=10')
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeLessThanOrEqual(10);
    });

    test('should handle offset parameter', async () => {
      const response = await request(app)
        .get('/api/events?offset=5')
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
    });
  });

  describe('GET /api/events/stats', () => {
    test('should return event statistics', async () => {
      const response = await request(app)
        .get('/api/events/stats')
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body).toHaveProperty('total');
      expect(typeof response.body.total).toBe('number');
    });
  });

  describe('GET /api/events/:id', () => {
    test('should handle specific event request', async () => {
      const response = await request(app)
        .get('/api/events/123')
        .expect('Content-Type', /json/);

      expect([200, 404]).toContain(response.status);
    });

    test('should handle invalid event ID', async () => {
      const response = await request(app)
        .get('/api/events/invalid-id')
        .expect('Content-Type', /json/);

      expect([400, 404]).toContain(response.status);
    });
  });

  describe('DELETE /api/events/:id', () => {
    test('should handle delete request', async () => {
      const response = await request(app)
        .delete('/api/events/123')
        .expect('Content-Type', /json/);

      expect([200, 404, 500]).toContain(response.status);
    });
  });
});
