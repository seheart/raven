/**
 * Conversations Routes — `/api/conversations*`
 *
 * Surfaces user/assistant/tool-call turns from `agent_events` for the
 * conversations page.
 */

import express, { Request, Response, Router } from 'express';
import { cacheMiddleware } from '../services/cache-service.js';
import { safeInt } from '../utils/request-helpers.js';
import type { AgentEventsRepository } from '../repositories/agent-events-repository.js';

export function createConversationsRouter(repo: AgentEventsRepository): Router {
  const router = express.Router();

  router.get('/', cacheMiddleware(5000), (req: Request, res: Response) => {
    const limit = Math.min(safeInt(req.query.limit, 50), 500);
    const offset = safeInt(req.query.offset, 0);
    const eventType = req.query.event_type as string | undefined;
    const project = req.query.project as string | undefined;
    return res.json(repo.conversations(eventType, limit, offset, project));
  });

  router.get('/stats', cacheMiddleware(5000), (_req: Request, res: Response) => {
    return res.json(repo.conversationStats());
  });

  return router;
}
