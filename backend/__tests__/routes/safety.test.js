/**
 * Tests for Safety Routes
 */

import { jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import { createSafetyRoutes } from '../../routes/safety.js';

describe('Safety Routes', () => {
  let app;
  let mockDeps;
  let mockDb;
  let mockIo;

  beforeEach(() => {
    // Create mock database
    mockDb = {
      insertErrorLog: jest.fn().mockReturnValue(123),
      insertNotification: jest.fn().mockReturnValue(456)
    };

    // Create mock socket.io
    mockIo = {
      emit: jest.fn()
    };

    // Create mock dependencies
    mockDeps = {
      projectState: { db: mockDb },
      io: mockIo,
      SESSION_ID: 'test-session-123'
    };

    // Create Express app with safety routes
    app = express();
    app.use(express.json());
    app.use('/api', createSafetyRoutes(mockDeps));
  });

  describe('POST /api/errors', () => {
    it('should log error to database', async () => {
      const response = await request(app)
        .post('/api/errors')
        .send({
          error_type: 'TypeError',
          message: 'Cannot read property of undefined',
          stack: 'Error: at line 42',
          component: 'UserProfile',
          user_agent: 'Mozilla/5.0',
          url: '/profile',
          severity: 'error'
        });

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        success: true,
        error_id: 123
      });

      expect(mockDb.insertErrorLog).toHaveBeenCalledWith(
        expect.any(String), // timestamp
        'TypeError',
        'Cannot read property of undefined',
        'Error: at line 42',
        'UserProfile',
        'Mozilla/5.0',
        '/profile',
        undefined, // metadata
        'test-session-123',
        'error'
      );
    });

    it('should create notification for errors', async () => {
      await request(app)
        .post('/api/errors')
        .send({
          error_type: 'TypeError',
          message: 'Cannot read property of undefined',
          severity: 'error'
        });

      expect(mockDb.insertNotification).toHaveBeenCalledWith(
        expect.any(String),
        'error',
        'critical',
        expect.stringContaining('TypeError'),
        'Cannot read property of undefined',
        expect.objectContaining({ error_id: 123 }),
        'test-session-123'
      );

      expect(mockIo.emit).toHaveBeenCalledWith(
        'notification',
        expect.objectContaining({
          id: 456,
          type: 'error',
          severity: 'critical',
          read: false
        })
      );
    });

    it('should not create notification for warnings', async () => {
      await request(app)
        .post('/api/errors')
        .send({
          error_type: 'Warning',
          message: 'Deprecated API usage',
          severity: 'warning'
        });

      expect(mockDb.insertNotification).not.toHaveBeenCalled();
    });

    it('should emit error-logged event', async () => {
      await request(app)
        .post('/api/errors')
        .send({
          error_type: 'TypeError',
          message: 'Test error'
        });

      expect(mockIo.emit).toHaveBeenCalledWith(
        'error-logged',
        expect.objectContaining({
          id: 123,
          error_type: 'TypeError',
          message: 'Test error',
          severity: 'error'
        })
      );
    });

    it('should reject missing required fields', async () => {
      const response = await request(app)
        .post('/api/errors')
        .send({
          error_type: 'TypeError'
          // missing message
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Missing required fields');
    });

    it('should handle database errors', async () => {
      mockDb.insertErrorLog.mockImplementation(() => {
        throw new Error('Database error');
      });

      const response = await request(app)
        .post('/api/errors')
        .send({
          error_type: 'TypeError',
          message: 'Test error'
        });

      expect(response.status).toBe(500);
      expect(response.body.error).toBeDefined();
    });

    it('should handle errors with metadata', async () => {
      const metadata = { userId: 123, action: 'save' };

      await request(app)
        .post('/api/errors')
        .send({
          error_type: 'ValidationError',
          message: 'Invalid input',
          metadata
        });

      expect(mockDb.insertErrorLog).toHaveBeenCalledWith(
        expect.any(String),
        'ValidationError',
        'Invalid input',
        undefined, // stack
        undefined, // component
        undefined, // user_agent
        undefined, // url
        metadata,
        'test-session-123',
        'error'
      );
    });
  });

  describe('GET /api/syntax-errors', () => {
    it('should return empty errors array (stub)', async () => {
      const response = await request(app).get('/api/syntax-errors');

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        errors: [],
        count: 0,
        message: expect.stringContaining('not available')
      });
    });
  });

  describe('GET /api/syntax-errors/count', () => {
    it('should return zero count (stub)', async () => {
      const response = await request(app).get('/api/syntax-errors/count');

      expect(response.status).toBe(200);
      expect(response.body.count).toBe(0);
    });
  });

  describe('POST /api/syntax-errors/:errorId/resolve', () => {
    it('should return 501 not implemented (stub)', async () => {
      const response = await request(app)
        .post('/api/syntax-errors/123/resolve')
        .send({});

      expect(response.status).toBe(501);
      expect(response.body.error).toContain('not available');
    });
  });

  describe('GET /api/tests/frameworks', () => {
    it('should return empty frameworks array (stub)', async () => {
      const response = await request(app).get('/api/tests/frameworks');

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        frameworks: [],
        message: expect.stringContaining('not available')
      });
    });
  });

  describe('GET /api/tests/results', () => {
    it('should return empty results (stub)', async () => {
      const response = await request(app).get('/api/tests/results');

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        results: [],
        total: 0
      });
    });
  });

  describe('POST /api/tests/run', () => {
    it('should return 501 not implemented (stub)', async () => {
      const response = await request(app)
        .post('/api/tests/run')
        .send({});

      expect(response.status).toBe(501);
      expect(response.body.error).toContain('not available');
    });
  });

  describe('GET /api/pause/status', () => {
    it('should return not paused (stub)', async () => {
      const response = await request(app).get('/api/pause/status');

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        paused: false,
        message: expect.stringContaining('not available')
      });
    });
  });

  describe('POST /api/pause', () => {
    it('should return 501 not implemented (stub)', async () => {
      const response = await request(app)
        .post('/api/pause')
        .send({});

      expect(response.status).toBe(501);
      expect(response.body.error).toContain('not available');
    });
  });

  describe('POST /api/resume', () => {
    it('should return 501 not implemented (stub)', async () => {
      const response = await request(app)
        .post('/api/resume')
        .send({});

      expect(response.status).toBe(501);
      expect(response.body.error).toContain('not available');
    });
  });

  describe('GET /api/pattern-warnings', () => {
    it('should return empty warnings (stub)', async () => {
      const response = await request(app).get('/api/pattern-warnings');

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        warnings: [],
        count: 0,
        message: expect.stringContaining('not available')
      });
    });
  });

  describe('GET /api/pattern-warnings/category/:category', () => {
    it('should return empty warnings for category (stub)', async () => {
      const response = await request(app).get('/api/pattern-warnings/category/security');

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        warnings: [],
        count: 0,
        category: 'security'
      });
    });
  });

  describe('POST /api/pattern-warnings/:warningId/resolve', () => {
    it('should return 501 not implemented (stub)', async () => {
      const response = await request(app)
        .post('/api/pattern-warnings/123/resolve')
        .send({});

      expect(response.status).toBe(501);
      expect(response.body.error).toContain('not available');
    });
  });

  describe('GET /api/alerts/templates', () => {
    it('should return empty templates (stub)', async () => {
      const response = await request(app).get('/api/alerts/templates');

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        templates: []
      });
    });
  });
});
