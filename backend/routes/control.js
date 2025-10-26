import { Router } from 'express';
import fs from 'fs';
import { promisify } from 'util';
import { exec } from 'child_process';
import { logger } from '../utils/logger.js';

const defaultExecAsync = promisify(exec);

/**
 * Creates control routes (system management endpoints)
 * @param {object} deps - Dependencies
 * @returns {Router} Express router
 */
export function createControlRoutes(deps) {
  const router = Router();
  const {
    fileCache,
    projectState,
    projectStateMutex,
    initializeWatcher,
    PORT,
    execAsync = defaultExecAsync
  } = deps;

  // POST /api/control/clear-cache - Clear file cache
  router.post('/clear-cache', (req, res) => {
    try {
      const previousSize = fileCache.size;
      fileCache.clear();
      logger.info('Cleared file cache', { previousSize });
      res.json({
        success: true,
        message: `Cleared ${previousSize} cached files`,
        previousSize
      });
    } catch (error) {
      logger.error('Error clearing cache', { error });
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/control/restart-watcher - Restart file watcher
  router.post('/restart-watcher', async (req, res) => {
    try {
      // Protected by mutex to prevent race conditions with project switching
      await projectStateMutex.runExclusive(async () => {
        logger.info('Restarting file watcher', { project: projectState.activeProject });

        // Close existing watcher
        if (projectState.watcher) {
          await projectState.watcher.close();
          logger.info('Closed watcher');
        }

        // Reinitialize watcher
        projectState.watcher = initializeWatcher();
      });

      res.json({
        success: true,
        message: 'File watcher restarted successfully',
        project: projectState.activeProject
      });
    } catch (error) {
      logger.error('Error restarting watcher', { error });
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/control/restart-bridge - Restart telemetry bridge (SELF-HEALING)
  router.post('/restart-bridge', async (req, res) => {
    try {
      logger.info('Restarting telemetry bridge');

      // Stop existing bridge if running
      const stopScript = '../scripts/stop-claude-bridge.sh';
      try {
        await execAsync(stopScript);
        logger.info('Stopped existing bridge');
      } catch (err) {
        // Bridge may not be running, that's okay
        logger.info('No existing bridge to stop');
      }

      // Wait a moment for cleanup
      await new Promise(resolve => setTimeout(resolve, 500));

      // Start the bridge
      const startScript = '../scripts/start-claude-bridge.sh';
      const { stdout, stderr } = await execAsync(startScript);

      // Check if it started successfully by reading the PID file
      let bridgePid = null;
      let success = false;
      try {
        const pidFile = '/tmp/claude-telemetry-bridge.pid';
        if (fs.existsSync(pidFile)) {
          bridgePid = parseInt(fs.readFileSync(pidFile, 'utf-8').trim());
          // Verify process is running
          process.kill(bridgePid, 0);
          success = true;
          logger.info('Bridge restarted successfully', { pid: bridgePid });
        }
      } catch (err) {
        logger.error('Bridge failed to start', { error: err });
      }

      if (success) {
        res.json({
          success: true,
          message: 'Telemetry bridge restarted successfully',
          pid: bridgePid
        });
      } else {
        res.status(500).json({
          success: false,
          error: 'Bridge started but failed to verify',
          stdout: stdout,
          stderr: stderr
        });
      }
    } catch (error) {
      logger.error('Error restarting bridge', { error });
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // GET /api/control/export-health - Export health report
  router.get('/export-health', async (req, res) => {
    try {
      // Get full health data
      const healthResponse = await fetch(`http://localhost:${PORT}/health`);
      const healthData = await healthResponse.json();

      // Add timestamp
      const exportData = {
        exported_at: new Date().toISOString(),
        ...healthData
      };

      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="raven-health-${Date.now()}.json"`);
      res.json(exportData);
    } catch (error) {
      logger.error('Error exporting health report', { error });
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}
