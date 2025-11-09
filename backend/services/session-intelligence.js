/**
 * Session Intelligence
 *
 * Tracks session duration, quality, flow states, and fatigue.
 * Generates session stories and provides break reminders.
 * Monitors productivity and code quality trends.
 */

import { logger } from '../utils/logger.js';

export class SessionIntelligence {
  constructor(projectDb) {
    this.db = projectDb;
    this.sessionStartTimes = new Map();
  }

  /**
   * Start tracking a session
   * @param {string} sessionId - Session identifier
   */
  startSession(sessionId) {
    const projectName = 'raven';
    const now = new Date().toISOString();

    try {
      const stmt = this.db.prepareStatement(`
        INSERT INTO session_context (session_id, project_name, created_at, updated_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(session_id) DO UPDATE SET updated_at = ?
      `);

      stmt.run(sessionId, projectName, now, now, now);
      this.sessionStartTimes.set(sessionId, Date.now());
    } catch (error) {
      logger.error('Failed to start session:', error);
    }
  }

  /**
   * Update session context
   * @param {string} sessionId - Session identifier
   * @param {object} context - Session context data
   */
  updateSessionContext(sessionId, context) {
    try {
      const now = new Date().toISOString();
      const duration = this.getSessionDuration(sessionId);

      const stmt = this.db.prepareStatement(`
        UPDATE session_context
        SET last_file = ?,
            last_line = ?,
            working_on = ?,
            todos = ?,
            notes = ?,
            duration_seconds = ?,
            updated_at = ?
        WHERE session_id = ?
      `);

      stmt.run(
        context.lastFile || null,
        context.lastLine || null,
        context.workingOn || null,
        context.todos ? JSON.stringify(context.todos) : null,
        context.notes || null,
        Math.floor(duration / 1000),
        now,
        sessionId
      );
    } catch (error) {
      logger.error('Failed to update session context:', error);
    }
  }

  /**
   * Get session duration in milliseconds
   * @param {string} sessionId - Session identifier
   * @returns {number} Duration in ms
   */
  getSessionDuration(sessionId) {
    const startTime = this.sessionStartTimes.get(sessionId);
    if (!startTime) return 0;
    return Date.now() - startTime;
  }

  /**
   * Get session metrics
   * @param {string} sessionId - Session identifier
   * @returns {object} Session metrics
   */
  getSessionMetrics(sessionId) {
    try {
      const duration = this.getSessionDuration(sessionId);
      const durationHours = duration / (1000 * 60 * 60);

      // Get session events
      const eventsStmt = this.db.prepareStatement(`
        SELECT COUNT(*) as total_changes,
               SUM(CASE WHEN is_anomaly = 1 THEN 1 ELSE 0 END) as anomalies
        FROM events
        WHERE session_id = ?
      `);
      const events = eventsStmt.get(sessionId);

      // Get session rollbacks
      const rollbacksStmt = this.db.prepareStatement(`
        SELECT COUNT(*) as rollback_count
        FROM rollbacks r
        JOIN events e ON r.event_id = e.id
        WHERE e.session_id = ?
      `);
      const rollbacks = rollbacksStmt.get(sessionId);

      const totalChanges = events?.total_changes || 0;
      const changesPerHour = durationHours > 0 ? totalChanges / durationHours : 0;
      const rollbackRate = totalChanges > 0 ? (rollbacks?.rollback_count || 0) / totalChanges : 0;

      // Calculate focus score (0-100)
      let focusScore = 50;
      if (changesPerHour > 20) focusScore += 20; // High productivity
      if (rollbackRate < 0.1) focusScore += 20; // Low rollback rate
      if (events?.anomalies === 0) focusScore += 10; // No anomalies
      focusScore = Math.min(100, focusScore);

      return {
        sessionId,
        duration,
        durationHours: Math.round(durationHours * 100) / 100,
        totalChanges,
        changesPerHour: Math.round(changesPerHour * 10) / 10,
        rollbackRate: Math.round(rollbackRate * 100),
        anomalies: events?.anomalies || 0,
        focusScore,
        needsBreak: duration > 4 * 60 * 60 * 1000 // 4+ hours
      };
    } catch (error) {
      logger.error('Failed to get session metrics:', error);
      return null;
    }
  }

