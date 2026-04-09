/**
 * File Watcher Service
 *
 * Centralized service for managing file system watchers across all projects.
 * Handles file change detection, debouncing, and event emission.
 */

import chokidar, { FSWatcher } from 'chokidar';
import { join } from 'path';
import type {
  ProjectName,
  SocketIOServer,
  FileWatcherServiceOptions,
  FileWatcherStats,
  WatcherInitResult
} from '../types/index.js';
import { logger } from '../utils/logger.js';

/**
 * File type for chokidar's ignored function
 */
type IgnoreFn = (path: string, stats?: unknown) => boolean;

/**
 * Ignore pattern type
 */
type IgnorePattern = RegExp | string;

export class FileWatcherService {
  private io?: SocketIOServer;
  private handleFileChange?: (eventType: string, filepath: string) => void | Promise<void>;
  private projectPaths: Map<ProjectName, string>;
  private watchers: Map<ProjectName, FSWatcher>;
  private stats: {
    totalEvents: number;
    addEvents: number;
    changeEvents: number;
    unlinkEvents: number;
  };
  private FILE_WATCH_DEBOUNCE_MS: number;
  private skipProjects: string[];
  private ignoreCache: Map<string, boolean>;
  private maxIgnoreCacheSize: number;
  private defaultIgnored: IgnorePattern[];

