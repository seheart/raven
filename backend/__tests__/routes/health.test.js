/**
 * Health Routes Tests
 * Tests for /api/health, /api/health-checks, and /api/health/projects endpoints
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import Database from 'better-sqlite3';
import { createHealthRoutes } from '../../routes/health.js';
import { unlink } from 'fs/promises';

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
    } catch (error) {
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
});
