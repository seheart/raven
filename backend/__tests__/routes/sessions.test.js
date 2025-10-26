/**
 * Tests for Sessions Routes
 */

import { jest } from '@jest/globals';
import request from 'supertest';
import express from 'express';
import { createSessionRoutes } from '../../routes/sessions.js';

describe('Sessions Routes', () => {
  let app;
  let mockSessionTracker;
  let mockProjectDatabases;

  beforeEach(() => {
    app = express();
    app.use(express.json());

    mockSessionTracker = {
      getActiveSession: jest.fn(),
      calculateSessionQuality: jest.fn(),
      getBreakRecommendation: jest.fn(),
      getSessionStats: jest.fn()
    };

    mockProjectDatabases = new Map();
    mockProjectDatabases.set('test-project', {});

    const deps = {
      sessionTracker: mockSessionTracker,
      projectDatabases: mockProjectDatabases
    };

    app.use('/api/sessions', createSessionRoutes(deps));
  });

  describe('GET /api/sessions', () => {
    test('should return stub message for sessions list', async () => {
      const response = await request(app)
        .get('/api/sessions')
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body).toHaveProperty('sessions');
      expect(response.body).toHaveProperty('message');
      expect(Array.isArray(response.body.sessions)).toBe(true);
    });
  });

  describe('GET /api/sessions/:sessionId/preview', () => {
    test('should return 404 for preview endpoint', async () => {
      const response = await request(app)
        .get('/api/sessions/session-123/preview')
        .expect('Content-Type', /json/)
        .expect(404);

      expect(response.body).toHaveProperty('error');
    });
  });

  describe('POST /api/sessions/:sessionId/rollback', () => {
    test('should return 501 for rollback endpoint', async () => {
      const response = await request(app)
        .post('/api/sessions/session-123/rollback')
        .expect('Content-Type', /json/)
        .expect(501);

      expect(response.body).toHaveProperty('error');
    });
  });

  describe('GET /api/sessions/current', () => {
    test('should return active session', async () => {
      const mockSession = {
        id: 'session-123',
        projectName: 'test-project',
        startTime: Date.now() - 60000, // 1 minute ago
        changesCount: 5,
        rollbacksCount: 0,
        qualityScore: 85
      };

      mockSessionTracker.getActiveSession.mockReturnValue(mockSession);

      const response = await request(app)
        .get('/api/sessions/current')
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body).toHaveProperty('hasActiveSession', true);
      expect(response.body.session).toHaveProperty('id', 'session-123');
      expect(response.body.session).toHaveProperty('durationMinutes');
    });

    test('should return no active session', async () => {
      mockSessionTracker.getActiveSession.mockReturnValue(null);

      const response = await request(app)
        .get('/api/sessions/current')
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body).toHaveProperty('hasActiveSession', false);
      expect(response.body.session).toBeNull();
    });

    test('should handle missing session tracker', async () => {
      const appNoTracker = express();
      appNoTracker.use(express.json());
      appNoTracker.use('/api/sessions', createSessionRoutes({
        projectDatabases: mockProjectDatabases
      }));

      const response = await request(appNoTracker)
        .get('/api/sessions/current')
        .expect('Content-Type', /json/)
        .expect(503);

      expect(response.body).toHaveProperty('error');
    });
  });

  describe('GET /api/sessions/quality', () => {
    test('should return session quality', async () => {
      const mockQuality = {
        score: 85,
        factors: {
          codeChanges: 0.9,
          errorRate: 0.1
        }
      };

      mockSessionTracker.calculateSessionQuality.mockReturnValue(mockQuality);

      const response = await request(app)
        .get('/api/sessions/quality')
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body).toHaveProperty('quality');
      expect(response.body.quality.score).toBe(85);
    });
  });

  describe('GET /api/sessions/break-recommendation', () => {
    test('should return break recommendation', async () => {
      const mockRecommendation = {
        shouldTakeBreak: true,
        reason: 'High concentration time',
        sessionDuration: 120
      };

      mockSessionTracker.getBreakRecommendation.mockReturnValue(mockRecommendation);

      const response = await request(app)
        .get('/api/sessions/break-recommendation')
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body).toHaveProperty('recommendation');
      expect(response.body.recommendation.shouldTakeBreak).toBe(true);
    });
  });

  describe('GET /api/sessions/stats', () => {
    test('should return session statistics', async () => {
      const mockStats = {
        totalSessions: 10,
        averageDuration: 45,
        totalChanges: 150
      };

      mockSessionTracker.getSessionStats.mockReturnValue(mockStats);

      const response = await request(app)
        .get('/api/sessions/stats')
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body).toHaveProperty('stats');
      expect(response.body.stats.totalSessions).toBe(10);
    });

    test('should handle days parameter', async () => {
      mockSessionTracker.getSessionStats.mockReturnValue({});

      await request(app)
        .get('/api/sessions/stats?days=7')
        .expect(200);

      expect(mockSessionTracker.getSessionStats).toHaveBeenCalledWith('test-project', 7);
    });
  });
});
