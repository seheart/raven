/**
 * Tests for Triggers Routes
 */

import { jest } from '@jest/globals';
import request from 'supertest';
import express from 'express';
import { createTriggersRoutes } from '../../routes/triggers.js';

describe('Triggers Routes', () => {
  let app;
  let mockTriggerEngine;

  beforeEach(() => {
    app = express();
    app.use(express.json());

    mockTriggerEngine = {
      getTriggersConfig: jest.fn().mockReturnValue([
        { name: 'large-deletion', enabled: true },
        { name: 'high-cpu', enabled: true }
      ]),
      getTriggeredEvents: jest.fn().mockReturnValue([]),
      getTriggerStats: jest.fn().mockReturnValue({
        totalTriggers: 2,
        totalFired: 5
      }),
      reloadConfig: jest.fn().mockReturnValue('Configuration reloaded'),
      clearCooldowns: jest.fn().mockReturnValue('Cooldowns cleared')
    };

    const deps = {
      triggerEngine: mockTriggerEngine
    };

    app.use('/api', createTriggersRoutes(deps));
  });

  describe('GET /api/triggers-config', () => {
    test('should return triggers configuration', async () => {
      const response = await request(app)
        .get('/api/triggers-config')
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body).toHaveProperty('rules');
      expect(Array.isArray(response.body.rules)).toBe(true);
      expect(response.body.rules.length).toBe(2);
      expect(mockTriggerEngine.getTriggersConfig).toHaveBeenCalled();
    });

    test('should return 503 when trigger engine not initialized', async () => {
      const appNoEngine = express();
      appNoEngine.use(express.json());
      appNoEngine.use('/api', createTriggersRoutes({}));

      const response = await request(appNoEngine)
        .get('/api/triggers-config')
        .expect('Content-Type', /json/)
        .expect(503);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('not initialized');
    });
  });

  describe('GET /api/triggered-events', () => {
    test('should return list of triggered events', async () => {
      const mockEvents = [
        { id: 1, triggerName: 'large-deletion', timestamp: '2025-01-01T10:00:00Z' },
        { id: 2, triggerName: 'high-cpu', timestamp: '2025-01-01T11:00:00Z' }
      ];

      mockTriggerEngine.getTriggeredEvents.mockReturnValue(mockEvents);

      const response = await request(app)
        .get('/api/triggered-events')
        .expect('Content-Type', /json/)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBe(2);
      expect(mockTriggerEngine.getTriggeredEvents).toHaveBeenCalledWith(100);
    });

    test('should handle limit parameter', async () => {
      await request(app)
        .get('/api/triggered-events?limit=50')
        .expect(200);

      expect(mockTriggerEngine.getTriggeredEvents).toHaveBeenCalledWith(50);
    });

    test('should return 503 when trigger engine not initialized', async () => {
      const appNoEngine = express();
      appNoEngine.use(express.json());
      appNoEngine.use('/api', createTriggersRoutes({}));

      const response = await request(appNoEngine)
        .get('/api/triggered-events')
        .expect('Content-Type', /json/)
        .expect(503);

      expect(response.body).toHaveProperty('error');
    });
  });

  describe('GET /api/trigger-stats', () => {
    test('should return trigger statistics', async () => {
      const response = await request(app)
        .get('/api/trigger-stats')
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body).toHaveProperty('totalTriggers', 2);
      expect(response.body).toHaveProperty('totalFired', 5);
      expect(mockTriggerEngine.getTriggerStats).toHaveBeenCalled();
    });

    test('should return 503 when trigger engine not initialized', async () => {
      const appNoEngine = express();
      appNoEngine.use(express.json());
      appNoEngine.use('/api', createTriggersRoutes({}));

      const response = await request(appNoEngine)
        .get('/api/trigger-stats')
        .expect('Content-Type', /json/)
        .expect(503);

      expect(response.body).toHaveProperty('error');
    });
  });

  describe('POST /api/triggers-reload', () => {
    test('should reload triggers configuration', async () => {
      const response = await request(app)
        .post('/api/triggers-reload')
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toContain('reloaded');
      expect(mockTriggerEngine.reloadConfig).toHaveBeenCalled();
    });

    test('should return 503 when trigger engine not initialized', async () => {
      const appNoEngine = express();
      appNoEngine.use(express.json());
      appNoEngine.use('/api', createTriggersRoutes({}));

      const response = await request(appNoEngine)
        .post('/api/triggers-reload')
        .expect('Content-Type', /json/)
        .expect(503);

      expect(response.body).toHaveProperty('error');
    });

    test('should handle reload errors', async () => {
      mockTriggerEngine.reloadConfig.mockImplementation(() => {
        throw new Error('Config file not found');
      });

      const response = await request(app)
        .post('/api/triggers-reload')
        .expect('Content-Type', /json/)
        .expect(500);

      expect(response.body).toHaveProperty('error');
    });
  });

  describe('POST /api/triggers-clear-cooldowns', () => {
    test('should clear all trigger cooldowns', async () => {
      const response = await request(app)
        .post('/api/triggers-clear-cooldowns')
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toContain('cleared');
      expect(mockTriggerEngine.clearCooldowns).toHaveBeenCalled();
    });

    test('should return 503 when trigger engine not initialized', async () => {
      const appNoEngine = express();
      appNoEngine.use(express.json());
      appNoEngine.use('/api', createTriggersRoutes({}));

      const response = await request(appNoEngine)
        .post('/api/triggers-clear-cooldowns')
        .expect('Content-Type', /json/)
        .expect(503);

      expect(response.body).toHaveProperty('error');
    });

    test('should handle clear cooldowns errors', async () => {
      mockTriggerEngine.clearCooldowns.mockImplementation(() => {
        throw new Error('Failed to clear cooldowns');
      });

      const response = await request(app)
        .post('/api/triggers-clear-cooldowns')
        .expect('Content-Type', /json/)
        .expect(500);

      expect(response.body).toHaveProperty('error');
    });
  });
});
