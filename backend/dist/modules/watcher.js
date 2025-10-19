/**
 * Watcher - File system monitoring
 *
 * Watches a project directory for file changes and emits events via EventBus.
 * Handles debouncing, ignore patterns, and file content tracking.
 */
import chokidar from 'chokidar';
import fs from 'fs/promises';
import { createHash } from 'crypto';
import { EventBus } from './eventBus.js';
import { relative } from 'path';
export class FileWatcher {
    watcher = null;
    config;
    fileCache = new Map();
    constructor(config) {
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
    start() {
        if (this.watcher) {
            console.warn('⚠️  File watcher already running');
            return;
        }
        console.log(`📁 Starting file watcher: ${this.config.watchPath}`);
        this.watcher = chokidar.watch(this.config.watchPath, {
            ignored: this.config.ignored,
            persistent: this.config.persistent,
            ignoreInitial: this.config.ignoreInitial,
            awaitWriteFinish: this.config.awaitWriteFinish
        });
        this.watcher
            .on('add', (path) => this.handleFileEvent('add', path))
            .on('change', (path) => this.handleFileEvent('change', path))
            .on('unlink', (path) => this.handleFileEvent('unlink', path))
            .on('error', (error) => {
            console.error('❌ Watcher error:', error);
        })
            .on('ready', () => {
            console.log('✅ File watcher ready');
        });
    }
    /**
     * Stop watching
     */
    async stop() {
        if (this.watcher) {
            await this.watcher.close();
            this.watcher = null;
            this.fileCache.clear();
            console.log('🛑 File watcher stopped');
        }
    }
    /**
     * Handle file system events
     */
    async handleFileEvent(eventType, filepath) {
        try {
            const relPath = relative(this.config.watchPath, filepath);
            let content;
            let hash;
            let size;
            // Read file content for add/change events
            if (eventType === 'add' || eventType === 'change') {
                try {
                    content = await fs.readFile(filepath, 'utf8');
                    size = content.length;
                    hash = this.calculateFileHash(content);
                    // Update cache
                    this.fileCache.set(filepath, content);
                }
                catch (readError) {
                    // File might be binary or unreadable
                    console.warn(`⚠️  Could not read file: ${relPath}`);
                    return;
                }
            }
            else if (eventType === 'unlink') {
                // Remove from cache
                this.fileCache.delete(filepath);
            }
            // Create event
            const event = {
                type: eventType,
                path: relPath,
                ts: Date.now(),
                content,
                hash,
                size
            };
            // Emit to EventBus
            EventBus.emitFileEvent(event);
            // Log
            const emoji = eventType === 'add' ? '📄' : eventType === 'change' ? '✏️' : '🗑️';
            console.log(`${emoji} File ${eventType}: ${relPath}${size ? ` (${size} bytes)` : ''}`);
        }
        catch (error) {
            console.error(`❌ Error handling ${eventType} event for ${filepath}:`, error);
        }
    }
    /**
     * Calculate SHA-256 hash of file content
     */
    calculateFileHash(content) {
        return createHash('sha256').update(content).digest('hex');
    }
    /**
     * Get cached content for a file
     */
    getCachedContent(filepath) {
        return this.fileCache.get(filepath);
    }
    /**
     * Check if watcher is running
     */
    isRunning() {
        return this.watcher !== null;
    }
    /**
     * Get list of watched files (from cache)
     */
    getWatchedFiles() {
        return Array.from(this.fileCache.keys());
    }
}
//# sourceMappingURL=watcher.js.map