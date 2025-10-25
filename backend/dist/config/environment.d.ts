/**
 * Validate required configuration
 * Throws error if configuration is invalid
 */
export function validateConfig(): void;
/**
 * Print configuration (safe - no secrets)
 */
export function printConfig(): void;
/**
 * Initialize and validate configuration
 * Call this explicitly in server.js startup
 */
export function initConfig(): void;
export namespace env {
    let NODE_ENV: string;
    let IS_PRODUCTION: boolean;
    let IS_DEVELOPMENT: boolean;
    let IS_TEST: boolean;
    let PORT: number;
    let HOST: string;
    let CORS_ORIGIN: string;
    let DISABLE_AUTH: boolean;
    let JWT_SECRET: string;
    let JWT_EXPIRES_IN: string;
    let LOG_LEVEL: string;
    let STRUCTURED_LOGGING: boolean;
    let SHOW_ERROR_DETAILS: boolean;
    let DB_DIR: string;
    let SNAPSHOT_TTL_DAYS: number;
    let JSON_PAYLOAD_LIMIT: string;
    let MAX_CACHE_SIZE: number;
    let HEALTH_CACHE_TTL: number;
    let RATE_LIMIT_WINDOW_MS: number;
    let RATE_LIMIT_MAX_REQUESTS: number;
    let TELEMETRY_RATE_LIMIT: number;
    let ENABLE_METRICS: boolean;
    let ENABLE_TRIGGERS: boolean;
    let ENABLE_GIT_MONITOR: boolean;
    let ENABLE_DEBUG_ROUTES: boolean;
    let ENABLE_TRACING: boolean;
    let METRICS_PORT: number;
    let ACTIVE_PROJECT: string;
}
//# sourceMappingURL=environment.d.ts.map