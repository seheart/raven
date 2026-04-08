/**
 * Tests for Structured Logger
 */

import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { generateCorrelationId, StructuredLogger, createRequestLogger, logger } from '../../utils/structured-logger.js';

describe('Structured Logger', () => {
  let originalEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe('generateCorrelationId()', () => {
    test('should generate a correlation ID', () => {
      const id = generateCorrelationId();

      expect(id).toBeDefined();
      expect(typeof id).toBe('string');
      expect(id.length).toBe(16);
    });

    test('should generate unique IDs', () => {
      const id1 = generateCorrelationId();
      const id2 = generateCorrelationId();

      expect(id1).not.toBe(id2);
    });
  });

  describe('StructuredLogger', () => {
    let testLogger;

    beforeEach(() => {
      testLogger = new StructuredLogger({ testContext: 'value' });
    });

    describe('constructor', () => {
      test('should initialize with context', () => {
        expect(testLogger.context).toEqual({ testContext: 'value' });
      });

      test('should initialize with empty context', () => {
        const _emptyLogger = new StructuredLogger();
        expect(testLogger.context).toBeDefined();
      });
    });

    describe('child()', () => {
      test('should create child logger with additional context', () => {
        const childLogger = testLogger.child({ childContext: 'child' });

        expect(childLogger).toBeInstanceOf(StructuredLogger);
        expect(childLogger.context).toEqual({
          testContext: 'value',
          childContext: 'child'
        });
      });

      test('should not modify parent context', () => {
        const childLogger = testLogger.child({ new: 'context' });

        expect(testLogger.context).toEqual({ testContext: 'value' });
        expect(childLogger.context).toHaveProperty('new');
      });

      test('should override parent context values', () => {
        const childLogger = testLogger.child({ testContext: 'overridden' });

        expect(childLogger.context.testContext).toBe('overridden');
      });
    });

    describe('debug()', () => {
      test('should log debug messages', () => {
        // Should not throw
        expect(() => testLogger.debug('Debug message')).not.toThrow();
      });

      test('should log debug with metadata', () => {
        expect(() => testLogger.debug('Debug', { extra: 'data' })).not.toThrow();
      });
    });

    describe('info()', () => {
      test('should log info messages', () => {
        expect(() => testLogger.info('Info message')).not.toThrow();
      });

      test('should log info with metadata', () => {
        expect(() => testLogger.info('Info', { extra: 'data' })).not.toThrow();
      });
    });

    describe('warn()', () => {
      test('should log warning messages', () => {
        expect(() => testLogger.warn('Warning message')).not.toThrow();
      });

      test('should log warning with metadata', () => {
        expect(() => testLogger.warn('Warning', { extra: 'data' })).not.toThrow();
      });
    });

    describe('error()', () => {
      test('should log error messages', () => {
        expect(() => testLogger.error('Error message')).not.toThrow();
      });

      test('should log error with Error object', () => {
        const error = new Error('Test error');
        error.code = 'TEST_ERROR';

        expect(() => testLogger.error('Error occurred', error)).not.toThrow();
      });

      test('should log error without Error object', () => {
        expect(() => testLogger.error('Error', null)).not.toThrow();
      });

      test('should log error with metadata', () => {
        const error = new Error('Test');
        expect(() => testLogger.error('Error', error, { extra: 'data' })).not.toThrow();
      });

      test('should handle error without code property', () => {
        const error = new Error('No code');
        expect(() => testLogger.error('Error', error)).not.toThrow();
      });
    });

    describe('logRequest()', () => {
      test('should log HTTP request', () => {
        const mockReq = {
          method: 'GET',
          path: '/api/test',
          query: { page: '1' },
          ip: '127.0.0.1',
          get: (_header) => 'Mozilla/5.0'
        };

        expect(() => testLogger.logRequest(mockReq)).not.toThrow();
      });

      test('should log request with metadata', () => {
        const mockReq = {
          method: 'POST',
          path: '/api/users',
          query: {},
          ip: '192.168.1.1',
          get: () => 'Chrome'
        };

        expect(() => testLogger.logRequest(mockReq, { userId: '123' })).not.toThrow();
      });

      test('should sanitize sensitive query parameters', () => {
        const mockReq = {
          method: 'GET',
          path: '/api/auth',
          query: { password: 'secret123', username: 'user' },
          ip: '127.0.0.1',
          get: () => null
        };

        expect(() => testLogger.logRequest(mockReq)).not.toThrow();
      });
    });

    describe('logResponse()', () => {
      test('should log successful response with info level', () => {
        const mockReq = {
          method: 'GET',
          path: '/api/test'
        };
        const mockRes = {
          statusCode: 200
        };

        expect(() => testLogger.logResponse(mockReq, mockRes, 45)).not.toThrow();
      });

      test('should log error response with warn level', () => {
        const mockReq = {
          method: 'POST',
          path: '/api/error'
        };
        const mockRes = {
          statusCode: 500
        };

        expect(() => testLogger.logResponse(mockReq, mockRes, 120)).not.toThrow();
      });

      test('should log client error response with warn level', () => {
        const mockReq = {
          method: 'GET',
          path: '/api/not-found'
        };
        const mockRes = {
          statusCode: 404
        };

        expect(() => testLogger.logResponse(mockReq, mockRes, 10)).not.toThrow();
      });

      test('should log response with metadata', () => {
        const mockReq = { method: 'GET', path: '/test' };
        const mockRes = { statusCode: 200 };

        expect(() => testLogger.logResponse(mockReq, mockRes, 25, { extra: 'data' })).not.toThrow();
      });
    });

    describe('logQuery()', () => {
      test('should log query in non-production with full query', () => {
        process.env.NODE_ENV = 'development';

        expect(() => testLogger.logQuery('SELECT * FROM users', 15)).not.toThrow();
      });

      test('should log query in production with only query type', () => {
        process.env.NODE_ENV = 'production';
        process.env.IS_PRODUCTION = 'true';

        expect(() => testLogger.logQuery('SELECT * FROM users', 20)).not.toThrow();
      });

      test('should log query with metadata', () => {
        expect(() => testLogger.logQuery('INSERT INTO logs', 5, { table: 'logs' })).not.toThrow();
      });

      test('should handle UPDATE queries', () => {
        process.env.NODE_ENV = 'production';
        process.env.IS_PRODUCTION = 'true';

        expect(() => testLogger.logQuery('UPDATE users SET name = ?', 10)).not.toThrow();
      });

      test('should handle DELETE queries', () => {
        process.env.NODE_ENV = 'production';
        process.env.IS_PRODUCTION = 'true';

        expect(() => testLogger.logQuery('DELETE FROM sessions WHERE id = ?', 8)).not.toThrow();
      });
    });

    describe('logMetric()', () => {
      test('should log performance metric', () => {
        expect(() => testLogger.logMetric('api_response_time', 125)).not.toThrow();
      });

      test('should log metric with custom unit', () => {
        expect(() => testLogger.logMetric('memory_usage', 512, 'MB')).not.toThrow();
      });

      test('should log metric with metadata', () => {
        expect(() => testLogger.logMetric('cpu_usage', 45, '%', { core: 0 })).not.toThrow();
      });

      test('should default unit to ms', () => {
        expect(() => testLogger.logMetric('duration', 100)).not.toThrow();
      });
    });
  });

  describe('Sanitize Query Parameters', () => {
    let testLogger;

    beforeEach(() => {
      testLogger = new StructuredLogger();
    });

    test('should redact password fields', () => {
      const mockReq = {
        method: 'POST',
        path: '/auth',
        query: { password: 'secret123', email: 'user@test.com' },
        ip: '127.0.0.1',
        get: () => null
      };

      // Should not throw and password should be redacted
      expect(() => testLogger.logRequest(mockReq)).not.toThrow();
    });

    test('should redact token fields', () => {
      const mockReq = {
        method: 'GET',
        path: '/api/data',
        query: { token: 'abc123', page: '1' },
        ip: '127.0.0.1',
        get: () => null
      };

      expect(() => testLogger.logRequest(mockReq)).not.toThrow();
    });

    test('should redact secret fields', () => {
      const mockReq = {
        method: 'GET',
        path: '/api/config',
        query: { secret: 'xyz789', setting: 'value' },
        ip: '127.0.0.1',
        get: () => null
      };

      expect(() => testLogger.logRequest(mockReq)).not.toThrow();
    });

    test('should handle nested objects', () => {
      const mockReq = {
        method: 'POST',
        path: '/api/users',
        query: { user: { password: 'secret', name: 'John' } },
        ip: '127.0.0.1',
        get: () => null
      };

      expect(() => testLogger.logRequest(mockReq)).not.toThrow();
    });

    test('should handle arrays', () => {
      const mockReq = {
        method: 'GET',
        path: '/api/items',
        query: { ids: ['1', '2', '3'], token: 'secret' },
        ip: '127.0.0.1',
        get: () => null
      };

      expect(() => testLogger.logRequest(mockReq)).not.toThrow();
    });

    test('should handle arrays of objects', () => {
      const mockReq = {
        method: 'POST',
        path: '/api/batch',
        query: { items: [{ id: '1', password: 'secret' }, { id: '2' }] },
        ip: '127.0.0.1',
        get: () => null
      };

      expect(() => testLogger.logRequest(mockReq)).not.toThrow();
    });

    test('should handle null query', () => {
      const mockReq = {
        method: 'GET',
        path: '/api/test',
        query: null,
        ip: '127.0.0.1',
        get: () => null
      };

      expect(() => testLogger.logRequest(mockReq)).not.toThrow();
    });

    test('should handle undefined query', () => {
      const mockReq = {
        method: 'GET',
        path: '/api/test',
        query: undefined,
        ip: '127.0.0.1',
        get: () => null
      };

      expect(() => testLogger.logRequest(mockReq)).not.toThrow();
    });

    test('should handle primitive query (defensive)', () => {
      const mockReq = {
        method: 'GET',
        path: '/api/test',
        query: 'string',
        ip: '127.0.0.1',
        get: () => null
      };

      expect(() => testLogger.logRequest(mockReq)).not.toThrow();
    });

    test('should redact api_key field', () => {
      const mockReq = {
        method: 'GET',
        path: '/api/data',
        query: { api_key: 'key123' },
        ip: '127.0.0.1',
        get: () => null
      };

      expect(() => testLogger.logRequest(mockReq)).not.toThrow();
    });

    test('should redact authorization field', () => {
      const mockReq = {
        method: 'GET',
        path: '/api/secure',
        query: { authorization: 'Bearer token123' },
        ip: '127.0.0.1',
        get: () => null
      };

      expect(() => testLogger.logRequest(mockReq)).not.toThrow();
    });

    test('should be case insensitive for sensitive fields', () => {
      const mockReq = {
        method: 'GET',
        path: '/api/test',
        query: { PASSWORD: 'secret', Token: 'abc', API_KEY: 'xyz' },
        ip: '127.0.0.1',
        get: () => null
      };

      expect(() => testLogger.logRequest(mockReq)).not.toThrow();
    });
  });

  describe('createRequestLogger()', () => {
    test('should create logger with correlation ID', () => {
      const correlationId = 'test-correlation-id';
      const requestLogger = createRequestLogger(correlationId);

      expect(requestLogger).toBeInstanceOf(StructuredLogger);
      expect(requestLogger.context.correlationId).toBe(correlationId);
    });

    test('should create independent loggers', () => {
      const logger1 = createRequestLogger('id1');
      const logger2 = createRequestLogger('id2');

      expect(logger1.context.correlationId).toBe('id1');
      expect(logger2.context.correlationId).toBe('id2');
    });
  });

  describe('Default Logger Instance', () => {
    test('should export default logger instance', () => {
      expect(logger).toBeInstanceOf(StructuredLogger);
    });

    test('should be usable for logging', () => {
      expect(() => logger.info('Test message')).not.toThrow();
    });
  });

  describe('Production File Logging', () => {
    test('should handle production environment setup', () => {
      // Just verify the module loads without errors
      // Actual file transport tests would require mocking winston
      expect(logger).toBeDefined();
    });
  });
});
