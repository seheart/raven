/**
 * Tests for Cache Routes
 */

import { jest } from '@jest/globals';
import request from 'supertest';
import express from 'express';
import { createCacheRoutes } from '../../routes/cache.js';

describe('Cache Routes', () => {
  let app;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/api/cache', createCacheRoutes());
  });

  describe('GET /api/cache/stats', () => {
    test('should return cache statistics', async () => {
      const response = await request(app)
        .get('/api/cache/stats')
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body).toHaveProperty('timestamp');
      expect(response.body).toHaveProperty('caches');
      expect(typeof response.body.caches).toBe('object');
    });

    test('should include timestamp in ISO format', async () => {
      const response = await request(app)
        .get('/api/cache/stats')
        .expect(200);

      const timestamp = new Date(response.body.timestamp);
      expect(timestamp).toBeInstanceOf(Date);
      expect(isNaN(timestamp.getTime())).toBe(false);
    });
  });

  describe('POST /api/cache/clear', () => {
    test('should clear all caches successfully', async () => {
      const response = await request(app)
        .post('/api/cache/clear')
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('message');
      expect(response.body).toHaveProperty('timestamp');
      expect(response.body.message).toContain('cleared successfully');
    });

    test('should return timestamp after clearing', async () => {
      const response = await request(app)
        .post('/api/cache/clear')
        .expect(200);

      expect(response.body.timestamp).toBeDefined();
      const timestamp = new Date(response.body.timestamp);
      expect(timestamp).toBeInstanceOf(Date);
    });
  });

  describe('POST /api/cache/clear/:cacheName', () => {
    test('should clear dashboard cache', async () => {
      const response = await request(app)
        .post('/api/cache/clear/dashboard')
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body.message).toContain('dashboard');
    });

    test('should clear analytics cache', async () => {
      const response = await request(app)
        .post('/api/cache/clear/analytics')
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body.message).toContain('analytics');
    });

    test('should clear metrics cache', async () => {
      const response = await request(app)
        .post('/api/cache/clear/metrics')
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body.message).toContain('metrics');
    });

    test('should clear query cache', async () => {
      const response = await request(app)
        .post('/api/cache/clear/query')
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body.message).toContain('query');
    });

    test('should return 404 for unknown cache', async () => {
      const response = await request(app)
        .post('/api/cache/clear/nonexistent')
        .expect('Content-Type', /json/)
        .expect(404);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('not found');
      expect(response.body.error).toContain('Valid caches:');
    });

    test('should list valid cache names in error', async () => {
      const response = await request(app)
        .post('/api/cache/clear/invalid')
        .expect(404);

      expect(response.body.error).toContain('dashboard');
      expect(response.body.error).toContain('analytics');
      expect(response.body.error).toContain('metrics');
      expect(response.body.error).toContain('query');
    });
  });
});
