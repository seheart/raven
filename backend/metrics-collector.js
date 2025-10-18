// Real-time system metrics collector
import si from 'systeminformation';
import { RavenDB } from './db.js';

export class MetricsCollector {
  constructor(db, sessionId, io = null) {
    this.db = db;
    this.sessionId = sessionId;
    this.io = io;
    this.interval = null;
    this.isRunning = false;
    this.collectionInterval = 1000; // Collect every 1 second for real-time monitoring
  }

  async collectSystemMetrics() {
    try {
      // Get current CPU usage
      const cpuLoad = await si.currentLoad();
      const cpu_percent = cpuLoad.currentLoad;

      // Get memory info
      const mem = await si.mem();
      const memory_percent = (mem.used / mem.total) * 100;
      const memory_used_mb = Math.floor(mem.used / (1024 * 1024));
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

      console.log(`📊 System metrics: CPU ${cpu_percent.toFixed(1)}% | RAM ${memory_percent.toFixed(1)}% (${memory_used_mb}MB/${memory_total_mb}MB)`);

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
      console.error('Error collecting system metrics:', error);
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
        const matchingProcs = processes.list.filter(p =>
          pattern.test(p.name) || pattern.test(p.command)
        );

        for (const proc of matchingProcs.slice(0, 1)) { // Just track the first match
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

          console.log(`🤖 Process metrics: ${name} (PID ${proc.pid}) - CPU ${cpu_usage.toFixed(1)}% | RAM ${memory_mb}MB`);
        }
      }
    } catch (error) {
      console.error('Error collecting process metrics:', error);
    }
  }

  async collect() {
    await this.collectSystemMetrics();
    await this.collectProcessMetrics();
  }

  start() {
    if (this.isRunning) {
      console.log('⚠️  Metrics collector is already running');
      return;
    }

    console.log(`🚀 Starting real-time metrics collector (every ${this.collectionInterval}ms = ${this.collectionInterval/1000}s)`);
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

    console.log('🛑 Stopping metrics collector');
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
