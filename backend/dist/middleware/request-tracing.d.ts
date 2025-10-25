/**
 * Request tracing middleware
 * Adds correlation ID and logging to all requests
 */
export function requestTracing(req: any, res: any, next: any): void;
/**
 * Error logging middleware
 * Logs errors with correlation ID
 */
export function errorLogging(err: any, req: any, res: any, next: any): void;
//# sourceMappingURL=request-tracing.d.ts.map