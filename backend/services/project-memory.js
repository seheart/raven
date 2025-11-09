/**
 * Project Memory & Context Service
 *
 * Tracks important project decisions, milestones, and contextual information
 * that persists across sessions. Helps maintain project continuity.
 */

import { logger } from '../utils/logger.js';

export class ProjectMemory {
  constructor(ravenDb) {
    this.db = ravenDb;
    this.projectName = ravenDb.projectName || 'raven';
  }

  /**
   * Add a new memory to the project
   */
  addMemory({
    type,
    title,
    description,
    context,
    importance = 'medium',
    tags = [],
    eventId = null,
    sessionId = null
  }) {
    try {
      const stmt = this.db.prepareStatement(`
        INSERT INTO project_memories (
          project_name, memory_type, title, description, context,
          importance, tags, event_id, session_id, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `);

      const tagsJson = JSON.stringify(tags);
      const result = stmt.run(
        this.projectName,
        type,
        title,
        description,
        context,
        importance,
        tagsJson,
        eventId,
        sessionId
      );

      logger.info('Memory added', {
        service: 'project-memory',
        memoryId: result.lastInsertRowid,
        type,
        title
      });

      return {
        id: result.lastInsertRowid,
        project_name: this.projectName,
        memory_type: type,
        title,
        description,
        context,
        importance,
        tags,
        event_id: eventId,
        session_id: sessionId
      };
    } catch (error) {
      logger.error('Failed to add memory', {
        service: 'project-memory',
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get memories by type
   */
  getMemoriesByType(type, limit = 50) {
    try {
      const stmt = this.db.prepareStatement(`
        SELECT * FROM project_memories
        WHERE project_name = ? AND memory_type = ?
        ORDER BY created_at DESC
        LIMIT ?
      `);

      const memories = stmt.all(this.projectName, type, limit);
      return memories.map(m => ({
        ...m,
        tags: m.tags ? JSON.parse(m.tags) : []
      }));
    } catch (error) {
      logger.error('Failed to get memories by type', {
        service: 'project-memory',
        error: error.message
      });
      return [];
    }
  }

  /**
   * Get all memories
   */
  getAllMemories(limit = 100) {
    try {
      const stmt = this.db.prepareStatement(`
        SELECT * FROM project_memories
        WHERE project_name = ?
        ORDER BY created_at DESC
        LIMIT ?
      `);

      const memories = stmt.all(this.projectName, limit);
      return memories.map(m => ({
        ...m,
        tags: m.tags ? JSON.parse(m.tags) : []
      }));
    } catch (error) {
      logger.error('Failed to get all memories', {
        service: 'project-memory',
        error: error.message
      });
      return [];
    }
  }

  /**
   * Get important memories (high importance)
   */
  getImportantMemories(limit = 20) {
    try {
      const stmt = this.db.prepareStatement(`
        SELECT * FROM project_memories
        WHERE project_name = ? AND importance = 'high'
        ORDER BY created_at DESC
        LIMIT ?
      `);

      const memories = stmt.all(this.projectName, limit);
      return memories.map(m => ({
        ...m,
        tags: m.tags ? JSON.parse(m.tags) : []
      }));
    } catch (error) {
      logger.error('Failed to get important memories', {
        service: 'project-memory',
        error: error.message
      });
      return [];
    }
  }

  /**
   * Search memories by tags
   */
  searchByTags(tags, limit = 50) {
    try {
      const stmt = this.db.prepareStatement(`
        SELECT * FROM project_memories
        WHERE project_name = ?
        ORDER BY created_at DESC
        LIMIT ?
      `);

      const memories = stmt.all(this.projectName, limit);
      const parsed = memories.map(m => ({
        ...m,
        tags: m.tags ? JSON.parse(m.tags) : []
      }));

      // Filter by tags
      return parsed.filter(m => tags.some(tag => m.tags.includes(tag)));
    } catch (error) {
      logger.error('Failed to search memories by tags', {
        service: 'project-memory',
        error: error.message
      });
      return [];
    }
  }

  /**
   * Create or update today's context snapshot
   */
  createContextSnapshot({
    activeFiles = [],
    keyAgents = [],
    mainFocus,
    challenges = [],
    achievements = [],
    nextSteps = [],
    metadata = {}
  }) {
    try {
      const today = new Date().toISOString().split('T')[0];

      const stmt = this.db.prepareStatement(`
        INSERT INTO project_context_snapshots (
          project_name, snapshot_date, active_files, key_agents,
          main_focus, challenges, achievements, next_steps, metadata
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(project_name, snapshot_date)
        DO UPDATE SET
          active_files = excluded.active_files,
          key_agents = excluded.key_agents,
          main_focus = excluded.main_focus,
          challenges = excluded.challenges,
          achievements = excluded.achievements,
          next_steps = excluded.next_steps,
          metadata = excluded.metadata
      `);

      stmt.run(
        this.projectName,
        today,
        JSON.stringify(activeFiles),
        JSON.stringify(keyAgents),
        mainFocus,
        JSON.stringify(challenges),
        JSON.stringify(achievements),
        JSON.stringify(nextSteps),
        JSON.stringify(metadata)
      );

      logger.info('Context snapshot created', {
        service: 'project-memory',
        date: today
      });

      return { success: true, date: today };
    } catch (error) {
      logger.error('Failed to create context snapshot', {
        service: 'project-memory',
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get context snapshot for a specific date
   */
  getContextSnapshot(date = null) {
    try {
      const targetDate = date || new Date().toISOString().split('T')[0];

      const stmt = this.db.prepareStatement(`
        SELECT * FROM project_context_snapshots
        WHERE project_name = ? AND snapshot_date = ?
      `);

      const snapshot = stmt.get(this.projectName, targetDate);
      if (!snapshot) {
        return null;
      }

      return {
        ...snapshot,
        active_files: JSON.parse(snapshot.active_files || '[]'),
        key_agents: JSON.parse(snapshot.key_agents || '[]'),
        challenges: JSON.parse(snapshot.challenges || '[]'),
        achievements: JSON.parse(snapshot.achievements || '[]'),
        next_steps: JSON.parse(snapshot.next_steps || '[]'),
        metadata: JSON.parse(snapshot.metadata || '{}')
      };
    } catch (error) {
      logger.error('Failed to get context snapshot', {
        service: 'project-memory',
        error: error.message
      });
      return null;
    }
  }

  /**
   * Get recent context snapshots
   */
  getRecentSnapshots(limit = 7) {
    try {
      const stmt = this.db.prepareStatement(`
        SELECT * FROM project_context_snapshots
        WHERE project_name = ?
        ORDER BY snapshot_date DESC
        LIMIT ?
      `);

      const snapshots = stmt.all(this.projectName, limit);
      return snapshots.map(s => ({
        ...s,
        active_files: JSON.parse(s.active_files || '[]'),
        key_agents: JSON.parse(s.key_agents || '[]'),
        challenges: JSON.parse(s.challenges || '[]'),
        achievements: JSON.parse(s.achievements || '[]'),
        next_steps: JSON.parse(s.next_steps || '[]'),
        metadata: JSON.parse(s.metadata || '{}')
      }));
    } catch (error) {
      logger.error('Failed to get recent snapshots', {
        service: 'project-memory',
        error: error.message
      });
      return [];
    }
  }

  /**
   * Auto-generate context snapshot from recent activity
   */
  autoGenerateSnapshot() {
    try {
      // Get files modified in the last 24 hours
      const filesStmt = this.db.prepareStatement(`
        SELECT DISTINCT filepath, COUNT(*) as change_count
        FROM events
        WHERE project_name = ?
          AND timestamp >= datetime('now', '-1 day')
        GROUP BY filepath
        ORDER BY change_count DESC
        LIMIT 10
      `);
      const activeFiles = filesStmt.all(this.projectName).map(f => f.filepath);

      // Get active agents from last 24 hours
      const agentsStmt = this.db.prepareStatement(`
        SELECT DISTINCT agent, COUNT(*) as activity_count
        FROM events
        WHERE project_name = ?
          AND timestamp >= datetime('now', '-1 day')
          AND agent IS NOT NULL
        GROUP BY agent
        ORDER BY activity_count DESC
        LIMIT 5
      `);
      const keyAgents = agentsStmt.all(this.projectName).map(a => a.agent);

      // Get rollbacks (challenges)
      const rollbacksStmt = this.db.prepareStatement(`
        SELECT COUNT(*) as count
        FROM events
        WHERE project_name = ?
          AND event_type = 'rollback'
          AND timestamp >= datetime('now', '-1 day')
      `);
      const rollbackCount = rollbacksStmt.get(this.projectName)?.count || 0;

      const challenges = [];
      if (rollbackCount > 5) {
        challenges.push(`${rollbackCount} rollbacks today - potential stability issues`);
      }

      // Get total changes (achievements)
      const changesStmt = this.db.prepareStatement(`
        SELECT COUNT(*) as count
        FROM events
        WHERE project_name = ?
          AND event_type = 'change'
          AND timestamp >= datetime('now', '-1 day')
      `);
      const changeCount = changesStmt.get(this.projectName)?.count || 0;

      const achievements = [];
      if (changeCount > 20) {
        achievements.push(`High productivity: ${changeCount} changes made today`);
      }

      const mainFocus =
        activeFiles.length > 0
          ? `Working on: ${activeFiles[0].split('/').pop()}`
          : 'No recent activity';

      return this.createContextSnapshot({
        activeFiles,
        keyAgents,
        mainFocus,
        challenges,
        achievements,
        nextSteps: [],
        metadata: { auto_generated: true, change_count: changeCount, rollback_count: rollbackCount }
      });
    } catch (error) {
      logger.error('Failed to auto-generate snapshot', {
        service: 'project-memory',
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Delete a memory
   */
  deleteMemory(id) {
    try {
      const stmt = this.db.prepareStatement(`
        DELETE FROM project_memories
        WHERE id = ? AND project_name = ?
      `);

      stmt.run(id, this.projectName);

      logger.info('Memory deleted', {
        service: 'project-memory',
        memoryId: id
      });

      return { success: true };
    } catch (error) {
      logger.error('Failed to delete memory', {
        service: 'project-memory',
        error: error.message
      });
      throw error;
    }
  }
}
