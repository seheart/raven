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

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { logger } from './utils/logger.js';
import toml from 'toml';
import { EventBus, TriggerFiredEvent } from './modules/eventBus.js';
import type { Server as SocketIOServer } from 'socket.io';

// ==================== Type Definitions ====================

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

// ==================== TriggerEngine Class ====================

export class TriggerEngine {
  private configPath: string;
  private io: SocketIOServer | null;
  private triggers: Map<string, TriggerRule>;
  private triggeredEvents: TriggeredEventRecord[];
  private cooldowns: Map<string, number>;
  private triggerCounts: Map<string, number>;

  constructor(configPath: string, io: SocketIOServer | null = null) {
    this.configPath = configPath;
    this.io = io;
    this.triggers = new Map();
    this.triggeredEvents = [];
    this.cooldowns = new Map();
    this.triggerCounts = new Map();
    this.loadConfig();
  }

  /**
   * Set Socket.IO instance for real-time updates
   */
  setIo(io: SocketIOServer): void {
    this.io = io;
  }

  /**
   * Load triggers from config.toml
   */
  loadConfig(): void {
    try {
      const configFile = path.join(this.configPath, 'config.toml');

      if (!fs.existsSync(configFile)) {
        logger.info('⚠️  No config.toml found, creating example config...');
        this.createExampleConfig(configFile);
      }

      const configContent = fs.readFileSync(configFile, 'utf8');
      const config = toml.parse(configContent);

      this.triggers.clear();

      if (config.triggers) {
        for (const [name, rule] of Object.entries(config.triggers)) {
          this.triggers.set(name, {
            name,
            ...(rule as Omit<TriggerRule, 'name'>),
            cooldown_seconds: (rule as any).cooldown_seconds || 60
          });
        }
      }

      logger.info(`✅ Loaded ${this.triggers.size} trigger rules`);
    } catch (error: any) {
      logger.error('❌ Failed to load triggers config:', error);
    }
  }

  /**
   * Create example config file
   */
  private createExampleConfig(configFile: string): void {
    const exampleConfig = `# Raven Custom Triggers Configuration

[triggers.large_edit]
file = "*.js"
lines_changed = ">100"
action = "log"
message = "Large edit detected: {file} ({lines_changed} lines)"
cooldown_seconds = 60

[triggers.slow_operation]
agent = "claude"
duration_ms = ">5000"
action = "log"
message = "Slow {agent} operation: {file} took {duration_ms}ms"
cooldown_seconds = 120

[triggers.high_cpu]
cpu_percent = ">80"
action = "log"
message = "High CPU usage: {cpu_percent}%"
cooldown_seconds = 300
`;

    fs.mkdirSync(path.dirname(configFile), { recursive: true });
    fs.writeFileSync(configFile, exampleConfig);
    logger.info(`✅ Created example config at ${configFile}`);
  }

  /**
   * Evaluate an event against all trigger rules
   */
  evaluate(event: TriggerEvent): TriggeredEventRecord[] {
    const results: TriggeredEventRecord[] = [];

    for (const [name, trigger] of this.triggers) {
      if (this.shouldTrigger(trigger, event)) {
        // Check cooldown
        const lastTrigger = this.cooldowns.get(name);
        const now = Date.now();

        if (lastTrigger && trigger.cooldown_seconds > 0) {
          const cooldownMs = trigger.cooldown_seconds * 1000;
          if (now - lastTrigger < cooldownMs) {
            continue; // Still in cooldown
          }
        }

        // Execute trigger
        const message = this.formatMessage(trigger.message || 'Trigger fired', event);
        this.executeAction(trigger, message, event);

        // Record trigger
        const triggerEvent: TriggeredEventRecord = {
          trigger_name: name,
          timestamp: Math.floor(now / 1000), // Unix timestamp in seconds
          message,
          action: trigger.action
        };

        this.triggeredEvents.unshift(triggerEvent);
        if (this.triggeredEvents.length > 1000) {
          this.triggeredEvents.pop();
        }

        // Update cooldown and counts
        this.cooldowns.set(name, now);
        this.triggerCounts.set(name, (this.triggerCounts.get(name) || 0) + 1);

        results.push(triggerEvent);

        // Emit via EventBus
        const eventBusEvent: TriggerFiredEvent = {
          ruleName: name,
          message,
          severity: 'info',
          metadata: { action: trigger.action, trigger }
        };
        EventBus.emitTriggerFired(eventBusEvent);

        // Emit real-time trigger event via WebSocket
        if (this.io) {
          this.io.emit('trigger-fired', triggerEvent);
          this.io.emit('trigger-stats', this.getTriggerStats());
        }
      }
    }

    return results;
  }

