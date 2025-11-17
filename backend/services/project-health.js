/**
 * Project Health Service
 * Calculates overall health scores and provides recommendations
 * Monitors error rates, syntax issues, performance, and activity patterns
 */

import { logger } from '../utils/logger.js';

export class ProjectHealthService {
  constructor(db, io) {
    this.db = db;
    this.io = io;
    this.initializeSchema();
  }

  /**
   * Initialize database tables for health tracking
   */
  initializeSchema() {
    // Health snapshots table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS health_snapshots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_name TEXT NOT NULL,
        overall_score INTEGER NOT NULL,
        error_score INTEGER NOT NULL,
        activity_score INTEGER NOT NULL,
        stability_score INTEGER NOT NULL,
        performance_score INTEGER NOT NULL,
        recommendations TEXT,
        metrics TEXT NOT NULL,
        timestamp TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Health issues table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS health_issues (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_name TEXT NOT NULL,
        issue_type TEXT NOT NULL,
        severity TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        auto_resolved INTEGER DEFAULT 0,
        resolved_at TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Indexes
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_health_snapshots_project ON health_snapshots(project_name);
      CREATE INDEX IF NOT EXISTS idx_health_snapshots_timestamp ON health_snapshots(timestamp DESC);
      CREATE INDEX IF NOT EXISTS idx_health_issues_project ON health_issues(project_name);
      CREATE INDEX IF NOT EXISTS idx_health_issues_resolved ON health_issues(auto_resolved);
    `);

    logger.info('Project Health schema initialized');
  }

  /**
   * Calculate comprehensive health score for a project
   */
  calculateHealthScore(projectName) {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(); // Last 24 hours

    // 1. Error Score (0-100) - Lower errors = higher score
    const errorScore = this.calculateErrorScore(projectName, cutoff);

    // 2. Activity Score (0-100) - Healthy activity patterns
    const activityScore = this.calculateActivityScore(projectName, cutoff);

    // 3. Stability Score (0-100) - Low anomalies, consistent patterns
    const stabilityScore = this.calculateStabilityScore(projectName, cutoff);

    // 4. Performance Score (0-100) - Response times, efficiency
    const performanceScore = this.calculatePerformanceScore(projectName, cutoff);

    // Overall score is weighted average
    const overallScore = Math.round(
      errorScore * 0.35 + activityScore * 0.25 + stabilityScore * 0.25 + performanceScore * 0.15
    );

    // Generate recommendations
    const recommendations = this.generateRecommendations({
      errorScore,
      activityScore,
      stabilityScore,
      performanceScore,
      projectName
    });

    // Get detailed metrics
    const metrics = this.getDetailedMetrics(projectName, cutoff);

    // Save snapshot
    this.saveHealthSnapshot({
      projectName: projectName || 'all',
      overallScore,
      errorScore,
      activityScore,
      stabilityScore,
      performanceScore,
      recommendations,
      metrics
    });

    return {
      project: projectName || 'all',
      timestamp: new Date().toISOString(),
      overall_score: overallScore,
      status: this.getHealthStatus(overallScore),
      scores: {
        error_score: errorScore,
        activity_score: activityScore,
        stability_score: stabilityScore,
        performance_score: performanceScore
      },
      recommendations,
      metrics
    };
  }

  /**
   * Calculate error score (0-100)
   */
  calculateErrorScore(projectName, cutoff) {
    // Get syntax errors (using 'timestamp' column, not 'detected_at')
    let syntaxQuery = 'SELECT COUNT(*) as count FROM syntax_errors WHERE timestamp > ?';
    let syntaxParams = [cutoff];

    if (projectName) {
      syntaxQuery += ' AND project_name = ?';
      syntaxParams.push(projectName);
    }

    const syntaxErrors = this.db.prepare(syntaxQuery).get(...syntaxParams);

    // Get test failures from test_results
    let testQuery = 'SELECT SUM(failed_tests) as count FROM test_results WHERE timestamp > ?';
    let testParams = [cutoff];

    if (projectName) {
      testQuery += ' AND project_name = ?';
      testParams.push(projectName);
    }

    const testFailures = this.db.prepare(testQuery).get(...testParams);

    const totalErrors = (syntaxErrors?.count || 0) + (testFailures?.count || 0);

    // Score calculation: 0 errors = 100, 50+ errors = 0
    if (totalErrors === 0) return 100;
    if (totalErrors >= 50) return 0;

    return Math.round(100 - (totalErrors / 50) * 100);
  }

  /**
   * Calculate activity score (0-100)
   */
  calculateActivityScore(projectName, cutoff) {
    let query = 'SELECT COUNT(*) as count FROM events WHERE timestamp > ?';
    let params = [cutoff];

    if (projectName) {
      query += ' AND project_name = ?';
      params.push(projectName);
    }

    const events = this.db.prepare(query).get(...params);
    const eventCount = events?.count || 0;

    // Healthy activity: 10-500 events per day
    // Too few = inactive, too many = chaotic
    if (eventCount < 10) {
      return Math.round((eventCount / 10) * 50); // 0-50 score
    } else if (eventCount <= 500) {
      return 100; // Optimal range
    } else {
      // Diminishing score for excessive activity
      const excess = eventCount - 500;
      return Math.max(50, 100 - Math.min(50, excess / 10));
    }
  }

  /**
   * Calculate stability score (0-100)
   */
  calculateStabilityScore(projectName, cutoff) {
    // Count test failures as a stability indicator
    let testQuery = `
      SELECT COUNT(*) as count
      FROM test_results
      WHERE timestamp > ?
        AND passed = 0
    `;
    let params = [cutoff];

    if (projectName) {
      testQuery += ' AND project_name = ?';
      params.push(projectName);
    }

    const testFailures = this.db.prepare(testQuery).get(...params);
    const failureCount = testFailures?.count || 0;

    // Count unresolved syntax errors as stability issues
    let syntaxQuery = `
      SELECT COUNT(*) as count
      FROM syntax_errors
      WHERE timestamp > ?
        AND resolved = 0
    `;
    let syntaxParams = [cutoff];

    if (projectName) {
      syntaxQuery += ' AND project_name = ?';
      syntaxParams.push(projectName);
    }

    const syntaxErrors = this.db.prepare(syntaxQuery).get(...syntaxParams);
    const syntaxCount = syntaxErrors?.count || 0;

    // Score: fewer issues = more stable
    const totalIssues = failureCount * 2 + syntaxCount; // Test failures weighted higher

    if (totalIssues === 0) return 100;
    if (totalIssues >= 20) return 0;

    return Math.round(100 - (totalIssues / 20) * 100);
  }

  /**
   * Calculate performance score (0-100)
   */
  calculatePerformanceScore(projectName, cutoff) {
    // Check system resource usage as performance indicator
    let query = `
      SELECT AVG(cpu_percent) as avg_cpu, AVG(memory_percent) as avg_mem
      FROM raven_metrics
      WHERE timestamp > ?
    `;
    let params = [cutoff];

    // Note: raven_metrics doesn't have project_name, it's system-wide
    // So we ignore projectName for performance metrics

    const metrics = this.db.prepare(query).get(...params);
    const avgCpu = metrics?.avg_cpu || 10; // Default low usage
    const avgMem = metrics?.avg_mem || 20; // Default low usage

    // Score based on resource efficiency
    // Lower resource usage = better performance
    // CPU: < 30% = excellent, > 80% = poor
    // Memory: < 50% = excellent, > 90% = poor
    const cpuScore =
      avgCpu < 30 ? 100 : avgCpu > 80 ? 20 : Math.round(100 - ((avgCpu - 30) / 50) * 80);
    const memScore =
      avgMem < 50 ? 100 : avgMem > 90 ? 20 : Math.round(100 - ((avgMem - 50) / 40) * 80);

    // Weighted average: CPU 60%, Memory 40%
    return Math.round(cpuScore * 0.6 + memScore * 0.4);
  }

  /**
   * Get detailed metrics for health report
   */
  getDetailedMetrics(projectName, cutoff) {
    const metrics = {};

    // Error breakdown (from syntax_errors)
    let errorQuery = `
      SELECT severity, COUNT(*) as count
      FROM syntax_errors
      WHERE timestamp > ?
    `;
    let params = [cutoff];

    if (projectName) {
      errorQuery += ' AND project_name = ?';
      params.push(projectName);
    }

    errorQuery += ' GROUP BY severity';

    const errorBreakdown = this.db.prepare(errorQuery).all(...params);
    metrics.errors_by_severity = errorBreakdown;

    // File activity (table is 'events', not 'file_events')
    let fileQuery = `
      SELECT change_type, COUNT(*) as count
      FROM events
      WHERE timestamp > ?
    `;
    let fileParams = [cutoff];

    if (projectName) {
      fileQuery += ' AND project_name = ?';
      fileParams.push(projectName);
    }

    fileQuery += ' GROUP BY change_type';

    const fileActivity = this.db.prepare(fileQuery).all(...fileParams);
    metrics.file_activity = fileActivity;

    // Agent interactions
    let agentQuery = `
      SELECT COUNT(*) as total
      FROM agent_events
      WHERE timestamp > ?
    `;
    let agentParams = [cutoff];

    if (projectName) {
      agentQuery += ' AND project_name = ?';
      agentParams.push(projectName);
    }

    const agentStats = this.db.prepare(agentQuery).get(...agentParams);
    metrics.agent_interactions = agentStats;

    // Recent syntax errors (column is 'timestamp', not 'detected_at')
    let syntaxQuery = `
      SELECT COUNT(*) as count
      FROM syntax_errors
      WHERE timestamp > ?
        AND resolved = 0
    `;
    let syntaxParams = [cutoff];

    if (projectName) {
      syntaxQuery += ' AND project_name = ?';
      syntaxParams.push(projectName);
    }

    const syntaxErrors = this.db.prepare(syntaxQuery).get(...syntaxParams);
    metrics.active_syntax_errors = syntaxErrors?.count || 0;

    return metrics;
  }

  /**
   * Generate recommendations based on scores
   */
  generateRecommendations(scores) {
    const recommendations = [];

    // Error recommendations
    if (scores.errorScore < 50) {
      recommendations.push({
        type: 'error',
        severity: 'high',
        title: 'High error rate detected',
        description:
          'Your project has accumulated significant errors in the last 24 hours. Review the error log and address critical issues.',
        action: 'Review errors in System → Errors'
      });
    } else if (scores.errorScore < 75) {
      recommendations.push({
        type: 'error',
        severity: 'medium',
        title: 'Moderate error activity',
        description: 'Some errors detected. Monitor error trends to prevent degradation.',
        action: 'Check recent errors'
      });
    }

    // Activity recommendations
    if (scores.activityScore < 50) {
      recommendations.push({
        type: 'activity',
        severity: scores.activityScore < 25 ? 'high' : 'medium',
        title: scores.activityScore < 25 ? 'Very low activity detected' : 'Low activity detected',
        description:
          scores.activityScore < 25
            ? 'Project appears inactive or not properly monitored.'
            : 'Activity levels are below optimal range.',
        action: 'Verify monitoring is active'
      });
    } else if (scores.activityScore < 75) {
      recommendations.push({
        type: 'activity',
        severity: 'low',
        title: 'Activity could be optimized',
        description: 'Consider reviewing development workflows for efficiency.',
        action: 'Review Activity → Timeline'
      });
    }

    // Stability recommendations
    if (scores.stabilityScore < 50) {
      recommendations.push({
        type: 'stability',
        severity: 'high',
        title: 'Stability issues detected',
        description:
          'Multiple anomalies or rollbacks detected. Project stability may be compromised.',
        action: 'Review Safety → Risk Correlation'
      });
    } else if (scores.stabilityScore < 75) {
      recommendations.push({
        type: 'stability',
        severity: 'medium',
        title: 'Some stability concerns',
        description: 'Monitor for patterns that could indicate deeper issues.',
        action: 'Check anomaly alerts'
      });
    }

    // Performance recommendations
    if (scores.performanceScore < 50) {
      recommendations.push({
        type: 'performance',
        severity: 'high',
        title: 'Performance degradation detected',
        description: 'API response times are elevated. Investigate performance bottlenecks.',
        action: 'Review Analysis → Performance'
      });
    } else if (scores.performanceScore < 75) {
      recommendations.push({
        type: 'performance',
        severity: 'medium',
        title: 'Performance could be improved',
        description: 'Response times are acceptable but have room for optimization.',
        action: 'Monitor performance trends'
      });
    }

    // If everything is good
    if (recommendations.length === 0) {
      recommendations.push({
        type: 'success',
        severity: 'low',
        title: 'Project health is excellent',
        description: 'All health indicators are in optimal ranges. Keep up the good work!',
        action: null
      });
    }

    return recommendations;
  }

  /**
   * Get health status label from score
   */
  getHealthStatus(score) {
    if (score >= 90) return 'excellent';
    if (score >= 75) return 'good';
    if (score >= 60) return 'fair';
    if (score >= 40) return 'poor';
    return 'critical';
  }

  /**
   * Save health snapshot to database
   */
  saveHealthSnapshot(snapshot) {
    const stmt = this.db.prepare(`
      INSERT INTO health_snapshots (
        project_name, overall_score, error_score, activity_score,
        stability_score, performance_score, recommendations, metrics
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      snapshot.projectName,
      snapshot.overallScore,
      snapshot.errorScore,
      snapshot.activityScore,
      snapshot.stabilityScore,
      snapshot.performanceScore,
      JSON.stringify(snapshot.recommendations),
      JSON.stringify(snapshot.metrics)
    );

    // Emit WebSocket event
    if (this.io) {
      this.io.emit('health-update', {
        project: snapshot.projectName,
        score: snapshot.overallScore,
        status: this.getHealthStatus(snapshot.overallScore)
      });
    }
  }

  /**
   * Get health trends over time
   */
  getHealthTrends(projectName, days = 7) {
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    let query = `
      SELECT
        DATE(timestamp) as date,
        AVG(overall_score) as avg_score,
        AVG(error_score) as avg_error_score,
        AVG(activity_score) as avg_activity_score,
        AVG(stability_score) as avg_stability_score,
        AVG(performance_score) as avg_performance_score,
        COUNT(*) as snapshots
      FROM health_snapshots
      WHERE timestamp > ?
    `;
    let params = [cutoff];

    if (projectName && projectName !== 'all') {
      query += ' AND project_name = ?';
      params.push(projectName);
    }

    query += ' GROUP BY DATE(timestamp) ORDER BY date DESC';

    const trends = this.db.prepare(query).all(...params);

    return trends.map(t => ({
      date: t.date,
      overall_score: Math.round(t.avg_score),
      error_score: Math.round(t.avg_error_score),
      activity_score: Math.round(t.avg_activity_score),
      stability_score: Math.round(t.avg_stability_score),
      performance_score: Math.round(t.avg_performance_score),
      snapshots: t.snapshots
    }));
  }

  /**
   * Get all active health issues
   */
  getActiveIssues(projectName) {
    let query = `
      SELECT * FROM health_issues
      WHERE auto_resolved = 0
    `;
    let params = [];

    if (projectName && projectName !== 'all') {
      query += ' AND project_name = ?';
      params.push(projectName);
    }

    query += ' ORDER BY created_at DESC';

    return this.db.prepare(query).all(...params);
  }

  /**
   * Compare multiple projects
   */
  compareProjects() {
    const projects = this.db
      .prepare(
        `
      SELECT DISTINCT project_name
      FROM events
      WHERE project_name IS NOT NULL
        AND project_name != ''
      LIMIT 10
    `
      )
      .all();

    const comparison = projects.map(p => {
      const health = this.calculateHealthScore(p.project_name);
      return {
        project: p.project_name,
        overall_score: health.overall_score,
        status: health.status,
        scores: health.scores,
        recommendation_count: health.recommendations.length
      };
    });

    // Sort by score descending
    comparison.sort((a, b) => b.overall_score - a.overall_score);

    return comparison;
  }

  /**
   * Get health summary for dashboard
   */
  getHealthSummary(projectName) {
    const currentHealth = this.calculateHealthScore(projectName);
    const trends = this.getHealthTrends(projectName, 7);
    const activeIssues = this.getActiveIssues(projectName);

    // Calculate trend direction
    let trendDirection = 'stable';
    if (trends.length >= 2) {
      const latest = trends[0].overall_score;
      const previous = trends[1].overall_score;
      const diff = latest - previous;

      if (diff > 5) trendDirection = 'improving';
      else if (diff < -5) trendDirection = 'declining';
    }

    return {
      current: currentHealth,
      trend: {
        direction: trendDirection,
        history: trends
      },
      issues: {
        active: activeIssues.length,
        critical: activeIssues.filter(i => i.severity === 'critical').length,
        high: activeIssues.filter(i => i.severity === 'high').length
      }
    };
  }
}
