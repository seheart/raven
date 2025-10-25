/**
 * BehaviorProfiler - Tracks agent behavior patterns and detects anomalies
 *
 * Monitors:
 * - Agent "mood" (aggressive vs conservative)
 * - Behavior changes over time
 * - Deviation from normal patterns
 */

import { logger } from '../utils/logger.js';

export class BehaviorProfiler {
  constructor(projectDatabases) {
    this.projectDatabases = projectDatabases;
    this.profiles = new Map(); // Cache of agent profiles
  }

  /**
   * Get behavior profile for an agent
   * @param {string} projectName
   * @param {string} agent
   * @param {number} days - Lookback period (default 30)
   */
  getAgentProfile(projectName, agent, days = 30) {
    const cacheKey = `${projectName}_${agent}_${days}`;

    // Check cache (5 minute TTL)
    const cached = this.profiles.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp < 300000)) {
      return cached.profile;
    }

    const db = this.projectDatabases.get(projectName);
    if (!db) return null;

    try {
      const lookbackTime = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

      // Get agent's change statistics
      const stats = db.db.prepare(`
        SELECT
          COUNT(*) as total_changes,
          SUM(CASE WHEN change_type = 'add' THEN 1 ELSE 0 END) as creations,
          SUM(CASE WHEN change_type = 'change' THEN 1 ELSE 0 END) as modifications,
          SUM(CASE WHEN change_type = 'unlink' THEN 1 ELSE 0 END) as deletions,
          AVG(LENGTH(diff)) as avg_diff_size,
          COUNT(DISTINCT filepath) as unique_files
        FROM events
        WHERE agent = ?
        AND timestamp > ?
      `).get(agent, lookbackTime);

      if (!stats || stats.total_changes === 0) {
        return null;
      }

      // Calculate behavior metrics
      const profile = {
        agent,
        totalChanges: stats.total_changes,
        creationRate: stats.creations / stats.total_changes,
        modificationRate: stats.modifications / stats.total_changes,
        deletionRate: stats.deletions / stats.total_changes,
        avgChangeSize: Math.round(stats.avg_diff_size),
        uniqueFiles: stats.unique_files,
        changesPerDay: stats.total_changes / days,

        // Behavioral characteristics
        mood: this.determineAgentMood(stats),
        style: this.determineAgentStyle(stats),
        confidence: this.calculateConfidence(db, agent, lookbackTime)
      };

      // Cache the profile
      this.profiles.set(cacheKey, {
        profile,
        timestamp: Date.now()
      });

      return profile;
    } catch (e) {
      logger.error('Error building agent profile', { error: e, projectName, agent });
      return null;
    }
  }

  /**
   * Compare current behavior to baseline
   * @param {string} projectName
   * @param {string} agent
   * @param {number} recentHours - Recent period to analyze (default 24)
   */
  detectBehaviorChange(projectName, agent, recentHours = 24) {
    const db = this.projectDatabases.get(projectName);
    if (!db) return null;

    try {
      // Get baseline (30 day average)
      const baseline = this.getAgentProfile(projectName, agent, 30);
      if (!baseline) return null;

      // Get recent behavior (last 24 hours)
      const recentTime = new Date(Date.now() - recentHours * 60 * 60 * 1000).toISOString();

      const recent = db.db.prepare(`
        SELECT
          COUNT(*) as total_changes,
          SUM(CASE WHEN change_type = 'add' THEN 1 ELSE 0 END) as creations,
          SUM(CASE WHEN change_type = 'change' THEN 1 ELSE 0 END) as modifications,
          SUM(CASE WHEN change_type = 'unlink' THEN 1 ELSE 0 END) as deletions,
          AVG(LENGTH(diff)) as avg_diff_size
        FROM events
        WHERE agent = ?
        AND timestamp > ?
      `).get(agent, recentTime);

      if (!recent || recent.total_changes === 0) {
        return null;
      }

      // Calculate deviations from baseline
      const deviations = [];

      // Deletion rate check
      const recentDeletionRate = recent.deletions / recent.total_changes;
      const deletionDeviation = (recentDeletionRate - baseline.deletionRate) / Math.max(baseline.deletionRate, 0.01);
      if (Math.abs(deletionDeviation) > 2) {
        deviations.push({
          metric: 'deletion_rate',
          baseline: (baseline.deletionRate * 100).toFixed(1) + '%',
          current: (recentDeletionRate * 100).toFixed(1) + '%',
          change: deletionDeviation > 0 ? `↑${(deletionDeviation * 100).toFixed(0)}%` : `↓${(Math.abs(deletionDeviation) * 100).toFixed(0)}%`,
          severity: Math.min(Math.abs(deletionDeviation) / 5, 1)
        });
      }

      // Change size check
      const sizeDeviation = (recent.avg_diff_size - baseline.avgChangeSize) / Math.max(baseline.avgChangeSize, 1);
      if (Math.abs(sizeDeviation) > 1.5) {
        deviations.push({
          metric: 'change_size',
          baseline: baseline.avgChangeSize + ' bytes',
          current: Math.round(recent.avg_diff_size) + ' bytes',
          change: sizeDeviation > 0 ? `↑${(sizeDeviation * 100).toFixed(0)}%` : `↓${(Math.abs(sizeDeviation) * 100).toFixed(0)}%`,
          severity: Math.min(Math.abs(sizeDeviation) / 3, 1)
        });
      }

      // Activity level check
      const recentChangesPerDay = recent.total_changes / (recentHours / 24);
      const activityDeviation = (recentChangesPerDay - baseline.changesPerDay) / Math.max(baseline.changesPerDay, 1);
      if (Math.abs(activityDeviation) > 1) {
        deviations.push({
          metric: 'activity_level',
          baseline: baseline.changesPerDay.toFixed(1) + ' changes/day',
          current: recentChangesPerDay.toFixed(1) + ' changes/day',
          change: activityDeviation > 0 ? `↑${(activityDeviation * 100).toFixed(0)}%` : `↓${(Math.abs(activityDeviation) * 100).toFixed(0)}%`,
          severity: Math.min(Math.abs(activityDeviation) / 2, 1)
        });
      }

      if (deviations.length === 0) {
        return null; // No significant changes
      }

      // Determine overall behavior change type
      const currentMood = this.determineAgentMood(recent);

      return {
        agent,
        baselineMood: baseline.mood,
        currentMood,
        deviations,
        severity: Math.max(...deviations.map(d => d.severity)),
        message: this.generateBehaviorChangeMessage(baseline.mood, currentMood, deviations)
      };
    } catch (e) {
      logger.error('Error detecting behavior change', { error: e, projectName, agent });
      return null;
    }
  }

  determineAgentMood(stats) {
    const deletionRate = stats.deletions / stats.total_changes;
    const avgSize = stats.avg_diff_size;

    // Aggressive: High deletions, large changes
    if (deletionRate > 0.4 || avgSize > 1000) {
      return 'aggressive';
    }

    // Conservative: Low deletions, small changes
    if (deletionRate < 0.15 && avgSize < 300) {
      return 'conservative';
    }

    // Balanced: Mix of operations, moderate size
    return 'balanced';
  }

  determineAgentStyle(stats) {
    const creationRate = stats.creations / stats.total_changes;
    const modificationRate = stats.modifications / stats.total_changes;
    const deletionRate = stats.deletions / stats.total_changes;

    if (creationRate > 0.5) return 'builder'; // Creates new files
    if (deletionRate > 0.4) return 'cleanup'; // Removes old code
    if (modificationRate > 0.7) return 'refactorer'; // Modifies existing

    return 'mixed'; // Balanced mix
  }

  calculateConfidence(db, agent, lookbackTime) {
    try {
      // Confidence based on success rate (inverse of rollback rate)
      const stats = db.db.prepare(`
        SELECT
          COUNT(e.id) as total,
          COUNT(r.id) as rollbacks
        FROM events e
        LEFT JOIN rollbacks r ON e.id = r.event_id
        WHERE e.agent = ?
        AND e.timestamp > ?
      `).get(agent, lookbackTime);

      if (!stats || stats.total === 0) return 50;

      const successRate = 1 - (stats.rollbacks / stats.total);
      return Math.round(successRate * 100);
    } catch (e) {
      return 50; // Default confidence
    }
  }

  generateBehaviorChangeMessage(baselineMood, currentMood, deviations) {
    const messages = [];

    if (baselineMood !== currentMood) {
      messages.push(`Agent mood shifted from ${baselineMood} to ${currentMood}`);
    }

    for (const dev of deviations) {
      messages.push(`${dev.metric.replace('_', ' ')}: ${dev.change} (${dev.baseline} → ${dev.current})`);
    }

    return messages.join('; ');
  }

  /**
   * Get agent comparison data
   * @param {string} projectName
   * @returns {Array} Comparison of all agents in this project
   */
  compareAgents(projectName) {
    const db = this.projectDatabases.get(projectName);
    if (!db) return [];

    try {
      // Get all agents with activity in last 30 days
      const agents = db.db.prepare(`
        SELECT DISTINCT agent
        FROM events
        WHERE agent IS NOT NULL
        AND timestamp > datetime('now', '-30 days')
        LIMIT 100
      `).all();

      const comparisons = [];

      for (const { agent } of agents) {
        const profile = this.getAgentProfile(projectName, agent, 30);
        if (profile) {
          comparisons.push(profile);
        }
      }

      // Sort by activity level
      comparisons.sort((a, b) => b.totalChanges - a.totalChanges);

      return comparisons;
    } catch (e) {
      logger.error('Error comparing agents', { error: e, projectName });
      return [];
    }
  }

  /**
   * Update agent statistics (run daily)
   */
  updateDailyStats(projectName, date = new Date()) {
    const db = this.projectDatabases.get(projectName);
    if (!db) return;

    try {
      const dateStr = date.toISOString().split('T')[0]; // YYYY-MM-DD

      // Get agents active today
      const agents = db.db.prepare(`
        SELECT DISTINCT agent
        FROM events
        WHERE DATE(timestamp) = ?
        AND agent IS NOT NULL
      `).all(dateStr);

      for (const { agent } of agents) {
        // Calculate today's stats
        const stats = db.db.prepare(`
          SELECT
            COUNT(*) as changes_count,
            AVG(LENGTH(diff)) as avg_change_size,
            AVG(agent_confidence) as avg_confidence
          FROM events
          WHERE agent = ?
          AND DATE(timestamp) = ?
        `).get(agent, dateStr);

        // Count rollbacks today
        const rollbacks = db.db.prepare(`
          SELECT COUNT(*) as count
          FROM events e
          JOIN rollbacks r ON e.id = r.event_id
          WHERE e.agent = ?
          AND DATE(r.timestamp) = ?
        `).get(agent, dateStr);

        // Calculate success rate
        const successRate = stats.changes_count > 0
          ? 1 - (rollbacks.count / stats.changes_count)
          : 1.0;

        // Insert or update stats
        db.db.prepare(`
          INSERT INTO agent_stats (project_name, agent, date, changes_count, rollbacks_count, avg_change_size, avg_confidence, success_rate)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(project_name, agent, date)
          DO UPDATE SET
            changes_count = excluded.changes_count,
            rollbacks_count = excluded.rollbacks_count,
            avg_change_size = excluded.avg_change_size,
            avg_confidence = excluded.avg_confidence,
            success_rate = excluded.success_rate
        `).run(
          projectName,
          agent,
          dateStr,
          stats.changes_count,
          rollbacks.count,
          Math.round(stats.avg_change_size || 0),
          Math.round(stats.avg_confidence || 0),
          successRate
        );
      }

      logger.info('Updated agent stats', { projectName, date: dateStr });
    } catch (e) {
      logger.error('Error updating daily stats', { error: e, projectName });
    }
  }

  /**
   * Clear profile cache
   */
  clearCache() {
    this.profiles.clear();
  }
}

// Export factory
export function createBehaviorProfiler(projectDatabases) {
  return new BehaviorProfiler(projectDatabases);
}
