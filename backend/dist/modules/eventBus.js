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
    emitFileEvent(event) {
        this.emit('file_event', event);
    }
    /**
     * Emit a git status event
     */
    emitGitStatus(event) {
        this.emit('git_status', event);
    }
    /**
     * Emit a telemetry event
     */
    emitTelemetry(event) {
        this.emit('telemetry', event);
    }
    /**
     * Emit a trigger fired event
     */
    emitTriggerFired(event) {
        this.emit('trigger_fired', event);
    }
    /**
     * Emit an agent event
     */
    emitAgentEvent(event) {
        this.emit('agent_event', event);
    }
    /**
     * Listen for file events
     */
    onFileEvent(listener) {
        this.on('file_event', listener);
    }
    /**
     * Listen for git status events
     */
    onGitStatus(listener) {
        this.on('git_status', listener);
    }
    /**
     * Listen for telemetry events
     */
    onTelemetry(listener) {
        this.on('telemetry', listener);
    }
    /**
     * Listen for trigger fired events
     */
    onTriggerFired(listener) {
        this.on('trigger_fired', listener);
    }
    /**
     * Listen for agent events
     */
    onAgentEvent(listener) {
        this.on('agent_event', listener);
    }
}
// Export singleton instance
export const EventBus = new RavenEventBus();
//# sourceMappingURL=eventBus.js.map