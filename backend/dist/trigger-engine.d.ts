/**
 * TriggerEngine - Custom alert trigger system
 *
 * Evaluates rules from config.toml and fires triggers based on:
 * - File patterns
 * - Agent names
 * - Event types
 * - Numeric thresholds (lines changed, duration, CPU, memory)
 *
 * Integrates with EventBus for event-driven architecture
 */
import type { Server as SocketIOServer } from 'socket.io';
/**
 * Trigger rule definition from config.toml
 */
export interface TriggerRule {
    name: string;
    file?: string;
    agent?: string;
    event_type?: string;
    lines_changed?: string;
    duration_ms?: string;
    cpu_percent?: string;
    memory_percent?: string;
    action: 'log' | 'notify' | 'command';
    message?: string;
    command?: string;
    cooldown_seconds: number;
}
/**
 * Event data passed to trigger evaluation
 */
export interface TriggerEvent {
    file?: string;
    agent?: string;
    event_type?: string;
    lines_changed?: number;
    duration_ms?: number;
    cpu_percent?: number;
    memory_percent?: number;
    event_size?: number;
}
/**
 * Triggered event record
 */
export interface TriggeredEventRecord {
    trigger_name: string;
    timestamp: number;
    message: string;
    action: string;
}
/**
 * Trigger statistics
 */
export interface TriggerStats {
    total_triggers: number;
    active_triggers: number;
    trigger_counts: Record<string, number>;
}
export declare class TriggerEngine {
    private configPath;
    private io;
    private triggers;
    private triggeredEvents;
    private cooldowns;
    private triggerCounts;
    constructor(configPath: string, io?: SocketIOServer | null);
    /**
     * Set Socket.IO instance for real-time updates
     */
    setIo(io: SocketIOServer): void;
    /**
     * Load triggers from config.toml
     */
    loadConfig(): void;
    /**
     * Create example config file
     */
    private createExampleConfig;
    /**
     * Evaluate an event against all trigger rules
     */
    evaluate(event: TriggerEvent): TriggeredEventRecord[];
    /**
     * Check if event matches trigger conditions
     */
    private shouldTrigger;
    /**
     * Match filename against glob pattern
     */
    private matchPattern;
    /**
     * Check numeric condition (>, <, >=, <=, ==)
     */
    private checkNumericCondition;
    /**
     * Format message template with event values
     */
    private formatMessage;
    /**
     * Execute trigger action (log, notify, command)
     */
    private executeAction;
    /**
     * Send platform-specific notification
     */
    private sendNotification;
    /**
     * Log trigger to file
     */
    private logToFile;
    /**
     * Execute shell command
     */
    private executeCommand;
    /**
     * Get all trigger configurations
     */
    getTriggersConfig(): TriggerRule[];
    /**
     * Get recent triggered events
     */
    getTriggeredEvents(limit?: number): TriggeredEventRecord[];
    /**
     * Get trigger statistics
     */
    getTriggerStats(): TriggerStats;
    /**
     * Reload configuration from disk
     */
    reloadConfig(): string;
    /**
     * Clear all cooldowns
     */
    clearCooldowns(): string;
}
//# sourceMappingURL=trigger-engine.d.ts.map