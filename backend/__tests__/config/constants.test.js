/**
 * Tests for Application Constants
 */

import { LIMITS, DEFAULTS, VALIDATION, HTTP_STATUS, ERROR_CODES } from '../../config/constants.js';

describe('Constants Configuration', () => {
  describe('LIMITS', () => {
    test('should have rate limit configuration', () => {
      expect(LIMITS.RATE_LIMIT).toBeDefined();
      expect(LIMITS.RATE_LIMIT.WINDOW_MS).toBe(15 * 60 * 1000);
      expect(LIMITS.RATE_LIMIT.GENERAL_MAX_REQUESTS).toBe(100);
      expect(LIMITS.RATE_LIMIT.STRICT_MAX_REQUESTS).toBe(10);
      expect(LIMITS.RATE_LIMIT.TELEMETRY_MAX_REQUESTS).toBe(1000);
      expect(LIMITS.RATE_LIMIT.WRITE_MAX_REQUESTS).toBe(50);
      expect(LIMITS.RATE_LIMIT.AUTH_MAX_ATTEMPTS).toBe(5);
    });

    test('should have pagination configuration', () => {
      expect(LIMITS.PAGINATION).toBeDefined();
      expect(LIMITS.PAGINATION.MAX_EVENTS_HISTORY).toBe(1000);
      expect(LIMITS.PAGINATION.MAX_CONVERSATIONS).toBe(500);
      expect(LIMITS.PAGINATION.DEFAULT_PAGE_SIZE).toBe(100);
      expect(LIMITS.PAGINATION.MAX_PAGE_SIZE).toBe(1000);
      expect(LIMITS.PAGINATION.DEFAULT_LIMIT).toBe(100);
      expect(LIMITS.PAGINATION.MAX_LIMIT).toBe(5000);
    });

    test('should have project configuration', () => {
      expect(LIMITS.PROJECTS).toBeDefined();
      expect(LIMITS.PROJECTS.MAX_PROJECTS).toBe(50);
      expect(LIMITS.PROJECTS.MAX_NAME_LENGTH).toBe(100);
      expect(LIMITS.PROJECTS.MIN_RETENTION_DAYS).toBe(1);
      expect(LIMITS.PROJECTS.MAX_RETENTION_DAYS).toBe(365);
      expect(LIMITS.PROJECTS.MAX_FILE_SIZE).toBe(100 * 1024 * 1024);
      expect(LIMITS.PROJECTS.MIN_FILE_SIZE).toBe(0);
    });

    test('should have database configuration', () => {
      expect(LIMITS.DATABASE).toBeDefined();
      expect(LIMITS.DATABASE.STATEMENT_CACHE_SIZE).toBe(100);
      expect(LIMITS.DATABASE.WAL_CHECKPOINT_PAGES).toBe(1000);
      expect(LIMITS.DATABASE.MAX_QUERY_RESULTS).toBe(5000);
      expect(LIMITS.DATABASE.DEFAULT_TRACKED_FILES_LIMIT).toBe(100);
    });

    test('should have file processing configuration', () => {
      expect(LIMITS.FILE).toBeDefined();
      expect(LIMITS.FILE.MAX_SIZE_BYTES).toBe(10 * 1024 * 1024);
      expect(LIMITS.FILE.WATCH_DEBOUNCE_MS).toBe(50);
    });

    test('should have timeouts configuration', () => {
      expect(LIMITS.TIMEOUTS).toBeDefined();
      expect(LIMITS.TIMEOUTS.HEALTH_CHECK_DISCOVERY_MS).toBe(2 * 1000);
      expect(LIMITS.TIMEOUTS.TELEMETRY_BRIDGE_RETRY_MS).toBe(2 * 1000);
      expect(LIMITS.TIMEOUTS.STABILIZATION_DELAY_MS).toBe(3 * 1000);
      expect(LIMITS.TIMEOUTS.REQUEST_TIMEOUT_MS).toBe(30 * 1000);
      expect(LIMITS.TIMEOUTS.AGENT_CLEANUP_INTERVAL_MS).toBe(60 * 60 * 1000);
      expect(LIMITS.TIMEOUTS.SNAPSHOT_CLEANUP_INTERVAL_MS).toBe(24 * 60 * 60 * 1000);
      expect(LIMITS.TIMEOUTS.PERFORMANCE_MONITOR_INTERVAL_MS).toBe(30 * 1000);
      expect(LIMITS.TIMEOUTS.PERFORMANCE_ALERT_COOLDOWN_MS).toBe(5 * 60 * 1000);
      expect(LIMITS.TIMEOUTS.STARTUP_GRACE_PERIOD_MS).toBe(90 * 1000);
    });

    test('should have cache configuration', () => {
      expect(LIMITS.CACHE).toBeDefined();
      expect(LIMITS.CACHE.DEFAULT_SIZE).toBe(1000);
      expect(LIMITS.CACHE.TTL_MS).toBe(5 * 60 * 1000);
      expect(LIMITS.CACHE.LOCK_TTL_MS).toBe(5 * 60 * 1000);
    });

    test('should have cleanup configuration', () => {
      expect(LIMITS.CLEANUP).toBeDefined();
      expect(LIMITS.CLEANUP.OLD_AGENTS_HOURS).toBe(24);
      expect(LIMITS.CLEANUP.OLD_SNAPSHOTS_DAYS).toBe(7);
    });

    test('should have agent registry configuration', () => {
      expect(LIMITS.AGENT_REGISTRY).toBeDefined();
      expect(LIMITS.AGENT_REGISTRY.MAX_AGENTS).toBe(10000);
    });

    test('should have telemetry configuration', () => {
      expect(LIMITS.TELEMETRY).toBeDefined();
      expect(LIMITS.TELEMETRY.MAX_BUFFER_SIZE).toBe(1000);
      expect(LIMITS.TELEMETRY.AGENT_NAME_MAX_LENGTH).toBe(100);
      expect(LIMITS.TELEMETRY.EVENT_NAME_MAX_LENGTH).toBe(100);
      expect(LIMITS.TELEMETRY.MESSAGE_MAX_LENGTH).toBe(1000);
      expect(LIMITS.TELEMETRY.LINES_CHANGED_MAX).toBe(1000000);
      expect(LIMITS.TELEMETRY.DURATION_MAX_MS).toBe(3600000);
    });

    test('should have file watcher configuration', () => {
      expect(LIMITS.FILE_WATCHER).toBeDefined();
      expect(LIMITS.FILE_WATCHER.MAX_DISPLAYED_CHANGES).toBe(50);
      expect(LIMITS.FILE_WATCHER.RESTART_DELAY_MS).toBe(1000);
      expect(LIMITS.FILE_WATCHER.HEALTH_CHECK_INTERVAL_MS).toBe(120000);
    });

    test('should have monitoring configuration', () => {
      expect(LIMITS.MONITORING).toBeDefined();
      expect(LIMITS.MONITORING.ERROR_RATE_THRESHOLD).toBe(10);
      expect(LIMITS.MONITORING.MEMORY_PERCENT_THRESHOLD).toBe(85);
      expect(LIMITS.MONITORING.CPU_PERCENT_THRESHOLD).toBe(80);
      expect(LIMITS.MONITORING.WATCHER_FAILURES_THRESHOLD).toBe(3);
      expect(LIMITS.MONITORING.ERROR_RETENTION_MS).toBe(3600000);
      expect(LIMITS.MONITORING.WARNING_RETENTION_MS).toBe(3600000);
      expect(LIMITS.MONITORING.CHECK_INTERVAL_MS).toBe(60000);
      expect(LIMITS.MONITORING.RESOURCE_CHECK_INTERVAL_MS).toBe(30000);
      expect(LIMITS.MONITORING.WATCHER_CHECK_INTERVAL_MS).toBe(120000);
    });

    test('should have websocket configuration', () => {
      expect(LIMITS.WEBSOCKET).toBeDefined();
      expect(LIMITS.WEBSOCKET.RECONNECTION_DELAY_MS).toBe(1000);
      expect(LIMITS.WEBSOCKET.RECONNECTION_DELAY_MAX_MS).toBe(30000);
      expect(LIMITS.WEBSOCKET.RECONNECTION_ATTEMPTS).toBe(20);
      expect(LIMITS.WEBSOCKET.CONNECTION_TIMEOUT_MS).toBe(20000);
      expect(LIMITS.WEBSOCKET.MAX_RECONNECT_CALLBACKS).toBe(50);
    });
  });

  describe('DEFAULTS', () => {
    test('should have server defaults', () => {
      expect(DEFAULTS.PORT).toBe(9100);
      expect(DEFAULTS.CORS_ORIGIN).toBe('http://localhost:9000');
    });

    test('should have logging defaults', () => {
      expect(DEFAULTS.LOG_LEVEL).toBe('info');
    });

    test('should have payload defaults', () => {
      expect(DEFAULTS.JSON_PAYLOAD_LIMIT).toBe('10mb');
    });

    test('should have database defaults', () => {
      expect(DEFAULTS.DB_DIRECTORY).toBe('./.raven/databases');
    });
  });

  describe('VALIDATION', () => {
    test('should have database name pattern', () => {
      expect(VALIDATION.DB_NAME_PATTERN).toBeInstanceOf(RegExp);
      expect(VALIDATION.DB_NAME_PATTERN.test('test-db_123')).toBe(true);
      expect(VALIDATION.DB_NAME_PATTERN.test('invalid name')).toBe(false);
      expect(VALIDATION.DB_NAME_PATTERN.test('db@special')).toBe(false);
    });

    test('should have table name pattern', () => {
      expect(VALIDATION.TABLE_NAME_PATTERN).toBeInstanceOf(RegExp);
      expect(VALIDATION.TABLE_NAME_PATTERN.test('events')).toBe(true);
      expect(VALIDATION.TABLE_NAME_PATTERN.test('_private_table')).toBe(true);
      expect(VALIDATION.TABLE_NAME_PATTERN.test('table_123')).toBe(true);
      expect(VALIDATION.TABLE_NAME_PATTERN.test('123table')).toBe(false);
      expect(VALIDATION.TABLE_NAME_PATTERN.test('table-name')).toBe(false);
    });

    test('should have allowed periods', () => {
      expect(VALIDATION.ALLOWED_PERIODS).toEqual(['hourly', 'daily', 'weekly']);
      expect(VALIDATION.ALLOWED_PERIODS).toContain('hourly');
      expect(VALIDATION.ALLOWED_PERIODS).toContain('daily');
      expect(VALIDATION.ALLOWED_PERIODS).toContain('weekly');
      expect(VALIDATION.ALLOWED_PERIODS).not.toContain('monthly');
    });

    test('should have allowed tables list', () => {
      expect(VALIDATION.ALLOWED_TABLES).toBeInstanceOf(Array);
      expect(VALIDATION.ALLOWED_TABLES.length).toBeGreaterThan(0);
      expect(VALIDATION.ALLOWED_TABLES).toContain('events');
      expect(VALIDATION.ALLOWED_TABLES).toContain('agent_events');
      expect(VALIDATION.ALLOWED_TABLES).toContain('raven_metrics');
      expect(VALIDATION.ALLOWED_TABLES).toContain('process_metrics');
      expect(VALIDATION.ALLOWED_TABLES).toContain('error_logs');
      expect(VALIDATION.ALLOWED_TABLES).toContain('notifications');
      expect(VALIDATION.ALLOWED_TABLES).toContain('conversations');
      expect(VALIDATION.ALLOWED_TABLES).toContain('sessions');
      expect(VALIDATION.ALLOWED_TABLES).toContain('syntax_errors');
      expect(VALIDATION.ALLOWED_TABLES).toContain('pattern_warnings');
      expect(VALIDATION.ALLOWED_TABLES).toContain('test_results');
    });
  });

  describe('HTTP_STATUS', () => {
    test('should have success status codes', () => {
      expect(HTTP_STATUS.OK).toBe(200);
      expect(HTTP_STATUS.CREATED).toBe(201);
      expect(HTTP_STATUS.NO_CONTENT).toBe(204);
    });

    test('should have client error status codes', () => {
      expect(HTTP_STATUS.BAD_REQUEST).toBe(400);
      expect(HTTP_STATUS.UNAUTHORIZED).toBe(401);
      expect(HTTP_STATUS.FORBIDDEN).toBe(403);
      expect(HTTP_STATUS.NOT_FOUND).toBe(404);
      expect(HTTP_STATUS.CONFLICT).toBe(409);
      expect(HTTP_STATUS.UNPROCESSABLE_ENTITY).toBe(422);
      expect(HTTP_STATUS.TOO_MANY_REQUESTS).toBe(429);
    });

    test('should have server error status codes', () => {
      expect(HTTP_STATUS.INTERNAL_SERVER_ERROR).toBe(500);
      expect(HTTP_STATUS.SERVICE_UNAVAILABLE).toBe(503);
    });
  });

  describe('ERROR_CODES', () => {
    test('should have error code constants', () => {
      expect(ERROR_CODES.VALIDATION_ERROR).toBe('VALIDATION_ERROR');
      expect(ERROR_CODES.NOT_FOUND).toBe('NOT_FOUND');
      expect(ERROR_CODES.UNAUTHORIZED).toBe('UNAUTHORIZED');
      expect(ERROR_CODES.FORBIDDEN).toBe('FORBIDDEN');
      expect(ERROR_CODES.RATE_LIMIT_EXCEEDED).toBe('RATE_LIMIT_EXCEEDED');
      expect(ERROR_CODES.INTERNAL_ERROR).toBe('INTERNAL_ERROR');
    });

    test('all error codes should be uppercase strings', () => {
      Object.values(ERROR_CODES).forEach(code => {
        expect(typeof code).toBe('string');
        expect(code).toBe(code.toUpperCase());
      });
    });
  });

  describe('Constants Integrity', () => {
    test('all limit values should be positive numbers', () => {
      const checkPositive = obj => {
        Object.entries(obj).forEach(([key, value]) => {
          if (typeof value === 'object' && value !== null) {
            checkPositive(value);
          } else if (typeof value === 'number') {
            // Allow 0 for MIN values, otherwise must be positive
            if (key.includes('MIN')) {
              expect(value).toBeGreaterThanOrEqual(0);
            } else {
              expect(value).toBeGreaterThan(0);
            }
          }
        });
      };

      checkPositive(LIMITS);
    });

    test('timeout values should be in milliseconds', () => {
      expect(LIMITS.TIMEOUTS.HEALTH_CHECK_DISCOVERY_MS).toBeGreaterThan(1000);
      expect(LIMITS.TIMEOUTS.REQUEST_TIMEOUT_MS).toBeGreaterThanOrEqual(1000);
    });

    test('rate limit window should be reasonable', () => {
      expect(LIMITS.RATE_LIMIT.WINDOW_MS).toBeGreaterThanOrEqual(60000); // At least 1 minute
      expect(LIMITS.RATE_LIMIT.WINDOW_MS).toBeLessThanOrEqual(3600000); // At most 1 hour
    });

    test('cache TTL should be reasonable', () => {
      expect(LIMITS.CACHE.TTL_MS).toBeGreaterThan(0);
      expect(LIMITS.CACHE.TTL_MS).toBeLessThanOrEqual(3600000); // Max 1 hour
    });
  });
});
