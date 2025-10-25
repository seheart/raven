import { Router } from 'express';
import { logger } from '../utils/logger.js';

/**
 * Creates rollback management routes
 * @param {object} deps - Dependencies
 * @returns {Router} Express router
 */
export function createRollbackRoutes(deps) {
  const router = Router();
  const { projectDatabases, riskAnalyzer, patternMatcher, sessionTracker } = deps;

  /**
   * POST /api/changes/:id/rollback
   * Track a rollback for a specific change
   */
  router.post('/changes/:id/rollback', (req, res) => {
    try {
      const { id } = req.params;
      const { project, reason } = req.body;

      if (!riskAnalyzer) {
        return res.status(503).json({ error: 'Risk analyzer not initialized' });
      }

      const projectName = project || Array.from(projectDatabases.keys())[0];
      const db = projectDatabases.get(projectName);

      if (!db) {
        return res.status(404).json({ error: 'Project not found' });
      }

      const success = riskAnalyzer.trackRollback(db, id, reason, false);

      if (success) {
        // Track rollback in session
        if (sessionTracker) {
          sessionTracker.trackRollback(projectName);
        }

        res.json({ success: true, message: 'Rollback tracked' });
      } else {
        res.status(500).json({ error: 'Failed to track rollback' });
      }
    } catch (error) {
      logger.error('Error tracking rollback:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * GET /api/rollbacks/patterns
   * Analyze rollback patterns for a project
   */
  router.get('/rollbacks/patterns', (req, res) => {
    try {
      const { project } = req.query;

      if (!patternMatcher) {
        return res.status(503).json({ error: 'Pattern matcher not initialized' });
      }

      const projectName = project || Array.from(projectDatabases.keys())[0];
      const patterns = patternMatcher.analyzeRollbackPatterns(projectName);

      res.json({ patterns });
    } catch (error) {
      logger.error('Error analyzing rollback patterns:', error);
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}
