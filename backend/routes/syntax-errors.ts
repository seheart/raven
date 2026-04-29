/**
 * Syntax Errors Routes — `/api/syntax-errors/*`
 */

import express, { Request, Response, Router } from 'express';
import { z } from 'zod';
import type { SyntaxErrorsRepository } from '../repositories/syntax-errors-repository.js';
import { logger } from '../utils/logger.js';
import { safeInt } from '../utils/request-helpers.js';

const ResolveParamSchema = z.object({
  id: z.coerce.number().int().positive()
});

export function createSyntaxErrorsRouter(repo: SyntaxErrorsRepository): Router {
  const router = express.Router();

  // GET / — unresolved syntax errors
  router.get('/', async (req: Request, res: Response) => {
    try {
      const limit = safeInt(req.query.limit, 100);
      const errors = repo.list(limit);
      return res.json({ errors, count: errors.length });
    } catch (error) {
      logger.error('[GET /api/syntax-errors] Error:', error as Error);
      return res.status(500).json({ error: 'Failed to get syntax errors' });
    }
  });

  // GET /count
  router.get('/count', async (_req: Request, res: Response) => {
    try {
      return res.json({ count: repo.countUnresolved() });
    } catch (error) {
      logger.error('[GET /api/syntax-errors/count] Error:', error as Error);
      return res.status(500).json({ error: 'Failed to get syntax error count' });
    }
  });

  // POST /:id/resolve
  router.post('/:id/resolve', async (req: Request, res: Response) => {
    const parsed = ResolveParamSchema.safeParse(req.params);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid error ID', issues: parsed.error.issues });
    }
    try {
      repo.resolveById(parsed.data.id);
      return res.json({ success: true, message: 'Syntax error marked as resolved' });
    } catch (error) {
      logger.error('[POST /api/syntax-errors/:id/resolve] Error:', error as Error);
      return res.status(500).json({ error: 'Failed to resolve syntax error' });
    }
  });

  return router;
}
