import { Router } from 'express';
import { logger } from '../utils/logger.js';
import { exec } from 'child_process';
import { promisify } from 'util';
import { validate } from '../middleware/validation.js';
import { analyticsCache, cacheMiddleware } from '../utils/cache.js';
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

const execAsync = promisify(exec);

/**
 * Creates event tracking and activity routes
 * @param {object} deps - Dependencies
 * @returns {Router} Express router
 */
export function createEventsRoutes(deps) {
  const router = Router();
  const { projectState, projectDatabases, projectPaths } = deps;

  /**
   * GET /api/tracked-files
   * Get list of tracked files (with Git fallback)
   * Query params: project (optional) - specify which project to get files from
   */
  router.get('/tracked-files', validate('trackedFilesQuery', 'query'), async (req, res) => {
    try {
      const projectName = req.query.project;

      logger.debug('tracked-files request', {
        projectName,
        hasProjectDatabases: !!projectDatabases,
        hasProjectPaths: !!projectPaths,
        projectDatabasesSize: projectDatabases?.size,
        projectPathsSize: projectPaths?.size
      });

      // Get the appropriate database and path
      let db, watchPath;
      if (projectName && projectDatabases && projectDatabases.has(projectName)) {
        db = projectDatabases.get(projectName);
        watchPath = projectPaths.get(projectName);
      } else {
        // Use default project
        db = projectState.db;
        watchPath = projectState.watchPath;
      }

      let tracked = db.getTrackedFiles() || [];
      let files = Array.isArray(tracked) ? tracked : tracked.files || [];

      // If no files tracked yet (fresh project), try to get files from Git
      if (files.length === 0 && watchPath) {
        try {
          const { stdout } = await execAsync('git ls-files', {
            cwd: watchPath,
            maxBuffer: 10 * 1024 * 1024 // 10MB buffer for large repos
          });
          files = stdout.split('\n').filter(f => f.trim() !== '');
          logger.debug('Populated file list from Git', {
            fileCount: files.length,
            project: projectName || 'default'
          });
        } catch (gitError) {
          logger.debug('No Git repository or git ls-files failed, showing empty list');
        }
      }

      res.json(files);
    } catch (error) {
      logger.error('Tracked files error', { error });
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * GET /api/events-by-session/:sessionId
   * Get events for a specific session
   */
  router.get(
    '/events-by-session/:sessionId',
    validate('eventsBySessionParams', 'params'),
    (req, res) => {
      try {
        const { sessionId } = req.params;
        const db = projectState.db;
        const events =
          typeof db.getEventsBySession === 'function'
            ? db.getEventsBySession(sessionId)
            : db.getAgentEventsBySession(sessionId);
        res.json(events);
      } catch (error) {
        logger.error('Events by session error:', error);
        res.status(500).json({ error: 'Session query failed' });
      }
    }
  );

  /**
   * GET /api/file-events
   * Get file events for a project (or active project)
   */
  router.get('/file-events', validate('fileEventsQuery', 'query'), (req, res) => {
    try {
      const limit = parseInt(req.query.limit, 10) || 100;
      const includeDiff = req.query.diff === 'true';
      const projectName = req.query.project;

      let db;
      if (projectName) {
        // Get database for specific project
        db = projectDatabases.get(projectName);
        if (!db) {
          return res.status(404).json({ error: `Project '${projectName}' not found` });
        }
      } else {
        // Use active project database
        if (!projectState.db) {
          return res.status(500).json({ error: 'No active project database' });
        }
        db = projectState.db;
      }

      const events = db.getRecentFileEvents(limit, includeDiff);

      // Get total count
      const totalCount = db.getTotalEventCount ? db.getTotalEventCount() : events.length;

      res.json({
        events: events,
        total: totalCount,
        project: projectName || projectState.activeProject
      });
    } catch (error) {
      logger.error('File events error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * GET /api/all-file-events
   * Get file events from ALL projects (multi-project aggregation)
   */
  router.get('/all-file-events', validate('allFileEventsQuery', 'query'), async (req, res) => {
    try {
      const limit = parseInt(req.query.limit, 10) || 100;
      const includeDiff = req.query.diff === 'true';

      // Parallelize event collection from all projects
      const eventsPromises = Array.from(projectDatabases.entries()).map(([projectName, db]) =>
        Promise.resolve({
          projectName,
          events: db.getRecentFileEvents(limit, includeDiff)
        })
      );

      const allProjectEvents = await Promise.all(eventsPromises);

      // Collect and tag events with project names
      const allEvents = [];
      for (const { projectName, events } of allProjectEvents) {
        events.forEach(event => {
          event.project = projectName;
        });
        allEvents.push(...events);
      }

      // Sort by timestamp (newest first) and limit
      allEvents.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      const limitedEvents = allEvents.slice(0, limit);

      res.json(limitedEvents);
    } catch (error) {
      logger.error('All file events error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * GET /api/activity-log
   * Get unified activity log with filtering options
   */
  router.get(
    '/activity-log',
    cacheMiddleware(analyticsCache),
    validate('activityLogQuery', 'query'),
    (req, res) => {
      try {
        const options = {
          limit: parseInt(req.query.limit, 10) || 500,
          offset: parseInt(req.query.offset, 10) || 0,
          search: req.query.search || '',
          eventType: req.query.type || 'all',
          startDate: req.query.startDate || null,
          endDate: req.query.endDate || null
        };

        const result = projectState.db.getActivityLog(options);
        res.json(result);
      } catch (error) {
        logger.error('Activity log error:', error);
        res.status(500).json({ error: error.message });
      }
    }
  );

  /**
   * GET /api/files/:filepath/history
   * Get complete history for a specific file
   */
  router.get('/files/:filepath(*)/history', (req, res) => {
    try {
      const filepath = decodeURIComponent(req.params.filepath);
      const history = projectState.db.getFileHistory(filepath);

      // Map change_type to match frontend expectations
      const mappedHistory = history.map(event => ({
        ...event,
        change_type: mapChangeType(event.change_type)
      }));

      res.json(mappedHistory);
    } catch (error) {
      logger.error('File history error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * GET /api/snapshot/:eventId/:filename
   * Get snapshot content for a specific event
   */
  router.get('/snapshot/:eventId/:filename', async (req, res) => {
    try {
      const { eventId, filename } = req.params;

      // Get event details
      const event = projectState.db.getEventById(parseInt(eventId));
      if (!event) {
        return res.status(404).json({ error: `Event ${eventId} not found` });
      }

      // Find snapshot file
      const timestamp = new Date(event.timestamp).getTime();
      const snapshotFilename = `${event.filepath.replace(/\//g, '_')}_${timestamp}.gz`;
      const snapshotPath = path.join(projectState.snapshotsDir, snapshotFilename);

      // Check if snapshot exists
      if (!fs.existsSync(snapshotPath)) {
        // Try without .gz extension (backwards compatibility)
        const snapshotPathTxt = path.join(
          projectState.snapshotsDir,
          `${event.filepath.replace(/\//g, '_')}_${timestamp}.txt`
        );
        if (fs.existsSync(snapshotPathTxt)) {
          const content = await fs.promises.readFile(snapshotPathTxt, 'utf8');
          return res.type('text/plain').send(content);
        }

        return res.status(404).json({
          error: 'Snapshot not found',
          details: `Looking for: ${snapshotFilename}`,
          event_id: eventId,
          filepath: event.filepath
        });
      }

      // Read and decompress snapshot
      const data = await fs.promises.readFile(snapshotPath);
      const decompressed = await new Promise((resolve, reject) => {
        zlib.gunzip(data, (err, result) => {
          if (err) reject(err);
          else resolve(result);
        });
      });

      const content = decompressed.toString('utf8');
      res.type('text/plain').send(content);
    } catch (error) {
      logger.error('Snapshot retrieval error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * Helper function to map change types to frontend expectations
   */
  function mapChangeType(type) {
    const mapping = {
      create: 'created',
      edit: 'modified',
      delete: 'deleted',
      // Keep these for backwards compatibility
      add: 'created',
      change: 'modified',
      unlink: 'deleted'
    };
    return mapping[type] || type;
  }

  return router;
}
