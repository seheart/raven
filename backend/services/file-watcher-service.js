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
    this.defaultIgnored = [
      /(^|[\/\\])\../, // Ignore dotfiles
      '**/node_modules/**',
      '**/.git/**',
      '**/target/**',
      '**/.raven/**',
      '**/*.log',
      '**/dist/**',
      '**/build/**',
      '**/.cache/**',
      '**/.next/**',
      '**/.turbo/**',
      '**/.svelte-kit/**',
      '**/coverage/**',
      '**/.DS_Store'
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

    // Special handling for raven project to avoid watching its own node_modules
    const isRavenProject = projectName === 'raven';
    const watchPaths = isRavenProject ? [
      join(projectPath, 'docs'),
      join(projectPath, 'test_workspace'),
      join(projectPath, 'backend/*.js'),
      join(projectPath, 'frontend/src'),
      join(projectPath, '*.md'),
      join(projectPath, '*.sh')
    ] : projectPath;

    const watcher = chokidar.watch(watchPaths, {
      ignored: [...this.defaultIgnored, ...customIgnored],
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
