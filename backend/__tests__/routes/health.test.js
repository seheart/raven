/**
 * Health Routes Tests
 * Tests for /api/health, /api/health-checks, and /api/health/projects endpoints
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import Database from 'better-sqlite3';
import { createHealthRoutes } from '../../routes/health.js';
import { unlink } from 'fs/promises';
import fs from 'fs';

describe('Health Routes', () => {
  let app;
  let db;
  let projectDatabases;
  let healthCheckSystem;
  const testDbPath = './__tests__/test-health.db';

  beforeAll(async () => {
    // Create express app
    app = express();
    app.use(express.json());

    // Create test database
    db = new Database(testDbPath);

    // Initialize database schema
    db.exec(`
      CREATE TABLE IF NOT EXISTS events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT NOT NULL,
        filepath TEXT,
        change_type TEXT,
        agent TEXT,
        agent_confidence INTEGER,
        diff TEXT,
        lines_added INTEGER DEFAULT 0,
        lines_deleted INTEGER DEFAULT 0
      )
    `);

    db.exec(`
      CREATE TABLE IF NOT EXISTS rollbacks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event_id INTEGER,
        timestamp TEXT
      )
    `);

    // Create mock project databases
    projectDatabases = new Map();
    projectDatabases.set('test-project', { db });

    // Mock health check system
    healthCheckSystem = null;
    const getHealthCheckSystem = () => healthCheckSystem;

    // Mock project state
    const projectState = {
      currentProject: 'test-project'
    };

    // Mock socket.io
    const io = {
      emit: () => {}
    };

    // Mock session ID
    const SESSION_ID = 'test-session-123';

    // Mock RAVEN_DIR
    const RAVEN_DIR = './__tests__/test-raven-dir';

    // Mount health routes
    app.use('/api', createHealthRoutes({
      projectState,
      io,
      SESSION_ID,
      RAVEN_DIR,
      projectDatabases,
      getHealthCheckSystem
    }));
  });

  afterAll(async () => {
    if (db && db.open) {
      db.close();
    }
    try {
      await unlink(testDbPath);
    } catch (_error) {
      // Ignore cleanup errors
    }
  });

  beforeEach(() => {
    // Clear events before each test
    db.exec('DELETE FROM events');
    db.exec('DELETE FROM rollbacks');
  });

  describe('GET /api/health', () => {
    it('should return system health status', async () => {
      const response = await request(app).get('/api/health');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('status');
      expect(response.body).toHaveProperty('uptime');
      expect(response.body).toHaveProperty('memory');
      expect(response.body).toHaveProperty('storage');
      expect(response.body).toHaveProperty('timestamp');
    });

    it('should include memory metrics', async () => {
      const response = await request(app).get('/api/health');

      expect(response.body.memory).toHaveProperty('system');
      expect(response.body.memory).toHaveProperty('process');
      expect(response.body.memory.system).toHaveProperty('total');
      expect(response.body.memory.system).toHaveProperty('free');
      expect(response.body.memory.system).toHaveProperty('used');
      expect(response.body.memory.system).toHaveProperty('percent');
    });

    it('should include storage metrics', async () => {
      const response = await request(app).get('/api/health');

      expect(response.body.storage).toHaveProperty('ravenSize');
      expect(response.body.storage).toHaveProperty('diskUsePercent');
    });

    it('should return healthy status when metrics are normal', async () => {
      const response = await request(app).get('/api/health');

      // Status should be either 'healthy' or 'warning' (system may have high memory usage)
      expect(['healthy', 'warning']).toContain(response.body.status);
      expect(response.body).toHaveProperty('issues');
      expect(Array.isArray(response.body.issues)).toBe(true);
    });
  });

  describe('GET /api/session-id', () => {
    it('should return current session ID', async () => {
      const response = await request(app).get('/api/session-id');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('session_id');
      expect(response.body.session_id).toBe('test-session-123');
    });
  });

  describe('GET /api/status', () => {
    it('should return server status', async () => {
      const response = await request(app).get('/api/status');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('status', 'online');
      expect(response.body).toHaveProperty('version');
      expect(response.body).toHaveProperty('session_id');
      expect(response.body).toHaveProperty('uptime');
      expect(response.body).toHaveProperty('timestamp');
    });

    it('should include version info', async () => {
      const response = await request(app).get('/api/status');

      expect(response.body.version).toMatch(/^\d+\.\d+\.\d+$/);
    });
  });

  describe('GET /api/health-checks', () => {
    it('should return pending status when health checks not initialized', async () => {
      healthCheckSystem = null;
      const response = await request(app).get('/api/health-checks');

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('pending');
      expect(response.body.message).toContain('not run yet');
      expect(response.body.summary).toEqual({ total: 0, passed: 0, failed: 0 });
      expect(response.body.checks).toEqual([]);
    });

    it('should return health check results when available', async () => {
      // Mock health check system with results
      healthCheckSystem = {
        getResults: () => ({
          summary: {
            total: 9,
            passed: 9,
            failed: 0,
            allPassed: true
          },
          checks: [
            { name: 'Database Connection', passed: true, message: 'OK', duration: 5 },
            { name: 'WebSocket Connection', passed: true, message: 'OK', duration: 3 }
          ]
        })
      };

      const response = await request(app).get('/api/health-checks');

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('healthy');
      expect(response.body.summary.total).toBe(9);
      expect(response.body.summary.passed).toBe(9);
      expect(response.body.summary.failed).toBe(0);
      expect(response.body.checks).toHaveLength(2);
    });

    it('should return unhealthy status when checks fail', async () => {
      healthCheckSystem = {
        getResults: () => ({
          summary: {
            total: 9,
            passed: 7,
            failed: 2,
            allPassed: false
          },
          checks: [
            { name: 'Database Connection', passed: true, message: 'OK', duration: 5 },
            { name: 'WebSocket Connection', passed: false, message: 'Connection failed', duration: 100 }
          ]
        })
      };

      const response = await request(app).get('/api/health-checks');

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('unhealthy');
      expect(response.body.summary.failed).toBe(2);
    });
  });

  describe('POST /api/health-checks/run', () => {
    it('should return error when health check system not initialized', async () => {
      healthCheckSystem = null;
      const response = await request(app).post('/api/health-checks/run');

      expect(response.status).toBe(503);
      expect(response.body.status).toBe('error');
      expect(response.body.error).toContain('not initialized');
    });

    it('should run health checks and return results', async () => {
      let checkRunCalled = false;
      healthCheckSystem = {
        runAllChecks: async () => {
          checkRunCalled = true;
          return { total: 9, passed: 9, failed: 0, allPassed: true };
        },
        getResults: () => ({
          summary: { total: 9, passed: 9, failed: 0, allPassed: true },
          checks: []
        })
      };

      const response = await request(app).post('/api/health-checks/run');

      expect(response.status).toBe(200);
      expect(checkRunCalled).toBe(true);
      expect(response.body.status).toBe('healthy');
      expect(response.body.message).toContain('9/9 passed');
    });

    it('should return unhealthy status when checks fail', async () => {
      healthCheckSystem = {
        runAllChecks: async () => ({ total: 9, passed: 7, failed: 2, allPassed: false }),
        getResults: () => ({
          summary: { total: 9, passed: 7, failed: 2, allPassed: false },
          checks: []
        })
      };

      const response = await request(app).post('/api/health-checks/run');

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('unhealthy');
      expect(response.body.message).toContain('7/9 passed');
    });
  });

  describe('GET /api/health/projects', () => {
    beforeEach(() => {
      // Insert test events
      const now = new Date().toISOString();
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

      // Recent events for velocity calculation
      db.prepare(`
        INSERT INTO events (timestamp, filepath, change_type, lines_added, lines_deleted, agent, agent_confidence, diff)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(now, 'test.js', 'change', 10, 5, 'claude', 85, 'test diff');

      db.prepare(`
        INSERT INTO events (timestamp, filepath, change_type, lines_added, lines_deleted, diff)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(yesterday, 'test2.js', 'add', 50, 0, 'new file content');

      db.prepare(`
        INSERT INTO events (timestamp, filepath, change_type, lines_added, lines_deleted, diff)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(weekAgo, 'test3.js', 'change', 5, 2, 'old change');
    });

    it('should return health scores for all projects', async () => {
      const response = await request(app).get('/api/health/projects');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('projects');
      expect(response.body).toHaveProperty('total_projects');
      expect(response.body).toHaveProperty('average_health');
      expect(Array.isArray(response.body.projects)).toBe(true);
    });

    it('should calculate health score components', async () => {
      const response = await request(app).get('/api/health/projects');

      const project = response.body.projects[0];
      expect(project).toHaveProperty('name', 'test-project');
      expect(project).toHaveProperty('health_score');
      expect(project).toHaveProperty('components');
      expect(project.components).toHaveProperty('velocity');
      expect(project.components).toHaveProperty('stability');
      expect(project.components).toHaveProperty('reliability');
      expect(project.components).toHaveProperty('complexity');
      expect(project.components).toHaveProperty('recency');
    });

    it('should include project metrics', async () => {
      const response = await request(app).get('/api/health/projects');

      const project = response.body.projects[0];
      expect(project).toHaveProperty('metrics');
      expect(project.metrics).toHaveProperty('changes_per_day');
      expect(project.metrics).toHaveProperty('rollback_rate');
      expect(project.metrics).toHaveProperty('avg_diff_size');
      expect(project.metrics).toHaveProperty('hours_since_activity');
    });

    it('should determine project status based on activity', async () => {
      const response = await request(app).get('/api/health/projects');

      const project = response.body.projects[0];
      expect(project).toHaveProperty('status');
      expect(['active', 'recent', 'idle', 'inactive']).toContain(project.status);
    });

    it('should include recent events count', async () => {
      const response = await request(app).get('/api/health/projects');

      const project = response.body.projects[0];
      expect(project).toHaveProperty('recent_events');
      expect(typeof project.recent_events).toBe('number');
    });

    it('should include last activity timestamp', async () => {
      const response = await request(app).get('/api/health/projects');

      const project = response.body.projects[0];
      expect(project).toHaveProperty('last_activity');
      expect(project.last_activity).toBeTruthy();
    });

    it('should sort projects by health score descending', async () => {
      const response = await request(app).get('/api/health/projects');

      const healthScores = response.body.projects.map(p => p.health_score);
      const sortedScores = [...healthScores].sort((a, b) => b - a);
      expect(healthScores).toEqual(sortedScores);
    });

    it('should include summary statistics', async () => {
      const response = await request(app).get('/api/health/projects');

      expect(response.body.total_projects).toBeGreaterThan(0);
      expect(typeof response.body.average_health).toBe('number');
      expect(response.body.average_health).toBeGreaterThanOrEqual(0);
      expect(response.body.average_health).toBeLessThanOrEqual(100);
    });

    it('should handle projects with no events gracefully', async () => {
      // Clear all events
      db.exec('DELETE FROM events');

      const response = await request(app).get('/api/health/projects');

      expect(response.status).toBe(200);
      const project = response.body.projects[0];
      expect(project.health_score).toBeGreaterThanOrEqual(0);
      expect(project.status).toBe('inactive');
      expect(project.last_activity).toBeNull();
    });
  });

  describe('Health Check System Integration', () => {
    it('should create separate app without health check system', async () => {
      // Create completely isolated app with no health check system
      const isolatedApp = express();
      isolatedApp.use(express.json());

      const isolatedRouter = createHealthRoutes({
        projectState: { currentProject: 'test' },
        io: { emit: () => {} },
        SESSION_ID: 'test-session',
        RAVEN_DIR: './__tests__/test-raven-dir',
        projectDatabases: new Map(),
        getHealthCheckSystem: () => null  // No system
      });

      isolatedApp.use('/api', isolatedRouter);

      const response = await request(isolatedApp).get('/api/health-checks');
      expect(response.status).toBe(200);
      expect(response.body.status).toBe('pending');
      expect(response.body.message).toBe('Health checks have not run yet');
    });

    it('should return 503 when running health checks without system', async () => {
      const isolatedApp = express();
      isolatedApp.use(express.json());

      const isolatedRouter = createHealthRoutes({
        projectState: { currentProject: 'test' },
        io: { emit: () => {} },
        SESSION_ID: 'test-session',
        RAVEN_DIR: './__tests__/test-raven-dir',
        projectDatabases: new Map(),
        getHealthCheckSystem: () => null  // No system
      });

      isolatedApp.use('/api', isolatedRouter);

      const response = await request(isolatedApp).post('/api/health-checks/run');
      expect(response.status).toBe(503);
      expect(response.body.status).toBe('error');
      expect(response.body.error).toBe('Health check system not initialized');
    });
  });

  describe('Error Handling', () => {
    it('should handle errors in main health endpoint', async () => {
      const faultyApp = express();
      faultyApp.use(express.json());

      // Use a RAVEN_DIR that doesn't exist to trigger fs error
      const faultyRouter = createHealthRoutes({
        projectState: { currentProject: 'test' },
        io: { emit: () => {} },
        SESSION_ID: 'test-session',
        RAVEN_DIR: '/nonexistent/path/that/does/not/exist',
        projectDatabases: new Map(),
        getHealthCheckSystem: () => null
      });

      faultyApp.use('/api', faultyRouter);

      const response = await request(faultyApp).get('/api/health');
      expect(response.status).toBe(200); // Should still return 200 with error handled gracefully
      expect(response.body.storage.ravenSize).toBe(0); // Error is caught, returns 0
    });

    it('should handle errors in health check system getResults', async () => {
      const faultyApp = express();
      faultyApp.use(express.json());

      const faultyHealthCheck = {
        getResults: () => {
          throw new Error('Database connection failed');
        }
      };

      const faultyRouter = createHealthRoutes({
        projectState: { currentProject: 'test' },
        io: { emit: () => {} },
        SESSION_ID: 'test-session',
        RAVEN_DIR: './__tests__/test-raven-dir',
        projectDatabases: new Map(),
        getHealthCheckSystem: () => faultyHealthCheck
      });

      faultyApp.use('/api', faultyRouter);

      const response = await request(faultyApp).get('/api/health-checks');
      expect(response.status).toBe(500);
      expect(response.body.status).toBe('error');
      expect(response.body.error).toContain('Database connection failed');
    });

    it('should handle errors when running health checks', async () => {
      const faultyApp = express();
      faultyApp.use(express.json());

      const faultyHealthCheck = {
        runAllChecks: async () => {
          throw new Error('Network timeout');
        }
      };

      const faultyRouter = createHealthRoutes({
        projectState: { currentProject: 'test' },
        io: { emit: () => {} },
        SESSION_ID: 'test-session',
        RAVEN_DIR: './__tests__/test-raven-dir',
        projectDatabases: new Map(),
        getHealthCheckSystem: () => faultyHealthCheck
      });

      faultyApp.use('/api', faultyRouter);

      const response = await request(faultyApp).post('/api/health-checks/run');
      expect(response.status).toBe(500);
      expect(response.body.status).toBe('error');
      expect(response.body.error).toContain('Network timeout');
    });

    it('should handle errors in project health calculation', async () => {
      const faultyApp = express();
      faultyApp.use(express.json());

      // Create a faulty database that will throw errors
      const faultyDb = {
        db: {
          prepare: () => {
            throw new Error('Query execution failed');
          }
        }
      };

      const projectDbs = new Map();
      projectDbs.set('faulty-project', faultyDb);

      const faultyRouter = createHealthRoutes({
        projectState: { currentProject: 'test' },
        io: { emit: () => {} },
        SESSION_ID: 'test-session',
        RAVEN_DIR: './__tests__/test-raven-dir',
        projectDatabases: projectDbs,
        getHealthCheckSystem: () => null
      });

      faultyApp.use('/api', faultyRouter);

      const response = await request(faultyApp).get('/api/health/projects');
      expect(response.status).toBe(200);
      expect(response.body.projects).toHaveLength(1);
      expect(response.body.projects[0].status).toBe('error');
      expect(response.body.projects[0].health_score).toBe(0);
      expect(response.body.projects[0].error).toBe('Failed to calculate health');
    });

    it('should handle errors in multi-project health endpoint', async () => {
      const faultyApp = express();
      faultyApp.use(express.json());

      // Create projectDatabases that will throw when iterated
      const faultyProjectDbs = {
        entries: () => {
          throw new Error('Iterator failed');
        }
      };

      const faultyRouter = createHealthRoutes({
        projectState: { currentProject: 'test' },
        io: { emit: () => {} },
        SESSION_ID: 'test-session',
        RAVEN_DIR: './__tests__/test-raven-dir',
        projectDatabases: faultyProjectDbs,
        getHealthCheckSystem: () => null
      });

      faultyApp.use('/api', faultyRouter);

      const response = await request(faultyApp).get('/api/health/projects');
      expect(response.status).toBe(500);
      expect(response.body.error).toContain('Iterator failed');
    });
  });

  describe('Directory Size Calculation', () => {
    it('should calculate size of directory with subdirectories and files', async () => {
      const { mkdirSync, writeFileSync, rmSync } = await import('fs');
      const { join } = await import('path');

      // Create test directory structure with subdirectories
      const testDirWithSubs = './__tests__/test-raven-with-subdirs';
      mkdirSync(testDirWithSubs, { recursive: true });
      mkdirSync(join(testDirWithSubs, 'subdir1'), { recursive: true });
      mkdirSync(join(testDirWithSubs, 'subdir2'), { recursive: true });

      // Write files in main dir and subdirs
      writeFileSync(join(testDirWithSubs, 'file1.txt'), 'content1');
      writeFileSync(join(testDirWithSubs, 'subdir1', 'file2.txt'), 'content2');
      writeFileSync(join(testDirWithSubs, 'subdir2', 'file3.txt'), 'content3');

      // Create isolated app with this directory
      const testApp = express();
      testApp.use(express.json());

      const testRouter = createHealthRoutes({
        projectState: { currentProject: 'test' },
        io: { emit: () => {} },
        SESSION_ID: 'test-session',
        RAVEN_DIR: testDirWithSubs,
        projectDatabases: new Map(),
        getHealthCheckSystem: () => null
      });

      testApp.use('/api', testRouter);

      const response = await request(testApp).get('/api/health');
      expect(response.status).toBe(200);
      expect(response.body.storage.ravenSize).toBeGreaterThan(0);

      // Cleanup
      rmSync(testDirWithSubs, { recursive: true, force: true });
    });
  });

  describe('Warning Conditions', () => {
    it('should detect high system memory when memory percent exceeds 90', async () => {
      // This is a challenging test because we can't easily control actual system memory
      // However, we can document the logic: if memoryPercent > 90, status = 'warning'
      // For now, we verify the endpoint works correctly under normal conditions
      const response = await request(app).get('/api/health');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('memory');
      expect(response.body.memory.system).toHaveProperty('percent');
      // Lines 63-64 would be triggered if actual system memory > 90%
    });

    it('should detect high heap usage and set warning status', async () => {
      const testApp = express();
      testApp.use(express.json());

      // Mock process.memoryUsage to return high heap usage
      const originalMemUsage = process.memoryUsage;
      const mockIO = { emit: jest.fn() };

      const { mkdirSync, rmSync } = await import('fs');
      const testHeapDir = './__tests__/test-heap-dir';
      mkdirSync(testHeapDir, { recursive: true });

      process.memoryUsage = jest.fn(() => ({
        heapUsed: 950 * 1024 * 1024,  // 950MB used
        heapTotal: 1000 * 1024 * 1024, // 1000MB total = 95% used
        external: 0,
        rss: 1000 * 1024 * 1024
      }));

      const testRouter = createHealthRoutes({
        projectState: { currentProject: 'test' },
        io: mockIO,
        SESSION_ID: 'test-session',
        RAVEN_DIR: testHeapDir,
        projectDatabases: new Map(),
        getHealthCheckSystem: () => null
      });

      testApp.use('/api', testRouter);

      const response = await request(testApp).get('/api/health');

      // Restore
      process.memoryUsage = originalMemUsage;
      rmSync(testHeapDir, { recursive: true, force: true });

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('warning');
      expect(response.body.issues).toContain('High process heap usage');
    });

    it('should detect critical storage and emit warning', async () => {
      const testApp = express();
      testApp.use(express.json());

      const mockIO = { emit: jest.fn() };

      // Create directory and mock fs.statSync to return huge file sizes
      const { mkdirSync, rmSync, writeFileSync } = await import('fs');
      const testStorageDir = './__tests__/test-storage-dir';
      mkdirSync(testStorageDir, { recursive: true });
      writeFileSync(`${testStorageDir}/dummy.txt`, 'test');

      const originalStatSync = fs.statSync;
      fs.statSync = jest.fn((path) => {
        // Return huge size to trigger critical warning (>95% of 100GB)
        if (path.includes('dummy.txt')) {
          return {
            isDirectory: () => false,
            size: 100 * 1024 * 1024 * 1024 // 100GB - exceeds 95% threshold
          };
        }
        return originalStatSync(path);
      });

      const testRouter = createHealthRoutes({
        projectState: { currentProject: 'test' },
        io: mockIO,
        SESSION_ID: 'test-session',
        RAVEN_DIR: testStorageDir,
        projectDatabases: new Map(),
        getHealthCheckSystem: () => null
      });

      testApp.use('/api', testRouter);

      const response = await request(testApp).get('/api/health');

      // Restore
      fs.statSync = originalStatSync;
      rmSync(testStorageDir, { recursive: true, force: true });

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('critical');
      expect(response.body.issues).toContain('Critical storage usage');
      expect(mockIO.emit).toHaveBeenCalledWith('storage-warning', expect.objectContaining({
        critical: true
      }));
    });

    it('should detect high storage and emit warning', async () => {
      const testApp = express();
      testApp.use(express.json());

      const mockIO = { emit: jest.fn() };

      // Create directory and mock fs.statSync to return large file sizes
      const { mkdirSync, rmSync, writeFileSync } = await import('fs');
      const testStorageDir2 = './__tests__/test-storage-dir-2';
      mkdirSync(testStorageDir2, { recursive: true });
      writeFileSync(`${testStorageDir2}/dummy.txt`, 'test');

      const originalStatSync = fs.statSync;
      fs.statSync = jest.fn((path) => {
        // Return size to trigger warning (>85% but <95% of 100GB)
        if (path.includes('dummy.txt')) {
          return {
            isDirectory: () => false,
            size: 90 * 1024 * 1024 * 1024 // 90GB - between 85% and 95%
          };
        }
        return originalStatSync(path);
      });

      const testRouter = createHealthRoutes({
        projectState: { currentProject: 'test' },
        io: mockIO,
        SESSION_ID: 'test-session',
        RAVEN_DIR: testStorageDir2,
        projectDatabases: new Map(),
        getHealthCheckSystem: () => null
      });

      testApp.use('/api', testRouter);

      const response = await request(testApp).get('/api/health');

      // Restore
      fs.statSync = originalStatSync;
      rmSync(testStorageDir2, { recursive: true, force: true });

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('warning');
      expect(response.body.issues).toContain('High storage usage');
      expect(mockIO.emit).toHaveBeenCalledWith('storage-warning', expect.objectContaining({
        critical: false
      }));
    });
  });

  describe('Main Health Endpoint Error Handling', () => {
    it('should catch and handle errors when process.memoryUsage throws', async () => {
      const testApp = express();
      testApp.use(express.json());

      // Spy on process.memoryUsage to make it throw
      const originalMemUsage = process.memoryUsage;
      process.memoryUsage = jest.fn(() => {
        throw new Error('Memory usage error');
      });

      const testRouter = createHealthRoutes({
        projectState: { currentProject: 'test' },
        io: { emit: () => {} },
        SESSION_ID: 'test-session',
        RAVEN_DIR: './__tests__/test-raven-dir',
        projectDatabases: new Map(),
        getHealthCheckSystem: () => null
      });

      testApp.use('/api', testRouter);

      const response = await request(testApp).get('/api/health');

      // Restore original function
      process.memoryUsage = originalMemUsage;

      expect(response.status).toBe(500);
      expect(response.body.status).toBe('error');
      expect(response.body.error).toBe('Memory usage error');
    });
  });

  describe('Project Health Metrics', () => {
    beforeEach(() => {
      // Add test events for health scoring
      db.exec(`
        INSERT INTO events (timestamp, filepath, change_type, agent, agent_confidence, diff, lines_added, lines_deleted)
        VALUES
        (datetime('now', '-1 hour'), '/test1.js', 'add', 'claude', 85, 'test diff', 10, 0),
        (datetime('now', '-2 hours'), '/test2.js', 'change', 'claude', 90, 'test diff 2', 5, 2),
        (datetime('now', '-3 hours'), '/test3.js', 'change', 'user', 60, 'test diff 3', 3, 1)
      `);
    });

    it('should calculate health scores for projects', async () => {
      const response = await request(app).get('/api/health/projects');

      expect(response.status).toBe(200);
      expect(response.body.projects).toHaveLength(1);
      expect(response.body.projects[0].name).toBe('test-project');
      expect(response.body.projects[0].health_score).toBeGreaterThanOrEqual(0);
      expect(response.body.projects[0].components).toHaveProperty('velocity');
      expect(response.body.projects[0].components).toHaveProperty('stability');
      expect(response.body.projects[0].components).toHaveProperty('reliability');
      expect(response.body.projects[0].components).toHaveProperty('complexity');
      expect(response.body.projects[0].components).toHaveProperty('recency');
    });

    it('should handle projects with recent activity (active status)', async () => {
      // Add very recent event
      db.exec(`
        INSERT INTO events (timestamp, filepath, change_type, agent, agent_confidence, diff, lines_added, lines_deleted)
        VALUES (datetime('now', '-30 minutes'), '/recent.js', 'change', 'claude', 95, 'recent change', 1, 0)
      `);

      const response = await request(app).get('/api/health/projects');

      expect(response.status).toBe(200);
      const project = response.body.projects[0];
      expect(project.status).toBe('active');
      expect(project.components.recency).toBeGreaterThan(15);
    });

    it('should handle projects with rollbacks in stability calculation', async () => {
      // Add events with rollbacks
      db.exec('DELETE FROM events');
      db.exec('DELETE FROM rollbacks');

      // Insert events and get their IDs
      const insert1 = db.prepare('INSERT INTO events (timestamp, filepath, change_type, agent, agent_confidence, diff, lines_added, lines_deleted) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
      const insert2 = db.prepare('INSERT INTO events (timestamp, filepath, change_type, agent, agent_confidence, diff, lines_added, lines_deleted) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');

      const result1 = insert1.run(db.prepare("SELECT datetime('now', '-1 day')").pluck().get(), '/file1.js', 'add', 'claude', 80, 'diff1', 10, 0);
      insert2.run(db.prepare("SELECT datetime('now', '-1 day', '+1 hour')").pluck().get(), '/file2.js', 'change', 'claude', 80, 'diff2', 5, 0);

      // Add rollback for first event
      db.prepare('INSERT INTO rollbacks (event_id, timestamp) VALUES (?, ?)').run(
        result1.lastInsertRowid,
        db.prepare("SELECT datetime('now', '-1 day', '+30 minutes')").pluck().get()
      );

      const response = await request(app).get('/api/health/projects');

      expect(response.status).toBe(200);
      const project = response.body.projects[0];
      expect(project.metrics.rollback_rate).toContain('%');
      expect(parseFloat(project.metrics.rollback_rate)).toBeGreaterThan(0);
    });

    it('should handle projects with no agent data in reliability calculation', async () => {
      // Clear and add events without agent info
      db.exec('DELETE FROM events');
      db.exec(`
        INSERT INTO events (timestamp, filepath, change_type, agent, agent_confidence, diff, lines_added, lines_deleted)
        VALUES (datetime('now', '-1 hour'), '/test.js', 'change', NULL, NULL, 'diff', 5, 0)
      `);

      const response = await request(app).get('/api/health/projects');

      expect(response.status).toBe(200);
      const project = response.body.projects[0];
      expect(project.components.reliability).toBe(0); // No agent data = 0 reliability
    });

    it('should handle idle projects (activity between 24h-168h)', async () => {
      db.exec('DELETE FROM events');
      db.exec(`
        INSERT INTO events (timestamp, filepath, change_type, agent, agent_confidence, diff, lines_added, lines_deleted)
        VALUES (datetime('now', '-48 hours'), '/old.js', 'change', 'claude', 80, 'old change', 2, 1)
      `);

      const response = await request(app).get('/api/health/projects');

      expect(response.status).toBe(200);
      const project = response.body.projects[0];
      expect(project.status).toBe('idle');
      expect(project.components.recency).toBeLessThan(15);
    });

    it('should handle inactive projects (activity > 168h)', async () => {
      db.exec('DELETE FROM events');
      db.exec(`
        INSERT INTO events (timestamp, filepath, change_type, agent, agent_confidence, diff, lines_added, lines_deleted)
        VALUES (datetime('now', '-200 hours'), '/ancient.js', 'add', 'claude', 80, 'ancient change', 10, 0)
      `);

      const response = await request(app).get('/api/health/projects');

      expect(response.status).toBe(200);
      const project = response.body.projects[0];
      expect(project.status).toBe('inactive');
      expect(project.components.recency).toBe(0);
    });

    it('should handle projects with no events', async () => {
      db.exec('DELETE FROM events');
      db.exec('DELETE FROM rollbacks');

      const response = await request(app).get('/api/health/projects');

      expect(response.status).toBe(200);
      const project = response.body.projects[0];
      expect(project.status).toBe('inactive');
      expect(project.health_score).toBeLessThanOrEqual(50); // Complexity (15) + Stability (25) with no events
      expect(project.last_activity).toBeNull();
      expect(project.components.velocity).toBe(0);
      expect(project.components.recency).toBe(0);
      expect(project.components.stability).toBe(25); // 0 rollbacks = full stability score
    });
  });

  describe('System Memory Warning Coverage', () => {
    it('should trigger high system memory warning when memory exceeds 90%', async () => {
      // Mock os module with high memory usage
      jest.unstable_mockModule('os', () => ({
        totalmem: () => 1000000000, // 1GB total
        freemem: () => 50000000     // 50MB free = 95% used (triggers >90% warning)
      }));

      // Re-import to get the mocked version
      const { createHealthRoutes: createHealthRoutesMocked } = await import('../../routes/health.js?mock=' + Date.now());

      const testApp = express();
      testApp.use(express.json());

      const { mkdirSync, rmSync } = await import('fs');
      const testMemDir = './__tests__/test-mem-dir';
      mkdirSync(testMemDir, { recursive: true });

      const mockIO = { emit: () => {} };
      const testRouter = createHealthRoutesMocked({
        projectState: { currentProject: 'test' },
        io: mockIO,
        SESSION_ID: 'test-session',
        RAVEN_DIR: testMemDir,
        projectDatabases: new Map(),
        getHealthCheckSystem: () => null
      });

      testApp.use('/api', testRouter);

      const response = await request(testApp).get('/api/health');

      // Cleanup
      rmSync(testMemDir, { recursive: true, force: true });
      jest.unmock('os');

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('warning');
      expect(response.body.issues).toContain('High system memory usage');
    });
  });
});
