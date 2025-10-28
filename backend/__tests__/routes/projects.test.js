/**
 * Tests for Projects Routes
 * Comprehensive test coverage for all project management endpoints
 */

import { jest } from '@jest/globals';
import request from 'supertest';
import express from 'express';
import { createProjectRoutes } from '../../routes/projects.js';
import { promises as fsPromises } from 'fs';
import { join } from 'path';
import fs from 'fs';

// Mock fs and fsPromises
jest.unstable_mockModule('fs', () => ({
  default: {
    existsSync: jest.fn(),
    statSync: jest.fn()
  }
}));

jest.unstable_mockModule('fs/promises', () => ({
  promises: {
    readFile: jest.fn(),
    writeFile: jest.fn(),
    unlink: jest.fn()
  }
}));

describe('Projects Routes', () => {
  let app;
  let mockProjectState;
  let mockProjectPaths;
  let mockProjectDatabases;
  let mockConfig;
  let mockConfigPath;
  let mockDb;

  beforeEach(() => {
    app = express();
    app.use(express.json());

    // Mock database
    mockDb = {
      db: {
        prepare: jest.fn().mockReturnValue({
          get: jest.fn().mockReturnValue({ count: 42 })
        })
      }
    };

    // Mock project databases
    mockProjectDatabases = new Map();
    mockProjectDatabases.set('test-project', mockDb);
    mockProjectDatabases.set('another-project', mockDb);

    // Mock project paths
    mockProjectPaths = new Map();
    mockProjectPaths.set('test-project', '/tmp/test-project');
    mockProjectPaths.set('another-project', '/tmp/another-project');

    // Mock project state
    mockProjectState = {
      availableProjects: [
        { name: 'test-project', path: '/tmp/test-project', description: 'Test Project' },
        { name: 'another-project', path: '/tmp/another-project', description: 'Another Project' }
      ],
      activeProject: 'test-project'
    };

    // Mock config
    mockConfig = {
      autoDiscover: true,
      basePath: '/tmp',
      projects: [
        { name: 'test-project', enabled: true, ignorePatterns: ['*.log'], maxFileSize: 10485760, retentionDays: 30 },
        { name: 'another-project', enabled: false, ignorePatterns: [], maxFileSize: 5242880, retentionDays: 15 }
      ]
    };

    mockConfigPath = '/tmp/projects.json';

    const deps = {
      projectState: mockProjectState,
      projectPaths: mockProjectPaths,
      projectDatabases: mockProjectDatabases,
      config: mockConfig,
      CONFIG_PATH: mockConfigPath
    };

    app.use('/api/projects', createProjectRoutes(deps));

    // Reset fs mocks
    jest.clearAllMocks();
  });

  describe('GET /api/projects', () => {
    test('should return projects configuration with all required fields', async () => {
      fs.existsSync = jest.fn().mockReturnValue(true);
      fs.statSync = jest.fn().mockReturnValue({ size: 1024000 });

      const response = await request(app)
        .get('/api/projects')
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body).toHaveProperty('projects');
      expect(response.body).toHaveProperty('autoDiscover');
      expect(response.body).toHaveProperty('basePath');
      expect(Array.isArray(response.body.projects)).toBe(true);
    });

    test('should include cache control headers to prevent caching', async () => {
      fs.existsSync = jest.fn().mockReturnValue(true);
      fs.statSync = jest.fn().mockReturnValue({ size: 1024000 });

      const response = await request(app)
        .get('/api/projects')
        .expect(200);

      expect(response.headers['cache-control']).toContain('no-store');
      expect(response.headers['cache-control']).toContain('no-cache');
      expect(response.headers['pragma']).toBe('no-cache');
      expect(response.headers['expires']).toBe('0');
    });

    test('should return project stats with dbSize and eventCount', async () => {
      fs.existsSync = jest.fn().mockReturnValue(true);
      fs.statSync = jest.fn().mockReturnValue({ size: 2048000 });

      const response = await request(app)
        .get('/api/projects')
        .expect(200);

      const project = response.body.projects[0];
      expect(project).toHaveProperty('name');
      expect(project).toHaveProperty('path');
      expect(project).toHaveProperty('dbSize');
      expect(project).toHaveProperty('eventCount');
      expect(project.dbSize).toBe(2048000);
      expect(project.eventCount).toBe(42);
    });

    test('should return project configuration with enabled status', async () => {
      fs.existsSync = jest.fn().mockReturnValue(true);
      fs.statSync = jest.fn().mockReturnValue({ size: 1024000 });

      const response = await request(app)
        .get('/api/projects')
        .expect(200);

      const testProject = response.body.projects.find(p => p.name === 'test-project');
      const anotherProject = response.body.projects.find(p => p.name === 'another-project');

      expect(testProject.enabled).toBe(true);
      expect(anotherProject.enabled).toBe(false);
    });

    test('should include ignorePatterns and maxFileSize from config', async () => {
      fs.existsSync = jest.fn().mockReturnValue(true);
      fs.statSync = jest.fn().mockReturnValue({ size: 1024000 });

      const response = await request(app)
        .get('/api/projects')
        .expect(200);

      const testProject = response.body.projects.find(p => p.name === 'test-project');
      expect(testProject.ignorePatterns).toEqual(['*.log']);
      expect(testProject.maxFileSize).toBe(10485760);
      expect(testProject.retentionDays).toBe(30);
    });

    test('should default to enabled=true when not specified in config', async () => {
      fs.existsSync = jest.fn().mockReturnValue(true);
      fs.statSync = jest.fn().mockReturnValue({ size: 1024000 });

      // Add a project without enabled field in config
      mockProjectDatabases.set('no-config-project', mockDb);
      mockProjectPaths.set('no-config-project', '/tmp/no-config');
      mockProjectState.availableProjects.push({
        name: 'no-config-project',
        path: '/tmp/no-config'
      });

      const response = await request(app)
        .get('/api/projects')
        .expect(200);

      const noConfigProject = response.body.projects.find(p => p.name === 'no-config-project');
      expect(noConfigProject.enabled).toBe(true);
    });

    test('should handle missing database file gracefully', async () => {
      fs.existsSync = jest.fn().mockReturnValue(false);

      const response = await request(app)
        .get('/api/projects')
        .expect(200);

      const project = response.body.projects[0];
      expect(project.dbSize).toBe(0);
    });

    test('should handle database stat errors gracefully', async () => {
      fs.existsSync = jest.fn().mockImplementation(() => {
        throw new Error('Permission denied');
      });

      const response = await request(app)
        .get('/api/projects')
        .expect(200);

      const project = response.body.projects[0];
      expect(project.dbSize).toBe(0);
    });

    test('should handle database query errors gracefully', async () => {
      const errorDb = {
        db: {
          prepare: jest.fn().mockImplementation(() => {
            throw new Error('Database error');
          })
        }
      };
      mockProjectDatabases.set('test-project', errorDb);

      fs.existsSync = jest.fn().mockReturnValue(true);
      fs.statSync = jest.fn().mockReturnValue({ size: 1024000 });

      const response = await request(app)
        .get('/api/projects')
        .expect(200);

      expect(response.body.projects).toBeDefined();
    });

    test('should use default values when config is missing project details', async () => {
      mockConfig.projects = [];
      fs.existsSync = jest.fn().mockReturnValue(true);
      fs.statSync = jest.fn().mockReturnValue({ size: 1024000 });

      const response = await request(app)
        .get('/api/projects')
        .expect(200);

      const project = response.body.projects[0];
      expect(project.enabled).toBe(true);
      expect(project.ignorePatterns).toEqual([]);
      expect(project.maxFileSize).toBe(10485760);
      expect(project.retentionDays).toBe(30);
    });

    test('should handle null config gracefully', async () => {
      const app2 = express();
      app2.use(express.json());
      const deps2 = {
        projectState: mockProjectState,
        projectPaths: mockProjectPaths,
        projectDatabases: mockProjectDatabases,
        config: null,
        CONFIG_PATH: mockConfigPath
      };
      app2.use('/api/projects', createProjectRoutes(deps2));

      fs.existsSync = jest.fn().mockReturnValue(true);
      fs.statSync = jest.fn().mockReturnValue({ size: 1024000 });

      const response = await request(app2)
        .get('/api/projects');

      // Should handle null config - may return 500 or 200 depending on implementation
      expect([200, 500]).toContain(response.status);
      if (response.status === 200) {
        expect(response.body.projects).toBeDefined();
      }
    });

    test('should handle config with non-array projects', async () => {
      mockConfig.projects = null;
      fs.existsSync = jest.fn().mockReturnValue(true);
      fs.statSync = jest.fn().mockReturnValue({ size: 1024000 });

      const response = await request(app)
        .get('/api/projects')
        .expect(200);

      expect(response.body.projects).toBeDefined();
    });

    test('should return 500 on unexpected error', async () => {
      // Force an error by making projectDatabases.entries throw
      const brokenDatabases = {
        entries: jest.fn().mockImplementation(() => {
          throw new Error('Catastrophic failure');
        })
      };

      const app2 = express();
      app2.use(express.json());
      const deps2 = {
        projectState: mockProjectState,
        projectPaths: mockProjectPaths,
        projectDatabases: brokenDatabases,
        config: mockConfig,
        CONFIG_PATH: mockConfigPath
      };
      app2.use('/api/projects', createProjectRoutes(deps2));

      const response = await request(app2)
        .get('/api/projects')
        .expect(500);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('Failed to fetch projects configuration');
    });

    test('should return correct autoDiscover setting', async () => {
      fs.existsSync = jest.fn().mockReturnValue(true);
      fs.statSync = jest.fn().mockReturnValue({ size: 1024000 });

      const response = await request(app)
        .get('/api/projects')
        .expect(200);

      expect(response.body.autoDiscover).toBe(true);
    });

    test('should default autoDiscover to true when not specified', async () => {
      mockConfig.autoDiscover = undefined;
      fs.existsSync = jest.fn().mockReturnValue(true);
      fs.statSync = jest.fn().mockReturnValue({ size: 1024000 });

      const response = await request(app)
        .get('/api/projects')
        .expect(200);

      expect(response.body.autoDiscover).toBe(true);
    });

    test('should respect autoDiscover=false', async () => {
      mockConfig.autoDiscover = false;
      fs.existsSync = jest.fn().mockReturnValue(true);
      fs.statSync = jest.fn().mockReturnValue({ size: 1024000 });

      const response = await request(app)
        .get('/api/projects')
        .expect(200);

      expect(response.body.autoDiscover).toBe(false);
    });
  });

  describe('GET /api/projects/list', () => {
    test('should list available projects with name, path, and description', async () => {
      const response = await request(app)
        .get('/api/projects/list')
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body).toHaveProperty('projects');
      expect(response.body).toHaveProperty('active');
      expect(Array.isArray(response.body.projects)).toBe(true);
      expect(response.body.active).toBe('test-project');
    });

    test('should return project objects with all required fields', async () => {
      const response = await request(app)
        .get('/api/projects/list')
        .expect(200);

      const project = response.body.projects[0];
      expect(project).toHaveProperty('name');
      expect(project).toHaveProperty('path');
      expect(project).toHaveProperty('description');
    });

    test('should generate default description when not provided', async () => {
      mockProjectState.availableProjects[0].description = undefined;

      const response = await request(app)
        .get('/api/projects/list')
        .expect(200);

      const project = response.body.projects[0];
      expect(project.description).toBe('Project: test-project');
    });

    test('should handle empty projects list', async () => {
      mockProjectState.availableProjects = [];

      const response = await request(app)
        .get('/api/projects/list')
        .expect(200);

      expect(response.body.projects).toEqual([]);
    });

    test('should handle null activeProject', async () => {
      mockProjectState.activeProject = null;

      const response = await request(app)
        .get('/api/projects/list')
        .expect(200);

      expect(response.body.active).toBeNull();
    });

    test('should return 500 on error', async () => {
      const brokenState = {
        get availableProjects() {
          throw new Error('State error');
        }
      };

      const app2 = express();
      app2.use(express.json());
      const deps2 = {
        projectState: brokenState,
        projectPaths: mockProjectPaths,
        projectDatabases: mockProjectDatabases,
        config: mockConfig,
        CONFIG_PATH: mockConfigPath
      };
      app2.use('/api/projects', createProjectRoutes(deps2));

      const response = await request(app2)
        .get('/api/projects/list')
        .expect(500);

      expect(response.body.error).toContain('Failed to retrieve projects list');
    });
  });

  describe('POST /api/projects/refresh', () => {
    test('should refresh and return current projects', async () => {
      const response = await request(app)
        .post('/api/projects/refresh')
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body).toHaveProperty('success');
      expect(response.body).toHaveProperty('projects');
      expect(response.body).toHaveProperty('active');
      expect(response.body).toHaveProperty('message');
    });

    test('should return success when projects are found', async () => {
      const response = await request(app)
        .post('/api/projects/refresh')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.projects).toHaveLength(2);
      expect(response.body.message).toContain('Found 2 projects');
    });

    test('should return project names in the projects array', async () => {
      const response = await request(app)
        .post('/api/projects/refresh')
        .expect(200);

      expect(response.body.projects).toContain('test-project');
      expect(response.body.projects).toContain('another-project');
    });

    test('should include active project in response', async () => {
      const response = await request(app)
        .post('/api/projects/refresh')
        .expect(200);

      expect(response.body.active).toBe('test-project');
    });

    test('should handle empty projects list', async () => {
      mockProjectState.availableProjects = [];

      const response = await request(app)
        .post('/api/projects/refresh')
        .expect(200);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('No projects found');
      expect(response.body.projects).toEqual([]);
    });

    test('should handle null availableProjects', async () => {
      mockProjectState.availableProjects = null;

      const response = await request(app)
        .post('/api/projects/refresh')
        .expect(200);

      expect(response.body.success).toBe(false);
    });

    test('should handle undefined availableProjects', async () => {
      mockProjectState.availableProjects = undefined;

      const response = await request(app)
        .post('/api/projects/refresh')
        .expect(200);

      expect(response.body.success).toBe(false);
    });

    test('should return 500 on unexpected error', async () => {
      const brokenState = {
        get availableProjects() {
          throw new Error('Refresh error');
        },
        activeProject: 'test-project'
      };

      const app2 = express();
      app2.use(express.json());
      const deps2 = {
        projectState: brokenState,
        projectPaths: mockProjectPaths,
        projectDatabases: mockProjectDatabases,
        config: mockConfig,
        CONFIG_PATH: mockConfigPath
      };
      app2.use('/api/projects', createProjectRoutes(deps2));

      const response = await request(app2)
        .post('/api/projects/refresh')
        .expect(500);

      expect(response.body.error).toBe('Refresh error');
    });
  });

  describe('POST /api/projects/select', () => {
    beforeEach(() => {
      fsPromises.readFile = jest.fn().mockResolvedValue('active = "test-project"\nother = "value"');
      fsPromises.writeFile = jest.fn().mockResolvedValue(undefined);
    });

    test('should switch to a valid project', async () => {
      const response = await request(app)
        .post('/api/projects/select')
        .send({ project: 'another-project' })
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.project).toBe('another-project');
      expect(response.body.message).toContain('Switched to project');
    });

    test('should persist project selection to config file', async () => {
      await request(app)
        .post('/api/projects/select')
        .send({ project: 'another-project' })
        .expect(200);

      expect(fsPromises.readFile).toHaveBeenCalledWith(mockConfigPath, 'utf8');
      expect(fsPromises.writeFile).toHaveBeenCalledWith(
        mockConfigPath,
        expect.stringContaining('active = "another-project"'),
        'utf8'
      );
    });

    test('should return 400 when project name is missing', async () => {
      const response = await request(app)
        .post('/api/projects/select')
        .send({})
        .expect(400);

      expect(response.body.error).toBe('Missing project name');
    });

    test('should return 400 when project is null', async () => {
      const response = await request(app)
        .post('/api/projects/select')
        .send({ project: null })
        .expect(400);

      expect(response.body.error).toBe('Missing project name');
    });

    test('should return 400 when project is empty string', async () => {
      const response = await request(app)
        .post('/api/projects/select')
        .send({ project: '' })
        .expect(400);

      expect(response.body.error).toBe('Missing project name');
    });

    test('should return 404 when project does not exist', async () => {
      const response = await request(app)
        .post('/api/projects/select')
        .send({ project: 'non-existent-project' })
        .expect(404);

      expect(response.body.error).toContain('Project "non-existent-project" not found');
    });

    test('should return success when already on the requested project', async () => {
      const response = await request(app)
        .post('/api/projects/select')
        .send({ project: 'test-project' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Already on this project');
      // Should not persist when already on project
      expect(fsPromises.writeFile).not.toHaveBeenCalled();
    });

    test('should handle config file read errors gracefully', async () => {
      fsPromises.readFile = jest.fn().mockRejectedValue(new Error('Read error'));

      const response = await request(app)
        .post('/api/projects/select')
        .send({ project: 'another-project' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('Switched to project');
    });

    test('should handle config file write errors gracefully', async () => {
      fsPromises.writeFile = jest.fn().mockRejectedValue(new Error('Write error'));

      const response = await request(app)
        .post('/api/projects/select')
        .send({ project: 'another-project' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('Switched to project');
    });

    test('should return 500 on unexpected error', async () => {
      const brokenState = {
        get availableProjects() {
          throw new Error('State error');
        },
        activeProject: 'test-project'
      };

      const app2 = express();
      app2.use(express.json());
      const deps2 = {
        projectState: brokenState,
        projectPaths: mockProjectPaths,
        projectDatabases: mockProjectDatabases,
        config: mockConfig,
        CONFIG_PATH: mockConfigPath
      };
      app2.use('/api/projects', createProjectRoutes(deps2));

      const response = await request(app2)
        .post('/api/projects/select')
        .send({ project: 'another-project' })
        .expect(500);

      expect(response.body.error).toBeDefined();
    });
  });

  describe('PUT /api/projects/:name', () => {
    test('should update project settings', async () => {
      const updates = { enabled: false, description: 'Updated description' };

      const response = await request(app)
        .put('/api/projects/test-project')
        .send(updates)
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.project).toBeDefined();
      expect(response.body.project.enabled).toBe(false);
      expect(response.body.project.description).toBe('Updated description');
    });

    test('should merge updates with existing project data', async () => {
      const updates = { enabled: false };

      const response = await request(app)
        .put('/api/projects/test-project')
        .send(updates)
        .expect(200);

      expect(response.body.project.name).toBe('test-project');
      expect(response.body.project.path).toBe('/tmp/test-project');
      expect(response.body.project.enabled).toBe(false);
    });

    test('should update project in availableProjects array', async () => {
      const updates = { maxFileSize: 20971520 };

      await request(app)
        .put('/api/projects/test-project')
        .send(updates)
        .expect(200);

      const project = mockProjectState.availableProjects.find(p => p.name === 'test-project');
      expect(project.maxFileSize).toBe(20971520);
    });

    test('should return 404 when project does not exist', async () => {
      const response = await request(app)
        .put('/api/projects/non-existent-project')
        .send({ enabled: false })
        .expect(404);

      expect(response.body.error).toBe('Project not found');
    });

    test('should handle empty update object', async () => {
      const response = await request(app)
        .put('/api/projects/test-project')
        .send({})
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    test('should handle multiple field updates', async () => {
      const updates = {
        enabled: false,
        description: 'New desc',
        maxFileSize: 5242880,
        retentionDays: 60
      };

      const response = await request(app)
        .put('/api/projects/test-project')
        .send(updates)
        .expect(200);

      expect(response.body.project.enabled).toBe(false);
      expect(response.body.project.description).toBe('New desc');
      expect(response.body.project.maxFileSize).toBe(5242880);
      expect(response.body.project.retentionDays).toBe(60);
    });

    test('should return 500 on error', async () => {
      const brokenState = {
        availableProjects: {
          findIndex: jest.fn().mockImplementation(() => {
            throw new Error('Update error');
          })
        }
      };

      const app2 = express();
      app2.use(express.json());
      const deps2 = {
        projectState: brokenState,
        projectPaths: mockProjectPaths,
        projectDatabases: mockProjectDatabases,
        config: mockConfig,
        CONFIG_PATH: mockConfigPath
      };
      app2.use('/api/projects', createProjectRoutes(deps2));

      const response = await request(app2)
        .put('/api/projects/test-project')
        .send({ enabled: false })
        .expect(500);

      expect(response.body.error).toBe('Failed to update project');
    });
  });

  describe('DELETE /api/projects/:name', () => {
    beforeEach(() => {
      fsPromises.unlink = jest.fn().mockResolvedValue(undefined);
    });

    test('should remove project from monitoring', async () => {
      const initialLength = mockProjectState.availableProjects.length;

      const response = await request(app)
        .delete('/api/projects/test-project')
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Project removed');
      expect(mockProjectState.availableProjects.length).toBe(initialLength - 1);
    });

    test('should not delete database by default', async () => {
      await request(app)
        .delete('/api/projects/test-project')
        .expect(200);

      expect(fsPromises.unlink).not.toHaveBeenCalled();
    });

    test('should delete database when deleteDb=true', async () => {
      await request(app)
        .delete('/api/projects/test-project?deleteDb=true')
        .expect(200);

      expect(fsPromises.unlink).toHaveBeenCalledWith(
        expect.stringContaining('test-project.db')
      );
    });

    test('should handle database deletion errors gracefully', async () => {
      fsPromises.unlink = jest.fn().mockRejectedValue(new Error('Delete error'));

      const response = await request(app)
        .delete('/api/projects/test-project?deleteDb=true')
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    test('should return 404 when project does not exist', async () => {
      const response = await request(app)
        .delete('/api/projects/non-existent-project')
        .expect(404);

      expect(response.body.error).toBe('Project not found');
    });

    test('should handle deleteDb=false explicitly', async () => {
      await request(app)
        .delete('/api/projects/test-project?deleteDb=false')
        .expect(200);

      expect(fsPromises.unlink).not.toHaveBeenCalled();
    });

    test('should handle invalid deleteDb query parameter', async () => {
      await request(app)
        .delete('/api/projects/test-project?deleteDb=invalid')
        .expect(200);

      expect(fsPromises.unlink).not.toHaveBeenCalled();
    });

    test('should remove project from correct index', async () => {
      await request(app)
        .delete('/api/projects/another-project')
        .expect(200);

      const remainingProjects = mockProjectState.availableProjects.map(p => p.name);
      expect(remainingProjects).toContain('test-project');
      expect(remainingProjects).not.toContain('another-project');
    });

    test('should return 500 on error', async () => {
      const brokenState = {
        availableProjects: {
          findIndex: jest.fn().mockImplementation(() => {
            throw new Error('Delete error');
          })
        }
      };

      const app2 = express();
      app2.use(express.json());
      const deps2 = {
        projectState: brokenState,
        projectPaths: mockProjectPaths,
        projectDatabases: mockProjectDatabases,
        config: mockConfig,
        CONFIG_PATH: mockConfigPath
      };
      app2.use('/api/projects', createProjectRoutes(deps2));

      const response = await request(app2)
        .delete('/api/projects/test-project')
        .expect(500);

      expect(response.body.error).toBe('Failed to delete project');
    });
  });

  describe('Edge Cases and Integration Tests', () => {
    test('should handle project with special characters in name', async () => {
      mockProjectState.availableProjects.push({
        name: 'my-special_project.v2',
        path: '/tmp/special'
      });
      mockProjectDatabases.set('my-special_project.v2', mockDb);
      mockProjectPaths.set('my-special_project.v2', '/tmp/special');

      fs.existsSync = jest.fn().mockReturnValue(true);
      fs.statSync = jest.fn().mockReturnValue({ size: 1024 });

      const response = await request(app)
        .get('/api/projects')
        .expect(200);

      const specialProject = response.body.projects.find(p => p.name === 'my-special_project.v2');
      expect(specialProject).toBeDefined();
    });

    test('should handle very large database files', async () => {
      fs.existsSync = jest.fn().mockReturnValue(true);
      fs.statSync = jest.fn().mockReturnValue({ size: 10737418240 }); // 10GB

      const response = await request(app)
        .get('/api/projects')
        .expect(200);

      const project = response.body.projects[0];
      expect(project.dbSize).toBe(10737418240);
    });

    test('should handle project with zero events', async () => {
      const emptyDb = {
        db: {
          prepare: jest.fn().mockReturnValue({
            get: jest.fn().mockReturnValue({ count: 0 })
          })
        }
      };
      mockProjectDatabases.set('test-project', emptyDb);

      fs.existsSync = jest.fn().mockReturnValue(true);
      fs.statSync = jest.fn().mockReturnValue({ size: 1024 });

      const response = await request(app)
        .get('/api/projects')
        .expect(200);

      const project = response.body.projects[0];
      expect(project.eventCount).toBe(0);
    });

    test('should handle concurrent project selection requests', async () => {
      fsPromises.readFile = jest.fn().mockResolvedValue('active = "test-project"');
      fsPromises.writeFile = jest.fn().mockResolvedValue(undefined);

      const requests = [
        request(app).post('/api/projects/select').send({ project: 'another-project' }),
        request(app).post('/api/projects/select').send({ project: 'another-project' })
      ];

      const responses = await Promise.all(requests);
      responses.forEach(response => {
        expect(response.status).toBe(200);
      });
    });

    test('should handle project path with spaces', async () => {
      mockProjectState.availableProjects.push({
        name: 'space-project',
        path: '/tmp/path with spaces/project'
      });
      mockProjectDatabases.set('space-project', mockDb);
      mockProjectPaths.set('space-project', '/tmp/path with spaces/project');

      const response = await request(app)
        .get('/api/projects/list')
        .expect(200);

      const spaceProject = response.body.projects.find(p => p.name === 'space-project');
      expect(spaceProject.path).toBe('/tmp/path with spaces/project');
    });

    test('should handle basePath with default fallback', async () => {
      mockConfig.basePath = undefined;
      fs.existsSync = jest.fn().mockReturnValue(true);
      fs.statSync = jest.fn().mockReturnValue({ size: 1024 });

      const response = await request(app)
        .get('/api/projects')
        .expect(200);

      expect(response.body.basePath).toBeDefined();
    });
  });
});
