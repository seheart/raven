/**
 * MetricsCollector - Database integration for system and process metrics
 *
 * Integrates TelemetryCollector from modules with database and Socket.IO.
 * Collects both system-wide metrics and per-process metrics for AI agents.
 * Includes network connection tracking and activity state derivation.
 */

import * as si from 'systeminformation';
import { promises as fs } from 'fs';
import dns from 'dns';
import { promisify } from 'util';
import { RavenDB } from './db.js';
import { EventBus, TelemetryEvent } from './modules/eventBus.js';
import { telemetryCollector } from './modules/telemetry.js';
import type { Server as SocketIOServer } from 'socket.io';
import { logger } from './utils/logger.js';

const dnsResolve4 = promisify(dns.resolve4);

export interface ProcessPattern {
  pattern: RegExp;
  name: string;
}

/** Known AI API hostnames for detecting active API calls */
const KNOWN_AI_ENDPOINTS = [
  'api.anthropic.com',
  'api.openai.com',
  'generativelanguage.googleapis.com',
  'api.mistral.ai',
];

export class MetricsCollector {
  private db: RavenDB;
  private sessionId: string;
  private io: SocketIOServer | null;
  private processInterval: NodeJS.Timeout | null = null;
  private dnsRefreshInterval: NodeJS.Timeout | null = null;
  private isRunning: boolean = false;
  private processCollectionInterval: number = 5000; // 5 seconds for process metrics
  private idleProcessInterval: number = 30000; // 30 seconds when idle
  private isIdle: boolean = false;

  /** Resolved IP addresses for known AI API endpoints */
  private aiEndpointIPs: Set<string> = new Set();

  private agentPatterns: ProcessPattern[] = [
    { pattern: /claude/i, name: 'claude-sonnet-3.5' },
    { pattern: /cursor/i, name: 'cursor' },
    { pattern: /copilot/i, name: 'github-copilot' },
    { pattern: /node.*raven/i, name: 'raven-backend' }
  ];

  constructor(db: RavenDB, sessionId: string, io: SocketIOServer | null = null) {
    this.db = db;
    this.sessionId = sessionId;
    this.io = io;

    // Listen to telemetry events from EventBus
    this.setupEventListeners();
  }

  /**
   * Setup EventBus listeners for telemetry
   */
  private setupEventListeners(): void {
    EventBus.onTelemetry(async (event: TelemetryEvent) => {
      await this.handleTelemetryEvent(event);
    });
  }

