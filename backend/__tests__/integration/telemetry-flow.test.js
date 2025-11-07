/**
 * Integration Tests: Telemetry Flow
 * Tests the complete telemetry ingestion pipeline with real database
 */

import { jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import { createTelemetryRoutes } from '../../routes/telemetry.js';
import { RavenDB } from '../../db.js';
import fs from 'fs';
import { join } from 'path';

const TEST_DB_DIR = './.raven/test-databases-integration';

describe.skip('Telemetry Integration Tests', () => {
  let app;
  let db;
  let testDbPath;
  let testSessionId;

  beforeEach(() => {
    // Ensure parent .raven directory exists
    if (!fs.existsSync('./.raven')) {
      fs.mkdirSync('./.raven', { recursive: true });
    }

    // Create test database directory
    if (!fs.existsSync(TEST_DB_DIR)) {
      fs.mkdirSync(TEST_DB_DIR, { recursive: true });
    }

    testDbPath = join(TEST_DB_DIR, `test-${Date.now()}.db`);
    testSessionId = `test-session-${Date.now()}`;

    // Create real RavenDB instance
    try {
      db = new RavenDB(testDbPath, 'test-project');
    } catch (error) {
      // If database creation fails, skip cleanup
      testDbPath = null;
      throw error;
    }

    // Create app with real dependencies
    app = express();
    app.use(express.json());

    const dependencies = {
      projectDatabases: new Map([['test-project', db]]),
      activeProject: 'test-project',
      SESSION_ID: testSessionId, // Add consistent session ID for testing
      triggerEngine: {
        evaluateTriggers: jest.fn()
      },
      io: {
        emit: jest.fn()
      },
      agentRegistry: {
        registerAgent: jest.fn(),
        getAgentColor: jest.fn(() => '#3498db')
      }
    };

    app.use('/telemetry', createTelemetryRoutes(dependencies));
  });

  afterEach(() => {
    // Close database
    if (db && db.db) {
      try {
        db.db.close();
      } catch (error) {
        // Database might already be closed
      }
    }

    // Clean up test database
    if (testDbPath && fs.existsSync(testDbPath)) {
      try {
        fs.unlinkSync(testDbPath);
      } catch (error) {
        // File might already be deleted
      }
    }
  });

  afterAll(() => {
    // Clean up test directory
    if (fs.existsSync(TEST_DB_DIR)) {
      fs.rmSync(TEST_DB_DIR, { recursive: true, force: true });
    }
  });

  test('should insert telemetry event into real database', async () => {
    const eventData = {
      agent: 'test-agent',
      event: 'file_edit',
      message: 'Edited test.js',
      file: 'test.js',
      lines_changed: 10,
      duration_ms: 500
    };

    const response = await request(app).post('/telemetry').send(eventData);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.event_id).toBeDefined();

    // Verify event was actually inserted into database
    const events = db.db
      .prepare(
        `
      SELECT * FROM agent_events WHERE session_id = ?
    `
      )
      .all(response.body.session_id);
    expect(events.length).toBe(1);
    expect(events[0].agent).toBe('test-agent');
    expect(events[0].event_type).toBe('file_edit');
  });

  test('should handle multiple events in sequence', async () => {
    const events = [
      { agent: 'agent-1', event: 'file_open', message: 'Opened file1.js', file: 'file1.js' },
      {
        agent: 'agent-1',
        event: 'file_edit',
        message: 'Edited file1.js',
        file: 'file1.js',
        lines_changed: 5
      },
      { agent: 'agent-2', event: 'file_open', message: 'Opened file2.js', file: 'file2.js' }
    ];

    let sessionId;

    for (const event of events) {
      const response = await request(app).post('/telemetry').send(event);

      expect(response.status).toBe(200);
      sessionId = response.body.session_id;
    }

    // Verify all events were stored
    const storedEvents = db.db
      .prepare(
        `
      SELECT * FROM agent_events WHERE session_id = ? ORDER BY id
    `
      )
      .all(sessionId);
    expect(storedEvents.length).toBe(3);
    expect(storedEvents.map(e => e.agent)).toEqual(['agent-1', 'agent-1', 'agent-2']);
  });

  test('should track file changes correctly', async () => {
    await request(app).post('/telemetry').send({
      agent: 'editor',
      event: 'file_edit',
      message: 'First edit',
      file: 'app.js',
      lines_changed: 10
    });

    await request(app).post('/telemetry').send({
      agent: 'editor',
      event: 'file_edit',
      message: 'Second edit',
      file: 'app.js',
      lines_changed: 5
    });

    // Query database directly
    const fileStats = db.db
      .prepare(
        `
      SELECT file, COUNT(*) as edit_count, SUM(lines_changed) as total_lines
      FROM agent_events
      WHERE file = 'app.js'
      GROUP BY file
    `
      )
      .get();

    expect(fileStats.edit_count).toBe(2);
    expect(fileStats.total_lines).toBe(15);
  });

  test('should handle session persistence across requests', async () => {
    const response1 = await request(app).post('/telemetry').send({
      agent: 'agent-1',
      event: 'start',
      message: 'Session started'
    });

    const sessionId = response1.body.session_id;

    // Simulate second request in same session
    const response2 = await request(app).post('/telemetry').send({
      agent: 'agent-1',
      event: 'continue',
      message: 'Session continues',
      session_id: sessionId
    });

    expect(response2.body.session_id).toBe(sessionId);

    // Verify both events in same session
    const events = db.db
      .prepare(
        `
      SELECT * FROM agent_events WHERE session_id = ?
    `
      )
      .all(sessionId);
    expect(events.length).toBe(2);
  });

  test('should validate required fields', async () => {
    const invalidEvent = {
      // Missing required fields
      message: 'Invalid event'
    };

    const response = await request(app).post('/telemetry').send(invalidEvent);

    expect(response.status).toBe(400);
    expect(response.body.error).toBeDefined();
  });

  test('should handle concurrent requests', async () => {
    const concurrentRequests = Array(10)
      .fill()
      .map((_, i) =>
        request(app)
          .post('/telemetry')
          .send({
            agent: `agent-${i}`,
            event: 'concurrent_test',
            message: `Concurrent request ${i}`
          })
      );

    const responses = await Promise.all(concurrentRequests);

    // All requests should succeed
    expect(responses.every(r => r.status === 200)).toBe(true);

    // All events should be stored
    const sessionId = responses[0].body.session_id;
    const events = db.db
      .prepare(
        `
      SELECT * FROM agent_events WHERE session_id = ?
    `
      )
      .all(sessionId);
    expect(events.length).toBe(10);
  });
});
