import { Router } from 'express';
import { logger } from '../utils/logger.js';

/**
 * Creates rollback management routes
 * @param {object} deps - Dependencies
 * @returns {Router} Express router
 */
export function createRollbackRoutes(deps) {
  const router = Router();
  // Note: Don't destructure deps - access services dynamically
  // so it works even if they're added to deps after route mounting

  /**
   * POST /api/changes/:id/rollback
   * Track a rollback for a specific change
   */
  router.post('/changes/:id/rollback', (req, res) => {
    try {
      const { id } = req.params;
      const { project, reason } = req.body;

      if (!deps.riskAnalyzer) {
        return res.status(503).json({ error: 'Risk analyzer not initialized' });
      }

      const projectName = project || Array.from(deps.projectDatabases.keys())[0];
      const db = deps.projectDatabases.get(projectName);

      if (!db) {
        return res.status(404).json({ error: 'Project not found' });
      }

      const success = deps.riskAnalyzer.trackRollback(db, id, reason, false);

      if (success) {
        // Track rollback in session
        if (deps.sessionTracker) {
          deps.sessionTracker.trackRollback(projectName);
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

      if (!deps.patternMatcher) {
        return res.status(503).json({ error: 'Pattern matcher not initialized' });
      }

      const projectName = project || Array.from(deps.projectDatabases.keys())[0];
      const patterns = deps.patternMatcher.analyzeRollbackPatterns(projectName);

      res.json({ patterns });
    } catch (error) {
      logger.error('Error analyzing rollback patterns:', error);
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}
