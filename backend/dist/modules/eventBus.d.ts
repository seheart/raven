/**
 * EventBus - Centralized event emitter for Raven
 *
 * Acts as the central nervous system for all Raven events.
 * Modules emit events here, and other modules or the server can listen.
 *
 * Event Types:
 * - file_event: File system changes (add, change, unlink)
 * - git_status: Git repository status updates
 * - telemetry: System metrics (CPU, memory)
 * - trigger_fired: Alert triggers activated
 * - agent_event: AI agent telemetry events
 */
import { EventEmitter } from 'events';
/**
 * File event payload
 */
export interface FileEvent {
    type: 'add' | 'change' | 'unlink';
    path: string;
    ts: number;
    content?: string;
    hash?: string;
    size?: number;
}
/**
 * Git status event payload
 */
export interface GitStatusEvent {
    branch: string;
    modified: string[];
    created: string[];
    deleted: string[];
    ahead: number;
    behind: number;
    current: string;
}
/**
 * Telemetry event payload
 */
export interface TelemetryEvent {
    cpu: number;
    mem: number;
    ts: number;
    networkRx?: number;
    networkTx?: number;
}
/**
 * Trigger fired event payload
 */
export interface TriggerFiredEvent {
    ruleName: string;
    message: string;
    severity: 'info' | 'warning' | 'error';
    metadata?: Record<string, any>;
}
/**
 * Agent event payload
 */
export interface AgentEvent {
    agent: string;
    eventType: string;
    file?: string;
    linesChanged?: number;
    durationMs?: number;
    message: string;
    metadata?: Record<string, any>;
}
/**
 * Centralized event bus using Node.js EventEmitter
 */
declare class RavenEventBus extends EventEmitter {
    constructor();
    /**
     * Emit a file system event
     */
    emitFileEvent(event: FileEvent): void;
    /**
     * Emit a git status event
     */
    emitGitStatus(event: GitStatusEvent): void;
    /**
     * Emit a telemetry event
     */
    emitTelemetry(event: TelemetryEvent): void;
    /**
     * Emit a trigger fired event
     */
    emitTriggerFired(event: TriggerFiredEvent): void;
    /**
     * Emit an agent event
     */
    emitAgentEvent(event: AgentEvent): void;
    /**
     * Listen for file events
     */
    onFileEvent(listener: (event: FileEvent) => void): void;
    /**
     * Listen for git status events
     */
    onGitStatus(listener: (event: GitStatusEvent) => void): void;
    /**
     * Listen for telemetry events
     */
    onTelemetry(listener: (event: TelemetryEvent) => void): void;
    /**
     * Listen for trigger fired events
     */
    onTriggerFired(listener: (event: TriggerFiredEvent) => void): void;
    /**
     * Listen for agent events
     */
    onAgentEvent(listener: (event: AgentEvent) => void): void;
}
export declare const EventBus: RavenEventBus;
export {};
//# sourceMappingURL=eventBus.d.ts.map