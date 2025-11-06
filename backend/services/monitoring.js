/**
 * Monitoring Service
 * Tracks error rates, memory usage, and system health
 */

import { logger } from '../utils/logger.js';
import os from 'os';

export class MonitoringService {
  constructor(options = {}) {
    this.io = options.io;
    this.alertThresholds = {
      errorRate: options.errorRateThreshold || 10, // errors per minute
      memoryPercent: options.memoryPercentThreshold || 85,
      cpuPercent: options.cpuPercentThreshold || 80,
      watcherFailures: options.watcherFailuresThreshold || 3
    };

    this.metrics = {
      errors: [],
      warnings: [],
      memory: [],
      cpu: [],
      watcherHealth: new Map(),
      websocketConnections: 0,
      dbOperations: {
        reads: 0,
        writes: 0,
        errors: 0
      }
    };

    this.intervals = [];
    this.startTime = Date.now();
  }

  /**
   * Start monitoring
   */
  start() {
    logger.info('Starting monitoring service');

    // Monitor error rates
    const errorInterval = setInterval(() => {
      this.checkErrorRate();
    }, 60000); // Every minute

    // Monitor memory/CPU
    const resourceInterval = setInterval(() => {
      this.checkResourceUsage();
    }, 30000); // Every 30 seconds

    // Monitor watcher health
    const watcherInterval = setInterval(() => {
      this.checkWatcherHealth();
    }, 120000); // Every 2 minutes

    this.intervals.push(errorInterval, resourceInterval, watcherInterval);
  }

  /**
   * Stop monitoring
   */
  stop() {
    logger.info('Stopping monitoring service');
    this.intervals.forEach(interval => clearInterval(interval));
    this.intervals = [];
  }

  /**
   * Record an error
   */
  recordError(error, context = {}) {
    const errorRecord = {
      timestamp: Date.now(),
      message: error.message || String(error),
      stack: error.stack,
      context
    };

    this.metrics.errors.push(errorRecord);

    // Keep only last hour of errors
    const oneHourAgo = Date.now() - 3600000;
    this.metrics.errors = this.metrics.errors.filter(e => e.timestamp > oneHourAgo);

    // Emit to frontend if connected
    if (this.io) {
      this.io.emit('monitoring-error', {
        timestamp: errorRecord.timestamp,
        message: errorRecord.message,
        context: errorRecord.context
      });
    }
  }

  /**
   * Record a warning
   */
  recordWarning(message, context = {}) {
    const warningRecord = {
      timestamp: Date.now(),
      message,
      context
    };

    this.metrics.warnings.push(warningRecord);

    // Keep only last hour of warnings
    const oneHourAgo = Date.now() - 3600000;
    this.metrics.warnings = this.metrics.warnings.filter(w => w.timestamp > oneHourAgo);
  }

  /**
   * Check error rate
   */
  checkErrorRate() {
    const oneMinuteAgo = Date.now() - 60000;
    const recentErrors = this.metrics.errors.filter(e => e.timestamp > oneMinuteAgo);

    if (recentErrors.length >= this.alertThresholds.errorRate) {
      logger.warn(`High error rate detected: ${recentErrors.length} errors in last minute`);
      if (this.io) {
        this.io.emit('monitoring-alert', {
          type: 'error-rate',
          severity: 'high',
          message: `${recentErrors.length} errors in last minute`,
          threshold: this.alertThresholds.errorRate
        });
      }
    }
  }

  /**
   * Check resource usage
   */
  checkResourceUsage() {
    const memUsage = process.memoryUsage();
    const memPercent = (memUsage.heapUsed / memUsage.heapTotal) * 100;
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const systemMemPercent = ((totalMem - freeMem) / totalMem) * 100;

    this.metrics.memory.push({
      timestamp: Date.now(),
      process: memPercent,
      system: systemMemPercent
    });

    // Keep only last 100 samples
    if (this.metrics.memory.length > 100) {
      this.metrics.memory.shift();
    }

    // Alert on high memory
    if (systemMemPercent >= this.alertThresholds.memoryPercent) {
      logger.warn(`High memory usage: ${systemMemPercent.toFixed(2)}%`);
      if (this.io) {
        this.io.emit('monitoring-alert', {
          type: 'memory',
          severity: 'high',
          value: systemMemPercent,
          threshold: this.alertThresholds.memoryPercent
        });
      }
    }
  }

  /**
   * Check watcher health
   */
  checkWatcherHealth() {
    let failedWatchers = 0;
    for (const [watcher, health] of this.metrics.watcherHealth.entries()) {
      if (health.failures >= this.alertThresholds.watcherFailures) {
        failedWatchers++;
        logger.warn(`Watcher ${watcher} has ${health.failures} failures`);
      }
    }

    if (failedWatchers > 0 && this.io) {
      this.io.emit('monitoring-alert', {
        type: 'watcher-health',
        severity: 'medium',
        failedWatchers,
        threshold: this.alertThresholds.watcherFailures
      });
    }
  }

  /**
   * Record watcher failure
   */
  recordWatcherFailure(watcherName) {
    const health = this.metrics.watcherHealth.get(watcherName) || {
      failures: 0,
      lastFailure: null
    };

    health.failures++;
    health.lastFailure = Date.now();
    this.metrics.watcherHealth.set(watcherName, health);
  }

  /**
   * Record watcher recovery
   */
  recordWatcherRecovery(watcherName) {
    const health = this.metrics.watcherHealth.get(watcherName);
    if (health) {
      health.failures = 0;
      this.metrics.watcherHealth.set(watcherName, health);
    }
  }

  /**
   * Get current metrics
   */
  getMetrics() {
    const uptime = Date.now() - this.startTime;
    const recentErrors = this.metrics.errors.filter(e => e.timestamp > Date.now() - 300000); // Last 5 minutes

    return {
      uptime,
      errorCount: this.metrics.errors.length,
      recentErrorCount: recentErrors.length,
      warningCount: this.metrics.warnings.length,
      dbOperations: this.metrics.dbOperations,
      websocketConnections: this.metrics.websocketConnections,
      watcherHealth: Array.from(this.metrics.watcherHealth.entries()).map(([name, health]) => ({
        name,
        ...health
      }))
    };
  }

  /**
   * Record database operation
   */
  recordDbOperation(type) {
    if (type === 'read') {
      this.metrics.dbOperations.reads++;
    } else if (type === 'write') {
      this.metrics.dbOperations.writes++;
    } else if (type === 'error') {
      this.metrics.dbOperations.errors++;
    }
  }

  /**
   * Update WebSocket connection count
   */
  updateWebSocketCount(count) {
    this.metrics.websocketConnections = count;
  }
}
