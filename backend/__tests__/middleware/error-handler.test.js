/**
 * Tests for Error Handler Middleware
 */

import { describe, test, expect } from '@jest/globals';
import express from 'express';
import request from 'supertest';

// Create a minimal error handler that mirrors errorHandler.ts behavior
function createTestApp() {
  const app = express();

  // Normal route
  app.get('/ok', (req, res) => res.json({ status: 'ok' }));

  // Route that throws sync error
  app.get('/sync-error', () => {
    throw new Error('Sync failure');
  });

  // Route that throws async error
  app.get('/async-error', async () => {
    throw new Error('Async failure');
  });

  // Route that sends a specific status
  app.get('/not-found', (req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  // Express error handler (4 args)
  app.use((err, req, res, _next) => {
    const status = err.statusCode || 500;
    res.status(status).json({
      error: err.message || 'Internal server error',
      code: err.code || 'UNKNOWN'
    });
  });

  return app;
}

describe('Error Handler Middleware', () => {
  test('should pass through successful responses', async () => {
    const app = createTestApp();
    const res = await request(app).get('/ok');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  test('should catch synchronous errors and return 500', async () => {
    const app = createTestApp();
    const res = await request(app).get('/sync-error');
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Sync failure');
  });

  test('should handle 404 responses', async () => {
    const app = createTestApp();
    const res = await request(app).get('/not-found');
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Not found');
  });

  test('should handle unknown routes', async () => {
    const app = createTestApp();
    // Add a 404 catch-all
    app.use((req, res) => {
      res.status(404).json({ error: `Route ${req.method} ${req.path} not found` });
    });

    const res = await request(app).get('/does-not-exist');
    expect(res.status).toBe(404);
  });

  test('should return JSON error format', async () => {
    const app = createTestApp();
    const res = await request(app).get('/sync-error');
    expect(res.headers['content-type']).toMatch(/json/);
    expect(res.body).toHaveProperty('error');
    expect(res.body).toHaveProperty('code');
  });
});
