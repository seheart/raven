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
  projectName?: string;
  projectPath?: string;
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
interface AgentEvent {
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
class RavenEventBus extends EventEmitter {
  constructor() {
    super();
    // Increase max listeners to prevent warnings
    this.setMaxListeners(50);
  }

  /**
   * Emit a file system event
   */
  emitFileEvent(event: FileEvent): void {
    this.emit('file_event', event);
  }

  /**
   * Emit a git status event
   */
  emitGitStatus(event: GitStatusEvent): void {
    this.emit('git_status', event);
  }

  /**
   * Emit a telemetry event
   */
  emitTelemetry(event: TelemetryEvent): void {
    this.emit('telemetry', event);
  }

  /**
   * Emit a trigger fired event
   */
  emitTriggerFired(event: TriggerFiredEvent): void {
    this.emit('trigger_fired', event);
  }

  /**
   * Emit an agent event
   */
  emitAgentEvent(event: AgentEvent): void {
    this.emit('agent_event', event);
  }

  /**
   * Listen for file events
   */
  onFileEvent(listener: (event: FileEvent) => void): void {
    this.on('file_event', listener);
  }

  offFileEvent(listener: (event: FileEvent) => void): void {
    this.off('file_event', listener);
  }

  /**
   * Listen for git status events
   */
  onGitStatus(listener: (event: GitStatusEvent) => void): void {
    this.on('git_status', listener);
  }

  offGitStatus(listener: (event: GitStatusEvent) => void): void {
    this.off('git_status', listener);
  }

  /**
   * Listen for telemetry events
   */
  onTelemetry(listener: (event: TelemetryEvent) => void): void {
    this.on('telemetry', listener);
  }

  offTelemetry(listener: (event: TelemetryEvent) => void): void {
    this.off('telemetry', listener);
  }

  /**
   * Listen for trigger fired events
   */
  onTriggerFired(listener: (event: TriggerFiredEvent) => void): void {
    this.on('trigger_fired', listener);
  }

  offTriggerFired(listener: (event: TriggerFiredEvent) => void): void {
    this.off('trigger_fired', listener);
  }

  /**
   * Listen for agent events
   */
  onAgentEvent(listener: (event: AgentEvent) => void): void {
    this.on('agent_event', listener);
  }

  offAgentEvent(listener: (event: AgentEvent) => void): void {
    this.off('agent_event', listener);
  }

  /**
   * Remove all listeners (for cleanup/shutdown)
   */
  removeAllEventListeners(): void {
    this.removeAllListeners();
  }
}

// Export singleton instance
export const EventBus = new RavenEventBus();
