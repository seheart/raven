/**
 * Logging utility with configurable log levels
 * Supports: debug, info, warn, error
 */
const LOG_LEVEL = process.env.LOG_LEVEL || 'info';
const LOG_LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };
export const logger = {
    debug: (msg, ...args) => {
        if (LOG_LEVELS[LOG_LEVEL] <= LOG_LEVELS.debug) {
            console.log(`[DEBUG] ${msg}`, ...args);
        }
    },
    info: (msg, ...args) => {
        if (LOG_LEVELS[LOG_LEVEL] <= LOG_LEVELS.info) {
            console.log(msg, ...args);
        }
    },
    warn: (msg, ...args) => {
        if (LOG_LEVELS[LOG_LEVEL] <= LOG_LEVELS.warn) {
            console.warn(msg, ...args);
        }
    },
    error: (msg, ...args) => {
        if (LOG_LEVELS[LOG_LEVEL] <= LOG_LEVELS.error) {
            console.error(msg, ...args);
        }
    }
};
//# sourceMappingURL=logger.js.map