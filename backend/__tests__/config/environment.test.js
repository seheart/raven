/**
 * Tests for Environment Configuration
 */

import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';

describe('Environment Configuration', () => {
  let originalEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.resetModules();
  });

  describe('Environment Variables Loading', () => {
    test('should load NODE_ENV correctly', async () => {
      process.env.NODE_ENV = 'production';
      process.env.JWT_SECRET = 'prod-secret-123';
      const { env } = await import('../../config/environment.js');
      expect(env.NODE_ENV).toBe('production');
    });

    test('should default NODE_ENV to development', async () => {
      delete process.env.NODE_ENV;
      const { env } = await import('../../config/environment.js');
      expect(env.NODE_ENV).toBe('development');
    });

    test('should load PORT with default', async () => {
      delete process.env.PORT;
      const { env } = await import('../../config/environment.js');
      expect(env.PORT).toBe(9100);
    });

    test('should override PORT from env var', async () => {
      process.env.PORT = '4000';
      const { env } = await import('../../config/environment.js');
      expect(env.PORT).toBe(4000);
    });

    test('should load HOST with default', async () => {
      delete process.env.HOST;
      const { env } = await import('../../config/environment.js');
      expect(env.HOST).toBe('0.0.0.0');
    });

    test('should override HOST from env var', async () => {
      process.env.HOST = 'localhost';
      const { env } = await import('../../config/environment.js');
      expect(env.HOST).toBe('localhost');
    });
  });

  describe('Environment Flags', () => {
    test('should set IS_PRODUCTION in production', async () => {
      process.env.NODE_ENV = 'production';
      process.env.JWT_SECRET = 'prod-secret';
      const { env } = await import('../../config/environment.js');
      expect(env.IS_PRODUCTION).toBe(true);
      expect(env.IS_DEVELOPMENT).toBe(false);
    });

    test('should set IS_DEVELOPMENT in development', async () => {
      process.env.NODE_ENV = 'development';
      const { env } = await import('../../config/environment.js');
      expect(env.IS_PRODUCTION).toBe(false);
      expect(env.IS_DEVELOPMENT).toBe(true);
    });

    test('should set IS_TEST in test mode', async () => {
      process.env.NODE_ENV = 'test';
      const { env } = await import('../../config/environment.js');
      expect(env.IS_TEST).toBe(true);
    });
  });

  describe('Boolean Environment Variables', () => {
    test('should parse DISABLE_AUTH as boolean', async () => {
      process.env.DISABLE_AUTH = 'true';
      const { env } = await import('../../config/environment.js');
      expect(env.DISABLE_AUTH).toBe(true);
    });

    test('should default DISABLE_AUTH to false', async () => {
      delete process.env.DISABLE_AUTH;
      const { env } = await import('../../config/environment.js');
      expect(env.DISABLE_AUTH).toBe(false);
    });

    test('should parse ENABLE_METRICS as boolean', async () => {
      process.env.ENABLE_METRICS = 'false';
      const { env } = await import('../../config/environment.js');
      expect(env.ENABLE_METRICS).toBe(false);
    });

    test('should default ENABLE_METRICS to true', async () => {
      delete process.env.ENABLE_METRICS;
      const { env } = await import('../../config/environment.js');
      expect(env.ENABLE_METRICS).toBe(true);
    });

    test('should parse "1" as true', async () => {
      process.env.ENABLE_TRIGGERS = '1';
      const { env } = await import('../../config/environment.js');
      expect(env.ENABLE_TRIGGERS).toBe(true);
    });
  });

  describe('Integer Environment Variables', () => {
    test('should parse RATE_LIMIT_MAX_REQUESTS as integer', async () => {
      process.env.RATE_LIMIT_MAX_REQUESTS = '500';
      const { env } = await import('../../config/environment.js');
      expect(env.RATE_LIMIT_MAX_REQUESTS).toBe(500);
    });

    test('should default RATE_LIMIT_MAX_REQUESTS', async () => {
      delete process.env.RATE_LIMIT_MAX_REQUESTS;
      const { env } = await import('../../config/environment.js');
      expect(env.RATE_LIMIT_MAX_REQUESTS).toBe(100);
    });

    test('should parse MAX_CACHE_SIZE as integer', async () => {
      process.env.MAX_CACHE_SIZE = '2000';
      const { env } = await import('../../config/environment.js');
      expect(env.MAX_CACHE_SIZE).toBe(2000);
    });

    test('should handle invalid integer gracefully', async () => {
      process.env.MAX_CACHE_SIZE = 'invalid';
      const { env } = await import('../../config/environment.js');
      expect(env.MAX_CACHE_SIZE).toBe(1000); // Falls back to default
    });
  });

  describe('JWT Configuration', () => {
    test('should use dev secret in development', async () => {
      process.env.NODE_ENV = 'development';
      delete process.env.JWT_SECRET;
      const { env } = await import('../../config/environment.js');
      expect(env.JWT_SECRET).toBe('dev-secret-key');
    });

    test('should use custom JWT secret from env var', async () => {
      process.env.JWT_SECRET = 'custom-secret';
      const { env } = await import('../../config/environment.js');
      expect(env.JWT_SECRET).toBe('custom-secret');
    });

    test('should have default JWT expiration', async () => {
      delete process.env.JWT_EXPIRES_IN;
      const { env } = await import('../../config/environment.js');
      expect(env.JWT_EXPIRES_IN).toBe('24h');
    });

    test('should override JWT expiration from env var', async () => {
      process.env.JWT_EXPIRES_IN = '7d';
      const { env } = await import('../../config/environment.js');
      expect(env.JWT_EXPIRES_IN).toBe('7d');
    });
  });

  describe('validateConfig', () => {
    test('should pass validation in development', async () => {
      process.env.NODE_ENV = 'development';
      const { validateConfig } = await import('../../config/environment.js');
      expect(() => validateConfig()).not.toThrow();
    });

    test('should throw if JWT_SECRET missing in production', async () => {
      process.env.NODE_ENV = 'production';
      process.env.JWT_SECRET = 'dev-secret-key'; // Will be caught during validation
      const { validateConfig } = await import('../../config/environment.js');
      expect(() => validateConfig()).toThrow(/JWT_SECRET/);
    });

    test('should throw if DISABLE_AUTH enabled in production', async () => {
      process.env.NODE_ENV = 'production';
      process.env.JWT_SECRET = 'prod-secret';
      process.env.DISABLE_AUTH = 'true';
      const { validateConfig } = await import('../../config/environment.js');
      expect(() => validateConfig()).toThrow(/DISABLE_AUTH/);
    });

    test('should throw if PORT is invalid', async () => {
      process.env.PORT = '70000';
      const { validateConfig } = await import('../../config/environment.js');
      expect(() => validateConfig()).toThrow(/PORT/);
    });

    test('should throw if LOG_LEVEL is invalid', async () => {
      process.env.LOG_LEVEL = 'invalid';
      const { validateConfig } = await import('../../config/environment.js');
      expect(() => validateConfig()).toThrow(/LOG_LEVEL/);
    });

    test('should accept valid log levels', async () => {
      process.env.LOG_LEVEL = 'debug';
      const { validateConfig } = await import('../../config/environment.js');
      expect(() => validateConfig()).not.toThrow();

      process.env.LOG_LEVEL = 'info';
      jest.resetModules();
      const { validateConfig: validate2 } = await import('../../config/environment.js');
      expect(() => validate2()).not.toThrow();
    });
  });

  describe('Proxy Behavior', () => {
    test('should sync ENABLE_METRICS to process.env', async () => {
      process.env.NODE_ENV = 'test';
      const { env } = await import('../../config/environment.js');
      env.ENABLE_METRICS = false;
      expect(process.env.ENABLE_METRICS).toBe('false');

      env.ENABLE_METRICS = true;
      expect(process.env.ENABLE_METRICS).toBe('true');
    });

    test('should read values through proxy', async () => {
      process.env.PORT = '5000';
      const { env } = await import('../../config/environment.js');
      expect(env.PORT).toBe(5000);
    });
  });

  describe('Database Configuration', () => {
    test('should have default DB directory', async () => {
      delete process.env.DB_DIR;
      const { env } = await import('../../config/environment.js');
      expect(env.DB_DIR).toBe('./.raven/databases');
    });

    test('should override DB directory', async () => {
      process.env.DB_DIR = '/custom/db/path';
      const { env } = await import('../../config/environment.js');
      expect(env.DB_DIR).toBe('/custom/db/path');
    });

    test('should have default snapshot TTL', async () => {
      delete process.env.SNAPSHOT_TTL_DAYS;
      const { env } = await import('../../config/environment.js');
      expect(env.SNAPSHOT_TTL_DAYS).toBe(30);
    });
  });

  describe('Feature Flags', () => {
    test('should have ENABLE_TRIGGERS default to true', async () => {
      delete process.env.ENABLE_TRIGGERS;
      const { env } = await import('../../config/environment.js');
      expect(env.ENABLE_TRIGGERS).toBe(true);
    });

    test('should have ENABLE_GIT_MONITOR default to true', async () => {
      delete process.env.ENABLE_GIT_MONITOR;
      const { env } = await import('../../config/environment.js');
      expect(env.ENABLE_GIT_MONITOR).toBe(true);
    });

    test('should have ENABLE_DEBUG_ROUTES default to false', async () => {
      delete process.env.ENABLE_DEBUG_ROUTES;
      const { env } = await import('../../config/environment.js');
      expect(env.ENABLE_DEBUG_ROUTES).toBe(false);
    });

    test('should allow enabling debug routes', async () => {
      process.env.ENABLE_DEBUG_ROUTES = 'true';
      const { env } = await import('../../config/environment.js');
      expect(env.ENABLE_DEBUG_ROUTES).toBe(true);
    });
  });

  describe('Logging Configuration', () => {
    test('should have default log level', async () => {
      delete process.env.LOG_LEVEL;
      const { env } = await import('../../config/environment.js');
      expect(env.LOG_LEVEL).toBe('info');
    });

    test('should override log level', async () => {
      process.env.LOG_LEVEL = 'debug';
      const { env } = await import('../../config/environment.js');
      expect(env.LOG_LEVEL).toBe('debug');
    });

    test('should have STRUCTURED_LOGGING default to false', async () => {
      delete process.env.STRUCTURED_LOGGING;
      const { env } = await import('../../config/environment.js');
      expect(env.STRUCTURED_LOGGING).toBe(false);
    });
  });

  describe('Performance Configuration', () => {
    test('should have default payload limit', async () => {
      delete process.env.JSON_PAYLOAD_LIMIT;
      const { env } = await import('../../config/environment.js');
      expect(env.JSON_PAYLOAD_LIMIT).toBe('10mb');
    });

    test('should have default health cache TTL', async () => {
      delete process.env.HEALTH_CACHE_TTL;
      const { env } = await import('../../config/environment.js');
      expect(env.HEALTH_CACHE_TTL).toBe(5000);
    });
  });

  describe('Rate Limiting', () => {
    test('should have default rate limit window', async () => {
      delete process.env.RATE_LIMIT_WINDOW_MS;
      const { env } = await import('../../config/environment.js');
      expect(env.RATE_LIMIT_WINDOW_MS).toBe(60000);
    });

    test('should have default telemetry rate limit', async () => {
      delete process.env.TELEMETRY_RATE_LIMIT;
      const { env } = await import('../../config/environment.js');
      expect(env.TELEMETRY_RATE_LIMIT).toBe(1000);
    });
  });

  describe('Required Environment Variables', () => {
    test('should have JWT_SECRET in production', async () => {
      process.env.NODE_ENV = 'production';
      process.env.JWT_SECRET = 'test-prod-secret';
      const { env } = await import('../../config/environment.js');
      expect(env.JWT_SECRET).toBe('test-prod-secret');
    });
  });

  describe('Production Security Checks', () => {
    test('should throw if SHOW_ERROR_DETAILS is true in production', async () => {
      process.env.NODE_ENV = 'production';
      process.env.JWT_SECRET = 'prod-secret-123';
      process.env.SHOW_ERROR_DETAILS = 'true';
      const { validateConfig } = await import('../../config/environment.js');
      expect(() => validateConfig()).toThrow(/SHOW_ERROR_DETAILS/);
    });
  });

  describe('printConfig', () => {
    test('should print configuration without throwing', async () => {
      const { printConfig } = await import('../../config/environment.js');
      expect(() => printConfig()).not.toThrow();
    });
  });

  describe('initConfig', () => {
    test('should validate and print config in development', async () => {
      process.env.NODE_ENV = 'development';
      const { initConfig } = await import('../../config/environment.js');
      expect(() => initConfig()).not.toThrow();
    });

    test('should throw validation errors in test mode', async () => {
      process.env.NODE_ENV = 'test';
      process.env.PORT = '99999';
      jest.resetModules();
      const { initConfig } = await import('../../config/environment.js');
      expect(() => initConfig()).toThrow();
    });
  });
});
