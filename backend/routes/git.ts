import express, { Request, Response, Router } from 'express';
import type { GitMonitor } from '../modules/index.js';
import { safeInt } from '../utils/request-helpers.js';

export function createGitRouter(gitMonitor: GitMonitor): Router {
  const router = express.Router();

  router.get('/status', async (_req: Request, res: Response) => {
    try {
      const status = await gitMonitor.checkStatus();
      return res.json(status || gitMonitor.getLastStatus());
    } catch (error: any) {
      return res.status(500).json({ error: error.message });
    }
  });

  router.get('/diff', async (_req: Request, res: Response) => {
    try {
      const diff = await gitMonitor.getUncommittedDiff();
      return res.json({ diff });
    } catch (error: any) {
      return res.status(500).json({ error: error.message });
    }
  });

  router.get('/branches', async (_req: Request, res: Response) => {
    try {
      const branches = await gitMonitor.getBranches();
      return res.json({ branches });
    } catch (error: any) {
      return res.status(500).json({ error: error.message });
    }
  });

  router.get('/history', async (req: Request, res: Response) => {
    try {
      const limit = safeInt(req.query.limit, 10);
      const commits = await gitMonitor.getCommitHistory(limit);
      return res.json({ commits });
    } catch (error: any) {
      return res.status(500).json({ error: error.message });
    }
  });

  return router;
}
