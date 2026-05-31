/**
 * Persona Routes — Raven's read on the user.
 *
 * GET  /api/persona            → the cached persona (recomputed on a 6h miss)
 * POST /api/persona/recompute  → force a fresh recompute
 */

import express, { Request, Response, Router } from 'express';
import type { PersonaService } from '../services/persona-service.js';
import { asyncHandler } from '../middleware/async-handler.js';
import { cacheMiddleware } from '../services/cache-service.js';

export function createPersonaRouter(personaService: PersonaService): Router {
  const router = express.Router();

  router.get(
    '/',
    cacheMiddleware(30000),
    asyncHandler(async (_req: Request, res: Response) => {
      res.json(personaService.get());
    })
  );

  router.post(
    '/recompute',
    asyncHandler(async (_req: Request, res: Response) => {
      res.json(personaService.recompute());
    })
  );

  return router;
}
