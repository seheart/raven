import { Router } from 'express';
import { logger } from '../utils/logger.js';

/**
 * Creates user preferences management routes
 * @param {object} deps - Dependencies
 * @returns {Router} Express router
 */
export function createPreferencesRoutes(deps) {
  const router = Router();
  const { userPreferences } = deps;

  /**
   * GET /api/preferences
   * Get user preferences (with defaults)
   */
  router.get('/preferences', (req, res) => {
    try {
      const userId = req.query.userId || 'default';
      const preferences = userPreferences.get(userId) || {
        notifications: {
          enabled: true,
          showToasts: true,
          soundEnabled: false,
          desktopNotifications: false,
          types: {
            errors: true,
            warnings: true,
            triggers: true,
            performance: false,
            info: true
          }
        },
        ui: {
          theme: 'theme--night',
          compactMode: false,
          animationsEnabled: true,
          autoRefresh: true,
          refreshInterval: 10
        },
        performance: {
          enableMetrics: true,
          metricsInterval: 10,
          enableFileWatcher: true,
          maxEventsDisplay: 100
        }
      };

      res.json(preferences);
    } catch (error) {
      logger.error('❌ Failed to get preferences:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * POST /api/preferences
   * Save/update user preferences
   */
  router.post('/preferences', (req, res) => {
    try {
      const userId = req.body.userId || 'default';
      const preferences = req.body.preferences;

      if (!preferences) {
        return res.status(400).json({ error: 'Preferences data required' });
      }

      userPreferences.set(userId, preferences);

      logger.info(`💾 Saved preferences for user: ${userId}`);
      res.json({ success: true, message: 'Preferences saved successfully' });
    } catch (error) {
      logger.error('❌ Failed to save preferences:', error);
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}
