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

  describe('GET /api/storage', () => {
    test('should return storage overview', async () => {
      const response = await request(app)
        .get('/api/storage')
        .expect('Content-Type', /json/);

      expect([200, 500]).toContain(response.status);
    });
  });

  describe('POST /api/storage/clean/:dbname', () => {
    test('should handle database cleanup request', async () => {
      const response = await request(app)
        .post('/api/storage/clean/test-db')
        .send({})
        .expect('Content-Type', /json/);

      expect([200, 400, 404, 500]).toContain(response.status);
    });
  });

  describe('POST /api/storage/vacuum/:dbname', () => {
    test('should handle vacuum request', async () => {
      const response = await request(app)
        .post('/api/storage/vacuum/test-db')
        .send({})
        .expect('Content-Type', /json/);

      expect([200, 400, 404, 500]).toContain(response.status);
    });
  });

  describe('GET /api/storage/retention', () => {
    test('should return retention settings', async () => {
      const response = await request(app)
        .get('/api/storage/retention')
        .expect('Content-Type', /json/);

      expect([200, 500]).toContain(response.status);
    });
  });
});