  /**
   * Check if event matches trigger conditions
   */
  private shouldTrigger(trigger: TriggerRule, event: TriggerEvent): boolean {
    // Check file pattern
    if (trigger.file && event.file) {
      if (!this.matchPattern(event.file, trigger.file)) {
        return false;
      }
    }

    // Check agent
    if (trigger.agent && event.agent) {
      if (event.agent.toLowerCase() !== trigger.agent.toLowerCase()) {
        return false;
      }
    }

    // Check event type
    if (trigger.event_type && event.event_type) {
      if (event.event_type.toLowerCase() !== trigger.event_type.toLowerCase()) {
        return false;
      }
    }

    // Check numeric conditions
    if (trigger.lines_changed && event.lines_changed !== undefined) {
      if (!this.checkNumericCondition(event.lines_changed, trigger.lines_changed)) {
        return false;
      }
    }

    if (trigger.duration_ms && event.duration_ms !== undefined) {
      if (!this.checkNumericCondition(event.duration_ms, trigger.duration_ms)) {
        return false;
      }
    }

    if (trigger.cpu_percent && event.cpu_percent !== undefined) {
      if (!this.checkNumericCondition(event.cpu_percent, trigger.cpu_percent)) {
        return false;
      }
    }

    if (trigger.memory_percent && event.memory_percent !== undefined) {
      if (!this.checkNumericCondition(event.memory_percent, trigger.memory_percent)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Match filename against glob pattern
   */
  private matchPattern(filename: string, pattern: string): boolean {
    // Simple glob pattern matching
    const regex = pattern.replace(/\./g, '\\.').replace(/\*/g, '.*').replace(/\?/g, '.');
    return new RegExp(`^${regex}$`).test(filename);
  }

  /**
   * Check numeric condition (>, <, >=, <=, ==)
   */
  private checkNumericCondition(value: number, condition: string): boolean {
    const match = condition.match(/^([><=]+)(\d+\.?\d*)$/);
    if (!match) return false;

    const [, operator, threshold] = match;
    const thresholdNum = parseFloat(threshold);

    switch (operator) {
      case '>':
        return value > thresholdNum;
      case '<':
        return value < thresholdNum;
      case '>=':
        return value >= thresholdNum;
      case '<=':
        return value <= thresholdNum;
      case '==':
        return value === thresholdNum;
      default:
        return false;
    }
  }

  /**
   * Format message template with event values
   */
  private formatMessage(template: string, event: TriggerEvent): string {
    return template
      .replace(/\{file\}/g, String(event.file || ''))
      .replace(/\{agent\}/g, String(event.agent || ''))
      .replace(/\{event_type\}/g, String(event.event_type || ''))
      .replace(/\{lines_changed\}/g, String(event.lines_changed || ''))
      .replace(/\{duration_ms\}/g, String(event.duration_ms || ''))
      .replace(/\{cpu_percent\}/g, String(event.cpu_percent || ''))
      .replace(/\{memory_percent\}/g, String(event.memory_percent || ''));
  }

  /**
   * Execute trigger action (log, notify, command)
   */
  private executeAction(trigger: TriggerRule, message: string, event: TriggerEvent): void {
    try {
      switch (trigger.action) {
        case 'notify':
          this.sendNotification(message);
          break;
        case 'log':
          this.logToFile(trigger.name, message);
          break;
        case 'command':
          if (trigger.command) {
            this.executeCommand(trigger.command, event);
          }
          break;
      }
    } catch (error) {
      logger.error(`❌ Failed to execute trigger action: ${error}`);
    }
  }

  /**
   * Send platform-specific notification
   */
  private sendNotification(message: string): void {
    try {
      if (process.platform === 'linux') {
        execSync(`notify-send "Raven Trigger" "${message}"`);
      } else if (process.platform === 'darwin') {
        execSync(`osascript -e 'display notification "${message}" with title "Raven Trigger"'`);
      } else if (process.platform === 'win32') {
        logger.info(`📢 Notification: ${message}`);
      }
    } catch (error) {
      logger.error(`❌ Failed to send notification: ${error}`);
    }
  }

  /**
   * Log trigger to file
   */
  private logToFile(triggerName: string, message: string): void {
    try {
      const logFile = path.join(this.configPath, 'triggers.log');
      const timestamp = new Date().toISOString();
      const logLine = `[${timestamp}] ${triggerName} - ${message}\n`;

      fs.appendFileSync(logFile, logLine);
      logger.info(`📝 Logged: ${message}`);
    } catch (error) {
      logger.error(`❌ Failed to log to file: ${error}`);
    }
  }

  /**
   * Execute shell command
   */
  private executeCommand(command: string, event: TriggerEvent): void {
    try {
      const formattedCommand = this.formatMessage(command, event);
      execSync(formattedCommand);
      logger.info(`⚙️  Executed command: ${formattedCommand}`);
    } catch (error) {
      logger.error(`❌ Failed to execute command: ${error}`);
    }
  }

  // ==================== API Methods ====================

  /**
   * Get all trigger configurations
   */
  getTriggersConfig(): TriggerRule[] {
    return Array.from(this.triggers.values());
  }

  /**
   * Get recent triggered events
   */
  getTriggeredEvents(limit: number = 100): TriggeredEventRecord[] {
    return this.triggeredEvents.slice(0, limit);
  }

  /**
   * Get trigger statistics
   */
  getTriggerStats(): TriggerStats {
    return {
      total_triggers: this.triggeredEvents.length,
      active_triggers: this.triggers.size,
      trigger_counts: Object.fromEntries(this.triggerCounts)
    };
  }

  /**
   * Reload configuration from disk
   */
  reloadConfig(): string {
    this.loadConfig();
    return `Reloaded ${this.triggers.size} trigger rules`;
  }

  /**
   * Clear all cooldowns
   */
  clearCooldowns(): string {
    this.cooldowns.clear();
    return 'All trigger cooldowns cleared';
  }
}
