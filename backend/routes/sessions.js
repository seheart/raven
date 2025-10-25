import { Router } from 'express';
import { logger } from '../utils/logger.js';

/**
 * Creates session management routes
 * @param {object} deps - Dependencies { sessionTracker, projectDatabases }
 * @returns {Router} Express router
 */
export function createSessionRoutes(deps) {
  const router = Router();
  const { sessionTracker, projectDatabases } = deps;

  /**
   * GET /api/sessions
   * Get all sessions (stub - not implemented in JavaScript version)
   */
  router.get('/', (req, res) => {
    res.json({ sessions: [], total: 0, message: 'Session management not available in JavaScript version' });
  });

  /**
   * GET /api/sessions/:sessionId/preview
   * Preview session rollback (stub - not implemented)
   */
  router.get('/:sessionId/preview', (req, res) => {
    res.status(404).json({ error: 'Session rollback not available in JavaScript version' });
  });

  /**
   * POST /api/sessions/:sessionId/rollback
   * Rollback to a previous session (stub - not implemented)
   */
  router.post('/:sessionId/rollback', (req, res) => {
    res.status(501).json({ error: 'Session rollback not available in JavaScript version' });
  });

  /**
   * GET /api/sessions/current
   * Get current active session
   */
  router.get('/current', (req, res) => {
    try {
      const { project } = req.query;

      if (!sessionTracker) {
        return res.status(503).json({ error: 'Session tracker not initialized' });
      }

      const projectName = project || Array.from(projectDatabases.keys())[0];
      const session = sessionTracker.getActiveSession(projectName);

      if (!session) {
        return res.json({ hasActiveSession: false, session: null });
      }

      // Calculate session duration
      const durationMinutes = (Date.now() - session.startTime) / (1000 * 60);
      const durationHours = durationMinutes / 60;

      res.json({
        hasActiveSession: true,
        session: {
          id: session.id,
          projectName: session.projectName,
          startTime: new Date(session.startTime).toISOString(),
          durationMinutes: Math.round(durationMinutes),
          durationHours: durationHours.toFixed(2),
          changesCount: session.changesCount,
          rollbacksCount: session.rollbacksCount,
          qualityScore: Math.round(session.qualityScore)
        }
      });
    } catch (error) {
      logger.error('Error getting current session:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * GET /api/sessions/quality
   * Get session quality analysis
   */
  router.get('/quality', (req, res) => {
    try {
      const { project } = req.query;

      if (!sessionTracker) {
        return res.status(503).json({ error: 'Session tracker not initialized' });
      }

      const projectName = project || Array.from(projectDatabases.keys())[0];
      const quality = sessionTracker.calculateSessionQuality(projectName);

      res.json({ quality });
    } catch (error) {
      logger.error('Error calculating session quality:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * GET /api/sessions/break-recommendation
   * Get break recommendation based on session activity
   */
  router.get('/break-recommendation', (req, res) => {
    try {
      const { project } = req.query;

      if (!sessionTracker) {
        return res.status(503).json({ error: 'Session tracker not initialized' });
      }

      const projectName = project || Array.from(projectDatabases.keys())[0];
      const recommendation = sessionTracker.getBreakRecommendation(projectName);

      res.json({ recommendation });
    } catch (error) {
      logger.error('Error getting break recommendation:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * GET /api/sessions/stats
   * Get session statistics
   */
  router.get('/stats', (req, res) => {
    try {
      const { project, days } = req.query;

      if (!sessionTracker) {
        return res.status(503).json({ error: 'Session tracker not initialized' });
      }

      const projectName = project || Array.from(projectDatabases.keys())[0];
      const stats = sessionTracker.getSessionStats(projectName, parseInt(days) || 30);

      res.json({ stats });
    } catch (error) {
      logger.error('Error getting session stats:', error);
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}
