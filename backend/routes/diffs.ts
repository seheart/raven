/**
 * Diffs Routes
 *
 * Per-event diff lookups + per-line annotations for the inline risk
 * scoring feature.
 */

import express, { Request, Response, Router } from 'express';
import type { RavenDB } from '../db.js';
import type { DiffAnnotationsRepository } from '../repositories/diff-annotations-repository.js';
import type { DiffAnnotationService } from '../services/diff-annotation-service.js';
import { asyncHandler } from '../middleware/async-handler.js';
import { cacheMiddleware } from '../services/cache-service.js';

interface EventRow {
  id: number;
  timestamp: string;
  filepath: string | null;
  change_type: string | null;
  diff: string | null;
  session_id: string | null;
  project_name: string | null;
}

export function createDiffsRouter(
  db: RavenDB,
  annotationsRepo: DiffAnnotationsRepository,
  annotationService: DiffAnnotationService
): Router {
  const router = express.Router();

  // /risk/recent must be registered BEFORE /:event_id, otherwise Express
  // matches "risk" as the event_id parameter.
  /**
   * GET /api/diffs/risk/recent
   * Recent diffs that produced annotations, with severity counts. Drives
   * the "risky diffs" panel and any future Today-page hooks.
   */
  router.get(
    '/risk/recent',
    cacheMiddleware(5000),
    asyncHandler(async (req: Request, res: Response) => {
      const limit = Math.min(parseInt(req.query.limit as string, 10) || 20, 100);
      res.json(annotationsRepo.recentSummaries(limit));
    })
  );

  /**
   * GET /api/diffs/:event_id
   * Returns the event row + the stored diff + any persisted annotations.
   * If no annotations have been computed yet and a diff is available,
   * scoring runs lazily so the viewer never has to wait for a backfill.
   */
  router.get(
    '/:event_id',
    asyncHandler(async (req: Request, res: Response) => {
      const eventId = parseInt(req.params.event_id, 10);
      if (!Number.isFinite(eventId)) {
        res.status(400).json({ error: 'invalid event_id' });
        return;
      }

      const event = db.db
        .prepare(
          `SELECT id, timestamp, filepath, change_type, diff, session_id, project_name
           FROM events WHERE id = ?`
        )
        .get(eventId) as EventRow | undefined;

      if (!event) {
        res.status(404).json({ error: 'event not found' });
        return;
      }

      let annotations = annotationsRepo.byEventId(eventId);
      // Lazily compute on first read. Cheap (in-memory regex pass).
      if (annotations.length === 0 && event.diff && event.filepath) {
        annotationService.annotate({
          event_id: eventId,
          filepath: event.filepath,
          diff: event.diff,
          timestamp: event.timestamp
        });
        annotations = annotationsRepo.byEventId(eventId);
      }

      res.json({ event, annotations });
    })
  );

  /**
   * GET /api/diffs/:event_id/annotations
   * Just the annotations array, for callers that already have the event.
   */
  router.get(
    '/:event_id/annotations',
    cacheMiddleware(2000),
    asyncHandler(async (req: Request, res: Response) => {
      const eventId = parseInt(req.params.event_id, 10);
      if (!Number.isFinite(eventId)) {
        res.status(400).json({ error: 'invalid event_id' });
        return;
      }
      const annotations = annotationsRepo.byEventId(eventId);
      res.json(annotations);
    })
  );

  /**
   * POST /api/diffs/:event_id/annotations/recompute
   * Force a re-scan. Used when rules change or after a backfill.
   */
  router.post(
    '/:event_id/annotations/recompute',
    asyncHandler(async (req: Request, res: Response) => {
      const eventId = parseInt(req.params.event_id, 10);
      if (!Number.isFinite(eventId)) {
        res.status(400).json({ error: 'invalid event_id' });
        return;
      }
      const event = db.db
        .prepare(`SELECT id, timestamp, filepath, diff FROM events WHERE id = ?`)
        .get(eventId) as { id: number; timestamp: string; filepath: string | null; diff: string | null } | undefined;
      if (!event) {
        res.status(404).json({ error: 'event not found' });
        return;
      }
      if (!event.diff || !event.filepath) {
        annotationsRepo.deleteByEventId(eventId);
        res.json({ event_id: eventId, annotations: [] });
        return;
      }
      annotationService.annotate({
        event_id: eventId,
        filepath: event.filepath,
        diff: event.diff,
        timestamp: event.timestamp
      });
      const annotations = annotationsRepo.byEventId(eventId);
      res.json({ event_id: eventId, annotations });
    })
  );

  return router;
}
