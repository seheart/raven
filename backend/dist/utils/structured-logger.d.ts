/**
 * Create correlation ID for request tracking
 */
export function generateCorrelationId(): string;
/**
 * Create logger with correlation ID
 */
export function createRequestLogger(correlationId: any): StructuredLogger;
/**
 * Structured logger wrapper
 */
export class StructuredLogger {
    constructor(context?: {});
    context: {};
    /**
     * Create child logger with additional context
     */
    child(additionalContext: any): StructuredLogger;
    /**
     * Log debug message
     */
    debug(message: any, metadata?: {}): void;
    /**
     * Log info message
     */
    info(message: any, metadata?: {}): void;
    /**
     * Log warning message
     */
    warn(message: any, metadata?: {}): void;
    /**
     * Log error message
     */
    error(message: any, error?: null, metadata?: {}): void;
    /**
     * Log HTTP request
     */
    logRequest(req: any, metadata?: {}): void;
    /**
     * Log HTTP response
     */
    logResponse(req: any, res: any, duration: any, metadata?: {}): void;
    /**
     * Log database query (only in debug mode)
     */
    logQuery(query: any, durationMs: any, metadata?: {}): void;
    /**
     * Log performance metric
     */
    logMetric(metricName: any, value: any, unit?: string, metadata?: {}): void;
}
/**
 * Create default logger instance
 */
export const logger: StructuredLogger;
//# sourceMappingURL=structured-logger.d.ts.map