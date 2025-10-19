/**
 * Git - Git repository monitoring
 *
 * Monitors git status, tracks branches, and detects uncommitted changes.
 * Emits git status events via EventBus for visualization.
 */
import { StatusResult } from 'simple-git';
import { GitStatusEvent } from './eventBus.js';
export interface GitMonitorConfig {
    repoPath: string;
    pollIntervalMs?: number;
    enableAutoPoll?: boolean;
}
export declare class GitMonitor {
    private git;
    private config;
    private pollIntervalId;
    private lastStatus;
    constructor(config: GitMonitorConfig);
    /**
     * Check if path is a git repository
     */
    isGitRepo(): Promise<boolean>;
    /**
     * Start monitoring git status at configured interval
     */
    start(): Promise<void>;
    /**
     * Stop monitoring
     */
    stop(): void;
    /**
     * Check current git status and emit event if changed
     */
    checkStatus(): Promise<GitStatusEvent | null>;
    /**
     * Get diff for a specific file
     */
    getFileDiff(filepath: string): Promise<string>;
    /**
     * Get all uncommitted changes as diff
     */
    getUncommittedDiff(): Promise<string>;
    /**
     * Get staged changes as diff
     */
    getStagedDiff(): Promise<string>;
    /**
     * Get current branch name
     */
    getCurrentBranch(): Promise<string>;
    /**
     * Get list of all branches
     */
    getBranches(): Promise<string[]>;
    /**
     * Get commit history (last N commits)
     */
    getCommitHistory(limit?: number): Promise<readonly any[]>;
    /**
     * Check if status has changed since last check
     */
    private hasStatusChanged;
    /**
     * Check if monitor is running
     */
    isRunning(): boolean;
    /**
     * Get last known status
     */
    getLastStatus(): StatusResult | null;
}
//# sourceMappingURL=git.d.ts.map