import { Router } from 'express';
import fs from 'fs';
import { promisify } from 'util';
import { exec } from 'child_process';
import { join, resolve, dirname, basename } from 'path';
import { fileURLToPath } from 'url';
import { createHash } from 'crypto';
import { logger } from '../utils/logger.js';
import { authenticate, authorize } from '../middleware/auth.js';

const defaultExecAsync = promisify(exec);

// Get project root directory (backend/../)
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = resolve(__dirname, '../..');
const SCRIPT_HASHES_PATH = join(__dirname, '../config/script-hashes.json');

/**
 * Load script hash configuration
 */
function loadScriptHashes() {
  try {
    const content = fs.readFileSync(SCRIPT_HASHES_PATH, 'utf8');
    return JSON.parse(content);
  } catch (error) {
    logger.error('Failed to load script hashes config', { error: error.message });
    return { scripts: {}, verification: { enabled: false, strictMode: false } };
  }
}

/**
 * Calculate SHA-256 hash of a file
 * @param {string} filepath - Absolute path to file
 * @returns {string} - Hex-encoded SHA-256 hash
 */
function calculateFileHash(filepath) {
  const content = fs.readFileSync(filepath);
  return createHash('sha256').update(content).digest('hex');
}

/**
 * Verify script integrity before execution
 * @param {string} scriptPath - Absolute path to script
 * @param {string} scriptName - Script filename for hash lookup
 * @returns {Object} - { valid: boolean, reason: string }
 */
function verifyScriptIntegrity(scriptPath, scriptName) {
  const config = loadScriptHashes();

  // If verification is disabled globally, allow all scripts
  if (!config.verification?.enabled) {
    logger.warn('Script integrity verification is DISABLED', { script: scriptName });
    return { valid: true, reason: 'verification_disabled' };
  }

  // Check if script exists in config
  const scriptConfig = config.scripts[scriptName];
  if (!scriptConfig) {
    logger.error('Script not registered in hash config', { script: scriptName });
    return { valid: false, reason: 'script_not_registered' };
  }

  // Calculate current hash
  let currentHash;
  try {
    currentHash = calculateFileHash(scriptPath);
  } catch (error) {
    logger.error('Failed to calculate script hash', { script: scriptName, error: error.message });
    return { valid: false, reason: 'hash_calculation_failed' };
  }

  // If expected hash is empty and not in strict mode, allow (first run scenario)
  if (!scriptConfig.sha256 && !config.verification.strictMode) {
    logger.warn('Script has no registered hash (first run)', {
      script: scriptName,
      currentHash,
      advice: 'Add this hash to config/script-hashes.json'
    });
    return { valid: true, reason: 'first_run_allowed' };
  }

  // Verify hash matches
  if (currentHash !== scriptConfig.sha256) {
    logger.error('Script integrity verification FAILED - hash mismatch!', {
      script: scriptName,
      expected: scriptConfig.sha256,
      actual: currentHash
    });
    return { valid: false, reason: 'hash_mismatch' };
  }

  // Check file permissions (should not be world-writable)
  try {
    const stats = fs.statSync(scriptPath);
    const mode = (stats.mode & parseInt('777', 8)).toString(8);

    // Warn if world-writable (last digit should not be 2, 3, 6, or 7)
    const worldWritable = ['2', '3', '6', '7'].includes(mode[2]);
    if (worldWritable) {
      logger.error('Script is WORLD-WRITABLE - security risk!', {
        script: scriptName,
        permissions: mode
      });
      return { valid: false, reason: 'insecure_permissions' };
    }

    logger.debug('Script integrity verified', {
      script: scriptName,
      hash: currentHash,
      permissions: mode
    });
  } catch (error) {
    logger.error('Failed to check script permissions', { script: scriptName, error: error.message });
    return { valid: false, reason: 'permission_check_failed' };
  }

  return { valid: true, reason: 'verified' };
}

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
    execAsync = defaultExecAsync,
    // Allow tests to override auth middleware
    authMiddleware = authenticate,
    authzMiddleware = authorize
  } = deps;

  // POST /api/control/clear-cache - Clear file cache
  // Requires admin role for security
  router.post('/clear-cache', authMiddleware, authzMiddleware('admin'), (req, res) => {
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
  // Requires admin role for security
  // NOTE: This endpoint is deprecated in multi-project architecture
  // File watchers are now managed per-project in the projectWatchers Map
  router.post('/restart-watcher', authMiddleware, authzMiddleware('admin'), async (req, res) => {
    try {
      logger.warn('restart-watcher endpoint is deprecated in multi-project architecture');

      // Return deprecation notice
      return res.status(501).json({
        success: false,
        message: 'This endpoint is deprecated. File watchers are now managed per-project automatically.',
        deprecated: true,
        suggestion: 'Use the project-specific watcher management endpoints instead'
      });
    } catch (error) {
      logger.error('Error restarting watcher', { error });
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/control/restart-bridge - Restart telemetry bridge (SELF-HEALING)
  // Requires admin role for security - controls system process execution
  router.post('/restart-bridge', authMiddleware, authzMiddleware('admin'), async (req, res) => {
    try {
      logger.info('Restarting telemetry bridge');

      // Stop existing bridge if running
      // Use absolute path for security
      const stopScript = join(PROJECT_ROOT, 'scripts', 'stop-claude-bridge.sh');
      const stopScriptName = basename(stopScript);

      // Validate script exists before executing
      if (!fs.existsSync(stopScript)) {
        throw new Error(`Stop script not found: ${stopScript}`);
      }

      // SECURITY: Verify script integrity before execution
      const stopVerification = verifyScriptIntegrity(stopScript, stopScriptName);
      if (!stopVerification.valid) {
        throw new Error(`Script integrity verification failed: ${stopVerification.reason}`);
      }

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
      // Use absolute path for security
      const startScript = join(PROJECT_ROOT, 'scripts', 'start-claude-bridge.sh');
      const startScriptName = basename(startScript);

      // Validate script exists before executing
      if (!fs.existsSync(startScript)) {
        throw new Error(`Start script not found: ${startScript}`);
      }

      // SECURITY: Verify script integrity before execution
      const startVerification = verifyScriptIntegrity(startScript, startScriptName);
      if (!startVerification.valid) {
        throw new Error(`Script integrity verification failed: ${startVerification.reason}`);
      }

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
