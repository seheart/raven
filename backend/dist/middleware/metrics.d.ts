/**
 * HTTP metrics middleware
 */
export function metricsMiddleware(req: any, res: any, next: any): any;
/**
 * Record telemetry event metric
 */
export function recordTelemetryEvent(agent: any, durationMs: any): void;
/**
 * Record database query metric
 */
export function recordDbQuery(durationMs: any): void;
/**
 * Record cache hit/miss
 */
export function recordCacheHit(hit: any): void;
/**
 * Record error
 */
export function recordError(errorType: any): void;
/**
 * Get all metrics in Prometheus format
 */
export function getMetricsPrometheus(): string;
/**
 * Get metrics as JSON (for internal dashboard)
 */
export function getMetricsJson(): {
    system: {
        uptime: string;
        startTime: string;
    };
    http: {
        requestsTotal: number;
        requestsInFlight: number;
        avgDuration: string;
        p50Duration: string;
        p90Duration: string;
        p99Duration: string;
        byRoute: any;
    };
    telemetry: {
        eventsTotal: number;
        avgProcessingTime: string;
        byAgent: any;
    };
    database: {
        queriesTotal: number;
        avgQueryTime: string;
    };
    cache: {
        hits: number;
        misses: number;
        hitRate: string;
    };
    errors: any;
};
/**
 * Reset metrics (for testing)
 */
export function resetMetrics(): void;
//# sourceMappingURL=metrics.d.ts.map