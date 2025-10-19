/**
 * MetricsCollector - Database integration for system and process metrics
 *
 * Integrates TelemetryCollector from modules with database and Socket.IO.
 * Collects both system-wide metrics and per-process metrics for AI agents.
 */
import { RavenDB } from './db.js';
import type { Server as SocketIOServer } from 'socket.io';
export interface ProcessPattern {
    pattern: RegExp;
    name: string;
}
export declare class MetricsCollector {
    private db;
    private sessionId;
    private io;
    private processInterval;
    private isRunning;
    private processCollectionInterval;
    private agentPatterns;
    constructor(db: RavenDB, sessionId: string, io?: SocketIOServer | null);
    /**
     * Setup EventBus listeners for telemetry
     */
    private setupEventListeners;
    /**
     * Handle telemetry event from EventBus
     */
    private handleTelemetryEvent;
    /**
     * Collect process-specific metrics for AI agents
     */
    private collectProcessMetrics;
    /**
     * Start metrics collection
     */
    start(): void;
    /**
     * Stop metrics collection
     */
    stop(): void;
    /**
     * Check if collector is running
     */
    isCollectorRunning(): boolean;
    /**
     * Set Socket.IO instance
     */
    setIo(io: SocketIOServer): void;
    /**
     * Set process collection interval
     */
    setProcessInterval(ms: number): void;
    /**
     * Add custom process pattern to track
     */
    addProcessPattern(pattern: RegExp, name: string): void;
}
//# sourceMappingURL=metrics-collector.d.ts.map