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

export interface WatcherConfig {
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
        logger.error('Watcher error', {
          error: error?.message || String(error),
          stack: error?.stack
        });
      })
      .on('ready', () => {
        logger.info('File watcher ready');
      });
  }

  /**
   * Stop watching
   */
  async stop(): Promise<void> {
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
        } catch (readError) {
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

      // Log
      logger.info('File event', {
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
   * Get list of watched files (from cache)
   */
  getWatchedFiles(): string[] {
    return Array.from(this.fileCache.keys());
  }
}
