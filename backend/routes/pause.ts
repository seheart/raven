/**
 * Pause/Resume Routes — `/api/pause/*`, `/api/resume`
 *
 * Lets the UI suspend file-event ingestion. Backed by the in-memory
 * pause-manager singleton.
 */

import express, { Request, Response, Router } from 'express';
import { z } from 'zod';
import type { Server as SocketIOServer } from 'socket.io';
import { logger } from '../utils/logger.js';

const PauseBodySchema = z.object({
  reason: z.string().max(500).optional()
});

interface PauseManagerLike {
  getStatus(): unknown;
  pause(reason: string): void;
  resume(): void;
}

export function createPauseRouter(pauseManager: PauseManagerLike, io: SocketIOServer): Router {
  const router = express.Router();

  router.get('/pause/status', async (_req: Request, res: Response) => {
    try {
      return res.json(pauseManager.getStatus());
    } catch (error) {
      logger.error('[GET /api/pause/status] Error:', error as Error);
      return res.status(500).json({ error: 'Failed to get pause status' });
    }
  });

  router.post('/pause', async (req: Request, res: Response) => {
    const parsed = PauseBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid pause payload', issues: parsed.error.issues });
    }
    try {
      pauseManager.pause(parsed.data.reason || 'User requested via API');
      const status = pauseManager.getStatus();
      io.emit('monitoring-paused', status);
      return res.json({ success: true, message: 'Monitoring paused', status });
    } catch (error) {
      logger.error('[POST /api/pause] Error:', error as Error);
      return res.status(500).json({ error: 'Failed to pause monitoring' });
    }
  });

  router.post('/resume', async (_req: Request, res: Response) => {
    try {
      pauseManager.resume();
      const status = pauseManager.getStatus();
      io.emit('monitoring-resumed', status);
      return res.json({ success: true, message: 'Monitoring resumed', status });
    } catch (error) {
      logger.error('[POST /api/resume] Error:', error as Error);
      return res.status(500).json({ error: 'Failed to resume monitoring' });
    }
  });

  return router;
}
