/**
 * Startup Utilities - Professional-grade boot helpers
 * Provides retry logic, verification, and diagnostic tools
 */

import { logger } from './logger.js';
import fs from 'fs';
import { promisify } from 'util';
import { exec } from 'child_process';

const execAsync = promisify(exec);

/**
 * Retry function with exponential backoff
 * @param {Function} fn - Async function to retry
 * @param {Object} options - Retry options
 * @returns {Promise<any>} Result of the function
 */
export async function withRetry(fn, options = {}) {
  const {
    maxAttempts = 3,
    initialDelay = 1000,
    maxDelay = 5000,
    exponential = true,
    onRetry = null
  } = options;

  let lastError;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (attempt === maxAttempts) {
        throw error;
      }

      const delay = exponential
        ? Math.min(initialDelay * Math.pow(2, attempt - 1), maxDelay)
        : initialDelay;

      if (onRetry) {
        onRetry(attempt, maxAttempts, error, delay);
      } else {
        logger.warn(`Attempt ${attempt}/${maxAttempts} failed, retrying in ${delay}ms...`, {
          error: error.message
        });
      }

      await sleep(delay);
    }
  }

  throw lastError;
}

/**
 * Wait for a condition to be true
 * @param {Function} condition - Function that returns boolean
 * @param {Object} options - Wait options
 * @returns {Promise<boolean>} True if condition met, false if timeout
 */
export async function waitFor(condition, options = {}) {
  const { timeout = 30000, interval = 500, timeoutMessage = 'Condition timeout' } = options;

  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    try {
      const result = await condition();
      if (result) {
        return true;
      }
    } catch (error) {
      // Condition threw error, continue waiting
    }
    await sleep(interval);
  }

  throw new Error(timeoutMessage);
}

/**
 * Sleep for specified milliseconds
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise<void>}
 */
export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Check if port is in use
 * @param {number} port - Port number to check
 * @returns {Promise<boolean>} True if port is in use
 */
export async function isPortInUse(port) {
  try {
    const { stdout } = await execAsync(`lsof -ti:${port} 2>/dev/null || echo ""`);
    return stdout.trim().length > 0;
  } catch (error) {
    return false;
  }
}

/**
 * Check available disk space
 * @param {string} path - Path to check
 * @returns {Promise<Object>} Disk space info
 */
export async function checkDiskSpace(path) {
  try {
    const { stdout } = await execAsync(`df -k "${path}" | tail -1`);
    const parts = stdout.trim().split(/\s+/);

    return {
      total: parseInt(parts[1], 10) * 1024, // KB to bytes
      used: parseInt(parts[2], 10) * 1024,
      available: parseInt(parts[3], 10) * 1024,
      percentUsed: parseInt(parts[4], 10)
    };
  } catch (error) {
    logger.error('Failed to check disk space', { error: error.message });
    return { available: 0 };
  }
}

/**
 * Ensure directory exists, create if not
 * @param {string} dirPath - Directory path
 * @returns {Promise<boolean>} True if exists or created
 */
export async function ensureDirectory(dirPath) {
  try {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
      logger.info(`Created directory: ${dirPath}`);
    }
    return true;
  } catch (error) {
    logger.error(`Failed to create directory: ${dirPath}`, { error: error.message });
    return false;
  }
}

/**
 * Verify file is readable
 * @param {string} filePath - File path
 * @returns {Promise<boolean>} True if readable
 */
export async function isFileReadable(filePath) {
  try {
    await fs.promises.access(filePath, fs.constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get system info
 * @returns {Promise<Object>} System information
 */
export async function getSystemInfo() {
  const os = await import('os');

  return {
    platform: os.platform(),
    arch: os.arch(),
    cpus: os.cpus().length,
    totalMemory: os.totalmem(),
    freeMemory: os.freemem(),
    uptime: os.uptime(),
    nodeVersion: process.version
  };
}

/**
 * Format bytes to human readable
 * @param {number} bytes - Bytes
 * @returns {string} Formatted string
 */
export function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

/**
 * Progress reporter for startup phases
 */
export class ProgressReporter {
  constructor(totalSteps) {
    this.totalSteps = totalSteps;
    this.currentStep = 0;
    this.startTime = Date.now();
  }

  step(message, details = {}) {
    this.currentStep++;
    const elapsed = ((Date.now() - this.startTime) / 1000).toFixed(1);

    logger.info(`[${this.currentStep}/${this.totalSteps}] ${message}`, {
      step: this.currentStep,
      elapsed: `${elapsed}s`,
      ...details
    });
  }

  substep(message, details = {}) {
    const elapsed = ((Date.now() - this.startTime) / 1000).toFixed(1);
    logger.info(`  ↳ ${message}`, {
      elapsed: `${elapsed}s`,
      ...details
    });
  }

  complete() {
    const elapsed = ((Date.now() - this.startTime) / 1000).toFixed(1);
    logger.info(`✅ Startup complete in ${elapsed}s`);
  }

  error(message, error) {
    const elapsed = ((Date.now() - this.startTime) / 1000).toFixed(1);
    logger.error(
      `❌ Startup failed at step ${this.currentStep}/${this.totalSteps} after ${elapsed}s`,
      {
        message,
        error: error.message,
        stack: error.stack
      }
    );
  }
}
