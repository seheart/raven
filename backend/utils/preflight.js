/**
 * Pre-flight Checks - Verify system readiness before startup
 * Ensures all prerequisites are met before starting Raven
 */

import { logger } from './logger.js';
import {
  isPortInUse,
  checkDiskSpace,
  ensureDirectory,
  formatBytes,
  getSystemInfo
} from './startup.js';
import fs from 'fs';
import path from 'path';

const REQUIRED_DISK_SPACE_MB = 100;
const MINIMUM_MEMORY_MB = 512;

/**
 * Run all pre-flight checks
 * @param {Object} config - Configuration
 * @returns {Promise<Object>} Check results
 */
export async function runPreflightChecks(config) {
  logger.info('🔍 Running pre-flight checks...');

  const results = {
    passed: [],
    failed: [],
    warnings: []
  };

  // Check 1: System resources
  try {
    const sysCheck = await checkSystemResources();
    if (sysCheck.passed) {
      results.passed.push('System resources');
      logger.info('  ✓ System resources OK', sysCheck.details);
    } else {
      results.failed.push('System resources');
      logger.error('  ✗ System resources insufficient', sysCheck.details);
      return { success: false, results, critical: sysCheck };
    }
  } catch (error) {
    results.failed.push('System resources');
    logger.error('  ✗ System check failed', { error: error.message });
    return { success: false, results, critical: { error: error.message } };
  }

  // Check 2: Disk space
  try {
    const diskCheck = await checkDiskSpaceRequirement(config.RAVEN_DIR);
    if (diskCheck.passed) {
      results.passed.push('Disk space');
      logger.info(`  ✓ Disk space OK (${formatBytes(diskCheck.available)} available)`);
    } else {
      results.failed.push('Disk space');
      logger.error('  ✗ Insufficient disk space', diskCheck);
      return { success: false, results, critical: diskCheck };
    }
  } catch (error) {
    results.warnings.push('Disk space check failed');
    logger.warn('  ⚠ Could not verify disk space', { error: error.message });
  }

  // Check 3: Required directories
  try {
    const dirCheck = await checkRequiredDirectories(config.RAVEN_DIR);
    if (dirCheck.passed) {
      results.passed.push('Required directories');
      logger.info(
        `  ✓ All directories OK (${dirCheck.created} created, ${dirCheck.existing} existing)`
      );
    } else {
      results.failed.push('Required directories');
      logger.error('  ✗ Directory check failed', dirCheck);
    }
  } catch (error) {
    results.failed.push('Required directories');
    logger.error('  ✗ Directory check failed', { error: error.message });
  }

  // Check 4: Port availability
  try {
    const portCheck = await checkPortsAvailable(config.PORT, config.FRONTEND_PORT || 9000);
    if (portCheck.passed) {
      results.passed.push('Port availability');
      logger.info(`  ✓ Ports available (${config.PORT}, ${config.FRONTEND_PORT || 9000})`);
    } else {
      results.warnings.push('Ports in use (will be cleaned)');
      logger.warn('  ⚠ Ports in use, will attempt cleanup', portCheck);
    }
  } catch (error) {
    results.warnings.push('Port check failed');
    logger.warn('  ⚠ Could not verify ports', { error: error.message });
  }

  // Check 5: Node modules
  try {
    const depsCheck = await checkDependencies();
    if (depsCheck.passed) {
      results.passed.push('Dependencies');
      logger.info('  ✓ Dependencies installed');
    } else {
      results.warnings.push('Missing dependencies');
      logger.warn('  ⚠ Some dependencies missing', depsCheck);
    }
  } catch (error) {
    results.warnings.push('Dependency check failed');
    logger.warn('  ⚠ Could not verify dependencies', { error: error.message });
  }

  // Check 6: Database integrity (if databases exist)
  try {
    const dbCheck = await checkDatabaseIntegrity(config.RAVEN_DIR);
    if (dbCheck.checked > 0) {
      if (dbCheck.corrupt === 0) {
        results.passed.push('Database integrity');
        logger.info(`  ✓ Database integrity OK (${dbCheck.checked} databases checked)`);
      } else {
        results.warnings.push('Corrupt databases detected');
        logger.warn(`  ⚠ Found ${dbCheck.corrupt} corrupt databases`, dbCheck);
      }
    }
  } catch (error) {
    results.warnings.push('Database integrity check failed');
    logger.warn('  ⚠ Could not verify database integrity', { error: error.message });
  }

  const success = results.failed.length === 0;

  logger.info(
    `Pre-flight complete: ${results.passed.length} passed, ${results.failed.length} failed, ${results.warnings.length} warnings`
  );

  return {
    success,
    results,
    summary: {
      passed: results.passed.length,
      failed: results.failed.length,
      warnings: results.warnings.length
    }
  };
}

