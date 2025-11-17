/**
 * Telemetry - System metrics collection
 *
 * Collects CPU, memory, and network metrics at regular intervals.
 * Emits telemetry events via EventBus for storage and real-time monitoring.
 */

import os from 'os';
import { EventBus, TelemetryEvent } from './eventBus.js';
import * as si from 'systeminformation';
import { logger } from '../utils/logger.js';

export interface TelemetryConfig {
  intervalMs: number;
  enableNetworkMetrics: boolean;
}

export class TelemetryCollector {
  private intervalId: NodeJS.Timeout | null = null;
  private config: TelemetryConfig;

  constructor(config: Partial<TelemetryConfig> = {}) {
    this.config = {
      intervalMs: config.intervalMs || 3000,
      enableNetworkMetrics: config.enableNetworkMetrics ?? true
    };
  }

  /**
   * Start collecting telemetry at configured interval
   */
  start(): void {
    if (this.intervalId) {
      logger.warn('⚠️  Telemetry collector already running');
      return;
    }

    logger.info(`📊 Starting telemetry collection (interval: ${this.config.intervalMs}ms)`);

    // Collect immediately
    this.collect();

    // Then collect at intervals
    this.intervalId = setInterval(() => {
      this.collect();
    }, this.config.intervalMs);
  }

  /**
   * Stop collecting telemetry
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      logger.info('🛑 Telemetry collection stopped');
    }
  }

  /**
   * Collect current system metrics
   */
  private async collect(): Promise<void> {
    try {
      const [cpuLoad, memInfo, networkStats] = await Promise.all([
        si.currentLoad(),
        si.mem(),
        this.config.enableNetworkMetrics ? si.networkStats() : Promise.resolve(null)
      ]);

      // Calculate CPU percentage
      const cpu = Math.round(cpuLoad.currentLoad || 0);

      // Calculate memory percentage
      const mem = Math.round((memInfo.used / memInfo.total) * 100);

      // Calculate network delta (bytes since last measurement)
      let networkRx: number | undefined;
      let networkTx: number | undefined;

      if (networkStats && networkStats.length > 0) {
        const current = networkStats[0];
        networkRx = current.rx_bytes;
        networkTx = current.tx_bytes;
      }

      const event: TelemetryEvent = {
        cpu,
        mem,
        ts: Date.now(),
        networkRx,
        networkTx
      };

      // Emit to EventBus
      EventBus.emitTelemetry(event);
    } catch (error: any) {
      logger.error('Telemetry collection error', {
        error: error.message,
        stack: error.stack
      });
    }
  }

  /**
   * Get current telemetry snapshot (synchronous, less accurate)
   */
  getSnapshot(): { cpu: number; mem: number; ts: number } {
    const loadAvg = os.loadavg();
    const cpu = Math.round(loadAvg[0] * 10); // Rough approximation
    const mem = Math.round((1 - os.freemem() / os.totalmem()) * 100);

    return {
      cpu,
      mem,
      ts: Date.now()
    };
  }

  /**
   * Check if collector is running
   */
  isRunning(): boolean {
    return this.intervalId !== null;
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<TelemetryConfig>): void {
    const wasRunning = this.isRunning();

    if (wasRunning) {
      this.stop();
    }

    this.config = {
      ...this.config,
      ...config
    };

    if (wasRunning) {
      this.start();
    }

    logger.info('⚙️  Telemetry config updated:', this.config);
  }
}

/**
 * Create and export a singleton telemetry collector instance
 * Can be imported and started by the main server
 */
export const telemetryCollector = new TelemetryCollector();
