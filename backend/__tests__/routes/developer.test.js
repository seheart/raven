/**
 * Tests for Developer Persona Routes
 */

import { jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import { createDeveloperRoutes } from '../../routes/developer.js';

describe('Developer Routes', () => {
  let app;
  let mockDeps;
  let mockDeveloperDB;

  beforeEach(() => {
    // Create mock developer database
    mockDeveloperDB = {
      getRecentInteractions: jest.fn().mockReturnValue([
        { id: 1, agent_name: 'test-agent', event_type: 'edit', project: 'test' }
      ]),
      getCodingPatterns: jest.fn().mockReturnValue([
        { id: 1, language: 'javascript', pattern_type: 'function', count: 5 }
      ]),
      getWorkflowStats: jest.fn().mockReturnValue({
        total_sessions: 10,
        total_duration: 3600,
        avg_session_duration: 360
      }),
      getAllPreferences: jest.fn().mockReturnValue([
        { preference_key: 'editor', preference_value: 'vscode' }
      ]),
      getContextSwitchStats: jest.fn().mockReturnValue({
        total_switches: 15,
        avg_focus_time: 1200
      }),
      logAgentInteraction: jest.fn().mockReturnValue(123),
      logCodePattern: jest.fn().mockReturnValue(456),
      logWorkflowEvent: jest.fn().mockReturnValue(789),
      db: {
        prepare: jest.fn((sql) => ({
          get: jest.fn(() => ({ count: 10 })),
          all: jest.fn(() => {
            if (sql.includes('language')) {
              return [{ language: 'javascript', count: 5 }];
            } else if (sql.includes('project')) {
              return [{ project: 'test-project', count: 8 }];
            } else if (sql.includes('hour_of_day')) {
              return [{ hour_of_day: 9, count: 20 }];
            }
            return [];
          })
        }))
      }
    };

    // Create mock dependencies
    mockDeps = {
      developerDB: mockDeveloperDB
    };

    // Create Express app with developer routes
    app = express();
    app.use(express.json());
    app.use('/api/developer', createDeveloperRoutes(mockDeps));
  });

  describe('GET /api/developer/interactions', () => {
    it('should get recent interactions with default limit', async () => {
      const response = await request(app).get('/api/developer/interactions');

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        interactions: expect.any(Array),
        total: 1
      });
      expect(mockDeveloperDB.getRecentInteractions).toHaveBeenCalledWith(50, null);
    });

    it('should accept custom limit parameter', async () => {
      await request(app).get('/api/developer/interactions?limit=100');

      expect(mockDeveloperDB.getRecentInteractions).toHaveBeenCalledWith(100, null);
    });

    it('should filter by project', async () => {
      await request(app).get('/api/developer/interactions?project=test-project');

      expect(mockDeveloperDB.getRecentInteractions).toHaveBeenCalledWith(50, 'test-project');
    });

    it('should handle "all" project as null', async () => {
      await request(app).get('/api/developer/interactions?project=all');

      expect(mockDeveloperDB.getRecentInteractions).toHaveBeenCalledWith(50, null);
    });

    it('should handle database errors', async () => {
      mockDeveloperDB.getRecentInteractions.mockImplementation(() => {
        throw new Error('Database error');
      });

      const response = await request(app).get('/api/developer/interactions');

      expect(response.status).toBe(500);
      expect(response.body.error).toBe('Database error');
    });
  });

  describe('GET /api/developer/patterns', () => {
    it('should get coding patterns with default limit', async () => {
      const response = await request(app).get('/api/developer/patterns');

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        patterns: expect.any(Array),
        total: 1
      });
      expect(mockDeveloperDB.getCodingPatterns).toHaveBeenCalledWith(null, 100);
    });

    it('should filter by language', async () => {
      await request(app).get('/api/developer/patterns?language=javascript');

      expect(mockDeveloperDB.getCodingPatterns).toHaveBeenCalledWith('javascript', 100);
    });

    it('should accept custom limit', async () => {
      await request(app).get('/api/developer/patterns?limit=50');

      expect(mockDeveloperDB.getCodingPatterns).toHaveBeenCalledWith(null, 50);
    });

    it('should handle "all" language as null', async () => {
      await request(app).get('/api/developer/patterns?language=all');

      expect(mockDeveloperDB.getCodingPatterns).toHaveBeenCalledWith(null, 100);
    });

    it('should handle errors', async () => {
      mockDeveloperDB.getCodingPatterns.mockImplementation(() => {
        throw new Error('Query error');
      });

      const response = await request(app).get('/api/developer/patterns');

      expect(response.status).toBe(500);
    });
  });

  describe('GET /api/developer/workflow', () => {
    it('should get workflow stats with default days', async () => {
      const response = await request(app).get('/api/developer/workflow');

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        total_sessions: 10,
        total_duration: 3600,
        avg_session_duration: 360
      });
      expect(mockDeveloperDB.getWorkflowStats).toHaveBeenCalledWith(30);
    });

    it('should accept custom days parameter', async () => {
      await request(app).get('/api/developer/workflow?days=7');

      expect(mockDeveloperDB.getWorkflowStats).toHaveBeenCalledWith(7);
    });

    it('should handle errors', async () => {
      mockDeveloperDB.getWorkflowStats.mockImplementation(() => {
        throw new Error('Stats error');
      });

      const response = await request(app).get('/api/developer/workflow');

      expect(response.status).toBe(500);
    });
  });

  describe('GET /api/developer/preferences', () => {
    it('should get all preferences', async () => {
      const response = await request(app).get('/api/developer/preferences');

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        preferences: expect.any(Array),
        total: 1
      });
      expect(mockDeveloperDB.getAllPreferences).toHaveBeenCalled();
    });

    it('should handle errors', async () => {
      mockDeveloperDB.getAllPreferences.mockImplementation(() => {
        throw new Error('Preferences error');
      });

      const response = await request(app).get('/api/developer/preferences');

      expect(response.status).toBe(500);
    });
  });

  describe('GET /api/developer/context-switches', () => {
    it('should get context switch stats', async () => {
      const response = await request(app).get('/api/developer/context-switches');

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        total_switches: 15,
        avg_focus_time: 1200
      });
      expect(mockDeveloperDB.getContextSwitchStats).toHaveBeenCalledWith(30);
    });

    it('should accept custom days parameter', async () => {
      await request(app).get('/api/developer/context-switches?days=14');

      expect(mockDeveloperDB.getContextSwitchStats).toHaveBeenCalledWith(14);
    });

    it('should handle errors', async () => {
      mockDeveloperDB.getContextSwitchStats.mockImplementation(() => {
        throw new Error('Stats error');
      });

      const response = await request(app).get('/api/developer/context-switches');

      expect(response.status).toBe(500);
    });
  });

  describe('GET /api/developer/stats', () => {
    it('should get overall developer statistics', async () => {
      const response = await request(app).get('/api/developer/stats');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('counts');
      expect(response.body).toHaveProperty('languages');
      expect(response.body).toHaveProperty('projects');
      expect(response.body).toHaveProperty('hourly_activity');

      expect(response.body.counts).toMatchObject({
        agent_interactions: 10,
        code_patterns: 10,
        workflow_events: 10
      });

      expect(response.body.languages).toHaveLength(1);
      expect(response.body.projects).toHaveLength(1);
      expect(response.body.hourly_activity).toHaveLength(1);
    });

    it('should handle database errors', async () => {
      mockDeveloperDB.db.prepare.mockImplementation(() => {
        throw new Error('SQL error');
      });

      const response = await request(app).get('/api/developer/stats');

      expect(response.status).toBe(500);
    });
  });

  describe('POST /api/developer/interactions', () => {
    it('should log agent interaction', async () => {
      const interactionData = {
        agent_name: 'test-agent',
        event_type: 'edit',
        project: 'test-project'
      };

      const response = await request(app)
        .post('/api/developer/interactions')
        .send(interactionData);

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        success: true,
        id: 123
      });
      expect(mockDeveloperDB.logAgentInteraction).toHaveBeenCalledWith(interactionData);
    });

    it('should handle errors', async () => {
      mockDeveloperDB.logAgentInteraction.mockImplementation(() => {
        throw new Error('Insert error');
      });

      const response = await request(app)
        .post('/api/developer/interactions')
        .send({});

      expect(response.status).toBe(500);
    });
  });

  describe('POST /api/developer/patterns', () => {
    it('should log code pattern', async () => {
      const patternData = {
        language: 'javascript',
        pattern_type: 'arrow-function',
        count: 5
      };

      const response = await request(app)
        .post('/api/developer/patterns')
        .send(patternData);

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        success: true,
        id: 456
      });
      expect(mockDeveloperDB.logCodePattern).toHaveBeenCalledWith(patternData);
    });

    it('should handle errors', async () => {
      mockDeveloperDB.logCodePattern.mockImplementation(() => {
        throw new Error('Insert error');
      });

      const response = await request(app)
        .post('/api/developer/patterns')
        .send({});

      expect(response.status).toBe(500);
    });
  });

  describe('POST /api/developer/workflow', () => {
    it('should log workflow event', async () => {
      const workflowData = {
        event_type: 'session-start',
        project: 'test-project',
        hour_of_day: 9
      };

      const response = await request(app)
        .post('/api/developer/workflow')
        .send(workflowData);

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        success: true,
        id: 789
      });
      expect(mockDeveloperDB.logWorkflowEvent).toHaveBeenCalledWith(workflowData);
    });

    it('should handle errors', async () => {
      mockDeveloperDB.logWorkflowEvent.mockImplementation(() => {
        throw new Error('Insert error');
      });

      const response = await request(app)
        .post('/api/developer/workflow')
        .send({});

      expect(response.status).toBe(500);
    });
  });
});
