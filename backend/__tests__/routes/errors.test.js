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
        errors: [
          { id: 1, message: 'Test error', severity: 'high' }
        ],
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
      await request(app)
        .get('/api/errors?limit=50')
        .expect(200);

      expect(mockDb.getErrorLogs).toHaveBeenCalledWith(
        expect.objectContaining({ limit: 50 })
      );
    });

    test('should handle offset parameter', async () => {
      await request(app)
        .get('/api/errors?offset=10')
        .expect(200);

      expect(mockDb.getErrorLogs).toHaveBeenCalledWith(
        expect.objectContaining({ offset: 10 })
      );
    });

    test('should handle search parameter', async () => {
      await request(app)
        .get('/api/errors?search=database')
        .expect(200);

      expect(mockDb.getErrorLogs).toHaveBeenCalledWith(
        expect.objectContaining({ search: 'database' })
      );
    });

    test('should handle severity filter', async () => {
      await request(app)
        .get('/api/errors?severity=critical')
        .expect(200);

      expect(mockDb.getErrorLogs).toHaveBeenCalledWith(
        expect.objectContaining({ severity: 'critical' })
      );
    });

    test('should handle date range filters', async () => {
      await request(app)
        .get('/api/errors?startDate=2025-01-01&endDate=2025-01-31')
        .expect(200);

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
      const response = await request(app)
        .get('/api/errors/stats?project=test-project')
        .expect(200);

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

      const response = await request(app)
        .get('/api/errors/stats')
        .expect(200);

      expect(response.body).toHaveProperty('total');
      expect(response.body.total).toBe(5);
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

      const response = await request(app)
        .delete('/api/errors')
        .expect(200);

      expect(response.body.deletedCount).toBe(0);
    });
  });
});
