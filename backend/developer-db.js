/**
 * Developer Persona Database
 *
 * Global database for tracking developer behavior, patterns, and interactions
 * across ALL projects. This data is used to build a comprehensive developer
 * persona for future RavenAI training.
 *
 * Unlike project-specific databases, this tracks:
 * - Agent interactions across all projects
 * - Global code patterns and preferences
 * - Workflow and productivity patterns
 * - Error recovery approaches
 * - Context switching behavior
 */

import Database from 'better-sqlite3';
// import { basename } from 'path';
import { logger } from './utils/logger.js';

class DeveloperDB {
  /** @type {import('better-sqlite3').Database} */
  db;

  constructor(dbPath) {
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.initializeTables();
    logger.info('✅ Developer persona database initialized');
  }

  initializeTables() {
    // Agent Interactions - THE GOLD MINE for AI training
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS agent_interactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT NOT NULL,
        project TEXT,
        agent_name TEXT,
        agent_version TEXT,
        event_type TEXT,

        prompt TEXT,
        response TEXT,
        context TEXT,

        code_before TEXT,
        code_after TEXT,
        diff TEXT,

        accepted INTEGER DEFAULT 0,
        modified INTEGER DEFAULT 0,
        rejected INTEGER DEFAULT 0,

        file_path TEXT,
        language TEXT,
        lines_changed INTEGER,
        session_id TEXT,

        prompt_type TEXT,
        complexity_score REAL,
        success_score REAL
      )
    `);

    // Code Patterns - Learn coding style
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS code_patterns (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT NOT NULL,
        project TEXT,
        language TEXT,
        file_type TEXT,

        edit_type TEXT,
        lines_added INTEGER,
        lines_removed INTEGER,
        complexity_change REAL,

        indent_style TEXT,
        indent_size INTEGER,
        naming_convention TEXT,
        comment_density REAL,

        pattern_type TEXT,
        uses_types INTEGER DEFAULT 0,
        uses_tests INTEGER DEFAULT 0,

        commit_message TEXT,
        committed INTEGER DEFAULT 0,
        time_to_commit INTEGER,

        tested_before_commit INTEGER DEFAULT 0,
        linted_before_commit INTEGER DEFAULT 0
      )
    `);

    // Workflow Events - Work patterns and rhythms
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS workflow_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT NOT NULL,
        event_type TEXT,

        from_project TEXT,
        to_project TEXT,
        switch_reason TEXT,

        focus_duration INTEGER,
        interruptions INTEGER,

        productivity_score REAL,
        code_velocity REAL,
        error_rate REAL,

        hour_of_day INTEGER,
        day_of_week INTEGER,
        session_length INTEGER
      )
    `);

    // Error Recovery - Debugging patterns
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS error_recovery (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT NOT NULL,
        project TEXT,

        error_type TEXT,
        error_message TEXT,
        error_stack TEXT,
        file_path TEXT,
        line_number INTEGER,

        solution_approach TEXT,
        fix_description TEXT,
        code_before TEXT,
        code_after TEXT,

        time_to_detect INTEGER,
        time_to_fix INTEGER,
        attempts INTEGER,

        assistance_used TEXT,
        search_queries TEXT,

        repeated_error INTEGER DEFAULT 0,
        previous_occurrences INTEGER DEFAULT 0
      )
    `);

    // Developer Preferences - Inferred over time
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS developer_preferences (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        category TEXT,
        preference_key TEXT,
        preference_value TEXT,

        confidence_score REAL,
        observation_count INTEGER DEFAULT 1,

        first_observed TEXT,
        last_observed TEXT,
        changed_from TEXT,

        applies_to_languages TEXT,
        applies_to_projects TEXT,

        UNIQUE(category, preference_key)
      )
    `);

    // Context Switches - Multi-project workflow
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS context_switches (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT NOT NULL,
        from_project TEXT,
        to_project TEXT,

        trigger_type TEXT,
        trigger_details TEXT,

        from_activity TEXT,
        to_activity TEXT,
        files_left_open INTEGER,
        unsaved_changes INTEGER DEFAULT 0,

        returned INTEGER DEFAULT 0,
        return_time INTEGER,
        completed_task INTEGER DEFAULT 0
      )
    `);

    // Create indexes for performance
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_agent_timestamp ON agent_interactions(timestamp);
      CREATE INDEX IF NOT EXISTS idx_agent_project ON agent_interactions(project);
      CREATE INDEX IF NOT EXISTS idx_agent_type ON agent_interactions(event_type);

      CREATE INDEX IF NOT EXISTS idx_code_timestamp ON code_patterns(timestamp);
      CREATE INDEX IF NOT EXISTS idx_code_language ON code_patterns(language);
      CREATE INDEX IF NOT EXISTS idx_code_project ON code_patterns(project);

      CREATE INDEX IF NOT EXISTS idx_workflow_timestamp ON workflow_events(timestamp);
      CREATE INDEX IF NOT EXISTS idx_workflow_type ON workflow_events(event_type);

      CREATE INDEX IF NOT EXISTS idx_error_timestamp ON error_recovery(timestamp);
      CREATE INDEX IF NOT EXISTS idx_error_type ON error_recovery(error_type);

      CREATE INDEX IF NOT EXISTS idx_context_timestamp ON context_switches(timestamp);
    `);
  }

  // ==================== INSERT METHODS ====================

  /**
   * Log agent interaction (prompts, responses, edits)
   */
  logAgentInteraction(data) {
    const stmt = this.db.prepare(`
      INSERT INTO agent_interactions (
        timestamp, project, agent_name, agent_version, event_type,
        prompt, response, context,
        code_before, code_after, diff,
        accepted, modified, rejected,
        file_path, language, lines_changed, session_id,
        prompt_type, complexity_score, success_score
      ) VALUES (
        @timestamp, @project, @agent_name, @agent_version, @event_type,
        @prompt, @response, @context,
        @code_before, @code_after, @diff,
        @accepted, @modified, @rejected,
        @file_path, @language, @lines_changed, @session_id,
        @prompt_type, @complexity_score, @success_score
      )
    `);

    return stmt.run({
      timestamp: data.timestamp || new Date().toISOString(),
      project: data.project || null,
      agent_name: data.agent_name || 'unknown',
      agent_version: data.agent_version || null,
      event_type: data.event_type || 'interaction',
      prompt: data.prompt || null,
      response: data.response || null,
      context: data.context || null,
      code_before: data.code_before || null,
      code_after: data.code_after || null,
      diff: data.diff || null,
      accepted: data.accepted ? 1 : 0,
      modified: data.modified ? 1 : 0,
      rejected: data.rejected ? 1 : 0,
      file_path: data.file_path || null,
      language: data.language || null,
      lines_changed: data.lines_changed || 0,
      session_id: data.session_id || null,
      prompt_type: data.prompt_type || null,
      complexity_score: data.complexity_score || null,
      success_score: data.success_score || null
    }).lastInsertRowid;
  }

  /**
   * Log code pattern (edits, style, structure)
   */
  logCodePattern(data) {
    const stmt = this.db.prepare(`
      INSERT INTO code_patterns (
        timestamp, project, language, file_type,
        edit_type, lines_added, lines_removed, complexity_change,
        indent_style, indent_size, naming_convention, comment_density,
        pattern_type, uses_types, uses_tests,
        commit_message, committed, time_to_commit,
        tested_before_commit, linted_before_commit
      ) VALUES (
        @timestamp, @project, @language, @file_type,
        @edit_type, @lines_added, @lines_removed, @complexity_change,
        @indent_style, @indent_size, @naming_convention, @comment_density,
        @pattern_type, @uses_types, @uses_tests,
        @commit_message, @committed, @time_to_commit,
        @tested_before_commit, @linted_before_commit
      )
    `);

    return stmt.run({
      timestamp: data.timestamp || new Date().toISOString(),
      project: data.project || null,
      language: data.language || null,
      file_type: data.file_type || null,
      edit_type: data.edit_type || 'modify',
      lines_added: data.lines_added || 0,
      lines_removed: data.lines_removed || 0,
      complexity_change: data.complexity_change || 0,
      indent_style: data.indent_style || null,
      indent_size: data.indent_size || null,
      naming_convention: data.naming_convention || null,
      comment_density: data.comment_density || null,
      pattern_type: data.pattern_type || null,
      uses_types: data.uses_types ? 1 : 0,
      uses_tests: data.uses_tests ? 1 : 0,
      commit_message: data.commit_message || null,
      committed: data.committed ? 1 : 0,
      time_to_commit: data.time_to_commit || null,
      tested_before_commit: data.tested_before_commit ? 1 : 0,
      linted_before_commit: data.linted_before_commit ? 1 : 0
    }).lastInsertRowid;
  }

  /**
   * Log workflow event (focus, breaks, context switches)
   */
  logWorkflowEvent(data) {
    const stmt = this.db.prepare(`
      INSERT INTO workflow_events (
        timestamp, event_type,
        from_project, to_project, switch_reason,
        focus_duration, interruptions,
        productivity_score, code_velocity, error_rate,
        hour_of_day, day_of_week, session_length
      ) VALUES (
        @timestamp, @event_type,
        @from_project, @to_project, @switch_reason,
        @focus_duration, @interruptions,
        @productivity_score, @code_velocity, @error_rate,
        @hour_of_day, @day_of_week, @session_length
      )
    `);

    const timestamp = data.timestamp || new Date().toISOString();
    const date = new Date(timestamp);

    return stmt.run({
      timestamp,
      event_type: data.event_type || 'activity',
      from_project: data.from_project || null,
      to_project: data.to_project || null,
      switch_reason: data.switch_reason || null,
      focus_duration: data.focus_duration || null,
      interruptions: data.interruptions || 0,
      productivity_score: data.productivity_score || null,
      code_velocity: data.code_velocity || null,
      error_rate: data.error_rate || null,
      hour_of_day: date.getHours(),
      day_of_week: date.getDay(),
      session_length: data.session_length || null
    }).lastInsertRowid;
  }

  /**
   * Log error and recovery attempt
   */
  logErrorRecovery(data) {
    const stmt = this.db.prepare(`
      INSERT INTO error_recovery (
        timestamp, project,
        error_type, error_message, error_stack, file_path, line_number,
        solution_approach, fix_description, code_before, code_after,
        time_to_detect, time_to_fix, attempts,
        assistance_used, search_queries,
        repeated_error, previous_occurrences
      ) VALUES (
        @timestamp, @project,
        @error_type, @error_message, @error_stack, @file_path, @line_number,
        @solution_approach, @fix_description, @code_before, @code_after,
        @time_to_detect, @time_to_fix, @attempts,
        @assistance_used, @search_queries,
        @repeated_error, @previous_occurrences
      )
    `);

    return stmt.run({
      timestamp: data.timestamp || new Date().toISOString(),
      project: data.project || null,
      error_type: data.error_type || 'Error',
      error_message: data.error_message || null,
      error_stack: data.error_stack || null,
      file_path: data.file_path || null,
      line_number: data.line_number || null,
      solution_approach: data.solution_approach || null,
      fix_description: data.fix_description || null,
      code_before: data.code_before || null,
      code_after: data.code_after || null,
      time_to_detect: data.time_to_detect || null,
      time_to_fix: data.time_to_fix || null,
      attempts: data.attempts || 1,
      assistance_used: data.assistance_used || null,
      search_queries: data.search_queries ? JSON.stringify(data.search_queries) : null,
      repeated_error: data.repeated_error ? 1 : 0,
      previous_occurrences: data.previous_occurrences || 0
    }).lastInsertRowid;
  }

  /**
   * Update or insert developer preference
   */
  updatePreference(category, key, value, metadata = {}) {
    const stmt = this.db.prepare(`
      INSERT INTO developer_preferences (
        category, preference_key, preference_value,
        confidence_score, observation_count,
        first_observed, last_observed, changed_from,
        applies_to_languages, applies_to_projects
      ) VALUES (
        @category, @preference_key, @preference_value,
        @confidence_score, 1,
        @timestamp, @timestamp, NULL,
        @applies_to_languages, @applies_to_projects
      )
      ON CONFLICT(category, preference_key) DO UPDATE SET
        preference_value = @preference_value,
        observation_count = observation_count + 1,
        confidence_score = @confidence_score,
        last_observed = @timestamp,
        changed_from = CASE
          WHEN preference_value != @preference_value THEN preference_value
          ELSE changed_from
        END
    `);

    return stmt.run({
      category,
      preference_key: key,
      preference_value: value,
      confidence_score: metadata.confidence_score || 0.5,
      timestamp: new Date().toISOString(),
      applies_to_languages: metadata.applies_to_languages ? JSON.stringify(metadata.applies_to_languages) : null,
      applies_to_projects: metadata.applies_to_projects ? JSON.stringify(metadata.applies_to_projects) : null
    });
  }

  /**
   * Log context switch between projects
   */
  logContextSwitch(data) {
    const stmt = this.db.prepare(`
      INSERT INTO context_switches (
        timestamp, from_project, to_project,
        trigger_type, trigger_details,
        from_activity, to_activity, files_left_open, unsaved_changes,
        returned, return_time, completed_task
      ) VALUES (
        @timestamp, @from_project, @to_project,
        @trigger_type, @trigger_details,
        @from_activity, @to_activity, @files_left_open, @unsaved_changes,
        @returned, @return_time, @completed_task
      )
    `);

    return stmt.run({
      timestamp: data.timestamp || new Date().toISOString(),
      from_project: data.from_project || null,
      to_project: data.to_project || null,
      trigger_type: data.trigger_type || 'manual',
      trigger_details: data.trigger_details || null,
      from_activity: data.from_activity || null,
      to_activity: data.to_activity || null,
      files_left_open: data.files_left_open || 0,
      unsaved_changes: data.unsaved_changes ? 1 : 0,
      returned: data.returned ? 1 : 0,
      return_time: data.return_time || null,
      completed_task: data.completed_task ? 1 : 0
    }).lastInsertRowid;
  }

  // ==================== QUERY METHODS ====================

  /**
   * Get recent agent interactions
   */
  getRecentInteractions(limit = 50, project = null) {
    let query = 'SELECT * FROM agent_interactions';
    const params = [];

    if (project) {
      query += ' WHERE project = ?';
      params.push(project);
    }

    query += ' ORDER BY timestamp DESC LIMIT ?';
    params.push(limit);

    return this.db.prepare(query).all(...params);
  }

  /**
   * Get coding patterns for a language
   */
  getCodingPatterns(language = null, limit = 100) {
    let query = 'SELECT * FROM code_patterns';
    const params = [];

    if (language) {
      query += ' WHERE language = ?';
      params.push(language);
    }

    query += ' ORDER BY timestamp DESC LIMIT ?';
    params.push(limit);

    return this.db.prepare(query).all(...params);
  }

  /**
   * Get workflow statistics
   */
  getWorkflowStats(days = 30) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);

    return this.db.prepare(`
      SELECT
        event_type,
        COUNT(*) as count,
        AVG(productivity_score) as avg_productivity,
        AVG(code_velocity) as avg_velocity
      FROM workflow_events
      WHERE timestamp > ?
      GROUP BY event_type
    `).all(cutoff.toISOString());
  }

  /**
   * Get all developer preferences
   */
  getAllPreferences() {
    return this.db.prepare(`
      SELECT * FROM developer_preferences
      ORDER BY confidence_score DESC, observation_count DESC
    `).all();
  }

  /**
   * Get context switch statistics
   */
  getContextSwitchStats(days = 30) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);

    return this.db.prepare(`
      SELECT
        from_project,
        to_project,
        COUNT(*) as switch_count,
        AVG(return_time) as avg_return_time
      FROM context_switches
      WHERE timestamp > ?
      GROUP BY from_project, to_project
      ORDER BY switch_count DESC
    `).all(cutoff.toISOString());
  }

  /**
   * Close database connection
   */
  close() {
    this.db.close();
  }
}

export default DeveloperDB;
