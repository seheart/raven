/**
 * Git Backfill Service
 *
 * Ensures telemetry accuracy by backfilling missed changes during downtime.
 * Compares git status with database state and creates synthetic events for any gaps.
 */

import simpleGit from 'simple-git';
import { logger } from '../utils/logger.js';

export class GitBackfillService {
  constructor(db, projectPath, sessionId) {
    this.db = db;
    this.projectPath = projectPath;
    this.sessionId = sessionId;
    this.git = simpleGit(projectPath);
  }

  /**
   * Backfill missed changes by comparing git status with database state
   */
  async backfillMissedChanges() {
    try {
      // Get git status
      const status = await this.git.status();

      // Get list of tracked files from git (modified, created, deleted)
      const gitChanges = {
        modified: status.modified || [],
        created: [...(status.not_added || []), ...(status.created || [])],
        deleted: status.deleted || []
      };

      const totalChanges =
        gitChanges.modified.length + gitChanges.created.length + gitChanges.deleted.length;

      if (totalChanges === 0) {
        logger.info('No git changes to backfill');
        return { backfilled: 0 };
      }

      // Get recent events from database for comparison
      const recentEvents = this.getRecentEvents();
      const trackedFiles = new Set(recentEvents.map(e => e.filepath));

      let backfilledCount = 0;
      const timestamp = new Date().toISOString();

      // Backfill modified files
      for (const filepath of gitChanges.modified) {
        if (!trackedFiles.has(filepath)) {
          this.createSyntheticEvent(filepath, 'edit', timestamp);
          backfilledCount++;
        }
      }

      // Backfill created files
      for (const filepath of gitChanges.created) {
        if (!trackedFiles.has(filepath)) {
          this.createSyntheticEvent(filepath, 'create', timestamp);
          backfilledCount++;
        }
      }

      // Backfill deleted files
      for (const filepath of gitChanges.deleted) {
        if (!trackedFiles.has(filepath)) {
          this.createSyntheticEvent(filepath, 'delete', timestamp);
          backfilledCount++;
        }
      }

      if (backfilledCount > 0) {
        logger.info(`✓ Backfilled ${backfilledCount} missed change(s) from git status`);
      }

      return { backfilled: backfilledCount };
    } catch (error) {
      logger.error('Error backfilling git changes:', error);
      return { backfilled: 0, error: error.message };
    }
  }

  /**
   * Get recent events from today for comparison
   */
  getRecentEvents() {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayISO = today.toISOString();

      const stmt = this.db.prepareStatement(`
        SELECT DISTINCT filepath
        FROM events
        WHERE timestamp >= ?
        AND filepath IS NOT NULL
      `);

      return stmt.all(todayISO);
    } catch (error) {
      logger.error('Error fetching recent events:', error);
      return [];
    }
  }

  /**
   * Create a synthetic event for a missed change
   */
  createSyntheticEvent(filepath, changeType, timestamp) {
    try {
      // Insert event into database
      const stmt = this.db.prepareStatement(`
        INSERT INTO events (
          timestamp,
          filepath,
          change_type,
          session_id,
          diff,
          cpu,
          mem,
          file_hash,
          event_size
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        timestamp,
        filepath,
        changeType,
        this.sessionId,
        null, // No diff for synthetic events
        null, // No CPU data
        null, // No memory data
        null, // No file hash
        null // No event size
      );

      // Also insert into agent_events for full tracking
      const agentStmt = this.db.prepareStatement(`
        INSERT INTO agent_events (
          timestamp,
          agent,
          event_type,
          file,
          message,
          metadata,
          session_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      agentStmt.run(
        timestamp,
        'raven-backfill',
        changeType,
        filepath,
        'Git backfill synthetic event',
        JSON.stringify({ synthetic: true, source: 'git-backfill' }),
        this.sessionId
      );
    } catch (error) {
      logger.error(`Error creating synthetic event for ${filepath}:`, error);
    }
  }

  /**
   * Get summary of what would be backfilled (dry run)
   */
  async previewBackfill() {
    try {
      const status = await this.git.status();
      const recentEvents = this.getRecentEvents();
      const trackedFiles = new Set(recentEvents.map(e => e.filepath));

      const gitChanges = {
        modified: status.modified || [],
        created: [...(status.not_added || []), ...(status.created || [])],
        deleted: status.deleted || []
      };

      const missing = {
        modified: gitChanges.modified.filter(f => !trackedFiles.has(f)),
        created: gitChanges.created.filter(f => !trackedFiles.has(f)),
        deleted: gitChanges.deleted.filter(f => !trackedFiles.has(f))
      };

      return {
        total: missing.modified.length + missing.created.length + missing.deleted.length,
        missing
      };
    } catch (error) {
      logger.error('Error previewing backfill:', error);
      return { total: 0, missing: { modified: [], created: [], deleted: [] } };
    }
  }
}
