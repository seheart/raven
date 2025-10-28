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
 * @typedef {'DEBUG'|'INFO'|'WARN'|'ERROR'|'NONE'} LogLevel
 */

/**
 * Logger class with level-based filtering
 */
class Logger {
  /**
   * @param {string} [context=''] - Logger context/namespace
   */
  constructor(context = '') {
    /** @type {string} */
    this.context = context;
  }

  /**
   * Debug-level logging (development only)
   * @param {...any} args - Arguments to log
   */
  debug(...args) {
    if (CURRENT_LEVEL <= LOG_LEVELS.DEBUG) {
      const prefix = this.context ? `[${this.context}]` : '';
      console.log(`🐛 ${prefix}`, ...args);
    }
  }

  /**
   * Info-level logging
   * @param {...any} args - Arguments to log
   */
  info(...args) {
    if (CURRENT_LEVEL <= LOG_LEVELS.INFO) {
      const prefix = this.context ? `[${this.context}]` : '';
      console.log(`ℹ️ ${prefix}`, ...args);
    }
  }

  /**
   * Warning-level logging
   * @param {...any} args - Arguments to log
   */
  warn(...args) {
    if (CURRENT_LEVEL <= LOG_LEVELS.WARN) {
      const prefix = this.context ? `[${this.context}]` : '';
      console.warn(`⚠️ ${prefix}`, ...args);
    }
  }

  /**
   * Error-level logging (always shown)
   * @param {...any} args - Arguments to log
   */
  error(...args) {
    if (CURRENT_LEVEL <= LOG_LEVELS.ERROR) {
      const prefix = this.context ? `[${this.context}]` : '';
      console.error(`❌ ${prefix}`, ...args);
    }
  }

  /**
   * Create a child logger with additional context
   * @param {string} childContext - Additional context to append
   * @returns {Logger} New logger instance with combined context
   */
  child(childContext) {
    const newContext = this.context
      ? `${this.context}:${childContext}`
      : childContext;
    return new Logger(newContext);
  }

  /**
   * Group multiple log statements
   * @param {string} label - Group label
   * @param {() => void} callback - Function containing grouped logs
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
   * @template T
   * @param {string} label - Timer label
   * @param {() => T} callback - Function to time
   * @returns {T} Result of callback
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
   * @template T
   * @param {string} label - Timer label
   * @param {() => Promise<T>} callback - Async function to time
   * @returns {Promise<T>} Result of callback
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

/**
 * Export helper to create contextual loggers
 * @param {string} context - Logger context/namespace
 * @returns {Logger} New logger instance
 */
export function createLogger(context) {
  return new Logger(context);
}
