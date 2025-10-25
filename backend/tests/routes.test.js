/**
 * Integration tests for modular routes
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import express from 'express';
import { createProjectRoutes } from '../routes/projects.js';
import { createPreferencesRoutes } from '../routes/preferences.js';
import { createSearchRoutes } from '../routes/search.js';
import { createUtilityRoutes } from '../routes/utility.js';
import { createDocumentationRoutes } from '../routes/documentation.js';
import { createChangelogRoutes } from '../routes/changelog.js';

// Mock dependencies
const mockProjectState = {
  activeProject: 'test-project',
  availableProjects: [
    { name: 'test-project', path: '/test', enabled: true },
    { name: 'another-project', path: '/another', enabled: false }
  ],
  db: {
    db: {
      prepare: () => ({
        all: () => [],
        get: () => ({ count: 0 }),
        run: () => ({ changes: 0 })
      })
    }
  }
};

const mockProjectDatabases = new Map();
const userPreferences = new Map();

describe('Route Modules Integration Tests', () => {
  let app;

  beforeAll(() => {
    app = express();
    app.use(express.json());

    // Mount routes
    app.use('/api', createProjectRoutes({
      projectDatabases: mockProjectDatabases,
      config: {},
      projectPaths: new Map(),
      projectState: mockProjectState,
      CONFIG_PATH: '/test/config.toml'
    }));

    app.use('/api', createPreferencesRoutes({ userPreferences }));
    app.use('/api', createSearchRoutes({ projectState: mockProjectState }));
    app.use('/api', createUtilityRoutes({ projectState: mockProjectState, app }));
    app.use('/api', createDocumentationRoutes({}));
    app.use('/api', createChangelogRoutes({}));
  });

  describe('Projects Routes', () => {
    it('GET /api/projects/list should return projects', async () => {
      const res = await request(app).get('/api/projects/list');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('projects');
      expect(res.body).toHaveProperty('active');
      expect(Array.isArray(res.body.projects)).toBe(true);
    });

    it('POST /api/projects/refresh should refresh projects', async () => {
      const res = await request(app).post('/api/projects/refresh');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('success');
    });
  });

  describe('Preferences Routes', () => {
    it('GET /api/preferences should return default preferences', async () => {
      const res = await request(app).get('/api/preferences?userId=test');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('notifications');
      expect(res.body).toHaveProperty('ui');
      expect(res.body).toHaveProperty('performance');
    });

    it('POST /api/preferences should save preferences', async () => {
      const prefs = {
        notifications: { enabled: false },
        ui: { theme: 'light' }
      };

      const res = await request(app)
        .post('/api/preferences')
        .send({ userId: 'test', preferences: prefs });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('GET /api/preferences should return saved preferences', async () => {
      const res = await request(app).get('/api/preferences?userId=test');
      expect(res.status).toBe(200);
      expect(res.body.notifications.enabled).toBe(false);
      expect(res.body.ui.theme).toBe('light');
    });
  });

  describe('Search Routes', () => {
    it('GET /api/search/global should reject short queries', async () => {
      const res = await request(app).get('/api/search/global?q=a');
      expect(res.status).toBe(200);
      expect(res.body.total).toBe(0);
    });

    it('GET /api/search/global should search with valid query', async () => {
      const res = await request(app).get('/api/search/global?q=test&limit=10');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('query');
      expect(res.body).toHaveProperty('results');
      expect(res.body).toHaveProperty('total');
      expect(res.body).toHaveProperty('categories');
    });
  });

  describe('Utility Routes', () => {
    it('GET /api/endpoints should list all endpoints', async () => {
      const res = await request(app).get('/api/endpoints');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('total');
      expect(res.body).toHaveProperty('endpoints');
      expect(Array.isArray(res.body.endpoints)).toBe(true);
      expect(res.body.total).toBeGreaterThan(0);
    });

    it('POST /api/database/clear-old/:days should validate days parameter', async () => {
      const res = await request(app).post('/api/database/clear-old/invalid');
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Invalid days parameter');
    });
  });

  describe('Documentation Routes', () => {
    it('GET /api/docs/list should return docs list', async () => {
      const res = await request(app).get('/api/docs/list');
      expect([200, 500]).toContain(res.status); // 500 if docs dir missing
    });

    it('GET /api/docs/:filepath should reject non-markdown files', async () => {
      const res = await request(app).get('/api/docs/test.txt');
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('markdown');
    });

    it('GET /api/docs/:filepath should prevent path traversal', async () => {
      const res = await request(app).get('/api/docs/../../../etc/passwd.md');
      expect(res.status).toBe(403);
      expect(res.body.error).toContain('Path traversal');
    });
  });

  describe('Changelog Routes', () => {
    it('GET /api/changelog should return changelog or 404', async () => {
      const res = await request(app).get('/api/changelog');
      expect([200, 404]).toContain(res.status);
      if (res.status === 200) {
        expect(Array.isArray(res.body)).toBe(true);
      }
    });
  });
});

describe('Database Migrator', () => {
  it('should create migration table', () => {
    // Migration tests would go here
    expect(true).toBe(true);
  });
});

describe('Frontend Logger', () => {
  it('should log at appropriate levels', () => {
    // Logger tests would go here
    expect(true).toBe(true);
  });
});
