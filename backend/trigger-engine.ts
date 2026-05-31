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
import { execFile } from 'child_process';
import { promisify } from 'util';
import { logger } from './utils/logger.js';
import toml from 'toml';
import { EventBus, TriggerFiredEvent } from './modules/eventBus.js';
import { internalMetrics } from './services/internal-metrics.js';
import type { Server as SocketIOServer } from 'socket.io';

const execFileAsync = promisify(execFile);

// ==================== Type Definitions ====================

/**
 * Trigger rule definition from config.toml
 */
interface TriggerRule {
  name: string;
  file?: string;
  agent?: string;
  event_type?: string;
  lines_changed?: string;
  lines_deleted?: string;
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
interface TriggerEvent {
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
interface TriggeredEventRecord {
  trigger_name: string;
  timestamp: number;
  message: string;
  action: string;
}

/**
 * Trigger statistics
 */
interface TriggerStats {
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
    const evalStart = performance.now();

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
          timestamp: Math.floor(now / 1000),
          message,
          action: trigger.action,
          file: event.file || null
        } as any;

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

    // Trim expired cooldown entries to prevent unbounded map growth
    this.trimExpiredCooldowns();

    internalMetrics.recordTriggerLatency(performance.now() - evalStart);
    return results;
  }

  /**
   * Remove cooldown entries that have expired past the max cooldown time
   */
  private trimExpiredCooldowns(): void {
    if (this.cooldowns.size <= this.triggers.size) return; // Nothing to trim

    const now = Date.now();
    let maxCooldownMs = 0;
    for (const trigger of this.triggers.values()) {
      maxCooldownMs = Math.max(maxCooldownMs, (trigger.cooldown_seconds || 60) * 1000);
    }

    for (const [name, lastFired] of this.cooldowns) {
      if (now - lastFired > maxCooldownMs) {
        this.cooldowns.delete(name);
      }
    }
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

    // Numeric conditions: when a trigger declares one, the event MUST carry
    // the matching field, otherwise no match. The previous code treated
    // missing fields as auto-pass, so cpu_percent=">80" and lines_deleted=
    // ">100" rules fired on every plain file event (event had no cpu/duration
    // attached) — the recent-events feed showed "0%" / "0 lines deleted"
    // because the absent field was coerced to 0 in the message template.
    if (trigger.lines_changed) {
      if (
        event.lines_changed === undefined ||
        !this.checkNumericCondition(event.lines_changed, trigger.lines_changed)
      ) {
        return false;
      }
    }
    if (trigger.lines_deleted) {
      // lines_deleted reuses the lines_changed field on the event payload.
      if (
        event.lines_changed === undefined ||
        !this.checkNumericCondition(event.lines_changed, trigger.lines_deleted)
      ) {
        return false;
      }
    }
    if (trigger.duration_ms) {
      if (
        event.duration_ms === undefined ||
        !this.checkNumericCondition(event.duration_ms, trigger.duration_ms)
      ) {
        return false;
      }
    }
    if (trigger.cpu_percent) {
      if (
        event.cpu_percent === undefined ||
        !this.checkNumericCondition(event.cpu_percent, trigger.cpu_percent)
      ) {
        return false;
      }
    }
    if (trigger.memory_percent) {
      if (
        event.memory_percent === undefined ||
        !this.checkNumericCondition(event.memory_percent, trigger.memory_percent)
      ) {
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
    return (
      template
        .replace(/\{file\}/g, String(event.file || ''))
        .replace(/\{agent\}/g, String(event.agent || ''))
        .replace(/\{event_type\}/g, String(event.event_type || ''))
        .replace(/\{lines_changed\}/g, String(event.lines_changed || 0))
        // File events carry no separate deletion count — `lines_changed` (the
        // diff's line count) is all we have, and the `lines_deleted` trigger
        // condition reuses it (see matches()). So the {lines_deleted} placeholder
        // resolves to the same field; otherwise it read a field that never exists
        // and always rendered 0 ("…0 lines deleted").
        .replace(/\{lines_deleted\}/g, String(event.lines_changed || 0))
        .replace(/\{duration_ms\}/g, String(event.duration_ms || 0))
        .replace(/\{cpu_percent\}/g, String(event.cpu_percent || 0))
        .replace(/\{memory_percent\}/g, String(event.memory_percent || 0))
    );
  }

  /**
   * Execute trigger action (log, notify, command)
   */
  private async executeAction(
    trigger: TriggerRule,
    message: string,
    event: TriggerEvent
  ): Promise<void> {
    try {
      switch (trigger.action) {
        case 'notify':
          await this.sendNotification(message);
          break;
        case 'log':
          this.logToFile(trigger.name, message);
          break;
        case 'command':
          if (trigger.command) {
            await this.executeCommand(trigger.command, event);
          }
          break;
      }
    } catch (error) {
      logger.error(`❌ Failed to execute trigger action: ${error}`);
    }
  }

  /**
   * Sanitize user input to prevent command injection
   */
  private sanitizeShellArg(arg: string | number): string {
    let str = typeof arg !== 'string' ? String(arg) : arg;
    return str
      .replace(/[;&|`$(){}[\]<>\\'"]/g, '')
      .replace(/\n/g, ' ')
      .replace(/\r/g, '')
      .trim()
      .slice(0, 500);
  }

  /**
   * Format message safely by sanitizing all replaced values
   */
  private formatMessageSafe(template: string, event: TriggerEvent): string {
    return template
      .replace(/\{file\}/g, event.file ? this.sanitizeShellArg(event.file) : '')
      .replace(/\{agent\}/g, event.agent ? this.sanitizeShellArg(event.agent) : '')
      .replace(/\{event_type\}/g, event.event_type ? this.sanitizeShellArg(event.event_type) : '')
      .replace(
        /\{lines_changed\}/g,
        event.lines_changed !== undefined ? this.sanitizeShellArg(event.lines_changed) : ''
      )
      .replace(
        /\{duration_ms\}/g,
        event.duration_ms !== undefined ? this.sanitizeShellArg(event.duration_ms) : ''
      )
      .replace(
        /\{cpu_percent\}/g,
        event.cpu_percent !== undefined ? this.sanitizeShellArg(event.cpu_percent) : ''
      )
      .replace(
        /\{memory_percent\}/g,
        event.memory_percent !== undefined ? this.sanitizeShellArg(event.memory_percent) : ''
      );
  }

  /**
   * Send platform-specific notification
   */
  private async sendNotification(message: string): Promise<void> {
    try {
      const sanitized = this.sanitizeShellArg(message);
      if (process.platform === 'linux') {
        await execFileAsync('notify-send', ['Raven Trigger', sanitized], {
          timeout: 5000,
          shell: false
        });
      } else if (process.platform === 'darwin') {
        await execFileAsync(
          'osascript',
          ['-e', `display notification "${sanitized}" with title "Raven Trigger"`],
          { timeout: 5000, shell: false }
        );
      } else {
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

  private static readonly ALLOWED_COMMANDS = ['echo', 'notify-send', 'osascript', 'logger', 'wall'];

  /**
   * Execute shell command with whitelist and argument sanitization
   */
  private async executeCommand(command: string, event: TriggerEvent): Promise<void> {
    try {
      const formattedCommand = this.formatMessageSafe(command, event);
      const parts = formattedCommand.trim().split(/\s+/);
      const baseCommand = parts[0];
      const args = parts.slice(1);

      const isAllowed = TriggerEngine.ALLOWED_COMMANDS.some(
        allowed => baseCommand === allowed || baseCommand.endsWith(`/${allowed}`)
      );

      if (!isAllowed) {
        logger.error(`❌ Command execution blocked: '${baseCommand}' is not in whitelist`);
        logger.error(`   Allowed commands: ${TriggerEngine.ALLOWED_COMMANDS.join(', ')}`);
        return;
      }

      const sanitizedArgs = args.map(arg => this.sanitizeShellArg(arg));

      await execFileAsync(baseCommand, sanitizedArgs, {
        timeout: 5000,
        shell: false
      });

      logger.info(`⚙️  Executed command: ${baseCommand} ${sanitizedArgs.join(' ')}`);
    } catch (error) {
      logger.error(
        `❌ Failed to execute command: ${error instanceof Error ? error.message : error}`
      );
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

  /**
   * Clear all trigger counts
   */
  clearStats(): string {
    this.triggerCounts.clear();
    return 'All trigger counts cleared';
  }
}
