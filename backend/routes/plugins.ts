/**
 * Plugin Routes — list / enable / disable / reload user plugins.
 */

import express, { Request, Response, Router } from 'express';
import type { PluginRuntime } from '../services/plugin-runtime.js';
import { asyncHandler } from '../middleware/async-handler.js';

export function createPluginsRouter(runtime: PluginRuntime): Router {
  const router = express.Router();

  /** GET /api/plugins — manifests for every loaded plugin. */
  router.get(
    '/',
    asyncHandler(async (_req: Request, res: Response) => {
      res.json(runtime.list());
    })
  );

  /** POST /api/plugins/reload — re-scan the plugins directory. */
  router.post(
    '/reload',
    asyncHandler(async (_req: Request, res: Response) => {
      const result = runtime.reload();
      res.json({ ...result, plugins: runtime.list() });
    })
  );

  /** POST /api/plugins/:name/enable */
  router.post(
    '/:name/enable',
    asyncHandler(async (req: Request, res: Response) => {
      const ok = runtime.enable(String(req.params.name));
      if (!ok) {
        res.status(404).json({ error: 'plugin not found' });
        return;
      }
      res.json({ ok: true });
    })
  );

  /** POST /api/plugins/:name/disable */
  router.post(
    '/:name/disable',
    asyncHandler(async (req: Request, res: Response) => {
      const ok = runtime.disable(String(req.params.name));
      if (!ok) {
        res.status(404).json({ error: 'plugin not found' });
        return;
      }
      res.json({ ok: true });
    })
  );

  /** GET /api/plugins/:name/source — read the on-disk JS for the editor view. */
  router.get(
    '/:name/source',
    asyncHandler(async (req: Request, res: Response) => {
      const src = runtime.readSource(String(req.params.name));
      if (src == null) {
        res.status(404).json({ error: 'plugin not found' });
        return;
      }
      res.type('text/plain').send(src);
    })
  );

  return router;
}
