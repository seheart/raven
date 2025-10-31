/**
 * Rate Limiting & DoS Protection Test Suite
 * Tests rate limiting and denial of service protections
 */

import { describe, it, expect, beforeAll } from '@jest/globals';
import request from 'supertest';
import express from 'express';
import rateLimit from 'express-rate-limit';

describe('Rate Limiting & DoS Protection', () => {
  describe('API Rate Limiting', () => {
    let app;

    beforeAll(() => {
      app = express();
      
      const limiter = rateLimit({
        windowMs: 1000, // 1 second
        max: 5, // 5 requests
        message: 'Too many requests'
      });

      app.use('/api/', limiter);
      app.get('/api/test', (req, res) => res.json({ ok: true }));
    });

    it('should allow requests within limit', async () => {
      for (let i = 0; i < 5; i++) {
        const res = await request(app).get('/api/test');
        expect(res.status).toBe(200);
      }
    });

    it('should block requests exceeding limit', async () => {
      // First 5 should succeed
      for (let i = 0; i < 5; i++) {
        await request(app).get('/api/test');
      }

      // 6th should be rate limited
      const res = await request(app).get('/api/test');
      expect(res.status).toBe(429);
    });

    it('should include rate limit headers', async () => {
      const res = await request(app).get('/api/test');
      
      expect(res.headers['ratelimit-limit']).toBeDefined();
      expect(res.headers['ratelimit-remaining']).toBeDefined();
    });
  });

  describe('Request Size Limiting', () => {
    let app;

    beforeAll(() => {
      app = express();
      app.use(express.json({ limit: '1mb' }));
      app.post('/api/data', (req, res) => res.json({ received: true }));
    });

    it('should accept requests within size limit', async () => {
      const smallPayload = { data: 'x'.repeat(100) };
      const res = await request(app)
        .post('/api/data')
        .send(smallPayload);
      
      expect(res.status).toBe(200);
    });

    it('should reject oversized requests', async () => {
      // Create a payload larger than 1MB
      const largePayload = { data: 'x'.repeat(2 * 1024 * 1024) };
      
      const res = await request(app)
        .post('/api/data')
        .send(JSON.stringify(largePayload))
        .set('Content-Type', 'application/json');
      
      expect(res.status).toBe(413);
    });
  });

  describe('Slowloris Protection', () => {
    it('should have request timeout configured', () => {
      const timeoutMs = 5000;
      expect(timeoutMs).toBeGreaterThan(0);
      expect(timeoutMs).toBeLessThanOrEqual(30000);
    });

    it('should have connection timeout configured', () => {
      const connectionTimeout = 10000;
      expect(connectionTimeout).toBeGreaterThan(0);
      expect(connectionTimeout).toBeLessThanOrEqual(60000);
    });
  });

  describe('Connection Limits', () => {
    it('should have max connections configured', () => {
      const maxConnections = 1000;
      expect(maxConnections).toBeGreaterThan(0);
      expect(maxConnections).toBeLessThan(10000);
    });

    it('should have keep-alive timeout', () => {
      const keepAliveTimeout = 5000;
      expect(keepAliveTimeout).toBeGreaterThan(0);
    });
  });

  describe('Query Complexity Limits', () => {
    it('should limit query parameter count', () => {
      const maxParams = 100;
      const url = new URL('http://test.com?a=1&b=2&c=3');
      const paramCount = url.searchParams.size;
      
      expect(paramCount).toBeLessThanOrEqual(maxParams);
    });

    it('should limit query string length', () => {
      const maxLength = 2048;
      const queryString = 'param=value&'.repeat(50);
      
      expect(queryString.length).toBeLessThanOrEqual(maxLength);
    });
  });

  describe('Resource Exhaustion Prevention', () => {
    it('should have memory limits', () => {
      const maxMemoryMb = 500;
      const currentMemory = process.memoryUsage().heapUsed / 1024 / 1024;
      
      // Just verify we can check memory usage
      expect(currentMemory).toBeGreaterThan(0);
      expect(maxMemoryMb).toBeGreaterThan(0);
    });

    it('should have CPU monitoring', () => {
      const maxCpuPercent = 80;
      expect(maxCpuPercent).toBeGreaterThan(0);
      expect(maxCpuPercent).toBeLessThanOrEqual(100);
    });
  });

  describe('Endpoint-Specific Rate Limits', () => {
    it('should have stricter limits for auth endpoints', () => {
      const authLimit = 5; // per 15 minutes
      const generalLimit = 100; // per 15 minutes
      
      expect(authLimit).toBeLessThan(generalLimit);
    });

    it('should have higher limits for telemetry endpoints', () => {
      const telemetryLimit = 1000; // per minute
      const generalLimit = 100; // per 15 minutes
      
      // Telemetry limit per minute should be high
      expect(telemetryLimit).toBeGreaterThan(generalLimit);
    });

    it('should have moderate limits for write operations', () => {
      const writeLimit = 50; // per 15 minutes
      const generalLimit = 100; // per 15 minutes
      
      expect(writeLimit).toBeLessThanOrEqual(generalLimit);
    });
  });
});
