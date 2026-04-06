/**
 * Events Routes
 * Handles file events, activity tracking, and event queries
 */

import express, { Request, Response, Router } from 'express';
import type { RavenDB } from '../db.js';
import { cacheMiddleware } from '../services/cache-service.js';
import { asyncHandler } from '../middleware/async-handler.js';
import {
  parseLimit,
  parseDateRange,
  parseBoolean,
  buildTimeFilterQuery
} from '../utils/request-helpers.js';

export function createEventsRouter(db: RavenDB): Router {
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

      const fields = includeDiff
        ? 'id, timestamp, filepath, change_type, diff, cpu, mem, session_id'
        : 'id, timestamp, filepath, change_type, cpu, mem, session_id';

      const { query, params } = buildTimeFilterQuery(`SELECT ${fields} FROM events`, {
        startTime,
        endTime,
        orderBy: 'timestamp DESC',
        limit
      });

      const events = db.db.prepare(query).all(...params);
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
      const events = db.getRecentFileEvents(limit);
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
      const edits = db.getLongestEdits(limit);
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
      // Get most frequently modified files
      const files = db.db
        .prepare(
          `SELECT filepath, COUNT(*) as change_count
           FROM events
           GROUP BY filepath
           ORDER BY change_count DESC
           LIMIT ?`
        )
        .all(limit);
      res.json(files);
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
      const event = db.db
        .prepare(
          `SELECT id, timestamp, filepath, change_type, diff, cpu, mem, session_id
           FROM events
           WHERE id = ?`
        )
        .get(eventId);

      if (!event) {
        return res.status(404).json({
          error: {
            message: 'Event not found',
            code: 'EVENT_NOT_FOUND',
            statusCode: 404
          }
        });
      }

      return res.json(event);
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

      const events = db.db
        .prepare(
          `SELECT id, timestamp, filepath, change_type, cpu, mem
           FROM events
           WHERE filepath = ?
           ORDER BY timestamp DESC
           LIMIT ?`
        )
        .all(filepath, limit);

      return res.json(events);
    })
  );

  /**
   * GET /api/events/stats
   * Get event statistics
   */
  router.get(
    '/events/stats',
    cacheMiddleware(5000),
    asyncHandler(async (req: Request, res: Response) => {
      const totalEvents = db.db.prepare('SELECT COUNT(*) as count FROM events').get() as any;
      const uniqueFiles = db.db
        .prepare('SELECT COUNT(DISTINCT filepath) as count FROM events')
        .get() as any;
      const lastEvent = db.db
        .prepare('SELECT MAX(timestamp) as timestamp FROM events')
        .get() as any;

      res.json({
        total_events: totalEvents.count,
        unique_files: uniqueFiles.count,
        last_event: lastEvent.timestamp
      });
    })
  );

  return router;
}
