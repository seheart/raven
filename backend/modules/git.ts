/**
 * Git - Git repository monitoring
 *
 * Monitors git status, tracks branches, and detects uncommitted changes.
 * Emits git status events via EventBus for visualization.
 */

import simpleGit, { SimpleGit, StatusResult } from 'simple-git';
import { EventBus, GitStatusEvent } from './eventBus.js';
import fs from 'fs/promises';
import { join } from 'path';
import { logger } from '../utils/logger.js';

export interface GitMonitorConfig {
  repoPath: string;
  pollIntervalMs?: number;
  enableAutoPoll?: boolean;
}

export class GitMonitor {
  private git: SimpleGit;
  private config: GitMonitorConfig;
  private pollIntervalId: NodeJS.Timeout | null = null;
  private lastStatus: StatusResult | null = null;

  constructor(config: GitMonitorConfig) {
    this.config = {
      pollIntervalMs: config.pollIntervalMs || 5000,
      enableAutoPoll: config.enableAutoPoll ?? false,
      ...config
    };

    this.git = simpleGit(this.config.repoPath);
  }

  /**
   * Check if path is a git repository
   */
  async isGitRepo(): Promise<boolean> {
    try {
      const gitDir = join(this.config.repoPath, '.git');
      const stats = await fs.stat(gitDir);
      return stats.isDirectory();
    } catch {
      return false;
    }
  }

  /**
   * Start monitoring git status at configured interval
   */
  async start(): Promise<void> {
    const isRepo = await this.isGitRepo();
    if (!isRepo) {
      logger.warn('Not a git repository', { repoPath: this.config.repoPath });
      return;
    }

    if (this.pollIntervalId) {
      logger.warn('Git monitor already running');
      return;
    }

    logger.info('Starting git monitor', { repoPath: this.config.repoPath });

    // Check immediately
    await this.checkStatus();

    // Poll at intervals if enabled
    if (this.config.enableAutoPoll) {
      this.pollIntervalId = setInterval(() => {
        this.checkStatus();
      }, this.config.pollIntervalMs);
    }
  }

  /**
   * Stop monitoring
   */
  stop(): void {
    if (this.pollIntervalId) {
      clearInterval(this.pollIntervalId);
      this.pollIntervalId = null;
      logger.info('Git monitor stopped');
    }
  }

  /**
   * Check current git status and emit event if changed
   */
  async checkStatus(): Promise<GitStatusEvent | null> {
    try {
      const status = await this.git.status();

      // Check if status changed
      const statusChanged = this.hasStatusChanged(status);

      if (statusChanged || !this.lastStatus) {
        const event: GitStatusEvent = {
          branch: status.current || 'unknown',
          modified: status.modified,
          created: status.created,
          deleted: status.deleted,
          ahead: status.ahead,
          behind: status.behind,
          current: status.current || 'unknown'
        };

        // Emit to EventBus
        EventBus.emitGitStatus(event);

        // Log
        logger.info('Git status changed', {
          branch: event.branch,
          modified: event.modified.length,
          created: event.created.length,
          deleted: event.deleted.length
        });

        this.lastStatus = status;
        return event;
      }

      return null;
    } catch (error: any) {
      logger.error('Git status check error', {
        error: error.message,
        stack: error.stack
      });
      return null;
    }
  }

  /**
   * Get diff for a specific file
   */
  async getFileDiff(filepath: string): Promise<string> {
    try {
      const diff = await this.git.diff(['HEAD', '--', filepath]);
      return diff;
    } catch (error: any) {
      logger.error('Error getting file diff', {
        filepath,
        error: error.message,
        stack: error.stack
      });
      return '';
    }
  }

  /**
   * Get all uncommitted changes as diff
   */
  async getUncommittedDiff(): Promise<string> {
    try {
      const diff = await this.git.diff();
      return diff;
    } catch (error: any) {
      logger.error('Error getting uncommitted diff', {
        error: error.message,
        stack: error.stack
      });
      return '';
    }
  }

  /**
   * Get staged changes as diff
   */
  async getStagedDiff(): Promise<string> {
    try {
      const diff = await this.git.diff(['--cached']);
      return diff;
    } catch (error: any) {
      logger.error('Error getting staged diff', {
        error: error.message,
        stack: error.stack
      });
      return '';
    }
  }

  /**
   * Get current branch name
   */
  async getCurrentBranch(): Promise<string> {
    try {
      const branch = await this.git.revparse(['--abbrev-ref', 'HEAD']);
      return branch.trim();
    } catch (error: any) {
      logger.error('Error getting current branch', {
        error: error.message,
        stack: error.stack
      });
      return 'unknown';
    }
  }

  /**
   * Get list of all branches
   */
  async getBranches(): Promise<string[]> {
    try {
      const branches = await this.git.branch();
      return branches.all;
    } catch (error: any) {
      logger.error('Error getting branches', {
        error: error.message,
        stack: error.stack
      });
      return [];
    }
  }

  /**
   * Get commit history (last N commits)
   */
  async getCommitHistory(limit: number = 10): Promise<readonly any[]> {
    try {
      const log = await this.git.log({ maxCount: limit });
      return log.all;
    } catch (error: any) {
      logger.error('Error getting commit history', {
        error: error.message,
        stack: error.stack,
        limit
      });
      return [];
    }
  }

  /**
   * Check if status has changed since last check
   */
  private hasStatusChanged(newStatus: StatusResult): boolean {
    if (!this.lastStatus) return true;

    return (
      this.lastStatus.current !== newStatus.current ||
      this.lastStatus.modified.length !== newStatus.modified.length ||
      this.lastStatus.created.length !== newStatus.created.length ||
      this.lastStatus.deleted.length !== newStatus.deleted.length ||
      this.lastStatus.ahead !== newStatus.ahead ||
      this.lastStatus.behind !== newStatus.behind
    );
  }

  /**
   * Check if monitor is running
   */
  isRunning(): boolean {
    return this.pollIntervalId !== null;
  }

  /**
   * Get last known status
   */
  getLastStatus(): StatusResult | null {
    return this.lastStatus;
  }
}
