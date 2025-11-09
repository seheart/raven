/**
 * Growth Tracking & Charts Backend
 *
 * Tracks project growth and provides data for visualizations:
 * - Activity growth over time
 * - Code quality trends
 * - Agent productivity evolution
 * - Health score progression
 * - Comparative period analysis
 * - Chart-ready data formats
 */

import { logger } from '../utils/logger.js';

export class GrowthTracker {
  constructor(ravenDb) {
    this.db = ravenDb;
    this.projectName = ravenDb.projectName || 'raven';
  }

  /**
   * Create comprehensive growth snapshot
   */
  async createSnapshot() {
    try {
      const snapshot = {
        activity_metrics: await this.captureActivityMetrics(),
        quality_metrics: await this.captureQualityMetrics(),
        agent_metrics: await this.captureAgentMetrics(),
        health_metrics: await this.captureHealthMetrics(),
        velocity_metrics: await this.captureVelocityMetrics(),
        timestamp: new Date().toISOString()
      };

      // Save to database
      this.saveSnapshot(snapshot);

      logger.info('Growth snapshot created', {
        service: 'growth-tracker',
        project: this.projectName
      });

      return snapshot;
    } catch (error) {
      logger.error('Failed to create growth snapshot', {
        service: 'growth-tracker',
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Capture activity metrics
   */
  async captureActivityMetrics() {
    const stmt = this.db.prepareStatement(`
      SELECT
        COUNT(*) as total_events,
        COUNT(DISTINCT session_id) as total_sessions,
        COUNT(DISTINCT filepath) as unique_files,
        COUNT(DISTINCT agent) as active_agents,
        SUM(lines_added) as total_lines_added,
        SUM(lines_deleted) as total_lines_deleted
      FROM events
      WHERE project_name = ?
        AND timestamp >= datetime('now', '-1 day')
    `);

    const metrics = stmt.get(this.projectName);

    return {
      total_events: metrics.total_events || 0,
      total_sessions: metrics.total_sessions || 0,
      unique_files_touched: metrics.unique_files || 0,
      active_agents: metrics.active_agents || 0,
      total_lines_added: metrics.total_lines_added || 0,
      total_lines_deleted: metrics.total_lines_deleted || 0,
      net_lines_changed: (metrics.total_lines_added || 0) - (metrics.total_lines_deleted || 0)
    };
  }

  /**
   * Capture quality metrics
   */
  async captureQualityMetrics() {
    const stmt = this.db.prepareStatement(`
      SELECT
        COUNT(*) as total_changes,
        SUM(CASE WHEN event_type = 'rollback' THEN 1 ELSE 0 END) as rollbacks,
        SUM(CASE WHEN event_type = 'error' THEN 1 ELSE 0 END) as errors,
        AVG(lines_added + lines_deleted) as avg_change_size
      FROM events
      WHERE project_name = ?
        AND timestamp >= datetime('now', '-1 day')
    `);

    const metrics = stmt.get(this.projectName);

    const rollbackRate = metrics.total_changes > 0 ? metrics.rollbacks / metrics.total_changes : 0;

    const errorRate = metrics.total_changes > 0 ? metrics.errors / metrics.total_changes : 0;

    const qualityScore = Math.round((1 - rollbackRate) * 50 + (1 - errorRate) * 50);

    return {
      total_changes: metrics.total_changes || 0,
      rollbacks: metrics.rollbacks || 0,
      errors: metrics.errors || 0,
      rollback_rate: rollbackRate,
      error_rate: errorRate,
      avg_change_size: metrics.avg_change_size || 0,
      quality_score: qualityScore
    };
  }

  /**
   * Capture agent metrics
   */
  async captureAgentMetrics() {
    const stmt = this.db.prepareStatement(`
      SELECT
        agent,
        COUNT(*) as changes,
        SUM(lines_added + lines_deleted) as total_lines,
        SUM(CASE WHEN event_type = 'rollback' THEN 1 ELSE 0 END) as rollbacks
      FROM events
      WHERE project_name = ?
        AND timestamp >= datetime('now', '-1 day')
      GROUP BY agent
    `);

    const agents = stmt.all(this.projectName);

    const agentMetrics = agents.map(a => ({
      agent: a.agent,
      changes: a.changes,
      total_lines: a.total_lines,
      rollbacks: a.rollbacks,
      efficiency_score: Math.round((1 - a.rollbacks / a.changes) * 100)
    }));

    return {
      total_agents: agents.length,
      agents: agentMetrics,
      most_active_agent:
        agentMetrics.length > 0
          ? agentMetrics.reduce((max, a) => (a.changes > max.changes ? a : max)).agent
          : null
    };
  }

  /**
   * Capture health metrics
   */
  async captureHealthMetrics() {
    const stmt = this.db.prepareStatement(`
      SELECT
        overall_score,
        code_quality_score,
        test_coverage_score,
        documentation_score,
        velocity_score,
        stability_score,
        security_score
      FROM health_scores
      WHERE project_name = ?
      ORDER BY score_date DESC
      LIMIT 1
    `);

    const health = stmt.get(this.projectName);

    return (
      health || {
        overall_score: null,
        code_quality_score: null,
        test_coverage_score: null,
        documentation_score: null,
        velocity_score: null,
        stability_score: null,
        security_score: null
      }
    );
  }

  /**
   * Capture velocity metrics
   */
  async captureVelocityMetrics() {
    const stmt = this.db.prepareStatement(`
      SELECT
        COUNT(*) as changes_last_24h,
        COUNT(DISTINCT session_id) as sessions_last_24h
      FROM events
      WHERE project_name = ?
        AND event_type = 'change'
        AND timestamp >= datetime('now', '-1 day')
    `);

    const metrics = stmt.get(this.projectName);

    return {
      changes_per_day: metrics.changes_last_24h || 0,
      sessions_per_day: metrics.sessions_last_24h || 0,
      changes_per_session:
        metrics.sessions_last_24h > 0 ? metrics.changes_last_24h / metrics.sessions_last_24h : 0
    };
  }

  /**
   * Save snapshot to database
   */
  saveSnapshot(snapshot) {
    try {
      const today = new Date().toISOString().split('T')[0];

      const stmt = this.db.prepareStatement(`
        INSERT INTO growth_snapshots (
          project_name, snapshot_date,
          total_events, total_sessions, unique_files,
          active_agents, total_lines_added, total_lines_deleted,
          rollback_rate, error_rate, quality_score,
          health_score, velocity_score, metrics
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(project_name, snapshot_date)
        DO UPDATE SET
          total_events = excluded.total_events,
          total_sessions = excluded.total_sessions,
          unique_files = excluded.unique_files,
          active_agents = excluded.active_agents,
          total_lines_added = excluded.total_lines_added,
          total_lines_deleted = excluded.total_lines_deleted,
          rollback_rate = excluded.rollback_rate,
          error_rate = excluded.error_rate,
          quality_score = excluded.quality_score,
          health_score = excluded.health_score,
          velocity_score = excluded.velocity_score,
          metrics = excluded.metrics
      `);

      stmt.run(
        this.projectName,
        today,
        snapshot.activity_metrics.total_events,
        snapshot.activity_metrics.total_sessions,
        snapshot.activity_metrics.unique_files_touched,
        snapshot.activity_metrics.active_agents,
        snapshot.activity_metrics.total_lines_added,
        snapshot.activity_metrics.total_lines_deleted,
        snapshot.quality_metrics.rollback_rate,
        snapshot.quality_metrics.error_rate,
        snapshot.quality_metrics.quality_score,
        snapshot.health_metrics.overall_score,
        snapshot.velocity_metrics.changes_per_day,
        JSON.stringify(snapshot)
      );

      logger.debug('Growth snapshot saved', {
        service: 'growth-tracker',
        date: today
      });
    } catch (error) {
      logger.error('Failed to save growth snapshot', {
        service: 'growth-tracker',
        error: error.message
      });
    }
  }

  /**
   * Get growth data for charts (time series)
   */
  getGrowthTimeSeries(days = 30, metric = 'all') {
    try {
      const stmt = this.db.prepareStatement(`
        SELECT * FROM growth_snapshots
        WHERE project_name = ?
          AND snapshot_date >= date('now', '-' || ? || ' days')
        ORDER BY snapshot_date ASC
      `);

      const snapshots = stmt.all(this.projectName, days);

      // Format for chart libraries (e.g., Chart.js)
      const timeSeries = {
        labels: snapshots.map(s => s.snapshot_date),
        datasets: this.formatChartDatasets(snapshots, metric)
      };

      return timeSeries;
    } catch (error) {
      logger.error('Failed to get growth time series', {
        service: 'growth-tracker',
        error: error.message
      });
      return { labels: [], datasets: [] };
    }
  }

  /**
   * Format data for chart datasets
   */
  formatChartDatasets(snapshots, metric) {
    const datasets = [];

    if (metric === 'all' || metric === 'activity') {
      datasets.push({
        label: 'Daily Events',
        data: snapshots.map(s => s.total_events),
        borderColor: 'rgb(75, 192, 192)',
        backgroundColor: 'rgba(75, 192, 192, 0.2)',
        yAxisID: 'y'
      });

      datasets.push({
        label: 'Active Agents',
        data: snapshots.map(s => s.active_agents),
        borderColor: 'rgb(153, 102, 255)',
        backgroundColor: 'rgba(153, 102, 255, 0.2)',
        yAxisID: 'y'
      });
    }

    if (metric === 'all' || metric === 'quality') {
      datasets.push({
        label: 'Quality Score',
        data: snapshots.map(s => s.quality_score),
        borderColor: 'rgb(255, 159, 64)',
        backgroundColor: 'rgba(255, 159, 64, 0.2)',
        yAxisID: 'y1'
      });

      datasets.push({
        label: 'Rollback Rate (%)',
        data: snapshots.map(s => (s.rollback_rate * 100).toFixed(2)),
        borderColor: 'rgb(255, 99, 132)',
        backgroundColor: 'rgba(255, 99, 132, 0.2)',
        yAxisID: 'y1'
      });
    }

    if (metric === 'all' || metric === 'health') {
      datasets.push({
        label: 'Health Score',
        data: snapshots.map(s => s.health_score || 0),
        borderColor: 'rgb(54, 162, 235)',
        backgroundColor: 'rgba(54, 162, 235, 0.2)',
        yAxisID: 'y1'
      });
    }

    if (metric === 'all' || metric === 'velocity') {
      datasets.push({
        label: 'Changes/Day',
        data: snapshots.map(s => s.velocity_score),
        borderColor: 'rgb(255, 206, 86)',
        backgroundColor: 'rgba(255, 206, 86, 0.2)',
        yAxisID: 'y'
      });
    }

    return datasets;
  }

  /**
   * Get growth comparison between periods
   */
  getGrowthComparison(period1Days = 7, period2Days = 14) {
    try {
      const period1Stmt = this.db.prepareStatement(`
        SELECT
          AVG(total_events) as avg_events,
          AVG(quality_score) as avg_quality,
          AVG(health_score) as avg_health,
          AVG(velocity_score) as avg_velocity
        FROM growth_snapshots
        WHERE project_name = ?
          AND snapshot_date >= date('now', '-' || ? || ' days')
      `);

      const period1 = period1Stmt.get(this.projectName, period1Days);

      const period2Stmt = this.db.prepareStatement(`
        SELECT
          AVG(total_events) as avg_events,
          AVG(quality_score) as avg_quality,
          AVG(health_score) as avg_health,
          AVG(velocity_score) as avg_velocity
        FROM growth_snapshots
        WHERE project_name = ?
          AND snapshot_date >= date('now', '-' || ? || ' days')
          AND snapshot_date < date('now', '-' || ? || ' days')
      `);

      const period2 = period2Stmt.get(this.projectName, period2Days, period1Days);

      const comparison = {
        period1: {
          days: period1Days,
          metrics: period1
        },
        period2: {
          days: period2Days - period1Days,
          metrics: period2
        },
        changes: {
          events: this.calculateChange(period2.avg_events, period1.avg_events),
          quality: this.calculateChange(period2.avg_quality, period1.avg_quality),
          health: this.calculateChange(period2.avg_health, period1.avg_health),
          velocity: this.calculateChange(period2.avg_velocity, period1.avg_velocity)
        }
      };

      return comparison;
    } catch (error) {
      logger.error('Failed to get growth comparison', {
        service: 'growth-tracker',
        error: error.message
      });
      return null;
    }
  }

  /**
   * Calculate percentage change
   */
  calculateChange(oldValue, newValue) {
    if (!oldValue || oldValue === 0) return { percent: 0, direction: 'stable' };
    if (newValue === null || newValue === undefined) return { percent: 0, direction: 'stable' };

    const percentChange = ((newValue - oldValue) / oldValue) * 100;
    const direction = percentChange > 5 ? 'up' : percentChange < -5 ? 'down' : 'stable';

    return {
      percent: Math.round(percentChange),
      direction,
      old_value: oldValue,
      new_value: newValue
    };
  }

  /**
   * Get growth milestones
   */
  getMilestones(days = 90) {
    try {
      const stmt = this.db.prepareStatement(`
        SELECT * FROM growth_snapshots
        WHERE project_name = ?
          AND snapshot_date >= date('now', '-' || ? || ' days')
        ORDER BY snapshot_date ASC
      `);

      const snapshots = stmt.all(this.projectName, days);

      if (snapshots.length === 0) return [];

      const milestones = [];

      // Find peak activity
      const peakActivity = snapshots.reduce((max, s) =>
        s.total_events > max.total_events ? s : max
      );

      if (peakActivity.total_events > 50) {
        milestones.push({
          type: 'peak_activity',
          date: peakActivity.snapshot_date,
          value: peakActivity.total_events,
          message: `Peak activity day: ${peakActivity.total_events} events`
        });
      }

      // Find best quality day
      const bestQuality = snapshots.reduce((max, s) =>
        s.quality_score > max.quality_score ? s : max
      );

      if (bestQuality.quality_score > 80) {
        milestones.push({
          type: 'best_quality',
          date: bestQuality.snapshot_date,
          value: bestQuality.quality_score,
          message: `Highest quality score: ${bestQuality.quality_score}`
        });
      }

      // Find health improvements
      for (let i = 1; i < snapshots.length; i++) {
        const prev = snapshots[i - 1];
        const curr = snapshots[i];

        if (curr.health_score && prev.health_score && curr.health_score > prev.health_score + 10) {
          milestones.push({
            type: 'health_improvement',
            date: curr.snapshot_date,
            value: curr.health_score,
            message: `Significant health improvement: ${prev.health_score} → ${curr.health_score}`
          });
        }
      }

      return milestones;
    } catch (error) {
      logger.error('Failed to get milestones', {
        service: 'growth-tracker',
        error: error.message
      });
      return [];
    }
  }

  /**
   * Get growth summary
   */
  getGrowthSummary(days = 30) {
    try {
      const timeSeriesData = this.getGrowthTimeSeries(days, 'all');
      const comparison = this.getGrowthComparison(7, 14);
      const milestones = this.getMilestones(days);

      const stmt = this.db.prepareStatement(`
        SELECT
          COUNT(*) as total_snapshots,
          AVG(total_events) as avg_daily_events,
          AVG(quality_score) as avg_quality_score,
          AVG(health_score) as avg_health_score,
          MAX(total_events) as peak_events,
          MIN(rollback_rate) as best_rollback_rate
        FROM growth_snapshots
        WHERE project_name = ?
          AND snapshot_date >= date('now', '-' || ? || ' days')
      `);

      const stats = stmt.get(this.projectName, days);

      return {
        period_days: days,
        statistics: stats,
        time_series: timeSeriesData,
        comparison,
        milestones,
        trends: this.identifyTrends(timeSeriesData)
      };
    } catch (error) {
      logger.error('Failed to get growth summary', {
        service: 'growth-tracker',
        error: error.message
      });
      return null;
    }
  }

  /**
   * Identify trends from time series data
   */
  identifyTrends(timeSeriesData) {
    const trends = [];

    if (!timeSeriesData.datasets || timeSeriesData.datasets.length === 0) {
      return trends;
    }

    // Analyze each dataset for trends
    timeSeriesData.datasets.forEach(dataset => {
      const values = dataset.data.filter(v => v !== null && v !== undefined);

      if (values.length < 7) return;

      // Simple linear regression
      const recent = values.slice(-7);
      const previous = values.slice(-14, -7);

      const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
      const previousAvg = previous.reduce((a, b) => a + b, 0) / (previous.length || 1);

      const change = ((recentAvg - previousAvg) / previousAvg) * 100;

      if (Math.abs(change) > 10) {
        trends.push({
          metric: dataset.label,
          direction: change > 0 ? 'increasing' : 'decreasing',
          change_percent: Math.round(change),
          confidence: Math.abs(change) > 20 ? 'high' : 'medium'
        });
      }
    });

    return trends;
  }

  /**
   * Get snapshot history
   */
  getSnapshotHistory(days = 30) {
    try {
      const stmt = this.db.prepareStatement(`
        SELECT * FROM growth_snapshots
        WHERE project_name = ?
          AND snapshot_date >= date('now', '-' || ? || ' days')
        ORDER BY snapshot_date DESC
      `);

      const snapshots = stmt.all(this.projectName, days);

      return snapshots.map(s => ({
        ...s,
        metrics: s.metrics ? JSON.parse(s.metrics) : null
      }));
    } catch (error) {
      logger.error('Failed to get snapshot history', {
        service: 'growth-tracker',
        error: error.message
      });
      return [];
    }
  }
}
