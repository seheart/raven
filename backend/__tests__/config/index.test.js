/**
 * Tests for Config Index
 */

import { jest } from '@jest/globals';

describe('Config Index', () => {
  let originalEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    jest.resetModules();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('Default Configuration', () => {
    test('should export config object with defaults', async () => {
      delete process.env.PORT;
      delete process.env.CORS_ORIGIN;
      delete process.env.JSON_PAYLOAD_LIMIT;
      delete process.env.LOG_LEVEL;
      delete process.env.SNAPSHOT_TTL_DAYS;
      delete process.env.DISABLE_AUTH;

      const { config } = await import('../../config/index.js');

      expect(config).toBeDefined();
      expect(config.PORT).toBe(3030);
      expect(config.CORS_ORIGIN).toBe('http://localhost:5173');
      expect(config.JSON_LIMIT).toBe('10mb');
      expect(config.LOG_LEVEL).toBe('info');
      expect(config.SNAPSHOT_TTL_DAYS).toBe(30);
      expect(config.DISABLE_AUTH).toBe(false);
    });

    test('should have cache configuration', async () => {
      const { config } = await import('../../config/index.js');

      expect(config.MAX_CACHE_SIZE).toBe(1000);
      expect(config.HEALTH_CACHE_TTL).toBe(5000);
    });

    test('should have compression configuration', async () => {
      const { config } = await import('../../config/index.js');

      expect(config.COMPRESSION_THRESHOLD).toBe(1024);
      expect(config.COMPRESSION_LEVEL).toBe(6);
    });

    test('should have file watching configuration', async () => {
      const { config } = await import('../../config/index.js');

      expect(config.DEBOUNCE_MS).toBe(100);
    });
  });

  describe('Environment Variable Overrides', () => {
    test('should use PORT from environment', async () => {
      process.env.PORT = '8080';
      const { config } = await import('../../config/index.js');

      expect(config.PORT).toBe(8080);
    });

    test('should use CORS_ORIGIN from environment', async () => {
      process.env.CORS_ORIGIN = 'http://example.com';
      const { config } = await import('../../config/index.js');

      expect(config.CORS_ORIGIN).toBe('http://example.com');
    });

    test('should use JSON_PAYLOAD_LIMIT from environment', async () => {
      process.env.JSON_PAYLOAD_LIMIT = '50mb';
      const { config } = await import('../../config/index.js');

      expect(config.JSON_LIMIT).toBe('50mb');
    });

    test('should use LOG_LEVEL from environment', async () => {
      process.env.LOG_LEVEL = 'debug';
      const { config } = await import('../../config/index.js');

      expect(config.LOG_LEVEL).toBe('debug');
    });

    test('should use SNAPSHOT_TTL_DAYS from environment', async () => {
      process.env.SNAPSHOT_TTL_DAYS = '60';
      const { config } = await import('../../config/index.js');

      expect(config.SNAPSHOT_TTL_DAYS).toBe(60);
    });

    test('should enable DISABLE_AUTH when set to true', async () => {
      process.env.DISABLE_AUTH = 'true';
      const { config } = await import('../../config/index.js');

      expect(config.DISABLE_AUTH).toBe(true);
    });

    test('should not enable DISABLE_AUTH for non-true values', async () => {
      process.env.DISABLE_AUTH = 'false';
      const { config } = await import('../../config/index.js');

      expect(config.DISABLE_AUTH).toBe(false);
    });

    test('should not enable DISABLE_AUTH for empty string', async () => {
      process.env.DISABLE_AUTH = '';
      const { config } = await import('../../config/index.js');

      expect(config.DISABLE_AUTH).toBe(false);
    });
  });

  describe('Type Validation', () => {
    test('PORT should be a number', async () => {
      process.env.PORT = '9000';
      const { config } = await import('../../config/index.js');

      expect(typeof config.PORT).toBe('number');
      expect(config.PORT).toBe(9000);
    });

    test('PORT should handle non-numeric values with NaN', async () => {
      process.env.PORT = 'invalid';
      const { config } = await import('../../config/index.js');

      expect(Number.isNaN(config.PORT)).toBe(true);
    });

    test('SNAPSHOT_TTL_DAYS should be a number', async () => {
      process.env.SNAPSHOT_TTL_DAYS = '90';
      const { config } = await import('../../config/index.js');

      expect(typeof config.SNAPSHOT_TTL_DAYS).toBe('number');
      expect(config.SNAPSHOT_TTL_DAYS).toBe(90);
    });

    test('DISABLE_AUTH should be a boolean', async () => {
      process.env.DISABLE_AUTH = 'true';
      const { config } = await import('../../config/index.js');

      expect(typeof config.DISABLE_AUTH).toBe('boolean');
      expect(config.DISABLE_AUTH).toBe(true);
    });
  });

  describe('Configuration Values', () => {
    test('should have reasonable defaults for production', async () => {
      const { config } = await import('../../config/index.js');

      expect(config.COMPRESSION_LEVEL).toBeGreaterThanOrEqual(0);
      expect(config.COMPRESSION_LEVEL).toBeLessThanOrEqual(9);
      expect(config.COMPRESSION_THRESHOLD).toBeGreaterThan(0);
      expect(config.HEALTH_CACHE_TTL).toBeGreaterThan(0);
      expect(config.MAX_CACHE_SIZE).toBeGreaterThan(0);
      expect(config.DEBOUNCE_MS).toBeGreaterThan(0);
    });

    test('should have sensible snapshot TTL', async () => {
      const { config } = await import('../../config/index.js');

      expect(config.SNAPSHOT_TTL_DAYS).toBeGreaterThan(0);
      expect(config.SNAPSHOT_TTL_DAYS).toBeLessThanOrEqual(365);
    });
  });
});
