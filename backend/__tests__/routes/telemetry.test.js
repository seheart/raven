/**
 * Tests for Telemetry Route Module
 * Comprehensive test coverage for all telemetry endpoints
 */

import { jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import { createTelemetryRoutes } from '../../routes/telemetry.js';

describe('Telemetry Routes', () => {
  let app;
  let mockDeps;
  let mockDb;
  let mockDeveloperDB;
  let mockTriggerEngine;
  let mockIo;

  beforeEach(() => {
    // Create mock database
    mockDb = {
      insertAgentEvent: jest.fn().mockReturnValue(123),
      getAgentStats: jest.fn().mockReturnValue({ total: 10, errors: 0 }),
      db: {
        prepare: jest.fn().mockReturnValue({
          all: jest.fn().mockReturnValue([
            { id: 1, metric: 'test', timestamp: '2024-01-01T00:00:00Z' }
          ])
        })
      },
      getProcessMetricsByAgent: jest.fn().mockReturnValue([
        { agent: 'test-agent', cpu: 50, memory: 100 }
      ])
    };

    // Create mock developer database
    mockDeveloperDB = {
      logAgentInteraction: jest.fn()
    };

    // Create mock trigger engine
    mockTriggerEngine = {
      evaluateTriggers: jest.fn()
    };

    // Create mock socket.io
    mockIo = {
      emit: jest.fn()
    };

    // Create mock agent registry
    const mockAgentRegistry = new Map();

    // Create mock dependencies
    mockDeps = {
      projectDatabases: new Map([['test-project', mockDb]]),
      developerDB: mockDeveloperDB,
      availableProjects: [{ name: 'test-project' }],
      SESSION_ID: 'test-session-123',
      agentRegistry: mockAgentRegistry,
      getAgentColor: (_name) => '#FF0000',
      triggerEngine: mockTriggerEngine,
      io: mockIo,
      activeProject: 'test-project'
    };

    // Create Express app with telemetry routes
    app = express();
    app.use(express.json());
    app.use('/telemetry', createTelemetryRoutes(mockDeps));
    app.use('/api', createTelemetryRoutes(mockDeps));
  });

  describe('POST /telemetry - Validation Tests', () => {
    test('should reject when agent is missing', async () => {
      const response = await request(app)
        .post('/telemetry')
        .send({
          event: 'test-event',
          message: 'Test message'
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Missing required fields');
    });

    test('should reject when event and event_type are both missing', async () => {
      const response = await request(app)
        .post('/telemetry')
        .send({
          agent: 'test-agent',
          message: 'Test message'
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Missing required fields');
    });

    test('should reject when message is missing', async () => {
      const response = await request(app)
        .post('/telemetry')
        .send({
          agent: 'test-agent',
          event: 'test-event'
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Missing required fields');
    });

    test('should reject when agent is not a string', async () => {
      const response = await request(app)
        .post('/telemetry')
        .send({
          agent: 123,
          event: 'test-event',
          message: 'Test message'
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Invalid agent');
    });

    test('should reject when agent is an empty string', async () => {
      const response = await request(app)
        .post('/telemetry')
        .send({
          agent: '',
          event: 'test-event',
          message: 'Test message'
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Missing required fields');
    });

    test('should reject when agent exceeds 100 characters', async () => {
      const response = await request(app)
        .post('/telemetry')
        .send({
          agent: 'a'.repeat(101),
          event: 'test-event',
          message: 'Test message'
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Invalid agent');
    });

    test('should accept agent with exactly 100 characters', async () => {
      const response = await request(app)
        .post('/telemetry')
        .send({
          agent: 'a'.repeat(100),
          event: 'test-event',
          message: 'Test message'
        });

      expect(response.status).toBe(200);
    });

    test('should reject when event is not a string', async () => {
      const response = await request(app)
        .post('/telemetry')
        .send({
          agent: 'test-agent',
          event: 123,
          message: 'Test message'
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Invalid event');
    });

    test('should reject when event is an empty string', async () => {
      const response = await request(app)
        .post('/telemetry')
        .send({
          agent: 'test-agent',
          event: '',
          message: 'Test message'
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Missing required fields');
    });

    test('should reject when event exceeds 100 characters', async () => {
      const response = await request(app)
        .post('/telemetry')
        .send({
          agent: 'test-agent',
          event: 'a'.repeat(101),
          message: 'Test message'
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Invalid event');
    });

    test('should accept event with exactly 100 characters', async () => {
      const response = await request(app)
        .post('/telemetry')
        .send({
          agent: 'test-agent',
          event: 'a'.repeat(100),
          message: 'Test message'
        });

      expect(response.status).toBe(200);
    });

    test('should reject when message is not a string', async () => {
      const response = await request(app)
        .post('/telemetry')
        .send({
          agent: 'test-agent',
          event: 'test-event',
          message: 123
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Invalid message');
    });

    test('should reject when message is an empty string', async () => {
      const response = await request(app)
        .post('/telemetry')
        .send({
          agent: 'test-agent',
          event: 'test-event',
          message: ''
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Missing required fields');
    });

    test('should reject when message exceeds 1000 characters', async () => {
      const response = await request(app)
        .post('/telemetry')
        .send({
          agent: 'test-agent',
          event: 'test-event',
          message: 'a'.repeat(1001)
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Invalid message');
    });

    test('should accept message with exactly 1000 characters', async () => {
      const response = await request(app)
        .post('/telemetry')
        .send({
          agent: 'test-agent',
          event: 'test-event',
          message: 'a'.repeat(1000)
        });

      expect(response.status).toBe(200);
    });

    test('should reject when file is not a string', async () => {
      const response = await request(app)
        .post('/telemetry')
        .send({
          agent: 'test-agent',
          event: 'test-event',
          message: 'Test message',
          file: 123
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Invalid file');
    });

    test('should accept when file is a valid string', async () => {
      const response = await request(app)
        .post('/telemetry')
        .send({
          agent: 'test-agent',
          event: 'test-event',
          message: 'Test message',
          file: '/path/to/file.js'
        });

      expect(response.status).toBe(200);
    });

    test('should accept when file is undefined', async () => {
      const response = await request(app)
        .post('/telemetry')
        .send({
          agent: 'test-agent',
          event: 'test-event',
          message: 'Test message'
        });

      expect(response.status).toBe(200);
    });

    test('should reject when lines_changed is not a number', async () => {
      const response = await request(app)
        .post('/telemetry')
        .send({
          agent: 'test-agent',
          event: 'test-event',
          message: 'Test message',
          lines_changed: 'not-a-number'
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Invalid lines_changed');
    });

    test('should reject when lines_changed is negative', async () => {
      const response = await request(app)
        .post('/telemetry')
        .send({
          agent: 'test-agent',
          event: 'test-event',
          message: 'Test message',
          lines_changed: -1
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Invalid lines_changed');
    });

    test('should reject when lines_changed exceeds 1000000', async () => {
      const response = await request(app)
        .post('/telemetry')
        .send({
          agent: 'test-agent',
          event: 'test-event',
          message: 'Test message',
          lines_changed: 1000001
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Invalid lines_changed');
    });

    test('should accept lines_changed of 0', async () => {
      const response = await request(app)
        .post('/telemetry')
        .send({
          agent: 'test-agent',
          event: 'test-event',
          message: 'Test message',
          lines_changed: 0
        });

      expect(response.status).toBe(200);
    });

    test('should accept lines_changed of 1000000', async () => {
      const response = await request(app)
        .post('/telemetry')
        .send({
          agent: 'test-agent',
          event: 'test-event',
          message: 'Test message',
          lines_changed: 1000000
        });

      expect(response.status).toBe(200);
    });

    test('should reject when duration_ms is not a number', async () => {
      const response = await request(app)
        .post('/telemetry')
        .send({
          agent: 'test-agent',
          event: 'test-event',
          message: 'Test message',
          duration_ms: 'not-a-number'
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Invalid duration_ms');
    });

    test('should reject when duration_ms is negative', async () => {
      const response = await request(app)
        .post('/telemetry')
        .send({
          agent: 'test-agent',
          event: 'test-event',
          message: 'Test message',
          duration_ms: -1
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Invalid duration_ms');
    });

    test('should reject when duration_ms exceeds 3600000', async () => {
      const response = await request(app)
        .post('/telemetry')
        .send({
          agent: 'test-agent',
          event: 'test-event',
          message: 'Test message',
          duration_ms: 3600001
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Invalid duration_ms');
    });

    test('should accept duration_ms of 0', async () => {
      const response = await request(app)
        .post('/telemetry')
        .send({
          agent: 'test-agent',
          event: 'test-event',
          message: 'Test message',
          duration_ms: 0
        });

      expect(response.status).toBe(200);
    });

    test('should accept duration_ms of 3600000', async () => {
      const response = await request(app)
        .post('/telemetry')
        .send({
          agent: 'test-agent',
          event: 'test-event',
          message: 'Test message',
          duration_ms: 3600000
        });

      expect(response.status).toBe(200);
    });

    test('should support event_type for backwards compatibility', async () => {
      const response = await request(app)
        .post('/telemetry')
        .send({
          agent: 'test-agent',
          event_type: 'legacy-event',
          message: 'Test message'
        });

      expect(response.status).toBe(200);
      expect(mockDb.insertAgentEvent).toHaveBeenCalledWith(
        expect.any(String),
        'test-agent',
        'legacy-event',
        undefined,
        undefined,
        undefined,
        'Test message',
        undefined,
        'test-session-123',
        'test-project'
      );
    });

    test('should prefer event over event_type when both provided', async () => {
      const response = await request(app)
        .post('/telemetry')
        .send({
          agent: 'test-agent',
          event: 'new-event',
          event_type: 'legacy-event',
          message: 'Test message'
        });

      expect(response.status).toBe(200);
      // Verify the call was made with 'new-event' as the event type (3rd parameter)
      const callArgs = mockDb.insertAgentEvent.mock.calls[mockDb.insertAgentEvent.mock.calls.length - 1];
      expect(callArgs[2]).toBe('new-event');
    });
  });

  describe('POST /telemetry - Success Cases', () => {
    test('should accept minimal valid request', async () => {
      const response = await request(app)
        .post('/telemetry')
        .send({
          agent: 'test-agent',
          event: 'test-event',
          message: 'Test message'
        });

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        success: true,
        event_id: 123,
        session_id: 'test-session-123'
      });
    });

    test('should accept full valid request with all fields', async () => {
      const response = await request(app)
        .post('/telemetry')
        .send({
          agent: 'test-agent',
          event: 'test-event',
          message: 'Test message',
          file: 'test.js',
          lines_changed: 10,
          duration_ms: 500,
          metadata: { key: 'value' },
          project: 'test-project'
        });

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        success: true,
        event_id: 123,
        session_id: 'test-session-123',
        project: 'test-project'
      });
    });

    test('should use activeProject when no project specified', async () => {
      const response = await request(app)
        .post('/telemetry')
        .send({
          agent: 'test-agent',
          event: 'test-event',
          message: 'Test message'
        });

      expect(response.status).toBe(200);
      expect(response.body.project).toBe('test-project');
    });

    test('should use explicit project when provided', async () => {
      const customDb = {
        insertAgentEvent: jest.fn().mockReturnValue(456),
        getAgentStats: jest.fn().mockReturnValue({ total: 5 })
      };

      mockDeps.projectDatabases.set('custom-project', customDb);

      const response = await request(app)
        .post('/telemetry')
        .send({
          agent: 'test-agent',
          event: 'test-event',
          message: 'Test message',
          project: 'custom-project'
        });

      expect(customDb.insertAgentEvent).toHaveBeenCalled();
      expect(response.body.project).toBe('custom-project');
    });

    test('should fallback to raven project when activeProject is null', async () => {
      const ravenDb = {
        insertAgentEvent: jest.fn().mockReturnValue(789),
        getAgentStats: jest.fn().mockReturnValue({ total: 15 })
      };

      mockDeps.activeProject = null;
      mockDeps.availableProjects = ['other-project', 'raven'];
      mockDeps.projectDatabases.set('raven', ravenDb);

      // Recreate app
      app = express();
      app.use(express.json());
      app.use('/telemetry', createTelemetryRoutes(mockDeps));

      const response = await request(app)
        .post('/telemetry')
        .send({
          agent: 'test-agent',
          event: 'test-event',
          message: 'Test message'
        });

      expect(ravenDb.insertAgentEvent).toHaveBeenCalled();
      expect(response.body.project).toBe('raven');
    });

    test('should fallback to first available project when raven not found', async () => {
      const firstDb = {
        insertAgentEvent: jest.fn().mockReturnValue(999),
        getAgentStats: jest.fn().mockReturnValue({ total: 20 })
      };

      mockDeps.activeProject = null;
      mockDeps.availableProjects = [{ name: 'first-project' }, { name: 'second-project' }];
      mockDeps.projectDatabases.set('first-project', firstDb);

      // Recreate app
      app = express();
      app.use(express.json());
      app.use('/telemetry', createTelemetryRoutes(mockDeps));

      const response = await request(app)
        .post('/telemetry')
        .send({
          agent: 'test-agent',
          event: 'test-event',
          message: 'Test message'
        });

      expect(firstDb.insertAgentEvent).toHaveBeenCalled();
      expect(response.body.project).toBe('first-project');
    });

    test('should handle availableProjects as simple strings', async () => {
      mockDeps.activeProject = null;
      mockDeps.availableProjects = ['simple-project'];
      mockDeps.projectDatabases.set('simple-project', mockDb);

      // Recreate app
      app = express();
      app.use(express.json());
      app.use('/telemetry', createTelemetryRoutes(mockDeps));

      const response = await request(app)
        .post('/telemetry')
        .send({
          agent: 'test-agent',
          event: 'test-event',
          message: 'Test message'
        });

      expect(response.status).toBe(200);
      expect(response.body.project).toBe('simple-project');
    });

    test('should insert event into database with correct parameters', async () => {
      await request(app)
        .post('/telemetry')
        .send({
          agent: 'test-agent',
          event: 'test-event',
          message: 'Test message',
          file: 'test.js',
          lines_changed: 10,
          duration_ms: 500,
          metadata: { key: 'value' }
        });

      expect(mockDb.insertAgentEvent).toHaveBeenCalledWith(
        expect.any(String),
        'test-agent',
        'test-event',
        'test.js',
        10,
        500,
        'Test message',
        { key: 'value' },
        'test-session-123',
        'test-project'
      );
    });

    test('should log to developerDB when available', async () => {
      await request(app)
        .post('/telemetry')
        .send({
          agent: 'test-agent',
          event: 'test-event',
          message: 'Test message',
          file: 'test.js',
          lines_changed: 10,
          metadata: { prompt_type: 'code-generation' }
        });

      expect(mockDeveloperDB.logAgentInteraction).toHaveBeenCalledWith(
        expect.objectContaining({
          project: 'test-project',
          agent_name: 'test-agent',
          event_type: 'test-event',
          file_path: 'test.js',
          lines_changed: 10,
          message: 'Test message',
          session_id: 'test-session-123',
          prompt_type: 'code-generation',
          metadata: expect.any(String)
        })
      );
    });

    test('should not crash when developerDB is null', async () => {
      mockDeps.developerDB = null;

      // Recreate app
      app = express();
      app.use(express.json());
      app.use('/telemetry', createTelemetryRoutes(mockDeps));

      const response = await request(app)
        .post('/telemetry')
        .send({
          agent: 'test-agent',
          event: 'test-event',
          message: 'Test message'
        });

      expect(response.status).toBe(200);
    });

    test('should update agentRegistry for new agent (Map style)', async () => {
      await request(app)
        .post('/telemetry')
        .send({
          agent: 'new-agent',
          event: 'test-event',
          message: 'Test message'
        });

      expect(mockDeps.agentRegistry.has('new-agent')).toBe(true);
      const agent = mockDeps.agentRegistry.get('new-agent');
      expect(agent).toMatchObject({
        agent_name: 'new-agent',
        agent_type: 'new-agent',
        is_running: true,
        requests_handled: 1,
        errors: 0,
        color: '#FF0000'
      });
      expect(agent.last_seen).toBeDefined();
    });

    test('should update agentRegistry for existing agent (Map style)', async () => {
      // First request
      await request(app)
        .post('/telemetry')
        .send({
          agent: 'existing-agent',
          event: 'test-event',
          message: 'Test message 1'
        });

      // Second request
      await request(app)
        .post('/telemetry')
        .send({
          agent: 'existing-agent',
          event: 'test-event',
          message: 'Test message 2'
        });

      const agent = mockDeps.agentRegistry.get('existing-agent');
      expect(agent.requests_handled).toBe(2);
      expect(agent.is_running).toBe(true);
    });

    test('should support agentRegistry with registerAgent function (mock style)', async () => {
      const mockRegistry = {
        registerAgent: jest.fn()
      };

      mockDeps.agentRegistry = mockRegistry;

      // Recreate app
      app = express();
      app.use(express.json());
      app.use('/telemetry', createTelemetryRoutes(mockDeps));

      await request(app)
        .post('/telemetry')
        .send({
          agent: 'test-agent',
          event: 'test-event',
          message: 'Test message'
        });

      expect(mockRegistry.registerAgent).toHaveBeenCalledWith(
        'test-agent',
        expect.objectContaining({
          agent_name: 'test-agent',
          agent_type: 'test-agent',
          is_running: true,
          color: '#FF0000'
        })
      );
    });

    test('should evaluate triggers with correct event data', async () => {
      await request(app)
        .post('/telemetry')
        .send({
          agent: 'test-agent',
          event: 'test-event',
          message: 'Test message',
          file: 'test.js',
          lines_changed: 10,
          duration_ms: 500
        });

      expect(mockTriggerEngine.evaluateTriggers).toHaveBeenCalledWith(
        expect.objectContaining({
          file: 'test.js',
          agent: 'test-agent',
          event_type: 'test-event',
          lines_changed: 10,
          duration_ms: 500,
          project: 'test-project'
        })
      );
    });

    test('should emit agent-event via WebSocket', async () => {
      await request(app)
        .post('/telemetry')
        .send({
          agent: 'test-agent',
          event: 'test-event',
          message: 'Test message',
          file: 'test.js',
          lines_changed: 10,
          duration_ms: 500,
          metadata: { key: 'value' }
        });

      expect(mockIo.emit).toHaveBeenCalledWith(
        'agent-event',
        expect.objectContaining({
          id: 123,
          project: 'test-project',
          agent: 'test-agent',
          event_type: 'test-event',
          file: 'test.js',
          lines_changed: 10,
          duration_ms: 500,
          message: 'Test message',
          metadata: { key: 'value' }
        })
      );
    });

    test('should emit file-changed event when file provided and not session event', async () => {
      mockIo.emit.mockClear();

      await request(app)
        .post('/telemetry')
        .send({
          agent: 'test-agent',
          event: 'edit',
          message: 'Test message',
          file: 'test.js'
        });

      const fileChangedCall = mockIo.emit.mock.calls.find(
        call => call[0] === 'file-changed'
      );

      expect(fileChangedCall).toBeDefined();
      expect(fileChangedCall[1]).toMatchObject({
        filepath: 'test.js',
        change_type: 'edit',
        project: 'test-project',
        agent: 'test-agent'
      });
    });

    test('should NOT emit file-changed for session-start event', async () => {
      mockIo.emit.mockClear();

      await request(app)
        .post('/telemetry')
        .send({
          agent: 'test-agent',
          event: 'session-start',
          message: 'Session started',
          file: 'test.js'
        });

      const fileChangedCalls = mockIo.emit.mock.calls.filter(
        call => call[0] === 'file-changed'
      );
      expect(fileChangedCalls).toHaveLength(0);
    });

    test('should NOT emit file-changed for session-end event', async () => {
      mockIo.emit.mockClear();

      await request(app)
        .post('/telemetry')
        .send({
          agent: 'test-agent',
          event: 'session-end',
          message: 'Session ended',
          file: 'test.js'
        });

      const fileChangedCalls = mockIo.emit.mock.calls.filter(
        call => call[0] === 'file-changed'
      );
      expect(fileChangedCalls).toHaveLength(0);
    });

    test('should NOT emit file-changed when file is not provided', async () => {
      mockIo.emit.mockClear();

      await request(app)
        .post('/telemetry')
        .send({
          agent: 'test-agent',
          event: 'edit',
          message: 'Test message'
        });

      const fileChangedCalls = mockIo.emit.mock.calls.filter(
        call => call[0] === 'file-changed'
      );
      expect(fileChangedCalls).toHaveLength(0);
    });

    test('should emit agent-stats with correct data', async () => {
      await request(app)
        .post('/telemetry')
        .send({
          agent: 'test-agent',
          event: 'test-event',
          message: 'Test message'
        });

      expect(mockIo.emit).toHaveBeenCalledWith('agent-stats', { total: 10, errors: 0 });
    });

    test('should handle metadata correctly', async () => {
      const metadata = {
        prompt_type: 'code-generation',
        model: 'gpt-4',
        custom: 'data'
      };

      await request(app)
        .post('/telemetry')
        .send({
          agent: 'test-agent',
          event: 'test-event',
          message: 'Test message',
          metadata
        });

      expect(mockDb.insertAgentEvent).toHaveBeenCalledWith(
        expect.any(String),
        'test-agent',
        'test-event',
        undefined,
        undefined,
        undefined,
        'Test message',
        metadata,
        'test-session-123',
        'test-project'
      );
    });
  });

  describe('POST /telemetry - Error Cases', () => {
    test('should return 500 when no project database available', async () => {
      mockDeps.projectDatabases = new Map();
      mockDeps.activeProject = null;
      mockDeps.availableProjects = [];

      // Recreate app
      app = express();
      app.use(express.json());
      app.use('/telemetry', createTelemetryRoutes(mockDeps));

      const response = await request(app)
        .post('/telemetry')
        .send({
          agent: 'test-agent',
          event: 'test-event',
          message: 'Test message'
        });

      expect(response.status).toBe(500);
      expect(response.body.error).toContain('No project database available');
    });

    test('should continue when developerDB.logAgentInteraction throws', async () => {
      mockDeveloperDB.logAgentInteraction.mockImplementation(() => {
        throw new Error('Developer DB error');
      });

      const response = await request(app)
        .post('/telemetry')
        .send({
          agent: 'test-agent',
          event: 'test-event',
          message: 'Test message'
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    test('should continue when triggerEngine.evaluateTriggers throws', async () => {
      mockTriggerEngine.evaluateTriggers.mockImplementation(() => {
        throw new Error('Trigger engine error');
      });

      const response = await request(app)
        .post('/telemetry')
        .send({
          agent: 'test-agent',
          event: 'test-event',
          message: 'Test message'
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    test('should return 500 when database insertAgentEvent throws', async () => {
      mockDb.insertAgentEvent.mockImplementation(() => {
        throw new Error('Database error');
      });

      const response = await request(app)
        .post('/telemetry')
        .send({
          agent: 'test-agent',
          event: 'test-event',
          message: 'Test message'
        });

      expect(response.status).toBe(500);
      expect(response.body.error).toContain('Database error');
    });

    test('should return 500 when database getAgentStats throws', async () => {
      mockDb.getAgentStats.mockImplementation(() => {
        throw new Error('Stats error');
      });

      const response = await request(app)
        .post('/telemetry')
        .send({
          agent: 'test-agent',
          event: 'test-event',
          message: 'Test message'
        });

      expect(response.status).toBe(500);
      expect(response.body.error).toContain('Stats error');
    });

    test('should handle null triggerEngine gracefully', async () => {
      mockDeps.triggerEngine = null;

      // Recreate app
      app = express();
      app.use(express.json());
      app.use('/telemetry', createTelemetryRoutes(mockDeps));

      const response = await request(app)
        .post('/telemetry')
        .send({
          agent: 'test-agent',
          event: 'test-event',
          message: 'Test message'
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    test('should handle triggerEngine without evaluateTriggers method', async () => {
      mockDeps.triggerEngine = {};

      // Recreate app
      app = express();
      app.use(express.json());
      app.use('/telemetry', createTelemetryRoutes(mockDeps));

      const response = await request(app)
        .post('/telemetry')
        .send({
          agent: 'test-agent',
          event: 'test-event',
          message: 'Test message'
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });
  });

  describe('GET /api/system-metrics', () => {
    beforeEach(() => {
      mockDeps.projectDatabases.set('raven', mockDb);
    });

    test('should return metrics with default limit and offset', async () => {
      const response = await request(app).get('/api/system-metrics');

      expect(response.status).toBe(200);
      expect(response.body).toEqual([
        { id: 1, metric: 'test', timestamp: '2024-01-01T00:00:00Z' }
      ]);
    });

    test('should use default limit of 100', async () => {
      await request(app).get('/api/system-metrics');

      const prepareCall = mockDb.db.prepare.mock.calls[0];
      expect(prepareCall[0]).toContain('LIMIT ? OFFSET ?');

      const allCall = mockDb.db.prepare().all.mock.calls[0];
      expect(allCall[0]).toBe(100);
    });

    test('should use default offset of 0', async () => {
      await request(app).get('/api/system-metrics');

      const allCall = mockDb.db.prepare().all.mock.calls[0];
      expect(allCall[1]).toBe(0);
    });

    test('should accept custom limit', async () => {
      await request(app).get('/api/system-metrics?limit=50');

      const allCall = mockDb.db.prepare().all.mock.calls[0];
      expect(allCall[0]).toBe(50);
    });

    test('should accept custom offset', async () => {
      await request(app).get('/api/system-metrics?offset=20');

      const allCall = mockDb.db.prepare().all.mock.calls[0];
      expect(allCall[1]).toBe(20);
    });

    test('should parse limit and offset as integers', async () => {
      await request(app).get('/api/system-metrics?limit=25&offset=10');

      const allCall = mockDb.db.prepare().all.mock.calls[0];
      expect(allCall[0]).toBe(25);
      expect(allCall[1]).toBe(10);
    });

    test('should handle string limit and offset', async () => {
      await request(app).get('/api/system-metrics?limit=30&offset=5');

      const allCall = mockDb.db.prepare().all.mock.calls[0];
      expect(typeof allCall[0]).toBe('number');
      expect(typeof allCall[1]).toBe('number');
    });

    test('should return 500 when raven database not found', async () => {
      mockDeps.projectDatabases.delete('raven');

      // Recreate app
      app = express();
      app.use(express.json());
      app.use('/api', createTelemetryRoutes(mockDeps));

      const response = await request(app).get('/api/system-metrics');

      expect(response.status).toBe(500);
      expect(response.body.error).toContain('Raven database not found');
    });

    test('should return 500 when database query throws error', async () => {
      mockDb.db.prepare.mockImplementation(() => {
        throw new Error('Query error');
      });

      const response = await request(app).get('/api/system-metrics');

      expect(response.status).toBe(500);
      expect(response.body.error).toContain('Query error');
    });

    test('should query raven_metrics table', async () => {
      await request(app).get('/api/system-metrics');

      const query = mockDb.db.prepare.mock.calls[0][0];
      expect(query).toContain('FROM raven_metrics');
    });

    test('should order by timestamp DESC', async () => {
      await request(app).get('/api/system-metrics');

      const query = mockDb.db.prepare.mock.calls[0][0];
      expect(query).toContain('ORDER BY timestamp DESC');
    });
  });

  describe('GET /api/process-metrics', () => {
    beforeEach(() => {
      mockDeps.projectDatabases.set('raven', mockDb);
    });

    test('should return metrics with default limit and offset', async () => {
      const response = await request(app).get('/api/process-metrics');

      expect(response.status).toBe(200);
      expect(response.body).toEqual([
        { id: 1, metric: 'test', timestamp: '2024-01-01T00:00:00Z' }
      ]);
    });

    test('should use default limit of 100', async () => {
      await request(app).get('/api/process-metrics');

      const allCall = mockDb.db.prepare().all.mock.calls[0];
      expect(allCall.includes(100)).toBe(true);
    });

    test('should use default offset of 0', async () => {
      await request(app).get('/api/process-metrics');

      const allCall = mockDb.db.prepare().all.mock.calls[0];
      expect(allCall.includes(0)).toBe(true);
    });

    test('should accept custom limit', async () => {
      await request(app).get('/api/process-metrics?limit=50');

      const allCall = mockDb.db.prepare().all.mock.calls[0];
      expect(allCall.includes(50)).toBe(true);
    });

    test('should accept custom offset', async () => {
      await request(app).get('/api/process-metrics?offset=20');

      const allCall = mockDb.db.prepare().all.mock.calls[0];
      expect(allCall.includes(20)).toBe(true);
    });

    test('should filter by agent when provided', async () => {
      await request(app).get('/api/process-metrics?agent=test-agent');

      const query = mockDb.db.prepare.mock.calls[0][0];
      expect(query).toContain('WHERE agent_name = ?');

      const allCall = mockDb.db.prepare().all.mock.calls[0];
      expect(allCall[0]).toBe('test-agent');
    });

    test('should not filter by agent when not provided', async () => {
      await request(app).get('/api/process-metrics');

      const query = mockDb.db.prepare.mock.calls[0][0];
      expect(query).not.toContain('WHERE');
    });

    test('should parse limit and offset as integers', async () => {
      await request(app).get('/api/process-metrics?limit=25&offset=10');

      const allCall = mockDb.db.prepare().all.mock.calls[0];
      const hasCorrectLimit = allCall.some(arg => arg === 25);
      const hasCorrectOffset = allCall.some(arg => arg === 10);

      expect(hasCorrectLimit).toBe(true);
      expect(hasCorrectOffset).toBe(true);
    });

    test('should return 500 when raven database not found', async () => {
      mockDeps.projectDatabases.delete('raven');

      // Recreate app
      app = express();
      app.use(express.json());
      app.use('/api', createTelemetryRoutes(mockDeps));

      const response = await request(app).get('/api/process-metrics');

      expect(response.status).toBe(500);
      expect(response.body.error).toContain('Raven database not found');
    });

    test('should return 500 when database query throws error', async () => {
      mockDb.db.prepare.mockImplementation(() => {
        throw new Error('Query error');
      });

      const response = await request(app).get('/api/process-metrics');

      expect(response.status).toBe(500);
      expect(response.body.error).toContain('Query error');
    });

    test('should query process_metrics table', async () => {
      await request(app).get('/api/process-metrics');

      const query = mockDb.db.prepare.mock.calls[0][0];
      expect(query).toContain('FROM process_metrics');
    });

    test('should order by timestamp DESC', async () => {
      await request(app).get('/api/process-metrics');

      const query = mockDb.db.prepare.mock.calls[0][0];
      expect(query).toContain('ORDER BY timestamp DESC');
    });

    test('should combine agent filter with limit and offset', async () => {
      await request(app).get('/api/process-metrics?agent=test-agent&limit=50&offset=10');

      const query = mockDb.db.prepare.mock.calls[0][0];
      expect(query).toContain('WHERE agent_name = ?');
      expect(query).toContain('LIMIT ? OFFSET ?');

      const allCall = mockDb.db.prepare().all.mock.calls[0];
      expect(allCall).toEqual(['test-agent', 50, 10]);
    });
  });

  describe('GET /api/process-metrics/:agent', () => {
    beforeEach(() => {
      mockDeps.projectDatabases.set('raven', mockDb);
    });

    test('should return metrics for specific agent', async () => {
      const response = await request(app).get('/api/process-metrics/test-agent');

      expect(response.status).toBe(200);
      expect(response.body).toEqual([
        { agent: 'test-agent', cpu: 50, memory: 100 }
      ]);
    });

    test('should call getProcessMetricsByAgent with correct agent', async () => {
      await request(app).get('/api/process-metrics/my-agent');

      expect(mockDb.getProcessMetricsByAgent).toHaveBeenCalledWith('my-agent', 100);
    });

    test('should use default limit of 100', async () => {
      await request(app).get('/api/process-metrics/test-agent');

      expect(mockDb.getProcessMetricsByAgent).toHaveBeenCalledWith('test-agent', 100);
    });

    test('should accept custom limit', async () => {
      await request(app).get('/api/process-metrics/test-agent?limit=50');

      expect(mockDb.getProcessMetricsByAgent).toHaveBeenCalledWith('test-agent', 50);
    });

    test('should parse limit as integer', async () => {
      await request(app).get('/api/process-metrics/test-agent?limit=75');

      const limitArg = mockDb.getProcessMetricsByAgent.mock.calls[0][1];
      expect(typeof limitArg).toBe('number');
      expect(limitArg).toBe(75);
    });

    test('should handle agent names with special characters', async () => {
      await request(app).get('/api/process-metrics/agent-with-dashes');

      expect(mockDb.getProcessMetricsByAgent).toHaveBeenCalledWith('agent-with-dashes', 100);
    });

    test('should return 500 when raven database not found', async () => {
      mockDeps.projectDatabases.delete('raven');

      // Recreate app
      app = express();
      app.use(express.json());
      app.use('/api', createTelemetryRoutes(mockDeps));

      const response = await request(app).get('/api/process-metrics/test-agent');

      expect(response.status).toBe(500);
      expect(response.body.error).toContain('Raven database not found');
    });

    test('should return 500 when getProcessMetricsByAgent throws error', async () => {
      mockDb.getProcessMetricsByAgent.mockImplementation(() => {
        throw new Error('Metrics error');
      });

      const response = await request(app).get('/api/process-metrics/test-agent');

      expect(response.status).toBe(500);
      expect(response.body.error).toContain('Metrics error');
    });
  });
});
