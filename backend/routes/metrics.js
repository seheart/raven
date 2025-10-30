import { Router } from 'express';
import { logger } from '../utils/logger.js';
import { getMetricsJson, getMetricsPrometheus } from '../middleware/metrics.js';
import { env } from '../config/environment.js';

/**
 * Creates metrics and performance routes
 * @param {object} deps - Dependencies
 * @returns {Router} Express router
 */
export function createMetricsRoutes(deps) {
  const router = Router();
  const {
    projectDatabases,
    cacheMiddleware,
    metricsCache,
    analyticsCache,
    dashboardCache
  } = deps;

  // ==================== Real-time Metrics (from middleware) ====================

  /**
   * GET /metrics/json
   * Get metrics in JSON format
   */
  router.get('/metrics/json', (req, res) => {
    if (!env.ENABLE_METRICS) {
      return res.status(503).json({ error: 'Metrics collection is disabled' });
    }
    try {
      const metricsData = getMetricsJson();
      res.json(metricsData);
    } catch (error) {
      logger.error('Get metrics JSON error:', error);
      res.status(500).json({ error: 'Failed to retrieve metrics' });
    }
  });

  /**
   * GET /metrics
   * Get metrics in Prometheus format
   */
  router.get('/metrics', (req, res) => {
    if (!env.ENABLE_METRICS) {
      return res.status(503).json({ error: 'Metrics collection is disabled' });
    }
    try {
      const prometheusMetrics = getMetricsPrometheus();
      res.type('text/plain').send(prometheusMetrics);
    } catch (error) {
      logger.error('Get Prometheus metrics error:', error);
      res.status(500).type('text/plain').send('# Error retrieving metrics\n');
    }
  });

  // ==================== System & Process Metrics ====================

  /**
   * GET /api/system-metrics
   * Get system metrics from raven database
   */
  router.get('/system-metrics', cacheMiddleware(metricsCache), (req, res) => {
    try {
      const { limit = 100, offset = 0 } = req.query;
      const ravenDb = projectDatabases.get('raven');
      if (!ravenDb || !ravenDb.db) {
        return res.status(500).json({ error: 'Raven database not initialized' });
      }
      const stmt = ravenDb.db.prepare('SELECT * FROM raven_metrics ORDER BY timestamp DESC LIMIT ? OFFSET ?');
      const metrics = stmt.all(parseInt(limit), parseInt(offset));
      res.json(metrics);
    } catch (error) {
      logger.error('Get system metrics error:', error);
      res.status(500).json({ error: 'Failed to retrieve system metrics' });
    }
  });

  /**
   * GET /api/process-metrics/:agent
   * Get process metrics for a specific agent
   */
  router.get('/process-metrics/:agent', (req, res) => {
    try {
      const { limit = 100, offset = 0 } = req.query;
      const agent = req.params.agent;
      const ravenDb = projectDatabases.get('raven');
      if (!ravenDb || !ravenDb.db) {
        return res.status(500).json({ error: 'Raven database not initialized' });
      }
      const stmt = ravenDb.db.prepare('SELECT * FROM process_metrics WHERE agent_name = ? ORDER BY timestamp DESC LIMIT ? OFFSET ?');
      const metrics = stmt.all(agent, parseInt(limit), parseInt(offset));
      res.json(metrics);
    } catch (error) {
      logger.error('Get process metrics by agent error:', error);
      res.status(500).json({ error: 'Failed to retrieve process metrics' });
    }
  });

  /**
   * GET /api/process-metrics
   * Get all process metrics with optional agent filter
   */
  router.get('/process-metrics', (req, res) => {
    try {
      const { limit = 100, offset = 0, agent = null } = req.query;
      const ravenDb = projectDatabases.get('raven');
      if (!ravenDb || !ravenDb.db) {
        return res.status(500).json({ error: 'Raven database not initialized' });
      }
      let query = 'SELECT * FROM process_metrics';
      const params = [];
      if (agent) {
        query += ' WHERE agent_name = ?';
        params.push(agent);
      }
      query += ' ORDER BY timestamp DESC LIMIT ? OFFSET ?';
      params.push(parseInt(limit), parseInt(offset));
      const stmt = ravenDb.db.prepare(query);
      const metrics = stmt.all(...params);
      res.json(metrics);
    } catch (error) {
      logger.error('Get process metrics error:', error);
      res.status(500).json({ error: 'Failed to retrieve process metrics' });
    }
  });

  // ==================== Metrics Statistics ====================

  /**
   * GET /api/metrics-stats
   * Get metrics statistics for a time range
   */
  router.get('/metrics-stats', cacheMiddleware(analyticsCache), (req, res) => {
    try {
      const ravenDb = projectDatabases.get('raven');
      if (!ravenDb || !ravenDb.db) {
        return res.status(500).json({ error: 'Raven database not initialized' });
      }
      // Default to last 24 hours if not specified
      const now = Date.now();
      const dayAgo = now - 24 * 60 * 60 * 1000;

      const start_time = req.query.start_time || new Date(dayAgo).toISOString();
      const end_time = req.query.end_time || new Date(now).toISOString();

      const stats = ravenDb.getMetricsStats(start_time, end_time);
      res.json(stats);
    } catch (error) {
      logger.error('Metrics stats error:', error);
      res.status(500).json({ error: 'Failed to retrieve metrics stats' });
    }
  });

  /**
   * GET /api/performance-correlations
   * Correlate events with metrics within a time window
   */
  router.get('/performance-correlations', cacheMiddleware(analyticsCache), (req, res) => {
    try {
      const ravenDb = projectDatabases.get('raven');
      if (!ravenDb || !ravenDb.db) {
        return res.status(500).json({ error: 'Raven database not initialized' });
      }
      const time_window_seconds = parseInt(req.query.time_window_seconds) || 5;
      const correlations = ravenDb.correlateEventsWithMetrics(time_window_seconds);
      res.json(correlations);
    } catch (error) {
      logger.error('Performance correlations error:', error);
      res.status(500).json({ error: 'Failed to retrieve performance correlations' });
    }
  });

  // ==================== Metrics Dashboard ====================

  /**
   * GET /api/metrics/dashboard
   * Comprehensive metrics dashboard aggregating data across all projects
   */
  router.get('/metrics/dashboard', cacheMiddleware(dashboardCache), (req, res) => {
    try {
      if (projectDatabases.size === 0) {
        return res.status(500).json({ error: 'No project databases initialized' });
      }

      // Aggregate metrics across all projects
      const metrics = {
        total_events: 0,
        events_24h: 0,
        total_files: 0,
        error_count: 0,
        conversation_count: 0,
        events_by_type: {},
        active_projects: 0
      };

      const fileActivity = new Map();
      const hourlyActivity = new Map();
      const dailyEvents = [];

      // Iterate through all project databases
      for (const [projectName, db] of projectDatabases.entries()) {
        try {
          // Total events
          const totalEvents = db.db.prepare('SELECT COUNT(*) as count FROM events').get();
          metrics.total_events += totalEvents.count;

          // Events by type (normalize names: add->created, change->modified, unlink->deleted)
          const eventsByType = db.db.prepare(`
            SELECT change_type, COUNT(*) as count
            FROM events
            GROUP BY change_type
          `).all();

          for (const row of eventsByType) {
            let normalizedType = row.change_type;
            // Map legacy types to new standardized types
            if (row.change_type === 'add') normalizedType = 'create';
            else if (row.change_type === 'change') normalizedType = 'edit';
            else if (row.change_type === 'unlink') normalizedType = 'delete';
            // New types are already normalized (create, edit, delete)

            metrics.events_by_type[normalizedType] = (metrics.events_by_type[normalizedType] || 0) + row.count;
          }

          // Events last 24h
          const events24h = db.db.prepare(`
            SELECT COUNT(*) as count FROM events
            WHERE timestamp >= datetime('now', '-24 hours')
          `).get();
          metrics.events_24h += events24h.count;

          // Check if project was active in last 7 days
          const projectActivity = db.db.prepare(`
            SELECT COUNT(*) as count FROM events
            WHERE timestamp >= datetime('now', '-7 days')
          `).get();
          if (projectActivity.count > 0) metrics.active_projects++;

          // Track unique files (limit to prevent performance issues)
          const files = db.db.prepare(`
            SELECT DISTINCT filepath FROM events
            LIMIT 10000
          `).all();
          metrics.total_files += files.length;

          // File activity for most active file (limit to top 1000 files)
          const fileStats = db.db.prepare(`
            SELECT filepath, COUNT(*) as count FROM events
            WHERE timestamp >= datetime('now', '-7 days')
            GROUP BY filepath
            ORDER BY count DESC
            LIMIT 1000
          `).all();
          for (const stat of fileStats) {
            const key = `${projectName}/${stat.filepath}`;
            fileActivity.set(key, (fileActivity.get(key) || 0) + stat.count);
          }

          // Error count
          const errors = db.db.prepare('SELECT COUNT(*) as count FROM error_logs').get();
          metrics.error_count += errors.count;

          // Conversation count
          const convos = db.db.prepare('SELECT COUNT(*) as count FROM conversations').get();
          metrics.conversation_count += convos.count;

          // Daily events for average
          const daily = db.db.prepare(`
            SELECT DATE(timestamp) as day, COUNT(*) as count
            FROM events
            WHERE timestamp >= datetime('now', '-7 days')
            GROUP BY day
          `).all();
          dailyEvents.push(...daily.map(d => d.count));

          // Hourly activity
          const hourly = db.db.prepare(`
            SELECT strftime('%H', timestamp) as hour, COUNT(*) as count
            FROM events
            GROUP BY hour
          `).all();
          for (const h of hourly) {
            hourlyActivity.set(h.hour, (hourlyActivity.get(h.hour) || 0) + h.count);
          }
        } catch (dbError) {
          logger.error(`Error querying ${projectName} database:`, dbError);
        }
      }

      // Calculate most active file
      let mostActiveFile = null;
      let maxCount = 0;
      for (const [file, count] of fileActivity.entries()) {
        if (count > maxCount) {
          maxCount = count;
          mostActiveFile = file;
        }
      }
      metrics.most_active_file = mostActiveFile ? { file: mostActiveFile, changes: maxCount } : null;

      // Calculate average events per day
      metrics.avg_events_per_day = dailyEvents.length > 0
        ? Math.round(dailyEvents.reduce((a, b) => a + b, 0) / dailyEvents.length)
        : 0;

      // Find busiest hour
      let busiestHour = null;
      let maxHourCount = 0;
      for (const [hour, count] of hourlyActivity.entries()) {
        if (count > maxHourCount) {
          maxHourCount = count;
          busiestHour = { hour: parseInt(hour), count };
        }
      }
      metrics.busiest_hour = busiestHour;

      res.json({ metrics });
    } catch (error) {
      logger.error('Custom metrics error:', error);
      res.status(500).json({ error: 'Failed to retrieve custom metrics' });
    }
  });

  return router;
}
