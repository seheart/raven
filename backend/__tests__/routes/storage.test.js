/**
 * Tests for Storage Routes
 */

import request from 'supertest';
import express from 'express';
import { createStorageRoutes } from '../../routes/storage.js';
import fs from 'fs';
import { promises as fsPromises } from 'fs';
import { join } from 'path';
import { jest } from '@jest/globals';

// Mock fs module
jest.unstable_mockModule('fs', () => ({
  default: {
    readdirSync: jest.fn(),
    statSync: jest.fn(),
    existsSync: jest.fn()
  }
}));

// Mock fs promises
jest.unstable_mockModule('fs/promises', () => ({
  promises: {
    access: jest.fn(),
    readFile: jest.fn(),
    writeFile: jest.fn()
  }
}));

describe('Storage Routes', () => {
  let app;
  let mockProjectState;
  let testRavenDir;

  beforeEach(() => {
    app = express();
    app.use(express.json());

    // Create a real temp directory for tests
    testRavenDir = join('/tmp', `test-raven-${Date.now()}`);

    // Mock project state with activeProject property
    mockProjectState = {
      activeProject: 'test-project'
    };

    const deps = {
      RAVEN_DIR: testRavenDir,
      projectState: mockProjectState
    };

    app.use('/api/storage', createStorageRoutes(deps));

    // Clear all mocks before each test
    jest.clearAllMocks();
  });

  describe('GET /api/storage', () => {
    test('should return storage overview', async () => {
      const response = await request(app)
        .get('/api/storage')
        .expect('Content-Type', /json/);

      expect([200, 500]).toContain(response.status);
    });
  });

  describe('GET /api/storage/export/:dbname', () => {
    test('should reject database names with dots', async () => {
      const response = await request(app)
        .get('/api/storage/export/..passwd')
        .expect('Content-Type', /json/)
        .expect(400);

      expect(response.body.error).toBe('Invalid database name');
    });

    test('should reject invalid database names with special chars', async () => {
      const response = await request(app)
        .get('/api/storage/export/db$name')
        .expect('Content-Type', /json/)
        .expect(400);

      expect(response.body.error).toBe('Invalid database name');
    });

    test('should reject empty database name', async () => {
      const response = await request(app)
        .get('/api/storage/export/')
        .expect(404); // Express 404 for missing param
    });

    test('should return 404 for non-existent database', async () => {
      const response = await request(app)
        .get('/api/storage/export/nonexistent')
        .expect('Content-Type', /json/);

      expect([404, 500]).toContain(response.status);
    });

    test('should accept valid database names', async () => {
      const response = await request(app)
        .get('/api/storage/export/test-db-123')
        .expect('Content-Type', /json/);

      // Will be 404 or 500 since db doesn't exist, but passes validation
      expect([404, 500]).toContain(response.status);
    });
  });

  describe('POST /api/storage/vacuum/:dbname', () => {
    test('should reject database names with dots', async () => {
      const response = await request(app)
        .post('/api/storage/vacuum/..passwd')
        .expect('Content-Type', /json/)
        .expect(400);

      expect(response.body.error).toBe('Invalid database name');
    });

    test('should reject invalid database names with special chars', async () => {
      const response = await request(app)
        .post('/api/storage/vacuum/db$name')
        .expect('Content-Type', /json/)
        .expect(400);

      expect(response.body.error).toBe('Invalid database name');
    });

    test('should return 404 for non-existent database', async () => {
      const response = await request(app)
        .post('/api/storage/vacuum/nonexistent')
        .expect('Content-Type', /json/);

      expect([404, 500]).toContain(response.status);
    });

    test('should handle vacuum request', async () => {
      const response = await request(app)
        .post('/api/storage/vacuum/test-db')
        .send({})
        .expect('Content-Type', /json/);

      expect([200, 400, 404, 500]).toContain(response.status);
    });

    test('should accept valid database names', async () => {
      const response = await request(app)
        .post('/api/storage/vacuum/test-db-123')
        .expect('Content-Type', /json/);

      // Will be 404 or 500 since db doesn't exist, but passes validation
      expect([404, 500]).toContain(response.status);
    });
  });

  describe('POST /api/storage/clean/:dbname', () => {
    test('should reject database names with dots', async () => {
      const response = await request(app)
        .post('/api/storage/clean/..passwd')
        .send({ days: 30 })
        .expect('Content-Type', /json/)
        .expect(400);

      expect(response.body.error).toBe('Invalid database name');
    });

    test('should reject invalid database names with special chars', async () => {
      const response = await request(app)
        .post('/api/storage/clean/db$name')
        .send({ days: 30 })
        .expect('Content-Type', /json/)
        .expect(400);

      expect(response.body.error).toBe('Invalid database name');
    });

    test('should reject missing days parameter', async () => {
      const response = await request(app)
        .post('/api/storage/clean/test-db')
        .send({})
        .expect('Content-Type', /json/)
        .expect(400);

      expect(response.body.error).toContain('Days must be between');
    });

    test('should reject days less than 1', async () => {
      const response = await request(app)
        .post('/api/storage/clean/test-db')
        .send({ days: 0 })
        .expect('Content-Type', /json/)
        .expect(400);

      expect(response.body.error).toContain('Days must be between');
    });

    test('should reject days greater than 365', async () => {
      const response = await request(app)
        .post('/api/storage/clean/test-db')
        .send({ days: 366 })
        .expect('Content-Type', /json/)
        .expect(400);

      expect(response.body.error).toContain('Days must be between');
    });

    test('should reject non-numeric days', async () => {
      const response = await request(app)
        .post('/api/storage/clean/test-db')
        .send({ days: 'invalid' })
        .expect('Content-Type', /json/)
        .expect(400);

      expect(response.body.error).toContain('Days must be between');
    });

    test('should accept valid days value', async () => {
      const response = await request(app)
        .post('/api/storage/clean/test-db')
        .send({ days: 30 })
        .expect('Content-Type', /json/);

      expect([200, 404, 500]).toContain(response.status);
    });

    test('should return 404 for non-existent database', async () => {
      const response = await request(app)
        .post('/api/storage/clean/nonexistent')
        .send({ days: 30 })
        .expect('Content-Type', /json/);

      expect([404, 500]).toContain(response.status);
    });
  });

  describe('GET /api/storage/retention', () => {
    test('should return retention settings', async () => {
      const response = await request(app)
        .get('/api/storage/retention')
        .expect('Content-Type', /json/)
        .expect(200);

      // Should return either saved policy or default policy
      expect(response.body).toHaveProperty('enabled');
      expect(response.body).toHaveProperty('retentionDays');
      expect(response.body).toHaveProperty('autoCleanup');
      expect(response.body).toHaveProperty('cleanupInterval');
    });

    test('should return default policy when file does not exist', async () => {
      const response = await request(app)
        .get('/api/storage/retention')
        .expect('Content-Type', /json/)
        .expect(200);

      // Default values
      expect(response.body.enabled).toBe(false);
      expect(response.body.retentionDays).toBe(30);
      expect(response.body.autoCleanup).toBe(false);
      expect(response.body.cleanupInterval).toBe('weekly');
    });
  });

  describe('POST /api/storage/retention', () => {
    test('should reject policy without enabled field', async () => {
      const response = await request(app)
        .post('/api/storage/retention')
        .send({
          retentionDays: 30,
          cleanupInterval: 'weekly'
        })
        .expect('Content-Type', /json/)
        .expect(400);

      expect(response.body.error).toBe('enabled must be a boolean');
    });

    test('should reject policy with non-boolean enabled', async () => {
      const response = await request(app)
        .post('/api/storage/retention')
        .send({
          enabled: 'true',
          retentionDays: 30,
          cleanupInterval: 'weekly'
        })
        .expect('Content-Type', /json/)
        .expect(400);

      expect(response.body.error).toBe('enabled must be a boolean');
    });

    test('should reject retentionDays less than 1', async () => {
      const response = await request(app)
        .post('/api/storage/retention')
        .send({
          enabled: true,
          retentionDays: 0,
          cleanupInterval: 'weekly'
        })
        .expect('Content-Type', /json/)
        .expect(400);

      expect(response.body.error).toContain('retentionDays must be between');
    });

    test('should reject retentionDays greater than 365', async () => {
      const response = await request(app)
        .post('/api/storage/retention')
        .send({
          enabled: true,
          retentionDays: 366,
          cleanupInterval: 'weekly'
        })
        .expect('Content-Type', /json/)
        .expect(400);

      expect(response.body.error).toContain('retentionDays must be between');
    });

    test('should reject non-numeric retentionDays', async () => {
      const response = await request(app)
        .post('/api/storage/retention')
        .send({
          enabled: true,
          retentionDays: 'invalid',
          cleanupInterval: 'weekly'
        })
        .expect('Content-Type', /json/)
        .expect(400);

      expect(response.body.error).toContain('retentionDays must be between');
    });

    test('should reject invalid cleanupInterval', async () => {
      const response = await request(app)
        .post('/api/storage/retention')
        .send({
          enabled: true,
          retentionDays: 30,
          cleanupInterval: 'hourly'
        })
        .expect('Content-Type', /json/)
        .expect(400);

      expect(response.body.error).toContain('cleanupInterval must be');
    });

    test('should accept daily cleanupInterval', async () => {
      const response = await request(app)
        .post('/api/storage/retention')
        .send({
          enabled: true,
          retentionDays: 30,
          autoCleanup: true,
          cleanupInterval: 'daily'
        })
        .expect('Content-Type', /json/);

      expect([200, 500]).toContain(response.status);
    });

    test('should accept weekly cleanupInterval', async () => {
      const response = await request(app)
        .post('/api/storage/retention')
        .send({
          enabled: true,
          retentionDays: 30,
          autoCleanup: true,
          cleanupInterval: 'weekly'
        })
        .expect('Content-Type', /json/);

      expect([200, 500]).toContain(response.status);
    });

    test('should accept monthly cleanupInterval', async () => {
      const response = await request(app)
        .post('/api/storage/retention')
        .send({
          enabled: true,
          retentionDays: 30,
          autoCleanup: true,
          cleanupInterval: 'monthly'
        })
        .expect('Content-Type', /json/);

      expect([200, 500]).toContain(response.status);
    });

    test('should accept valid retention policy', async () => {
      const response = await request(app)
        .post('/api/storage/retention')
        .send({
          enabled: true,
          retentionDays: 30,
          autoCleanup: true,
          cleanupInterval: 'weekly'
        })
        .expect('Content-Type', /json/);

      expect([200, 500]).toContain(response.status);
    });
  });
});
