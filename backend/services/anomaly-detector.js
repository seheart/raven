/**
 * Anomaly Detection Service
 *
 * Detects unusual patterns in file changes using statistical analysis.
 * Learns baseline behavior and identifies deviations.
 */

import { logger } from '../utils/logger.js';

export class AnomalyDetector {
  constructor(projectDb) {
    this.db = projectDb;

    // Baseline statistics (learned over time)
    this.baseline = {
      avgEventSize: null,
      stdDevEventSize: null,
      avgEventsPerHour: null,
      commonChangeTypes: {},
      commonFilePaths: {},
      lastUpdated: null
    };

    // Configuration
    this.config = {
      learningPeriodDays: 7, // Learn from last 7 days
      anomalyThreshold: 2.5, // Z-score threshold (2.5 std devs = 99% confidence)
      minSamplesForBaseline: 50, // Minimum events needed to establish baseline
      updateBaselineInterval: 3600000 // Update baseline every hour (ms)
    };

    // Initialize baseline on startup
    this.updateBaseline();
  }

  /**
   * Update baseline statistics from historical data
   */
  async updateBaseline() {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - this.config.learningPeriodDays);
      const cutoffISO = cutoffDate.toISOString();

      // Get recent events for baseline calculation
      const stmt = this.db.prepareStatement(`
        SELECT
          event_size,
          change_type,
          filepath,
          timestamp
        FROM events
        WHERE timestamp >= ?
        ORDER BY timestamp DESC
        LIMIT 10000
      `);

      const events = stmt.all(cutoffISO);

      if (events.length < this.config.minSamplesForBaseline) {
        logger.info('Not enough data for baseline', {
          samples: events.length,
          required: this.config.minSamplesForBaseline
        });
        return;
      }

      // Calculate event size statistics
      const sizes = events.map(e => e.event_size || 0).filter(s => s > 0);
      if (sizes.length > 0) {
        this.baseline.avgEventSize = this.mean(sizes);
        this.baseline.stdDevEventSize = this.standardDeviation(sizes);
      }

      // Calculate events per hour
      const hours = Math.max(1, (Date.now() - new Date(cutoffISO).getTime()) / 3600000);
      this.baseline.avgEventsPerHour = events.length / hours;

      // Track common change types
      this.baseline.commonChangeTypes = {};
      for (const event of events) {
        const type = event.change_type || 'unknown';
        this.baseline.commonChangeTypes[type] = (this.baseline.commonChangeTypes[type] || 0) + 1;
      }

      // Track common file paths (top-level directories)
      this.baseline.commonFilePaths = {};
      for (const event of events) {
        if (event.filepath) {
          const topDir = event.filepath.split('/')[0];
          this.baseline.commonFilePaths[topDir] = (this.baseline.commonFilePaths[topDir] || 0) + 1;
        }
      }

      this.baseline.lastUpdated = new Date().toISOString();

