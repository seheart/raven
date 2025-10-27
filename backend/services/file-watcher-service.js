/**
 * File Watcher Service
 *
 * Centralized service for managing file system watchers across all projects.
 * Handles file change detection, debouncing, and event emission.
 */

import chokidar from 'chokidar';
import { join } from 'path';
import { logger } from '../utils/logger.js';

export class FileWatcherService {
  constructor(options = {}) {
    this.io = options.io;
    this.handleFileChange = options.handleFileChange;
    this.projectPaths = options.projectPaths || new Map();
    this.watchers = new Map();
    this.stats = {
      totalEvents: 0,
      addEvents: 0,
      changeEvents: 0,
      unlinkEvents: 0
    };

    // Configuration
    this.FILE_WATCH_DEBOUNCE_MS = options.debounceMs || 150;

    // Memoization cache for shouldIgnore results (LRU cache with 1000 entries)
    this.ignoreCache = new Map();
    this.maxIgnoreCacheSize = 1000;
    this.defaultIgnored = [
      // Dotfiles (regex)
      /(^|[\/\\])\../,

      // Node.js
      '**/node_modules/**',
      /node_modules/,

      // Version control
      '**/.git/**',
      /\.git/,

      // Build outputs
      '**/target/**',
      '**/dist/**',
      '**/build/**',
      /\/(target|dist|build)\//,

      // Cache directories
      '**/.cache/**',
      '**/.next/**',
      '**/.turbo/**',
      '**/.svelte-kit/**',
      '**/coverage/**',
      /\/(\.cache|\.next|\.turbo|\.svelte-kit|coverage)\//,

      // Raven specific
      '**/.raven/**',
      /\.raven/,

      // Log files
      '**/*.log',
      /\.log$/,

      // Python virtual environments (both glob and regex for reliability)
      '**/venv/**',
      '**/.venv/**',
      '**/env/**',
      '**/virtualenv/**',
      /\/(venv|\.venv|env|virtualenv)\//,

      // Python cache and compiled files
      '**/__pycache__/**',
      '**/*.pyc',
      '**/*.pyo',
      '**/.pytest_cache/**',
      /__pycache__/,
      /\.py[co]$/,

      // Python site-packages (this is where torch and other heavy packages live)
      '**/site-packages/**',
      '**/dist-packages/**',
      /\/(site-packages|dist-packages)\//,

      // Vendor directories
      '**/vendor/**',
      /\/vendor\//,

      // macOS
      '**/.DS_Store',
      /\.DS_Store$/
    ];
  }

  /**
   * Set the Socket.io instance for real-time event emission
   */
  setIO(io) {
    this.io = io;
  }

  /**
   * Set the file change handler callback
   */
  setFileChangeHandler(handler) {
    this.handleFileChange = handler;
  }

  /**
   * Initialize a watcher for a specific project
   */
  initializeWatcher(projectName) {
    const projectPath = this.projectPaths.get(projectName);
    if (!projectPath) {
      logger.error(`Cannot create watcher for ${projectName}: path not found`);
      return null;
    }

    // Allow custom ignore patterns via environment variable
    const customIgnored = process.env.CHOKIDAR_IGNORE_PATTERNS
      ? process.env.CHOKIDAR_IGNORE_PATTERNS.split(',').map(p => p.trim())
      : [];

    // Platform detection
    const isMacOS = process.platform === 'darwin';

    // Special handling for projects with heavy dependencies
    const isRavenProject = projectName === 'raven';
    const isEchoProject = projectName === 'echo';

    // Skip echo project entirely due to massive venv directories
    if (isEchoProject) {
      logger.warn(`⚠️  Skipping file watcher for ${projectName} (has massive Python venv directories)`);
      logger.warn(`   To manually track changes in ${projectName}, use git or manual refresh`);
      return null;
    }

    let watchPaths;
    if (isRavenProject) {
      // Raven: only watch specific directories
      watchPaths = [
        join(projectPath, 'docs'),
        join(projectPath, 'test_workspace'),
        join(projectPath, 'backend/*.js'),
        join(projectPath, 'frontend/src'),
        join(projectPath, '*.md'),
        join(projectPath, '*.sh')
      ];
    } else {
      watchPaths = projectPath;
    }

    // Create a function to check if path should be ignored (with memoization)
    const shouldIgnore = (path, stats) => {
      // Normalize path to use forward slashes
      const normalizedPath = path.replace(/\\/g, '/');

      // Check memoization cache first
      if (this.ignoreCache.has(normalizedPath)) {
        return this.ignoreCache.get(normalizedPath);
      }

      let shouldIgnoreResult = false;

      // AGGRESSIVE: Check for Python venv directories first (most common cause of issues)
      const venvPatterns = ['/venv/', '/.venv/', '/env/', '/virtualenv/',
                            '/site-packages/', '/dist-packages/', '/__pycache__/'];

      for (const pattern of venvPatterns) {
        if (normalizedPath.includes(pattern)) {
          shouldIgnoreResult = true;
          break;
        }
      }

      // Check if path ends with common venv directory names
      if (!shouldIgnoreResult) {
        const pathParts = normalizedPath.split('/');
        const lastPart = pathParts[pathParts.length - 1];
        if (['venv', '.venv', 'env', 'virtualenv', 'site-packages', 'dist-packages', '__pycache__'].includes(lastPart)) {
          shouldIgnoreResult = true;
        }
      }

      // Check against default patterns
      if (!shouldIgnoreResult) {
        for (const pattern of [...this.defaultIgnored, ...customIgnored]) {
          if (pattern instanceof RegExp) {
            if (pattern.test(normalizedPath)) {
              shouldIgnoreResult = true;
              break;
            }
          } else if (typeof pattern === 'string') {
            // Simple glob matching for common patterns
            const cleanPattern = pattern.replace(/\*\*/g, '').replace(/\*/g, '');
            if (normalizedPath.includes(cleanPattern)) {
              shouldIgnoreResult = true;
              break;
            }
          }
        }
      }

      // Store in cache with LRU eviction
      if (this.ignoreCache.size >= this.maxIgnoreCacheSize) {
        // Remove oldest entry (first key in Map maintains insertion order)
        const firstKey = this.ignoreCache.keys().next().value;
        this.ignoreCache.delete(firstKey);
      }
      this.ignoreCache.set(normalizedPath, shouldIgnoreResult);

      return shouldIgnoreResult;
    };

    const watcher = chokidar.watch(watchPaths, {
      ignored: shouldIgnore,
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 100,
        pollInterval: this.FILE_WATCH_DEBOUNCE_MS
      },
      usePolling: false,
      useFsEvents: isMacOS,
      depth: 99,
      ignorePermissionErrors: true
    });

