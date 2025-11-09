/**
 * Drift Detection Engine
 *
 * Detects when project metrics deviate significantly from established baselines.
 * Monitors:
 * - Velocity drift (sudden changes in commit/change frequency)
 * - Quality drift (rollback rate changes)
 * - Complexity drift (file size, change size patterns)
 * - Stability drift (error rate changes)
 * - Pattern drift (unusual file access patterns)
 */

import { logger } from '../utils/logger.js';

export class DriftDetection {
  constructor(ravenDb) {
    this.db = ravenDb;
    this.projectName = ravenDb.projectName || 'raven';

    // Drift thresholds (percentage change from baseline)
    this.thresholds = {
      critical: 0.50,  // 50% deviation
      high: 0.30,      // 30% deviation
      medium: 0.20,    // 20% deviation
      low: 0.10        // 10% deviation
    };
  }

  /**
   * Run full drift analysis
   */
  async detectAllDrifts() {
    try {
      const drifts = [];

      // Check various drift types
      drifts.push(...await this.detectVelocityDrift());
      drifts.push(...await this.detectQualityDrift());
      drifts.push(...await this.detectComplexityDrift());
      drifts.push(...await this.detectStabilityDrift());
      drifts.push(...await this.detectPatternDrift());

      // Save significant drifts to database
      for (const drift of drifts) {
        if (drift.severity !== 'info') {
          this.recordDrift(drift);
        }
      }

      logger.info('Drift detection completed', {
        service: 'drift-detection',
        project: this.projectName,
        drifts_found: drifts.length
      });

      return drifts;
    } catch (error) {
      logger.error('Failed to detect drifts', {
        service: 'drift-detection',
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Detect velocity drift (changes in commit/change frequency)
   */
  async detectVelocityDrift() {
    const drifts = [];

    // Calculate baseline (last 30 days average)
    const baselineStmt = this.db.prepareStatement(`
      SELECT
        COUNT(*) as total_changes,
        COUNT(*) / 30.0 as changes_per_day
      FROM events
      WHERE project_name = ?
        AND event_type = 'change'
        AND timestamp >= datetime('now', '-30 days')
        AND timestamp < datetime('now', '-7 days')
    `);

    const baseline = baselineStmt.get(this.projectName);

    // Calculate current (last 7 days)
    const currentStmt = this.db.prepareStatement(`
      SELECT
        COUNT(*) as total_changes,
        COUNT(*) / 7.0 as changes_per_day
      FROM events
      WHERE project_name = ?
        AND event_type = 'change'
        AND timestamp >= datetime('now', '-7 days')
    `);

    const current = currentStmt.get(this.projectName);

    if (!baseline || baseline.total_changes < 10) {
      return drifts; // Not enough data
    }

    const baselineVelocity = baseline.changes_per_day;
    const currentVelocity = current.changes_per_day;
    const deviation = (currentVelocity - baselineVelocity) / baselineVelocity;

    if (Math.abs(deviation) > this.thresholds.low) {
      const severity = this.calculateSeverity(Math.abs(deviation));
      const direction = deviation > 0 ? 'increased' : 'decreased';

      drifts.push({
        drift_type: 'velocity',
        severity,
        description: `Development velocity ${direction} by ${Math.round(Math.abs(deviation) * 100)}%`,
        baseline_value: baselineVelocity,
        current_value: currentVelocity,
        deviation_percent: Math.round(deviation * 100),
        affected_files: null,
        metadata: JSON.stringify({
          baseline_period: '30 days',
          current_period: '7 days',
          direction
        })
      });
    }

    return drifts;
  }

  /**
   * Detect quality drift (rollback rate changes)
   */
  async detectQualityDrift() {
    const drifts = [];

    // Baseline rollback rate
    const baselineStmt = this.db.prepareStatement(`
      SELECT
        COUNT(*) as total_events,
        SUM(CASE WHEN event_type = 'rollback' THEN 1 ELSE 0 END) as rollbacks
      FROM events
      WHERE project_name = ?
        AND timestamp >= datetime('now', '-30 days')
        AND timestamp < datetime('now', '-7 days')
    `);

    const baseline = baselineStmt.get(this.projectName);

    // Current rollback rate
    const currentStmt = this.db.prepareStatement(`
      SELECT
        COUNT(*) as total_events,
        SUM(CASE WHEN event_type = 'rollback' THEN 1 ELSE 0 END) as rollbacks
      FROM events
      WHERE project_name = ?
        AND timestamp >= datetime('now', '-7 days')
    `);

    const current = currentStmt.get(this.projectName);

    if (!baseline || baseline.total_events < 10) {
      return drifts;
    }

    const baselineRate = baseline.rollbacks / baseline.total_events;
    const currentRate = current.rollbacks / (current.total_events || 1);
    const deviation = (currentRate - baselineRate) / (baselineRate || 0.01);

    if (Math.abs(deviation) > this.thresholds.medium && currentRate > 0.05) {
      const severity = this.calculateSeverity(Math.abs(deviation));

      drifts.push({
        drift_type: 'quality',
        severity,
        description: `Rollback rate ${deviation > 0 ? 'increased' : 'decreased'} to ${Math.round(currentRate * 100)}%`,
        baseline_value: baselineRate,
        current_value: currentRate,
        deviation_percent: Math.round(deviation * 100),
        affected_files: null,
        metadata: JSON.stringify({
          baseline_rollbacks: baseline.rollbacks,
          current_rollbacks: current.rollbacks,
          direction: deviation > 0 ? 'degraded' : 'improved'
        })
      });
    }

    return drifts;
  }

  /**
   * Detect complexity drift (file size, change size patterns)
   */
  async detectComplexityDrift() {
    const drifts = [];

    // Baseline change size
    const baselineStmt = this.db.prepareStatement(`
      SELECT
        AVG(lines_added + lines_deleted) as avg_change_size,
        MAX(lines_added + lines_deleted) as max_change_size
      FROM events
      WHERE project_name = ?
        AND event_type = 'change'
        AND timestamp >= datetime('now', '-30 days')
        AND timestamp < datetime('now', '-7 days')
    `);

    const baseline = baselineStmt.get(this.projectName);

    // Current change size
    const currentStmt = this.db.prepareStatement(`
      SELECT
        AVG(lines_added + lines_deleted) as avg_change_size,
        MAX(lines_added + lines_deleted) as max_change_size
      FROM events
      WHERE project_name = ?
        AND event_type = 'change'
        AND timestamp >= datetime('now', '-7 days')
    `);

    const current = currentStmt.get(this.projectName);

    if (!baseline || !baseline.avg_change_size) {
      return drifts;
    }

    const deviation = (current.avg_change_size - baseline.avg_change_size) / baseline.avg_change_size;

    if (Math.abs(deviation) > this.thresholds.medium) {
      const severity = this.calculateSeverity(Math.abs(deviation));

      drifts.push({
        drift_type: 'complexity',
        severity,
        description: `Average change size ${deviation > 0 ? 'increased' : 'decreased'} by ${Math.round(Math.abs(deviation) * 100)}%`,
        baseline_value: baseline.avg_change_size,
        current_value: current.avg_change_size,
        deviation_percent: Math.round(deviation * 100),
        affected_files: null,
        metadata: JSON.stringify({
          baseline_max: baseline.max_change_size,
          current_max: current.max_change_size,
          interpretation: deviation > 0 ? 'larger_changes' : 'smaller_changes'
        })
      });
    }

    return drifts;
  }

  /**
   * Detect stability drift (error rate changes)
   */
  async detectStabilityDrift() {
    const drifts = [];

    // Baseline error rate
    const baselineStmt = this.db.prepareStatement(`
      SELECT
        COUNT(*) as total_events,
        SUM(CASE WHEN event_type = 'error' THEN 1 ELSE 0 END) as errors
      FROM events
      WHERE project_name = ?
        AND timestamp >= datetime('now', '-30 days')
        AND timestamp < datetime('now', '-7 days')
    `);

    const baseline = baselineStmt.get(this.projectName);

    // Current error rate
    const currentStmt = this.db.prepareStatement(`
      SELECT
        COUNT(*) as total_events,
        SUM(CASE WHEN event_type = 'error' THEN 1 ELSE 0 END) as errors
      FROM events
      WHERE project_name = ?
        AND timestamp >= datetime('now', '-7 days')
    `);

    const current = currentStmt.get(this.projectName);

    if (!baseline || baseline.total_events < 10) {
      return drifts;
    }

    const baselineRate = baseline.errors / baseline.total_events;
    const currentRate = current.errors / (current.total_events || 1);
    const deviation = (currentRate - baselineRate) / (baselineRate || 0.01);

    if (Math.abs(deviation) > this.thresholds.medium && currentRate > 0.05) {
      const severity = this.calculateSeverity(Math.abs(deviation));

      drifts.push({
        drift_type: 'stability',
        severity: deviation > 0 ? 'high' : severity, // Always high if errors increased
        description: `Error rate ${deviation > 0 ? 'increased' : 'decreased'} to ${Math.round(currentRate * 100)}%`,
        baseline_value: baselineRate,
        current_value: currentRate,
        deviation_percent: Math.round(deviation * 100),
        affected_files: null,
        metadata: JSON.stringify({
          baseline_errors: baseline.errors,
          current_errors: current.errors,
          direction: deviation > 0 ? 'degraded' : 'improved'
        })
      });
    }

    return drifts;
  }

  /**
   * Detect pattern drift (unusual file access patterns)
   */
  async detectPatternDrift() {
    const drifts = [];

    // Get most active files in current period
    const currentActiveStmt = this.db.prepareStatement(`
      SELECT
        filepath,
        COUNT(*) as change_count
      FROM events
      WHERE project_name = ?
        AND event_type = 'change'
        AND timestamp >= datetime('now', '-7 days')
      GROUP BY filepath
      ORDER BY change_count DESC
      LIMIT 10
    `);

    const currentActive = currentActiveStmt.all(this.projectName);

    // Check if these files were previously dormant
    for (const file of currentActive) {
      if (file.change_count < 5) continue; // Skip low activity

      const historicalStmt = this.db.prepareStatement(`
        SELECT COUNT(*) as historical_count
        FROM events
        WHERE project_name = ?
          AND filepath = ?
          AND event_type = 'change'
          AND timestamp >= datetime('now', '-30 days')
          AND timestamp < datetime('now', '-7 days')
      `);

      const historical = historicalStmt.get(this.projectName, file.filepath);

      if (historical.historical_count === 0 && file.change_count >= 5) {
        drifts.push({
          drift_type: 'pattern',
          severity: 'medium',
          description: `New focus on previously dormant file: ${file.filepath.split('/').pop()}`,
          baseline_value: 0,
          current_value: file.change_count,
          deviation_percent: 100,
          affected_files: JSON.stringify([file.filepath]),
          metadata: JSON.stringify({
            file: file.filepath,
            recent_changes: file.change_count,
            pattern: 'dormant_to_active'
          })
        });
      }
    }

    return drifts;
  }

  /**
   * Calculate severity based on deviation magnitude
   */
  calculateSeverity(absDeviation) {
    if (absDeviation >= this.thresholds.critical) return 'critical';
    if (absDeviation >= this.thresholds.high) return 'high';
    if (absDeviation >= this.thresholds.medium) return 'medium';
    if (absDeviation >= this.thresholds.low) return 'low';
    return 'info';
  }

  /**
   * Record drift event to database
   */
  recordDrift(drift) {
    try {
      const stmt = this.db.prepareStatement(`
        INSERT INTO drift_events (
          project_name, drift_type, severity, description,
          baseline_value, current_value, deviation_percent,
          affected_files, metadata
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        this.projectName,
        drift.drift_type,
        drift.severity,
        drift.description,
        drift.baseline_value,
        drift.current_value,
        drift.deviation_percent,
        drift.affected_files,
        drift.metadata
      );

      logger.debug('Drift recorded', {
        service: 'drift-detection',
        drift_type: drift.drift_type,
        severity: drift.severity
      });
    } catch (error) {
      logger.error('Failed to record drift', {
        service: 'drift-detection',
        error: error.message
      });
    }
  }

  /**
   * Get recent drift events
   */
  getRecentDrifts(hours = 24, severity = null) {
    try {
      let query = `
        SELECT * FROM drift_events
        WHERE project_name = ?
          AND detected_at >= datetime('now', '-' || ? || ' hours')
          AND resolved_at IS NULL
      `;

      const params = [this.projectName, hours];

      if (severity) {
        query += ' AND severity = ?';
        params.push(severity);
      }

      query += ' ORDER BY detected_at DESC';

      const stmt = this.db.prepareStatement(query);
      const drifts = stmt.all(...params);

      return drifts.map(d => ({
        ...d,
        metadata: d.metadata ? JSON.parse(d.metadata) : null,
        affected_files: d.affected_files ? JSON.parse(d.affected_files) : null
      }));
    } catch (error) {
      logger.error('Failed to get recent drifts', {
        service: 'drift-detection',
        error: error.message
      });
      return [];
    }
  }

  /**
   * Mark drift as resolved
   */
  resolveDrift(driftId) {
    try {
      const stmt = this.db.prepareStatement(`
        UPDATE drift_events
        SET resolved_at = CURRENT_TIMESTAMP
        WHERE id = ? AND project_name = ?
      `);

      stmt.run(driftId, this.projectName);

      logger.info('Drift resolved', {
        service: 'drift-detection',
        drift_id: driftId
      });

      return true;
    } catch (error) {
      logger.error('Failed to resolve drift', {
        service: 'drift-detection',
        error: error.message
      });
      return false;
    }
  }

  /**
   * Get drift summary
   */
  getDriftSummary(days = 7) {
    try {
      const stmt = this.db.prepareStatement(`
        SELECT
          drift_type,
          severity,
          COUNT(*) as count,
          MAX(detected_at) as last_detected
        FROM drift_events
        WHERE project_name = ?
          AND detected_at >= datetime('now', '-' || ? || ' days')
          AND resolved_at IS NULL
        GROUP BY drift_type, severity
        ORDER BY severity DESC, count DESC
      `);

      const summary = stmt.all(this.projectName, days);

      const totalStmt = this.db.prepareStatement(`
        SELECT COUNT(*) as total
        FROM drift_events
        WHERE project_name = ?
          AND detected_at >= datetime('now', '-' || ? || ' days')
          AND resolved_at IS NULL
      `);

      const { total } = totalStmt.get(this.projectName, days);

      return {
        total_active_drifts: total,
        by_type_and_severity: summary,
        period_days: days
      };
    } catch (error) {
      logger.error('Failed to get drift summary', {
        service: 'drift-detection',
        error: error.message
      });
      return { total_active_drifts: 0, by_type_and_severity: [], period_days: days };
    }
  }
}
