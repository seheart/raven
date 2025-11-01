import { Router } from 'express';
import { logger } from '../utils/logger.js';
import {
  dashboardCache,
  analyticsCache,
  metricsCache,
  queryCache,
  safetyCache,
  getAllCacheStats,
  clearAllCaches
} from '../utils/cache.js';

/**
 * Creates cache management routes
 * @returns {Router} Express router
 */
export function createCacheRoutes() {
  const router = Router();

  /**
   * GET /api/cache/stats
   * Get cache statistics for all caches
   */
  router.get('/stats', (req, res) => {
    try {
      const stats = getAllCacheStats();
      res.json({
        timestamp: new Date().toISOString(),
        caches: stats
      });
    } catch (error) {
      logger.error('Error getting cache stats:', error);
      res.status(500).json({ error: 'Failed to retrieve cache statistics' });
    }
  });

  /**
   * POST /api/cache/clear
   * Clear all caches
   */
  router.post('/clear', (req, res) => {
    try {
      clearAllCaches();
      logger.info('All caches cleared via API');
      res.json({
        success: true,
        message: 'All caches cleared successfully',
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Error clearing caches:', error);
      res.status(500).json({ error: 'Failed to clear caches' });
    }
  });

  /**
   * POST /api/cache/clear/:cacheName
   * Clear specific cache by name
   */
  router.post('/clear/:cacheName', (req, res) => {
    try {
      const { cacheName } = req.params;
      const caches = {
        dashboard: dashboardCache,
        analytics: analyticsCache,
        metrics: metricsCache,
        query: queryCache,
        safety: safetyCache
      };

      if (caches[cacheName]) {
        caches[cacheName].clear();
        logger.info(`Cache cleared: ${cacheName}`);
        res.json({
          success: true,
          message: `${cacheName} cache cleared successfully`,
          timestamp: new Date().toISOString()
        });
      } else {
        res.status(404).json({
          error: `Cache '${cacheName}' not found. Valid caches: ${Object.keys(caches).join(', ')}`
        });
      }
    } catch (error) {
      logger.error('Error clearing specific cache:', error);
      res.status(500).json({ error: 'Failed to clear cache' });
    }
  });

  return router;
}
