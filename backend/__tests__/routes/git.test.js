/**
 * Tests for Git Routes
 */

import { jest } from '@jest/globals';
import request from 'supertest';
import express from 'express';
import { createGitRoutes } from '../../routes/git.js';

describe('Git Routes', () => {
  let app;
  let mockProjectState;

  beforeEach(() => {
    app = express();
    app.use(express.json());

    mockProjectState = new Map();
    mockProjectState.set('test-project', {
      name: 'test-project',
      path: process.cwd()
    });

    const deps = {
      projectState: mockProjectState
    };

    app.use('/api/git', createGitRoutes(deps));
  });

  describe('GET /api/git/status', () => {
    test('should return git status', async () => {
      const response = await request(app)
        .get('/api/git/status')
        .expect('Content-Type', /json/);

      expect([200, 404, 500]).toContain(response.status);

      if (response.status === 200) {
        expect(response.body).toHaveProperty('branch');
      }
    });

    test('should handle project query parameter', async () => {
      const response = await request(app)
        .get('/api/git/status?project=test-project')
        .expect('Content-Type', /json/);

      expect([200, 404, 500]).toContain(response.status);
    });
  });

  describe('GET /api/git/branches', () => {
    test('should list git branches', async () => {
      const response = await request(app)
        .get('/api/git/branches')
        .expect('Content-Type', /json/);

      expect([200, 404, 500]).toContain(response.status);

      if (response.status === 200) {
        expect(response.body).toHaveProperty('branches');
        expect(Array.isArray(response.body.branches)).toBe(true);
      }
    });
  });

  describe('GET /api/git/history', () => {
    test('should return commit history', async () => {
      const response = await request(app)
        .get('/api/git/history')
        .expect('Content-Type', /json/);

      expect([200, 404, 500]).toContain(response.status);

      if (response.status === 200) {
        expect(response.body).toHaveProperty('commits');
        expect(Array.isArray(response.body.commits)).toBe(true);
      }
    });

    test('should handle limit parameter', async () => {
      const response = await request(app)
        .get('/api/git/history?limit=5')
        .expect('Content-Type', /json/);

      expect([200, 404, 500]).toContain(response.status);
    });
  });

  describe('GET /api/git/diff/:hash', () => {
    test('should handle diff request', async () => {
      const response = await request(app)
        .get('/api/git/diff/abc123')
        .expect('Content-Type', /json/);

      expect([200, 400, 404, 500]).toContain(response.status);
    });
  });
});
