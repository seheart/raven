import { Router } from 'express';
import { logger } from '../utils/logger.js';

/**
 * Creates custom triggers routes
 * @param {object} deps - Dependencies
 * @returns {Router} Express router
 */
export function createTriggersRoutes(deps) {
  const router = Router();
  // Note: Don't destructure triggerEngine - access it from deps dynamically
  // so it works even if triggerEngine is added to deps after route mounting

  /**
   * GET /api/triggers-config
   * Get triggers configuration/rules
   */
  router.get('/triggers-config', (req, res) => {
    try {
      if (!deps.triggerEngine) {
        return res.status(503).json({ error: 'Trigger engine not initialized' });
      }
      const triggers = deps.triggerEngine.getTriggersConfig();
      res.json({ rules: triggers });
    } catch (error) {
      logger.error('Triggers config error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * GET /api/triggered-events
   * Get list of triggered events
   */
  router.get('/triggered-events', (req, res) => {
    try {
      if (!deps.triggerEngine) {
        return res.status(503).json({ error: 'Trigger engine not initialized' });
      }
      const limit = parseInt(req.query.limit) || 100;
      const events = deps.triggerEngine.getTriggeredEvents(limit);
      res.json(events);
    } catch (error) {
      logger.error('Triggered events error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * GET /api/trigger-stats
   * Get trigger execution statistics
   */
  router.get('/trigger-stats', (req, res) => {
    try {
      if (!deps.triggerEngine) {
        return res.status(503).json({ error: 'Trigger engine not initialized' });
      }
      const stats = deps.triggerEngine.getTriggerStats();
      res.json(stats);
    } catch (error) {
      logger.error('Trigger stats error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * POST /api/triggers-reload
   * Reload triggers configuration from file
   */
  router.post('/triggers-reload', (req, res) => {
    try {
      if (!deps.triggerEngine) {
        return res.status(503).json({ error: 'Trigger engine not initialized' });
      }
      const message = deps.triggerEngine.reloadConfig();
      res.json({ message });
    } catch (error) {
      logger.error('Triggers reload error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * POST /api/triggers-clear-cooldowns
   * Clear all trigger cooldowns
   */
  router.post('/triggers-clear-cooldowns', (req, res) => {
    try {
      if (!deps.triggerEngine) {
        return res.status(503).json({ error: 'Trigger engine not initialized' });
      }
      const message = deps.triggerEngine.clearCooldowns();
      res.json({ message });
    } catch (error) {
      logger.error('Clear cooldowns error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}
