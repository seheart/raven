/**
 * Agent-events Routes — `/api/all-agent-events`, `/api/events-by-session/:id`
 */

import express, { Request, Response, Router } from 'express';
import { cacheMiddleware } from '../services/cache-service.js';
import { safeInt } from '../utils/request-helpers.js';
import type { AgentEventsRepository } from '../repositories/agent-events-repository.js';
import type { FileEventsRepository } from '../repositories/file-events-repository.js';

export function createAgentEventsRoutesRouter(
  agentEventsRepo: AgentEventsRepository,
  fileEventsRepo: FileEventsRepository
): Router {
  const router = express.Router();

  router.get('/all-agent-events', cacheMiddleware(5000), (req: Request, res: Response) => {
    const limit = Math.min(safeInt(req.query.limit, 100), 1000);
    const events = agentEventsRepo.recent(limit);
    return res.json(events);
  });

  router.get(
    '/events-by-session/:sessionId',
    cacheMiddleware(3000),
    (req: Request, res: Response) => {
      try {
        const events = fileEventsRepo.bySession(req.params.sessionId);
        return res.json(events);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return res.status(500).json({ error: message });
      }
    }
  );

  return router;
}
