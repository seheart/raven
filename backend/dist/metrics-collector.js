/**
 * MetricsCollector - Database integration for system and process metrics
 *
 * Integrates TelemetryCollector from modules with database and Socket.IO.
 * Collects both system-wide metrics and per-process metrics for AI agents.
 */
import * as si from 'systeminformation';
import { EventBus } from './modules/eventBus.js';
import { telemetryCollector } from './modules/telemetry.js';
export class MetricsCollector {
    db;
    sessionId;
    io;
    processInterval = null;
    isRunning = false;
    processCollectionInterval = 5000; // 5 seconds for process metrics
    agentPatterns = [
        { pattern: /claude/i, name: 'claude-sonnet-3.5' },
        { pattern: /cursor/i, name: 'cursor' },
        { pattern: /copilot/i, name: 'github-copilot' },
        { pattern: /node.*raven/i, name: 'raven-backend' }
    ];
    constructor(db, sessionId, io = null) {
        this.db = db;
        this.sessionId = sessionId;
        this.io = io;
        // Listen to telemetry events from EventBus
        this.setupEventListeners();
    }
    /**
     * Setup EventBus listeners for telemetry
     */
    setupEventListeners() {
        EventBus.onTelemetry(async (event) => {
            await this.handleTelemetryEvent(event);
        });
    }
    /**
     * Handle telemetry event from EventBus
     */
    async handleTelemetryEvent(event) {
        try {
            // Get memory info for MB values
            const mem = await si.mem();
            const memory_used_mb = Math.floor(mem.used / (1024 * 1024));
            const memory_total_mb = Math.floor(mem.total / (1024 * 1024));
            // Insert into database
            this.db.insertSystemMetrics(new Date(event.ts).toISOString(), event.cpu, event.mem, memory_used_mb, memory_total_mb, event.networkRx || 0, event.networkTx || 0, this.sessionId);
            console.log(`📊 System metrics: CPU ${event.cpu.toFixed(1)}% | RAM ${event.mem.toFixed(1)}% (${memory_used_mb}MB/${memory_total_mb}MB)`);
            // Emit to Socket.IO
            if (this.io) {
                this.io.emit('system-metrics', {
                    timestamp: new Date(event.ts).toISOString(),
                    cpu_percent: event.cpu,
                    memory_percent: event.mem,
                    memory_used_mb,
                    memory_total_mb,
                    network_rx_bytes: event.networkRx || 0,
                    network_tx_bytes: event.networkTx || 0
                });
            }
        }
        catch (error) {
            console.error('❌ Error handling telemetry event:', error);
        }
    }
    /**
     * Collect process-specific metrics for AI agents
     */
    async collectProcessMetrics() {
        try {
            const processes = await si.processes();
            for (const { pattern, name } of this.agentPatterns) {
                const matchingProcs = processes.list.filter(p => pattern.test(p.name) || pattern.test(p.command));
                // Track first match only
                for (const proc of matchingProcs.slice(0, 1)) {
                    const cpu_usage = proc.cpu || 0;
                    const memory_mb = Math.floor(proc.mem / (1024 * 1024));
                    const virtual_memory_mb = Math.floor((proc.memVsz || 0) / 1024);
                    this.db.insertProcessMetrics(new Date().toISOString(), name, proc.pid, cpu_usage, memory_mb, virtual_memory_mb, 0, // disk_read_bytes - not easily available
                    0, // disk_write_bytes
                    proc.state || 'running', this.sessionId);
                    console.log(`🤖 Process metrics: ${name} (PID ${proc.pid}) - CPU ${cpu_usage.toFixed(1)}% | RAM ${memory_mb}MB`);
                }
            }
        }
        catch (error) {
            console.error('❌ Error collecting process metrics:', error);
        }
    }
    /**
     * Start metrics collection
     */
    start() {
        if (this.isRunning) {
            console.log('⚠️  Metrics collector already running');
            return;
        }
        console.log('🚀 Starting metrics collector');
        this.isRunning = true;
        // Start system metrics collection via TelemetryCollector
        telemetryCollector.start();
        // Collect process metrics immediately
        this.collectProcessMetrics();
        // Start process metrics interval
        this.processInterval = setInterval(() => {
            this.collectProcessMetrics();
        }, this.processCollectionInterval);
    }
    /**
     * Stop metrics collection
     */
    stop() {
        if (!this.isRunning) {
            return;
        }
        console.log('🛑 Stopping metrics collector');
        this.isRunning = false;
        // Stop system metrics collection
        telemetryCollector.stop();
        // Stop process metrics collection
        if (this.processInterval) {
            clearInterval(this.processInterval);
            this.processInterval = null;
        }
    }
    /**
     * Check if collector is running
     */
    isCollectorRunning() {
        return this.isRunning;
    }
    /**
     * Set Socket.IO instance
     */
    setIo(io) {
        this.io = io;
    }
    /**
     * Set process collection interval
     */
    setProcessInterval(ms) {
        this.processCollectionInterval = ms;
        if (this.isRunning && this.processInterval) {
            clearInterval(this.processInterval);
            this.processInterval = setInterval(() => {
                this.collectProcessMetrics();
            }, this.processCollectionInterval);
        }
    }
    /**
     * Add custom process pattern to track
     */
    addProcessPattern(pattern, name) {
        this.agentPatterns.push({ pattern, name });
    }
}
//# sourceMappingURL=metrics-collector.js.map