      logger.info('Baseline updated', {
        samples: events.length,
        avgEventSize: Math.round(this.baseline.avgEventSize),
        stdDev: Math.round(this.baseline.stdDevEventSize),
        eventsPerHour: Math.round(this.baseline.avgEventsPerHour * 10) / 10
      });
    } catch (error) {
      logger.error('Failed to update baseline:', error);
    }
  }

  /**
   * Analyze an event for anomalies
   * @param {object} event - Event to analyze
   * @returns {object} Anomaly analysis result
   */
  analyzeEvent(event) {
    // If baseline not established, can't detect anomalies
    if (!this.baseline.avgEventSize) {
      return {
        isAnomaly: false,
        score: 0,
        confidence: 0,
        reasons: [],
        riskLevel: 'low'
      };
    }

    const reasons = [];
    let totalScore = 0;

    // Check 1: Event size anomaly
    if (event.event_size && this.baseline.avgEventSize) {
      const zScore = this.zScore(
        event.event_size,
        this.baseline.avgEventSize,
        this.baseline.stdDevEventSize
      );

      if (Math.abs(zScore) > this.config.anomalyThreshold) {
        totalScore += Math.abs(zScore) * 20; // Scale to 0-100
        reasons.push({
          type: 'event_size',
          message: `Unusual event size: ${event.event_size} (${Math.abs(zScore).toFixed(1)}σ from baseline)`,
          zScore: Math.round(zScore * 100) / 100
        });
      }
    }

    // Check 2: Unusual change type
    const changeTypeFreq = this.baseline.commonChangeTypes[event.change_type] || 0;
    const totalChangeTypes = Object.values(this.baseline.commonChangeTypes).reduce(
      (a, b) => a + b,
      0
    );
    const changeTypeRarity = 1 - changeTypeFreq / totalChangeTypes;

    if (changeTypeRarity > 0.95) {
      // Very rare change type (top 5%)
      totalScore += 30;
      reasons.push({
        type: 'rare_change_type',
        message: `Rare change type: ${event.change_type}`,
        rarity: Math.round(changeTypeRarity * 100)
      });
    }

    // Check 3: Unusual file path
    if (event.filepath) {
      const topDir = event.filepath.split('/')[0];
      const pathFreq = this.baseline.commonFilePaths[topDir] || 0;
      const totalPaths = Object.values(this.baseline.commonFilePaths).reduce((a, b) => a + b, 0);
      const pathRarity = 1 - pathFreq / totalPaths;

      if (pathRarity > 0.9) {
        // Very rare directory (top 10%)
        totalScore += 25;
        reasons.push({
          type: 'unusual_path',
          message: `Unusual directory: ${topDir}`,
          rarity: Math.round(pathRarity * 100)
        });
      }
    }

    // Check 4: Suspicious file patterns
    if (event.filepath) {
      const suspiciousPatterns = [
        { pattern: /\.env/, message: 'Environment file change', score: 40 },
        { pattern: /package\.json/, message: 'Dependency file change', score: 20 },
        { pattern: /\.(key|pem|crt|p12)$/, message: 'Certificate/key file change', score: 50 },
        { pattern: /\/migrations?\//, message: 'Database migration change', score: 30 },
        { pattern: /\.(sql|db)$/, message: 'Database file change', score: 35 },
        { pattern: /auth|login|password/i, message: 'Authentication-related change', score: 25 }
      ];

      for (const { pattern, message, score } of suspiciousPatterns) {
        if (pattern.test(event.filepath)) {
          totalScore += score;
          reasons.push({
            type: 'suspicious_pattern',
            message,
            filepath: event.filepath
          });
        }
      }
    }

    // Normalize score to 0-100
    const normalizedScore = Math.min(100, totalScore);

    // Determine risk level
    let riskLevel = 'low';
    if (normalizedScore >= 70) {
      riskLevel = 'high';
    } else if (normalizedScore >= 40) {
      riskLevel = 'medium';
    }

    // Determine if it's an anomaly (score >= 40)
    const isAnomaly = normalizedScore >= 40;

    // Calculate confidence (higher when more reasons detected)
    const confidence = Math.min(95, 50 + reasons.length * 15);

    return {
      isAnomaly,
      score: Math.round(normalizedScore),
      confidence,
      reasons,
      riskLevel
    };
  }

  /**
   * Detect burst activity (many events in short time)
   * @param {string} projectName - Project name
   * @returns {object} Burst detection result
   */
  async detectBurst(projectName) {
    try {
      // Get events from last 5 minutes
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();

      const stmt = this.db.prepareStatement(`
        SELECT COUNT(*) as count
        FROM events
        WHERE timestamp >= ?
      `);

      const result = stmt.get(fiveMinutesAgo);
      const recentCount = result.count || 0;

      // Calculate expected events in 5 minutes
      const expectedEvents = (this.baseline.avgEventsPerHour || 10) * (5 / 60);

      // Detect if burst is 3x normal rate
      const isBurst = recentCount > expectedEvents * 3;

      if (isBurst) {
        logger.warn('Burst activity detected', {
          projectName,
          recentCount,
          expected: Math.round(expectedEvents),
          multiplier: Math.round((recentCount / expectedEvents) * 10) / 10
        });
      }

      return {
        isBurst,
        recentCount,
        expectedCount: Math.round(expectedEvents),
        timeWindow: '5min'
      };
    } catch (error) {
      logger.error('Failed to detect burst:', error);
      return { isBurst: false, error: error.message };
    }
  }

  /**
   * Get anomaly statistics
   * @returns {object} Anomaly stats
   */
  async getAnomalyStats() {
    try {
      const stmt = this.db.prepareStatement(`
        SELECT
          COUNT(*) as total_anomalies,
          AVG(anomaly_score) as avg_score,
          SUM(CASE WHEN risk_level = 'high' THEN 1 ELSE 0 END) as high_risk,
          SUM(CASE WHEN risk_level = 'medium' THEN 1 ELSE 0 END) as medium_risk,
          SUM(CASE WHEN risk_level = 'low' THEN 1 ELSE 0 END) as low_risk
        FROM events
        WHERE is_anomaly = 1
      `);

      const result = stmt.get();

      return {
        totalAnomalies: result.total_anomalies || 0,
        avgScore: Math.round(result.avg_score || 0),
        byRiskLevel: {
          high: result.high_risk || 0,
          medium: result.medium_risk || 0,
          low: result.low_risk || 0
        }
      };
    } catch (error) {
      logger.error('Failed to get anomaly stats:', error);
      return null;
    }
  }

  /**
   * Get recent anomalies
   * @param {number} limit - Max anomalies to return
   * @returns {Array} Recent anomalies
   */
  async getRecentAnomalies(limit = 20) {
    try {
      const stmt = this.db.prepareStatement(`
        SELECT
          id,
          timestamp,
          filepath,
          change_type,
          event_size,
          anomaly_score,
          anomaly_confidence,
          anomaly_reasons,
          risk_level
        FROM events
        WHERE is_anomaly = 1
        ORDER BY timestamp DESC
        LIMIT ?
      `);

      const anomalies = stmt.all(limit);

      return anomalies.map(a => ({
        ...a,
        anomaly_reasons: a.anomaly_reasons ? JSON.parse(a.anomaly_reasons) : []
      }));
    } catch (error) {
      logger.error('Failed to get recent anomalies:', error);
      return [];
    }
  }

  // ==================== Statistical Utilities ====================

  /**
   * Calculate mean of array
   */
  mean(values) {
    if (values.length === 0) return 0;
    return values.reduce((sum, val) => sum + val, 0) / values.length;
  }

  /**
   * Calculate standard deviation
   */
  standardDeviation(values) {
    if (values.length === 0) return 0;
    const avg = this.mean(values);
    const squareDiffs = values.map(val => Math.pow(val - avg, 2));
    const avgSquareDiff = this.mean(squareDiffs);
    return Math.sqrt(avgSquareDiff);
  }

  /**
   * Calculate z-score (how many standard deviations from mean)
   */
  zScore(value, mean, stdDev) {
    if (stdDev === 0) return 0;
    return (value - mean) / stdDev;
  }

  /**
   * Schedule periodic baseline updates
   */
  startPeriodicUpdates() {
    this.updateInterval = setInterval(() => {
      this.updateBaseline();
    }, this.config.updateBaselineInterval);

    logger.info('Anomaly detector started with periodic baseline updates', {
      intervalMinutes: this.config.updateBaselineInterval / 60000
    });
  }

  /**
   * Stop periodic updates
   */
  stopPeriodicUpdates() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
      logger.info('Anomaly detector periodic updates stopped');
    }
  }
}

export default AnomalyDetector;
