import { Router } from 'express';
import { logger } from '../utils/logger.js';

/**
 * Creates analytics and monitoring routes
 * @param {object} deps - Dependencies
 * @returns {Router} Express router
 */
export function createAnalyticsRoutes(deps) {
  const router = Router();
  // Note: Don't destructure behaviorProfiler/patternMatcher - access from deps dynamically
  // so it works even if they're added to deps after route mounting
  const { projectState, projectDatabases, cacheMiddleware, analyticsCache } = deps;

  // ==================== Agent Events ====================

  /**
   * GET /api/agent-events
   * Get recent agent events (with caching)
   */
  router.get('/agent-events', cacheMiddleware(analyticsCache), (req, res) => {
    try {
      if (!projectState.db) {
        return res.status(500).json({ error: 'Database not initialized' });
      }
      const limit = parseInt(req.query.limit, 10) || 100;
      const events = projectState.db.getRecentAgentEvents(limit);
      res.json(events);
    } catch (error) {
      logger.error('Agent events error:', error);
      res.status(500).json({ error: 'Failed to retrieve agent events' });
    }
  });

  /**
   * GET /api/all-agent-events
   * Get agent events from ALL projects (multi-project aggregation)
   */
  router.get('/all-agent-events', async (req, res) => {
    try {
      const limit = parseInt(req.query.limit, 10) || 100;

      // Parallelize event collection from all projects
      const eventsPromises = Array.from(projectDatabases.entries()).map(([projectName, db]) =>
        Promise.resolve({
          projectName,
          events: db.getRecentAgentEvents ? db.getRecentAgentEvents(limit) : []
        })
      );

      const allProjectEvents = await Promise.all(eventsPromises);

      // Collect and tag events with project names
      const allEvents = [];
      for (const { projectName, events } of allProjectEvents) {
        events.forEach(event => {
          event.project = projectName;
        });
        allEvents.push(...events);
      }

      // Sort by timestamp (newest first) and limit
      allEvents.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      const limitedEvents = allEvents.slice(0, limit);

      res.json(limitedEvents);
    } catch (error) {
      logger.error('All agent events error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * GET /api/agent/:agent/top-files
   * Get top modified files for an agent
   */
  router.get('/agent/:agent/top-files', (req, res) => {
    try {
      if (!projectState.db) {
        return res.status(500).json({ error: 'Database not initialized' });
      }
      const { agent } = req.params;
      const limit = parseInt(req.query.limit, 10) || 5;
      const topFiles = projectState.db.getTopFilesByAgent(agent, limit);
      res.json(topFiles);
    } catch (error) {
      logger.error('Top files error:', error);
      res.status(500).json({ error: 'Failed to retrieve top files' });
    }
  });

  /**
   * GET /api/events-by-agent/:agent
   * Get events filtered by agent name
   */
  router.get('/events-by-agent/:agent', (req, res) => {
    try {
      if (!projectState.db) {
        return res.status(500).json({ error: 'Database not initialized' });
      }
      const { agent } = req.params;
      const limit = parseInt(req.query.limit, 10) || 100;
      const events = projectState.db.getEventsByAgent(agent, limit);
      res.json(events);
    } catch (error) {
      logger.error('Events by agent error:', error);
      res.status(500).json({ error: 'Failed to retrieve events by agent' });
    }
  });

  // ==================== Anomaly Detection ====================

  /**
   * GET /api/anomalies/detect
   * Detect anomalies across all projects (activity spikes, excessive deletions, hot files)
   */
  router.get('/anomalies/detect', cacheMiddleware(analyticsCache), (req, res) => {
    try {
      const lookbackHours = parseInt(req.query.hours, 10) || 24;
      const threshold = parseFloat(req.query.threshold) || 2.0; // Standard deviations
      const lookbackTime = new Date(Date.now() - lookbackHours * 60 * 60 * 1000).toISOString();

      const allAnomalies = [];
      let totalAvgPerHour = 0;
      let projectCount = 0;

      // Aggregate across all projects
      for (const [projectName, db] of projectDatabases.entries()) {
        try {
          // Get baseline (historical hourly average)
          const baseline = db.db
            .prepare(
              `
            SELECT strftime('%H', timestamp) as hour, COUNT(*) as count
            FROM events
            WHERE datetime(timestamp) < datetime(?)
            GROUP BY hour
          `
            )
            .all(lookbackTime);

          const avgPerHour =
            baseline.reduce((sum, h) => sum + h.count, 0) / Math.max(baseline.length, 1);
          const stdDev = Math.sqrt(
            baseline.reduce((sum, h) => sum + Math.pow(h.count - avgPerHour, 2), 0) /
              Math.max(baseline.length, 1)
          );

          // Accumulate for global baseline
          totalAvgPerHour += avgPerHour;
          projectCount++;

          // Check recent activity
          const recent = db.db
            .prepare(
              `
            SELECT
              strftime('%Y-%m-%d %H:00:00', timestamp) as hour,
              COUNT(*) as event_count,
              SUM(CASE WHEN change_type = 'unlink' THEN 1 ELSE 0 END) as deletions,
              COUNT(DISTINCT filepath) as unique_files
            FROM events
            WHERE datetime(timestamp) >= datetime(?)
            GROUP BY hour
            ORDER BY hour DESC
          `
            )
            .all(lookbackTime);

          // Detect anomalies for this project
          for (const hour of recent) {
            // Activity spike detection
            if (hour.event_count > avgPerHour + threshold * stdDev) {
              allAnomalies.push({
                project: projectName,
                type: 'activity_spike',
                severity: 'warning',
                timestamp: hour.hour,
                message: `${projectName}: Unusual activity spike - ${hour.event_count} events (avg: ${Math.round(avgPerHour)})`,
                details: {
                  event_count: hour.event_count,
                  average: Math.round(avgPerHour),
                  std_devs: ((hour.event_count - avgPerHour) / Math.max(stdDev, 1)).toFixed(2)
                }
              });
            }

            // Excessive deletions detection
            if (hour.deletions > 10) {
              allAnomalies.push({
                project: projectName,
                type: 'excessive_deletions',
                severity: 'critical',
                timestamp: hour.hour,
                message: `${projectName}: High deletion count - ${hour.deletions} files deleted`,
                details: { deletions: hour.deletions, threshold: 10 }
              });
            }
          }

          // Detect hot files (frequently modified)
          const hotFiles = db.db
            .prepare(
              `
            SELECT filepath, COUNT(*) as change_count
            FROM events
            WHERE datetime(timestamp) >= datetime(?)
            GROUP BY filepath
            HAVING change_count > 20
            ORDER BY change_count DESC
            LIMIT 5
          `
            )
            .all(lookbackTime);

          for (const file of hotFiles) {
            allAnomalies.push({
              project: projectName,
              type: 'hot_file',
              severity: 'info',
              timestamp: new Date().toISOString(),
              message: `${projectName}: File modified frequently - ${file.filepath} (${file.change_count} changes)`,
              details: { filepath: file.filepath, change_count: file.change_count }
            });
          }
        } catch (projectError) {
          logger.error(`Error detecting anomalies for project ${projectName}:`, projectError);
        }
      }

      // Sort by timestamp descending
      allAnomalies.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

      // Calculate global baseline
      const globalAvgPerHour = projectCount > 0 ? Math.round(totalAvgPerHour / projectCount) : 0;

      res.json({
        lookback_hours: lookbackHours,
        threshold,
        anomalies: allAnomalies,
        total_anomalies: allAnomalies.length,
        projects_scanned: projectDatabases.size,
        baseline: {
          avg_per_hour: globalAvgPerHour
        }
      });
    } catch (error) {
      logger.error('Anomaly detection error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // ==================== Historical Trends ====================

  /**
   * GET /api/trends/historical
   * Get aggregated historical trends across all projects
   */
  router.get('/trends/historical', cacheMiddleware(analyticsCache), (req, res) => {
    try {
      // Security: Strict validation for period parameter
      const ALLOWED_PERIODS = ['hourly', 'daily', 'weekly'];
      const requestedPeriod = req.query.period || 'hourly';

      if (!ALLOWED_PERIODS.includes(requestedPeriod)) {
        return res.status(400).json({
          error: 'Invalid period parameter. Must be one of: hourly, daily, weekly'
        });
      }

      const period = requestedPeriod;
      const days = parseInt(req.query.days, 10) || 7; // last N days

      const now = Date.now();
      const startTime = new Date(now - days * 24 * 60 * 60 * 1000).toISOString();

      if (projectDatabases.size === 0) {
        return res.json({
          period,
          days,
          start_time: startTime,
          trends: []
        });
      }

      // Aggregate trends across all projects
      const aggregatedTrends = new Map();

      // Get events grouped by time period from all databases
      const sql = `
        SELECT
          CASE
            WHEN ? = 'hourly' THEN strftime('%Y-%m-%d %H:00:00', timestamp)
            WHEN ? = 'daily' THEN strftime('%Y-%m-%d', timestamp)
            WHEN ? = 'weekly' THEN strftime('%Y-W%W', timestamp)
            ELSE strftime('%Y-%m-%d %H:00:00', timestamp)
          END as period,
          COUNT(*) as event_count,
          SUM(CASE WHEN change_type IN ('change', 'edit') THEN 1 ELSE 0 END) as modifications,
          SUM(CASE WHEN change_type IN ('add', 'create') THEN 1 ELSE 0 END) as creations,
          SUM(CASE WHEN change_type IN ('unlink', 'delete') THEN 1 ELSE 0 END) as deletions,
          COUNT(DISTINCT filepath) as unique_files
        FROM events
        WHERE timestamp >= ?
        GROUP BY period
        ORDER BY period ASC
      `;

      for (const [projectName, db] of projectDatabases.entries()) {
        try {
          const stmt = db.db.prepare(sql);
          const projectTrends = stmt.all(period, period, period, startTime);

          for (const trend of projectTrends) {
            const existing = aggregatedTrends.get(trend.period) || {
              period: trend.period,
              event_count: 0,
              modifications: 0,
              creations: 0,
              deletions: 0,
              unique_files: 0
            };

            existing.event_count += trend.event_count;
            existing.modifications += trend.modifications;
            existing.creations += trend.creations;
            existing.deletions += trend.deletions;
            existing.unique_files += trend.unique_files;

            aggregatedTrends.set(trend.period, existing);
          }
        } catch (dbError) {
          logger.error(`Error querying trends from ${projectName}:`, dbError);
        }
      }

      // Convert map to sorted array
      const trends = Array.from(aggregatedTrends.values()).sort((a, b) =>
        a.period.localeCompare(b.period)
      );

      res.json({
        period,
        days,
        start_time: startTime,
        trends
      });
    } catch (error) {
      logger.error('Historical trends error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // ==================== Agent Monitoring ====================

  /**
   * GET /api/agents/:agent/profile
   * Get detailed agent profile with behavioral statistics
   */
  router.get('/agents/:agent/profile', (req, res) => {
    try {
      const { agent } = req.params;
      const { project, days } = req.query;

      if (!deps.behaviorProfiler) {
        return res.status(503).json({ error: 'Behavior profiler not initialized' });
      }

      const projectKeys = Array.from(projectDatabases.keys());
      if (!project && projectKeys.length === 0) {
        return res.status(400).json({ error: 'No projects available' });
      }

      const profile = deps.behaviorProfiler.getAgentProfile(
        project || projectKeys[0],
        agent,
        parseInt(days, 10) || 30
      );

      if (!profile) {
        return res.status(404).json({ error: 'No data found for this agent' });
      }

      res.json({ profile });
    } catch (error) {
      logger.error('Error getting agent profile:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * GET /api/agents/:agent/behavior-change
   * Detect behavioral changes in agent patterns
   */
  router.get('/agents/:agent/behavior-change', (req, res) => {
    try {
      const { agent } = req.params;
      const { project, hours } = req.query;

      if (!deps.behaviorProfiler) {
        return res.status(503).json({ error: 'Behavior profiler not initialized' });
      }

      const projectKeys = Array.from(projectDatabases.keys());
      if (!project && projectKeys.length === 0) {
        return res.status(400).json({ error: 'No projects available' });
      }

      const change = deps.behaviorProfiler.detectBehaviorChange(
        project || projectKeys[0],
        agent,
        parseInt(hours, 10) || 24
      );

      res.json({ change });
    } catch (error) {
      logger.error('Error detecting behavior change:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * GET /api/agents/compare
   * Compare agents across a project
   */
  router.get('/agents/compare', cacheMiddleware(analyticsCache), (req, res) => {
    try {
      const { project } = req.query;

      if (!deps.behaviorProfiler) {
        return res.status(503).json({ error: 'Behavior profiler not initialized' });
      }

      const projectKeys = Array.from(projectDatabases.keys());
      if (!project && projectKeys.length === 0) {
        return res.status(400).json({ error: 'No projects available' });
      }

      const comparison = deps.behaviorProfiler.compareAgents(project || projectKeys[0]);

      res.json({ agents: comparison });
    } catch (error) {
      logger.error('Error comparing agents:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // ==================== Pattern Matching ====================

  /**
   * POST /api/changes/:id/similar
   * Find changes similar to a given change (pattern matching)
   */
  router.post('/changes/:id/similar', (req, res) => {
    try {
      const { id } = req.params;
      const { project, limit } = req.query;

      if (!deps.patternMatcher) {
        return res.status(503).json({ error: 'Pattern matcher not initialized' });
      }

      const projectKeys = Array.from(projectDatabases.keys());
      if (!project && projectKeys.length === 0) {
        return res.status(400).json({ error: 'No projects available' });
      }

      const projectName = project || projectKeys[0];
      const db = projectDatabases.get(projectName);

      if (!db) {
        return res.status(404).json({ error: 'Project not found' });
      }

      // Get the change
      const change = db.db.prepare('SELECT * FROM events WHERE id = ?').get(id);

      if (!change) {
        return res.status(404).json({ error: 'Change not found' });
      }

      const similar = deps.patternMatcher.findSimilarChanges(
        change,
        projectName,
        parseInt(limit) || 5
      );

      res.json({ similar });
    } catch (error) {
      logger.error('Error finding similar changes:', error);
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}
