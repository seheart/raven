// Real-time system metrics collector
import si from 'systeminformation';
import { logger } from './utils/logger.js';

export class MetricsCollector {
  constructor(db, sessionId, io = null) {
    this.db = db;
    this.sessionId = sessionId;
    this.io = io;
    this.interval = null;
    this.isRunning = false;
    // Changed from 1s to 10s to reduce database load by 90% (from 86,400 to 8,640 records/day)
    // Environment variable allows customization: METRICS_INTERVAL_MS=5000 for 5-second intervals
    this.collectionInterval = parseInt(process.env.METRICS_INTERVAL_MS) || 10000;
  }

  async collectSystemMetrics() {
    try {
      // Get current CPU usage
      const cpuLoad = await si.currentLoad();
      const cpu_percent = cpuLoad.currentLoad;

      // Get memory info
      const mem = await si.mem();
      // Use 'active' or calculate from 'available' to exclude buffers/cache
      // mem.active = truly used memory (excluding cache/buffers)
      // or: (mem.total - mem.available) = non-reclaimable used memory
      const actualUsed = mem.active || (mem.total - mem.available);
      const memory_percent = (actualUsed / mem.total) * 100;
      const memory_used_mb = Math.floor(actualUsed / (1024 * 1024));
      const memory_total_mb = Math.floor(mem.total / (1024 * 1024));

      // Get network stats
      const networkStats = await si.networkStats();
      const primaryInterface = networkStats[0] || {};
      const network_rx_bytes = primaryInterface.rx_bytes || 0;
      const network_tx_bytes = primaryInterface.tx_bytes || 0;

      // Record to database
      this.db.insertSystemMetrics(
        new Date().toISOString(),
        cpu_percent,
        memory_percent,
        memory_used_mb,
        memory_total_mb,
        network_rx_bytes,
        network_tx_bytes,
        this.sessionId
      );

      logger.debug('System metrics collected', {
        cpu: cpu_percent.toFixed(1) + '%',
        ram: memory_percent.toFixed(1) + '%',
        memoryUsedMB: memory_used_mb,
        memoryTotalMB: memory_total_mb
      });

      // Emit real-time metrics via WebSocket
      if (this.io) {
        this.io.emit('system-metrics', {
          timestamp: new Date().toISOString(),
          cpu_percent,
          memory_percent,
          memory_used_mb,
          memory_total_mb,
          network_rx_bytes,
          network_tx_bytes
        });
      }
    } catch (error) {
      logger.error('Error collecting system metrics', { error });
    }
  }

  async collectProcessMetrics() {
    try {
      // Get all processes
      const processes = await si.processes();

      // Look for common AI agent processes
      const agentPatterns = [
        { pattern: /claude/i, name: 'claude-sonnet-3.5' },
        { pattern: /cursor/i, name: 'cursor' },
        { pattern: /copilot/i, name: 'github-copilot' },
        { pattern: /node.*raven/i, name: 'raven-backend' }
      ];

      for (const { pattern, name } of agentPatterns) {
        const matchingProcs = processes.list.filter(
          p => pattern.test(p.name) || pattern.test(p.command)
        );

        for (const proc of matchingProcs.slice(0, 1)) {
          // Just track the first match
          const cpu_usage = proc.cpu || 0;
          const memory_mb = Math.floor(proc.mem / (1024 * 1024));
          const virtual_memory_mb = Math.floor((proc.memVsz || 0) / 1024);

          this.db.insertProcessMetrics(
            new Date().toISOString(),
            name,
            proc.pid,
            cpu_usage,
            memory_mb,
            virtual_memory_mb,
            0, // disk_read_bytes - Not easily available in real-time
            0, // disk_write_bytes
            proc.state || 'running',
            this.sessionId
          );

          logger.debug('Process metrics collected', {
            process: name,
            pid: proc.pid,
            cpu: cpu_usage.toFixed(1) + '%',
            memoryMB: memory_mb
          });
        }
      }
    } catch (error) {
      logger.error('Error collecting process metrics', { error });
    }
  }

  async collect() {
    await this.collectSystemMetrics();
    await this.collectProcessMetrics();
  }

  start() {
    if (this.isRunning) {
      logger.warn('Metrics collector is already running');
      return;
    }

    logger.info('Starting real-time metrics collector', {
      intervalMs: this.collectionInterval,
      intervalSeconds: this.collectionInterval / 1000
    });
    this.isRunning = true;

    // Collect immediately
    this.collect();

    // Then collect on interval
    this.interval = setInterval(() => {
      this.collect();
    }, this.collectionInterval);
  }

  stop() {
    if (!this.isRunning) {
      return;
    }

    logger.info('Stopping metrics collector');
    this.isRunning = false;

    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  setInterval(ms) {
    this.collectionInterval = ms;
    if (this.isRunning) {
      this.stop();
      this.start();
    }
  }
}
