/**
 * Telemetry Routes - Agent telemetry endpoint
 *
 * POST /telemetry - Receive agent telemetry events
 */

import { Router, Request, Response } from 'express';
import type { RavenDB } from '../db.js';
import type { TriggerEngine } from '../trigger-engine.js';
import type { Server as SocketIOServer } from 'socket.io';
import { logger } from '../utils/logger.js';

export interface TelemetryDependencies {
  db: RavenDB;
  triggerEngine: TriggerEngine;
  io: SocketIOServer;
  sessionId: string;
  agentRegistry: Map<string, any>;
  getAgentColor: (agentName: string) => string;
}

export function createTelemetryRouter(deps: TelemetryDependencies): Router {
  const router = Router();
  const { db, triggerEngine, io, sessionId, agentRegistry, getAgentColor } = deps;

  /**
   * POST /telemetry
   * Receive telemetry events from AI agents
   */
  router.post('/telemetry', (req: Request, res: Response) => {
    try {
      const { agent, event, file, lines_changed, duration_ms, message, metadata } = req.body;

      // Validate required fields
      if (!agent || !event || !message) {
        return res.status(400).json({
          error: 'Missing required fields: agent, event, message'
        });
      }

      const timestamp = new Date().toISOString();

      // Insert into database
      const eventId = db.insertAgentEvent(
        timestamp,
        agent,
        event,
        file,
        lines_changed,
        duration_ms,
        message,
        metadata,
        sessionId
      );

      // Update agent registry
      if (!agentRegistry.has(agent)) {
        agentRegistry.set(agent, {
          agent_name: agent,
          agent_type: agent,
          is_running: true,
          last_seen: timestamp,
          models_available: [],
          requests_handled: 0,
          errors: 0,
          color: getAgentColor(agent)
        });
      }

      const agentStatus = agentRegistry.get(agent)!;
      agentStatus.last_seen = timestamp;
      agentStatus.requests_handled++;
      agentStatus.is_running = true;

      // Evaluate triggers
      triggerEngine.evaluate({
        file,
        agent,
        event_type: event,
        lines_changed,
        duration_ms
      });

      logger.info('Telemetry event received', {
        agent,
        event,
        message,
        file,
        lines_changed,
        duration_ms
      });

      // Emit real-time event via WebSocket
      io.emit('agent-event', {
        id: eventId,
        timestamp,
        agent,
        event_type: event,
        file,
        lines_changed,
        duration_ms,
        message,
        metadata
      });

      // Emit updated agent stats
      io.emit('agent-stats', db.getAgentStats());

      res.json({
        success: true,
        event_id: eventId,
        session_id: sessionId
      });
    } catch (error: any) {
      logger.error('Telemetry error', {
        error: error.message,
        stack: error.stack
      });
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}
