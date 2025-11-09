/**
 * Productivity Insights Analyzer
 *
 * Deep analysis of developer productivity patterns:
 * - Peak productivity hours
 * - Optimal session duration
 * - Most productive file types
 * - Focus time analysis
 * - Break patterns
 * - Productivity trends
 */

import { logger } from '../utils/logger.js';

export class ProductivityInsights {
  constructor(ravenDb) {
    this.db = ravenDb;
    this.projectName = ravenDb.projectName || 'raven';
  }

  /**
   * Calculate comprehensive productivity insights
   */
  async calculateInsights(days = 30) {
    try {
      const insights = {
        peak_hours: await this.analyzePeakHours(days),
        session_patterns: await this.analyzeSessionPatterns(days),
        file_type_productivity: await this.analyzeFileTypeProductivity(days),
        focus_metrics: await this.analyzeFocusMetrics(days),
        productivity_trends: await this.analyzeProductivityTrends(days),
        recommendations: []
      };

      // Generate recommendations
      insights.recommendations = this.generateRecommendations(insights);

      // Save to database
      this.saveProductivityMetrics(insights);

      logger.info('Productivity insights calculated', {
        service: 'productivity-insights',
        project: this.projectName
      });

      return insights;
    } catch (error) {
      logger.error('Failed to calculate productivity insights', {
        service: 'productivity-insights',
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Analyze peak productivity hours
   */
  async analyzePeakHours(days) {
    const stmt = this.db.prepareStatement(`
      SELECT
        strftime('%H', timestamp) as hour,
        COUNT(*) as change_count,
        AVG(lines_added + lines_deleted) as avg_change_size,
        SUM(CASE WHEN event_type = 'rollback' THEN 1 ELSE 0 END) as rollbacks
      FROM events
      WHERE project_name = ?
        AND event_type IN ('change', 'rollback')
        AND timestamp >= datetime('now', '-' || ? || ' days')
      GROUP BY hour
      ORDER BY change_count DESC
    `);

    const hourlyStats = stmt.all(this.projectName, days);

    // Calculate quality score for each hour (activity - rollbacks)
    const scoredHours = hourlyStats.map(h => ({
      hour: parseInt(h.hour),
      change_count: h.change_count,
      avg_change_size: h.avg_change_size,
      rollback_rate: h.rollbacks / h.change_count,
      quality_score: h.change_count * (1 - h.rollbacks / h.change_count)
    }));

    // Sort by quality score
    scoredHours.sort((a, b) => b.quality_score - a.quality_score);

    const peakHours = scoredHours.slice(0, 3).map(h => h.hour);
    const lowHours = scoredHours.slice(-3).map(h => h.hour);

    return {
      peak_hours: peakHours,
      low_productivity_hours: lowHours,
      hourly_breakdown: scoredHours,
      peak_hour: scoredHours.length > 0 ? scoredHours[0].hour : null
    };
  }

  /**
   * Analyze session patterns
   */
  async analyzeSessionPatterns(days) {
    const stmt = this.db.prepareStatement(`
      SELECT
        session_id,
        MIN(timestamp) as session_start,
        MAX(timestamp) as session_end,
        COUNT(*) as changes,
        SUM(lines_added + lines_deleted) as total_lines_changed,
        SUM(CASE WHEN event_type = 'rollback' THEN 1 ELSE 0 END) as rollbacks
      FROM events
      WHERE project_name = ?
        AND timestamp >= datetime('now', '-' || ? || ' days')
        AND session_id IS NOT NULL
      GROUP BY session_id
      HAVING changes > 5
    `);

    const sessions = stmt.all(this.projectName, days);

    // Calculate session durations and productivity
    const sessionMetrics = sessions.map(s => {
      const start = new Date(s.session_start);
      const end = new Date(s.session_end);
      const durationHours = (end - start) / (1000 * 60 * 60);
      const changesPerHour = durationHours > 0 ? s.changes / durationHours : 0;
      const rollbackRate = s.rollbacks / s.changes;
      const productivityScore = changesPerHour * (1 - rollbackRate);

      return {
        session_id: s.session_id,
        duration_hours: durationHours,
        changes: s.changes,
        changes_per_hour: changesPerHour,
        rollback_rate: rollbackRate,
        productivity_score: productivityScore
      };
    });

    // Find optimal session duration
    sessionMetrics.sort((a, b) => b.productivity_score - a.productivity_score);

    const topSessions = sessionMetrics.slice(0, Math.floor(sessionMetrics.length * 0.2));
    const avgOptimalDuration =
      topSessions.reduce((sum, s) => sum + s.duration_hours, 0) / topSessions.length;

    return {
      total_sessions: sessions.length,
      avg_session_duration:
        sessionMetrics.reduce((sum, s) => sum + s.duration_hours, 0) / sessionMetrics.length,
      optimal_session_duration: avgOptimalDuration,
      avg_changes_per_hour:
        sessionMetrics.reduce((sum, s) => sum + s.changes_per_hour, 0) / sessionMetrics.length,
      most_productive_sessions: topSessions.slice(0, 5),
      session_breakdown: sessionMetrics
    };
  }

  /**
   * Analyze file type productivity
   */
  async analyzeFileTypeProductivity(days) {
    const stmt = this.db.prepareStatement(`
      SELECT
        CASE
          WHEN filepath LIKE '%.js' THEN 'JavaScript'
          WHEN filepath LIKE '%.ts' THEN 'TypeScript'
          WHEN filepath LIKE '%.jsx' OR filepath LIKE '%.tsx' THEN 'React'
          WHEN filepath LIKE '%.svelte' THEN 'Svelte'
          WHEN filepath LIKE '%.py' THEN 'Python'
          WHEN filepath LIKE '%.java' THEN 'Java'
          WHEN filepath LIKE '%.css' OR filepath LIKE '%.scss' THEN 'Styles'
          WHEN filepath LIKE '%.html' THEN 'HTML'
          WHEN filepath LIKE '%.json' THEN 'Config'
          WHEN filepath LIKE '%.md' THEN 'Documentation'
          ELSE 'Other'
        END as file_type,
        COUNT(*) as change_count,
        AVG(lines_added + lines_deleted) as avg_change_size,
        SUM(CASE WHEN event_type = 'rollback' THEN 1 ELSE 0 END) as rollbacks,
        COUNT(DISTINCT session_id) as sessions_worked
      FROM events
      WHERE project_name = ?
        AND event_type IN ('change', 'rollback')
        AND timestamp >= datetime('now', '-' || ? || ' days')
      GROUP BY file_type
      ORDER BY change_count DESC
    `);

    const fileTypeStats = stmt.all(this.projectName, days);

    const scoredTypes = fileTypeStats.map(ft => ({
      file_type: ft.file_type,
      change_count: ft.change_count,
      avg_change_size: ft.avg_change_size,
      rollback_rate: ft.rollbacks / ft.change_count,
      sessions_worked: ft.sessions_worked,
      productivity_score: ft.change_count * (1 - ft.rollbacks / ft.change_count)
    }));

    scoredTypes.sort((a, b) => b.productivity_score - a.productivity_score);

    return {
      most_productive_types: scoredTypes.slice(0, 3),
      least_productive_types: scoredTypes.slice(-3).reverse(),
      all_types: scoredTypes
    };
  }

  /**
   * Analyze focus metrics
   */
  async analyzeFocusMetrics(days) {
    const stmt = this.db.prepareStatement(`
      SELECT
        DATE(timestamp) as date,
        COUNT(DISTINCT filepath) as files_touched,
        COUNT(DISTINCT session_id) as sessions,
        COUNT(*) as total_changes,
        SUM(CASE WHEN event_type = 'rollback' THEN 1 ELSE 0 END) as rollbacks
      FROM events
      WHERE project_name = ?
        AND timestamp >= datetime('now', '-' || ? || ' days')
      GROUP BY date
      ORDER BY date DESC
    `);

    const dailyStats = stmt.all(this.projectName, days);

    const focusMetrics = dailyStats.map(d => {
      // Calculate focus score: changes per file (higher = more focused on fewer files)
      const focusScore =
        d.files_touched && d.files_touched > 0 ? d.total_changes / d.files_touched : null;
      // Calculate session efficiency: changes per session
      const sessionEfficiency = d.sessions && d.sessions > 0 ? d.total_changes / d.sessions : null;
      const rollbackRate =
        d.total_changes && d.total_changes > 0 ? d.rollbacks / d.total_changes : 0;

      return {
        date: d.date,
        files_touched: d.files_touched,
        sessions: d.sessions,
        total_changes: d.total_changes,
        focus_score: focusScore,
        session_efficiency: sessionEfficiency,
        rollback_rate: rollbackRate,
        quality_score: focusScore !== null ? focusScore * (1 - rollbackRate) : null
      };
    });

    // Find patterns
    const validFocusMetrics = focusMetrics.filter(m => m.focus_score !== null);
    const avgFocusScore =
      validFocusMetrics.length > 0
        ? validFocusMetrics.reduce((sum, m) => sum + m.focus_score, 0) / validFocusMetrics.length
        : 0;
    const highFocusDays = focusMetrics.filter(
      m => m.focus_score !== null && m.focus_score > avgFocusScore * 1.2
    );

    return {
      avg_focus_score: avgFocusScore,
      avg_files_per_day:
        focusMetrics.length > 0
          ? focusMetrics.reduce((sum, m) => sum + m.files_touched, 0) / focusMetrics.length
          : 0,
      high_focus_days: highFocusDays.length,
      focus_trend: focusMetrics,
      recommendation:
        avgFocusScore > 0 && avgFocusScore < 3
          ? 'Consider focusing on fewer files per session'
          : 'Good focus maintained'
    };
  }

  /**
   * Analyze productivity trends
   */
  async analyzeProductivityTrends(days) {
    const stmt = this.db.prepareStatement(`
      SELECT
        DATE(timestamp) as date,
        COUNT(*) as changes,
        SUM(lines_added) as total_added,
        SUM(lines_deleted) as total_deleted,
        SUM(CASE WHEN event_type = 'rollback' THEN 1 ELSE 0 END) as rollbacks,
        COUNT(DISTINCT session_id) as sessions
      FROM events
      WHERE project_name = ?
        AND timestamp >= datetime('now', '-' || ? || ' days')
      GROUP BY date
      ORDER BY date ASC
    `);

    const dailyTrends = stmt.all(this.projectName, days);

    if (dailyTrends.length < 14) {
      return { trend: 'insufficient_data', data: dailyTrends };
    }

    // Calculate trend direction (last 7 days vs previous 7 days)
    const recent = dailyTrends.slice(-7);
    const previous = dailyTrends.slice(-14, -7);

    // Ensure we have valid data for both periods
    if (recent.length === 0 || previous.length === 0) {
      return { trend: 'insufficient_data', data: dailyTrends };
    }

    const recentAvg = recent.reduce((sum, d) => sum + d.changes, 0) / recent.length;
    const previousAvg = previous.reduce((sum, d) => sum + d.changes, 0) / previous.length;

    const trendDirection =
      recentAvg > previousAvg * 1.1
        ? 'improving'
        : recentAvg < previousAvg * 0.9
          ? 'declining'
          : 'stable';

    const trendStrength = Math.abs((recentAvg - previousAvg) / previousAvg);

    return {
      trend: trendDirection,
      trend_strength: trendStrength,
      current_avg_changes: recentAvg,
      previous_avg_changes: previousAvg,
      daily_breakdown: dailyTrends
    };
  }

  /**
   * Generate recommendations based on insights
   */
  generateRecommendations(insights) {
    const recommendations = [];

    // Peak hours recommendation
    if (insights.peak_hours?.peak_hours?.length > 0) {
      const peakHour = insights.peak_hours.peak_hours[0];
      recommendations.push({
        category: 'scheduling',
        priority: 'medium',
        message: `Your peak productivity hour is ${peakHour}:00. Schedule complex tasks during this time.`,
        data: { peak_hour: peakHour }
      });
    }

    // Session duration recommendation
    if (insights.session_patterns?.optimal_session_duration) {
      const optimal = insights.session_patterns.optimal_session_duration;
      if (optimal < 2) {
        recommendations.push({
          category: 'sessions',
          priority: 'low',
          message: `Your most productive sessions are around ${optimal.toFixed(1)} hours. Consider shorter, focused sessions.`,
          data: { optimal_duration: optimal }
        });
      } else if (optimal > 4) {
        recommendations.push({
          category: 'sessions',
          priority: 'medium',
          message: `Long sessions (${optimal.toFixed(1)} hours) are your sweet spot, but remember to take breaks.`,
          data: { optimal_duration: optimal }
        });
      }
    }

    // Focus recommendation
    if (insights.focus_metrics?.avg_focus_score < 3) {
      recommendations.push({
        category: 'focus',
        priority: 'high',
        message:
          "You're spreading attention across many files. Try focusing on 2-3 files per session.",
        data: { current_focus: insights.focus_metrics.avg_focus_score }
      });
    }

    // Trend recommendation
    if (insights.productivity_trends?.trend === 'declining') {
      recommendations.push({
        category: 'trends',
        priority: 'high',
        message: 'Productivity is declining. Consider reviewing blockers or taking a break.',
        data: { trend: 'declining', strength: insights.productivity_trends.trend_strength }
      });
    } else if (insights.productivity_trends?.trend === 'improving') {
      recommendations.push({
        category: 'trends',
        priority: 'info',
        message: 'Productivity is trending up! Keep up the great work!',
        data: { trend: 'improving', strength: insights.productivity_trends.trend_strength }
      });
    }

    // File type recommendation
    if (insights.file_type_productivity?.most_productive_types?.length > 0) {
      const topType = insights.file_type_productivity.most_productive_types[0];
      recommendations.push({
        category: 'file_types',
        priority: 'low',
        message: `You're most productive with ${topType.file_type} files. Quality score: ${topType.productivity_score.toFixed(1)}`,
        data: { file_type: topType.file_type }
      });
    }

    return recommendations;
  }

  /**
   * Save productivity metrics to database
   */
  saveProductivityMetrics(insights) {
    try {
      const today = new Date().toISOString().split('T')[0];

      const stmt = this.db.prepareStatement(`
        INSERT INTO productivity_metrics (
          project_name, metric_date,
          peak_hour, avg_session_duration, optimal_session_duration,
          avg_changes_per_hour, avg_focus_score,
          productivity_trend, insights, recommendations
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(project_name, metric_date)
        DO UPDATE SET
          peak_hour = excluded.peak_hour,
          avg_session_duration = excluded.avg_session_duration,
          optimal_session_duration = excluded.optimal_session_duration,
          avg_changes_per_hour = excluded.avg_changes_per_hour,
          avg_focus_score = excluded.avg_focus_score,
          productivity_trend = excluded.productivity_trend,
          insights = excluded.insights,
          recommendations = excluded.recommendations
      `);

      stmt.run(
        this.projectName,
        today,
        insights.peak_hours?.peak_hour || null,
        insights.session_patterns?.avg_session_duration || null,
        insights.session_patterns?.optimal_session_duration || null,
        insights.session_patterns?.avg_changes_per_hour || null,
        insights.focus_metrics?.avg_focus_score || null,
        insights.productivity_trends?.trend || 'unknown',
        JSON.stringify(insights),
        JSON.stringify(insights.recommendations)
      );

      logger.debug('Productivity metrics saved', {
        service: 'productivity-insights',
        date: today
      });
    } catch (error) {
      logger.error('Failed to save productivity metrics', {
        service: 'productivity-insights',
        error: error.message
      });
    }
  }

  /**
   * Get productivity history
   */
  getProductivityHistory(days = 30) {
    try {
      const stmt = this.db.prepareStatement(`
        SELECT * FROM productivity_metrics
        WHERE project_name = ?
          AND metric_date >= date('now', '-' || ? || ' days')
        ORDER BY metric_date DESC
      `);

      const metrics = stmt.all(this.projectName, days);

      return metrics.map(m => ({
        ...m,
        insights: m.insights ? JSON.parse(m.insights) : null,
        recommendations: m.recommendations ? JSON.parse(m.recommendations) : []
      }));
    } catch (error) {
      logger.error('Failed to get productivity history', {
        service: 'productivity-insights',
        error: error.message
      });
      return [];
    }
  }

  /**
   * Get latest productivity metrics
   */
  getLatestMetrics() {
    try {
      const stmt = this.db.prepareStatement(`
        SELECT * FROM productivity_metrics
        WHERE project_name = ?
        ORDER BY metric_date DESC
        LIMIT 1
      `);

      const metrics = stmt.get(this.projectName);

      if (!metrics) return null;

      return {
        ...metrics,
        insights: metrics.insights ? JSON.parse(metrics.insights) : null,
        recommendations: metrics.recommendations ? JSON.parse(metrics.recommendations) : []
      };
    } catch (error) {
      logger.error('Failed to get latest metrics', {
        service: 'productivity-insights',
        error: error.message
      });
      return null;
    }
  }
}
