/**
 * Contextual Observer
 *
 * Notices patterns in work and offers timely, helpful observations.
 * Detects struggles, flow states, and work style patterns.
 * Provides supportive, personality-driven messages.
 */

import { logger } from '../utils/logger.js';

export class ContextualObserver {
  constructor(projectDb) {
    this.db = projectDb;
  }

  /**
   * Record a user pattern
   * @param {string} patternType - Type of pattern (file_edit, work_style, time_pattern)
   * @param {string} patternKey - Unique key for this pattern
   * @param {string} patternValue - Pattern data
   */
  recordPattern(patternType, patternKey, patternValue) {
    try {
      const projectName = 'raven';
      const now = new Date().toISOString();

      const stmt = this.db.prepareStatement(`
        INSERT INTO user_patterns (project_name, pattern_type, pattern_key, pattern_value, frequency, last_seen)
        VALUES (?, ?, ?, ?, 1, ?)
        ON CONFLICT(project_name, pattern_type, pattern_key) DO UPDATE SET
          frequency = frequency + 1,
          last_seen = ?,
          pattern_value = ?
      `);

      stmt.run(projectName, patternType, patternKey, patternValue, now, now, patternValue);
    } catch (error) {
      logger.error('Failed to record pattern:', error);
    }
  }

  /**
   * Detect if user is editing same file repeatedly
   * @param {string} filepath - Current file being edited
   * @returns {object|null} Observation or null
   */
  detectRepeatedEdit(filepath) {
    try {
      // Get recent edits to this file in last hour
      const stmt = this.db.prepareStatement(`
        SELECT COUNT(*) as edit_count
        FROM events
        WHERE filepath = ?
          AND timestamp >= datetime('now', '-1 hour')
      `);

      const result = stmt.get(filepath);
      const editCount = result?.edit_count || 0;

      if (editCount >= 3) {
        return {
          type: 'repeated_edit',
          message: `👀 Third time editing ${filepath.split('/').pop()} - tricky bug hiding? Caw?`,
          severity: editCount >= 5 ? 'high' : 'medium',
          data: { filepath, editCount }
        };
      }

      return null;
    } catch (error) {
      logger.error('Failed to detect repeated edit:', error);
      return null;
    }
  }

  /**
   * Detect high productivity burst
   * @returns {object|null} Observation or null
   */
  detectProductivityBurst() {
    try {
      // Count changes in last 30 minutes
      const stmt = this.db.prepareStatement(`
        SELECT COUNT(*) as recent_changes
        FROM events
        WHERE timestamp >= datetime('now', '-30 minutes')
      `);

      const result = stmt.get();
      const recentChanges = result?.recent_changes || 0;

      if (recentChanges >= 15) {
        return {
          type: 'productivity_burst',
          message: `${recentChanges} changes in 30 minutes! You're on fire today! Caw Caw!`,
          severity: 'positive',
          data: { changeCount: recentChanges }
        };
      }

      return null;
    } catch (error) {
      logger.error('Failed to detect productivity burst:', error);
      return null;
    }
  }

  /**
   * Detect rollback pattern (user is struggling)
   * @returns {object|null} Observation or null
   */
  detectStrugglePattern() {
    try {
      // Count rollbacks today
      const stmt = this.db.prepareStatement(`
        SELECT COUNT(*) as rollback_count
        FROM rollbacks
        WHERE date(timestamp) = date('now')
      `);

      const result = stmt.get();
      const rollbackCount = result?.rollback_count || 0;

      if (rollbackCount >= 4) {
        return {
          type: 'struggle_pattern',
          message:
            "Fourth rollback today - something's not clicking. Need a fresh perspective? Caw?",
          severity: 'medium',
          data: { rollbackCount }
        };
      }

      return null;
    } catch (error) {
      logger.error('Failed to detect struggle pattern:', error);
      return null;
    }
  }

  /**
   * Detect work style patterns (what day/time user does what)
   * @returns {Array} List of detected patterns
   */
  detectWorkStylePatterns() {
    try {
      const patterns = [];
      const projectName = 'raven';

      // Check for day-of-week patterns
      const stmt = this.db.prepareStatement(`
        SELECT pattern_key, pattern_value, frequency
        FROM user_patterns
        WHERE project_name = ?
          AND pattern_type = 'day_pattern'
          AND frequency >= 3
        ORDER BY frequency DESC
        LIMIT 5
      `);

      const dayPatterns = stmt.all(projectName);
      dayPatterns.forEach(p => {
        patterns.push({
          type: 'work_style',
          message: `You ${p.pattern_value} on ${p.pattern_key}s - interesting pattern! Caw!`,
          severity: 'info',
          data: p
        });
      });

      return patterns;
    } catch (error) {
      logger.error('Failed to detect work style patterns:', error);
      return [];
    }
  }

  /**
   * Get all current observations
   * @param {string} filepath - Current file being edited
   * @returns {Array} List of observations
   */
  getObservations(filepath = null) {
    const observations = [];

    if (filepath) {
      const repeatedEdit = this.detectRepeatedEdit(filepath);
      if (repeatedEdit) observations.push(repeatedEdit);
    }

    const burst = this.detectProductivityBurst();
    if (burst) observations.push(burst);

    const struggle = this.detectStrugglePattern();
    if (struggle) observations.push(struggle);

    return observations;
  }

  /**
   * Record day-of-week pattern
   * @param {string} activity - What the user is doing
   */
  recordDayPattern(activity) {
    const dayOfWeek = [
      'Sunday',
      'Monday',
      'Tuesday',
      'Wednesday',
      'Thursday',
      'Friday',
      'Saturday'
    ][new Date().getDay()];
    this.recordPattern('day_pattern', dayOfWeek, activity);
  }

  /**
   * Get motivational message based on recent activity
   * @returns {string} Motivational message
   */
  getMotivationalMessage() {
    const messages = [
      "You've been at this for 4 hours straight. Break time? Caw!",
      'That rollback was smart - better to start fresh! Caw!',
      'Zero syntax errors today! Clean flying! Caw Caw!',
      "Rough session? Hey, bugs happen. You'll get 'em tomorrow! Caw caw.",
      'You think better after a break - saw that pattern! Caw!',
      'You write tests BEFORE features now - nice evolution! Caw!'
    ];

    return messages[Math.floor(Math.random() * messages.length)];
  }
}

export default ContextualObserver;
