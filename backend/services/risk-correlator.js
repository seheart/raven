/**
 * Risk Correlation Service
 *
 * Learns from rollback history to predict which changes are likely to fail.
 * Uses pattern matching and historical analysis to calculate risk scores.
 */

import { logger } from '../utils/logger.js';

export class RiskCorrelator {
  constructor(projectDb) {
    this.db = projectDb;

    // Risk patterns learned from rollbacks
    this.riskPatterns = {
      files: new Map(), // File-specific risk scores
      paths: new Map(), // Directory risk scores
      agents: new Map(), // Agent-specific risk scores
      changeTypes: new Map() // Change type risk scores
    };

    // Configuration
    this.config = {
      learningPeriodDays: 30, // Learn from last 30 days
      minRollbacksToLearn: 2, // Minimum rollbacks to establish pattern
      highRiskThreshold: 70, // 70+ score = high risk
      mediumRiskThreshold: 40 // 40-69 = medium risk
    };

    // Initialize risk patterns
    this.updateRiskPatterns();
  }

  /**
   * Update risk patterns from rollback history
   */
  async updateRiskPatterns() {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - this.config.learningPeriodDays);
      const cutoffISO = cutoffDate.toISOString();

      // Get all rollbacks with their associated events
      const stmt = this.db.prepareStatement(`
        SELECT
          r.id as rollback_id,
          r.timestamp as rollback_timestamp,
          r.reason,
          r.rollback_type,
          e.filepath,
          e.change_type,
          e.agent,
          e.event_size,
          e.is_anomaly
        FROM rollbacks r
        JOIN events e ON r.event_id = e.id
        WHERE r.timestamp >= ?
        ORDER BY r.timestamp DESC
      `);

      const rollbacks = stmt.all(cutoffISO);

      if (rollbacks.length < this.config.minRollbacksToLearn) {
        logger.info('Not enough rollback history for risk correlation', {
          rollbacks: rollbacks.length,
          required: this.config.minRollbacksToLearn
        });
        return;
      }

      // Clear existing patterns
      this.riskPatterns.files.clear();
      this.riskPatterns.paths.clear();
      this.riskPatterns.agents.clear();
      this.riskPatterns.changeTypes.clear();

      // Learn patterns from rollbacks
      for (const rollback of rollbacks) {
        // File-specific risk
        if (rollback.filepath) {
          const fileCount = this.riskPatterns.files.get(rollback.filepath) || 0;
          this.riskPatterns.files.set(rollback.filepath, fileCount + 1);

          // Directory risk (top-level)
          const topDir = rollback.filepath.split('/')[0];
          const pathCount = this.riskPatterns.paths.get(topDir) || 0;
          this.riskPatterns.paths.set(topDir, pathCount + 1);
        }

        // Agent risk
        if (rollback.agent) {
          const agentCount = this.riskPatterns.agents.get(rollback.agent) || 0;
          this.riskPatterns.agents.set(rollback.agent, agentCount + 1);
        }

        // Change type risk
        if (rollback.change_type) {
          const typeCount = this.riskPatterns.changeTypes.get(rollback.change_type) || 0;
          this.riskPatterns.changeTypes.set(rollback.change_type, typeCount + 1);
        }
      }

      // Normalize to percentages (0-100)
      const totalRollbacks = rollbacks.length;
      this.normalizeRiskScores(totalRollbacks);