  /**
   * Handle telemetry event from EventBus
   */
  private async handleTelemetryEvent(event: TelemetryEvent): Promise<void> {
    try {
      // Get memory info for MB values
      const mem = await si.mem();
      // Use active memory (excludes disk cache) for accurate reporting on Linux
      const memory_used_mb = Math.floor((mem.active || mem.total - mem.available) / (1024 * 1024));
      const memory_total_mb = Math.floor(mem.total / (1024 * 1024));

      // Insert into database
      this.db.insertSystemMetrics(
        new Date(event.ts).toISOString(),
        event.cpu,
        event.mem,
        memory_used_mb,
        memory_total_mb,
        event.networkRx || 0,
        event.networkTx || 0,
        this.sessionId
      );

      logger.info(
        `📊 System metrics: CPU ${event.cpu.toFixed(1)}% | RAM ${event.mem.toFixed(1)}% (${memory_used_mb}MB/${memory_total_mb}MB)`
      );

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
    } catch (error) {
      logger.error(
        '❌ Error handling telemetry event:',
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }

  /**
   * Resolve AI endpoint hostnames to IPs (cached, refreshed every 5 min)
   */
  private async resolveEndpointIPs(): Promise<void> {
    const ips = new Set<string>();
    for (const hostname of KNOWN_AI_ENDPOINTS) {
      try {
        const resolved = await dnsResolve4(hostname);
        for (const ip of resolved) {
          ips.add(ip);
        }
      } catch {
        // DNS failure is fine — endpoint may not be reachable
      }
    }
    this.aiEndpointIPs = ips;
    if (ips.size > 0) {
      logger.info(`🌐 Resolved ${ips.size} AI endpoint IPs from ${KNOWN_AI_ENDPOINTS.length} hostnames`);
    }
  }

  /**
   * Get network connection info for a set of tracked PIDs
   */
  private getProcessNetworkInfo(
    pids: Set<number>,
    connections: si.Systeminformation.NetworkConnectionsData[]
  ): Map<number, { totalConnections: number; apiConnections: number }> {
    const result = new Map<number, { totalConnections: number; apiConnections: number }>();

    for (const pid of pids) {
      result.set(pid, { totalConnections: 0, apiConnections: 0 });
    }

    for (const conn of connections) {
      if (!pids.has(conn.pid)) continue;
      const info = result.get(conn.pid)!;
      info.totalConnections++;
      if (
        conn.state === 'ESTABLISHED' &&
        this.aiEndpointIPs.has(conn.peerAddress)
      ) {
        info.apiConnections++;
      }
    }

    return result;
  }

  /**
   * Read Linux /proc details for a process
   */
  private async getLinuxProcessDetails(pid: number): Promise<{ threadCount: number; fdCount: number }> {
    try {
      // Thread count from /proc/<pid>/stat field 20 (1-indexed)
      let threadCount = 0;
      try {
        const stat = await fs.readFile(`/proc/${pid}/stat`, 'utf-8');
        // Fields after the comm field (in parens): skip to field 20
        const afterComm = stat.slice(stat.lastIndexOf(')') + 2);
        const fields = afterComm.split(' ');
        threadCount = parseInt(fields[17], 10) || 0; // field 20 is index 17 after comm extraction
      } catch { /* process may have exited */ }

      // FD count from /proc/<pid>/fd
      let fdCount = 0;
      try {
        const fds = await fs.readdir(`/proc/${pid}/fd`);
        fdCount = fds.length;
      } catch { /* permission or process exit */ }

      return { threadCount, fdCount };
    } catch {
      return { threadCount: 0, fdCount: 0 };
    }
  }

  /**
   * Derive activity state from metrics signals
   */
  private deriveActivityState(cpu: number, apiConnections: number): string {
    if (apiConnections > 0) return 'thinking';
    if (cpu > 5) return 'executing';
    return 'idle';
  }

  /**
   * Collect process-specific metrics for AI agents
   */
  private async collectProcessMetrics(): Promise<void> {
    try {
      const [processes, connections] = await Promise.all([
        si.processes(),
        si.networkConnections()
      ]);

      // Collect all matched agent PIDs first
      const matchedAgents: Array<{
        name: string;
        proc: si.Systeminformation.ProcessesProcessData;
      }> = [];

      for (const { pattern, name } of this.agentPatterns) {
        const matchingProcs = processes.list.filter(
          p => pattern.test(p.name) || pattern.test(p.command)
        );
        // Track first match only
        if (matchingProcs.length > 0) {
          matchedAgents.push({ name, proc: matchingProcs[0] });
        }
      }

      // Get network info for all matched PIDs at once
      const trackedPids = new Set(matchedAgents.map(a => a.proc.pid));
      const netInfo = this.getProcessNetworkInfo(trackedPids, connections);

      // Collect /proc details and store metrics for each agent
      for (const { name, proc } of matchedAgents) {
        const cpu_usage = proc.cpu || 0;
        const memory_mb = Math.floor(proc.mem / (1024 * 1024));
        const virtual_memory_mb = Math.floor((proc.memVsz || 0) / 1024);

        const net = netInfo.get(proc.pid) || { totalConnections: 0, apiConnections: 0 };
        const procDetails = await this.getLinuxProcessDetails(proc.pid);
        const activityState = this.deriveActivityState(cpu_usage, net.apiConnections);

        this.db.insertProcessMetrics(
          new Date().toISOString(),
          name,
          proc.pid,
          cpu_usage,
          memory_mb,
          virtual_memory_mb,
          0, // disk_read_bytes
          0, // disk_write_bytes
          proc.state || 'running',
          this.sessionId,
          net.totalConnections,
          net.apiConnections,
          procDetails.threadCount,
          procDetails.fdCount,
          activityState
        );

        logger.info(
          `🤖 Process metrics: ${name} (PID ${proc.pid}) - CPU ${cpu_usage.toFixed(1)}% | RAM ${memory_mb}MB | Net ${net.totalConnections} (${net.apiConnections} API) | ${activityState}`
        );

        // Emit real-time process activity via WebSocket
        if (this.io) {
          this.io.emit('process-activity', {
            timestamp: new Date().toISOString(),
            agent_name: name,
            pid: proc.pid,
            cpu_usage,
            memory_mb,
            network_connections: net.totalConnections,
            api_connections: net.apiConnections,
            thread_count: procDetails.threadCount,
            fd_count: procDetails.fdCount,
            activity_state: activityState
          });
        }
      }
    } catch (error) {
      logger.error(
        '❌ Error collecting process metrics:',
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }

  /**
   * Start metrics collection
   */
  start(): void {
    if (this.isRunning) {
      logger.warn('⚠️  Metrics collector already running');
      return;
    }

    logger.info('🚀 Starting metrics collector');
    this.isRunning = true;

    // Resolve AI endpoint IPs at startup
    this.resolveEndpointIPs().catch(err => {
      logger.error('❌ Initial DNS resolution failed:', err);
    });

    // Refresh DNS every 5 minutes
    this.dnsRefreshInterval = setInterval(() => {
      this.resolveEndpointIPs().catch(() => {});
    }, 5 * 60 * 1000);
    this.dnsRefreshInterval.unref();

    // Start system metrics collection via TelemetryCollector
    telemetryCollector.start();

    // Collect process metrics immediately
    this.collectProcessMetrics().catch(err => {
      logger.error('❌ Initial process metrics collection failed:', err);
    });

    // Start process metrics interval
    this.processInterval = setInterval(() => {
      this.collectProcessMetrics().catch(err => {
        logger.error('❌ Process metrics collection failed:', err);
      });
    }, this.processCollectionInterval);
    this.processInterval.unref();
  }

  /**
   * Switch between active (5s) and idle (30s) process metrics collection.
   * Also propagates idle state to the telemetry collector.
   */
  setIdle(idle: boolean): void {
    if (idle === this.isIdle) return;
    this.isIdle = idle;
    const newInterval = idle ? this.idleProcessInterval : this.processCollectionInterval;

    // Propagate to telemetry collector
    telemetryCollector.setIdle(idle);

    if (this.processInterval) {
      clearInterval(this.processInterval);
      this.processInterval = setInterval(() => {
        this.collectProcessMetrics().catch(err => {
          logger.error('❌ Process metrics collection failed:', err);
        });
      }, newInterval);
      this.processInterval.unref();
      logger.info(
        `📊 Metrics: switched to ${idle ? 'idle' : 'active'} interval (${newInterval / 1000}s)`
      );
    }
  }

  /**
   * Stop metrics collection
   */
  stop(): void {
    if (!this.isRunning) {
      return;
    }

    logger.info('🛑 Stopping metrics collector');
    this.isRunning = false;

    // Stop system metrics collection
    telemetryCollector.stop();

    // Stop process metrics collection
    if (this.processInterval) {
      clearInterval(this.processInterval);
      this.processInterval = null;
    }

    // Stop DNS refresh
    if (this.dnsRefreshInterval) {
      clearInterval(this.dnsRefreshInterval);
      this.dnsRefreshInterval = null;
    }
  }

  /**
   * Check if collector is running
   */
  isCollectorRunning(): boolean {
    return this.isRunning;
  }

  /**
   * Set Socket.IO instance
   */
  setIo(io: SocketIOServer): void {
    this.io = io;
  }

  /**
   * Set process collection interval
   */
  setProcessInterval(ms: number): void {
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
  addProcessPattern(pattern: RegExp, name: string): void {
    this.agentPatterns.push({ pattern, name });
  }
}
