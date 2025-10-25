import { Router } from 'express';
import { logger } from '../utils/logger.js';

/**
 * Creates git management routes
 * @param {object} deps - Dependencies { projectState }
 * @returns {Router} Express router
 */
export function createGitRoutes(deps) {
  const router = Router();
  const { projectState } = deps;

  /**
   * GET /api/git/status
   * Get current git status
   */
  router.get('/status', async (req, res) => {
    try {
      if (!projectState.gitMonitor) {
        return res.json({
          branch: 'unknown',
          modified: [],
          created: [],
          deleted: []
        });
      }

      // Check if this is a git repository
      const isRepo = await projectState.gitMonitor.isGitRepo();
      if (!isRepo) {
        return res.json({
          branch: 'unknown',
          modified: [],
          created: [],
          deleted: []
        });
      }

      // Get current status (force a fresh check)
      const previousStatus = projectState.gitMonitor.lastStatus;
      projectState.gitMonitor.lastStatus = null;

      const status = await projectState.gitMonitor.checkStatus();

      // Restore previous status to avoid repeated emissions
      if (!status && previousStatus) {
        projectState.gitMonitor.lastStatus = previousStatus;
      }

      if (status) {
        res.json({
          branch: status.branch,
          modified: status.modified,
          created: status.created,
          deleted: status.deleted,
          ahead: status.ahead || 0,
          behind: status.behind || 0
        });
      } else {
        // Return last known status if available
        const lastStatus = projectState.gitMonitor.getLastStatus();
        if (lastStatus) {
          res.json({
            branch: lastStatus.current || 'unknown',
            modified: lastStatus.modified || [],
            created: [...(lastStatus.created || []), ...(lastStatus.not_added || [])],
            deleted: lastStatus.deleted || [],
            ahead: lastStatus.ahead || 0,
            behind: lastStatus.behind || 0
          });
        } else {
          res.json({
            branch: 'unknown',
            modified: [],
            created: [],
            deleted: [],
            ahead: 0,
            behind: 0
          });
        }
      }
    } catch (error) {
      logger.error('Git status error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * GET /api/git/branches
   * Get list of all branches
   */
  router.get('/branches', async (req, res) => {
    try {
      if (!projectState.gitMonitor) {
        return res.json({ branches: [] });
      }

      const isRepo = await projectState.gitMonitor.isGitRepo();
      if (!isRepo) {
        return res.json({ branches: [] });
      }

      const branches = await projectState.gitMonitor.getBranches();
      res.json({ branches });
    } catch (error) {
      logger.error('Git branches error:', error);
      res.status(500).json({ error: error.message, branches: [] });
    }
  });

  /**
   * GET /api/git/history
   * Get commit history
   */
  router.get('/history', async (req, res) => {
    try {
      if (!projectState.gitMonitor) {
        return res.json({ commits: [] });
      }

      const isRepo = await projectState.gitMonitor.isGitRepo();
      if (!isRepo) {
        return res.json({ commits: [] });
      }

      const limit = parseInt(req.query.limit) || 10;
      const commits = await projectState.gitMonitor.getCommitHistory(limit);

      // Format commits for frontend
      const formattedCommits = commits.map(commit => ({
        hash: commit.hash,
        message: commit.message,
        author: commit.author_name,
        date: commit.date
      }));

      res.json({ commits: formattedCommits });
    } catch (error) {
      logger.error('Git history error:', error);
      res.status(500).json({ error: error.message, commits: [] });
    }
  });

  /**
   * GET /api/git/diff/:filepath(*)
   * Get diff for a specific file
   */
  router.get('/diff/:filepath(*)', async (req, res) => {
    try {
      if (!projectState.gitMonitor) {
        return res.json({ file: req.params.filepath, diff: '' });
      }

      const isRepo = await projectState.gitMonitor.isGitRepo();
      if (!isRepo) {
        return res.json({ file: req.params.filepath, diff: '' });
      }

      const filepath = req.params.filepath;
      const diff = await projectState.gitMonitor.getFileDiff(filepath);

      res.json({
        file: filepath,
        diff: diff || ''
      });
    } catch (error) {
      logger.error('Git diff error:', error);
      res.status(500).json({ error: error.message, file: req.params.filepath, diff: '' });
    }
  });

  /**
   * GET /api/git/diff
   * Get all uncommitted changes as unified diff
   */
  router.get('/diff', async (req, res) => {
    try {
      if (!projectState.gitMonitor) {
        return res.json({ diff: '' });
      }

      const isRepo = await projectState.gitMonitor.isGitRepo();
      if (!isRepo) {
        return res.json({ diff: '' });
      }

      const diff = await projectState.gitMonitor.getUncommittedDiff();

      res.json({ diff: diff || '' });
    } catch (error) {
      logger.error('Git uncommitted diff error:', error);
      res.status(500).json({ error: error.message, diff: '' });
    }
  });

  return router;
}
