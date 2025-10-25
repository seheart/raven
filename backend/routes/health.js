import { Router } from 'express';
import { logger } from '../utils/logger.js';
import fs from 'fs';
import { join } from 'path';

/**
 * Creates health and status monitoring routes
 * @param {object} deps - Dependencies { projectState, io, SESSION_ID, RAVEN_DIR, projectDatabases, healthCheckSystem }
 * @returns {Router} Express router
 */
export function createHealthRoutes(deps) {
  const router = Router();
  const { projectState, io, SESSION_ID, RAVEN_DIR, projectDatabases, healthCheckSystem } = deps;

  /**
   * GET /api/health
   * System health check including memory, storage, and process metrics
   */
  router.get('/health', async (req, res) => {
    try {
      const os = await import('os');

      // Memory usage
      const totalMemory = os.totalmem();
      const freeMemory = os.freemem();
      const usedMemory = totalMemory - freeMemory;
      const memoryPercent = (usedMemory / totalMemory) * 100;

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
      if (!healthCheckSystem) {
        return res.json({
          status: 'pending',
          message: 'Health checks have not run yet',
          results: []
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
          const rollbackData = db.db.prepare(`
            SELECT
              COUNT(DISTINCT e.id) as total_changes,
              COUNT(DISTINCT r.id) as rollback_count
            FROM events e
            LEFT JOIN rollbacks r ON e.id = r.event_id
            WHERE e.timestamp >= datetime('now', '-30 days')
          `).get();
          const rollbackRate = rollbackData.total_changes > 0
            ? rollbackData.rollback_count / rollbackData.total_changes
            : 0;
          const stabilityScore = Math.max((1 - rollbackRate) * 25, 0); // Max 25 points if 0% rollback

          // Component 3: Agent Reliability (20 points) - Agent success rates
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
          const reliabilityScore = avgConfidence * 20; // Max 20 points if 100% high confidence

          // Component 4: Change Complexity (15 points) - Smaller, focused changes are better
          const complexityData = db.db.prepare(`
            SELECT AVG(LENGTH(diff)) as avg_diff_size
            FROM events
            WHERE timestamp >= datetime('now', '-7 days')
            AND diff IS NOT NULL
          `).get();
          const avgDiffSize = complexityData.avg_diff_size || 0;
          // Score inversely - smaller changes = better (ideal: 200-500 bytes)
          const complexityScore = avgDiffSize > 0
            ? Math.max(15 - ((avgDiffSize - 350) / 100), 0)
            : 15;

          // Component 5: Activity Recency (20 points) - How recent is development
          const latest = db.db.prepare(`
            SELECT timestamp FROM events ORDER BY timestamp DESC LIMIT 1
          `).get();
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

          // Determine status
          let status = 'inactive';
          if (latest) {
            const lastActivityHours = (Date.now() - new Date(latest.timestamp).getTime()) / (1000 * 60 * 60);
            if (lastActivityHours < 1) status = 'active';
            else if (lastActivityHours < 24) status = 'recent';
            else if (lastActivityHours < 168) status = 'idle';
          }

          // Get recent event count
          const recentEvents = db.db.prepare(`
            SELECT COUNT(*) as count FROM events
            WHERE timestamp >= datetime('now', '-24 hours')
          `).get();

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
            recent_events: recentEvents.count || 0,
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

      res.json({
        projects: healthData,
        total_projects: projectDatabases.size,
        active_projects: healthData.filter(p => p.status === 'active').length,
        recent_projects: healthData.filter(p => p.status === 'recent').length,
        idle_projects: healthData.filter(p => p.status === 'idle').length,
        inactive_projects: healthData.filter(p => p.status === 'inactive').length,
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
