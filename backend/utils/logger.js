/**
 * Winston-based structured logging
 * Supports: debug, info, warn, error
 * Logs to console and file with proper formatting
 */

import winston from 'winston';

const LOG_LEVEL = process.env.LOG_LEVEL || 'info';
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

// Create winston logger instance
const winstonLogger = winston.createLogger({
  level: LOG_LEVEL,
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.splat(),
    winston.format.json()
  ),
  defaultMeta: { service: 'raven-backend' },
  transports: [
    // Console transport with colorized output for development
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.printf(({ level, message, timestamp, ...meta }) => {
          let msg = `${timestamp} [${level}]: ${message}`;

          // Add metadata if present
          const metaStr = Object.keys(meta).length > 0 ? JSON.stringify(meta, null, 2) : '';
          if (metaStr && !IS_PRODUCTION) {
            msg += `\n${metaStr}`;
          }

          return msg;
        })
      )
    })
  ]
});

// Add file transport in production
if (IS_PRODUCTION) {
  winstonLogger.add(
    new winston.transports.File({
      filename: 'logs/error.log',
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5
    })
  );

  winstonLogger.add(
    new winston.transports.File({
      filename: 'logs/combined.log',
      maxsize: 5242880, // 5MB
      maxFiles: 10
    })
  );
}

// Export convenience methods that match previous API
export const logger = {
  debug: (msg, meta = {}) => {
    winstonLogger.debug(msg, meta);
  },
  info: (msg, meta = {}) => {
    winstonLogger.info(msg, meta);
  },
  warn: (msg, meta = {}) => {
    winstonLogger.warn(msg, meta);
  },
  error: (msg, meta = {}) => {
    winstonLogger.error(msg, meta);
  },
  // Pass through winston instance for advanced usage
  winston: winstonLogger
};
