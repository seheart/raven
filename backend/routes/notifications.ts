/**
 * Notifications Routes — `/api/notifications/*`
 */

import express, { Request, Response, Router } from 'express';
import { safeInt } from '../utils/request-helpers.js';
import type { NotificationsRepository } from '../repositories/notifications-repository.js';

export function createNotificationsRouter(repo: NotificationsRepository): Router {
  const router = express.Router();

  router.get('/', (req: Request, res: Response) => {
    const limit = Math.min(safeInt(req.query.limit, 50), 500);
    return res.json(repo.list(limit));
  });

  router.get('/stats', (_req: Request, res: Response) => {
    return res.json(repo.count());
  });

  return router;
}