      logger.info('Risk patterns updated', {
        totalRollbacks,
        riskyFiles: this.riskPatterns.files.size,
        riskyPaths: this.riskPatterns.paths.size,
        riskyAgents: this.riskPatterns.agents.size
      });
    } catch (error) {
      logger.error('Failed to update risk patterns:', error);
    }
  }

  /**
   * Normalize risk scores to 0-100 scale
   */
  normalizeRiskScores(totalRollbacks) {
    // File risk scores
    for (const [file, count] of this.riskPatterns.files.entries()) {
      const score = Math.min(100, (count / totalRollbacks) * 500); // Amplify for visibility
      this.riskPatterns.files.set(file, Math.round(score));
    }

    // Path risk scores
    for (const [path, count] of this.riskPatterns.paths.entries()) {
      const score = Math.min(100, (count / totalRollbacks) * 300);
      this.riskPatterns.paths.set(path, Math.round(score));
    }

    // Agent risk scores
    for (const [agent, count] of this.riskPatterns.agents.entries()) {
      const score = Math.min(100, (count / totalRollbacks) * 400);
      this.riskPatterns.agents.set(agent, Math.round(score));
    }

    // Change type risk scores
    for (const [type, count] of this.riskPatterns.changeTypes.entries()) {
      const score = Math.min(100, (count / totalRollbacks) * 300);
      this.riskPatterns.changeTypes.set(type, Math.round(score));
    }
  }

  /**
   * Calculate risk score for an event
   * @param {object} event - Event to analyze
   * @returns {object} Risk analysis result
   */
  calculateRisk(event) {
    const risks = [];
    let totalScore = 0;

    // Check 1: File-specific risk
    if (event.filepath) {
      const fileRisk = this.riskPatterns.files.get(event.filepath);
      if (fileRisk) {
        totalScore += fileRisk;
        risks.push({
          type: 'file_history',
          message: `File has rollback history: ${event.filepath}`,
          score: fileRisk
        });
      }

      // Check path risk
      const topDir = event.filepath.split('/')[0];
      const pathRisk = this.riskPatterns.paths.get(topDir);
      if (pathRisk) {
        totalScore += pathRisk * 0.5; // Lower weight than file-specific
        risks.push({
          type: 'path_history',
          message: `Directory has rollback history: ${topDir}`,
          score: Math.round(pathRisk * 0.5)
        });
      }
    }

    // Check 2: Agent risk
    if (event.agent) {
      const agentRisk = this.riskPatterns.agents.get(event.agent);
      if (agentRisk) {
        totalScore += agentRisk * 0.7;
        risks.push({
          type: 'agent_history',
          message: `Agent has rollback history: ${event.agent}`,
          score: Math.round(agentRisk * 0.7)
        });
      }
    }

    // Check 3: Change type risk
    if (event.change_type) {
      const typeRisk = this.riskPatterns.changeTypes.get(event.change_type);
      if (typeRisk) {
        totalScore += typeRisk * 0.3;
        risks.push({
          type: 'change_type_history',
          message: `Change type has rollback history: ${event.change_type}`,
          score: Math.round(typeRisk * 0.3)
        });
      }
    }

    // Check 4: Anomaly amplification (if event is already flagged as anomaly)
    if (event.is_anomaly) {
      totalScore += 30;
      risks.push({
        type: 'anomaly_amplification',
        message: 'Event flagged as anomaly increases risk',
        score: 30
      });
    }

    // Normalize total score
    const normalizedScore = Math.min(100, Math.round(totalScore));

    // Determine risk level
    let riskLevel = 'low';
    if (normalizedScore >= this.config.highRiskThreshold) {
      riskLevel = 'high';
    } else if (normalizedScore >= this.config.mediumRiskThreshold) {
      riskLevel = 'medium';
    }

    const isHighRisk = riskLevel === 'high';

    return {
      isHighRisk,
      score: normalizedScore,
      riskLevel,
      risks,
      confidence: Math.min(95, 40 + risks.length * 15)
    };
  }

  /**
   * Record a rollback event
   * @param {number} eventId - Event ID that was rolled back
   * @param {object} options - Rollback options
   * @returns {number} Rollback ID
   */
  recordRollback(eventId, options = {}) {
    try {
      const stmt = this.db.prepareStatement(`
        INSERT INTO rollbacks (event_id, timestamp, reason, automatic, rollback_type, files_affected)
        VALUES (?, ?, ?, ?, ?, ?)
      `);

      const result = stmt.run(
        eventId,
        new Date().toISOString(),
        options.reason || 'Manual rollback',
        options.automatic ? 1 : 0,
        options.rollbackType || 'manual',
        options.filesAffected || 1
      );

      logger.info('Rollback recorded', {
        eventId,
        rollbackId: result.lastInsertRowid,
        reason: options.reason
      });

      // Update risk patterns after new rollback
      this.updateRiskPatterns();

      return result.lastInsertRowid;
    } catch (error) {
      logger.error('Failed to record rollback:', error);
      return null;
    }
  }

  /**
   * Get rollback statistics
   */
  async getRollbackStats() {
    try {
      const stmt = this.db.prepareStatement(`
        SELECT
          COUNT(*) as total_rollbacks,
          SUM(automatic) as automatic_rollbacks,
          MAX(timestamp) as last_rollback,
          AVG(files_affected) as avg_files_affected
        FROM rollbacks
      `);

      return stmt.get();
    } catch (error) {
      logger.error('Failed to get rollback stats:', error);
      return null;
    }
  }

  /**
   * Get high-risk files (files with most rollbacks)
   */
  getHighRiskFiles(limit = 10) {
    const files = Array.from(this.riskPatterns.files.entries())
      .map(([file, score]) => ({ file, riskScore: score }))
      .sort((a, b) => b.riskScore - a.riskScore)
      .slice(0, limit);

    return files;
  }

  /**
   * Get recent rollbacks
   */
  async getRecentRollbacks(limit = 20) {
    try {
      const stmt = this.db.prepareStatement(`
        SELECT
          r.id,
          r.timestamp,
          r.reason,
          r.rollback_type,
          r.automatic,
          r.files_affected,
          e.filepath,
          e.change_type,
          e.agent
        FROM rollbacks r
        JOIN events e ON r.event_id = e.id
        ORDER BY r.timestamp DESC
        LIMIT ?
      `);

      return stmt.all(limit);
    } catch (error) {
      logger.error('Failed to get recent rollbacks:', error);
      return [];
    }
  }

  /**
   * Schedule periodic pattern updates
   */
  startPeriodicUpdates() {
    // Update risk patterns every hour
    this.updateInterval = setInterval(() => {
      this.updateRiskPatterns();
    }, 3600000);

    logger.info('Risk correlator started with periodic pattern updates');
  }

  /**
   * Stop periodic updates
   */
  stopPeriodicUpdates() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
      logger.info('Risk correlator periodic updates stopped');
    }
  }
}

export default RiskCorrelator;
