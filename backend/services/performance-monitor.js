/**
 * Performance Monitor Service
 *
 * Monitors system and application performance metrics, emits alerts when
 * thresholds are exceeded.
 */

import os from 'os';
import { logger } from '../utils/logger.js';

export class PerformanceMonitor {
  constructor(options = {}) {
    this.io = options.io;
    this.interval = options.interval || 5000; // Check every 5 seconds
    this.intervalId = null;
    this.isRunning = false;

    // Thresholds
    this.thresholds = {
      memory: {
        critical: options.memoryCritical || 90,
        warning: options.memoryWarning || 85
      },
      heap: {
        warning: options.heapWarning || 90
      }
    };

    // Stats
    this.stats = {
      checksPerformed: 0,
      alertsEmitted: 0,
      lastCheck: null,
      lastAlert: null
    };
  }

  /**
   * Set Socket.io instance for alert emission
   */
  setIO(io) {
    this.io = io;
  }

  /**
   * Start monitoring
   */
  start() {
    if (this.isRunning) {
      logger.warn('Performance monitor already running');
      return;
    }

    this.isRunning = true;
    this.intervalId = setInterval(() => {
      this.checkPerformance();
    }, this.interval);

    logger.info('Performance monitor started', {
      interval: this.interval,
      thresholds: this.thresholds
    });
  }

  /**
   * Stop monitoring
   */
  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      this.isRunning = false;
      logger.info('Performance monitor stopped');
    }
  }

  /**
   * Check performance metrics
   */
  checkPerformance() {
    this.stats.checksPerformed++;
    this.stats.lastCheck = new Date().toISOString();

    try {
      const memUsage = process.memoryUsage();
      const heapPercent = (memUsage.heapUsed / memUsage.heapTotal) * 100;

      // Get system memory
      const totalMem = os.totalmem();
      const freeMem = os.freemem();
      const usedMem = totalMem - freeMem;
      const systemMemoryPercent = (usedMem / totalMem) * 100;

      // Check thresholds and emit alerts
      if (systemMemoryPercent > this.thresholds.memory.critical) {
        this.emitAlert({
          type: 'memory',
          severity: 'critical',
          title: 'Critical System Memory',
          message: `System memory usage is critically high: ${systemMemoryPercent.toFixed(1)}%`,
          value: systemMemoryPercent.toFixed(1)
        });
      } else if (heapPercent > this.thresholds.heap.warning) {
        this.emitAlert({
          type: 'heap',
          severity: 'warning',
          title: 'High Heap Memory',
          message: `Process heap usage is high: ${heapPercent.toFixed(1)}%`,
          value: heapPercent.toFixed(1)
        });
      } else if (systemMemoryPercent > this.thresholds.memory.warning) {
        this.emitAlert({
          type: 'memory',
          severity: 'warning',
          title: 'High System Memory',
          message: `System memory usage is high: ${systemMemoryPercent.toFixed(1)}%`,
          value: systemMemoryPercent.toFixed(1)
        });
      }
    } catch (error) {
      logger.error('Error checking performance:', error);
    }
  }

  /**
   * Emit performance alert
   */
  emitAlert(alert) {
    this.stats.alertsEmitted++;
    this.stats.lastAlert = {
      ...alert,
      timestamp: new Date().toISOString()
    };

    // Log alert
    if (alert.severity === 'critical') {
      logger.error(`Performance Alert: ${alert.title} - ${alert.message}`);
    } else {
      logger.warn(`Performance Alert: ${alert.title} - ${alert.message}`);
    }

    // Emit via WebSocket
    if (this.io) {
      this.io.emit('performance-alert', alert);
    }
  }

  /**
   * Get current memory usage
   */
  getMemoryUsage() {
    const memUsage = process.memoryUsage();
    return {
      heapUsed: memUsage.heapUsed,
      heapTotal: memUsage.heapTotal,
      heapPercent: ((memUsage.heapUsed / memUsage.heapTotal) * 100).toFixed(2),
      rss: memUsage.rss,
      external: memUsage.external
    };
  }

  /**
   * Get monitoring stats
   */
  getStats() {
    return {
      ...this.stats,
      isRunning: this.isRunning,
      interval: this.interval,
      thresholds: this.thresholds,
      currentMemory: this.getMemoryUsage()
    };
  }

  /**
   * Update thresholds
   */
  updateThresholds(newThresholds) {
    this.thresholds = {
      ...this.thresholds,
      ...newThresholds
    };
    logger.info('Performance thresholds updated', { thresholds: this.thresholds });
  }

  /**
   * Reset stats
   */
  resetStats() {
    this.stats = {
      checksPerformed: 0,
      alertsEmitted: 0,
      lastCheck: null,
      lastAlert: null
    };
    logger.info('Performance stats reset');
  }

  /**
   * Force an immediate performance check
   */
  checkNow() {
    this.checkPerformance();
    return this.getStats();
  }
}

export default PerformanceMonitor;
