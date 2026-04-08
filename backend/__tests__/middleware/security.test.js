/**
 * Tests for Security Middleware
 */

import { describe, test, expect, beforeEach } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import {
  setupHelmet,
  apiLimiter,
  authLimiter,
  telemetryLimiter,
  writeLimiter,
  requestLogger,
  setupCORS,
  setupRequestSizeLimit
} from '../../middleware/security.js';

describe('Security Middleware', () => {
  describe('setupHelmet', () => {
    test('should return helmet configuration', () => {
      const config = setupHelmet();

      expect(config).toBeDefined();
      expect(typeof config).toBe('function');
    });
  });

  describe('apiLimiter', () => {
    test('should be defined as middleware', () => {
      expect(apiLimiter).toBeDefined();
      expect(typeof apiLimiter).toBe('function');
    });

    test('should skip rate limiting for health endpoints', async () => {
      const app = express();
      app.use(apiLimiter);
      app.get('/health', (req, res) => res.json({ status: 'ok' }));
      app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

      // Make requests to health endpoints - should not be rate limited
      const response1 = await request(app).get('/health');
      expect(response1.status).toBe(200);

      const response2 = await request(app).get('/api/health');
      expect(response2.status).toBe(200);
    });
  });

  describe('authLimiter', () => {
    test('should be defined as middleware', () => {
      expect(authLimiter).toBeDefined();
      expect(typeof authLimiter).toBe('function');
    });
  });

  describe('telemetryLimiter', () => {
    test('should be defined as middleware', () => {
      expect(telemetryLimiter).toBeDefined();
      expect(typeof telemetryLimiter).toBe('function');
    });
  });

  describe('writeLimiter', () => {
    test('should be defined as middleware', () => {
      expect(writeLimiter).toBeDefined();
      expect(typeof writeLimiter).toBe('function');
    });
  });

  describe('requestLogger', () => {
    let app;

    beforeEach(() => {
      app = express();
      app.use(requestLogger);
    });

    test('should log requests on completion', async () => {
      app.get('/test', (req, res) => {
        res.status(200).json({ success: true });
      });

      const response = await request(app).get('/test');

      expect(response.status).toBe(200);
    });

    test('should log errors for 4xx status codes', async () => {
      app.get('/error', (req, res) => {
        res.status(400).json({ error: 'Bad request' });
      });

      const response = await request(app).get('/error');

      expect(response.status).toBe(400);
    });

    test('should log errors for 5xx status codes', async () => {
      app.get('/server-error', (req, res) => {
        res.status(500).json({ error: 'Server error' });
      });

      const response = await request(app).get('/server-error');

      expect(response.status).toBe(500);
    });

    test('should call next middleware', async () => {
      let nextCalled = false;
      app.use((req, res, _next) => {
        nextCalled = true;
        res.status(200).send('OK');
      });

      await request(app).get('/test');

      expect(nextCalled).toBe(true);
    });
  });

  describe('setupCORS', () => {
    test('should return CORS configuration object', () => {
      const allowedOrigins = ['http://localhost:3000'];
      const config = setupCORS(allowedOrigins);

      expect(config).toHaveProperty('origin');
      expect(config).toHaveProperty('credentials');
      expect(config).toHaveProperty('methods');
      expect(config).toHaveProperty('allowedHeaders');
    });

    test('should allow requests with no origin', (done) => {
      const allowedOrigins = ['http://localhost:3000'];
      const config = setupCORS(allowedOrigins);

      config.origin(undefined, (err, allowed) => {
        expect(err).toBeNull();
        expect(allowed).toBe(true);
        done();
      });
    });

    test('should allow whitelisted origins', (done) => {
      const allowedOrigins = ['http://localhost:3000'];
      const config = setupCORS(allowedOrigins);

      config.origin('http://localhost:3000', (err, allowed) => {
        expect(err).toBeNull();
        expect(allowed).toBe(true);
        done();
      });
    });

    test('should reject non-whitelisted origins', (done) => {
      const allowedOrigins = ['http://localhost:3000'];
      const config = setupCORS(allowedOrigins);

      config.origin('http://evil.com', (err, _allowed) => {
        expect(err).toBeInstanceOf(Error);
        expect(err.message).toBe('Not allowed by CORS');
        done();
      });
    });

    test('should allow all origins with wildcard', (done) => {
      const allowedOrigins = ['*'];
      const config = setupCORS(allowedOrigins);

      config.origin('http://anything.com', (err, allowed) => {
        expect(err).toBeNull();
        expect(allowed).toBe(true);
        done();
      });
    });

    test('should include credentials option', () => {
      const config = setupCORS(['http://localhost:3000']);

      expect(config.credentials).toBe(true);
    });

    test('should include allowed methods', () => {
      const config = setupCORS(['http://localhost:3000']);

      expect(config.methods).toContain('GET');
      expect(config.methods).toContain('POST');
      expect(config.methods).toContain('PUT');
      expect(config.methods).toContain('DELETE');
      expect(config.methods).toContain('PATCH');
    });

    test('should include allowed headers', () => {
      const config = setupCORS(['http://localhost:3000']);

      expect(config.allowedHeaders).toContain('Content-Type');
      expect(config.allowedHeaders).toContain('Authorization');
    });
  });

  describe('setupRequestSizeLimit', () => {
    test('should return request size limit configuration', () => {
      const config = setupRequestSizeLimit();

      expect(config).toHaveProperty('json');
      expect(config).toHaveProperty('urlencoded');
    });

    test('should set JSON limit to 10mb', () => {
      const config = setupRequestSizeLimit();

      expect(config.json.limit).toBe('10mb');
    });

    test('should set urlencoded limit to 10mb', () => {
      const config = setupRequestSizeLimit();

      expect(config.urlencoded.limit).toBe('10mb');
    });

    test('should set urlencoded extended to true', () => {
      const config = setupRequestSizeLimit();

      expect(config.urlencoded.extended).toBe(true);
    });
  });
});
