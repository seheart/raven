/**
 * Structured Logger with Correlation IDs
 * Provides consistent logging format for production observability
 */
import { env } from '../config/environment.js';
import { createLogger, format, transports } from 'winston';
import { nanoid } from 'nanoid';
import fs from 'fs';
const { combine, timestamp, json, printf, colorize, errors } = format;
/**
 * Create correlation ID for request tracking
 */
export function generateCorrelationId() {
    return nanoid(16);
}
/**
 * Custom format for development (human-readable)
 */
const devFormat = printf(({ level, message, timestamp, correlationId, ...metadata }) => {
    const metaStr = Object.keys(metadata).length ? JSON.stringify(metadata, null, 2) : '';
    const corrId = correlationId ? `[${correlationId}]` : '';
    return `${timestamp} ${level} ${corrId}: ${message} ${metaStr}`;
});
/**
 * Create Winston logger instance
 */
const winstonLogger = createLogger({
    level: env.LOG_LEVEL,
    format: combine(errors({ stack: true }), timestamp({ format: 'YYYY-MM-DD HH:mm:ss' })),
    defaultMeta: {
        service: 'raven-backend',
        environment: env.NODE_ENV
    },
    transports: [
        new transports.Console({
            format: env.STRUCTURED_LOGGING
                ? combine(json())
                : combine(colorize(), devFormat)
        })
    ]
});
// Add file transport in production
if (env.IS_PRODUCTION) {
    // Ensure log directory exists
    const logDir = './logs';
    if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
    }
    winstonLogger.add(new transports.File({
        filename: './logs/error.log',
        level: 'error',
        format: json()
    }));
    winstonLogger.add(new transports.File({
        filename: './logs/combined.log',
        format: json()
    }));
}
/**
 * Sanitize query parameters to prevent logging sensitive data
 * Recursively handles nested objects and arrays
 * @param {*} query - Query parameters (object, array, or primitive)
 * @returns {*} Sanitized query parameters
 */
function sanitizeQuery(query) {
    // Handle null/undefined
    if (!query)
        return {};
    // Handle non-object primitives (shouldn't happen in query params, but defensive)
    if (typeof query !== 'object')
        return { _invalid: '[REDACTED]' };
    const sensitive = ['password', 'token', 'secret', 'api_key', 'apikey', 'auth', 'authorization', 'jwt', 'session', 'cookie'];
    // Handle arrays
    if (Array.isArray(query)) {
        return query.map(item => sanitizeQuery(item));
    }
    // Handle objects
    const sanitized = {};
    for (const [key, value] of Object.entries(query)) {
        const keyLower = key.toLowerCase();
        // Check if key contains sensitive words
        if (sensitive.some(s => keyLower.includes(s))) {
            sanitized[key] = '[REDACTED]';
        }
        else if (typeof value === 'object' && value !== null) {
            // Recursively sanitize nested objects/arrays
            sanitized[key] = sanitizeQuery(value);
        }
        else {
            sanitized[key] = value;
        }
    }
    return sanitized;
}
/**
 * Structured logger wrapper
 */
export class StructuredLogger {
    constructor(context = {}) {
        this.context = context;
    }
    /**
     * Create child logger with additional context
     */
    child(additionalContext) {
        return new StructuredLogger({
            ...this.context,
            ...additionalContext
        });
    }
    /**
     * Log debug message
     */
    debug(message, metadata = {}) {
        winstonLogger.debug(message, {
            ...this.context,
            ...metadata
        });
    }
    /**
     * Log info message
     */
    info(message, metadata = {}) {
        winstonLogger.info(message, {
            ...this.context,
            ...metadata
        });
    }
    /**
     * Log warning message
     */
    warn(message, metadata = {}) {
        winstonLogger.warn(message, {
            ...this.context,
            ...metadata
        });
    }
    /**
     * Log error message
     */
    error(message, error = null, metadata = {}) {
        const errorData = error ? {
            error: {
                message: error.message,
                stack: error.stack,
                code: error.code
            }
        } : {};
        winstonLogger.error(message, {
            ...this.context,
            ...errorData,
            ...metadata
        });
    }
    /**
     * Log HTTP request
     */
    logRequest(req, metadata = {}) {
        this.info('HTTP Request', {
            method: req.method,
            path: req.path,
            query: sanitizeQuery(req.query),
            ip: req.ip,
            userAgent: req.get('user-agent'),
            ...metadata
        });
    }
    /**
     * Log HTTP response
     */
    logResponse(req, res, duration, metadata = {}) {
        const level = res.statusCode >= 400 ? 'warn' : 'info';
        winstonLogger[level]('HTTP Response', {
            ...this.context,
            method: req.method,
            path: req.path,
            statusCode: res.statusCode,
            durationMs: duration,
            ...metadata
        });
    }
    /**
     * Log database query (only in debug mode)
     */
    logQuery(query, durationMs, metadata = {}) {
        // Only log query metadata in production, not full query
        if (env.IS_PRODUCTION) {
            this.debug('Database Query', {
                queryType: query.split(' ')[0], // Just the SQL verb (SELECT, INSERT, etc.)
                durationMs,
                ...metadata
            });
        }
        else {
            this.debug('Database Query', {
                query,
                durationMs,
                ...metadata
            });
        }
    }
    /**
     * Log performance metric
     */
    logMetric(metricName, value, unit = 'ms', metadata = {}) {
        this.info('Performance Metric', {
            metric: metricName,
            value,
            unit,
            ...metadata
        });
    }
}
/**
 * Create default logger instance
 */
export const logger = new StructuredLogger();
/**
 * Create logger with correlation ID
 */
export function createRequestLogger(correlationId) {
    return new StructuredLogger({ correlationId });
}
//# sourceMappingURL=structured-logger.js.map