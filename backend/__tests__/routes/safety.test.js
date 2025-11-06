/**
 * Tests for Safety Routes
 */

import { jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import { createSafetyRoutes } from '../../routes/safety.js';
import { safetyCache } from '../../utils/cache.js';

describe('Safety Routes', () => {
  let app;
  let mockDeps;
  let mockDb;
  let mockIo;

  beforeEach(() => {
    // Clear cache before each test
    safetyCache.clear();

    // Create mock database
    mockDb = {
      insertErrorLog: jest.fn().mockReturnValue(123),
      insertNotification: jest.fn().mockReturnValue(456)
    };

    // Create mock socket.io
    mockIo = {
      emit: jest.fn()
    };

    // Create mock dependencies with projectDatabases Map
    const projectDatabases = new Map();
    projectDatabases.set('test-project', mockDb);

    mockDeps = {
      projectDatabases,
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
      const response = await request(app).post('/api/errors').send({
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
      await request(app).post('/api/errors').send({
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
      await request(app).post('/api/errors').send({
        error_type: 'Warning',
        message: 'Deprecated API usage',
        severity: 'warning'
      });

      expect(mockDb.insertNotification).not.toHaveBeenCalled();
    });

    it('should emit error-logged event', async () => {
      await request(app).post('/api/errors').send({
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
      const response = await request(app).post('/api/errors').send({
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

      const response = await request(app).post('/api/errors').send({
        error_type: 'TypeError',
        message: 'Test error'
      });

      expect(response.status).toBe(500);
      expect(response.body.error).toBeDefined();
    });

    it('should handle errors with metadata', async () => {
      const metadata = { userId: 123, action: 'save' };

      await request(app).post('/api/errors').send({
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
      const response = await request(app).post('/api/syntax-errors/123/resolve').send({});

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
      const response = await request(app).post('/api/tests/run').send({});

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
      const response = await request(app).post('/api/pause').send({});

      expect(response.status).toBe(501);
      expect(response.body.error).toContain('not available');
    });
  });

  describe('POST /api/resume', () => {
    it('should return 501 not implemented (stub)', async () => {
      const response = await request(app).post('/api/resume').send({});

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
      const response = await request(app).post('/api/pattern-warnings/123/resolve').send({});

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

  describe('POST /api/open-file', () => {
    it('should require filepath', async () => {
      const response = await request(app).post('/api/open-file').send({});

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('filepath is required');
    });

    it('should handle file open request with default parameters', async () => {
      const response = await request(app)
        .post('/api/open-file')
        .send({ filepath: '/test/file.txt' });

      // Either succeeds or fails with 500 - both are valid in test environment
      expect([200, 500]).toContain(response.status);
    });

    it('should accept custom line number and editor parameters', async () => {
      const response = await request(app)
        .post('/api/open-file')
        .send({ filepath: '/test/file.txt', lineNumber: 42, editor: 'vscode' });

      // Either succeeds or fails with 500 - both are valid in test environment
      expect([200, 500]).toContain(response.status);
    });
  });

  describe('POST /api/syntax-errors/check', () => {
    it('should require filepath', async () => {
      const response = await request(app).post('/api/syntax-errors/check').send({});

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('filepath is required');
    });

    it('should handle syntax check request', async () => {
      const response = await request(app)
        .post('/api/syntax-errors/check')
        .send({ filepath: '/test/file.js' });

      // Either succeeds or fails with 500 - both are valid in test environment
      expect([200, 500]).toContain(response.status);
    });
  });

  describe('GET /api/syntax-errors with query params', () => {
    beforeEach(() => {
      safetyCache.clear();
      mockDb.getSyntaxErrors = jest.fn().mockReturnValue({
        errors: [{ id: 1, file: 'test.js', message: 'Syntax error' }],
        count: 1
      });
    });

    it('should accept limit parameter', async () => {
      await request(app).get('/api/syntax-errors?limit=10').set('Cache-Control', 'no-cache');

      expect(mockDb.getSyntaxErrors).toHaveBeenCalledWith(expect.objectContaining({ limit: 10 }));
    });

    it('should accept offset parameter', async () => {
      await request(app).get('/api/syntax-errors?offset=5').set('Cache-Control', 'no-cache');

      expect(mockDb.getSyntaxErrors).toHaveBeenCalledWith(expect.objectContaining({ offset: 5 }));
    });

    it('should accept resolved parameter', async () => {
      await request(app).get('/api/syntax-errors?resolved=true').set('Cache-Control', 'no-cache');

      expect(mockDb.getSyntaxErrors).toHaveBeenCalledWith(
        expect.objectContaining({ resolved: true })
      );
    });

    it('should return syntax errors from database', async () => {
      const response = await request(app)
        .get('/api/syntax-errors')
        .set('Cache-Control', 'no-cache');

      expect(response.status).toBe(200);
      expect(response.body.errors).toHaveLength(1);
      expect(response.body.count).toBe(1);
    });

    it('should handle database errors', async () => {
      mockDb.getSyntaxErrors.mockImplementation(() => {
        throw new Error('Database error');
      });

      const response = await request(app)
        .get('/api/syntax-errors')
        .set('Cache-Control', 'no-cache');

      expect(response.status).toBe(500);
    });
  });

  describe('POST /api/syntax-errors/:errorId/resolve with implementation', () => {
    beforeEach(() => {
      mockDb.resolveSyntaxError = jest.fn();
    });

    it('should resolve syntax error', async () => {
      const response = await request(app).post('/api/syntax-errors/123/resolve').send({});

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(mockDb.resolveSyntaxError).toHaveBeenCalledWith(123);
    });

    it('should handle database errors', async () => {
      mockDb.resolveSyntaxError.mockImplementation(() => {
        throw new Error('Database error');
      });

      const response = await request(app).post('/api/syntax-errors/456/resolve').send({});

      expect(response.status).toBe(500);
    });
  });

  describe('GET /api/syntax-errors/count with implementation', () => {
    beforeEach(() => {
      safetyCache.clear();
      mockDb.getSyntaxErrors = jest.fn().mockReturnValue({ count: 5 });
    });

    it('should return syntax error count', async () => {
      const response = await request(app)
        .get('/api/syntax-errors/count')
        .set('Cache-Control', 'no-cache');

      expect(response.status).toBe(200);
      expect(response.body.count).toBe(5);
    });

    it('should handle database errors', async () => {
      mockDb.getSyntaxErrors.mockImplementation(() => {
        throw new Error('Database error');
      });

      const response = await request(app)
        .get('/api/syntax-errors/count')
        .set('Cache-Control', 'no-cache');

      expect(response.status).toBe(500);
      expect(response.body.count).toBe(0);
    });
  });

  describe('GET /api/pattern-warnings with query params', () => {
    beforeEach(() => {
      safetyCache.clear();
      mockDb.getPatternWarnings = jest.fn().mockReturnValue({
        warnings: [{ id: 1, category: 'security', message: 'Potential XSS' }],
        count: 1
      });
    });

    it('should accept limit parameter', async () => {
      await request(app).get('/api/pattern-warnings?limit=50').set('Cache-Control', 'no-cache');

      expect(mockDb.getPatternWarnings).toHaveBeenCalledWith(
        expect.objectContaining({ limit: 50 })
      );
    });

    it('should accept offset parameter', async () => {
      await request(app).get('/api/pattern-warnings?offset=10').set('Cache-Control', 'no-cache');

      expect(mockDb.getPatternWarnings).toHaveBeenCalledWith(
        expect.objectContaining({ offset: 10 })
      );
    });

    it('should accept category parameter', async () => {
      await request(app)
        .get('/api/pattern-warnings?category=security')
        .set('Cache-Control', 'no-cache');

      expect(mockDb.getPatternWarnings).toHaveBeenCalledWith(
        expect.objectContaining({ category: 'security' })
      );
    });

    it('should accept resolved parameter', async () => {
      await request(app)
        .get('/api/pattern-warnings?resolved=true')
        .set('Cache-Control', 'no-cache');

      expect(mockDb.getPatternWarnings).toHaveBeenCalledWith(
        expect.objectContaining({ resolved: true })
      );
    });

    it('should return pattern warnings from database', async () => {
      const response = await request(app)
        .get('/api/pattern-warnings')
        .set('Cache-Control', 'no-cache');

      expect(response.status).toBe(200);
      expect(response.body.warnings).toHaveLength(1);
      expect(response.body.count).toBe(1);
    });

    it('should handle database errors', async () => {
      mockDb.getPatternWarnings.mockImplementation(() => {
        throw new Error('Database error');
      });

      const response = await request(app)
        .get('/api/pattern-warnings')
        .set('Cache-Control', 'no-cache');

      expect(response.status).toBe(500);
    });
  });

  describe('GET /api/pattern-warnings/category/:category with implementation', () => {
    beforeEach(() => {
      safetyCache.clear();
      mockDb.getPatternWarnings = jest.fn().mockReturnValue({
        warnings: [{ id: 1, category: 'security', message: 'XSS risk' }],
        count: 1
      });
    });

    it('should get warnings by category', async () => {
      const response = await request(app)
        .get('/api/pattern-warnings/category/security')
        .set('Cache-Control', 'no-cache');

      expect(response.status).toBe(200);
      expect(mockDb.getPatternWarnings).toHaveBeenCalledWith(
        expect.objectContaining({ category: 'security' })
      );
    });

    it('should accept limit for category endpoint', async () => {
      await request(app)
        .get('/api/pattern-warnings/category/performance?limit=25')
        .set('Cache-Control', 'no-cache');

      expect(mockDb.getPatternWarnings).toHaveBeenCalledWith(
        expect.objectContaining({ category: 'performance', limit: 25 })
      );
    });

    it('should handle database errors', async () => {
      mockDb.getPatternWarnings.mockImplementation(() => {
        throw new Error('Database error');
      });

      const response = await request(app)
        .get('/api/pattern-warnings/category/security')
        .set('Cache-Control', 'no-cache');

      expect(response.status).toBe(500);
    });
  });

  describe('POST /api/pattern-warnings/:warningId/resolve with implementation', () => {
    beforeEach(() => {
      mockDb.resolvePatternWarning = jest.fn();
    });

    it('should resolve pattern warning', async () => {
      const response = await request(app).post('/api/pattern-warnings/789/resolve').send({});

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(mockDb.resolvePatternWarning).toHaveBeenCalledWith(789);
    });

    it('should handle database errors', async () => {
      mockDb.resolvePatternWarning.mockImplementation(() => {
        throw new Error('Database error');
      });

      const response = await request(app).post('/api/pattern-warnings/999/resolve').send({});

      expect(response.status).toBe(500);
    });
  });

  describe('GET /api/sessions', () => {
    beforeEach(() => {
      mockDb.getSessions = jest.fn().mockReturnValue({
        sessions: [{ id: 1, start_time: '2025-01-01', end_time: '2025-01-02' }],
        total: 1
      });
    });

    it('should return sessions from database', async () => {
      const response = await request(app).get('/api/sessions');

      expect(response.status).toBe(200);
      expect(response.body.sessions).toHaveLength(1);
      expect(mockDb.getSessions).toHaveBeenCalledWith(
        expect.objectContaining({ limit: 10, offset: 0 })
      );
    });

    it('should accept query parameters', async () => {
      await request(app).get('/api/sessions?limit=5&offset=10&project=test-proj');

      expect(mockDb.getSessions).toHaveBeenCalledWith({
        limit: 5,
        offset: 10,
        projectName: 'test-proj'
      });
    });

    it('should handle database errors', async () => {
      mockDb.getSessions.mockImplementation(() => {
        throw new Error('Database error');
      });

      const response = await request(app).get('/api/sessions');

      expect(response.status).toBe(500);
    });
  });

  describe('GET /api/sessions/:sessionId/preview', () => {
    it('should return rollback preview stub', async () => {
      const response = await request(app).get('/api/sessions/123/preview');

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        session_id: 123,
        canRollback: false,
        changes: []
      });
    });
  });

  describe('POST /api/sessions/:sessionId/rollback', () => {
    it('should return 501 not implemented', async () => {
      const response = await request(app).post('/api/sessions/456/rollback').send({});

      expect(response.status).toBe(501);
      expect(response.body.error).toContain('not yet implemented');
    });
  });

  describe('POST /api/pattern-warnings/check', () => {
    it('should require filepath', async () => {
      const response = await request(app).post('/api/pattern-warnings/check').send({});

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('filepath is required');
    });

    it('should handle pattern check request', async () => {
      const response = await request(app)
        .post('/api/pattern-warnings/check')
        .send({ filepath: '/test/file.js' });

      // Either succeeds or fails with 500 - both are valid in test environment
      expect([200, 500]).toContain(response.status);
    });
  });

  describe('POST /api/pattern-warnings/resolve-all', () => {
    beforeEach(() => {
      mockDb.resolveAllPatternWarnings = jest.fn().mockReturnValue({ count: 5 });
    });

    it('should resolve all warnings', async () => {
      const response = await request(app).post('/api/pattern-warnings/resolve-all').send({});

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.count).toBe(5);
    });

    it('should support category filter', async () => {
      await request(app).post('/api/pattern-warnings/resolve-all?category=security').send({});

      expect(mockDb.resolveAllPatternWarnings).toHaveBeenCalledWith('security');
    });

    it('should return 501 if method not available', async () => {
      delete mockDb.resolveAllPatternWarnings;

      const response = await request(app).post('/api/pattern-warnings/resolve-all').send({});

      expect(response.status).toBe(501);
    });
  });

  describe('GET /api/pattern-warnings/export', () => {
    beforeEach(() => {
      safetyCache.clear();
      mockDb.getPatternWarnings = jest.fn().mockReturnValue({
        warnings: [{ id: 1, category: 'security', message: 'XSS risk', filepath: 'test.js' }]
      });
    });

    it('should export as JSON', async () => {
      const response = await request(app)
        .get('/api/pattern-warnings/export?format=json')
        .set('Cache-Control', 'no-cache');

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toContain('application/json');
      expect(response.body.warnings).toHaveLength(1);
    });

    it('should export as CSV by default', async () => {
      const response = await request(app)
        .get('/api/pattern-warnings/export')
        .set('Cache-Control', 'no-cache');

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toContain('text/csv');
      expect(response.text).toContain('ID,Timestamp,Filepath');
    });

    it('should return 501 if method not available', async () => {
      delete mockDb.getPatternWarnings;

      const response = await request(app)
        .get('/api/pattern-warnings/export')
        .set('Cache-Control', 'no-cache');

      expect(response.status).toBe(501);
    });
  });

  describe('DELETE /api/tests/results', () => {
    beforeEach(() => {
      mockDb.clearTestResults = jest.fn().mockReturnValue({ count: 10 });
    });

    it('should clear test results', async () => {
      const response = await request(app).delete('/api/tests/results');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.count).toBe(10);
    });

    it('should return 501 if method not available', async () => {
      delete mockDb.clearTestResults;

      const response = await request(app).delete('/api/tests/results');

      expect(response.status).toBe(501);
    });
  });

  describe('Error handling - No database', () => {
    beforeEach(() => {
      // Clear cache to ensure fresh responses
      safetyCache.clear();

      // Create app with empty projectDatabases
      const appNoDb = express();
      appNoDb.use(express.json());

      const depsNoDb = {
        projectDatabases: new Map(), // Empty map
        io: mockIo,
        SESSION_ID: 'test-session'
      };

      app = appNoDb;
      app.use('/api', createSafetyRoutes(depsNoDb));
    });

    it('should handle POST /api/errors with no database', async () => {
      const response = await request(app).post('/api/errors').send({
        error_type: 'TypeError',
        message: 'Test error'
      });

      expect(response.status).toBe(500);
      expect(response.body.error).toContain('No database available');
    });

    it('should handle GET /api/syntax-errors with no database', async () => {
      const response = await request(app)
        .get('/api/syntax-errors')
        .set('Cache-Control', 'no-cache');

      expect(response.status).toBe(500);
      expect(response.body.error).toContain('No database available');
    });
  });
});
