import { Router } from 'express';
import { logger } from '../utils/logger.js';
import fs from 'fs';
import { join } from 'path';
import si from 'systeminformation';

/**
 * Creates health and status monitoring routes
 * @param {object} deps - Dependencies { projectState, io, SESSION_ID, RAVEN_DIR, projectDatabases, projectWatchers, getHealthCheckSystem, getMetricsDatabase }
 * @returns {Router} Express router
 */
export function createHealthRoutes(deps) {
  const router = Router();
  const { projectState, io, SESSION_ID, RAVEN_DIR, projectDatabases, projectWatchers, getHealthCheckSystem, getMetricsDatabase } = deps;

  /**
   * GET /api/health
   * System health check including memory, storage, and process metrics
   */
  router.get('/health', async (req, res) => {
    try {
      const os = await import('os');

      // Memory usage (using systeminformation for accurate memory calculation)
      const mem = await si.mem();
      const totalMemory = mem.total;
      const freeMemory = mem.free;
      // Use active memory or calculate from available to exclude buffers/cache
      const actualUsed = mem.active || (mem.total - mem.available);
      const usedMemory = actualUsed;
      const memoryPercent = (actualUsed / mem.total) * 100;

      // Process memory
      const processMemory = process.memoryUsage();

      // Calculate .raven directory size
      const getRavenDirSize = (dirPath) => {
        let totalSize = 0;
        try {
          const items = fs.readdirSync(dirPath);
          for (const item of items) {
            const itemPath = join(dirPath, item);
            const stat = fs.statSync(itemPath);
            if (stat.isDirectory()) {
              totalSize += getRavenDirSize(itemPath);
            } else {
              totalSize += stat.size;
            }
          }
        } catch (err) {
          logger.error('Error calculating directory size:', err);
        }
        return totalSize;
      };

      const ravenSize = getRavenDirSize(RAVEN_DIR);

      // Estimate disk usage
      const estimatedDiskTotal = 100 * 1024 * 1024 * 1024; // 100GB
      const diskUsePercent = (ravenSize / estimatedDiskTotal) * 100;

      // Determine health status
      let status = 'healthy';
      const issues = [];

      if (memoryPercent > 90) {
        status = 'warning';
        issues.push('High system memory usage');
      }

      if (processMemory.heapUsed / processMemory.heapTotal > 0.9) {
        status = 'warning';
        issues.push('High process heap usage');
      }

      if (diskUsePercent > 95) {
        status = 'critical';
        issues.push('Critical storage usage');
        io.emit('storage-warning', {
          percentage: diskUsePercent.toFixed(1),
          size: ravenSize,
          critical: true
        });
      } else if (diskUsePercent > 85) {
        status = 'warning';
        issues.push('High storage usage');
        io.emit('storage-warning', {
          percentage: diskUsePercent.toFixed(1),
          size: ravenSize,
          critical: false
        });
      }

      res.json({
        status,
        issues,
        uptime: process.uptime(),
        memory: {
          system: {
            total: totalMemory,
            free: freeMemory,
            used: usedMemory,
            percent: memoryPercent.toFixed(1)
          },
          process: {
            heapTotal: processMemory.heapTotal,
            heapUsed: processMemory.heapUsed,
            external: processMemory.external,
            rss: processMemory.rss
          }
        },
        storage: {
          ravenSize,
          diskUsePercent: diskUsePercent.toFixed(1)
        },
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Health check error:', error);
      res.status(500).json({
        status: 'error',
        error: error.message
      });
    }
  });

  /**
   * GET /api/session-id
   * Get current session ID (public endpoint)
   */
  router.get('/session-id', (req, res) => {
    res.json({ session_id: SESSION_ID });
  });

  /**
   * GET /api/status
   * General status endpoint with version and uptime
   */
  router.get('/status', (req, res) => {
    res.json({
      status: 'online',
      version: '0.16.0',
      session_id: SESSION_ID,
      uptime: process.uptime(),
      timestamp: new Date().toISOString()
    });
  });

  /**
   * GET /api/health-checks
   * Get results from health check system
   */
  router.get('/health-checks', (req, res) => {
    try {
      const healthCheckSystem = getHealthCheckSystem();
      if (!healthCheckSystem) {
        return res.json({
          status: 'pending',
          message: 'Health checks have not run yet',
          summary: { total: 0, passed: 0, failed: 0 },
          checks: []
        });
      }

      const results = healthCheckSystem.getResults();
      res.json({
        status: results.summary.allPassed ? 'healthy' : 'unhealthy',
        ...results
      });
    } catch (error) {
      logger.error('Health checks API error:', error);
      res.status(500).json({
        status: 'error',
        error: error.message
      });
    }
  });

  /**
   * POST /api/health-checks/run
   * Manually trigger health checks
   */
  router.post('/health-checks/run', async (req, res) => {
    try {
      const healthCheckSystem = getHealthCheckSystem();
      if (!healthCheckSystem) {
        return res.status(503).json({
          status: 'error',
          error: 'Health check system not initialized'
        });
      }

      logger.info('Manual health check triggered via API');
      const summary = await healthCheckSystem.runAllChecks();
      const results = healthCheckSystem.getResults();

      res.json({
        status: summary.allPassed ? 'healthy' : 'unhealthy',
        message: `Health check completed: ${summary.passed}/${summary.total} passed`,
        ...results
      });
    } catch (error) {
      logger.error('Health check run error:', error);
      res.status(500).json({
        status: 'error',
        error: error.message
      });
    }
  });

  /**
   * GET /api/health/ready
   * Professional readiness endpoint - verifies all critical services are operational
   * Returns 200 when system is fully ready, 503 if not ready
   */
  router.get('/health/ready', async (req, res) => {
    try {
      const ready = {
        status: 'ready',
        checks: {
          databases: false,
          metrics: false,
          watchers: false,
          websocket: false,
          healthSystem: false
        },
        stats: {
          projects: 0,
          watchers: 0,
          wsClients: 0,
          uptime: process.uptime(),
          memory: process.memoryUsage()
        },
        timestamp: new Date().toISOString()
      };

      // Check 1: Databases loaded
      ready.checks.databases = projectDatabases && projectDatabases.size > 0;
      ready.stats.projects = projectDatabases ? projectDatabases.size : 0;

      // Check 2: Metrics collection is working
      if (getMetricsDatabase) {
        const metricsDb = getMetricsDatabase();
        if (metricsDb) {
          try {
            const recentMetrics = metricsDb.getRecentSystemMetrics(1);
            if (recentMetrics && recentMetrics.length > 0) {
              const latest = recentMetrics[0];
              const age = Date.now() - new Date(latest.timestamp).getTime();
              // Metrics should be less than 30 seconds old
              ready.checks.metrics = age < 30000;
            }
          } catch (error) {
            ready.checks.metrics = false;
          }
        }
      }

      // Check 3: File watchers active
      ready.checks.watchers = projectWatchers && projectWatchers.size > 0;
      ready.stats.watchers = projectWatchers ? projectWatchers.size : 0;

      // Check 4: WebSocket server operational
      try {
        ready.checks.websocket = io && io.engine && io.engine.clientsCount >= 0;
        ready.stats.wsClients = io && io.engine ? io.engine.clientsCount : 0;
      } catch (error) {
        ready.checks.websocket = false;
      }

      // Check 5: Health check system initialized
      const healthCheckSystem = getHealthCheckSystem();
      ready.checks.healthSystem = healthCheckSystem !== null;

      // Determine overall readiness
      ready.ready = Object.values(ready.checks).every(v => v === true);

      // Return appropriate status code
      const statusCode = ready.ready ? 200 : 503;

      res.status(statusCode).json(ready);
    } catch (error) {
      logger.error('Ready check error:', error);
      res.status(503).json({
        status: 'error',
        ready: false,
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  });

  /**
   * GET /api/health/projects
   * Get health scores for all projects based on velocity, stability, reliability, complexity, and recency
   */
  router.get('/health/projects', (req, res) => {
    try {
      const healthData = [];

      // Calculate health for each project
      for (const [projectName, db] of projectDatabases.entries()) {
        try {
          // Component 1: Code Velocity (20 points) - Changes per day over last 7 days
          const velocityData = db.db.prepare(`
            SELECT COUNT(*) as total_changes,
                   JULIANDAY('now') - JULIANDAY(MIN(timestamp)) as days
            FROM events
            WHERE timestamp >= datetime('now', '-7 days')
          `).get();
          const changesPerDay = velocityData.days > 0 ? velocityData.total_changes / velocityData.days : 0;
          const velocityScore = Math.min((changesPerDay / 50) * 20, 20); // Max 20 points if 50+ changes/day

          // Component 2: Rollback Rate (25 points) - Stability measure
          let stabilityScore = 25; // Default to full points if rollbacks table doesn't exist
          let rollbackRate = 0; // Declare outside try-catch for later use
          try {
            const rollbackData = db.db.prepare(`
              SELECT
                COUNT(DISTINCT e.id) as total_changes,
                COUNT(DISTINCT r.id) as rollback_count
              FROM events e
              LEFT JOIN rollbacks r ON e.id = r.event_id
              WHERE e.timestamp >= datetime('now', '-30 days')
            `).get();
            rollbackRate = rollbackData.total_changes > 0
              ? rollbackData.rollback_count / rollbackData.total_changes
              : 0;
            stabilityScore = Math.max((1 - rollbackRate) * 25, 0); // Max 25 points if 0% rollback
          } catch (rollbackError) {
            // Rollbacks table doesn't exist - assume no rollbacks (full stability score)
            rollbackRate = 0;
            stabilityScore = 25;
          }

          // Component 3: Agent Reliability (20 points) - Agent success rates
          let reliabilityScore = 15; // Default to 75% if agent data not available
          try {
            const agentStats = db.db.prepare(`
              SELECT
                agent,
                COUNT(*) as total,
                COUNT(CASE WHEN agent_confidence > 70 THEN 1 END) as high_confidence
              FROM events
              WHERE timestamp >= datetime('now', '-30 days')
              AND agent IS NOT NULL
              GROUP BY agent
            `).all();
            let avgConfidence = 0;
            if (agentStats.length > 0) {
              avgConfidence = agentStats.reduce((sum, a) => sum + (a.high_confidence / a.total), 0) / agentStats.length;
            }
            reliabilityScore = avgConfidence * 20; // Max 20 points if 100% high confidence
          } catch (agentError) {
            // Agent column doesn't exist - use default score
            reliabilityScore = 15;
          }

          // Component 4: Change Complexity (15 points) - Smaller, focused changes are better
          let complexityScore = 15; // Default to full points if diff data not available
          let avgDiffSize = 0; // Declare outside try-catch for later use
          try {
            const complexityData = db.db.prepare(`
              SELECT AVG(LENGTH(diff)) as avg_diff_size
              FROM events
              WHERE timestamp >= datetime('now', '-7 days')
              AND diff IS NOT NULL
            `).get();
            avgDiffSize = complexityData.avg_diff_size || 0;
            // Score inversely - smaller changes = better (ideal: 200-500 bytes)
            complexityScore = avgDiffSize > 0
              ? Math.max(15 - ((avgDiffSize - 350) / 100), 0)
              : 15;
          } catch (complexityError) {
            // Diff column doesn't exist - use default score
            avgDiffSize = 0;
            complexityScore = 15;
          }

          // Component 5: Activity Recency (20 points) - How recent is development
          // Check BOTH file events AND agent events for most recent activity
          const latestFileEvent = db.db.prepare(`
            SELECT timestamp FROM events ORDER BY timestamp DESC LIMIT 1
          `).get();
          const latestAgentEvent = db.db.prepare(`
            SELECT timestamp FROM agent_events ORDER BY timestamp DESC LIMIT 1
          `).get();

          // Get the most recent timestamp from either table
          let latestTimestamp = null;
          if (latestFileEvent && latestAgentEvent) {
            latestTimestamp = new Date(latestFileEvent.timestamp) > new Date(latestAgentEvent.timestamp)
              ? latestFileEvent.timestamp
              : latestAgentEvent.timestamp;
          } else if (latestFileEvent) {
            latestTimestamp = latestFileEvent.timestamp;
          } else if (latestAgentEvent) {
            latestTimestamp = latestAgentEvent.timestamp;
          }

          const latest = latestTimestamp ? { timestamp: latestTimestamp } : null;

          let recencyScore = 0;
          if (latest) {
            const hoursSinceActivity = (Date.now() - new Date(latest.timestamp).getTime()) / (1000 * 60 * 60);
            if (hoursSinceActivity < 1) recencyScore = 20;
            else if (hoursSinceActivity < 6) recencyScore = 18;
            else if (hoursSinceActivity < 24) recencyScore = 15;
            else if (hoursSinceActivity < 72) recencyScore = 10;
            else if (hoursSinceActivity < 168) recencyScore = 5;
          }

          // Calculate total health score (0-100)
          const healthScore = Math.round(
            velocityScore + stabilityScore + reliabilityScore +
            Math.min(complexityScore, 15) + recencyScore
          );

          // Determine status based on most recent activity (file OR agent events)
          let status = 'inactive';
          if (latest) {
            const minutesSinceActivity = (Date.now() - new Date(latest.timestamp).getTime()) / (1000 * 60);
            if (minutesSinceActivity < 5) status = 'active';  // Active in last 5 minutes
            else if (minutesSinceActivity < 60) status = 'recent';  // Active in last hour
            else if (minutesSinceActivity < 1440) status = 'idle';  // Active in last 24 hours
          }

          // Get recent event count from BOTH tables
          const recentFileEvents = db.db.prepare(`
            SELECT COUNT(*) as count FROM events
            WHERE timestamp >= datetime('now', '-24 hours')
          `).get();
          const recentAgentEvents = db.db.prepare(`
            SELECT COUNT(*) as count FROM agent_events
            WHERE timestamp >= datetime('now', '-24 hours')
          `).get();
          const totalRecentEvents = (recentFileEvents.count || 0) + (recentAgentEvents.count || 0);

          // Get error count from error_logs table
          let errorCount = 0;
          try {
            const errorData = db.db.prepare(`
              SELECT COUNT(*) as count FROM error_logs
            `).get();
            errorCount = errorData.count || 0;
          } catch (errorQueryError) {
            // error_logs table doesn't exist - no errors to count
            errorCount = 0;
          }

          healthData.push({
            name: projectName,
            status,
            health_score: healthScore,
            components: {
              velocity: Math.round(velocityScore),
              stability: Math.round(stabilityScore),
              reliability: Math.round(reliabilityScore),
              complexity: Math.round(Math.min(complexityScore, 15)),
              recency: Math.round(recencyScore)
            },
            metrics: {
              changes_per_day: changesPerDay.toFixed(1),
              rollback_rate: (rollbackRate * 100).toFixed(1) + '%',
              avg_diff_size: Math.round(avgDiffSize),
              hours_since_activity: latest ?
                ((Date.now() - new Date(latest.timestamp).getTime()) / (1000 * 60 * 60)).toFixed(1) :
                null
            },
            recent_events: totalRecentEvents,
            error_count: errorCount,
            last_activity: latest?.timestamp || null
          });
        } catch (projectError) {
          logger.error(`Error calculating health for project ${projectName}:`, projectError);
          // Add project with minimal data on error
          healthData.push({
            name: projectName,
            status: 'error',
            health_score: 0,
            error: 'Failed to calculate health'
          });
        }
      }

      // Sort by health score descending
      healthData.sort((a, b) => b.health_score - a.health_score);

      const activeCount = healthData.filter(p => p.status === 'active').length;
      const recentCount = healthData.filter(p => p.status === 'recent').length;
      const idleCount = healthData.filter(p => p.status === 'idle').length;
      const inactiveCount = healthData.filter(p => p.status === 'inactive').length;

      res.json({
        projects: healthData,
        total_projects: projectDatabases.size,
        active_projects: activeCount,
        recent_projects: recentCount,
        idle_projects: idleCount + inactiveCount,  // Combine idle and inactive for display
        average_health: healthData.length > 0
          ? Math.round(healthData.reduce((sum, p) => sum + p.health_score, 0) / healthData.length)
          : 0
      });
    } catch (error) {
      logger.error('Multi-project health error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}
