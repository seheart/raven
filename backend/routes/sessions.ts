/**
 * Sessions Routes — `/api/sessions/*`
 *
 * Used by the rollback UI to list recent sessions and preview which files
 * have a pre-session snapshot available.
 */

import express, { Request, Response, Router } from 'express';
import fs from 'fs/promises';
import { logger } from '../utils/logger.js';
import type { SessionsRepository } from '../repositories/sessions-repository.js';

interface SessionsDeps {
  repo: SessionsRepository;
  snapshotsDir: string;
}

export function createSessionsRouter({ repo, snapshotsDir }: SessionsDeps): Router {
  const router = express.Router();

  // GET /api/sessions
  router.get('/', async (_req: Request, res: Response) => {
    try {
      const sessions = repo.listRecent(20);
      return res.json({ sessions, count: sessions.length });
    } catch (error) {
      logger.error('[GET /api/sessions] Error:', error as Error);
      return res.status(500).json({ error: 'Failed to get sessions' });
    }
  });

  // GET /api/sessions/:sessionId/preview
  router.get('/:sessionId/preview', async (req: Request, res: Response) => {
    try {
      const { sessionId } = req.params;
      const files = repo.filesInSession(sessionId);

      let snapshots: string[] = [];
      try {
        snapshots = await fs.readdir(snapshotsDir);
      } catch {
        // Snapshots dir may not exist
      }

      const sessionStartMs = repo.sessionStartMs(sessionId);

      const changes = await Promise.all(
        files.map(async ({ filepath }) => {
          const prefix = filepath.replace(/\//g, '_');
          const fileSnapshots = snapshots
            .filter(s => s.startsWith(prefix))
            .map(s => ({ name: s, timestamp: parseInt(s.split('_').pop() || '0', 10) }))
            .sort((a, b) => b.timestamp - a.timestamp);
          const beforeSnapshot = fileSnapshots.find(s => s.timestamp < sessionStartMs);
          let currentExists = false;
          try {
            await fs.access(filepath);
            currentExists = true;
          } catch {
            currentExists = false;
          }
          return {
            filepath,
            hasBackup: !!beforeSnapshot,
            snapshotName: beforeSnapshot?.name,
            currentExists
          };
        })
      );

      return res.json({
        sessionId,
        fileCount: files.length,
        changes,
        canRollback: changes.some(c => c.hasBackup)
      });
    } catch (error) {
      logger.error('[GET /api/sessions/:sessionId/preview] Error:', error as Error);
      return res.status(500).json({ error: 'Failed to preview rollback' });
    }
  });

  return router;
}
