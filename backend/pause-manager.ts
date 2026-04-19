import { EventEmitter } from 'events';
import { logger } from './utils/logger.js';

/**
 * Manages pausing/resuming file monitoring
 * Acts as an emergency brake for AI coding sessions
 */
class PauseManager extends EventEmitter {
  private paused: boolean = false;
  private pauseReason: string = '';
  private pauseTime: Date | null = null;
  private pauseCount: number = 0;

  constructor() {
    super();
  }

  /**
   * Pause file monitoring
   */
  pause(reason: string = 'User requested'): void {
    if (this.paused) {
      logger.warn('⚠️  Already paused');
      return;
    }

    this.paused = true;
    this.pauseReason = reason;
    this.pauseTime = new Date();
    this.pauseCount++;

    logger.info(`🛑 MONITORING PAUSED: ${reason}`);
    this.emit('pause', { reason, timestamp: this.pauseTime });
  }

  /**
   * Resume file monitoring
   */
  resume(): void {
    if (!this.paused) {
      logger.warn('⚠️  Not currently paused');
      return;
    }

    const duration = this.pauseTime ? Date.now() - this.pauseTime.getTime() : 0;

    this.paused = false;
    const previousReason = this.pauseReason;
    this.pauseReason = '';
    this.pauseTime = null;

    logger.info(`▶️  MONITORING RESUMED (was paused for ${Math.round(duration / 1000)}s)`);
    this.emit('resume', {
      previousReason,
      duration,
      timestamp: new Date()
    });
  }

  /**
   * Check if currently paused
   */
  isPaused(): boolean {
    return this.paused;
  }

  /**
   * Get current pause status
   */
  getStatus() {
    return {
      paused: this.paused,
      reason: this.pauseReason,
      pauseTime: this.pauseTime,
      pauseCount: this.pauseCount,
      duration: this.pauseTime ? Date.now() - this.pauseTime.getTime() : 0
    };
  }

  /**
   * Should events be processed?
   */
  shouldProcessEvent(): boolean {
    if (this.paused) {
      logger.info('⏸️  Event skipped (monitoring paused)');
      return false;
    }
    return true;
  }
}

// Export singleton instance
export const pauseManager = new PauseManager();
