/**
 * Tests for Conversations Routes
 */

import request from 'supertest';
import express from 'express';
import { createConversationRoutes } from '../../routes/conversations.js';
import { RavenDB } from '../../db.js';
import { mkdirSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('Conversations Routes', () => {
  let app;
  let ravenDb;
  let testDir;
  let mockProjectDatabases;

  beforeEach(() => {
    app = express();
    app.use(express.json());

    testDir = join(tmpdir(), `conversations-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
    const dbPath = join(testDir, 'raven.db');
    ravenDb = new RavenDB(dbPath);

    // Insert test conversation data
    ravenDb.db.prepare(`
      INSERT INTO conversations (timestamp, claude_session_id, event_type, content, tool_name, project)
      VALUES
        (datetime('now'), 'session-1', 'user_message', 'Test message 1', NULL, 'test-project'),
        (datetime('now'), 'session-1', 'assistant_text', 'Test response 1', NULL, 'test-project'),
        (datetime('now'), 'session-2', 'tool_call', NULL, 'bash', 'test-project')
    `).run();

    mockProjectDatabases = new Map();
    mockProjectDatabases.set('raven', ravenDb);

    const deps = {
      projectDatabases: mockProjectDatabases,
      projectState: { db: ravenDb }
    };

    app.use('/api', createConversationRoutes(deps));
  });

  afterEach(() => {
    if (ravenDb) {
      ravenDb.close();
    }
    try {
      rmSync(testDir, { recursive: true, force: true });
    } catch (_error) {
      // Ignore cleanup errors
    }
  });

  describe('GET /api/conversations', () => {
    test('should return conversations list', async () => {
      const response = await request(app)
        .get('/api/conversations')
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body).toBeDefined();
    });

    test('should handle limit parameter', async () => {
      const response = await request(app)
        .get('/api/conversations?limit=10')
        .expect(200);

      expect(response.body).toBeDefined();
    });

    test('should handle offset parameter', async () => {
      const response = await request(app)
        .get('/api/conversations?offset=5')
        .expect(200);

      expect(response.body).toBeDefined();
    });

    test('should filter by event_type', async () => {
      const response = await request(app)
        .get('/api/conversations?event_type=user_message')
        .expect(200);

      expect(response.body).toBeDefined();
    });

    test('should filter by project', async () => {
      const response = await request(app)
        .get('/api/conversations?project=test-project')
        .expect(200);

      expect(response.body).toBeDefined();
    });

    test('should filter by claude_session_id', async () => {
      const response = await request(app)
        .get('/api/conversations?claude_session_id=session-1')
        .expect(200);

      expect(response.body).toBeDefined();
    });
  });

  describe('GET /api/conversations/stats', () => {
    test('should return conversation statistics', async () => {
      const response = await request(app)
        .get('/api/conversations/stats')
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body).toBeDefined();
    });
  });

  describe('GET /api/conversations/session/:sessionId', () => {
    test('should return conversations for specific session', async () => {
      const response = await request(app)
        .get('/api/conversations/session/session-1')
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body).toHaveProperty('conversations');
      expect(response.body).toHaveProperty('total');
      expect(Array.isArray(response.body.conversations)).toBe(true);
    });

    test('should handle limit parameter', async () => {
      const response = await request(app)
        .get('/api/conversations/session/session-1?limit=5')
        .expect(200);

      expect(response.body).toHaveProperty('conversations');
    });

    test('should return empty array for non-existent session', async () => {
      const response = await request(app)
        .get('/api/conversations/session/nonexistent')
        .expect(200);

      expect(response.body.conversations).toEqual([]);
    });
  });

  describe('POST /api/conversations/import', () => {
    test('should reject request without sessionFile', async () => {
      const response = await request(app)
        .post('/api/conversations/import')
        .send({})
        .expect('Content-Type', /json/)
        .expect(400);

      expect(response.body).toHaveProperty('error');
    });

    test('should return 404 for non-existent session file', async () => {
      const response = await request(app)
        .post('/api/conversations/import')
        .send({ sessionFile: '/nonexistent/session.jsonl' })
        .expect('Content-Type', /json/)
        .expect(404);

      expect(response.body).toHaveProperty('error');
    });

    test('should import valid session file', async () => {
      // Create a test session file
      const sessionFile = join(testDir, 'test-session.jsonl');
      const sessionData = [
        { type: 'user', message: { role: 'user', content: 'test message' }, timestamp: new Date().toISOString(), sessionId: 'test-session' },
        { type: 'assistant', message: { content: [{ type: 'text', text: 'test response' }] }, timestamp: new Date().toISOString(), sessionId: 'test-session' }
      ];
      writeFileSync(sessionFile, sessionData.map(d => JSON.stringify(d)).join('\n'));

      const response = await request(app)
        .post('/api/conversations/import')
        .send({
          sessionFile: sessionFile,
          project: 'test-project'
        })
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('imported');
      expect(response.body.imported).toHaveProperty('total');
    });
  });
});
