/**
 * Tests for Rollback Routes
 */

import { jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import { createRollbackRoutes } from '../../routes/rollback.js';

describe('Rollback Routes', () => {
  let app;
  let mockDeps;
  let mockDb;
  let mockRiskAnalyzer;
  let mockPatternMatcher;
  let mockSessionTracker;

  beforeEach(() => {
    // Create mock database
    mockDb = {
      query: jest.fn()
    };

    // Create mock risk analyzer
    mockRiskAnalyzer = {
      trackRollback: jest.fn().mockReturnValue(true)
    };

    // Create mock pattern matcher
    mockPatternMatcher = {
      analyzeRollbackPatterns: jest.fn().mockReturnValue([
        {
          file_pattern: '*.js',
          frequency: 5,
          common_reason: 'syntax error'
        }
      ])
    };

    // Create mock session tracker
    mockSessionTracker = {
      trackRollback: jest.fn()
    };

    // Create mock dependencies
    mockDeps = {
      projectDatabases: new Map([['test-project', mockDb]]),
      riskAnalyzer: mockRiskAnalyzer,
      patternMatcher: mockPatternMatcher,
      sessionTracker: mockSessionTracker
    };

    // Create Express app with rollback routes
    app = express();
    app.use(express.json());
    app.use('/api', createRollbackRoutes(mockDeps));
  });

  describe('POST /api/changes/:id/rollback', () => {
    it('should track rollback for a change', async () => {
      const response = await request(app)
        .post('/api/changes/123/rollback')
        .send({
          project: 'test-project',
          reason: 'Introduced bug'
        });

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        success: true,
        message: 'Rollback tracked'
      });

      expect(mockRiskAnalyzer.trackRollback).toHaveBeenCalledWith(
        mockDb,
        '123',
        'Introduced bug',
        false
      );
    });

    it('should track rollback in session tracker', async () => {
      await request(app)
        .post('/api/changes/456/rollback')
        .send({
          project: 'test-project',
          reason: 'Breaking change'
        });

      expect(mockSessionTracker.trackRollback).toHaveBeenCalledWith('test-project');
    });

    it('should use first project if no project specified', async () => {
      const response = await request(app)
        .post('/api/changes/789/rollback')
        .send({
          reason: 'Reverted feature'
        });

      expect(response.status).toBe(200);
      expect(mockRiskAnalyzer.trackRollback).toHaveBeenCalledWith(
        mockDb,
        '789',
        'Reverted feature',
        false
      );
    });

    it('should return 404 if project not found', async () => {
      const response = await request(app)
        .post('/api/changes/123/rollback')
        .send({
          project: 'nonexistent-project',
          reason: 'Test'
        });

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Project not found');
    });

    it('should return 503 if risk analyzer not initialized', async () => {
      mockDeps.riskAnalyzer = null;

      // Recreate app with null risk analyzer
      app = express();
      app.use(express.json());
      app.use('/api', createRollbackRoutes(mockDeps));

      const response = await request(app)
        .post('/api/changes/123/rollback')
        .send({
          project: 'test-project',
          reason: 'Test'
        });

      expect(response.status).toBe(503);
      expect(response.body.error).toBe('Risk analyzer not initialized');
    });

    it('should return 500 if rollback tracking fails', async () => {
      mockRiskAnalyzer.trackRollback.mockReturnValue(false);

      const response = await request(app)
        .post('/api/changes/123/rollback')
        .send({
          project: 'test-project',
          reason: 'Test'
        });

      expect(response.status).toBe(500);
      expect(response.body.error).toBe('Failed to track rollback');
    });

    it('should handle errors gracefully', async () => {
      mockRiskAnalyzer.trackRollback.mockImplementation(() => {
        throw new Error('Database error');
      });

      const response = await request(app)
        .post('/api/changes/123/rollback')
        .send({
          project: 'test-project',
          reason: 'Test'
        });

      expect(response.status).toBe(500);
      expect(response.body.error).toBe('Database error');
    });

    it('should work without session tracker', async () => {
      mockDeps.sessionTracker = null;

      // Recreate app without session tracker
      app = express();
      app.use(express.json());
      app.use('/api', createRollbackRoutes(mockDeps));

      const response = await request(app)
        .post('/api/changes/123/rollback')
        .send({
          project: 'test-project',
          reason: 'Test'
        });

      expect(response.status).toBe(200);
    });
  });

  describe('GET /api/rollbacks/patterns', () => {
    it('should return rollback patterns', async () => {
      const response = await request(app).get('/api/rollbacks/patterns?project=test-project');

      expect(response.status).toBe(200);
      expect(response.body.patterns).toHaveLength(1);
      expect(response.body.patterns[0]).toMatchObject({
        file_pattern: '*.js',
        frequency: 5,
        common_reason: 'syntax error'
      });

      expect(mockPatternMatcher.analyzeRollbackPatterns).toHaveBeenCalledWith('test-project');
    });

    it('should use first project if no project specified', async () => {
      const response = await request(app).get('/api/rollbacks/patterns');

      expect(response.status).toBe(200);
      expect(mockPatternMatcher.analyzeRollbackPatterns).toHaveBeenCalledWith('test-project');
    });

    it('should return 503 if pattern matcher not initialized', async () => {
      mockDeps.patternMatcher = null;

      // Recreate app with null pattern matcher
      app = express();
      app.use(express.json());
      app.use('/api', createRollbackRoutes(mockDeps));

      const response = await request(app).get('/api/rollbacks/patterns');

      expect(response.status).toBe(503);
      expect(response.body.error).toBe('Pattern matcher not initialized');
    });

    it('should handle errors gracefully', async () => {
      mockPatternMatcher.analyzeRollbackPatterns.mockImplementation(() => {
        throw new Error('Analysis error');
      });

      const response = await request(app).get('/api/rollbacks/patterns');

      expect(response.status).toBe(500);
      expect(response.body.error).toBe('Analysis error');
    });
  });
});
