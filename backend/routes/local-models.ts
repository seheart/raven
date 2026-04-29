/**
 * Local Models Route — `/api/local-models`
 * Reports detected and running local model endpoints (Ollama, LM Studio, etc.)
 */

import express, { Request, Response, Router } from 'express';
import type { LocalModelWatcher } from '../services/local-model-watcher.js';

export function createLocalModelsRouter(watcher: LocalModelWatcher): Router {
  const router = express.Router();

  router.get('/', (_req: Request, res: Response) => {
    const detected = watcher.getDetectedModels();
    const running = watcher.getRunningModels();
    return res.json({
      detected,
      running: running.length,
      total: detected.length
    });
  });

  return router;
}
