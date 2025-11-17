/**
 * Developer Insights Service
 * Tracks developer persona, productivity patterns, and interaction analytics
 */

import { logger } from '../utils/logger.js';

export class DeveloperInsightsService {
  constructor(db) {
    this.db = db;
    this.initializeSchema();
  }

  /**
   * Initialize database tables for developer insights
   */
  initializeSchema() {
    // Developer statistics table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS developer_stats (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_name TEXT,
        timestamp TEXT NOT NULL,
        agent_interactions INTEGER DEFAULT 0,
        code_patterns INTEGER DEFAULT 0,
        workflow_events INTEGER DEFAULT 0,
        error_recoveries INTEGER DEFAULT 0,
        context_switches INTEGER DEFAULT 0,
        preferences_learned INTEGER DEFAULT 0,
        primary_language TEXT,
        secondary_languages TEXT,
        hourly_activity TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Developer interactions table (detailed interaction log)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS developer_interactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_name TEXT,
        timestamp TEXT NOT NULL,
        agent_name TEXT,
        interaction_type TEXT,
        file_path TEXT,
        language TEXT,
        duration_ms INTEGER,
        lines_changed INTEGER,
        context TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Code patterns table (detected patterns)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS developer_patterns (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_name TEXT,
        timestamp TEXT NOT NULL,
        pattern_type TEXT,
        pattern_name TEXT,
        frequency INTEGER DEFAULT 1,
        files_affected TEXT,
        description TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Indexes for performance
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_dev_stats_timestamp ON developer_stats(timestamp DESC);
      CREATE INDEX IF NOT EXISTS idx_dev_stats_project ON developer_stats(project_name);
      CREATE INDEX IF NOT EXISTS idx_dev_interactions_timestamp ON developer_interactions(timestamp DESC);
      CREATE INDEX IF NOT EXISTS idx_dev_interactions_project ON developer_interactions(project_name);
      CREATE INDEX IF NOT EXISTS idx_dev_interactions_agent ON developer_interactions(agent_name);
      CREATE INDEX IF NOT EXISTS idx_dev_patterns_timestamp ON developer_patterns(timestamp DESC);
      CREATE INDEX IF NOT EXISTS idx_dev_patterns_project ON developer_patterns(project_name);
    `);

    logger.info('Developer insights schema initialized');
  }

  /**
   * Get developer statistics
   * @param {string} projectName - Project to filter by (optional)
   * @param {number} days - Number of days to look back (default: 7)
   */
  getDeveloperStats(projectName = null, days = 7) {
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    // Calculate stats from agent_events and events
    const agentInteractions = this.db
      .prepare(
        `
      SELECT COUNT(*) as count
      FROM agent_events
      WHERE timestamp > ?
    `
      )
      .get([cutoff]);

    const codePatterns = this.db
      .prepare(
        `
      SELECT COUNT(DISTINCT filepath) as count
      FROM events
      WHERE timestamp > ?
    `
      )
      .get([cutoff]);

    const workflowEvents = this.db
      .prepare(
        `
      SELECT COUNT(*) as count
      FROM events
      WHERE timestamp > ?
    `
      )
      .get([cutoff]);

    // Language breakdown from file extensions
    const languages = this.db
      .prepare(
        `
      SELECT
        CASE
          WHEN filepath LIKE '%.js' THEN 'JavaScript'
          WHEN filepath LIKE '%.ts' THEN 'TypeScript'
          WHEN filepath LIKE '%.py' THEN 'Python'
          WHEN filepath LIKE '%.java' THEN 'Java'
          WHEN filepath LIKE '%.go' THEN 'Go'
          WHEN filepath LIKE '%.rs' THEN 'Rust'
          WHEN filepath LIKE '%.rb' THEN 'Ruby'
          WHEN filepath LIKE '%.php' THEN 'PHP'
          WHEN filepath LIKE '%.c' OR filepath LIKE '%.cpp' THEN 'C/C++'
          WHEN filepath LIKE '%.svelte' THEN 'Svelte'
          WHEN filepath LIKE '%.vue' THEN 'Vue'
          WHEN filepath LIKE '%.jsx' OR filepath LIKE '%.tsx' THEN 'React'
          ELSE 'Other'
        END as language,
        COUNT(*) as count
      FROM events
      WHERE timestamp > ?
      GROUP BY language
      ORDER BY count DESC
      LIMIT 10
    `
      )
      .all([cutoff]);

    // Hourly activity heatmap
    const hourlyActivity = this.db
      .prepare(
        `
      SELECT
        CAST(strftime('%H', timestamp) AS INTEGER) as hour,
        COUNT(*) as count
      FROM events
      WHERE timestamp > ?
      GROUP BY hour
      ORDER BY hour
    `
      )
      .all([cutoff]);

    // Convert hourly activity to 24-hour array
    const hourlyMap = Array(24).fill(0);
    hourlyActivity.forEach(({ hour, count }) => {
      hourlyMap[hour] = count;
    });

    return {
      agent_interactions: agentInteractions.count,
      code_patterns: codePatterns.count,
      workflow_events: workflowEvents.count,
      error_recoveries: 0, // TODO: Calculate from error logs
      context_switches: 0, // TODO: Calculate from file switches
      preferences_learned: 0, // TODO: Track user preferences
      languages,
      hourly_activity: hourlyMap,
      period_days: days,
      project: projectName || 'all'
    };
  }

  /**
   * Get recent developer interactions
   * @param {string} projectName - Project to filter by (optional)
   * @param {number} limit - Maximum number of interactions to return
   */
  getDeveloperInteractions(projectName = null, limit = 20) {
    const interactions = this.db
      .prepare(
        `
      SELECT
        id,
        timestamp,
        agent as agent_name,
        event_type as interaction_type,
        file as file_path,
        lines_changed,
        duration_ms,
        message as context
      FROM agent_events
      WHERE 1=1
      ORDER BY timestamp DESC
      LIMIT ?
    `
      )
      .all([limit]);

    // Add language detection
    return interactions.map(interaction => ({
      ...interaction,
      language: this.detectLanguage(interaction.file_path)
    }));
  }

  /**
   * Get detected code patterns
   * @param {string} projectName - Project to filter by (optional)
   * @param {number} limit - Maximum number of patterns to return
   */
  getDeveloperPatterns(projectName = null, limit = 20) {
    // Detect patterns from events
    const patterns = this.db
      .prepare(
        `
      SELECT
        change_type as pattern_type,
        filepath as pattern_name,
        COUNT(*) as frequency,
        MAX(timestamp) as timestamp,
        GROUP_CONCAT(DISTINCT filepath) as files_affected
      FROM events
      WHERE 1=1
      GROUP BY filepath
      HAVING COUNT(*) > 1
      ORDER BY frequency DESC, timestamp DESC
      LIMIT ?
    `
      )
      .all([limit]);

    return patterns.map(pattern => ({
      ...pattern,
      description: this.getPatternDescription(pattern)
    }));
  }

  /**
   * Detect language from file path
   */
  detectLanguage(filepath) {
    if (!filepath) return 'Unknown';
    if (filepath.endsWith('.js')) return 'JavaScript';
    if (filepath.endsWith('.ts')) return 'TypeScript';
    if (filepath.endsWith('.py')) return 'Python';
    if (filepath.endsWith('.java')) return 'Java';
    if (filepath.endsWith('.go')) return 'Go';
    if (filepath.endsWith('.rs')) return 'Rust';
    if (filepath.endsWith('.rb')) return 'Ruby';
    if (filepath.endsWith('.php')) return 'PHP';
    if (filepath.endsWith('.c') || filepath.endsWith('.cpp')) return 'C/C++';
    if (filepath.endsWith('.svelte')) return 'Svelte';
    if (filepath.endsWith('.vue')) return 'Vue';
    if (filepath.endsWith('.jsx') || filepath.endsWith('.tsx')) return 'React';
    return 'Other';
  }

  /**
   * Generate pattern description
   */
  getPatternDescription(pattern) {
    const { pattern_type, frequency, pattern_name } = pattern;
    const file = pattern_name.split('/').pop();

    if (frequency > 10) {
      return `Frequently modified file: ${file} (${frequency} times)`;
    } else if (frequency > 5) {
      return `Actively developed: ${file} (${frequency} edits)`;
    } else {
      return `Recent activity on: ${file}`;
    }
  }

  /**
   * Record a new interaction (called from agent telemetry)
   */
  recordInteraction(interaction) {
    try {
      const stmt = this.db.prepare(`
        INSERT INTO developer_interactions
        (project_name, timestamp, agent_name, interaction_type, file_path, language, duration_ms, lines_changed, context)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        interaction.project_name,
        interaction.timestamp || new Date().toISOString(),
        interaction.agent_name,
        interaction.interaction_type,
        interaction.file_path,
        this.detectLanguage(interaction.file_path),
        interaction.duration_ms || 0,
        interaction.lines_changed || 0,
        interaction.context || ''
      );

      return true;
    } catch (error) {
      logger.error('Error recording developer interaction:', error);
      return false;
    }
  }

  /**
   * Update developer stats (called periodically)
   */
  updateStats(projectName = null) {
    const stats = this.getDeveloperStats(projectName, 7);

    try {
      const stmt = this.db.prepare(`
        INSERT INTO developer_stats
        (project_name, timestamp, agent_interactions, code_patterns, workflow_events,
         error_recoveries, context_switches, preferences_learned, primary_language,
         secondary_languages, hourly_activity)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        projectName || 'all',
        new Date().toISOString(),
        stats.agent_interactions,
        stats.code_patterns,
        stats.workflow_events,
        stats.error_recoveries,
        stats.context_switches,
        stats.preferences_learned,
        stats.languages[0]?.language || 'Unknown',
        JSON.stringify(stats.languages.slice(1, 5)),
        JSON.stringify(stats.hourly_activity)
      );

      return true;
    } catch (error) {
      logger.error('Error updating developer stats:', error);
      return false;
    }
  }
}
