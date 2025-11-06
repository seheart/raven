/**
 * Tests for Errors Routes
 */

import { jest } from '@jest/globals';
import request from 'supertest';
import express from 'express';
import { createErrorsRoutes } from '../../routes/errors.js';

describe('Errors Routes', () => {
  let app;
  let mockDb;
  let mockProjectDatabases;

  beforeEach(() => {
    app = express();
    app.use(express.json());

    mockDb = {
      getErrorLogs: jest.fn().mockReturnValue({
        errors: [],
        total: 0
      }),
      getErrorStats: jest.fn().mockReturnValue({
        total: 0,
        bySeverity: {}
      }),
      clearErrorLogs: jest.fn().mockReturnValue(0)
    };

    mockProjectDatabases = new Map();
    mockProjectDatabases.set('test-project', mockDb);

    const deps = {
      projectState: { db: mockDb },
      projectDatabases: mockProjectDatabases
    };

    app.use('/api', createErrorsRoutes(deps));
  });

  describe('GET /api/errors', () => {
    test('should return error logs', async () => {
      mockDb.getErrorLogs.mockReturnValue({
        errors: [{ id: 1, message: 'Test error', severity: 'high' }],
        total: 1
      });

      const response = await request(app)
        .get('/api/errors')
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body).toHaveProperty('errors');
      expect(response.body).toHaveProperty('total');
      expect(mockDb.getErrorLogs).toHaveBeenCalled();
    });

    test('should handle limit parameter', async () => {
      await request(app).get('/api/errors?limit=50').expect(200);

      expect(mockDb.getErrorLogs).toHaveBeenCalledWith(expect.objectContaining({ limit: 50 }));
    });

    test('should handle offset parameter', async () => {
      await request(app).get('/api/errors?offset=10').expect(200);

      expect(mockDb.getErrorLogs).toHaveBeenCalledWith(expect.objectContaining({ offset: 10 }));
    });

    test('should handle search parameter', async () => {
      await request(app).get('/api/errors?search=database').expect(200);

      expect(mockDb.getErrorLogs).toHaveBeenCalledWith(
        expect.objectContaining({ search: 'database' })
      );
    });

    test('should handle severity filter', async () => {
      await request(app).get('/api/errors?severity=critical').expect(200);

      expect(mockDb.getErrorLogs).toHaveBeenCalledWith(
        expect.objectContaining({ severity: 'critical' })
      );
    });

    test('should handle date range filters', async () => {
      await request(app).get('/api/errors?startDate=2025-01-01&endDate=2025-01-31').expect(200);

      expect(mockDb.getErrorLogs).toHaveBeenCalledWith(
        expect.objectContaining({
          startDate: '2025-01-01',
          endDate: '2025-01-31'
        })
      );
    });
  });

  describe('GET /api/errors/stats', () => {
    test('should return error statistics', async () => {
      mockDb.getErrorStats.mockReturnValue({
        total: 10,
        bySeverity: { critical: 2, high: 5, medium: 3 }
      });

      const response = await request(app)
        .get('/api/errors/stats')
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body).toHaveProperty('total');
      expect(response.body.total).toBe(10);
      expect(mockDb.getErrorStats).toHaveBeenCalled();
    });

    test('should handle project query parameter', async () => {
      // eslint-disable-next-line no-unused-vars
      const response = await request(app).get('/api/errors/stats?project=test-project').expect(200);

      expect(mockDb.getErrorStats).toHaveBeenCalled();
    });

    test('should return 404 for non-existent project', async () => {
      const response = await request(app)
        .get('/api/errors/stats?project=nonexistent')
        .expect('Content-Type', /json/)
        .expect(404);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('not found');
    });

    test('should ensure total field is present', async () => {
      mockDb.getErrorStats.mockReturnValue({
        count: 5,
        bySeverity: {}
      });

      const response = await request(app).get('/api/errors/stats').expect(200);

      expect(response.body).toHaveProperty('total');
      expect(response.body.total).toBe(5);
    });
  });

  describe('POST /api/errors', () => {
    beforeEach(() => {
      mockDb.logError = jest.fn().mockReturnValue({ id: 1 });
    });

    test('should log error from frontend', async () => {
      const errorData = {
        message: 'Test error message',
        error_type: 'TypeError',
        stack: 'Error stack trace',
        component: 'TestComponent',
        severity: 'error',
        user_agent: 'Mozilla/5.0',
        url: 'http://localhost:5173/test',
        metadata: { foo: 'bar' }
      };

      const response = await request(app)
        .post('/api/errors')
        .send(errorData)
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('error_id', 1);
      expect(response.body).toHaveProperty('message', 'Error logged successfully');
      expect(mockDb.logError).toHaveBeenCalledWith(
        expect.objectContaining({
          error_type: 'TypeError',
          message: 'Test error message',
          stack: 'Error stack trace',
          component: 'TestComponent',
          severity: 'error',
          user_agent: 'Mozilla/5.0',
          url: 'http://localhost:5173/test',
          metadata: { foo: 'bar' }
        })
      );
    });

    test('should log error with minimal data', async () => {
      const errorData = {
        message: 'Simple error'
      };

      const response = await request(app).post('/api/errors').send(errorData).expect(200);

      expect(response.body.success).toBe(true);
      expect(mockDb.logError).toHaveBeenCalledWith(
        expect.objectContaining({
          error_type: 'Error',
          message: 'Simple error',
          stack: null,
          component: 'Unknown',
          severity: 'error',
          user_agent: null,
          url: null,
          metadata: {}
        })
      );
    });

    test('should return 400 when message is missing', async () => {
      const response = await request(app)
        .post('/api/errors')
        .send({ error_type: 'TypeError' })
        .expect('Content-Type', /json/)
        .expect(400);

      expect(response.body).toHaveProperty('error', 'Error message is required');
      expect(mockDb.logError).not.toHaveBeenCalled();
    });

    test('should emit via WebSocket when io is available', async () => {
      const mockIo = {
        emit: jest.fn()
      };

      const appWithIo = express();
      appWithIo.use(express.json());

      const depsWithIo = {
        projectState: { db: mockDb },
        projectDatabases: mockProjectDatabases,
        io: mockIo
      };

      appWithIo.use('/api', createErrorsRoutes(depsWithIo));

      await request(appWithIo).post('/api/errors').send({ message: 'Test error' }).expect(200);

      expect(mockIo.emit).toHaveBeenCalledWith('error-logged', { id: 1 });
    });

    test('should handle database error', async () => {
      mockDb.logError.mockImplementation(() => {
        throw new Error('Database write failed');
      });

      const response = await request(app)
        .post('/api/errors')
        .send({ message: 'Test error' })
        .expect('Content-Type', /json/)
        .expect(500);

      expect(response.body).toHaveProperty('error', 'Database write failed');
    });
  });

  describe('DELETE /api/errors', () => {
    test('should clear all error logs', async () => {
      mockDb.clearErrorLogs.mockReturnValue(15);

      const response = await request(app)
        .delete('/api/errors')
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('deletedCount', 15);
      expect(response.body.message).toContain('Deleted all');
      expect(mockDb.clearErrorLogs).toHaveBeenCalledWith(null);
    });

    test('should clear errors older than specified days', async () => {
      mockDb.clearErrorLogs.mockReturnValue(8);

      const response = await request(app)
        .delete('/api/errors?olderThanDays=30')
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('deletedCount', 8);
      expect(response.body.message).toContain('older than 30 days');
      expect(mockDb.clearErrorLogs).toHaveBeenCalledWith(30);
    });

    test('should return deletedCount of 0 when no errors to delete', async () => {
      mockDb.clearErrorLogs.mockReturnValue(0);

      const response = await request(app).delete('/api/errors').expect(200);

      expect(response.body.deletedCount).toBe(0);
    });

    test('should handle database error during deletion', async () => {
      mockDb.clearErrorLogs.mockImplementation(() => {
        throw new Error('Delete operation failed');
      });

      const response = await request(app)
        .delete('/api/errors')
        .expect('Content-Type', /json/)
        .expect(500);

      expect(response.body).toHaveProperty('error', 'Delete operation failed');
    });
  });

  describe('Error Handling', () => {
    test('should handle error in GET /api/errors', async () => {
      mockDb.getErrorLogs.mockImplementation(() => {
        throw new Error('Query failed');
      });

      const response = await request(app)
        .get('/api/errors')
        .expect('Content-Type', /json/)
        .expect(500);

      expect(response.body).toHaveProperty('error', 'Query failed');
    });

    test('should handle missing active database in stats', async () => {
      const appNoDb = express();
      appNoDb.use(express.json());

      const depsNoDb = {
        projectState: { db: null },
        projectDatabases: new Map()
      };

      appNoDb.use('/api', createErrorsRoutes(depsNoDb));

      const response = await request(appNoDb)
        .get('/api/errors/stats')
        .expect('Content-Type', /json/)
        .expect(500);

      expect(response.body).toHaveProperty('error', 'No active project database');
    });

    test('should handle error in stats endpoint', async () => {
      mockDb.getErrorStats.mockImplementation(() => {
        throw new Error('Stats query failed');
      });

      const response = await request(app)
        .get('/api/errors/stats')
        .expect('Content-Type', /json/)
        .expect(500);

      expect(response.body).toHaveProperty('error', 'Stats query failed');
      expect(response.body).toHaveProperty('total', 0);
    });
  });
});
