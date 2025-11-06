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
    ravenDb.db
      .prepare(
        `
      INSERT INTO conversations (timestamp, claude_session_id, event_type, content, tool_name, project)
      VALUES
        (datetime('now'), 'session-1', 'user_message', 'Test message 1', NULL, 'test-project'),
        (datetime('now'), 'session-1', 'assistant_text', 'Test response 1', NULL, 'test-project'),
        (datetime('now'), 'session-2', 'tool_call', NULL, 'bash', 'test-project')
    `
      )
      .run();

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
      const response = await request(app).get('/api/conversations?limit=10').expect(200);

      expect(response.body).toBeDefined();
    });

    test('should handle offset parameter', async () => {
      const response = await request(app).get('/api/conversations?offset=5').expect(200);

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
      const response = await request(app).get('/api/conversations/session/nonexistent').expect(200);

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

    test('should return error for non-existent session file', async () => {
      const response = await request(app)
        .post('/api/conversations/import')
        .send({ sessionFile: '/nonexistent/session.jsonl' })
        .expect('Content-Type', /json/);

      expect([404, 500]).toContain(response.status);
      expect(response.body).toHaveProperty('error');
    });

    test('should import valid session file', async () => {
      // Create a test session file
      const sessionFile = join(testDir, 'test-session.jsonl');
      const sessionData = [
        {
          type: 'user',
          message: { role: 'user', content: 'test message' },
          timestamp: new Date().toISOString(),
          sessionId: 'test-session'
        },
        {
          type: 'assistant',
          message: { content: [{ type: 'text', text: 'test response' }] },
          timestamp: new Date().toISOString(),
          sessionId: 'test-session'
        }
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

    test('should import session file with tool results', async () => {
      const sessionFile = join(testDir, 'tool-session.jsonl');
      const sessionData = [
        {
          type: 'user',
          message: {
            role: 'user',
            content: [
              {
                type: 'tool_result',
                tool_use_id: 'tool-123',
                content: 'Command output here',
                is_error: false
              }
            ]
          },
          timestamp: new Date().toISOString(),
          sessionId: 'tool-session'
        }
      ];
      writeFileSync(sessionFile, sessionData.map(d => JSON.stringify(d)).join('\n'));

      const response = await request(app)
        .post('/api/conversations/import')
        .send({ sessionFile, project: 'test-project' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.imported.toolResults).toBe(1);
    });

    test('should import session file with tool calls', async () => {
      const sessionFile = join(testDir, 'toolcall-session.jsonl');
      const sessionData = [
        {
          type: 'assistant',
          message: {
            content: [
              { type: 'text', text: 'Running command...' },
              { type: 'tool_use', id: 'tool-456', name: 'bash', input: { command: 'ls' } }
            ]
          },
          timestamp: new Date().toISOString(),
          sessionId: 'toolcall-session'
        }
      ];
      writeFileSync(sessionFile, sessionData.map(d => JSON.stringify(d)).join('\n'));

      const response = await request(app)
        .post('/api/conversations/import')
        .send({ sessionFile, project: 'test-project' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.imported.toolCalls).toBe(1);
      expect(response.body.imported.assistantMessages).toBe(1);
    });

    test('should skip summary entries', async () => {
      const sessionFile = join(testDir, 'summary-session.jsonl');
      const sessionData = [
        { type: 'summary', content: 'Summary data' },
        {
          type: 'user',
          message: { role: 'user', content: 'real message' },
          timestamp: new Date().toISOString(),
          sessionId: 'sess'
        }
      ];
      writeFileSync(sessionFile, sessionData.map(d => JSON.stringify(d)).join('\n'));

      const response = await request(app)
        .post('/api/conversations/import')
        .send({ sessionFile, project: 'test-project' })
        .expect(200);

      expect(response.body.imported.total).toBe(1); // Only the user message
    });

    test('should skip file-history-snapshot entries', async () => {
      const sessionFile = join(testDir, 'snapshot-session.jsonl');
      const sessionData = [
        { type: 'file-history-snapshot', content: 'Snapshot data' },
        {
          type: 'user',
          message: { role: 'user', content: 'real message' },
          timestamp: new Date().toISOString(),
          sessionId: 'sess'
        }
      ];
      writeFileSync(sessionFile, sessionData.map(d => JSON.stringify(d)).join('\n'));

      const response = await request(app)
        .post('/api/conversations/import')
        .send({ sessionFile, project: 'test-project' })
        .expect(200);

      expect(response.body.imported.total).toBe(1);
    });

    test('should handle malformed JSON lines gracefully', async () => {
      const sessionFile = join(testDir, 'malformed-session.jsonl');
      const content =
        'invalid json line\n' +
        JSON.stringify({
          type: 'user',
          message: { role: 'user', content: 'valid' },
          timestamp: new Date().toISOString(),
          sessionId: 'sess'
        });
      writeFileSync(sessionFile, content);

      const response = await request(app)
        .post('/api/conversations/import')
        .send({ sessionFile, project: 'test-project' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.imported.total).toBe(1); // Only valid line
    });

    test('should handle tool result with error flag', async () => {
      const sessionFile = join(testDir, 'error-tool-session.jsonl');
      const sessionData = [
        {
          type: 'user',
          message: {
            role: 'user',
            content: [
              {
                type: 'tool_result',
                tool_use_id: 'tool-error',
                content: 'Error output',
                is_error: true
              }
            ]
          },
          timestamp: new Date().toISOString(),
          sessionId: 'error-session'
        }
      ];
      writeFileSync(sessionFile, sessionData.map(d => JSON.stringify(d)).join('\n'));

      const response = await request(app)
        .post('/api/conversations/import')
        .send({ sessionFile, project: 'test-project' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.imported.toolResults).toBe(1);
    });

    test('should handle tool result with object content', async () => {
      const sessionFile = join(testDir, 'obj-tool-session.jsonl');
      const sessionData = [
        {
          type: 'user',
          message: {
            role: 'user',
            content: [
              {
                type: 'tool_result',
                tool_use_id: 'tool-obj',
                content: { result: 'data', nested: { value: 123 } },
                is_error: false
              }
            ]
          },
          timestamp: new Date().toISOString(),
          sessionId: 'obj-session'
        }
      ];
      writeFileSync(sessionFile, sessionData.map(d => JSON.stringify(d)).join('\n'));

      const response = await request(app)
        .post('/api/conversations/import')
        .send({ sessionFile, project: 'test-project' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.imported.toolResults).toBe(1);
    });

    test('should handle user message with object content', async () => {
      const sessionFile = join(testDir, 'obj-user-session.jsonl');
      const sessionData = [
        {
          type: 'user',
          message: {
            role: 'user',
            content: { text: 'structured content' }
          },
          timestamp: new Date().toISOString(),
          sessionId: 'obj-user-session'
        }
      ];
      writeFileSync(sessionFile, sessionData.map(d => JSON.stringify(d)).join('\n'));

      const response = await request(app)
        .post('/api/conversations/import')
        .send({ sessionFile, project: 'test-project' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.imported.userMessages).toBe(1);
    });
  });

  describe('Error Handling', () => {
    test('should handle missing raven database', async () => {
      const appNoRaven = express();
      appNoRaven.use(express.json());

      const depsNoRaven = {
        projectDatabases: new Map(), // No raven database
        projectState: { db: ravenDb }
      };

      appNoRaven.use('/api', createConversationRoutes(depsNoRaven));

      const response = await request(appNoRaven).get('/api/conversations').expect(500);

      expect(response.body.error).toContain('Raven database not found');
    });

    test('should handle errors in getConversations', async () => {
      const originalFn = ravenDb.getConversations;
      ravenDb.getConversations = () => {
        throw new Error('Query failed');
      };

      const response = await request(app).get('/api/conversations').expect(500);

      expect(response.body.error).toBe('Query failed');

      ravenDb.getConversations = originalFn;
    });

    test('should handle errors in getConversationStats', async () => {
      const originalFn = ravenDb.getConversationStats;
      ravenDb.getConversationStats = () => {
        throw new Error('Stats failed');
      };

      const response = await request(app).get('/api/conversations/stats').expect(500);

      expect(response.body.error).toBe('Stats failed');

      ravenDb.getConversationStats = originalFn;
    });

    test('should handle errors in getConversationsBySession', async () => {
      const originalFn = ravenDb.getConversationsBySession;
      ravenDb.getConversationsBySession = () => {
        throw new Error('Session query failed');
      };

      const response = await request(app).get('/api/conversations/session/session-1').expect(500);

      expect(response.body.error).toBe('Session query failed');

      ravenDb.getConversationsBySession = originalFn;
    });

    test('should handle errors during import', async () => {
      // Create a file that will cause read error
      const sessionFile = join(testDir, 'corrupt-session.jsonl');
      writeFileSync(sessionFile, 'data');

      // Mock insertConversation to throw error
      const originalFn = ravenDb.insertConversation;
      ravenDb.insertConversation = () => {
        throw new Error('Insert failed');
      };

      // Errors inside line handler are caught and logged, import succeeds with 0 entries
      const response = await request(app)
        .post('/api/conversations/import')
        .send({ sessionFile, project: 'test-project' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.imported.total).toBe(0); // No valid entries imported

      ravenDb.insertConversation = originalFn;
    });

    test('should handle stream errors during import', async () => {
      // Create a directory instead of a file - passes existsSync but fails createReadStream
      const dirPath = join(testDir, 'bad-session.jsonl');
      mkdirSync(dirPath, { recursive: true });

      const response = await request(app)
        .post('/api/conversations/import')
        .send({ sessionFile: dirPath, project: 'test-project' })
        .expect(500);

      expect(response.body.error).toBeDefined();

      // Clean up
      rmSync(dirPath, { recursive: true, force: true });
    });
  });
});
