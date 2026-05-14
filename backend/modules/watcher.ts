/**
 * Watcher - File system monitoring
 *
 * Watches a project directory for file changes and emits events via EventBus.
 * Handles debouncing, ignore patterns, and file content tracking.
 */

import chokidar, { FSWatcher } from 'chokidar';
import fs from 'fs/promises';
import { createHash } from 'crypto';
import { EventBus, FileEvent } from './eventBus.js';
import { relative } from 'path';
import { logger } from '../utils/logger.js';

interface WatcherConfig {
  watchPath: string;
  ignored?: (string | RegExp)[];
  debounceMs?: number;
  ignoreInitial?: boolean;
  persistent?: boolean;
  awaitWriteFinish?: {
    stabilityThreshold: number;
    pollInterval: number;
  };
  projectName?: string;
  projectPath?: string;
  /**
   * Skip reading files larger than this many bytes. Defaults to ~5MB.
   * Set 0 (or negative) to disable the limit. Oversized files still
   * generate change events, just without content/diff.
   */
  maxFileSize?: number;
}

const DEFAULT_MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

export class FileWatcher {
  private watcher: FSWatcher | null = null;
  private config: WatcherConfig;
  private fileCache: Map<string, string> = new Map();
  private pendingOps: Map<string, Promise<void>> = new Map();
  private restartAttempts = 0;
  private static readonly MAX_RESTART_ATTEMPTS = 5;
  // Backoff between auto-restarts. Exponential so a permanent FS problem
  // doesn't keep us spinning. Caps at 5 attempts; after that the subsystem
  // is marked unhealthy and surfaces in /api/health.
  private static readonly RESTART_BACKOFF_MS = [1_000, 5_000, 15_000, 60_000, 300_000];
  private restartTimer: ReturnType<typeof setTimeout> | null = null;
  private permanentlyFailed = false;
  private lastErrorMessage: string | null = null;

  constructor(config: WatcherConfig) {
    this.config = {
      ignored: [
        /(^|[\/\\])\../,
        '**/node_modules/**',
        '**/.git/**',
        '**/target/**',
        '**/.raven/**',
        '**/*.log',
        '**/dist/**',
        '**/.cache/**',
        // Database files (can be huge, cause OOM)
        '**/*.db',
        '**/*.db-wal',
        '**/*.db-shm',
        '**/snapshots/**',
        // Python virtual environments and packages
        '**/venv/**',
        '**/.venv/**',
        '**/env/**',
        '**/virtualenv/**',
        '**/site-packages/**',
        '**/dist-packages/**',
        '**/__pycache__/**',
        '**/*.pyc',
        '**/*.pyo',
        ...(config.ignored || [])
      ],
      debounceMs: 50,
      ignoreInitial: true,
      persistent: true,
      awaitWriteFinish: {
        stabilityThreshold: 100,
        pollInterval: 50
      },
      ...config
    };
  }

  /**
   * Start watching the configured path
   */
  start(): void {
    if (this.watcher) {
      logger.warn('File watcher already running');
      return;
    }

    logger.info('Starting file watcher', { watchPath: this.config.watchPath });

    this.watcher = chokidar.watch(this.config.watchPath, {
      ignored: (path: string) => {
        // Use a function for more reliable ignoring
        // Ignore dotfiles/dotfolders
        if (/(^|[\\/])\../.test(path)) return true;

        // Ignore specific directories and files
        const ignorePatterns = [
          '/.raven/',
          '/node_modules/',
          '/.git/',
          '/target/',
          '/dist/',
          '/.cache/',
          '/snapshots/',
          '/venv/',
          '/.venv/',
          '/env/',
          '/virtualenv/',
          '/site-packages/',
          '/dist-packages/',
          '/__pycache__/'
        ];

        // Check if path contains any ignore pattern
        if (ignorePatterns.some(pattern => path.includes(pattern))) {
          return true;
        }

        // Ignore specific file extensions
        const ignoreExtensions = ['.log', '.db', '.db-wal', '.db-shm', '.pyc', '.pyo'];

        if (ignoreExtensions.some(ext => path.endsWith(ext))) {
          return true;
        }

        return false;
      },
      persistent: this.config.persistent,
      ignoreInitial: this.config.ignoreInitial,
      awaitWriteFinish: this.config.awaitWriteFinish,
      // Use polling mode to avoid hitting Linux inotify limits
      // when watching large directory trees with many files
      usePolling: true,
      interval: 1000, // Poll every 1s for normal files
      binaryInterval: 3000, // Poll every 3s for binary files
      // Limit depth to prevent deep recursion into node_modules/venv
      depth: 10, // Deep enough to reach nested source files
      ignorePermissionErrors: true
    });

    this.watcher
      .on('add', (path: string) => this.handleFileEvent('add', path))
      .on('change', (path: string) => this.handleFileEvent('change', path))
      .on('unlink', (path: string) => this.handleFileEvent('unlink', path))
      .on('error', (error: any) => {
        const msg = error?.message || String(error);
        this.lastErrorMessage = msg;
        logger.error('Watcher error', { error: msg, stack: error?.stack });
        // Chokidar can survive transient errors, but some FS conditions
        // (inotify exhaustion, FS unmounted) leave the instance in a wedged
        // state where nothing fires after this point. Schedule a restart;
        // capped at MAX_RESTART_ATTEMPTS so a permanent FS issue stops
        // spinning eventually.
        this.scheduleRestart();
      })
      .on('ready', () => {
        // Reset attempt counter on a clean ready event — we made it back.
        this.restartAttempts = 0;
        this.permanentlyFailed = false;
        this.lastErrorMessage = null;
        logger.info('File watcher ready');
      });
  }

