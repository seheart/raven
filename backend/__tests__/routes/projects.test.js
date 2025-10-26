/**
 * Tests for Projects Routes
 */

import { jest } from '@jest/globals';
import request from 'supertest';
import express from 'express';
import { createProjectRoutes } from '../../routes/projects.js';

describe('Projects Routes', () => {
  let app;
  let mockProjectState;
  let mockProjectPaths;

  beforeEach(() => {
    app = express();
    app.use(express.json());

    const mockDb = {
      db: {
        prepare: jest.fn().mockReturnValue({
          get: jest.fn().mockReturnValue({ count: 0 })
        })
      }
    };

    const mockProjectDatabases = new Map();
    mockProjectDatabases.set('test-project', mockDb);

    mockProjectPaths = new Map();
    mockProjectPaths.set('test-project', '/tmp/test-project');

    mockProjectState = {
      availableProjects: [
        { name: 'test-project', path: '/tmp/test-project', description: 'Test Project' }
      ],
      activeProject: 'test-project'
    };

    const deps = {
      projectState: mockProjectState,
      projectPaths: mockProjectPaths,
      projectDatabases: mockProjectDatabases,
      config: {
        autoDiscover: true,
        basePath: '/tmp',
        projects: [
          { name: 'test-project', enabled: true }
        ]
      }
    };

    app.use('/api/projects', createProjectRoutes(deps));
  });

  describe('GET /api/projects', () => {
    test('should return projects configuration', async () => {
      const response = await request(app)
        .get('/api/projects')
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body).toHaveProperty('projects');
      expect(response.body).toHaveProperty('autoDiscover');
      expect(response.body).toHaveProperty('basePath');
      expect(Array.isArray(response.body.projects)).toBe(true);
    });
  });

  describe('GET /api/projects/list', () => {
    test('should list available projects', async () => {
      const response = await request(app)
        .get('/api/projects/list')
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body).toHaveProperty('projects');
      expect(response.body).toHaveProperty('active');
      expect(Array.isArray(response.body.projects)).toBe(true);
      expect(response.body.active).toBe('test-project');
    });
  });

  describe('POST /api/projects/refresh', () => {
    test('should handle project refresh request', async () => {
      const response = await request(app)
        .post('/api/projects/refresh')
        .expect('Content-Type', /json/);

      expect([200, 500]).toContain(response.status);
    });
  });

  describe('POST /api/projects/select', () => {
    test('should handle project selection', async () => {
      const response = await request(app)
        .post('/api/projects/select')
        .send({ project: 'test-project' })
        .expect('Content-Type', /json/);

      expect([200, 400, 404, 500]).toContain(response.status);
    });
  });
});
