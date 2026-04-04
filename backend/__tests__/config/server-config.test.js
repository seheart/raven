/**
 * Tests for Server Configuration
 */

import { jest } from '@jest/globals';

describe('ServerConfig', () => {
  let serverConfig, validateConfig, getConfig;
  let originalEnv;

  beforeEach(async () => {
    // Save original environment
    originalEnv = { ...process.env };

    // Clear module cache to allow fresh imports with different env vars
    jest.resetModules();
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
  });

  describe('serverConfig object', () => {
    test('should have default port 9100', async () => {
      delete process.env.PORT;
      const module = await import('../../config/server-config.js');
      expect(module.serverConfig.port).toBe(9100);
    });

    test('should use PORT from environment', async () => {
      process.env.PORT = '8080';
      const module = await import('../../config/server-config.js');
      expect(module.serverConfig.port).toBe(8080);
    });

    test('should have default host localhost', async () => {
      delete process.env.HOST;
      const module = await import('../../config/server-config.js');
      expect(module.serverConfig.host).toBe('localhost');
    });

    test('should use HOST from environment', async () => {
      process.env.HOST = '0.0.0.0';
      const module = await import('../../config/server-config.js');
      expect(module.serverConfig.host).toBe('0.0.0.0');
    });

    test('should have default nodeEnv development', async () => {
      delete process.env.NODE_ENV;
      const module = await import('../../config/server-config.js');
      expect(module.serverConfig.nodeEnv).toBe('development');
    });

    test('should use NODE_ENV from environment', async () => {
      process.env.NODE_ENV = 'production';
      const module = await import('../../config/server-config.js');
      expect(module.serverConfig.nodeEnv).toBe('production');
    });
  });

  describe('CORS configuration', () => {
    test('should have default CORS origin', async () => {
      delete process.env.CORS_ORIGIN;
      const module = await import('../../config/server-config.js');
      expect(module.serverConfig.cors.origin).toBe('http://localhost:9000');
    });

    test('should use CORS_ORIGIN from environment', async () => {
      process.env.CORS_ORIGIN = 'https://example.com';
      const module = await import('../../config/server-config.js');
      expect(module.serverConfig.cors.origin).toBe('https://example.com');
    });

    test('should have credentials enabled', async () => {
      const module = await import('../../config/server-config.js');
      expect(module.serverConfig.cors.credentials).toBe(true);
    });

    test('should have expected HTTP methods', async () => {
      const module = await import('../../config/server-config.js');
      expect(module.serverConfig.cors.methods).toEqual(['GET', 'POST', 'PUT', 'DELETE', 'PATCH']);
    });

    test('should have expected allowed headers', async () => {
      const module = await import('../../config/server-config.js');
      expect(module.serverConfig.cors.allowedHeaders).toEqual(['Content-Type', 'Authorization']);
    });
  });

  describe('Rate limit configuration', () => {
    test('should have production rate limits when NODE_ENV=production', async () => {
      process.env.NODE_ENV = 'production';
      const module = await import('../../config/server-config.js');

      expect(module.serverConfig.rateLimit.general.windowMs).toBe(15 * 60 * 1000);
      expect(module.serverConfig.rateLimit.general.max).toBe(100);
    });

    test('should have development rate limits when NODE_ENV!=production', async () => {
      process.env.NODE_ENV = 'development';
      const module = await import('../../config/server-config.js');

      expect(module.serverConfig.rateLimit.general.windowMs).toBe(60 * 1000);
      expect(module.serverConfig.rateLimit.general.max).toBe(1000);
    });

    test('should have auth rate limit configured', async () => {
      const module = await import('../../config/server-config.js');

      expect(module.serverConfig.rateLimit.auth.windowMs).toBe(15 * 60 * 1000);
      expect(module.serverConfig.rateLimit.auth.max).toBe(5);
      expect(module.serverConfig.rateLimit.auth.message).toBeDefined();
    });

    test('should have telemetry rate limit configured', async () => {
      const module = await import('../../config/server-config.js');

      expect(module.serverConfig.rateLimit.telemetry.windowMs).toBe(60 * 1000);
      expect(module.serverConfig.rateLimit.telemetry.max).toBe(1000);
    });

    test('should have write rate limit configured', async () => {
      const module = await import('../../config/server-config.js');

      expect(module.serverConfig.rateLimit.write.windowMs).toBe(15 * 60 * 1000);
      expect(module.serverConfig.rateLimit.write.max).toBe(50);
    });
  });

  describe('WebSocket configuration', () => {
    test('should have default WebSocket ping timeout', async () => {
      delete process.env.WS_PING_TIMEOUT;
      const module = await import('../../config/server-config.js');
      expect(module.serverConfig.websocket.pingTimeout).toBe(60000);
    });

    test('should use WS_PING_TIMEOUT from environment', async () => {
      process.env.WS_PING_TIMEOUT = '30000';
      const module = await import('../../config/server-config.js');
      expect(module.serverConfig.websocket.pingTimeout).toBe(30000);
    });

    test('should have default WebSocket ping interval', async () => {
      delete process.env.WS_PING_INTERVAL;
      const module = await import('../../config/server-config.js');
      expect(module.serverConfig.websocket.pingInterval).toBe(25000);
    });

    test('should use WS_PING_INTERVAL from environment', async () => {
      process.env.WS_PING_INTERVAL = '10000';
      const module = await import('../../config/server-config.js');
      expect(module.serverConfig.websocket.pingInterval).toBe(10000);
    });

    test('should have WebSocket transports configured', async () => {
      const module = await import('../../config/server-config.js');
      expect(module.serverConfig.websocket.transports).toEqual(['websocket', 'polling']);
    });
  });

  describe('Database configuration', () => {
    test('should have default database paths', async () => {
      delete process.env.DB_PATH;
      delete process.env.DEVELOPER_DB_PATH;
      delete process.env.AUTH_DB_PATH;
      delete process.env.SNAPSHOTS_DIR;

      const module = await import('../../config/server-config.js');

      expect(module.serverConfig.database.path).toBe('.raven/raven.db');
      expect(module.serverConfig.database.developerDbPath).toBe('.raven/db/developer.db');
      expect(module.serverConfig.database.authDbPath).toBe('.raven/db/auth.db');
      expect(module.serverConfig.database.snapshotsDir).toBe('.raven/snapshots');
    });

    test('should use database paths from environment', async () => {
      process.env.DB_PATH = '/custom/raven.db';
      process.env.DEVELOPER_DB_PATH = '/custom/developer.db';
      process.env.AUTH_DB_PATH = '/custom/auth.db';
      process.env.SNAPSHOTS_DIR = '/custom/snapshots';

      const module = await import('../../config/server-config.js');

      expect(module.serverConfig.database.path).toBe('/custom/raven.db');
      expect(module.serverConfig.database.developerDbPath).toBe('/custom/developer.db');
      expect(module.serverConfig.database.authDbPath).toBe('/custom/auth.db');
      expect(module.serverConfig.database.snapshotsDir).toBe('/custom/snapshots');
    });

    test('should have database options configured', async () => {
      const module = await import('../../config/server-config.js');

      expect(module.serverConfig.database.options.timeout).toBe(5000);
    });

    test('should have verbose logging in development', async () => {
      process.env.NODE_ENV = 'development';
      const module = await import('../../config/server-config.js');

      expect(module.serverConfig.database.options.verbose).toBe(console.log);
    });

    test('should not have verbose logging in production', async () => {
      process.env.NODE_ENV = 'production';
      const module = await import('../../config/server-config.js');

      expect(module.serverConfig.database.options.verbose).toBe(null);
    });
  });

  describe('Monitoring configuration', () => {
    test('should have default monitoring intervals', async () => {
      delete process.env.METRICS_INTERVAL;
      delete process.env.LOG_WATCHER_POLL_INTERVAL;
      delete process.env.HEALTH_CHECK_INTERVAL;
      delete process.env.SNAPSHOT_RETENTION_DAYS;

      const module = await import('../../config/server-config.js');

      expect(module.serverConfig.monitoring.metricsInterval).toBe(5000);
      expect(module.serverConfig.monitoring.logWatcherPollInterval).toBe(100);
      expect(module.serverConfig.monitoring.healthCheckInterval).toBe(30000);
      expect(module.serverConfig.monitoring.snapshotRetentionDays).toBe(30);
    });

    test('should use monitoring values from environment', async () => {
      process.env.METRICS_INTERVAL = '10000';
      process.env.LOG_WATCHER_POLL_INTERVAL = '200';
      process.env.HEALTH_CHECK_INTERVAL = '60000';
      process.env.SNAPSHOT_RETENTION_DAYS = '60';

      const module = await import('../../config/server-config.js');

      expect(module.serverConfig.monitoring.metricsInterval).toBe(10000);
      expect(module.serverConfig.monitoring.logWatcherPollInterval).toBe(200);
      expect(module.serverConfig.monitoring.healthCheckInterval).toBe(60000);
      expect(module.serverConfig.monitoring.snapshotRetentionDays).toBe(60);
    });
  });

  describe('Security configuration', () => {
    test('should use JWT_SECRET from environment', async () => {
      process.env.JWT_SECRET = 'test-secret';
      const module = await import('../../config/server-config.js');

      expect(module.serverConfig.security.jwtSecret).toBe('test-secret');
    });

    test('should have default JWT expiry', async () => {
      delete process.env.JWT_EXPIRES_IN;
      const module = await import('../../config/server-config.js');

      expect(module.serverConfig.security.jwtExpiresIn).toBe('7d');
    });

    test('should use JWT_EXPIRES_IN from environment', async () => {
      process.env.JWT_EXPIRES_IN = '1d';
      const module = await import('../../config/server-config.js');

      expect(module.serverConfig.security.jwtExpiresIn).toBe('1d');
    });

    test('should have default bcrypt rounds', async () => {
      delete process.env.BCRYPT_ROUNDS;
      const module = await import('../../config/server-config.js');

      expect(module.serverConfig.security.bcryptRounds).toBe(10);
    });

    test('should use BCRYPT_ROUNDS from environment', async () => {
      process.env.BCRYPT_ROUNDS = '12';
      const module = await import('../../config/server-config.js');

      expect(module.serverConfig.security.bcryptRounds).toBe(12);
    });

    test('should have default max request size', async () => {
      delete process.env.MAX_REQUEST_SIZE;
      const module = await import('../../config/server-config.js');

      expect(module.serverConfig.security.maxRequestSize).toBe('10mb');
    });

    test('should use MAX_REQUEST_SIZE from environment', async () => {
      process.env.MAX_REQUEST_SIZE = '5mb';
      const module = await import('../../config/server-config.js');

      expect(module.serverConfig.security.maxRequestSize).toBe('5mb');
    });

    test('should have DISABLE_AUTH false by default', async () => {
      delete process.env.DISABLE_AUTH;
      const module = await import('../../config/server-config.js');

      expect(module.serverConfig.security.disableAuth).toBe(false);
    });

    test('should set DISABLE_AUTH true when env is true', async () => {
      process.env.DISABLE_AUTH = 'true';
      const module = await import('../../config/server-config.js');

      expect(module.serverConfig.security.disableAuth).toBe(true);
    });

    test('should have ENABLE_TRACING false by default', async () => {
      delete process.env.ENABLE_TRACING;
      const module = await import('../../config/server-config.js');

      expect(module.serverConfig.security.enableTracing).toBe(false);
    });

    test('should set ENABLE_TRACING true when env is true', async () => {
      process.env.ENABLE_TRACING = 'true';
      const module = await import('../../config/server-config.js');

      expect(module.serverConfig.security.enableTracing).toBe(true);
    });
  });

  describe('Logging configuration', () => {
    test('should have debug level in development', async () => {
      process.env.NODE_ENV = 'development';
      delete process.env.LOG_LEVEL;

      const module = await import('../../config/server-config.js');
      expect(module.serverConfig.logging.level).toBe('debug');
    });

    test('should have info level in production', async () => {
      process.env.NODE_ENV = 'production';
      delete process.env.LOG_LEVEL;

      const module = await import('../../config/server-config.js');
      expect(module.serverConfig.logging.level).toBe('info');
    });

    test('should use LOG_LEVEL from environment', async () => {
      process.env.LOG_LEVEL = 'warn';
      const module = await import('../../config/server-config.js');

      expect(module.serverConfig.logging.level).toBe('warn');
    });

    test('should have default log format', async () => {
      delete process.env.LOG_FORMAT;
      const module = await import('../../config/server-config.js');

      expect(module.serverConfig.logging.format).toBe('json');
    });

    test('should use LOG_FORMAT from environment', async () => {
      process.env.LOG_FORMAT = 'simple';
      const module = await import('../../config/server-config.js');

      expect(module.serverConfig.logging.format).toBe('simple');
    });

    test('should have default logging values', async () => {
      delete process.env.LOG_DIR;
      delete process.env.LOG_MAX_FILES;
      delete process.env.LOG_MAX_SIZE;

      const module = await import('../../config/server-config.js');

      expect(module.serverConfig.logging.directory).toBe('logs');
      expect(module.serverConfig.logging.maxFiles).toBe(30);
      expect(module.serverConfig.logging.maxSize).toBe('20m');
    });

    test('should use logging values from environment', async () => {
      process.env.LOG_DIR = '/var/log';
      process.env.LOG_MAX_FILES = '60';
      process.env.LOG_MAX_SIZE = '50m';

      const module = await import('../../config/server-config.js');

      expect(module.serverConfig.logging.directory).toBe('/var/log');
      expect(module.serverConfig.logging.maxFiles).toBe(60);
      expect(module.serverConfig.logging.maxSize).toBe('50m');
    });
  });

  describe('File watching configuration', () => {
    test('should have default file watching values', async () => {
      delete process.env.FILE_WATCH_DEBOUNCE;
      delete process.env.MAX_WATCHED_FILES;

      const module = await import('../../config/server-config.js');

      expect(module.serverConfig.fileWatching.debounceMs).toBe(100);
      expect(module.serverConfig.fileWatching.maxFiles).toBe(10000);
    });

    test('should use file watching values from environment', async () => {
      process.env.FILE_WATCH_DEBOUNCE = '200';
      process.env.MAX_WATCHED_FILES = '5000';

      const module = await import('../../config/server-config.js');

      expect(module.serverConfig.fileWatching.debounceMs).toBe(200);
      expect(module.serverConfig.fileWatching.maxFiles).toBe(5000);
    });

    test('should have ignored paths configured', async () => {
      const module = await import('../../config/server-config.js');

      expect(module.serverConfig.fileWatching.ignored).toContain('**/node_modules/**');
      expect(module.serverConfig.fileWatching.ignored).toContain('**/.git/**');
      expect(module.serverConfig.fileWatching.ignored).toContain('**/dist/**');
      expect(module.serverConfig.fileWatching.ignored).toContain('**/build/**');
      expect(module.serverConfig.fileWatching.ignored).toContain('**/.raven/**');
    });
  });

  describe('Performance configuration', () => {
    test('should have default performance values', async () => {
      delete process.env.SLOW_REQUEST_MS;
      delete process.env.MAX_RESPONSE_TIME_MS;
      delete process.env.MEMORY_WARNING_MB;
      delete process.env.CPU_WARNING_PERCENT;

      const module = await import('../../config/server-config.js');

      expect(module.serverConfig.performance.slowRequestMs).toBe(1000);
      expect(module.serverConfig.performance.maxResponseTimeMs).toBe(5000);
      expect(module.serverConfig.performance.memoryWarningMb).toBe(500);
      expect(module.serverConfig.performance.cpuWarningPercent).toBe(80);
    });

    test('should use performance values from environment', async () => {
      process.env.SLOW_REQUEST_MS = '2000';
      process.env.MAX_RESPONSE_TIME_MS = '10000';
      process.env.MEMORY_WARNING_MB = '1000';
      process.env.CPU_WARNING_PERCENT = '90';

      const module = await import('../../config/server-config.js');

      expect(module.serverConfig.performance.slowRequestMs).toBe(2000);
      expect(module.serverConfig.performance.maxResponseTimeMs).toBe(10000);
      expect(module.serverConfig.performance.memoryWarningMb).toBe(1000);
      expect(module.serverConfig.performance.cpuWarningPercent).toBe(90);
    });
  });

  describe('Plugins configuration', () => {
    test('should have plugins enabled by default', async () => {
      delete process.env.ENABLE_PLUGINS;
      const module = await import('../../config/server-config.js');

      expect(module.serverConfig.plugins.enabled).toBe(true);
    });

    test('should disable plugins when env is false', async () => {
      process.env.ENABLE_PLUGINS = 'false';
      const module = await import('../../config/server-config.js');

      expect(module.serverConfig.plugins.enabled).toBe(false);
    });

    test('should have default plugins directory', async () => {
      delete process.env.PLUGINS_DIR;
      const module = await import('../../config/server-config.js');

      expect(module.serverConfig.plugins.directory).toBe('.raven/plugins');
    });

    test('should use PLUGINS_DIR from environment', async () => {
      process.env.PLUGINS_DIR = '/custom/plugins';
      const module = await import('../../config/server-config.js');

      expect(module.serverConfig.plugins.directory).toBe('/custom/plugins');
    });

    test('should have autoLoad enabled by default', async () => {
      delete process.env.AUTO_LOAD_PLUGINS;
      const module = await import('../../config/server-config.js');

      expect(module.serverConfig.plugins.autoLoad).toBe(true);
    });

    test('should disable autoLoad when env is false', async () => {
      process.env.AUTO_LOAD_PLUGINS = 'false';
      const module = await import('../../config/server-config.js');

      expect(module.serverConfig.plugins.autoLoad).toBe(false);
    });
  });

  describe('validateConfig()', () => {
    test('should pass validation with valid configuration', async () => {
      process.env.PORT = '9100';
      process.env.NODE_ENV = 'development';

      const module = await import('../../config/server-config.js');

      expect(() => module.validateConfig()).not.toThrow();
    });

    test('should throw error for invalid port (too low)', async () => {
      process.env.PORT = '0';

      const module = await import('../../config/server-config.js');

      expect(() => module.validateConfig()).toThrow('Invalid port number');
    });

    test('should throw error for invalid port (too high)', async () => {
      process.env.PORT = '70000';

      const module = await import('../../config/server-config.js');

      expect(() => module.validateConfig()).toThrow('Invalid port number');
    });

    test('should throw error for missing JWT_SECRET in production', async () => {
      process.env.NODE_ENV = 'production';
      delete process.env.JWT_SECRET;

      const module = await import('../../config/server-config.js');

      expect(() => module.validateConfig()).toThrow('JWT_SECRET required in production');
    });

    test('should throw error for missing SESSION_SECRET in production', async () => {
      process.env.NODE_ENV = 'production';
      process.env.JWT_SECRET = 'test-secret';
      delete process.env.SESSION_SECRET;

      const module = await import('../../config/server-config.js');

      expect(() => module.validateConfig()).toThrow('SESSION_SECRET required in production');
    });

    test('should pass validation in production with all required secrets', async () => {
      process.env.NODE_ENV = 'production';
      process.env.PORT = '9100';
      process.env.JWT_SECRET = 'test-jwt-secret';
      process.env.SESSION_SECRET = 'test-session-secret';

      const module = await import('../../config/server-config.js');

      expect(() => module.validateConfig()).not.toThrow();
    });

    test('should accumulate multiple validation errors', async () => {
      process.env.NODE_ENV = 'production';
      process.env.PORT = '0';
      delete process.env.JWT_SECRET;
      delete process.env.SESSION_SECRET;

      const module = await import('../../config/server-config.js');

      expect(() => module.validateConfig()).toThrow('Configuration errors');
      expect(() => module.validateConfig()).toThrow('Invalid port number');
      expect(() => module.validateConfig()).toThrow('JWT_SECRET required in production');
      expect(() => module.validateConfig()).toThrow('SESSION_SECRET required in production');
    });
  });

  describe('getConfig()', () => {
    beforeEach(async () => {
      const module = await import('../../config/server-config.js');
      serverConfig = module.serverConfig;
      getConfig = module.getConfig;
    });

    test('should get top-level config value', () => {
      const port = getConfig('port');
      expect(port).toBe(serverConfig.port);
    });

    test('should get nested config value', () => {
      const corsOrigin = getConfig('cors.origin');
      expect(corsOrigin).toBe(serverConfig.cors.origin);
    });

    test('should get deeply nested config value', () => {
      const authMax = getConfig('rateLimit.auth.max');
      expect(authMax).toBe(5);
    });

    test('should return undefined for non-existent path', () => {
      const value = getConfig('nonexistent.path');
      expect(value).toBeUndefined();
    });

    test('should return default value for non-existent path', () => {
      const value = getConfig('nonexistent.path', 'default');
      expect(value).toBe('default');
    });

    test('should return actual value even if default is provided', () => {
      const port = getConfig('port', 9999);
      expect(port).toBe(serverConfig.port);
      expect(port).not.toBe(9999);
    });

    test('should handle path to non-object value', () => {
      const value = getConfig('port.invalid');
      expect(value).toBeUndefined();
    });
  });
});