  private scheduleRestart(): void {
    if (this.permanentlyFailed) return;
    if (this.restartTimer) return; // already scheduled

    if (this.restartAttempts >= FileWatcher.MAX_RESTART_ATTEMPTS) {
      this.permanentlyFailed = true;
      logger.error(
        `File watcher permanently failed after ${FileWatcher.MAX_RESTART_ATTEMPTS} restart attempts (last error: ${this.lastErrorMessage})`
      );
      return;
    }

    const delay =
      FileWatcher.RESTART_BACKOFF_MS[
        Math.min(this.restartAttempts, FileWatcher.RESTART_BACKOFF_MS.length - 1)
      ];
    this.restartAttempts++;
    logger.warn(
      `File watcher restart scheduled in ${delay}ms (attempt ${this.restartAttempts}/${FileWatcher.MAX_RESTART_ATTEMPTS})`
    );

    this.restartTimer = setTimeout(() => {
      this.restartTimer = null;
      void (async () => {
        try {
          if (this.watcher) {
            try {
              await this.watcher.close();
            } catch {
              /* close failure is OK — we're replacing it anyway */
            }
            this.watcher = null;
          }
          this.start();
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          this.lastErrorMessage = msg;
          logger.error(`File watcher restart failed: ${msg}`);
          this.scheduleRestart();
        }
      })();
    }, delay);
    this.restartTimer.unref?.();
  }

  /**
   * Stop watching
   */
  async stop(): Promise<void> {
    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }
    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
      this.fileCache.clear();
      logger.info('File watcher stopped');
    }
  }

  /**
   * Handle file system events
   */
  private async handleFileEvent(
    eventType: 'add' | 'change' | 'unlink',
    filepath: string
  ): Promise<void> {
    try {
      const relPath = relative(this.config.watchPath, filepath);

      let content: string | undefined;
      let hash: string | undefined;
      let size: number | undefined;

      // Wait for any pending operations on this file to complete
      if (this.pendingOps.has(filepath)) {
        await this.pendingOps.get(filepath);
      }

      // Read file content for add/change events
      if (eventType === 'add' || eventType === 'change') {
        const operation = (async () => {
          try {
            // Stat first so we can skip oversized files without ever reading
            // their bytes into memory. A single huge file (logs, generated
            // bundles, exports) used to OOM the watcher.
            const maxSize = this.config.maxFileSize ?? DEFAULT_MAX_FILE_SIZE;
            const stats = await fs.stat(filepath);
            size = stats.size;
            if (maxSize > 0 && stats.size > maxSize) {
              logger.warn('Skipping oversized file (no content captured)', {
                relPath,
                size: stats.size,
                maxFileSize: maxSize
              });
              // Drop any cached content so we don't diff against stale data.
              this.fileCache.delete(filepath);
              return; // event still fires below with size only
            }

            content = await fs.readFile(filepath, 'utf8');
            hash = this.calculateFileHash(content);

            // Cap fileCache at 5000 entries
            if (!this.fileCache.has(filepath) && this.fileCache.size >= 5000) {
              const oldestKey = this.fileCache.keys().next().value;
              if (oldestKey) this.fileCache.delete(oldestKey);
            }
            // Update cache atomically after read
            this.fileCache.set(filepath, content);
          } catch (readError) {
            // File might be binary or unreadable
            logger.warn('Could not read file', { relPath });
            throw readError;
          } finally {
            // Remove from pending operations
            this.pendingOps.delete(filepath);
          }
        })();

        this.pendingOps.set(filepath, operation);

        try {
          await operation;
        } catch {
          return;
        }
      } else if (eventType === 'unlink') {
        // Wait for pending operations before deletion
        if (this.pendingOps.has(filepath)) {
          await this.pendingOps.get(filepath);
        }

        // Remove from cache
        this.fileCache.delete(filepath);
        this.pendingOps.delete(filepath);
      }

      // Create event with project tagging
      const event: FileEvent = {
        type: eventType,
        path: relPath,
        ts: Date.now(),
        content,
        hash,
        size,
        projectName: this.config.projectName,
        projectPath: this.config.projectPath || this.config.watchPath
      };

      // Emit to EventBus
      EventBus.emitFileEvent(event);

      logger.debug('File event', {
        eventType,
        path: relPath,
        size
      });
    } catch (error: any) {
      logger.error('Error handling file event', {
        eventType,
        filepath,
        error: error.message,
        stack: error.stack
      });
    }
  }

  /**
   * Calculate SHA-256 hash of file content
   */
  private calculateFileHash(content: string): string {
    return createHash('sha256').update(content).digest('hex');
  }

  /**
   * Get cached content for a file
   */
  getCachedContent(filepath: string): string | undefined {
    return this.fileCache.get(filepath);
  }

  /**
   * Check if watcher is running
   */
  isRunning(): boolean {
    return this.watcher !== null;
  }

  /**
   * Watcher health for /api/health. Reports the auto-restart state so the UI
   * can show "watcher unhealthy" once the cap is hit instead of just "off".
   */
  health(): {
    running: boolean;
    permanentlyFailed: boolean;
    restartAttempts: number;
    lastError: string | null;
  } {
    return {
      running: this.watcher !== null && !this.permanentlyFailed,
      permanentlyFailed: this.permanentlyFailed,
      restartAttempts: this.restartAttempts,
      lastError: this.lastErrorMessage
    };
  }

  /**
   * Get list of watched files (from cache)
   */
  getWatchedFiles(): string[] {
    return Array.from(this.fileCache.keys());
  }
}
