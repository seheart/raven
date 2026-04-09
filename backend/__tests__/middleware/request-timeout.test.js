/**
 * Tests for Server-Side Request Timeout Middleware
 */

import { describe, test, expect } from '@jest/globals';
import express from 'express';
import request from 'supertest';

function createAppWithTimeout(timeoutMs = 500) {
  const app = express();

  // Replicate the timeout middleware from server.ts with configurable duration
  app.use((req, res, next) => {
    const timer = setTimeout(() => {
      if (!res.headersSent) {
        res.status(503).json({ error: 'Request timed out on server' });
      }
    }, timeoutMs);
    res.on('finish', () => clearTimeout(timer));
    res.on('close', () => clearTimeout(timer));
    next();
  });

  return app;
}

describe('Request Timeout Middleware', () => {
  test('should allow fast requests to complete normally', async () => {
    const app = createAppWithTimeout(500);
    app.get('/fast', (req, res) => {
      res.json({ result: 'ok' });
    });

    const response = await request(app).get('/fast');
    expect(response.status).toBe(200);
    expect(response.body.result).toBe('ok');
  });

  test('should return 503 for requests that exceed timeout', async () => {
    const app = createAppWithTimeout(50); // 50ms timeout
    app.get('/slow', (req, res) => {
      setTimeout(() => {
        if (!res.headersSent) {
          res.json({ result: 'too late' });
        }
      }, 200); // Responds after 200ms, well past the 50ms timeout
    });

    const response = await request(app).get('/slow');
    expect(response.status).toBe(503);
    expect(response.body.error).toBe('Request timed out on server');
  });

  test('should not interfere with responses sent before timeout', async () => {
    const app = createAppWithTimeout(500);
    app.get('/normal', (req, res) => {
      setTimeout(() => {
        res.json({ result: 'in time' });
      }, 10);
    });

    const response = await request(app).get('/normal');
    expect(response.status).toBe(200);
    expect(response.body.result).toBe('in time');
  });

  test('should handle multiple concurrent requests independently', async () => {
    const app = createAppWithTimeout(100);

    app.get('/fast', (req, res) => res.json({ speed: 'fast' }));
    app.get('/slow', (req, res) => {
      setTimeout(() => {
        if (!res.headersSent) {
          res.json({ speed: 'slow' });
        }
      }, 300);
    });

    const [fastRes, slowRes] = await Promise.all([
      request(app).get('/fast'),
      request(app).get('/slow')
    ]);

    expect(fastRes.status).toBe(200);
    expect(fastRes.body.speed).toBe('fast');
    expect(slowRes.status).toBe(503);
  });
});
