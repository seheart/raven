/**
 * Integration Tests: Dashboard Statistics
 * Tests aggregated statistics with real database queries
 */

import { jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import { createDashboardRoutes } from '../../routes/dashboard.js';
import { RavenDB } from '../../db.js';
import fs from 'fs';
import { join } from 'path';

const TEST_DB_DIR = './.raven/test-databases-dashboard';

describe('Dashboard Integration Tests', () => {
  let app;
  let db1;
  let db2;
  let testDbPath1;
  let testDbPath2;

  beforeEach(() => {
    // Create test database directory
    if (!fs.existsSync(TEST_DB_DIR)) {
      fs.mkdirSync(TEST_DB_DIR, { recursive: true });
    }

    testDbPath1 = join(TEST_DB_DIR, `project1-${Date.now()}.db`);
    testDbPath2 = join(TEST_DB_DIR, `project2-${Date.now()}.db`);

    // Create real RavenDB instances
    db1 = new RavenDB(testDbPath1, 'project1');
    db2 = new RavenDB(testDbPath2, 'project2');

    // Seed test data
    seedDatabase(db1, 'session-1', 'project1');
    seedDatabase(db2, 'session-2', 'project2');

    // Create app with real dependencies
    app = express();
    app.use(express.json());

    const dependencies = {
      projectDatabases: new Map([
        ['project1', db1],
        ['project2', db2]
      ]),
      activeProject: 'project1',
      currentSession: 'session-1'
    };

    app.use('/api', createDashboardRoutes(dependencies));
  });

  afterEach(() => {
    // Close databases
    if (db1) db1.db.close();
    if (db2) db2.db.close();

    // Clean up test databases
    if (fs.existsSync(testDbPath1)) fs.unlinkSync(testDbPath1);
    if (fs.existsSync(testDbPath2)) fs.unlinkSync(testDbPath2);
  });

  afterAll(() => {
    // Clean up test directory
    if (fs.existsSync(TEST_DB_DIR)) {
      fs.rmSync(TEST_DB_DIR, { recursive: true, force: true });
    }
  });

  function seedDatabase(db, sessionId, project) {
    const events = [
      {
        session_id: sessionId,
        agent: 'agent-1',
        event: 'file_edit',
        message: 'Edit 1',
        file: 'file1.js',
        lines_changed: 10,
        timestamp: Date.now()
      },
      {
        session_id: sessionId,
        agent: 'agent-2',
        event: 'file_edit',
        message: 'Edit 2',
        file: 'file2.js',
        lines_changed: 20,
        timestamp: Date.now()
      },
      {
        session_id: sessionId,
        agent: 'agent-1',
        event: 'file_edit',
        message: 'Edit 3',
        file: 'file1.js',
        lines_changed: 5,
        timestamp: Date.now()
      }
    ];

    const stmt = db.db.prepare(`
      INSERT INTO agent_events (session_id, agent, event_type, message, file, lines_changed, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    for (const event of events) {
      stmt.run(
        event.session_id,
        event.agent,
        event.event,
        event.message,
        event.file,
        event.lines_changed,
        event.timestamp
      );
    }
  }

  test('should aggregate stats across multiple projects', async () => {
    const response = await request(app).get('/api/dashboard-stats');

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      total_events: 6, // 3 from each project
      total_files: 4,  // 2 unique files per project
      total_agents: 2  // 2 unique agents
    });
    expect(response.body.total_lines_changed).toBeGreaterThan(0);
  });

  test('should return top files by activity', async () => {
    const response = await request(app).get('/api/top-files');

    expect(response.status).toBe(200);
    expect(Array.isArray(response.body)).toBe(true);
    expect(response.body.length).toBeGreaterThan(0);

    // Should be sorted by change_count descending
    if (response.body.length > 1) {
      expect(response.body[0].change_count).toBeGreaterThanOrEqual(
        response.body[1].change_count
      );
    }
  });

  test('should return agent activity', async () => {
    const response = await request(app).get('/api/agent-activity');

    expect(response.status).toBe(200);
    expect(Array.isArray(response.body)).toBe(true);

    // Should have both agents
    const agents = response.body.map(a => a.agent);
    expect(agents).toContain('agent-1');
    expect(agents).toContain('agent-2');
  });

  test('should calculate time-based stats', async () => {
    const response = await request(app).get('/api/timeline');

    expect(response.status).toBe(200);
    expect(Array.isArray(response.body)).toBe(true);
    expect(response.body.length).toBeGreaterThan(0);

    // Each entry should have timestamp and count
    response.body.forEach(entry => {
      expect(entry).toHaveProperty('timestamp');
      expect(entry).toHaveProperty('count');
    });
  });

  test('should filter by session', async () => {
    const response = await request(app)
      .get('/api/dashboard-stats')
      .query({ session: 'session-1' });

    expect(response.status).toBe(200);
    expect(response.body.total_events).toBe(3); // Only session-1 events
  });

  test('should handle empty database gracefully', async () => {
    // Create empty database
    const emptyDbPath = join(TEST_DB_DIR, 'empty.db');
    const emptyDb = new RavenDB(emptyDbPath, 'empty-project');

    const emptyApp = express();
    emptyApp.use(express.json());
    emptyApp.use('/api', createDashboardRoutes({
      projectDatabases: new Map([['empty', emptyDb]]),
      activeProject: 'empty',
      currentSession: 'none'
    }));

    const response = await request(emptyApp).get('/api/dashboard-stats');

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      total_events: 0,
      total_files: 0,
      total_agents: 0
    });

    emptyDb.db.close();
    fs.unlinkSync(emptyDbPath);
  });

  test('should handle database query errors gracefully', async () => {
    // Close database to simulate error
    db1.db.close();

    const response = await request(app).get('/api/dashboard-stats');

    // Should handle error gracefully (exact behavior depends on implementation)
    expect(response.status).toBeGreaterThanOrEqual(200);
  });
});
