/**
 * Monitoring Service
 * Tracks error rates, memory usage, and system health
 */

import os from 'os';
import type { Server as SocketIOServer } from 'socket.io';
import { logger } from '../utils/logger.js';

interface MonitoringOptions {
  io?: SocketIOServer;
  errorRateThreshold?: number;
  memoryPercentThreshold?: number;
  cpuPercentThreshold?: number;
  watcherFailuresThreshold?: number;
}

interface AlertThresholds {
  errorRate: number;
  memoryPercent: number;
  cpuPercent: number;
  watcherFailures: number;
}

interface ErrorRecord {
  timestamp: number;
  message: string;
  stack: string | undefined;
  context: Record<string, unknown>;
}

interface WarningRecord {
  timestamp: number;
  message: string;
  context: Record<string, unknown>;
}

interface MemorySample {
  timestamp: number;
  process: number;
  system: number;
}

interface WatcherHealth {
  failures: number;
  lastFailure: number | null;
}

interface DbOperationCounts {
  reads: number;
  writes: number;
  errors: number;
}

interface MonitoringMetricsInternal {
  errors: ErrorRecord[];
  warnings: WarningRecord[];
  memory: MemorySample[];
  cpu: number[];
  watcherHealth: Map<string, WatcherHealth>;
  websocketConnections: number;
  dbOperations: DbOperationCounts;
}

interface MonitoringSnapshot {
  uptime: number;
  errorCount: number;
  recentErrorCount: number;
  warningCount: number;
  dbOperations: DbOperationCounts;
  websocketConnections: number;
  watcherHealth: Array<{ name: string } & WatcherHealth>;
}

type DbOperationType = 'read' | 'write' | 'error';

export class MonitoringService {
  io: SocketIOServer | undefined;
  alertThresholds: AlertThresholds;
  metrics: MonitoringMetricsInternal;
  intervals: NodeJS.Timeout[];
  startTime: number;

  constructor(options: MonitoringOptions = {}) {
    this.io = options.io;
    this.alertThresholds = {
      errorRate: options.errorRateThreshold ?? 10,
      memoryPercent: options.memoryPercentThreshold ?? 85,
      cpuPercent: options.cpuPercentThreshold ?? 80,
      watcherFailures: options.watcherFailuresThreshold ?? 3
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

  start(): void {
    logger.info('Starting monitoring service');

    const errorInterval = setInterval(() => {
      this.checkErrorRate();
    }, 60000);

    const resourceInterval = setInterval(() => {
      this.checkResourceUsage();
    }, 30000);

    const watcherInterval = setInterval(() => {
      this.checkWatcherHealth();
    }, 120000);

    this.intervals.push(errorInterval, resourceInterval, watcherInterval);
  }

  stop(): void {
    logger.info('Stopping monitoring service');
    this.intervals.forEach(interval => clearInterval(interval));
    this.intervals = [];
  }

  recordError(error: Error | string | unknown, context: Record<string, unknown> = {}): void {
    const errorRecord: ErrorRecord = {
      timestamp: Date.now(),
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      context
    };

    this.metrics.errors.push(errorRecord);

    const oneHourAgo = Date.now() - 3600000;
    this.metrics.errors = this.metrics.errors.filter(e => e.timestamp > oneHourAgo);

    if (this.io) {
      this.io.emit('monitoring-error', {
        timestamp: errorRecord.timestamp,
        message: errorRecord.message,
        context: errorRecord.context
      });
    }
  }

  recordWarning(message: string, context: Record<string, unknown> = {}): void {
    const warningRecord: WarningRecord = {
      timestamp: Date.now(),
      message,
      context
    };

    this.metrics.warnings.push(warningRecord);

    const oneHourAgo = Date.now() - 3600000;
    this.metrics.warnings = this.metrics.warnings.filter(w => w.timestamp > oneHourAgo);
  }

  checkErrorRate(): void {
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

  checkResourceUsage(): void {
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

    if (this.metrics.memory.length > 100) {
      this.metrics.memory.shift();
    }

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

  checkWatcherHealth(): void {
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

  recordWatcherFailure(watcherName: string): void {
    const health = this.metrics.watcherHealth.get(watcherName) || {
      failures: 0,
      lastFailure: null
    };

    health.failures++;
    health.lastFailure = Date.now();
    this.metrics.watcherHealth.set(watcherName, health);
  }

  recordWatcherRecovery(watcherName: string): void {
    const health = this.metrics.watcherHealth.get(watcherName);
    if (health) {
      health.failures = 0;
      this.metrics.watcherHealth.set(watcherName, health);
    }
  }

  getMetrics(): MonitoringSnapshot {
    const uptime = Date.now() - this.startTime;
    const recentErrors = this.metrics.errors.filter(e => e.timestamp > Date.now() - 300000);

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

  recordDbOperation(type: DbOperationType): void {
    if (type === 'read') {
      this.metrics.dbOperations.reads++;
    } else if (type === 'write') {
      this.metrics.dbOperations.writes++;
    } else if (type === 'error') {
      this.metrics.dbOperations.errors++;
    }
  }

  updateWebSocketCount(count: number): void {
    this.metrics.websocketConnections = count;
  }
}
