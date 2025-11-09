/**
 * Claude Personality Deep Analysis
 *
 * Analyzes Claude AI agent's behavioral patterns and personality traits:
 * - Communication style
 * - Risk tolerance
 * - Creativity metrics
 * - Consistency patterns
 * - Problem-solving approach
 * - Decision-making speed
 * - Learning adaptation
 */

import { logger } from '../utils/logger.js';

export class ClaudePersonalityAnalyzer {
  constructor(ravenDb) {
    this.db = ravenDb;
    this.projectName = ravenDb.projectName || 'raven';
  }

  /**
   * Perform comprehensive personality analysis
   */
  async analyzePersonality(agent = 'claude', days = 30) {
    try {
      const personality = {
        agent,
        communication_style: await this.analyzeCommunicationStyle(agent, days),
        risk_profile: await this.analyzeRiskTolerance(agent, days),
        creativity_score: await this.analyzeCreativity(agent, days),
        consistency_metrics: await this.analyzeConsistency(agent, days),
        problem_solving: await this.analyzeProblemSolving(agent, days),
        decision_speed: await this.analyzeDecisionSpeed(agent, days),
        adaptation_score: await this.analyzeAdaptation(agent, days),
        overall_profile: {}
      };

      // Calculate overall personality profile
      personality.overall_profile = this.synthesizeProfile(personality);

      // Save to database
      this.savePersonalityInsight(agent, personality);

      logger.info('Personality analysis completed', {
        service: 'claude-personality',
        agent,
        profile: personality.overall_profile.type
      });

      return personality;
    } catch (error) {
      logger.error('Failed to analyze personality', {
        service: 'claude-personality',
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Analyze communication style
   */
  async analyzeCommunicationStyle(agent, days) {
    const stmt = this.db.prepareStatement(`
      SELECT
        filepath,
        lines_added,
        lines_deleted,
        event_type,
        timestamp
      FROM events
      WHERE project_name = ?
        AND agent = ?
        AND timestamp >= datetime('now', '-' || ? || ' days')
      ORDER BY timestamp
    `);

    const events = stmt.all(this.projectName, agent, days);

    if (events.length === 0) {
      return { style: 'unknown', verbosity: 0, patterns: [] };
    }

    // Analyze comment patterns (files with comments, docs)
    const docFiles = events.filter(e =>
      e.filepath.includes('README') ||
      e.filepath.endsWith('.md') ||
      e.filepath.includes('doc')
    ).length;

    const totalFiles = new Set(events.map(e => e.filepath)).size;
    const documentationRatio = docFiles / totalFiles;

    // Analyze change size distribution
    const changeSizes = events.map(e => e.lines_added + e.lines_deleted);
    const avgChangeSize = changeSizes.reduce((a, b) => a + b, 0) / changeSizes.length;
    const maxChangeSize = Math.max(...changeSizes);

    // Determine communication style
    let style = 'balanced';
    let verbosity = 50;

    if (documentationRatio > 0.15) {
      style = 'verbose';
      verbosity = 75;
    } else if (documentationRatio < 0.05) {
      style = 'concise';
      verbosity = 25;
    }

    if (avgChangeSize < 20) {
      style = style === 'balanced' ? 'incremental' : style;
    } else if (avgChangeSize > 100) {
      style = style === 'balanced' ? 'comprehensive' : style;
    }

    return {
      style,
      verbosity,
      documentation_ratio: documentationRatio,
      avg_change_size: avgChangeSize,
      max_change_size: maxChangeSize,
      total_events: events.length
    };
  }

  /**
   * Analyze risk tolerance
   */
  async analyzeRiskTolerance(agent, days) {
    const stmt = this.db.prepareStatement(`
      SELECT
        filepath,
        lines_added + lines_deleted as change_size,
        event_type,
        CASE
          WHEN filepath LIKE '%test%' THEN 'safe'
          WHEN filepath LIKE '%config%' THEN 'risky'
          WHEN filepath LIKE '%server%' OR filepath LIKE '%api%' THEN 'risky'
          WHEN filepath LIKE '%db%' OR filepath LIKE '%database%' THEN 'very_risky'
          ELSE 'moderate'
        END as risk_category
      FROM events
      WHERE project_name = ?
        AND agent = ?
        AND event_type IN ('change', 'rollback')
        AND timestamp >= datetime('now', '-' || ? || ' days')
    `);

    const events = stmt.all(this.projectName, agent, days);

    if (events.length === 0) {
      return { tolerance: 'unknown', score: 50, patterns: [] };
    }

    // Calculate risk score
    let riskScore = 0;
    const riskyChanges = events.filter(e => e.risk_category === 'risky' || e.risk_category === 'very_risky').length;
    const largeChanges = events.filter(e => e.change_size > 100).length;
    const rollbacks = events.filter(e => e.event_type === 'rollback').length;

    // Higher risk = more risky files touched, larger changes
    riskScore += (riskyChanges / events.length) * 40;
    riskScore += (largeChanges / events.length) * 30;
    riskScore += Math.min((rollbacks / events.length) * 100, 30);

    // Determine tolerance level
    let tolerance = 'moderate';
    if (riskScore > 60) tolerance = 'high';
    else if (riskScore > 40) tolerance = 'moderate';
    else tolerance = 'cautious';

    return {
      tolerance,
      score: Math.round(riskScore),
      risky_changes_percent: (riskyChanges / events.length) * 100,
      large_changes_percent: (largeChanges / events.length) * 100,
      rollback_rate: (rollbacks / events.length) * 100,
      total_analyzed: events.length
    };
  }

  /**
   * Analyze creativity
   */
  async analyzeCreativity(agent, days) {
    const stmt = this.db.prepareStatement(`
      SELECT
        filepath,
        event_type,
        lines_added,
        timestamp,
        CASE
          WHEN filepath LIKE '%.test.%' OR filepath LIKE '%.spec.%' THEN 'test'
          WHEN filepath LIKE '%.config.%' OR filepath LIKE '%package.json%' THEN 'config'
          ELSE 'code'
        END as file_category
      FROM events
      WHERE project_name = ?
        AND agent = ?
        AND timestamp >= datetime('now', '-' || ? || ' days')
      ORDER BY timestamp
    `);

    const events = stmt.all(this.projectName, agent, days);

    if (events.length === 0) {
      return { score: 0, level: 'unknown', patterns: [] };
    }

    // Count new file creations (high lines_added, first appearance)
    const filesFirstSeen = {};
    let newFileCount = 0;

    events.forEach(e => {
      if (!filesFirstSeen[e.filepath]) {
        filesFirstSeen[e.filepath] = e.lines_added;
        if (e.lines_added > 50) newFileCount++;
      }
    });

    const uniqueFiles = Object.keys(filesFirstSeen).length;
    const fileVariety = uniqueFiles / events.length;

    // Calculate creativity score (0-100)
    let creativityScore = 0;

    // New file creation = creative
    creativityScore += Math.min((newFileCount / uniqueFiles) * 40, 40);

    // File variety = exploratory
    creativityScore += fileVariety * 30;

    // Novel patterns (large additions to new files)
    const novelWork = events.filter(e => e.lines_added > 100).length;
    creativityScore += Math.min((novelWork / events.length) * 30, 30);

    // Determine creativity level
    let level = 'moderate';
    if (creativityScore > 70) level = 'high';
    else if (creativityScore > 40) level = 'moderate';
    else level = 'low';

    return {
      score: Math.round(creativityScore),
      level,
      new_files_created: newFileCount,
      file_variety: fileVariety,
      novel_work_percent: (novelWork / events.length) * 100,
      unique_files_touched: uniqueFiles
    };
  }

  /**
   * Analyze consistency patterns
   */
  async analyzeConsistency(agent, days) {
    const stmt = this.db.prepareStatement(`
      SELECT
        DATE(timestamp) as date,
        COUNT(*) as changes,
        AVG(lines_added + lines_deleted) as avg_change_size
      FROM events
      WHERE project_name = ?
        AND agent = ?
        AND event_type = 'change'
        AND timestamp >= datetime('now', '-' || ? || ' days')
      GROUP BY date
      ORDER BY date
    `);

    const dailyStats = stmt.all(this.projectName, agent, days);

    if (dailyStats.length < 7) {
      return { score: 0, level: 'unknown', variance: 0 };
    }

    // Calculate variance in daily changes
    const changes = dailyStats.map(d => d.changes);
    const avgChanges = changes.reduce((a, b) => a + b, 0) / changes.length;
    const variance = changes.reduce((sum, c) => sum + Math.pow(c - avgChanges, 2), 0) / changes.length;
    const stdDev = Math.sqrt(variance);
    const coefficientOfVariation = stdDev / avgChanges;

    // Lower CV = more consistent
    const consistencyScore = Math.max(0, 100 - (coefficientOfVariation * 100));

    let level = 'moderate';
    if (consistencyScore > 70) level = 'high';
    else if (consistencyScore > 40) level = 'moderate';
    else level = 'variable';

    return {
      score: Math.round(consistencyScore),
      level,
      avg_daily_changes: avgChanges,
      std_deviation: stdDev,
      coefficient_of_variation: coefficientOfVariation,
      active_days: dailyStats.length
    };
  }

  /**
   * Analyze problem-solving approach
   */
  async analyzeProblemSolving(agent, days) {
    const stmt = this.db.prepareStatement(`
      SELECT
        filepath,
        timestamp,
        lines_added,
        lines_deleted,
        event_type
      FROM events
      WHERE project_name = ?
        AND agent = ?
        AND timestamp >= datetime('now', '-' || ? || ' days')
      ORDER BY timestamp
    `);

    const events = stmt.all(this.projectName, agent, days);

    if (events.length === 0) {
      return { approach: 'unknown', style: 'unknown', iteration_count: 0 };
    }

    // Detect iteration patterns (same file edited multiple times)
    const fileEditCounts = {};
    events.forEach(e => {
      fileEditCounts[e.filepath] = (fileEditCounts[e.filepath] || 0) + 1;
    });

    const iterativeFiles = Object.values(fileEditCounts).filter(count => count > 3).length;
    const totalFiles = Object.keys(fileEditCounts).length;
    const iterationRatio = iterativeFiles / totalFiles;

    // Batch vs incremental
    const avgChangeSize = events.reduce((sum, e) => sum + e.lines_added + e.lines_deleted, 0) / events.length;

    let approach = 'balanced';
    if (iterationRatio > 0.3 && avgChangeSize < 50) {
      approach = 'iterative';
    } else if (iterationRatio < 0.1 && avgChangeSize > 100) {
      approach = 'batch';
    }

    // Problem-solving style
    const rollbackCount = events.filter(e => e.event_type === 'rollback').length;
    const experimentalScore = (rollbackCount / events.length) * 100;

    let style = 'methodical';
    if (experimentalScore > 15) style = 'experimental';
    else if (experimentalScore < 5) style = 'careful';

    return {
      approach,
      style,
      iteration_ratio: iterationRatio,
      avg_change_size: avgChangeSize,
      experimental_score: experimentalScore,
      total_iterations: Object.values(fileEditCounts).reduce((a, b) => a + b, 0)
    };
  }

  /**
   * Analyze decision-making speed
   */
  async analyzeDecisionSpeed(agent, days) {
    const stmt = this.db.prepareStatement(`
      SELECT
        timestamp,
        filepath,
        event_type
      FROM events
      WHERE project_name = ?
        AND agent = ?
        AND timestamp >= datetime('now', '-' || ? || ' days')
      ORDER BY timestamp
    `);

    const events = stmt.all(this.projectName, agent, days);

    if (events.length < 2) {
      return { speed: 'unknown', avg_time_between_changes: 0 };
    }

    // Calculate time between changes
    const timeDiffs = [];
    for (let i = 1; i < events.length; i++) {
      const prev = new Date(events[i - 1].timestamp);
      const curr = new Date(events[i].timestamp);
      const diffMinutes = (curr - prev) / (1000 * 60);
      if (diffMinutes < 120) { // Only count if within 2 hours (same session)
        timeDiffs.push(diffMinutes);
      }
    }

    if (timeDiffs.length === 0) {
      return { speed: 'unknown', avg_time_between_changes: 0 };
    }

    const avgTimeBetween = timeDiffs.reduce((a, b) => a + b, 0) / timeDiffs.length;

    let speed = 'moderate';
    if (avgTimeBetween < 2) speed = 'rapid';
    else if (avgTimeBetween < 5) speed = 'fast';
    else if (avgTimeBetween < 10) speed = 'moderate';
    else speed = 'deliberate';

    return {
      speed,
      avg_time_between_changes: avgTimeBetween,
      total_measured_intervals: timeDiffs.length,
      fastest_interval: Math.min(...timeDiffs),
      slowest_interval: Math.max(...timeDiffs)
    };
  }

  /**
   * Analyze learning and adaptation
   */
  async analyzeAdaptation(agent, days) {
    const stmt = this.db.prepareStatement(`
      SELECT
        DATE(timestamp) as date,
        SUM(CASE WHEN event_type = 'rollback' THEN 1 ELSE 0 END) as rollbacks,
        COUNT(*) as total_changes
      FROM events
      WHERE project_name = ?
        AND agent = ?
        AND timestamp >= datetime('now', '-' || ? || ' days')
      GROUP BY date
      ORDER BY date
    `);

    const dailyStats = stmt.all(this.projectName, agent, days);

    if (dailyStats.length < 7) {
      return { score: 50, trend: 'unknown', improvement: false };
    }

    // Calculate rollback rate trend
    const recentRollbackRate = dailyStats.slice(-7).reduce((sum, d) =>
      sum + (d.rollbacks / d.total_changes), 0) / 7;

    const earlierRollbackRate = dailyStats.slice(0, 7).reduce((sum, d) =>
      sum + (d.rollbacks / d.total_changes), 0) / 7;

    const improvement = recentRollbackRate < earlierRollbackRate;
    const adaptationScore = improvement ?
      Math.min(100, 50 + ((earlierRollbackRate - recentRollbackRate) * 500)) :
      Math.max(0, 50 - ((recentRollbackRate - earlierRollbackRate) * 500));

    let trend = 'stable';
    if (improvement && (earlierRollbackRate - recentRollbackRate) > 0.05) {
      trend = 'improving';
    } else if (!improvement && (recentRollbackRate - earlierRollbackRate) > 0.05) {
      trend = 'declining';
    }

    return {
      score: Math.round(adaptationScore),
      trend,
      improvement,
      recent_rollback_rate: recentRollbackRate,
      earlier_rollback_rate: earlierRollbackRate,
      change_rate: Math.abs(recentRollbackRate - earlierRollbackRate)
    };
  }

  /**
   * Synthesize overall personality profile
   */
  synthesizeProfile(personality) {
    const {
      communication_style,
      risk_profile,
      creativity_score,
      consistency_metrics,
      problem_solving,
      decision_speed,
      adaptation_score
    } = personality;

    // Determine primary personality type
    let type = 'Balanced Developer';
    let traits = [];

    if (creativity_score.score > 70 && risk_profile.score > 60) {
      type = 'Innovative Pioneer';
      traits.push('highly creative', 'risk-taking', 'exploratory');
    } else if (consistency_metrics.score > 70 && decision_speed.speed === 'deliberate') {
      type = 'Methodical Architect';
      traits.push('consistent', 'careful', 'systematic');
    } else if (decision_speed.speed === 'rapid' && problem_solving.approach === 'iterative') {
      type = 'Agile Optimizer';
      traits.push('fast-paced', 'iterative', 'adaptive');
    } else if (risk_profile.tolerance === 'cautious' && consistency_metrics.score > 60) {
      type = 'Reliable Craftsperson';
      traits.push('cautious', 'steady', 'dependable');
    }

    // Add secondary traits
    if (communication_style.style === 'verbose') traits.push('communicative');
    if (adaptation_score.trend === 'improving') traits.push('learning');
    if (creativity_score.level === 'high') traits.push('innovative');

    return {
      type,
      traits,
      summary: this.generateSummary(type, personality),
      strengths: this.identifyStrengths(personality),
      growth_areas: this.identifyGrowthAreas(personality)
    };
  }

  /**
   * Generate personality summary
   */
  generateSummary(type, personality) {
    const summaries = {
      'Innovative Pioneer': `${personality.agent} shows high creativity and willingness to take risks. Thrives on exploring new patterns and creating novel solutions.`,
      'Methodical Architect': `${personality.agent} demonstrates consistency and careful planning. Values systematic approaches and deliberate decision-making.`,
      'Agile Optimizer': `${personality.agent} works rapidly with iterative refinement. Adapts quickly and prefers incremental improvements.`,
      'Reliable Craftsperson': `${personality.agent} exhibits steady, cautious development patterns. Focuses on reliability and consistent quality.`,
      'Balanced Developer': `${personality.agent} shows a balanced approach across all dimensions. Adapts style based on project needs.`
    };

    return summaries[type] || `${personality.agent} shows varied development patterns.`;
  }

  /**
   * Identify strengths
   */
  identifyStrengths(personality) {
    const strengths = [];

    if (personality.creativity_score.score > 70) {
      strengths.push('High creativity and innovation');
    }
    if (personality.consistency_metrics.score > 70) {
      strengths.push('Excellent consistency and reliability');
    }
    if (personality.adaptation_score.trend === 'improving') {
      strengths.push('Strong learning and adaptation');
    }
    if (personality.risk_profile.rollback_rate < 5) {
      strengths.push('Low error rate');
    }
    if (personality.communication_style.documentation_ratio > 0.1) {
      strengths.push('Good documentation habits');
    }

    return strengths.length > 0 ? strengths : ['Developing skills across multiple areas'];
  }

  /**
   * Identify growth areas
   */
  identifyGrowthAreas(personality) {
    const areas = [];

    if (personality.creativity_score.score < 40) {
      areas.push('Consider exploring more creative solutions');
    }
    if (personality.consistency_metrics.score < 40) {
      areas.push('Work on maintaining consistent patterns');
    }
    if (personality.risk_profile.rollback_rate > 15) {
      areas.push('Reduce rollback rate with more testing');
    }
    if (personality.communication_style.documentation_ratio < 0.05) {
      areas.push('Increase documentation coverage');
    }
    if (personality.adaptation_score.trend === 'declining') {
      areas.push('Focus on learning from previous iterations');
    }

    return areas.length > 0 ? areas : ['Maintain current strong performance'];
  }

  /**
   * Save personality insight to database
   */
  savePersonalityInsight(agent, personality) {
    try {
      const today = new Date().toISOString().split('T')[0];

      const stmt = this.db.prepareStatement(`
        INSERT INTO claude_personality_insights (
          project_name, agent, analysis_date,
          personality_type, communication_style, risk_tolerance,
          creativity_score, consistency_score, problem_solving_approach,
          decision_speed, adaptation_score, insights, recommendations
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(project_name, agent, analysis_date)
        DO UPDATE SET
          personality_type = excluded.personality_type,
          communication_style = excluded.communication_style,
          risk_tolerance = excluded.risk_tolerance,
          creativity_score = excluded.creativity_score,
          consistency_score = excluded.consistency_score,
          problem_solving_approach = excluded.problem_solving_approach,
          decision_speed = excluded.decision_speed,
          adaptation_score = excluded.adaptation_score,
          insights = excluded.insights,
          recommendations = excluded.recommendations
      `);

      stmt.run(
        this.projectName,
        agent,
        today,
        personality.overall_profile.type,
        personality.communication_style.style,
        personality.risk_profile.tolerance,
        personality.creativity_score.score,
        personality.consistency_metrics.score,
        personality.problem_solving.approach,
        personality.decision_speed.speed,
        personality.adaptation_score.score,
        JSON.stringify(personality),
        JSON.stringify(personality.overall_profile.growth_areas)
      );

      logger.debug('Personality insight saved', {
        service: 'claude-personality',
        agent,
        type: personality.overall_profile.type
      });
    } catch (error) {
      logger.error('Failed to save personality insight', {
        service: 'claude-personality',
        error: error.message
      });
    }
  }

  /**
   * Get personality history
   */
  getPersonalityHistory(agent, days = 90) {
    try {
      const stmt = this.db.prepareStatement(`
        SELECT * FROM claude_personality_insights
        WHERE project_name = ?
          AND agent = ?
          AND analysis_date >= date('now', '-' || ? || ' days')
        ORDER BY analysis_date DESC
      `);

      const insights = stmt.all(this.projectName, agent, days);

      return insights.map(i => ({
        ...i,
        insights: i.insights ? JSON.parse(i.insights) : null,
        recommendations: i.recommendations ? JSON.parse(i.recommendations) : []
      }));
    } catch (error) {
      logger.error('Failed to get personality history', {
        service: 'claude-personality',
        error: error.message
      });
      return [];
    }
  }

  /**
   * Get latest personality profile
   */
  getLatestProfile(agent) {
    try {
      const stmt = this.db.prepareStatement(`
        SELECT * FROM claude_personality_insights
        WHERE project_name = ?
          AND agent = ?
        ORDER BY analysis_date DESC
        LIMIT 1
      `);

      const profile = stmt.get(this.projectName, agent);

      if (!profile) return null;

      return {
        ...profile,
        insights: profile.insights ? JSON.parse(profile.insights) : null,
        recommendations: profile.recommendations ? JSON.parse(profile.recommendations) : []
      };
    } catch (error) {
      logger.error('Failed to get latest profile', {
        service: 'claude-personality',
        error: error.message
      });
      return null;
    }
  }
}
