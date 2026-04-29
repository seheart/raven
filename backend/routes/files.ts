/**
 * Files Routes — `/api/file-events`, `/api/file-diff/:filepath`, `/api/tracked-files`
 *
 * Legacy file-event endpoints. The newer events router serves `/api/events`.
 * Merge once the frontend migrates off `/api/file-events`.
 */

import express, { Request, Response, Router } from 'express';
import fs from 'fs/promises';
import { join } from 'path';
import { cacheMiddleware } from '../services/cache-service.js';
import { safeInt } from '../utils/request-helpers.js';
import { createPatch } from '../modules/diff.js';
import type { RavenDB } from '../db.js';
import type { FileEventsRepository } from '../repositories/file-events-repository.js';

interface FilesRouterDeps {
  db: RavenDB;
  fileEventsRepo: FileEventsRepository;
  snapshotsDir: string;
}

export function createFilesRouter({ db, fileEventsRepo, snapshotsDir }: FilesRouterDeps): Router {
  const router = express.Router();

  // GET /api/file-events
  router.get('/file-events', cacheMiddleware(5000), (req: Request, res: Response) => {
    try {
      const limit = safeInt(req.query.limit, 100);
      const includeDiff = req.query.diff === 'true';
      const events = fileEventsRepo.list({
        limit,
        includeDiff,
        project: req.query.project as string | undefined,
        filepath: req.query.filepath as string | undefined,
        startTime: req.query.start_time as string | undefined,
        endTime: req.query.end_time as string | undefined
      });
      return res.json(events);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return res.status(500).json({ error: message });
    }
  });

  // GET /api/file-diff/:filepath(*)
  // Computes a unified diff between the two most-recent snapshots of a file.
  router.get('/file-diff/:filepath(*)', async (req: Request, res: Response) => {
    try {
      const filepath = req.params.filepath;
      const prefix = `${filepath.replace(/\//g, '_')}_`;

      let snapshotNames: string[] = [];
      try {
        const all = await fs.readdir(snapshotsDir);
        snapshotNames = all
          .filter(name => name.startsWith(prefix))
          .sort((a, b) => {
            const ta = parseInt(a.split('_').pop() || '0', 10);
            const tb = parseInt(b.split('_').pop() || '0', 10);
            return tb - ta; // newest first
          });
      } catch {
        // Snapshots directory missing — treat as no snapshots
      }

      if (snapshotNames.length === 0) {
        return res.json({ filepath, diff: '', type: 'no-snapshots' });
      }

      const readSnapshot = (name: string) => fs.readFile(join(snapshotsDir, name), 'utf8');

      if (snapshotNames.length < 2) {
        const content = await readSnapshot(snapshotNames[0]);
        const lines = content.split('\n');
        const unifiedDiff = [
          `--- /dev/null`,
          `+++ ${filepath}`,
          `@@ -0,0 +1,${lines.length} @@`,
          ...lines.map(l => `+${l}`)
        ].join('\n');
        return res.json({ filepath, diff: unifiedDiff, type: 'new' });
      }

      // Walk back from newest until we find a snapshot whose content differs
      // from the latest. Handles cases where consecutive snapshots are
      // byte-identical.
      const currentContent = await readSnapshot(snapshotNames[0]);
      let previousContent: string | null = null;
      let previousName: string | null = null;
      for (let i = 1; i < snapshotNames.length; i++) {
        const candidate = await readSnapshot(snapshotNames[i]);
        if (candidate !== currentContent) {
          previousContent = candidate;
          previousName = snapshotNames[i];
          break;
        }
      }

      if (previousContent === null) {
        return res.json({ filepath, diff: '', type: 'unchanged' });
      }

      const diff = await createPatch(previousContent, currentContent, filepath);
      return res.json({
        filepath,
        diff,
        type: 'modified',
        from: previousName,
        to: snapshotNames[0]
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return res.status(500).json({ error: message });
    }
  });

  // GET /api/tracked-files
  router.get('/tracked-files', cacheMiddleware(5000), (_req: Request, res: Response) => {
    try {
      const files = fileEventsRepo.trackedFiles();
      return res.json(files);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return res.status(500).json({ error: message });
    }
  });

  // GET /api/files/:filepath(*)/history
  router.get('/files/:filepath(*)/history', (req: Request, res: Response) => {
    try {
      const filepath = decodeURIComponent(req.params.filepath);
      const limit = Math.min(safeInt(req.query.limit, 50), 500);
      return res.json(fileEventsRepo.history(filepath, limit));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return res.status(500).json({ error: message });
    }
  });

  return router;
}
