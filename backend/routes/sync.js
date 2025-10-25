import { Router } from 'express';
import { logger } from '../utils/logger.js';
import * as SyncService from '../sync-service.js';

/**
 * Creates sync management routes
 * @param {object} deps - Dependencies { io }
 * @returns {Router} Express router
 */
export function createSyncRoutes(deps) {
  const router = Router();
  const { io } = deps;

  /**
   * GET /api/sync/config
   * Get sync configuration
   */
  router.get('/config', async (req, res) => {
    try {
      const data = await SyncService.loadConfig();
      res.json(data);
    } catch (error) {
      logger.error('Error loading sync config:', error);
      res.status(500).json({ error: 'Failed to load sync configuration' });
    }
  });

  /**
   * POST /api/sync/config
   * Save sync configuration
   */
  router.post('/config', async (req, res) => {
    try {
      const config = req.body;

      if (!config) {
        return res.status(400).json({ error: 'Configuration is required' });
      }

      const result = await SyncService.saveConfig(config);

      if (result.success) {
        res.json({ success: true, message: 'Configuration saved' });
      } else {
        res.status(500).json({ success: false, error: result.error });
      }
    } catch (error) {
      logger.error('Error saving sync config:', error);
      res.status(500).json({ error: 'Failed to save sync configuration' });
    }
  });

  /**
   * POST /api/sync/test
   * Test SSH connection
   */
  router.post('/test', async (req, res) => {
    try {
      const config = req.body;

      if (!config || !config.host || !config.user) {
        return res.status(400).json({ success: false, error: 'Host and user are required' });
      }

      const result = await SyncService.testConnection(config);
      res.json(result);
    } catch (error) {
      logger.error('Error testing connection:', error);
      res.status(500).json({ success: false, error: 'Connection test failed' });
    }
  });

  /**
   * POST /api/sync/trigger
   * Trigger sync operation
   */
  router.post('/trigger', async (req, res) => {
    try {
      const config = req.body;

      if (!config || !config.host || !config.user || !config.path) {
        return res.status(400).json({ success: false, error: 'Host, user, and path are required' });
      }

      // Get current project path
      const projectPath = process.cwd();

      const result = await SyncService.performSync(config, projectPath);

      if (result.success) {
        // Emit sync success event via WebSocket
        io.emit('sync-complete', {
          success: true,
          timestamp: new Date().toISOString(),
          size: result.size,
          files: result.files,
          duration: result.duration
        });
      } else {
        // Emit sync failure event via WebSocket
        io.emit('sync-complete', {
          success: false,
          timestamp: new Date().toISOString(),
          error: result.error || 'Unknown error'
        });
      }

      res.json(result);
    } catch (error) {
      logger.error('Error performing sync:', error);

      // Emit sync failure event
      io.emit('sync-complete', {
        success: false,
        timestamp: new Date().toISOString(),
        error: error.message || 'Sync failed'
      });

      res.status(500).json({ success: false, error: 'Sync failed' });
    }
  });

  /**
   * GET /api/sync/ssh-status
   * Check SSH setup
   */
  router.get('/ssh-status', async (req, res) => {
    try {
      const status = await SyncService.checkSSHSetup();
      res.json(status);
    } catch (error) {
      logger.error('Error checking SSH status:', error);
      res.status(500).json({ error: 'Failed to check SSH status' });
    }
  });

  /**
   * POST /api/sync/remote-stats
   * Get remote storage statistics
   */
  router.post('/remote-stats', async (req, res) => {
    try {
      const config = req.body;

      if (!config || !config.host || !config.user || !config.path) {
        return res.status(400).json({ success: false, error: 'Host, user, and path are required' });
      }

      const stats = await SyncService.getRemoteStorageStats(config);
      res.json(stats);
    } catch (error) {
      logger.error('Error getting remote stats:', error);
      res.status(500).json({ success: false, error: 'Failed to get remote storage statistics' });
    }
  });

  /**
   * POST /api/sync/cancel
   * Cancel ongoing sync
   */
  router.post('/cancel', async (req, res) => {
    try {
      const result = await SyncService.cancelSync();
      res.json(result);
    } catch (error) {
      logger.error('Error cancelling sync:', error);
      res.status(500).json({ success: false, error: 'Failed to cancel sync' });
    }
  });

  /**
   * GET /api/sync/rsync-status
   * Check if rsync is installed
   */
  router.get('/rsync-status', async (req, res) => {
    try {
      const status = await SyncService.checkRsyncInstalled();
      res.json(status);
    } catch (error) {
      logger.error('Error checking rsync status:', error);
      res.status(500).json({ error: 'Failed to check rsync status' });
    }
  });

  return router;
}