    watcher
      .on('add', filepath => {
        this.stats.addEvents++;
        this.stats.totalEvents++;
        if (this.handleFileChange) {
          this.handleFileChange('add', filepath);
        }
      })
      .on('change', filepath => {
        this.stats.changeEvents++;
        this.stats.totalEvents++;
        if (this.handleFileChange) {
          this.handleFileChange('change', filepath);
        }
      })
      .on('unlink', filepath => {
        this.stats.unlinkEvents++;
        this.stats.totalEvents++;
        if (this.handleFileChange) {
          this.handleFileChange('unlink', filepath);
        }
      })
      .on('error', error => {
        logger.error(`Watcher error [${projectName}]:`, error);

        if (this.io) {
          this.io.emit('file-watcher-error', {
            project: projectName,
            timestamp: new Date().toISOString(),
            message: error.message || 'File watcher encountered an error',
            error: error.toString()
          });
        }
      })
      .on('ready', () => {
        logger.info('File watcher ready', { projectName });
      });

    this.watchers.set(projectName, watcher);
    return watcher;
  }

  /**
   * Initialize watchers for all projects
   */
  initializeAllWatchers() {
    logger.info('Starting file watchers for all projects');

    let successCount = 0;
    let failCount = 0;

    for (const [projectName, projectPath] of this.projectPaths.entries()) {
      const watcher = this.initializeWatcher(projectName);
      if (watcher) {
        successCount++;
        logger.info(`Watcher initialized for ${projectName}`, { path: projectPath });
      } else {
        failCount++;
      }
    }

    logger.info(`File watchers initialized: ${successCount} successful, ${failCount} failed`);

    return {
      success: successCount,
      failed: failCount,
      total: this.projectPaths.size
    };
  }

  /**
   * Stop a specific watcher
   */
  async stopWatcher(projectName) {
    const watcher = this.watchers.get(projectName);
    if (watcher) {
      await watcher.close();
      this.watchers.delete(projectName);
      logger.info(`Watcher stopped for ${projectName}`);
      return true;
    }
    return false;
  }

  /**
   * Stop all watchers
   */
  async stopAllWatchers() {
    logger.info('Stopping all file watchers');

    const promises = [];
    for (const [projectName, watcher] of this.watchers.entries()) {
      promises.push(
        watcher.close().then(() => {
          logger.info(`Watcher closed for ${projectName}`);
        }).catch(error => {
          logger.error(`Error closing watcher for ${projectName}:`, error);
        })
      );
    }

    await Promise.all(promises);
    this.watchers.clear();
    logger.info('All watchers stopped');
  }

  /**
   * Get watcher statistics
   */
  getStats() {
    return {
      ...this.stats,
      activeWatchers: this.watchers.size,
      projects: Array.from(this.watchers.keys())
    };
  }

  /**
   * Check if a project has an active watcher
   */
  hasWatcher(projectName) {
    return this.watchers.has(projectName);
  }

  /**
   * Get watcher for a specific project
   */
  getWatcher(projectName) {
    return this.watchers.get(projectName);
  }

  /**
   * Restart a watcher for a specific project
   */
  async restartWatcher(projectName) {
    await this.stopWatcher(projectName);
    return this.initializeWatcher(projectName);
  }
}

export default FileWatcherService;
