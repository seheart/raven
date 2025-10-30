import fs from 'fs';
import path from 'path';
import { execSync, execFile } from 'child_process';
import { promisify } from 'util';
import toml from 'toml';
import { logger } from './utils/logger.js';

const execFileAsync = promisify(execFile);

export class TriggerEngine {
  constructor(configPath, io = null, db = null) {
    this.configPath = configPath;
    this.io = io;
    this.db = db;
    this.triggers = new Map();
    this.triggeredEvents = [];
    this.cooldowns = new Map();
    this.triggerCounts = new Map();
    this.loadConfig();
  }

  setIo(io) {
    this.io = io;
  }

  setDb(db) {
    this.db = db;
  }

  /**
   * Sanitize user input to prevent command injection
   * Removes shell metacharacters and limits length
   */
  sanitizeShellArg(arg) {
    if (typeof arg !== 'string') {
      arg = String(arg);
    }

    // Remove shell metacharacters
    return arg
      .replace(/[;&|`$(){}[\]<>\\'"]/g, '')
      .replace(/\n/g, ' ')
      .replace(/\r/g, '')
      .trim()
      .slice(0, 500); // Limit length
  }

  /**
   * Format message safely by sanitizing all replaced values
   */
  formatMessageSafe(template, event) {
    return template
      .replace(/\{file\}/g, event.file ? this.sanitizeShellArg(event.file) : '')
      .replace(/\{agent\}/g, event.agent ? this.sanitizeShellArg(event.agent) : '')
      .replace(/\{event_type\}/g, event.event_type ? this.sanitizeShellArg(event.event_type) : '')
      .replace(/\{lines_changed\}/g, event.lines_changed !== undefined ? this.sanitizeShellArg(event.lines_changed) : '')
      .replace(/\{duration_ms\}/g, event.duration_ms !== undefined ? this.sanitizeShellArg(event.duration_ms) : '')
      .replace(/\{cpu_percent\}/g, event.cpu_percent !== undefined ? this.sanitizeShellArg(event.cpu_percent) : '')
      .replace(/\{memory_percent\}/g, event.memory_percent !== undefined ? this.sanitizeShellArg(event.memory_percent) : '');
  }

  loadConfig() {
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
            ...rule,
            cooldown_seconds: rule.cooldown_seconds || 60
          });
        }
      }

      logger.info(`✅ Loaded ${this.triggers.size} trigger rules`);
    } catch (error) {
      logger.error('❌ Failed to load triggers config:', error);
    }
  }

  createExampleConfig(configFile) {
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

  evaluate(event) {
    const results = [];

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
        const message = this.formatMessageSafe(trigger.message || 'Trigger fired', event);
        this.executeAction(trigger, message, event);

        // Record trigger
        const triggerEvent = {
          trigger_name: name,
          timestamp: Math.floor(now / 1000), // Unix timestamp in seconds
          message,
          action: trigger.action,
          project: event.project || null // Preserve project info for frontend filtering
        };

        this.triggeredEvents.unshift(triggerEvent);
        // Keep only last 100 events in memory to prevent memory leak (rest are in database)
        if (this.triggeredEvents.length > 100) {
          this.triggeredEvents.pop();
        }

        // Update cooldown and counts
        this.cooldowns.set(name, now);
        this.triggerCounts.set(name, (this.triggerCounts.get(name) || 0) + 1);

        results.push(triggerEvent);

        // Create notification in database
        if (this.db) {
          const notificationId = this.db.insertNotification(
            new Date().toISOString(),
            'trigger',
            'warning',
            `Trigger: ${name}`,
            message,
            { trigger_name: name, action: trigger.action, event },
            null // session_id
          );

          // Emit notification event
          if (this.io) {
            this.io.emit('notification', {
              id: notificationId,
              timestamp: new Date().toISOString(),
              type: 'trigger',
              severity: 'warning',
              title: `Trigger: ${name}`,
              message,
              read: false,
              metadata: { trigger_name: name, action: trigger.action }
            });
          }
        }

        // Emit real-time trigger event via WebSocket
        if (this.io) {
          this.io.emit('trigger-fired', triggerEvent);
          this.io.emit('trigger-stats', this.getTriggerStats());
        }
      }
    }

    return results;
  }

  shouldTrigger(trigger, event) {
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

    if (trigger.lines_deleted && event.lines_deleted !== undefined) {
      if (!this.checkNumericCondition(event.lines_deleted, trigger.lines_deleted)) {
        return false;
      }
    }

    if (trigger.lines_added && event.lines_added !== undefined) {
      if (!this.checkNumericCondition(event.lines_added, trigger.lines_added)) {
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

  matchPattern(filename, pattern) {
    // Simple glob pattern matching
    const regex = pattern.replace(/\./g, '\\.').replace(/\*/g, '.*').replace(/\?/g, '.');

    return new RegExp(`^${regex}$`).test(filename);
  }

  checkNumericCondition(value, condition) {
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
   * @deprecated Use formatMessageSafe() instead for security
   * This method is kept for backward compatibility but does not sanitize input
   */
  formatMessage(template, event) {
    logger.warn('formatMessage() is deprecated. Use formatMessageSafe() instead for security.');
    return this.formatMessageSafe(template, event);
  }

  executeAction(trigger, message, event) {
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

  async sendNotification(message) {
    try {
      // Sanitize message to prevent injection
      const safeMessage = this.sanitizeShellArg(message);

      // Platform-specific notifications using execFile for security
      if (process.platform === 'linux') {
        await execFileAsync('notify-send', ['Raven Trigger', safeMessage]);
      } else if (process.platform === 'darwin') {
        await execFileAsync('osascript', [
          '-e',
          `display notification "${safeMessage}" with title "Raven Trigger"`
        ]);
      } else if (process.platform === 'win32') {
        // Windows notification (simplified - log only for safety)
        logger.info(`📢 Notification: ${safeMessage}`);
      }
    } catch (error) {
      logger.error(`❌ Failed to send notification: ${error.message}`);
    }
  }

  logToFile(triggerName, message) {
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

  async executeCommand(command, event) {
    try {
      // Security: Whitelist of allowed commands to prevent arbitrary code execution
      const ALLOWED_COMMANDS = [
        'echo',
        'notify-send',
        'osascript', // macOS notifications
        'logger', // System logger
        'wall' // Write to all users
        // Note: Removed powershell.exe for security - use logger instead
      ];

      // Parse command template to extract base command and arguments
      const formattedCommand = this.formatMessageSafe(command, event);
      const parts = formattedCommand.trim().split(/\s+/);
      const baseCommand = parts[0];
      const args = parts.slice(1);

      // Check if command is whitelisted
      const isAllowed = ALLOWED_COMMANDS.some(allowed =>
        baseCommand === allowed || baseCommand.endsWith(`/${allowed}`) || baseCommand.endsWith(`\\${allowed}`)
      );

      if (!isAllowed) {
        logger.error(`❌ Command execution blocked: '${baseCommand}' is not in whitelist`);
        logger.error(`   Allowed commands: ${ALLOWED_COMMANDS.join(', ')}`);
        logger.error('   To enable custom commands, add them to ALLOWED_COMMANDS in trigger-engine.js');
        return;
      }

      // Additional sanitization of arguments (defense in depth)
      const sanitizedArgs = args.map(arg => this.sanitizeShellArg(arg));

      // Use execFile with separated arguments (more secure than shell execution)
      await execFileAsync(baseCommand, sanitizedArgs, {
        timeout: 5000,
        shell: false  // Explicitly disable shell execution
      });

      logger.info(`⚙️  Executed command: ${baseCommand} ${sanitizedArgs.join(' ')}`);
    } catch (error) {
      logger.error(`❌ Failed to execute command: ${error.message}`);
    }
  }

  // API Methods

  getTriggersConfig() {
    return Array.from(this.triggers.values()).map(trigger => ({
      name: trigger.name,
      file: trigger.file,
      agent: trigger.agent,
      event_type: trigger.event_type,
      lines_changed: trigger.lines_changed,
      duration_ms: trigger.duration_ms,
      cpu_percent: trigger.cpu_percent,
      memory_percent: trigger.memory_percent,
      action: trigger.action,
      message: trigger.message,
      command: trigger.command,
      cooldown_seconds: trigger.cooldown_seconds
    }));
  }

  getTriggeredEvents(limit = 100) {
    return this.triggeredEvents.slice(0, limit);
  }

  getTriggerStats() {
    return {
      total_triggers: this.triggeredEvents.length,
      active_triggers: this.triggers.size,
      trigger_counts: Object.fromEntries(this.triggerCounts)
    };
  }

  reloadConfig() {
    this.loadConfig();
    return `Reloaded ${this.triggers.size} trigger rules`;
  }

  clearCooldowns() {
    this.cooldowns.clear();
    return 'All trigger cooldowns cleared';
  }

  // Alias for backward compatibility
  evaluateTriggers(event) {
    return this.evaluate(event);
  }
}
