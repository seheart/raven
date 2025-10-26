/**
 * Tests for Request Tracing Middleware
 */

import { jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import { requestTracing, errorLogging } from '../../middleware/request-tracing.js';

describe('Request Tracing Middleware', () => {
  let app;

  beforeEach(() => {
    app = express();
    app.use(requestTracing);

    // Add test route
    app.get('/test', (req, res) => {
      res.json({ success: true });
    });
  });

  describe('Correlation ID', () => {
    it('should generate correlation ID if not provided', async () => {
      const response = await request(app).get('/test');

      expect(response.headers['x-correlation-id']).toBeDefined();
      expect(typeof response.headers['x-correlation-id']).toBe('string');
      expect(response.headers['x-correlation-id'].length).toBeGreaterThan(0);
    });

    it('should use provided correlation ID', async () => {
      const response = await request(app)
        .get('/test')
        .set('X-Correlation-ID', 'custom-id-456');

      expect(response.headers['x-correlation-id']).toBe('custom-id-456');
    });

    it('should handle case-insensitive correlation ID header', async () => {
      const response = await request(app)
        .get('/test')
        .set('x-correlation-id', 'lowercase-id');

      expect(response.headers['x-correlation-id']).toBe('lowercase-id');
    });
  });

  describe('Request Logger', () => {
    it('should attach correlationId to request', async () => {
      let capturedReq;

      app.get('/capture', (req, res) => {
        capturedReq = req;
        res.json({ success: true });
      });

      await request(app).get('/capture');

      expect(capturedReq.correlationId).toBeDefined();
      expect(typeof capturedReq.correlationId).toBe('string');
    });

    it('should attach logger to request', async () => {
      let capturedReq;

      app.get('/capture-logger', (req, res) => {
        capturedReq = req;
        res.json({ success: true });
      });

      await request(app).get('/capture-logger');

      expect(capturedReq.logger).toBeDefined();
      expect(typeof capturedReq.logger.logRequest).toBe('function');
      expect(typeof capturedReq.logger.logResponse).toBe('function');
      expect(typeof capturedReq.logger.error).toBe('function');
    });

    it('should use correlation ID from custom header', async () => {
      let capturedReq;

      app.get('/custom-id', (req, res) => {
        capturedReq = req;
        res.json({ success: true });
      });

      await request(app)
        .get('/custom-id')
        .set('X-Correlation-ID', 'test-id-789');

      expect(capturedReq.correlationId).toBe('test-id-789');
    });
  });

  describe('Response Headers', () => {
    it('should add X-Correlation-ID to response', async () => {
      const response = await request(app).get('/test');

      expect(response.headers['x-correlation-id']).toBeDefined();
    });

    it('should include correlation ID in response for all routes', async () => {
      app.get('/route1', (req, res) => res.json({ route: 1 }));
      app.post('/route2', (req, res) => res.json({ route: 2 }));

      const response1 = await request(app).get('/route1');
      const response2 = await request(app).post('/route2');

      expect(response1.headers['x-correlation-id']).toBeDefined();
      expect(response2.headers['x-correlation-id']).toBeDefined();
    });
  });

  describe('Integration', () => {
    it('should work with multiple concurrent requests', async () => {
      const requests = Array.from({ length: 5 }, (_, i) =>
        request(app).get('/test').set('X-Correlation-ID', `concurrent-${i}`)
      );

      const responses = await Promise.all(requests);

      responses.forEach((response, i) => {
        expect(response.headers['x-correlation-id']).toBe(`concurrent-${i}`);
        expect(response.body).toEqual({ success: true });
      });
    });
  });
});

describe('Error Logging Middleware', () => {
  let app;

  beforeEach(() => {
    app = express();
    app.use(requestTracing);

    // Add error route
    app.get('/error', (req, res, next) => {
      const error = new Error('Test error');
      error.statusCode = 400;
      next(error);
    });

    // Add error logging middleware
    app.use(errorLogging);

    // Add error handler to prevent unhandled error
    app.use((err, req, res, next) => {
      res.status(err.statusCode || 500).json({ error: err.message });
    });
  });

  describe('Error Logging', () => {
    it('should handle errors and pass to next middleware', async () => {
      const response = await request(app).get('/error');

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Test error');
    });

    it('should default to 500 status code if not specified', async () => {
      const testApp = express();
      testApp.use(requestTracing);

      testApp.get('/error-no-status', (req, res, next) => {
        next(new Error('No status error'));
      });

      testApp.use(errorLogging);
      testApp.use((err, req, res, next) => {
        res.status(err.statusCode || 500).json({ error: err.message });
      });

      const response = await request(testApp).get('/error-no-status');

      expect(response.status).toBe(500);
      expect(response.body.error).toBe('No status error');
    });

    it('should work with correlation ID from request', async () => {
      const response = await request(app)
        .get('/error')
        .set('X-Correlation-ID', 'error-trace-123');

      expect(response.status).toBe(400);
      expect(response.headers['x-correlation-id']).toBe('error-trace-123');
    });

    it('should work without requestTracing middleware', async () => {
      // Create app without requestTracing
      const appNoTracing = express();

      appNoTracing.get('/error-standalone', (req, res, next) => {
        req.correlationId = 'manual-id';
        next(new Error('Standalone error'));
      });

      appNoTracing.use(errorLogging);
      appNoTracing.use((err, req, res, next) => {
        res.status(500).json({ error: err.message });
      });

      const response = await request(appNoTracing).get('/error-standalone');

      expect(response.status).toBe(500);
      expect(response.body.error).toBe('Standalone error');
    });

    it('should handle missing correlation ID gracefully', async () => {
      // Create app without requestTracing or correlationId
      const appNoTracing = express();

      appNoTracing.get('/error-no-id', (req, res, next) => {
        next(new Error('No ID error'));
      });

      appNoTracing.use(errorLogging);
      appNoTracing.use((err, req, res, next) => {
        res.status(500).json({ error: err.message });
      });

      const response = await request(appNoTracing).get('/error-no-id');

      expect(response.status).toBe(500);
      expect(response.body.error).toBe('No ID error');
    });

    it('should pass error to subsequent error handlers', async () => {
      let finalHandlerCalled = false;

      const testApp = express();
      testApp.use(requestTracing);

      testApp.get('/error-chain', (req, res, next) => {
        next(new Error('Chain error'));
      });

      // Add errorLogging first
      testApp.use(errorLogging);

      // Then add final handler
      testApp.use((err, req, res, next) => {
        finalHandlerCalled = true;
        res.status(500).json({ error: 'final-handler' });
      });

      await request(testApp).get('/error-chain');

      expect(finalHandlerCalled).toBe(true);
    });

    it('should preserve error properties', async () => {
      let capturedError;

      const testApp = express();
      testApp.use(requestTracing);

      testApp.get('/error-with-data', (req, res, next) => {
        const error = new Error('Detailed error');
        error.statusCode = 422;
        error.details = { field: 'email' };
        next(error);
      });

      testApp.use(errorLogging);

      // Add handler that checks error properties
      testApp.use((err, req, res, next) => {
        capturedError = err;
        res.status(err.statusCode).json({ error: err.message });
      });

      await request(testApp).get('/error-with-data');

      expect(capturedError.statusCode).toBe(422);
      expect(capturedError.details).toEqual({ field: 'email' });
    });
  });
});
