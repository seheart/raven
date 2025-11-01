import { Router } from 'express';
import { logger } from '../utils/logger.js';
import { existsSync } from 'fs';
import { join } from 'path';
import fs from 'fs/promises';
import { gunzip } from 'zlib';
import { promisify } from 'util';

const gunzipAsync = promisify(gunzip);

/**
 * Creates session management routes
 * @param {object} deps - Dependencies { sessionTracker, projectDatabases, projectState }
 * @returns {Router} Express router
 */
export function createSessionRoutes(deps) {
  const router = Router();
  // Note: Don't destructure sessionTracker - access it from deps dynamically
  // so it works even if sessionTracker is added to deps after route mounting

  /**
   * GET /api/sessions
   * Get all completed sessions with file change counts
   */
  router.get('/', async (req, res) => {
    try {
      const { project } = req.query;

      // Get the appropriate database
      const projectName = project || Array.from(deps.projectDatabases.keys())[0];
      const db = deps.projectDatabases.get(projectName);

      if (!db) {
        return res.json({ sessions: [], total: 0 });
      }

      // Query sessions table for completed sessions (have end_time)
      const sessions = db.db.prepare(`
        SELECT
          id,
          project_name,
          start_time,
          end_time,
          changes_count,
          rollbacks_count,
          quality_score
        FROM sessions
        WHERE end_time IS NOT NULL
        ORDER BY end_time DESC
        LIMIT 50
      `).all();

      // For each session, count unique files changed
      const sessionsWithFiles = sessions.map(session => {
        try {
          const fileCount = db.db.prepare(`
            SELECT COUNT(DISTINCT filepath) as file_count
            FROM events
            WHERE timestamp >= ? AND timestamp <= ?
          `).get(session.start_time, session.end_time);

          const eventCount = db.db.prepare(`
            SELECT COUNT(*) as event_count
            FROM events
            WHERE timestamp >= ? AND timestamp <= ?
          `).get(session.start_time, session.end_time);

          return {
            ...session,
            file_count: fileCount?.file_count || 0,
            event_count: eventCount?.event_count || session.changes_count
          };
        } catch (err) {
          logger.error('Error counting files for session:', err);
          return {
            ...session,
            file_count: 0,
            event_count: session.changes_count
          };
        }
      });

      res.json({
        sessions: sessionsWithFiles,
        total: sessionsWithFiles.length
      });
    } catch (error) {
      logger.error('Error fetching sessions:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * GET /api/sessions/:sessionId/preview
   * Preview what would be rolled back for a session
   */
  router.get('/:sessionId/preview', async (req, res) => {
    try {
      const { sessionId } = req.params;
      const { project } = req.query;

      const projectName = project || Array.from(deps.projectDatabases.keys())[0];
      const db = deps.projectDatabases.get(projectName);

      if (!db) {
        return res.status(404).json({ error: 'Project database not found' });
      }

      // Get session details
      const session = db.db.prepare(`
        SELECT * FROM sessions WHERE id = ? OR session_id = ?
      `).get(sessionId, sessionId);

      if (!session) {
        return res.status(404).json({ error: 'Session not found' });
      }

      // Get all unique files changed during this session
      const files = db.db.prepare(`
        SELECT DISTINCT
          filepath,
          MIN(timestamp) as first_change,
          MAX(timestamp) as last_change,
          COUNT(*) as change_count
        FROM events
        WHERE timestamp >= ? AND timestamp <= ?
        AND filepath IS NOT NULL
        GROUP BY filepath
        ORDER BY first_change ASC
      `).all(session.start_time, session.end_time);

      // Check which files have snapshots available from BEFORE the session started
      const projectState = deps.projectState || {};
      const snapshotsDir = projectState.snapshotsDir || join(process.cwd(), '.raven', 'snapshots');

      const changes = [];
      let filesWithBackups = 0;

      for (const file of files) {
        // Look for snapshot from just before the session started
        // Snapshot filename format: filepath_timestamp.gz
        const snapshotPattern = file.filepath.replace(/\//g, '_');

        try {
          // Find snapshots for this file
          const allSnapshots = existsSync(snapshotsDir)
            ? await fs.readdir(snapshotsDir)
            : [];

          const fileSnapshots = allSnapshots
            .filter(f => f.startsWith(snapshotPattern))
            .map(f => {
              const timestampStr = f.replace(snapshotPattern + '_', '').replace('.gz', '');
              return {
                filename: f,
                timestamp: parseInt(timestampStr) || 0
              };
            })
            .filter(s => s.timestamp > 0)
            .sort((a, b) => b.timestamp - a.timestamp);

          // Find the most recent snapshot from BEFORE the session started
          const sessionStartMs = new Date(session.start_time).getTime();
          const preSessionSnapshot = fileSnapshots.find(s => s.timestamp < sessionStartMs);

          const hasBackup = !!preSessionSnapshot;
          if (hasBackup) filesWithBackups++;

          changes.push({
            id: file.filepath,
            filepath: file.filepath,
            name: file.filepath.split('/').pop(),
            hasBackup,
            snapshotFile: preSessionSnapshot?.filename || null,
            changeCount: file.change_count,
            firstChange: file.first_change,
            lastChange: file.last_change
          });
        } catch (err) {
          logger.error(`Error checking snapshots for ${file.filepath}:`, err);
          changes.push({
            id: file.filepath,
            filepath: file.filepath,
            name: file.filepath.split('/').pop(),
            hasBackup: false,
            snapshotFile: null,
            changeCount: file.change_count,
            firstChange: file.first_change,
            lastChange: file.last_change
          });
        }
      }

      res.json({
        canRollback: filesWithBackups > 0,
        fileCount: files.length,
        filesWithBackups,
        session: {
          id: session.id,
          start_time: session.start_time,
          end_time: session.end_time,
          changes_count: session.changes_count
        },
        changes
      });
    } catch (error) {
      logger.error('Error previewing session rollback:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * POST /api/sessions/:sessionId/rollback
   * Execute rollback for a session - restore all files to their pre-session state
   */
  router.post('/:sessionId/rollback', async (req, res) => {
    try {
      const { sessionId } = req.params;
      const { project } = req.query;

      const projectName = project || Array.from(deps.projectDatabases.keys())[0];
      const db = deps.projectDatabases.get(projectName);

      if (!db) {
        return res.status(404).json({ error: 'Project database not found' });
      }

      // Get preview data to know what to restore
      const previewResponse = await router.handle({
        method: 'GET',
        url: `/:sessionId/preview?project=${projectName}`,
        params: { sessionId },
        query: { project: projectName }
      });

      // Alternative: Just re-implement the preview logic
      const session = db.db.prepare(`
        SELECT * FROM sessions WHERE id = ? OR session_id = ?
      `).get(sessionId, sessionId);

      if (!session) {
        return res.status(404).json({ error: 'Session not found' });
      }

      const files = db.db.prepare(`
        SELECT DISTINCT filepath
        FROM events
        WHERE timestamp >= ? AND timestamp <= ?
        AND filepath IS NOT NULL
      `).all(session.start_time, session.end_time);

      const projectState = deps.projectState || {};
      const snapshotsDir = projectState.snapshotsDir || join(process.cwd(), '.raven', 'snapshots');
      const watchPath = projectState.watchPath || process.cwd();

      const restoredFiles = [];
      const failedFiles = [];

      for (const file of files) {
        try {
          const snapshotPattern = file.filepath.replace(/\//g, '_');
          const allSnapshots = existsSync(snapshotsDir)
            ? await fs.readdir(snapshotsDir)
            : [];

          const fileSnapshots = allSnapshots
            .filter(f => f.startsWith(snapshotPattern))
            .map(f => {
              const timestampStr = f.replace(snapshotPattern + '_', '').replace('.gz', '');
              return {
                filename: f,
                timestamp: parseInt(timestampStr) || 0
              };
            })
            .filter(s => s.timestamp > 0)
            .sort((a, b) => b.timestamp - a.timestamp);

          const sessionStartMs = new Date(session.start_time).getTime();
          const preSessionSnapshot = fileSnapshots.find(s => s.timestamp < sessionStartMs);

          if (!preSessionSnapshot) {
            failedFiles.push({ file: file.filepath, reason: 'No backup available' });
            continue;
          }

          // Read and decompress snapshot
          const snapshotPath = join(snapshotsDir, preSessionSnapshot.filename);
          const data = await fs.readFile(snapshotPath);
          const content = await gunzipAsync(data);

          // Write to original location
          const targetPath = join(watchPath, file.filepath);
          await fs.writeFile(targetPath, content);

          restoredFiles.push(file.filepath);
          logger.info(`Restored file from snapshot: ${file.filepath}`);
        } catch (err) {
          logger.error(`Failed to restore ${file.filepath}:`, err);
          failedFiles.push({ file: file.filepath, reason: err.message });
        }
      }

      res.json({
        success: true,
        restoredFiles,
        failedFiles,
        totalFiles: files.length,
        restoredCount: restoredFiles.length,
        failedCount: failedFiles.length
      });
    } catch (error) {
      logger.error('Error executing session rollback:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * GET /api/sessions/current
   * Get current active session
   */
  router.get('/current', (req, res) => {
    try {
      const { project } = req.query;

      if (!deps.sessionTracker) {
        return res.status(503).json({ error: 'Session tracker not initialized' });
      }

      const projectName = project || Array.from(deps.projectDatabases.keys())[0];
      const session = deps.sessionTracker.getActiveSession(projectName);

      if (!session) {
        return res.json({ hasActiveSession: false, session: null });
      }

      // Calculate session duration
      const durationMinutes = (Date.now() - session.startTime) / (1000 * 60);
      const durationHours = durationMinutes / 60;

      res.json({
        hasActiveSession: true,
        session: {
          id: session.id,
          projectName: session.projectName,
          startTime: new Date(session.startTime).toISOString(),
          durationMinutes: Math.round(durationMinutes),
          durationHours: durationHours.toFixed(2),
          changesCount: session.changesCount,
          rollbacksCount: session.rollbacksCount,
          qualityScore: Math.round(session.qualityScore)
        }
      });
    } catch (error) {
      logger.error('Error getting current session:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * GET /api/sessions/quality
   * Get session quality analysis
   */
  router.get('/quality', (req, res) => {
    try {
      const { project } = req.query;

      if (!deps.sessionTracker) {
        return res.status(503).json({ error: 'Session tracker not initialized' });
      }

      const projectName = project || Array.from(deps.projectDatabases.keys())[0];
      const quality = deps.sessionTracker.calculateSessionQuality(projectName);

      res.json({ quality });
    } catch (error) {
      logger.error('Error calculating session quality:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * GET /api/sessions/stats
   * Get session statistics
   */
  router.get('/stats', (req, res) => {
    try {
      const { project, days } = req.query;

      if (!deps.sessionTracker) {
        return res.status(503).json({ error: 'Session tracker not initialized' });
      }

      const projectName = project || Array.from(deps.projectDatabases.keys())[0];
      const stats = deps.sessionTracker.getSessionStats(projectName, parseInt(days) || 30);

      res.json({ stats });
    } catch (error) {
      logger.error('Error getting session stats:', error);
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}
