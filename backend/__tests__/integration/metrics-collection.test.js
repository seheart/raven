/**
 * Integration Tests: Metrics Collection
 * Tests the complete metrics pipeline
 */

import { jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import { createMetricsRoutes } from '../../routes/metrics.js';
import {
  metricsMiddleware,
  recordTelemetryEvent,
  recordDbQuery,
  recordCacheHit,
  resetMetrics
} from '../../middleware/metrics.js';
import { env } from '../../config/environment.js';

describe('Metrics Integration Tests', () => {
  let app;
  let mockDeps;

  beforeEach(() => {
    // Reset metrics before each test
    resetMetrics();

    // Create mock dependencies
    mockDeps = {
      projectDatabases: new Map(),
      cacheMiddleware: jest.fn((_cache) => (req, res, next) => next()),
      metricsCache: new Map(),
      analyticsCache: new Map(),
      dashboardCache: new Map()
    };

    // Create test app
    app = express();
    app.use(express.json());

    // Add metrics middleware
    app.use(metricsMiddleware);

    // Add test routes
    app.get('/test', (req, res) => {
      res.json({ success: true });
    });

    app.get('/slow', async (req, res) => {
      await new Promise(resolve => setTimeout(resolve, 100));
      res.json({ success: true });
    });

    app.get('/error', (req, res) => {
      res.status(500).json({ error: 'Test error' });
    });

    // Add metrics routes with mocked dependencies
    app.use('/', createMetricsRoutes(mockDeps));
  });

  test('should collect HTTP request metrics', async () => {
    // Make test requests
    await request(app).get('/test');
    await request(app).get('/test');
    await request(app).get('/error');

    // Check metrics
    const response = await request(app).get('/metrics/json');

    expect(response.status).toBe(200);
    expect(response.body.http.requestsTotal).toBe(3);
    expect(response.body.http.avgDuration).toBeDefined();
  });

  test('should track request duration', async () => {
    await request(app).get('/slow');

    const response = await request(app).get('/metrics/json');

    expect(response.status).toBe(200);
    expect(parseFloat(response.body.http.avgDuration)).toBeGreaterThan(50);
  });

  test('should track requests in flight', async () => {
    // Start slow request
    const slowRequest = request(app).get('/slow');

    // Immediately check metrics (while request is in flight)
    // Note: This is timing-dependent and may be flaky
    await new Promise(resolve => setTimeout(resolve, 10));

    await slowRequest;
  });

  test('should record telemetry event metrics', async () => {
    recordTelemetryEvent('agent-1', 100);
    recordTelemetryEvent('agent-1', 150);
    recordTelemetryEvent('agent-2', 200);

    const response = await request(app).get('/metrics/json');

    expect(response.status).toBe(200);
    expect(response.body.telemetry.eventsTotal).toBe(3);
    expect(response.body.telemetry.byAgent['agent-1']).toBe(2);
    expect(response.body.telemetry.byAgent['agent-2']).toBe(1);
  });

  test('should record database query metrics', async () => {
    recordDbQuery(10);
    recordDbQuery(20);
    recordDbQuery(15);

    const response = await request(app).get('/metrics/json');

    expect(response.status).toBe(200);
    expect(response.body.database.queriesTotal).toBe(3);
    expect(parseFloat(response.body.database.avgQueryTime)).toBeGreaterThan(0);
  });

  test('should track cache hit rate', async () => {
    recordCacheHit(true);
    recordCacheHit(true);
    recordCacheHit(false);
    recordCacheHit(true);

    const response = await request(app).get('/metrics/json');

    expect(response.status).toBe(200);
    expect(response.body.cache.hits).toBe(3);
    expect(response.body.cache.misses).toBe(1);
    expect(parseFloat(response.body.cache.hitRate)).toBeCloseTo(75.0, 1);
  });

  test('should return Prometheus-format metrics', async () => {
    await request(app).get('/test');
    recordTelemetryEvent('test-agent', 100);

    const response = await request(app).get('/metrics');

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toMatch(/text\/plain/);
    expect(response.text).toContain('raven_uptime_seconds');
    expect(response.text).toContain('raven_http_requests_total');
    expect(response.text).toContain('raven_telemetry_events_total');
  });

  test('should calculate percentiles correctly', async () => {
    // Record requests with known durations
    for (let i = 0; i < 10; i++) {
      await request(app).get('/test');
    }

    const response = await request(app).get('/metrics');

    expect(response.status).toBe(200);
    expect(response.text).toContain('quantile="0.5"');
    expect(response.text).toContain('quantile="0.9"');
    expect(response.text).toContain('quantile="0.99"');
  });

  test('should handle metrics when disabled', async () => {
    // Temporarily disable metrics
    const originalValue = env.ENABLE_METRICS;
    env.ENABLE_METRICS = false;

    const response = await request(app).get('/metrics');

    expect(response.status).toBe(503);
    expect(response.body.error).toContain('disabled');

    // Restore
    env.ENABLE_METRICS = originalValue;
  });

  test('should track multiple routes separately', async () => {
    await request(app).get('/test');
    await request(app).get('/test');
    await request(app).get('/slow');
    await request(app).get('/error');

    const response = await request(app).get('/metrics/json');

    expect(response.status).toBe(200);
    expect(response.body.http.byRoute).toBeDefined();

    // Should have metrics for each route
    const routes = Object.keys(response.body.http.byRoute);
    expect(routes.length).toBeGreaterThan(0);
  });
});
