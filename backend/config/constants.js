/**
 * Centralized Application Constants
 * Single source of truth for all configuration values
 */

export const LIMITS = {
  // API Rate Limiting
  RATE_LIMIT: {
    WINDOW_MS: 15 * 60 * 1000, // 15 minutes
    GENERAL_MAX_REQUESTS: 100,
    STRICT_MAX_REQUESTS: 10,
    TELEMETRY_MAX_REQUESTS: 1000,
    WRITE_MAX_REQUESTS: 50,
    AUTH_MAX_ATTEMPTS: 5,
  },

  // Data Pagination
  PAGINATION: {
    MAX_EVENTS_HISTORY: 1000,
    MAX_CONVERSATIONS: 500,
    DEFAULT_PAGE_SIZE: 100,
    MAX_PAGE_SIZE: 1000,
    DEFAULT_LIMIT: 100,
    MAX_LIMIT: 5000,
  },

  // Project Configuration
  PROJECTS: {
    MAX_PROJECTS: 50,
    MAX_NAME_LENGTH: 100,
    MIN_RETENTION_DAYS: 1,
    MAX_RETENTION_DAYS: 365,
    MAX_FILE_SIZE: 100 * 1024 * 1024, // 100MB in bytes
    MIN_FILE_SIZE: 0,
  },

  // Database
  DATABASE: {
    STATEMENT_CACHE_SIZE: 100,
    WAL_CHECKPOINT_PAGES: 1000,
    MAX_QUERY_RESULTS: 5000,
    DEFAULT_TRACKED_FILES_LIMIT: 100,
  },

  // File Processing
  FILE: {
    MAX_SIZE_BYTES: 10 * 1024 * 1024, // 10MB
    WATCH_DEBOUNCE_MS: 50,
  },

  // Timeouts and Delays
  TIMEOUTS: {
    HEALTH_CHECK_DISCOVERY_MS: 2 * 1000, // 2 seconds
    TELEMETRY_BRIDGE_RETRY_MS: 2 * 1000, // 2 seconds
    STABILIZATION_DELAY_MS: 3 * 1000, // 3 seconds
    REQUEST_TIMEOUT_MS: 30 * 1000, // 30 seconds
    AGENT_CLEANUP_INTERVAL_MS: 60 * 60 * 1000, // 1 hour
    SNAPSHOT_CLEANUP_INTERVAL_MS: 24 * 60 * 60 * 1000, // 24 hours
    PERFORMANCE_MONITOR_INTERVAL_MS: 30 * 1000, // 30 seconds
    PERFORMANCE_ALERT_COOLDOWN_MS: 5 * 60 * 1000, // 5 minutes
    STARTUP_GRACE_PERIOD_MS: 90 * 1000, // 90 seconds
  },

  // Cache
  CACHE: {
    DEFAULT_SIZE: 1000,
    TTL_MS: 5 * 60 * 1000, // 5 minutes
    LOCK_TTL_MS: 5 * 60 * 1000, // 5 minutes for locks
  },

  // Cleanup
  CLEANUP: {
    OLD_AGENTS_HOURS: 24, // Remove agents not seen in 24 hours
    OLD_SNAPSHOTS_DAYS: 7, // Remove snapshots older than 7 days
  },
};

export const DEFAULTS = {
  // Server
  PORT: 3030,
  CORS_ORIGIN: 'http://localhost:5173',

  // Logging
  LOG_LEVEL: 'info',

  // JSON Payload
  JSON_PAYLOAD_LIMIT: '10mb',

  // Database
  DB_DIRECTORY: './.raven/databases',
};

export const VALIDATION = {
  // Database name validation
  DB_NAME_PATTERN: /^[a-zA-Z0-9_-]+$/,

  // Table name validation
  TABLE_NAME_PATTERN: /^[a-zA-Z_][a-zA-Z0-9_]*$/,

  // Period validation
  ALLOWED_PERIODS: ['hourly', 'daily', 'weekly'],

  // Allowed tables for storage operations
  ALLOWED_TABLES: [
    'events',
    'agent_events',
    'raven_metrics',
    'process_metrics',
    'error_logs',
    'notifications',
    'conversations',
    'sessions',
    'syntax_errors',
    'pattern_warnings',
    'test_results'
  ],
};

export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNPROCESSABLE_ENTITY: 422,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_SERVER_ERROR: 500,
  SERVICE_UNAVAILABLE: 503,
};

export const ERROR_CODES = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  NOT_FOUND: 'NOT_FOUND',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
};
