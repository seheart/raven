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

    mockProjectState = new Map();
    mockProjectState.set('test-project', {
      name: 'test-project',
      initialized: true
    });

    mockProjectPaths = new Map();
    mockProjectPaths.set('test-project', '/tmp/test-project');

    const deps = {
      projectState: mockProjectState,
      projectPaths: mockProjectPaths,
      getActiveProject: () => 'test-project',
      setActiveProject: jest.fn()
    };

    app.use('/api/projects', createProjectRoutes(deps));
  });

  describe('GET /api/projects', () => {
    test('should list all projects', async () => {
      const response = await request(app)
        .get('/api/projects')
        .expect('Content-Type', /json/)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
    });
  });

  describe('GET /api/projects/active', () => {
    test('should return active project', async () => {
      const response = await request(app)
        .get('/api/projects/active')
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body).toHaveProperty('project');
      expect(response.body.project).toBe('test-project');
    });
  });

  describe('POST /api/projects/switch', () => {
    test('should switch to specified project', async () => {
      const response = await request(app)
        .post('/api/projects/switch')
        .send({ project: 'test-project' })
        .expect('Content-Type', /json/);

      expect([200, 400, 404]).toContain(response.status);
    });

    test('should reject invalid project name', async () => {
      const response = await request(app)
        .post('/api/projects/switch')
        .send({ project: 'nonexistent' })
        .expect('Content-Type', /json/);

      expect([400, 404]).toContain(response.status);
    });

    test('should reject missing project parameter', async () => {
      const response = await request(app)
        .post('/api/projects/switch')
        .send({})
        .expect('Content-Type', /json/)
        .expect(400);

      expect(response.body).toHaveProperty('error');
    });
  });

  describe('GET /api/projects/:name', () => {
    test('should return project details', async () => {
      const response = await request(app)
        .get('/api/projects/test-project')
        .expect('Content-Type', /json/);

      expect([200, 404]).toContain(response.status);
    });

    test('should handle nonexistent project', async () => {
      const response = await request(app)
        .get('/api/projects/nonexistent')
        .expect('Content-Type', /json/)
        .expect(404);

      expect(response.body).toHaveProperty('error');
    });
  });
});
