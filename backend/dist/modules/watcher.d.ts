/**
 * Watcher - File system monitoring
 *
 * Watches a project directory for file changes and emits events via EventBus.
 * Handles debouncing, ignore patterns, and file content tracking.
 */
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
}
export declare class FileWatcher {
    private watcher;
    private config;
    private fileCache;
    constructor(config: WatcherConfig);
    /**
     * Start watching the configured path
     */
    start(): void;
    /**
     * Stop watching
     */
    stop(): Promise<void>;
    /**
     * Handle file system events
     */
    private handleFileEvent;
    /**
     * Calculate SHA-256 hash of file content
     */
    private calculateFileHash;
    /**
     * Get cached content for a file
     */
    getCachedContent(filepath: string): string | undefined;
    /**
     * Check if watcher is running
     */
    isRunning(): boolean;
    /**
     * Get list of watched files (from cache)
     */
    getWatchedFiles(): string[];
}
//# sourceMappingURL=watcher.d.ts.map