/**
 * Events Routes
 * Handles file events, activity tracking, and event queries
 */

import express, { Request, Response, Router } from 'express';
import type { DashboardRepository } from '../repositories/dashboard-repository.js';
import type { FileEventsRepository } from '../repositories/file-events-repository.js';
import { cacheMiddleware } from '../services/cache-service.js';
import { asyncHandler } from '../middleware/async-handler.js';
import { parseLimit, parseDateRange, parseBoolean } from '../utils/request-helpers.js';

export function createEventsRouter(
  fileEventsRepo: FileEventsRepository,
  dashboardRepo: DashboardRepository
): Router {
  const router = express.Router();

  /**
   * GET /api/events
   * Get file events with optional filtering
   */
  router.get(
    '/events',
    asyncHandler(async (req: Request, res: Response) => {
      const limit = parseLimit(req);
      const { startTime, endTime } = parseDateRange(req);
      const includeDiff = parseBoolean(req, 'diff');
      const events = fileEventsRepo.listInTimeRange(startTime, endTime, limit, includeDiff);
      res.json(events);
    })
  );

  /**
   * GET /api/events/recent
   * Get most recent file events
   */
  router.get(
    '/events/recent',
    cacheMiddleware(1000),
    asyncHandler(async (req: Request, res: Response) => {
      const limit = parseLimit(req, 50);
      const events = fileEventsRepo.recent(limit);
      res.json(events);
    })
  );

  /**
   * GET /api/longest-edits
   * Get files with the longest edit sessions
   */
  router.get(
    '/longest-edits',
    cacheMiddleware(10000),
    asyncHandler(async (req: Request, res: Response) => {
      const limit = parseLimit(req, 10);
      const edits = dashboardRepo.longestEdits(limit);
      res.json(edits);
    })
  );

  /**
   * GET /api/top-files
   * Get most frequently modified files
   */
  router.get(
    '/top-files',
    cacheMiddleware(5000),
    asyncHandler(async (req: Request, res: Response) => {
      const limit = parseLimit(req, 10);
      res.json(fileEventsRepo.topByFrequency(limit));
    })
  );

  /**
   * GET /api/event/:id
   * Get a specific event by ID
   */
  router.get(
    '/event/:id',
    asyncHandler(async (req: Request, res: Response) => {
      const eventId = parseInt(req.params.id, 10);
      if (isNaN(eventId)) {
        res.status(400).json({ error: 'Invalid event ID' });
        return;
      }
      // diff text averages ~16 KB/row; gate it behind ?diff=1 like the list
      // endpoint does. Callers that need the diff (rollback preview, file
      // browser) explicitly opt in.
      const includeDiff = req.query.diff === '1' || req.query.diff === 'true';
      const event = fileEventsRepo.byId(eventId);

      if (!event) {
        return res.status(404).json({
          error: {
            message: 'Event not found',
            code: 'EVENT_NOT_FOUND',
            statusCode: 404
          }
        });
      }

      // Strip diff when not requested — matches the legacy column-list shape.
      const out = includeDiff ? event : { ...event, diff: undefined };
      delete (out as { diff?: unknown }).diff;
      return res.json(includeDiff ? event : out);
    })
  );

  /**
   * GET /api/events/by-file
   * Get events for a specific file path
   */
  router.get(
    '/events/by-file',
    asyncHandler(async (req: Request, res: Response) => {
      const filepath = req.query.filepath as string;
      const limit = parseLimit(req, 100);

      if (!filepath) {
        return res.status(400).json({
          error: {
            message: 'filepath query parameter is required',
            code: 'MISSING_FILEPATH',
            statusCode: 400
          }
        });
      }

      return res.json(fileEventsRepo.history(filepath, limit));
    })
  );

  /**
   * GET /api/events/stats
   * Get event statistics
   */
  router.get(
    '/events/stats',
    cacheMiddleware(5000),
    asyncHandler(async (_req: Request, res: Response) => {
      res.json({
        total_events: fileEventsRepo.totalCount(),
        unique_files: fileEventsRepo.distinctFilepathCount(),
        last_event: fileEventsRepo.lastTimestamp()
      });
    })
  );

  return router;
}
