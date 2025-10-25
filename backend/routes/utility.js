import { Router } from 'express';
import { logger } from '../utils/logger.js';

/**
 * Creates utility and system management routes
 * @param {object} deps - Dependencies
 * @returns {Router} Express router
 */
export function createUtilityRoutes(deps) {
  const router = Router();
  const { projectState, app } = deps;

  /**
   * POST /api/database/clear-old/:days
   * Clear old database entries
   */
  router.post('/database/clear-old/:days', (req, res) => {
    try {
      const days = parseInt(req.params.days);

      if (isNaN(days) || days < 1) {
        return res.status(400).json({ error: 'Invalid days parameter' });
      }

      if (!projectState.db || !projectState.db.db) {
        return res.status(500).json({ error: 'Database not initialized' });
      }

      // Calculate cutoff timestamp
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);
      const cutoffTimestamp = cutoffDate.getTime();

      // Delete from all tables
      // Security: Whitelist of allowed tables to prevent SQL injection
      const ALLOWED_TABLES = ['events', 'agent_events', 'raven_metrics', 'process_metrics', 'error_logs', 'notifications'];
      const tables = ['events', 'agent_events', 'raven_metrics', 'process_metrics'];
      let totalDeleted = 0;

      for (const table of tables) {
        // Security: Validate table name is in whitelist
        if (!ALLOWED_TABLES.includes(table)) {
          logger.error(`❌ Security: Attempted to delete from non-whitelisted table: ${table}`);
          continue;
        }

        const deleteStmt = projectState.db.db.prepare(`
          DELETE FROM ${table} WHERE timestamp < ?
        `);
        const result = deleteStmt.run(cutoffTimestamp);
        totalDeleted += result.changes;
        logger.debug('Deleted entries from table', { table, deletedCount: result.changes });
      }

      logger.info('Cleanup complete', { totalDeleted, days });

      res.json({
        success: true,
        message: `Deleted ${totalDeleted} entries older than ${days} days`,
        deletedCount: totalDeleted,
        cutoffDate: cutoffDate.toISOString()
      });
    } catch (error) {
      logger.error('Error clearing old database entries:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * GET /api/endpoints
   * API introspection - list all available endpoints
   */
  router.get('/endpoints', (req, res) => {
    try {
      const endpoints = [];
      const routes = [];

      // Helper to extract routes from Express app stack
      function extractRoutes(stack, basePath = '') {
        stack.forEach(layer => {
          if (layer.route) {
            // This is a route
            const path = basePath + layer.route.path;
            const methods = Object.keys(layer.route.methods).map(m => m.toUpperCase());

            methods.forEach(method => {
              routes.push({ method, path });
            });
          } else if (layer.name === 'router' && layer.handle.stack) {
            // This is a sub-router (e.g., router.use('/api', router))
            const routerPath = layer.regexp.source
              .replace('\\/?', '')
              .replace('(?=\\/|$)', '')
              .replace(/\\\//g, '/')
              .replace(/\^/g, '')
              .replace(/\$/g, '');

            extractRoutes(layer.handle.stack, basePath + routerPath);
          }
        });
      }

      // Extract all routes from app
      extractRoutes(app._router.stack);

      // Categorize endpoints
      const categorizeEndpoint = (path) => {
        if (path.startsWith('/api/sync')) return 'Sync';
        if (path.startsWith('/api/storage')) return 'Storage';
        if (path.startsWith('/api/git')) return 'Git';
        if (path.startsWith('/api/projects')) return 'Projects';
        if (path.startsWith('/api/notifications')) return 'Notifications';
        if (path.startsWith('/api/errors')) return 'Errors';
        if (path.startsWith('/api/agents')) return 'Agents';
        if (path.startsWith('/api/agent')) return 'Agents';
        if (path.startsWith('/api/metrics') || path.startsWith('/api/system-metrics') || path.startsWith('/api/process-metrics') || path.startsWith('/api/performance')) return 'Metrics';
        if (path.startsWith('/api/triggers') || path.startsWith('/api/triggered')) return 'Triggers';
        if (path.startsWith('/api/file') || path.startsWith('/api/tracked-files') || path.startsWith('/api/events-by')) return 'Files';
        if (path.startsWith('/api/control')) return 'Control';
        if (path.startsWith('/api/dashboard') || path.startsWith('/api/top-') || path.startsWith('/api/longest-')) return 'Dashboard';
        if (path.startsWith('/api/docs')) return 'Documentation';
        if (path.startsWith('/api/changelog')) return 'Changelog';
        if (path.includes('health') || path.includes('session-id')) return 'Core';
        return 'Other';
      };

      // Build endpoint list with categories
      routes.forEach(route => {
        endpoints.push({
          category: categorizeEndpoint(route.path),
          method: route.method,
          path: route.path,
          description: route.path.split('/').pop().replace(/-/g, ' ')
        });
      });

      // Sort by category then path
      endpoints.sort((a, b) => {
        if (a.category !== b.category) {
          return a.category.localeCompare(b.category);
        }
        return a.path.localeCompare(b.path);
      });

      res.json({
        total: endpoints.length,
        endpoints
      });
    } catch (error) {
      logger.error('❌ Error discovering endpoints:', error);
      res.status(500).json({ error: 'Failed to discover endpoints' });
    }
  });

  return router;
}
