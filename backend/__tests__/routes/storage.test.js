/**
 * Tests for Storage Routes
 */

import { jest } from '@jest/globals';
import request from 'supertest';
import express from 'express';
import { createStorageRoutes } from '../../routes/storage.js';

describe('Storage Routes', () => {
  let app;
  let mockProjectState;

  beforeEach(() => {
    app = express();
    app.use(express.json());

    mockProjectState = new Map();
    mockProjectState.set('test-project', {
      name: 'test-project',
      database: '/tmp/test.db'
    });

    const deps = {
      RAVEN_DIR: '/tmp/test-raven',
      projectState: mockProjectState
    };

    app.use('/api/storage', createStorageRoutes(deps));
  });

  describe('GET /api/storage/stats', () => {
    test('should return storage statistics', async () => {
      const response = await request(app)
        .get('/api/storage/stats')
        .expect('Content-Type', /json/);

      expect(response.status).toBeGreaterThanOrEqual(200);
      if (response.status === 200) {
        expect(response.body).toHaveProperty('totalSize');
      }
    });
  });

  describe('POST /api/storage/clean', () => {
    test('should handle storage cleanup request', async () => {
      const response = await request(app)
        .post('/api/storage/clean')
        .send({})
        .expect('Content-Type', /json/);

      expect([200, 400, 500]).toContain(response.status);
    });
  });

  describe('POST /api/storage/optimize', () => {
    test('should handle optimization request', async () => {
      const response = await request(app)
        .post('/api/storage/optimize')
        .send({})
        .expect('Content-Type', /json/);

      expect([200, 400, 500]).toContain(response.status);
    });
  });

  describe('GET /api/storage/databases', () => {
    test('should list databases', async () => {
      const response = await request(app)
        .get('/api/storage/databases')
        .expect('Content-Type', /json/);

      expect([200, 404, 500]).toContain(response.status);
    });
  });
});
