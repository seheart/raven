import { Router } from 'express';
import { logger } from '../utils/logger.js';
import fs from 'fs';
import { join, resolve, normalize } from 'path';
import { promisify } from 'util';
import { gunzip } from 'zlib';

const gunzipAsync = promisify(gunzip);

/**
 * Creates snapshot and file restoration routes
 * @param {object} deps - Dependencies
 * @returns {Router} Express router
 */
export function createSnapshotsRoutes(deps) {
  const router = Router();
  const { projectState } = deps;

  /**
   * GET /api/snapshots/:filepath
   * Get all snapshots for a specific file
   */
  router.get('/snapshots/:filepath', async (req, res) => {
    try {
      const { filepath } = req.params;

      // List all snapshots for this file
      const files = await fs.promises.readdir(projectState.snapshotsDir);
      const filePattern = filepath.replace(/\//g, '_');
      const snapshots = files
        .filter(f => f.startsWith(filePattern))
        .map(f => {
          const timestamp = parseInt(f.split('_').pop());
          return {
            filename: f,
            timestamp: timestamp,
            date: new Date(timestamp).toISOString(),
            path: join(projectState.snapshotsDir, f)
          };
        })
        .sort((a, b) => b.timestamp - a.timestamp);

      res.json(snapshots);
    } catch (error) {
      logger.error('❌ Snapshots error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * POST /api/restore
   * Restore a file from snapshot
   */
  router.post('/restore', async (req, res) => {
    try {
      const { eventId, targetPath, filepath, snapshot } = req.body;

      // Support both old API (filepath + snapshot) and new API (eventId + targetPath)
      let snapshotPath;
      let restoredFilepath;

      if (eventId && targetPath) {
        // New API: Look up event and find corresponding snapshot
        const event = projectState.db.getEventById(eventId);
        if (!event) {
          return res.status(404).json({ error: `Event ${eventId} not found` });
        }

        // Find snapshot file
        const snapshotFilename = `${event.filepath.replace(/\//g, '_')}_${new Date(event.timestamp).getTime()}.gz`;
        snapshotPath = join(projectState.snapshotsDir, snapshotFilename);
        restoredFilepath = targetPath;

        // Check if snapshot exists
        if (!fs.existsSync(snapshotPath)) {
          return res.status(404).json({
            error: `Snapshot not found: ${snapshotFilename}`,
            details: 'The snapshot file may have been cleaned up or deleted'
          });
        }
      } else if (filepath && snapshot) {
        // Old API: Direct snapshot restoration
        snapshotPath = join(projectState.snapshotsDir, snapshot);
        restoredFilepath = filepath;
      } else {
        return res.status(400).json({
          error: 'Missing required parameters. Provide either (eventId + targetPath) or (filepath + snapshot)'
        });
      }

      // Read snapshot (may be compressed or uncompressed for backwards compatibility)
      const data = await fs.promises.readFile(snapshotPath);

      // Decompress if it's a .gz file, otherwise treat as plain text
      let content;
      if (snapshotPath.endsWith('.gz')) {
        const decompressed = await gunzipAsync(data);
        content = decompressed.toString('utf8');
      } else {
        content = data.toString('utf8');
      }

      // Restore to original location with path traversal protection
      if (!projectState.watchPath) {
        return res.status(500).json({ error: 'Project watch path not available' });
      }

      const targetFilePath = resolve(projectState.watchPath, normalize(restoredFilepath));

      // Security: Ensure the resolved path is within the project directory
      if (!targetFilePath.startsWith(resolve(projectState.watchPath) + '/') &&
          targetFilePath !== resolve(projectState.watchPath)) {
        logger.error('❌ Path traversal attempt detected', {
          project: projectState.activeProject,
          filepath: restoredFilepath,
          resolved: targetFilePath,
          basePath: projectState.watchPath
        });
        return res.status(400).json({
          error: 'Invalid file path - must be within project directory'
        });
      }

      // Ensure parent directory exists
      await fs.promises.mkdir(join(targetFilePath, '..'), { recursive: true });

      await fs.promises.writeFile(targetFilePath, content, 'utf8');

      logger.info(`🔄 Restored ${restoredFilepath} from snapshot`, {
        event_id: eventId,
        snapshot_path: snapshotPath
      });

      res.json({
        success: true,
        message: `File ${restoredFilepath} successfully restored`,
        filepath: restoredFilepath,
        event_id: eventId
      });
    } catch (error) {
      logger.error('❌ Restore error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}
