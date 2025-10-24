/**
 * Centralized Logging Utility for Raven
 * Provides consistent logging with levels and production safeguards
 */

// Log levels
const LOG_LEVELS = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
  NONE: 4
};

// Current log level (set via environment or config)
// In production, set to ERROR to suppress debug/info logs
const CURRENT_LEVEL = import.meta.env.MODE === 'production' 
  ? LOG_LEVELS.ERROR 
  : LOG_LEVELS.DEBUG;

/**
 * Logger class with level-based filtering
 */
class Logger {
  constructor(context = '') {
    this.context = context;
  }

  /**
   * Debug-level logging (development only)
   */
  debug(...args) {
    if (CURRENT_LEVEL <= LOG_LEVELS.DEBUG) {
      const prefix = this.context ? `[${this.context}]` : '';
      console.log(`🐛 ${prefix}`, ...args);
    }
  }

  /**
   * Info-level logging
   */
  info(...args) {
    if (CURRENT_LEVEL <= LOG_LEVELS.INFO) {
      const prefix = this.context ? `[${this.context}]` : '';
      console.log(`ℹ️ ${prefix}`, ...args);
    }
  }

  /**
   * Warning-level logging
   */
  warn(...args) {
    if (CURRENT_LEVEL <= LOG_LEVELS.WARN) {
      const prefix = this.context ? `[${this.context}]` : '';
      console.warn(`⚠️ ${prefix}`, ...args);
    }
  }

  /**
   * Error-level logging (always shown)
   */
  error(...args) {
    if (CURRENT_LEVEL <= LOG_LEVELS.ERROR) {
      const prefix = this.context ? `[${this.context}]` : '';
      console.error(`❌ ${prefix}`, ...args);
    }
  }

  /**
   * Create a child logger with additional context
   */
  child(childContext) {
    const newContext = this.context 
      ? `${this.context}:${childContext}` 
      : childContext;
    return new Logger(newContext);
  }

  /**
   * Group multiple log statements
   */
  group(label, callback) {
    if (CURRENT_LEVEL <= LOG_LEVELS.DEBUG) {
      console.group(label);
      callback();
      console.groupEnd();
    }
  }

  /**
   * Time a function execution
   */
  time(label, callback) {
    if (CURRENT_LEVEL <= LOG_LEVELS.DEBUG) {
      console.time(label);
      const result = callback();
      console.timeEnd(label);
      return result;
    }
    return callback();
  }

  /**
   * Time an async function execution
   */
  async timeAsync(label, callback) {
    if (CURRENT_LEVEL <= LOG_LEVELS.DEBUG) {
      console.time(label);
      const result = await callback();
      console.timeEnd(label);
      return result;
    }
    return await callback();
  }
}

// Export default logger instance
export const logger = new Logger('Raven');

// Export named loggers for specific contexts
export const apiLogger = new Logger('API');
export const wsLogger = new Logger('WebSocket');
export const dbLogger = new Logger('Database');
export const uiLogger = new Logger('UI');

// Export Logger class for custom instances
export { Logger, LOG_LEVELS };

// Export helper to create contextual loggers
export function createLogger(context) {
  return new Logger(context);
}
