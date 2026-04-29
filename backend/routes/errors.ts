/**
 * Errors Routes — `/api/errors/*`
 *
 * Application-level error tracking. The frontend posts JS errors here for
 * dashboard surfacing.
 */

import express, { Request, Response, Router } from 'express';
import { z } from 'zod';
import type { Server as SocketIOServer } from 'socket.io';
import { cacheMiddleware } from '../services/cache-service.js';
import { safeInt } from '../utils/request-helpers.js';
import type { ErrorsRepository } from '../repositories/errors-repository.js';

// Schema for POST /api/errors — validates the body the frontend sends when
// it captures a JS error. All fields optional with sensible defaults so
// older clients still work; unknown extras are stripped.
const ErrorInsertSchema = z.object({
  error_type: z.string().max(100).optional(),
  message: z.string().max(10_000).optional(),
  stack: z.string().max(50_000).nullish(),
  component: z.string().max(200).optional(),
  severity: z.enum(['debug', 'info', 'warn', 'error', 'critical']).optional(),
  url: z.string().max(2048).nullish(),
  user_agent: z.string().max(2048).nullish(),
  metadata: z.unknown().optional()
});

export function createErrorsRouter(repo: ErrorsRepository, io: SocketIOServer): Router {
  const router = express.Router();

  // GET /api/errors — paginated list with optional search/severity filter
  router.get('/', cacheMiddleware(5000), (req: Request, res: Response) => {
    const limit = Math.min(safeInt(req.query.limit, 50), 500);
    const offset = Math.max(0, safeInt(req.query.offset, 0));
    const search = req.query.search as string | undefined;
    const severity = req.query.severity as string | undefined;

    const result = repo.list({ limit, offset, search, severity });
    return res.json(result);
  });

  // POST /api/errors — log a new error
  router.post('/', (req: Request, res: Response) => {
    const parsed = ErrorInsertSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Invalid error payload',
        issues: parsed.error.issues
      });
    }
    const body = parsed.data;
    repo.insert(body);
    io.emit('app-error', {
      error_type: body.error_type,
      message: body.message,
      component: body.component,
      severity: body.severity,
      timestamp: new Date().toISOString()
    });
    return res.json({ success: true });
  });

  // GET /api/errors/stats — counts by severity / component + recent
  router.get('/stats', cacheMiddleware(5000), (_req: Request, res: Response) => {
    return res.json(repo.getStats());
  });

  // DELETE /api/errors/clear — wipe all
  router.delete('/clear', (_req: Request, res: Response) => {
    repo.clear();
    io.emit('errors-cleared');
    return res.json({ success: true, message: 'All errors cleared' });
  });

  return router;
}
