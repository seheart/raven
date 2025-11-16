/**
 * Agent Behavior Profiler
 *
 * Tracks each AI agent's "personality" and coding style over time.
 * Detects when agents are behaving differently than usual.
 * Assigns "moods" based on behavior patterns.
 */

import { logger } from '../utils/logger.js';

export class AgentBehaviorProfiler {
  constructor(projectDb) {
    this.db = projectDb;
  }

  /**
   * Record agent statistics for today
   * @param {string} agent - Agent name
   * @param {object} change - Change event
   * @param {string} projectName - Project name (defaults to 'raven')
   */
  recordAgentActivity(agent, change, projectName = 'raven') {
    try {
      const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

      const stmt = this.db.prepareStatement(`
        INSERT INTO agent_stats (
          project_name, agent, date,
          changes_count, avg_change_size,
          total_lines_added, total_lines_deleted, files_modified
        )
        VALUES (?, ?, ?, 1, ?, ?, ?, 1)
        ON CONFLICT(project_name, agent, date) DO UPDATE SET
          changes_count = changes_count + 1,
          avg_change_size = ((avg_change_size * changes_count) + ?) / (changes_count + 1),
          total_lines_added = total_lines_added + ?,
          total_lines_deleted = total_lines_deleted + ?,
          files_modified = files_modified + 1
      `);

      const changeSize = change.event_size || 0;
      const linesAdded = change.lines_added || 0;
      const linesDeleted = change.lines_deleted || 0;

      stmt.run(
        projectName,
        agent,
        today,
        changeSize,
        linesAdded,
        linesDeleted,
        changeSize,
        linesAdded,
        linesDeleted
      );
    } catch (error) {
      logger.error('Failed to record agent activity:', error);
    }
  }

  /**
   * Get agent behavior profile
   * @param {string} agent - Agent name
   * @param {string} projectName - Project name (defaults to 'raven')
   * @returns {object} Behavior profile
   */
  getAgentProfile(agent, projectName = 'raven') {
    try {
      const today = new Date().toISOString().split('T')[0];

      // Get today's stats
      const todayStmt = this.db.prepareStatement(`
        SELECT * FROM agent_stats
        WHERE project_name = ? AND agent = ? AND date = ?
      `);
      const todayStats = todayStmt.get(projectName, agent, today);

      // Get 30-day average
      const avgStmt = this.db.prepareStatement(`
        SELECT
          AVG(changes_count) as avg_changes,
          AVG(avg_change_size) as avg_size,
          AVG(total_lines_added) as avg_additions,
          AVG(total_lines_deleted) as avg_deletions,
          AVG(files_modified) as avg_files
        FROM agent_stats
        WHERE project_name = ?
          AND agent = ?
          AND date >= date('now', '-30 days')
          AND date < date('now')
      `);
      const avgStats = avgStmt.get(projectName, agent);

      // Calculate behavior changes
      const profile = {
        agent,
        today: todayStats || {},
        avg30Days: avgStats || {},
        behaviorChanges: [],
        mood: 'normal',
        moodReason: ''
      };

      if (todayStats && avgStats) {
        // Compare today vs average
        const deletionRatio = todayStats.total_lines_deleted / (avgStats.avg_deletions || 1);
        const sizeRatio = todayStats.avg_change_size / (avgStats.avg_size || 1);

        if (deletionRatio > 2.0) {
          profile.behaviorChanges.push({
            metric: 'deletions',
            change: 'increase',
            ratio: deletionRatio,
            message: `${Math.round(deletionRatio * 100)}% more deletions than usual`
          });
        }

        if (sizeRatio > 1.5) {
          profile.behaviorChanges.push({
            metric: 'change_size',
            change: 'increase',
            ratio: sizeRatio,
            message: `${Math.round(sizeRatio * 100)}% larger changes than usual`
          });
        }

        // Determine mood
        if (deletionRatio > 2.5 || sizeRatio > 2.0) {
          profile.mood = 'aggressive';
          profile.moodReason = 'Large structural changes detected';
        } else if (deletionRatio < 0.5 && sizeRatio < 0.5) {
          profile.mood = 'conservative';
          profile.moodReason = 'Small, careful changes';
        } else if (todayStats.changes_count > avgStats.avg_changes * 2) {
          profile.mood = 'productive';
          profile.moodReason = 'High activity today';
        }
      }

      return profile;
    } catch (error) {
      logger.error('Failed to get agent profile:', error);
      return null;
    }
  }

  /**
   * Get all agents' profiles
   * @param {string} projectName - Project name (defaults to 'raven')
   * @returns {Array} List of agent profiles
   */
  getAllAgentProfiles(projectName = 'raven') {
    try {

      // Get unique agents from recent stats
      const stmt = this.db.prepareStatement(`
        SELECT DISTINCT agent
        FROM agent_stats
        WHERE project_name = ?
          AND date >= date('now', '-7 days')
        ORDER BY agent
      `);

      const agents = stmt.all(projectName);
      return agents.map(({ agent }) => this.getAgentProfile(agent, projectName)).filter(Boolean);
    } catch (error) {
      logger.error('Failed to get all agent profiles:', error);
      return [];
    }
  }

  /**
   * Get agent mood emoji
   * @param {string} mood - Mood string
   * @returns {string} Emoji
   */
  getMoodEmoji(mood) {
    const moods = {
      aggressive: '🔴',
      conservative: '🟢',
      productive: '🟡',
      normal: '⚪'
    };
    return moods[mood] || '⚪';
  }
}

export default AgentBehaviorProfiler;
