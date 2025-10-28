/**
 * Tests for Telemetry Route Module
 * Tests the modular telemetry endpoint extracted in Phase 3
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
      getAgentStats: jest.fn().mockReturnValue({ total: 10, errors: 0 })
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
      io: mockIo
    };

    // Create Express app with telemetry routes
    app = express();
    app.use(express.json());
    app.use('/telemetry', createTelemetryRoutes(mockDeps));
  });

  describe('POST /telemetry', () => {
    test('should accept valid telemetry data', async () => {
      const response = await request(app)
        .post('/telemetry')
        .send({
          agent: 'test-agent',
          event: 'test-event',
          message: 'Test message',
          file: 'test.js',
          lines_changed: 10,
          duration_ms: 500
        });

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        success: true,
        event_id: 123,
        session_id: 'test-session-123',
        project: 'test-project'
      });
    });

    test('should insert event into project database', async () => {
      await request(app)
        .post('/telemetry')
        .send({
          agent: 'test-agent',
          event: 'test-event',
          message: 'Test message'
        });

      expect(mockDb.insertAgentEvent).toHaveBeenCalledWith(
        expect.any(String), // timestamp
        'test-agent',
        'test-event',
        undefined, // file
        undefined, // lines_changed
        undefined, // duration_ms
        'Test message',
        undefined, // metadata
        'test-session-123'
      );
    });

    test('should log to developer database', async () => {
      await request(app)
        .post('/telemetry')
        .send({
          agent: 'test-agent',
          event: 'test-event',
          message: 'Test message'
        });

      expect(mockDeveloperDB.logAgentInteraction).toHaveBeenCalledWith(
        expect.objectContaining({
          project: 'test-project',
          agent_name: 'test-agent',
          event_type: 'test-event',
          message: 'Test message',
          session_id: 'test-session-123'
        })
      );
    });

    test('should evaluate triggers if trigger engine exists', async () => {
      await request(app)
        .post('/telemetry')
        .send({
          agent: 'test-agent',
          event: 'test-event',
          message: 'Test message',
          file: 'test.js',
          lines_changed: 10
        });

      expect(mockTriggerEngine.evaluateTriggers).toHaveBeenCalledWith(
        expect.objectContaining({
          agent: 'test-agent',
          event_type: 'test-event',
          file: 'test.js',
          lines_changed: 10,
          project: 'test-project'
        })
      );
    });

    test('should emit WebSocket events', async () => {
      await request(app)
        .post('/telemetry')
        .send({
          agent: 'test-agent',
          event: 'edit',
          message: 'Test message',
          file: 'test.js'
        });

      // Should emit agent-event
      expect(mockIo.emit).toHaveBeenCalledWith(
        'agent-event',
        expect.objectContaining({
          id: 123,
          agent: 'test-agent',
          event_type: 'edit',
          project: 'test-project'
        })
      );

      // Should emit file-changed event
      expect(mockIo.emit).toHaveBeenCalledWith(
        'file-changed',
        expect.objectContaining({
          filepath: 'test.js',
          change_type: 'edit',
          project: 'test-project',
          agent: 'test-agent'
        })
      );

      // Should emit agent-stats
      expect(mockIo.emit).toHaveBeenCalledWith('agent-stats', { total: 10, errors: 0 });
    });

    test('should update agent registry', async () => {
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
    });

    test('should reject missing required fields', async () => {
      const response = await request(app)
        .post('/telemetry')
        .send({
          agent: 'test-agent'
          // missing event and message
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Missing required fields');
    });

    test('should validate agent field type and length', async () => {
      const response = await request(app)
        .post('/telemetry')
        .send({
          agent: 'a'.repeat(101), // Too long
          event: 'test',
          message: 'test'
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Invalid agent');
    });

    test('should validate event field type and length', async () => {
      const response = await request(app)
        .post('/telemetry')
        .send({
          agent: 'test',
          event: 'a'.repeat(101), // Too long
          message: 'test'
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Invalid event');
    });

    test('should validate message field type and length', async () => {
      const response = await request(app)
        .post('/telemetry')
        .send({
          agent: 'test',
          event: 'test',
          message: 'a'.repeat(1001) // Too long
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Invalid message');
    });

    test('should validate lines_changed range', async () => {
      const response = await request(app)
        .post('/telemetry')
        .send({
          agent: 'test',
          event: 'test',
          message: 'test',
          lines_changed: 2000000 // Too high
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Invalid lines_changed');
    });

    test('should validate duration_ms range', async () => {
      const response = await request(app)
        .post('/telemetry')
        .send({
          agent: 'test',
          event: 'test',
          message: 'test',
          duration_ms: 5000000 // Too high (> 1 hour)
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Invalid duration_ms');
    });

    test('should handle trigger engine being null', async () => {
      // Remove trigger engine
      mockDeps.triggerEngine = null;

      // Recreate app with null trigger engine
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

    test('should default to raven project if available', async () => {
      mockDeps.availableProjects = [
        { name: 'other-project' },
        { name: 'raven' }
      ];
      mockDeps.projectDatabases.set('raven', mockDb);

      await request(app)
        .post('/telemetry')
        .send({
          agent: 'test-agent',
          event: 'test-event',
          message: 'Test message'
        });

      expect(mockDb.insertAgentEvent).toHaveBeenCalled();
    });

    test('should use explicit project if provided', async () => {
      const customDb = {
        insertAgentEvent: jest.fn().mockReturnValue(456),
        getAgentStats: jest.fn().mockReturnValue({ total: 5 })
      };

      mockDeps.projectDatabases.set('custom-project', customDb);
      mockDeps.availableProjects.push({ name: 'custom-project' });

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

    test('should not emit file-changed for session events', async () => {
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
  });
});
