/**
 * Live Session API Routes
 * Real-time session monitoring endpoints for the Live page
 */

import express, { Request, Response } from 'express';
import { RavenDB } from '../db.js';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import type { Database } from 'better-sqlite3';

const execAsync = promisify(exec);

export function createLiveSessionRouter(ravenDB: RavenDB) {
  const router = express.Router();
  const db: Database = ravenDB.db;

  /**
   * Get modified files in current session
   * GET /api/session/files
   */
  router.get('/files', async (req: Request, res: Response) => {
    try {
      // Get files modified in the current session (last hour)
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

      const files = db
        .prepare(
          `SELECT DISTINCT filepath, change_type, timestamp
       FROM events
       WHERE timestamp > ?
       ORDER BY timestamp DESC`
        )
        .all(oneHourAgo);

      // Get line counts for ALL files with a single git command (optimized)
      const gitStats: Record<string, { added: number; removed: number }> = {};

      try {
        const { stdout } = await execAsync('git diff --numstat HEAD');
        const lines = stdout.trim().split('\n');

        lines.forEach(line => {
          if (!line) return;
          const parts = line.split('\t');
          if (parts.length >= 3) {
            const added = parseInt(parts[0], 10) || 0;
            const removed = parseInt(parts[1], 10) || 0;
            const filepath = parts[2];

            // Store with both possible path formats (with/without raven/ prefix)
            gitStats[filepath] = { added, removed };
            gitStats[`raven/${filepath}`] = { added, removed };
          }
        });
      } catch (err) {
        // Ignore git errors - gitStats will remain empty
      }

      // Map files to include git stats (no subprocess spawning per file)
      const filesWithStats = files.map((file: any) => {
        // Try exact match, then without raven/ prefix, then fallback to 0
        const stats = gitStats[file.filepath] ||
          gitStats[file.filepath.replace(/^raven\//, '')] || { added: 0, removed: 0 };

        return {
          path: file.filepath,
          status: file.change_type || 'modified',
          linesAdded: stats.added,
          linesRemoved: stats.removed,
          timestamp: file.timestamp
        };
      });

      res.json({ files: filesWithStats });
    } catch (error) {
      console.error('Error fetching session files:', error);
      res.status(500).json({ error: 'Failed to fetch session files' });
    }
  });

  /**
   * Get diff for a specific file
   * GET /api/session/diff/:path
   */
  router.get('/diff/:path', async (req: Request, res: Response) => {
    try {
      const filePath = decodeURIComponent(req.params.path);

      // Get git diff for the file
      const { stdout } = await execAsync(`git diff HEAD -- "${filePath}"`);

      res.json({
        filePath,
        diff: stdout
      });
    } catch (error) {
      console.error('Error fetching file diff:', error);
      res.status(500).json({ error: 'Failed to fetch file diff' });
    }
  });

  /**
   * Get current session statistics
   * GET /api/session/stats
   */
  router.get('/stats', async (req: Request, res: Response) => {
    try {
      // Get latest file change
      const latestChange = db
        .prepare(`SELECT filepath, timestamp FROM events ORDER BY timestamp DESC LIMIT 1`)
        .get() as any;

      // Count files modified in last hour
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const fileCount = db
        .prepare(`SELECT COUNT(DISTINCT filepath) as count FROM events WHERE timestamp > ?`)
        .get(oneHourAgo) as any;

      // Get total line changes from git
      let linesAdded = 0;
      let linesRemoved = 0;

      try {
        const { stdout } = await execAsync('git diff --numstat HEAD');
        const lines = stdout.trim().split('\n');

        lines.forEach(line => {
          const [added, removed] = line.split('\t').map(Number);
          if (!isNaN(added)) linesAdded += added;
          if (!isNaN(removed)) linesRemoved += removed;
        });
      } catch (err) {
        // Ignore git errors
      }

      // Determine session health based on recent errors
      const recentErrors = db
        .prepare(`SELECT COUNT(*) as count FROM syntax_errors WHERE timestamp > ?`)
        .get(oneHourAgo) as any;

      const sessionHealth =
        recentErrors.count > 5 ? 'warning' : recentErrors.count > 10 ? 'error' : 'healthy';

      res.json({
        currentFile: latestChange?.filepath || null,
        filesModified: fileCount?.count || 0,
        linesAdded,
        linesRemoved,
        lastChange: latestChange?.timestamp || null,
        sessionHealth,
        sessionActive: true
      });
    } catch (error) {
      console.error('Error fetching session stats:', error);
      res.status(500).json({ error: 'Failed to fetch session stats' });
    }
  });

  /**
   * Get current task information
   * GET /api/session/current-task
   */
  router.get('/current-task', (req: Request, res: Response) => {
    try {
      // Try to infer current task from recent file changes
      const recentChanges = db
        .prepare(
          `SELECT filepath, timestamp FROM events
       ORDER BY timestamp DESC LIMIT 10`
        )
        .all();

      // Simple heuristic: group recent changes to infer task
      let taskName = 'Ongoing Development';
      let step = 'Working on changes';
      let progress = 50;

      if (recentChanges.length > 0) {
        const files = recentChanges.map((c: any) => c.filepath);
        const hasBackend = files.some((f: any) => f.includes('backend'));
        const hasFrontend = files.some((f: any) => f.includes('frontend'));
        const hasTests = files.some((f: any) => f.includes('test'));

        if (hasBackend && hasFrontend) {
          taskName = 'Full-Stack Feature Implementation';
          step = 'Updating backend and frontend';
          progress = 60;
        } else if (hasBackend) {
          taskName = 'Backend Development';
          step = 'Modifying server-side code';
          progress = 55;
        } else if (hasFrontend) {
          taskName = 'Frontend Development';
          step = 'Updating UI components';
          progress = 55;
        }

        if (hasTests) {
          step = 'Running tests and validation';
          progress = 80;
        }
      }

      res.json({
        task: {
          name: taskName,
          step,
          progress
        }
      });
    } catch (error) {
      console.error('Error fetching current task:', error);
      res.status(500).json({ task: null });
    }
  });

  /**
   * Get active alerts
   * GET /api/session/alerts
   */
  router.get('/alerts', (req: Request, res: Response) => {
    try {
      const alerts = [];

      // Check for recent syntax errors
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      const syntaxErrors = db
        .prepare(`SELECT * FROM syntax_errors WHERE timestamp > ? LIMIT 5`)
        .all(fiveMinutesAgo);

      syntaxErrors.forEach((error: any) => {
        alerts.push({
          id: `syntax-${error.id}`,
          type: 'error',
          title: 'Syntax Error Detected',
          message: `${error.filepath}:${error.line_number} - ${error.message}`
        });
      });

      // Check for high-risk file changes
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const riskFiles = db
        .prepare(
          `SELECT filepath FROM events
       WHERE timestamp > ? AND (
         filepath LIKE '%auth%' OR
         filepath LIKE '%security%' OR
         filepath LIKE '%password%' OR
         filepath LIKE '%db%' OR
         filepath LIKE '%database%'
       )
       LIMIT 3`
        )
        .all(oneHourAgo);

      if (riskFiles.length > 0) {
        alerts.push({
          id: 'high-risk-changes',
          type: 'warning',
          title: 'High-Risk File Changes',
          message: `Modified security-sensitive files: ${riskFiles.map((f: any) => path.basename(f.filepath)).join(', ')}`
        });
      }

      // Add info alert if no errors
      if (alerts.length === 0) {
        alerts.push({
          id: 'all-good',
          type: 'info',
          title: 'Session Running Smoothly',
          message: 'No issues detected in the current session'
        });
      }

      res.json({ alerts });
    } catch (error) {
      console.error('Error fetching alerts:', error);
      res.status(500).json({ alerts: [] });
    }
  });

  /**
   * Get recent activity
   * GET /api/session/recent-activity
   */
  router.get('/recent-activity', (req: Request, res: Response) => {
    try {
      const changes = db
        .prepare(
          `SELECT * FROM events
       ORDER BY timestamp DESC
       LIMIT 10`
        )
        .all();

      const activity = changes.map((change: any) => ({
        id: change.id,
        title: `${change.change_type === 'added' ? 'Added' : 'Modified'} ${path.basename(change.filepath)}`,
        description: change.filepath,
        timestamp: change.timestamp
      }));

      res.json({ activity });
    } catch (error) {
      console.error('Error fetching recent activity:', error);
      res.status(500).json({ activity: [] });
    }
  });

  /**
   * Get file-specific context
   * GET /api/session/file-context/:path
   */
  router.get('/file-context/:path', (req: Request, res: Response) => {
    try {
      const filePath = decodeURIComponent(req.params.path);

      // Determine file risk level
      const isHighRisk = filePath.match(/(auth|security|password|db|database|config|env)/i);
      const isMediumRisk = filePath.match(/(api|route|controller|service)/i);

      const impact = isHighRisk
        ? 'High-risk change affecting security-sensitive functionality'
        : isMediumRisk
          ? 'Medium-risk change affecting API or business logic'
          : 'Low-risk change affecting UI or documentation';

      // Find related files (same directory or similar names)
      const relatedFiles = db
        .prepare(
          `SELECT DISTINCT filepath FROM events
       WHERE filepath LIKE ? AND filepath != ?
       LIMIT 5`
        )
        .all(`%${path.dirname(filePath)}%`, filePath);

      const context = {
        impact,
        relatedFiles: relatedFiles.map((f: any) => f.filepath),
        risks: isHighRisk
          ? ['Security implications', 'Requires thorough testing', 'May affect authentication']
          : isMediumRisk
            ? ['API contract changes', 'Ensure backward compatibility']
            : []
      };

      res.json(context);
    } catch (error) {
      console.error('Error fetching file context:', error);
      res.status(500).json({});
    }
  });

  return router;
}