  constructor(options: FileWatcherServiceOptions = {}) {
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
    this.skipProjects = options.skipProjects || ['echo']; // Projects to skip watching

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
  setIO(io: SocketIOServer): void {
    this.io = io;
  }

  /**
   * Set the file change handler callback
   */
  setFileChangeHandler(
    handler: (eventType: string, filepath: string) => void | Promise<void>
  ): void {
    this.handleFileChange = handler;
  }

  /**
   * Initialize a watcher for a specific project
   */
  initializeWatcher(projectName: ProjectName): FSWatcher | null {
    const projectPath = this.projectPaths.get(projectName);
    if (!projectPath) {
      logger.error(`Cannot create watcher for ${projectName}: path not found`);
      return null;
    }

    // Allow custom ignore patterns via environment variable
    const customIgnored: string[] = process.env['CHOKIDAR_IGNORE_PATTERNS']
      ? process.env['CHOKIDAR_IGNORE_PATTERNS'].split(',').map(p => p.trim())
      : [];

    // Platform detection
    const isMacOS = process.platform === 'darwin';

    // Check if project should be skipped (configured in skip list)
    if (this.skipProjects.includes(projectName)) {
      logger.warn(`⚠️  Skipping file watcher for ${projectName} (in skip list)`);
      logger.warn(`   To manually track changes in ${projectName}, use git or manual refresh`);
      return null;
    }

    // Special handling for projects with heavy dependencies
    const isRavenProject = projectName === 'raven';

    let watchPaths: string | string[];
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
    const shouldIgnore: IgnoreFn = (path: string, _stats?: unknown): boolean => {
      // Normalize path to use forward slashes
      const normalizedPath = path.replace(/\\/g, '/');

      // Check memoization cache first
      if (this.ignoreCache.has(normalizedPath)) {
        return this.ignoreCache.get(normalizedPath)!;
      }

      let shouldIgnoreResult = false;

      // AGGRESSIVE: Check for Python venv directories first (most common cause of issues)
      const venvPatterns = [
        '/venv/',
        '/.venv/',
        '/env/',
        '/virtualenv/',
        '/site-packages/',
        '/dist-packages/',
        '/__pycache__/'
      ];

      for (const pattern of venvPatterns) {
        if (normalizedPath.includes(pattern)) {
          shouldIgnoreResult = true;
          break;
        }
      }

      // Check if path ends with common venv directory names
      if (!shouldIgnoreResult) {
        const pathParts = normalizedPath.split('/');
        const lastPart = pathParts[pathParts.length - 1] || '';
        if (
          [
            'venv',
            '.venv',
            'env',
            'virtualenv',
            'site-packages',
            'dist-packages',
            '__pycache__'
          ].includes(lastPart)
        ) {
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
        const firstKey = this.ignoreCache.keys().next().value as string | undefined;
        if (firstKey !== undefined) {
          this.ignoreCache.delete(firstKey);
        }
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
      // Use polling for ALL projects to avoid hitting inotify limits
      // Polling is more resource-friendly when watching multiple large projects
      usePolling: true,
      interval: 3000, // Poll every 3s for normal files
      binaryInterval: 5000, // Poll every 5s for binary files
      // Limit depth to avoid deep node_modules recursion
      depth: isRavenProject ? 99 : 5, // Deep for raven (selective paths), shallow for others
      ignorePermissionErrors: true,
      // useFsEvents is macOS-specific but not in TypeScript types
      ...(isMacOS && ({ useFsEvents: false } as any)) // Disable fsEvents, use polling
    });

    const safeHandle = (type: string, filepath: string) => {
      try {
        if (this.handleFileChange) {
          this.handleFileChange(type, filepath);
        }
      } catch (err) {
        logger.error(`File watcher callback error [${projectName}/${type}]:`, err as any);
      }
    };

    watcher
      .on('add', (filepath: string) => {
        this.stats.addEvents++;
        this.stats.totalEvents++;
        safeHandle('add', filepath);
      })
      .on('change', (filepath: string) => {
        this.stats.changeEvents++;
        this.stats.totalEvents++;
        safeHandle('change', filepath);
      })
      .on('unlink', (filepath: string) => {
        this.stats.unlinkEvents++;
        this.stats.totalEvents++;
        safeHandle('unlink', filepath);
      })
      .on('error', (error: unknown) => {
        const err = error as Error;
        logger.error(`Watcher error [${projectName}]:`, err as any);

        if (this.io) {
          this.io.emit('file-watcher-error', {
            project: projectName,
            timestamp: new Date().toISOString(),
            message: err.message || 'File watcher encountered an error',
            error: err.toString(),
            canRecover: true // Indicate we'll try to recover
          });
        }

        // Attempt automatic recovery after 5 seconds
        logger.info(`Attempting to restart watcher for ${projectName} in 5 seconds...`);
        const recoveryTimer = setTimeout(() => {
          this.restartWatcher(projectName)
            .then(() => {
              logger.info(`Watcher restarted successfully: ${projectName}`);
              if (this.io) {
                this.io.emit('file-watcher-recovered', {
                  project: projectName,
                  timestamp: new Date().toISOString()
                });
              }
            })
            .catch((restartError: unknown) => {
              const restartErr = restartError as Error;
              logger.error(`Failed to restart watcher ${projectName}:`, restartErr as any);
              if (this.io) {
                this.io.emit('file-watcher-failed', {
                  project: projectName,
                  timestamp: new Date().toISOString(),
                  error: restartErr.message
                });
              }
            });
        }, 5000); // Wait 5 seconds before restarting
        recoveryTimer.unref();
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
  initializeAllWatchers(): WatcherInitResult {
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
  async stopWatcher(projectName: ProjectName): Promise<boolean> {
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
   * Restart a specific watcher (stop and reinitialize)
   */
  async restartWatcher(projectName: ProjectName): Promise<FSWatcher> {
    try {
      // Stop existing watcher if it exists
      await this.stopWatcher(projectName);

      // Wait a moment for cleanup
      await new Promise(resolve => setTimeout(resolve, 100));

      // Reinitialize the watcher
      const watcher = this.initializeWatcher(projectName);

      if (!watcher) {
        throw new Error(`Failed to reinitialize watcher for ${projectName}`);
      }

      logger.info(`Watcher restarted for ${projectName}`);
      return watcher;
    } catch (error) {
      logger.error(`Error restarting watcher for ${projectName}:`, error as any);
      throw error;
    }
  }

  /**
   * Stop all watchers
   */
  async stopAllWatchers(): Promise<void> {
    logger.info('Stopping all file watchers');

    const promises: Promise<void>[] = [];
    for (const [projectName, watcher] of this.watchers.entries()) {
      promises.push(
        watcher
          .close()
          .then(() => {
            logger.info(`Watcher closed for ${projectName}`);
          })
          .catch((error: unknown) => {
            logger.error(`Error closing watcher for ${projectName}:`, error as any);
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
  getStats(): FileWatcherStats {
    return {
      ...this.stats,
      activeWatchers: this.watchers.size,
      projects: Array.from(this.watchers.keys())
    };
  }

  /**
   * Check if a project has an active watcher
   */
  hasWatcher(projectName: ProjectName): boolean {
    return this.watchers.has(projectName);
  }

  /**
   * Get watcher for a specific project
   */
  getWatcher(projectName: ProjectName): FSWatcher | undefined {
    return this.watchers.get(projectName);
  }
}