/**
 * Check system resources (CPU, memory)
 */
async function checkSystemResources() {
  const sysInfo = await getSystemInfo();

  const freeMemoryMB = Math.floor(sysInfo.freeMemory / 1024 / 1024);
  const passed = freeMemoryMB >= MINIMUM_MEMORY_MB;

  return {
    passed,
    details: {
      cpus: sysInfo.cpus,
      totalMemory: formatBytes(sysInfo.totalMemory),
      freeMemory: formatBytes(sysInfo.freeMemory),
      freeMemoryMB,
      platform: sysInfo.platform,
      nodeVersion: sysInfo.nodeVersion
    }
  };
}

/**
 * Check disk space requirement
 */
async function checkDiskSpaceRequirement(ravenDir) {
  const diskSpace = await checkDiskSpace(ravenDir);

  const requiredBytes = REQUIRED_DISK_SPACE_MB * 1024 * 1024;
  const passed = diskSpace.available >= requiredBytes;

  return {
    passed,
    available: diskSpace.available,
    required: requiredBytes,
    percentUsed: diskSpace.percentUsed
  };
}

/**
 * Check and create required directories
 */
async function checkRequiredDirectories(ravenDir) {
  const requiredDirs = [
    ravenDir,
    path.join(ravenDir, 'db'),
    path.join(ravenDir, 'snapshots'),
    'logs'
  ];

  let created = 0;
  let existing = 0;
  const failed = [];

  for (const dir of requiredDirs) {
    if (fs.existsSync(dir)) {
      existing++;
    } else {
      const success = await ensureDirectory(dir);
      if (success) {
        created++;
      } else {
        failed.push(dir);
      }
    }
  }

  return {
    passed: failed.length === 0,
    created,
    existing,
    failed
  };
}

/**
 * Check if required ports are available
 */
async function checkPortsAvailable(backendPort, frontendPort) {
  const backendInUse = await isPortInUse(backendPort);
  const frontendInUse = await isPortInUse(frontendPort);

  return {
    passed: !backendInUse && !frontendInUse,
    ports: {
      backend: { port: backendPort, inUse: backendInUse },
      frontend: { port: frontendPort, inUse: frontendInUse }
    }
  };
}

/**
 * Check if dependencies are installed
 */
async function checkDependencies() {
  const backendModules = fs.existsSync('node_modules');
  const frontendModules = fs.existsSync('frontend/node_modules');

  return {
    passed: backendModules && frontendModules,
    backend: backendModules,
    frontend: frontendModules
  };
}

/**
 * Check database integrity
 */
async function checkDatabaseIntegrity(ravenDir) {
  const dbDir = path.join(ravenDir, 'db');

  if (!fs.existsSync(dbDir)) {
    return { checked: 0, corrupt: 0 };
  }

  const dbFiles = fs.readdirSync(dbDir).filter(f => f.endsWith('.db'));

  let checked = 0;
  let corrupt = 0;
  const corruptFiles = [];

  // Simple check: verify files are readable and non-zero size
  for (const dbFile of dbFiles) {
    const dbPath = path.join(dbDir, dbFile);
    checked++;

    try {
      const stats = fs.statSync(dbPath);
      if (stats.size === 0) {
        corrupt++;
        corruptFiles.push(dbFile);
      }
    } catch (error) {
      corrupt++;
      corruptFiles.push(dbFile);
    }
  }

  return {
    checked,
    corrupt,
    corruptFiles
  };
}
