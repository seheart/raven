import express, { Request, Response, Router } from 'express';
import type { TriggerEngine } from '../trigger-engine.js';
import { safeInt } from '../utils/request-helpers.js';

export function createTriggersRouter(triggerEngine: TriggerEngine): Router {
  const router = express.Router();

  router.get('/triggers-config', (_req: Request, res: Response) => {
    try {
      const triggers = triggerEngine.getTriggersConfig();
      return res.json({ rules: triggers });
    } catch (error: any) {
      return res.status(500).json({ error: error.message });
    }
  });

  router.get('/triggered-events', (req: Request, res: Response) => {
    try {
      const limit = safeInt(req.query.limit, 100);
      const events = triggerEngine.getTriggeredEvents(limit);
      return res.json(events);
    } catch (error: any) {
      return res.status(500).json({ error: error.message });
    }
  });

  router.post('/triggers-reload', (_req: Request, res: Response) => {
    try {
      const message = triggerEngine.reloadConfig();
      return res.json({ message });
    } catch (error: any) {
      return res.status(500).json({ error: error.message });
    }
  });

  router.get('/trigger-stats', (_req: Request, res: Response) => {
    try {
      const stats = triggerEngine.getTriggerStats();
      return res.json(stats);
    } catch (error: any) {
      return res.status(500).json({ error: error.message });
    }
  });

  router.post('/triggers-clear-cooldowns', (_req: Request, res: Response) => {
    try {
      const message = triggerEngine.clearCooldowns();
      return res.json({ message });
    } catch (error: any) {
      return res.status(500).json({ error: error.message });
    }
  });

  return router;
}
