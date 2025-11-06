/**
 * Tests for Server Configuration
 */

import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';

describe('Server Configuration', () => {
  let originalEnv;

  beforeEach(() => {
    // Save original environment
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
    // Clear module cache to get fresh config
    jest.resetModules();
  });

  describe('Default Configuration', () => {
    test('should use default port 3030', async () => {
      delete process.env.PORT;
      const { serverConfig } = await import('../../config/server-config.js');
      expect(serverConfig.port).toBe(3030);
    });

    test('should use default host localhost', async () => {
      delete process.env.HOST;
      const { serverConfig } = await import('../../config/server-config.js');
      expect(serverConfig.host).toBe('localhost');
    });

    test('should use default CORS origin', async () => {
      delete process.env.CORS_ORIGIN;
      const { serverConfig } = await import('../../config/server-config.js');
      expect(serverConfig.cors.origin).toBe('http://localhost:5173');
    });

    test('should have CORS credentials enabled', async () => {
      const { serverConfig } = await import('../../config/server-config.js');
      expect(serverConfig.cors.credentials).toBe(true);
    });

    test('should have correct CORS methods', async () => {
      const { serverConfig } = await import('../../config/server-config.js');
      expect(serverConfig.cors.methods).toEqual(['GET', 'POST', 'PUT', 'DELETE', 'PATCH']);
    });
  });

  describe('Environment Variable Overrides', () => {
    test('should override port from PORT env var', async () => {
      process.env.PORT = '4000';
      const { serverConfig } = await import('../../config/server-config.js');
      expect(serverConfig.port).toBe(4000);
    });

    test('should override host from HOST env var', async () => {
      process.env.HOST = '0.0.0.0';
      const { serverConfig } = await import('../../config/server-config.js');
      expect(serverConfig.host).toBe('0.0.0.0');
    });

    test('should override CORS origin from CORS_ORIGIN env var', async () => {
      process.env.CORS_ORIGIN = 'http://example.com';
      const { serverConfig } = await import('../../config/server-config.js');
      expect(serverConfig.cors.origin).toBe('http://example.com');
    });

    test('should parse numeric env vars correctly', async () => {
      process.env.WS_PING_TIMEOUT = '30000';
      process.env.WS_PING_INTERVAL = '10000';
      const { serverConfig } = await import('../../config/server-config.js');
      expect(serverConfig.websocket.pingTimeout).toBe(30000);
      expect(serverConfig.websocket.pingInterval).toBe(10000);
    });
  });

  describe('Rate Limiting Configuration', () => {
    test('should have general rate limit in production', async () => {
      process.env.NODE_ENV = 'production';
      const { serverConfig } = await import('../../config/server-config.js');
      expect(serverConfig.rateLimit.general.windowMs).toBe(15 * 60 * 1000);
      expect(serverConfig.rateLimit.general.max).toBe(100);
    });

    test('should have relaxed rate limit in development', async () => {
      process.env.NODE_ENV = 'development';
      const { serverConfig } = await import('../../config/server-config.js');
      expect(serverConfig.rateLimit.general.windowMs).toBe(60 * 1000);
      expect(serverConfig.rateLimit.general.max).toBe(1000);
    });

    test('should have auth rate limit configured', async () => {
      const { serverConfig } = await import('../../config/server-config.js');
      expect(serverConfig.rateLimit.auth.max).toBe(5);
      expect(serverConfig.rateLimit.auth.windowMs).toBe(15 * 60 * 1000);
    });

    test('should have telemetry rate limit configured', async () => {
      const { serverConfig } = await import('../../config/server-config.js');
      expect(serverConfig.rateLimit.telemetry.max).toBe(1000);
      expect(serverConfig.rateLimit.telemetry.windowMs).toBe(60 * 1000);
    });

    test('should have write rate limit configured', async () => {
      const { serverConfig } = await import('../../config/server-config.js');
      expect(serverConfig.rateLimit.write.max).toBe(50);
      expect(serverConfig.rateLimit.write.windowMs).toBe(15 * 60 * 1000);
    });
  });

  describe('WebSocket Configuration', () => {
    test('should have default WebSocket settings', async () => {
      const { serverConfig } = await import('../../config/server-config.js');
      expect(serverConfig.websocket.pingTimeout).toBe(60000);
      expect(serverConfig.websocket.pingInterval).toBe(25000);
      expect(serverConfig.websocket.transports).toEqual(['websocket', 'polling']);
    });

    test('should have WebSocket CORS enabled', async () => {
      const { serverConfig } = await import('../../config/server-config.js');
      expect(serverConfig.websocket.cors.credentials).toBe(true);
    });
  });

  describe('Database Configuration', () => {
    test('should have default database paths', async () => {
      const { serverConfig } = await import('../../config/server-config.js');
      expect(serverConfig.database.path).toBe('.raven/raven.db');
      expect(serverConfig.database.developerDbPath).toBe('.raven/db/developer.db');
      expect(serverConfig.database.authDbPath).toBe('.raven/db/auth.db');
      expect(serverConfig.database.snapshotsDir).toBe('.raven/snapshots');
    });

    test('should override database paths from env vars', async () => {
      process.env.DB_PATH = '/custom/path/db.sqlite';
      process.env.DEVELOPER_DB_PATH = '/custom/dev.db';
      const { serverConfig } = await import('../../config/server-config.js');
      expect(serverConfig.database.path).toBe('/custom/path/db.sqlite');
      expect(serverConfig.database.developerDbPath).toBe('/custom/dev.db');
    });

    test('should have database timeout configured', async () => {
      const { serverConfig } = await import('../../config/server-config.js');
      expect(serverConfig.database.options.timeout).toBe(5000);
    });
  });

  describe('Monitoring Configuration', () => {
    test('should have default monitoring intervals', async () => {
      const { serverConfig } = await import('../../config/server-config.js');
      expect(serverConfig.monitoring.metricsInterval).toBe(5000);
      expect(serverConfig.monitoring.logWatcherPollInterval).toBe(100);
      expect(serverConfig.monitoring.healthCheckInterval).toBe(30000);
      expect(serverConfig.monitoring.snapshotRetentionDays).toBe(30);
    });

    test('should override monitoring intervals from env vars', async () => {
      process.env.METRICS_INTERVAL = '10000';
      process.env.HEALTH_CHECK_INTERVAL = '60000';
      const { serverConfig } = await import('../../config/server-config.js');
      expect(serverConfig.monitoring.metricsInterval).toBe(10000);
      expect(serverConfig.monitoring.healthCheckInterval).toBe(60000);
    });
  });

  describe('Security Configuration', () => {
    test('should have security settings', async () => {
      const { serverConfig } = await import('../../config/server-config.js');
      expect(serverConfig.security.jwtExpiresIn).toBe('7d');
      expect(serverConfig.security.bcryptRounds).toBe(10);
    });

    test('should override JWT expiration from env var', async () => {
      process.env.JWT_EXPIRES_IN = '30d';
      const { serverConfig } = await import('../../config/server-config.js');
      expect(serverConfig.security.jwtExpiresIn).toBe('30d');
    });

    test('should override bcrypt rounds from env var', async () => {
      process.env.BCRYPT_ROUNDS = '12';
      const { serverConfig } = await import('../../config/server-config.js');
      expect(serverConfig.security.bcryptRounds).toBe(12);
    });

    test('should handle DISABLE_AUTH flag', async () => {
      process.env.DISABLE_AUTH = 'true';
      const { serverConfig } = await import('../../config/server-config.js');
      expect(serverConfig.security.disableAuth).toBe(true);
    });
  });

  describe('Node Environment Detection', () => {
    test('should detect production environment', async () => {
      process.env.NODE_ENV = 'production';
      const { serverConfig } = await import('../../config/server-config.js');
      expect(serverConfig.nodeEnv).toBe('production');
    });

    test('should default to development environment', async () => {
      delete process.env.NODE_ENV;
      const { serverConfig } = await import('../../config/server-config.js');
      expect(serverConfig.nodeEnv).toBe('development');
    });

    test('should handle test environment', async () => {
      process.env.NODE_ENV = 'test';
      const { serverConfig } = await import('../../config/server-config.js');
      expect(serverConfig.nodeEnv).toBe('test');
    });
  });

  describe('Type Safety', () => {
    test('should parse port as integer', async () => {
      process.env.PORT = '8080';
      const { serverConfig } = await import('../../config/server-config.js');
      expect(typeof serverConfig.port).toBe('number');
      expect(serverConfig.port).toBe(8080);
    });

    test('should parse monitoring intervals as integers', async () => {
      process.env.METRICS_INTERVAL = '7500';
      const { serverConfig } = await import('../../config/server-config.js');
      expect(typeof serverConfig.monitoring.metricsInterval).toBe('number');
      expect(serverConfig.monitoring.metricsInterval).toBe(7500);
    });

    test('should handle invalid port gracefully', async () => {
      process.env.PORT = 'invalid';
      const { serverConfig } = await import('../../config/server-config.js');
      expect(isNaN(serverConfig.port)).toBe(true);
    });
  });
});
