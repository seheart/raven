/**
 * Telemetry POST — `/telemetry`
 *
 * Inbound endpoint for agents to record events. Mutates the in-memory
 * agent registry, evaluates triggers, and emits a websocket update.
 *
 * The deps shape is wider than other routers because telemetry sits at the
 * intersection of DB writes, registry mutation, trigger evaluation, and
 * realtime fan-out. Keeping it together lets us extract it without untangling
 * those concerns first.
 */

import express, { Request, Response, Router } from 'express';
import { z } from 'zod';
import type { Server as SocketIOServer } from 'socket.io';
import { logger } from '../utils/logger.js';
import { getAgentColor } from '../utils/agent-colors.js';
import type { RavenDB } from '../db.js';
import type { AgentInfo } from '../types/agent-info.js';
import type { AgentEventsRepository } from '../repositories/agent-events-repository.js';

const TelemetrySchema = z.object({
  agent: z.string().min(1).max(200),
  event: z.string().min(1).max(200),
  message: z.string().min(1).max(10_000),
  file: z.string().max(1000).optional(),
  lines_changed: z.number().int().nonnegative().optional(),
  duration_ms: z.number().nonnegative().optional(),
  metadata: z.record(z.string(), z.unknown()).optional()
});

interface TriggerEngineLike {
  evaluate(input: {
    file?: string;
    agent: string;
    event_type: string;
    lines_changed?: number;
    duration_ms?: number;
  }): void;
}

interface TelemetryDeps {
  db: RavenDB;
  io: SocketIOServer;
  sessionId: string;
  agentRegistry: Map<string, AgentInfo>;
  triggerEngine: TriggerEngineLike;
  scheduleAgentStatsBroadcast: () => void;
  agentEventsRepo: AgentEventsRepository;
}

export function createTelemetryRouter(deps: TelemetryDeps): Router {
  const router = express.Router();

  router.post('/', (req: Request, res: Response) => {
    const parsed = TelemetrySchema.safeParse(req.body);
    if (!parsed.success) {
      return res
        .status(400)
        .json({ error: 'Invalid telemetry payload', issues: parsed.error.issues });
    }
    try {
      const { agent, event, file, lines_changed, duration_ms, message, metadata } = parsed.data;
      const timestamp = new Date().toISOString();
      const eventId = deps.agentEventsRepo.insert(
        timestamp,
        agent,
        event,
        file,
        lines_changed,
        duration_ms,
        message,
        metadata,
        deps.sessionId,
        null // project_name (multi-project not yet supported here)
      );

      // Update or create the registry entry
      if (!deps.agentRegistry.has(agent)) {
        if (deps.agentRegistry.size >= 100) {
          const oldestKey = deps.agentRegistry.keys().next().value;
          if (oldestKey) deps.agentRegistry.delete(oldestKey);
        }
        deps.agentRegistry.set(agent, {
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
      const status = deps.agentRegistry.get(agent)!;
      status.last_seen = timestamp;
      status.requests_handled++;
      status.is_running = true;

      deps.triggerEngine.evaluate({
        file,
        agent,
        event_type: event,
        lines_changed,
        duration_ms
      });

      deps.io.emit('agent-event', {
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

      deps.scheduleAgentStatsBroadcast();

      return res.json({ success: true, event_id: eventId, session_id: deps.sessionId });
    } catch (error) {
      logger.error('❌ Telemetry error:', error as Error);
      const message = error instanceof Error ? error.message : String(error);
      return res.status(500).json({ error: message });
    }
  });

  return router;
}
