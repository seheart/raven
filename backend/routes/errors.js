import { Router } from 'express';
import { logger } from '../utils/logger.js';

/**
 * Creates error logging and management routes
 * @param {object} deps - Dependencies
 * @returns {Router} Express router
 */
export function createErrorsRoutes(deps) {
  const router = Router();
  const { projectState, projectDatabases } = deps;

  /**
   * GET /api/errors
   * Get error logs with search and filter
   */
  router.get('/errors', (req, res) => {
    try {
      const options = {
        limit: parseInt(req.query.limit, 10) || 100,
        offset: parseInt(req.query.offset, 10) || 0,
        search: req.query.search || '',
        severity: req.query.severity || 'all',
        startDate: req.query.startDate || null,
        endDate: req.query.endDate || null
      };

      const result = projectState.db.getErrorLogs(options);
      res.json(result);
    } catch (error) {
      logger.error('❌ Get errors endpoint error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * GET /api/errors/stats
   * Get error statistics
   */
  router.get('/errors/stats', (req, res) => {
    try {
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

      const stats = db.getErrorStats();

      // Ensure we return total field even if getErrorStats doesn't provide it
      if (!stats.total && stats.count !== undefined) {
        stats.total = stats.count;
      } else if (!stats.total) {
        stats.total = 0;
      }

      res.json(stats);
    } catch (error) {
      logger.error('Error stats endpoint error:', error);
      res.status(500).json({ error: error.message, total: 0 });
    }
  });

  /**
   * POST /api/errors
   * Log a new error from the frontend
   */
  router.post('/errors', (req, res) => {
    try {
      const errorData = req.body;

      // Validate required fields
      if (!errorData.message) {
        return res.status(400).json({ error: 'Error message is required' });
      }

      // Store the error in the database
      const errorLog = {
        error_type: errorData.error_type || 'Error',
        message: errorData.message,
        stack: errorData.stack || null,
        component: errorData.component || 'Unknown',
        severity: errorData.severity || 'error',
        user_agent: errorData.user_agent || null,
        url: errorData.url || null,
        metadata: errorData.metadata || {},
        timestamp: new Date().toISOString()
      };

      const result = projectState.db.logError(errorLog);

      // Emit via WebSocket so UI updates immediately
      if (deps.io) {
        deps.io.emit('error-logged', result);
      }

      logger.info('✅ Error logged from frontend', {
        error_type: errorLog.error_type,
        component: errorLog.component,
        severity: errorLog.severity
      });

      res.json({
        success: true,
        error_id: result.id,
        message: 'Error logged successfully'
      });
    } catch (error) {
      logger.error('❌ Post error endpoint error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * DELETE /api/errors
   * Clear error logs
   */
  router.delete('/errors', (req, res) => {
    try {
      const olderThanDays = req.query.olderThanDays ? parseInt(req.query.olderThanDays, 10) : null;
      const deletedCount = projectState.db.clearErrorLogs(olderThanDays);

      logger.info('Cleared error logs', { deletedCount, olderThanDays });

      res.json({
        success: true,
        deletedCount,
        message: olderThanDays
          ? `Deleted ${deletedCount} errors older than ${olderThanDays} days`
          : `Deleted all ${deletedCount} errors`
      });
    } catch (error) {
      logger.error('❌ Clear errors endpoint error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}
