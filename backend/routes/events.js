import { Router } from 'express';
import { logger } from '../utils/logger.js';
import { exec } from 'child_process';
import { promisify } from 'util';
import { validate } from '../middleware/validation.js';

const execAsync = promisify(exec);

/**
 * Creates event tracking and activity routes
 * @param {object} deps - Dependencies
 * @returns {Router} Express router
 */
export function createEventsRoutes(deps) {
  const router = Router();
  const { projectState, projectDatabases } = deps;

  /**
   * GET /api/tracked-files
   * Get list of tracked files (with Git fallback)
   */
  router.get('/tracked-files', validate('trackedFilesQuery', 'query'), async (req, res) => {
    try {
      let files = projectState.db.getTrackedFiles();

      // If no files tracked yet (fresh project), try to get files from Git
      if (files.length === 0 && projectState.watchPath) {
        try {
          const { stdout } = await execAsync('git ls-files', {
            cwd: projectState.watchPath,
            maxBuffer: 10 * 1024 * 1024 // 10MB buffer for large repos
          });
          files = stdout.split('\n').filter(f => f.trim() !== '');
          logger.debug('Populated file list from Git', { fileCount: files.length });
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
  router.get('/events-by-session/:sessionId', validate('eventsBySessionParams', 'params'), (req, res) => {
    try {
      const { sessionId } = req.params;
      const events = projectState.db.getEventsBySession(sessionId);
      res.json(events);
    } catch (error) {
      logger.error('Events by session error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * GET /api/file-events
   * Get file events for a project (or active project)
   */
  router.get('/file-events', validate('fileEventsQuery', 'query'), (req, res) => {
    try {
      const limit = parseInt(req.query.limit) || 100;
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
      const limit = parseInt(req.query.limit) || 100;
      const includeDiff = req.query.diff === 'true';

      // Parallelize event collection from all projects
      const eventsPromises = Array.from(projectDatabases.entries()).map(
        ([projectName, db]) => Promise.resolve({
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
  router.get('/activity-log', validate('activityLogQuery', 'query'), (req, res) => {
    try {
      const options = {
        limit: parseInt(req.query.limit) || 500,
        offset: parseInt(req.query.offset) || 0,
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
  });

  return router;
}