  /**
   * Generate session story
   * @param {string} sessionId - Session identifier
   * @returns {object} Session story
   */
  generateSessionStory(sessionId) {
    try {
      const projectName = 'raven';
      const metrics = this.getSessionMetrics(sessionId);

      // Get session events timeline
      const eventsStmt = this.db.prepareStatement(`
        SELECT id, timestamp, filepath, change_type, agent
        FROM events
        WHERE session_id = ?
        ORDER BY timestamp ASC
        LIMIT 100
      `);
      const events = eventsStmt.all(sessionId);

      // Build narrative
      const timeline = events.map(e => ({
        time: new Date(e.timestamp).toLocaleTimeString(),
        action: `${e.change_type} ${e.filepath.split('/').pop()}`,
        agent: e.agent
      }));

      let narrative = `You worked for ${metrics.durationHours} hours and made ${metrics.totalChanges} changes. `;

      if (metrics.focusScore >= 80) {
        narrative += 'You were in deep flow state - productivity was excellent! ';
      } else if (metrics.focusScore < 50) {
        narrative += 'This was a challenging session with some struggles. ';
      }

      if (metrics.rollbackRate > 20) {
        narrative += `Had ${metrics.rollbackRate}% rollback rate - learning from mistakes! `;
      }

      // Detect achievements
      const achievements = [];
      if (metrics.totalChanges > 50) achievements.push('High Productivity');
      if (metrics.anomalies === 0) achievements.push('Clean Code');
      if (metrics.rollbackRate < 10) achievements.push('Steady Progress');

      const story = {
        sessionId,
        projectName,
        narrative,
        timeline,
        stats: metrics,
        mood:
          metrics.focusScore >= 70
            ? 'productive'
            : metrics.focusScore >= 50
              ? 'normal'
              : 'challenging',
        achievements,
        createdAt: new Date().toISOString()
      };

      // Save to database
      const saveStmt = this.db.prepareStatement(`
        INSERT INTO session_stories (session_id, project_name, narrative, timeline, stats, mood, achievements)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(session_id) DO UPDATE SET
          narrative = ?,
          timeline = ?,
          stats = ?,
          mood = ?,
          achievements = ?
      `);

      saveStmt.run(
        sessionId,
        projectName,
        narrative,
        JSON.stringify(timeline),
        JSON.stringify(metrics),
        story.mood,
        JSON.stringify(achievements),
        narrative,
        JSON.stringify(timeline),
        JSON.stringify(metrics),
        story.mood,
        JSON.stringify(achievements)
      );

      return story;
    } catch (error) {
      logger.error('Failed to generate session story:', error);
      return null;
    }
  }

  /**
   * Get recent session stories
   * @param {number} limit - Max stories to return
   * @returns {Array} Session stories
   */
  getRecentStories(limit = 10) {
    try {
      const stmt = this.db.prepareStatement(`
        SELECT *
        FROM session_stories
        ORDER BY created_at DESC
        LIMIT ?
      `);

      const stories = stmt.all(limit);
      return stories.map(s => ({
        ...s,
        timeline: JSON.parse(s.timeline),
        stats: JSON.parse(s.stats),
        achievements: JSON.parse(s.achievements)
      }));
    } catch (error) {
      logger.error('Failed to get recent stories:', error);
      return [];
    }
  }

  /**
   * Get session context for resuming work
   * @param {string} sessionId - Session identifier
   * @returns {object|null} Session context
   */
  getSessionContext(sessionId) {
    try {
      const stmt = this.db.prepareStatement(`
        SELECT *
        FROM session_context
        WHERE session_id = ?
      `);

      const context = stmt.get(sessionId);
      if (context && context.todos) {
        context.todos = JSON.parse(context.todos);
      }
      return context;
    } catch (error) {
      logger.error('Failed to get session context:', error);
      return null;
    }
  }
}

export default SessionIntelligence;
