/**
 * Performance Monitor Service
 *
 * Monitors system and application performance metrics, emits alerts when
 * thresholds are exceeded.
 */

import os from 'os';
import type { Server as SocketIOServer } from 'socket.io';
import { logger } from '../utils/logger.js';

interface PerformanceThresholds {
  memory: {
    critical: number;
    warning: number;
  };
  heap: {
    warning: number;
  };
}

interface PerformanceMonitorOptions {
  io?: SocketIOServer;
  interval?: number;
  memoryCritical?: number;
  memoryWarning?: number;
  heapWarning?: number;
}

type AlertSeverity = 'critical' | 'warning';
type AlertType = 'memory' | 'heap';

interface PerformanceAlert {
  type: AlertType;
  severity: AlertSeverity;
  title: string;
  message: string;
  value: string;
}

interface PerformanceAlertWithTimestamp extends PerformanceAlert {
  timestamp: string;
}

interface PerformanceStats {
  checksPerformed: number;
  alertsEmitted: number;
  lastCheck: string | null;
  lastAlert: PerformanceAlertWithTimestamp | null;
}

interface MemoryUsageSnapshot {
  heapUsed: number;
  heapTotal: number;
  heapPercent: string;
  rss: number;
  external: number;
}

export class PerformanceMonitor {
  io: SocketIOServer | undefined;
  interval: number;
  intervalId: NodeJS.Timeout | null;
  isRunning: boolean;
  thresholds: PerformanceThresholds;
  stats: PerformanceStats;

  constructor(options: PerformanceMonitorOptions = {}) {
    this.io = options.io;
    this.interval = options.interval || 5000;
    this.intervalId = null;
    this.isRunning = false;

    this.thresholds = {
      memory: {
        critical: options.memoryCritical || 90,
        warning: options.memoryWarning || 85
      },
      heap: {
        warning: options.heapWarning || 90
      }
    };

    this.stats = {
      checksPerformed: 0,
      alertsEmitted: 0,
      lastCheck: null,
      lastAlert: null
    };
  }

  setIO(io: SocketIOServer): void {
    this.io = io;
  }

  start(): void {
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

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      this.isRunning = false;
      logger.info('Performance monitor stopped');
    }
  }

  checkPerformance(): void {
    this.stats.checksPerformed++;
    this.stats.lastCheck = new Date().toISOString();

    try {
      const memUsage = process.memoryUsage();
      const heapPercent = (memUsage.heapUsed / memUsage.heapTotal) * 100;

      const totalMem = os.totalmem();
      const freeMem = os.freemem();
      const usedMem = totalMem - freeMem;
      const systemMemoryPercent = (usedMem / totalMem) * 100;

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
      logger.error('Error checking performance:', {
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  emitAlert(alert: PerformanceAlert): void {
    this.stats.alertsEmitted++;
    this.stats.lastAlert = {
      ...alert,
      timestamp: new Date().toISOString()
    };

    if (alert.severity === 'critical') {
      logger.error(`Performance Alert: ${alert.title} - ${alert.message}`);
    } else {
      logger.warn(`Performance Alert: ${alert.title} - ${alert.message}`);
    }

    if (this.io) {
      this.io.emit('performance-alert', alert);
    }
  }

  getMemoryUsage(): MemoryUsageSnapshot {
    const memUsage = process.memoryUsage();
    return {
      heapUsed: memUsage.heapUsed,
      heapTotal: memUsage.heapTotal,
      heapPercent: ((memUsage.heapUsed / memUsage.heapTotal) * 100).toFixed(2),
      rss: memUsage.rss,
      external: memUsage.external
    };
  }

  getStats(): PerformanceStats & {
    isRunning: boolean;
    interval: number;
    thresholds: PerformanceThresholds;
    currentMemory: MemoryUsageSnapshot;
  } {
    return {
      ...this.stats,
      isRunning: this.isRunning,
      interval: this.interval,
      thresholds: this.thresholds,
      currentMemory: this.getMemoryUsage()
    };
  }

  updateThresholds(newThresholds: Partial<PerformanceThresholds>): void {
    this.thresholds = {
      ...this.thresholds,
      ...newThresholds
    };
    logger.info('Performance thresholds updated', { thresholds: this.thresholds });
  }

  resetStats(): void {
    this.stats = {
      checksPerformed: 0,
      alertsEmitted: 0,
      lastCheck: null,
      lastAlert: null
    };
    logger.info('Performance stats reset');
  }

  checkNow(): ReturnType<PerformanceMonitor['getStats']> {
    this.checkPerformance();
    return this.getStats();
  }
}
