/**
 * Health Scoring System
 *
 * Calculates and tracks overall project health based on multiple factors:
 * - Code quality (rollback rate, change size consistency)
 * - Test coverage (test file ratio)
 * - Documentation (README, comments)
 * - Velocity (commits, changes per day)
 * - Stability (error rate, rollback frequency)
 * - Security (security-related files, patterns)
 */

import { logger } from '../utils/logger.js';

export class HealthScoring {
  constructor(ravenDb) {
    this.db = ravenDb;
    this.projectName = ravenDb.projectName || 'raven';
  }

  /**
   * Calculate overall project health score (0-100)
   */
  async calculateHealthScore() {
    try {
      const codeQuality = await this.calculateCodeQualityScore();
      const testCoverage = await this.calculateTestCoverageScore();
      const documentation = await this.calculateDocumentationScore();
      const velocity = await this.calculateVelocityScore();
      const stability = await this.calculateStabilityScore();
      const security = await this.calculateSecurityScore();

      // Weighted average
      const overallScore = Math.round(
        codeQuality * 0.25 +
        testCoverage * 0.20 +
        documentation * 0.10 +
        velocity * 0.15 +
        stability * 0.20 +
        security * 0.10
      );

      const recommendations = this.generateRecommendations({
        codeQuality,
        testCoverage,
        documentation,
        velocity,
        stability,
        security
      });

      const today = new Date().toISOString().split('T')[0];

      // Save to database
      const stmt = this.db.prepareStatement(`
        INSERT INTO health_scores (
          project_name, score_date, overall_score,
          code_quality_score, test_coverage_score, documentation_score,
          velocity_score, stability_score, security_score,
          metrics, recommendations
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(project_name, score_date)
        DO UPDATE SET
          overall_score = excluded.overall_score,
          code_quality_score = excluded.code_quality_score,
          test_coverage_score = excluded.test_coverage_score,
          documentation_score = excluded.documentation_score,
          velocity_score = excluded.velocity_score,
          stability_score = excluded.stability_score,
          security_score = excluded.security_score,
          metrics = excluded.metrics,
          recommendations = excluded.recommendations
      `);

      stmt.run(
        this.projectName,
        today,
        overallScore,
        codeQuality,
        testCoverage,
        documentation,
        velocity,
        stability,
        security,
        JSON.stringify({ codeQuality, testCoverage, documentation, velocity, stability, security }),
        JSON.stringify(recommendations)
      );

      logger.info('Health score calculated', {
        service: 'health-scoring',
        project: this.projectName,
        score: overallScore
      });

      return {
        overallScore,
        breakdown: {
          codeQuality,
          testCoverage,
          documentation,
          velocity,
          stability,
          security
        },
        recommendations,
        date: today
      };
    } catch (error) {
      logger.error('Failed to calculate health score', {
        service: 'health-scoring',
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Calculate code quality score (0-100)
   */
  async calculateCodeQualityScore() {
    const stmt = this.db.prepareStatement(`
      SELECT
        COUNT(*) as total_changes,
        SUM(CASE WHEN event_type = 'rollback' THEN 1 ELSE 0 END) as rollbacks,
        AVG(CASE WHEN lines_added + lines_deleted > 0 THEN lines_added + lines_deleted ELSE NULL END) as avg_change_size
      FROM events
      WHERE project_name = ?
        AND timestamp >= datetime('now', '-30 days')
    `);

    const stats = stmt.get(this.projectName);

    if (!stats || stats.total_changes === 0) return 70; // Default for new projects

    const rollbackRate = stats.rollbacks / stats.total_changes;
    const changeSizeScore = Math.min(100, Math.max(0, 100 - (stats.avg_change_size / 5))); // Prefer smaller, focused changes

    // Lower rollback rate = higher quality
    const qualityScore = Math.round(
      (1 - rollbackRate) * 70 + // 70% weight on low rollback rate
      changeSizeScore * 0.30     // 30% weight on reasonable change size
    );

    return Math.max(0, Math.min(100, qualityScore));
  }

  /**
   * Calculate test coverage score (0-100)
   */
  async calculateTestCoverageScore() {
    const stmt = this.db.prepareStatement(`
      SELECT
        COUNT(DISTINCT CASE WHEN filepath LIKE '%test%' OR filepath LIKE '%spec%' THEN filepath END) as test_files,
        COUNT(DISTINCT filepath) as total_files
      FROM events
      WHERE project_name = ?
        AND timestamp >= datetime('now', '-30 days')
    `);

    const stats = stmt.get(this.projectName);

    if (!stats || stats.total_files === 0) return 50; // Default

    const testRatio = stats.test_files / stats.total_files;

    // Good test coverage is around 20-40% test files
    let score;
    if (testRatio >= 0.20 && testRatio <= 0.40) {
      score = 100;
    } else if (testRatio > 0.40) {
      score = Math.max(70, 100 - (testRatio - 0.40) * 100);
    } else {
      score = testRatio / 0.20 * 100;
    }

    return Math.round(Math.max(0, Math.min(100, score)));
  }

  /**
   * Calculate documentation score (0-100)
   */
  async calculateDocumentationScore() {
    const stmt = this.db.prepareStatement(`
      SELECT
        COUNT(DISTINCT CASE WHEN filepath LIKE '%.md' OR filepath LIKE '%README%' THEN filepath END) as doc_files,
        COUNT(DISTINCT filepath) as total_files
      FROM events
      WHERE project_name = ?
        AND timestamp >= datetime('now', '-30 days')
    `);

    const stats = stmt.get(this.projectName);

    if (!stats || stats.total_files === 0) return 60; // Default

    const docRatio = stats.doc_files / stats.total_files;

    // Good documentation is around 5-15% doc files
    let score;
    if (docRatio >= 0.05 && docRatio <= 0.15) {
      score = 100;
    } else if (docRatio > 0.15) {
      score = Math.max(80, 100 - (docRatio - 0.15) * 100);
    } else {
      score = docRatio / 0.05 * 100;
    }

    return Math.round(Math.max(0, Math.min(100, score)));
  }

  /**
   * Calculate velocity score (0-100)
   */
  async calculateVelocityScore() {
    const stmt = this.db.prepareStatement(`
      SELECT
        COUNT(*) as total_changes,
        COUNT(DISTINCT DATE(timestamp)) as active_days
      FROM events
      WHERE project_name = ?
        AND event_type = 'change'
        AND timestamp >= datetime('now', '-30 days')
    `);

    const stats = stmt.get(this.projectName);

    if (!stats || stats.active_days === 0) return 50; // Default

    const changesPerDay = stats.total_changes / 30; // Over 30 days

    // Healthy velocity is 10-50 changes per day
    let score;
    if (changesPerDay >= 10 && changesPerDay <= 50) {
      score = 100;
    } else if (changesPerDay > 50) {
      score = Math.max(70, 100 - (changesPerDay - 50) / 2);
    } else {
      score = changesPerDay / 10 * 100;
    }

    return Math.round(Math.max(0, Math.min(100, score)));
  }

  /**
   * Calculate stability score (0-100)
   */
  async calculateStabilityScore() {
    const stmt = this.db.prepareStatement(`
      SELECT
        COUNT(*) as total_events,
        SUM(CASE WHEN event_type = 'rollback' THEN 1 ELSE 0 END) as rollbacks,
        SUM(CASE WHEN event_type = 'error' THEN 1 ELSE 0 END) as errors
      FROM events
      WHERE project_name = ?
        AND timestamp >= datetime('now', '-30 days')
    `);

    const stats = stmt.get(this.projectName);

    if (!stats || stats.total_events === 0) return 80; // Default

    const rollbackRate = stats.rollbacks / stats.total_events;
    const errorRate = stats.errors / stats.total_events;

    // Lower rates = higher stability
    const score = Math.round(
      (1 - rollbackRate) * 60 +  // 60% weight on low rollback rate
      (1 - errorRate) * 40         // 40% weight on low error rate
    );

    return Math.max(0, Math.min(100, score));
  }

  /**
   * Calculate security score (0-100)
   */
  async calculateSecurityScore() {
    const stmt = this.db.prepareStatement(`
      SELECT
        COUNT(DISTINCT CASE WHEN
          filepath LIKE '%auth%' OR
          filepath LIKE '%security%' OR
          filepath LIKE '%crypto%' OR
          filepath LIKE '%.env%'
        THEN filepath END) as security_files,
        COUNT(DISTINCT filepath) as total_files
      FROM events
      WHERE project_name = ?
        AND timestamp >= datetime('now', '-30 days')
    `);

    const stats = stmt.get(this.projectName);

    if (!stats || stats.total_files === 0) return 70; // Default

    const securityRatio = stats.security_files / stats.total_files;

    // Good security attention is around 5-10% of files
    let score;
    if (securityRatio >= 0.05 && securityRatio <= 0.10) {
      score = 100;
    } else if (securityRatio > 0.10) {
      score = Math.max(80, 100 - (securityRatio - 0.10) * 100);
    } else {
      score = Math.max(60, securityRatio / 0.05 * 100);
    }

    return Math.round(Math.max(0, Math.min(100, score)));
  }

  /**
   * Generate recommendations based on scores
   */
  generateRecommendations(scores) {
    const recommendations = [];

    if (scores.codeQuality < 70) {
      recommendations.push({
        category: 'code_quality',
        severity: 'high',
        message: 'High rollback rate detected. Consider smaller, incremental changes and more testing before commits.'
      });
    }

    if (scores.testCoverage < 60) {
      recommendations.push({
        category: 'test_coverage',
        severity: 'medium',
        message: 'Low test coverage. Add more test files to improve code reliability.'
      });
    }

    if (scores.documentation < 50) {
      recommendations.push({
        category: 'documentation',
        severity: 'medium',
        message: 'Limited documentation. Consider adding README files and inline comments.'
      });
    }

    if (scores.velocity < 40) {
      recommendations.push({
        category: 'velocity',
        severity: 'low',
        message: 'Low development velocity. Are there blockers preventing progress?'
      });
    }

    if (scores.stability < 70) {
      recommendations.push({
        category: 'stability',
        severity: 'high',
        message: 'Project stability issues. High error or rollback rate needs attention.'
      });
    }

    if (scores.security < 60) {
      recommendations.push({
        category: 'security',
        severity: 'high',
        message: 'Security attention needed. Review authentication, encryption, and sensitive data handling.'
      });
    }

    if (recommendations.length === 0) {
      recommendations.push({
        category: 'general',
        severity: 'info',
        message: 'Project health is good! Keep up the great work!'
      });
    }

    return recommendations;
  }

  /**
   * Get health score history
   */
  getHealthHistory(days = 30) {
    try {
      const stmt = this.db.prepareStatement(`
        SELECT * FROM health_scores
        WHERE project_name = ?
          AND score_date >= date('now', '-' || ? || ' days')
        ORDER BY score_date DESC
      `);

      const scores = stmt.all(this.projectName, days);

      return scores.map(s => ({
        ...s,
        metrics: s.metrics ? JSON.parse(s.metrics) : null,
        recommendations: s.recommendations ? JSON.parse(s.recommendations) : []
      }));
    } catch (error) {
      logger.error('Failed to get health history', {
        service: 'health-scoring',
        error: error.message
      });
      return [];
    }
  }

  /**
   * Get latest health score
   */
  getLatestScore() {
    try {
      const stmt = this.db.prepareStatement(`
        SELECT * FROM health_scores
        WHERE project_name = ?
        ORDER BY score_date DESC
        LIMIT 1
      `);

      const score = stmt.get(this.projectName);

      if (!score) return null;

      return {
        ...score,
        metrics: score.metrics ? JSON.parse(score.metrics) : null,
        recommendations: score.recommendations ? JSON.parse(score.recommendations) : []
      };
    } catch (error) {
      logger.error('Failed to get latest score', {
        service: 'health-scoring',
        error: error.message
      });
      return null;
    }
  }
}
