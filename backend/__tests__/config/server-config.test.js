/**
 * Tests for Server Configuration
 */

import { jest } from '@jest/globals';

describe('Server Configuration', () => {
  let originalEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    jest.resetModules();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('Default Configuration', () => {
    test('should use default port when PORT not set', async () => {
      delete process.env.PORT;
      const { serverConfig } = await import('../../config/server-config.js');
      expect(serverConfig.port).toBe(3030);
    });

    test('should use environment PORT when set', async () => {
      process.env.PORT = '4000';
      const { serverConfig } = await import('../../config/server-config.js');
      expect(serverConfig.port).toBe(4000);
    });

    test('should use default host when HOST not set', async () => {
      delete process.env.HOST;
      const { serverConfig } = await import('../../config/server-config.js');
      expect(serverConfig.host).toBe('localhost');
    });

    test('should default to development environment', async () => {
      delete process.env.NODE_ENV;
      const { serverConfig } = await import('../../config/server-config.js');
      expect(serverConfig.nodeEnv).toBe('development');
    });
  });

  describe('CORS Configuration', () => {
    test('should have default CORS origin', async () => {
      const { serverConfig } = await import('../../config/server-config.js');
      expect(serverConfig.cors.origin).toBe('http://localhost:5173');
    });

    test('should enable credentials', async () => {
      const { serverConfig } = await import('../../config/server-config.js');
      expect(serverConfig.cors.credentials).toBe(true);
    });

    test('should allow standard HTTP methods', async () => {
      const { serverConfig } = await import('../../config/server-config.js');
      expect(serverConfig.cors.methods).toEqual(['GET', 'POST', 'PUT', 'DELETE', 'PATCH']);
    });
  });

  describe('Rate Limiting', () => {
    test('should have stricter limits in production', async () => {
      process.env.NODE_ENV = 'production';
      const { serverConfig } = await import('../../config/server-config.js');
      expect(serverConfig.rateLimit.general.max).toBe(100);
    });

    test('should have relaxed limits in development', async () => {
      process.env.NODE_ENV = 'development';
      const { serverConfig } = await import('../../config/server-config.js');
      expect(serverConfig.rateLimit.general.max).toBe(1000);
    });
  });
});
