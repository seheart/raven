/**
 * Storage Routes — `/api/storage/*`
 *
 * Disk-level operations on Raven's data directory: overview, per-project
 * breakdown, export/vacuum/clean per-database, retention policy CRUD.
 */

import express, { Request, Response, Router, RequestHandler } from 'express';
import { z } from 'zod';
import { logger } from '../utils/logger.js';
import { cacheMiddleware } from '../services/cache-service.js';
import {
  StorageRepository,
  InvalidNameError,
  NotFoundError
} from '../repositories/storage-repository.js';

const RetentionSchema = z.object({
  enabled: z.boolean(),
  retentionDays: z.number().int().min(1).max(365),
  autoCleanup: z.boolean(),
  cleanupInterval: z.enum(['daily', 'weekly', 'monthly'])
});

const CleanBodySchema = z.object({
  days: z.coerce.number().int().min(1).max(365)
});

interface StorageDeps {
  repo: StorageRepository;
  expensiveOpLimiter: RequestHandler;
}

export function createStorageRouter({ repo, expensiveOpLimiter }: StorageDeps): Router {
  const router = express.Router();

  // GET /api/storage — overview
  router.get('/', cacheMiddleware(30000), async (_req: Request, res: Response) => {
    try {
      return res.json(await repo.overview());
    } catch (error) {
      logger.error('❌ Error getting storage stats:', error as Error);
      return res.status(500).json({ error: 'Failed to get storage statistics' });
    }
  });

  // GET /api/storage/projects — per-project breakdown
  router.get('/projects', cacheMiddleware(10000), (_req: Request, res: Response) => {
    try {
      return res.json(repo.perProject());
    } catch (error) {
      logger.error('Error getting per-project storage:', error as Error);
      return res.status(500).json({ error: 'Failed to get project storage stats' });
    }
  });

  // GET /api/storage/export/:dbname — download a .db file
  router.get('/export/:dbname', expensiveOpLimiter, async (req: Request, res: Response) => {
    try {
      const path = repo.databasePath(req.params.dbname);
      await repo.ensureDatabaseExists(req.params.dbname);
      return res.download(path, `${req.params.dbname}_${Date.now()}.db`, err => {
        if (err) {
          logger.error('❌ Error sending database file:', err);
          if (!res.headersSent) res.status(500).json({ error: 'Failed to export database' });
        }
      });
    } catch (error) {
      if (error instanceof InvalidNameError) {
        return res.status(400).json({ error: 'Invalid database name' });
      }
      if (error instanceof NotFoundError) {
        return res.status(404).json({ error: 'Database not found' });
      }
      logger.error('❌ Error exporting database:', error as Error);
      return res.status(500).json({ error: 'Failed to export database' });
    }
  });

  // POST /api/storage/vacuum/:dbname — VACUUM + WAL checkpoint
  router.post('/vacuum/:dbname', expensiveOpLimiter, async (req: Request, res: Response) => {
    try {
      if (req.aborted || res.writableEnded) return;
      const result = await repo.vacuum(req.params.dbname);
      if (res.writableEnded) {
        logger.info(`VACUUM completed for ${req.params.dbname}, but client already disconnected`);
        return;
      }
      return res.json({
        success: true,
        message: 'Database optimized successfully',
        ...result
      });
    } catch (error) {
      if (error instanceof InvalidNameError) {
        return res.status(400).json({ error: 'Invalid database name' });
      }
      if (error instanceof NotFoundError) {
        return res.status(404).json({ error: 'Database not found' });
      }
      const message = error instanceof Error ? error.message : String(error);
      logger.error('❌ Error running VACUUM:', error as Error);
      return res.status(500).json({ error: `Failed to optimize database: ${message}` });
    }
  });

  // POST /api/storage/clean/:dbname — delete records older than {days}
  router.post('/clean/:dbname', async (req: Request, res: Response) => {
    const parsed = CleanBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Days must be between 1 and 365' });
    }
    try {
      const result = await repo.cleanOlderThan(req.params.dbname, parsed.data.days);
      return res.json({
        success: true,
        message: `Deleted ${result.totalDeleted} records older than ${parsed.data.days} days`,
        ...result
      });
    } catch (error) {
      if (error instanceof InvalidNameError) {
        return res.status(400).json({ error: 'Invalid database name' });
      }
      if (error instanceof NotFoundError) {
        return res.status(404).json({ error: 'Database not found' });
      }
      const message = error instanceof Error ? error.message : String(error);
      logger.error('❌ Error cleaning old data:', error as Error);
      return res.status(500).json({ error: `Failed to clean old data: ${message}` });
    }
  });

  // GET /api/storage/retention
  router.get('/retention', async (_req: Request, res: Response) => {
    try {
      return res.json(await repo.readRetention());
    } catch (error) {
      logger.error('❌ Error reading retention policy:', error as Error);
      return res.status(500).json({ error: 'Failed to read retention policy' });
    }
  });

  // POST /api/storage/retention
  router.post('/retention', async (req: Request, res: Response) => {
    const parsed = RetentionSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Invalid retention policy',
        issues: parsed.error.issues
      });
    }
    try {
      await repo.writeRetention(parsed.data);
      return res.json({ success: true, message: 'Retention policy saved successfully' });
    } catch (error) {
      logger.error('❌ Error saving retention policy:', error as Error);
      return res.status(500).json({ error: 'Failed to save retention policy' });
    }
  });

  return router;
}
