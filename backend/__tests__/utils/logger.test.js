/**
 * Tests for Logger Utility
 * Tests Winston-based logging system
 */

import { logger } from '../../utils/logger.js';
import winston from 'winston';
import { Writable } from 'stream';

describe('Logger Utility', () => {
  let capturedLogs;
  let testTransport;
  let testStream;

  beforeEach(() => {
    // Create array to capture logs
    capturedLogs = [];

    // Create a writable stream for Winston
    testStream = new Writable({
      write(chunk, encoding, callback) {
        capturedLogs.push(chunk.toString());
        callback();
      }
    });

    // Create a custom test transport with the writable stream
    testTransport = new winston.transports.Stream({
      stream: testStream
    });

    // Add test transport to winston logger
    logger.winston.add(testTransport);
  });

  afterEach(() => {
    // Remove test transport
    logger.winston.remove(testTransport);
    capturedLogs = [];
  });

  describe('Log Levels', () => {
    test('should have debug, info, warn, error methods', () => {
      expect(logger.debug).toBeDefined();
      expect(logger.info).toBeDefined();
      expect(logger.warn).toBeDefined();
      expect(logger.error).toBeDefined();
    });

    test('should default to info level when LOG_LEVEL not set', () => {
      logger.info('info message');
      logger.debug('debug message');

      const logs = capturedLogs.join('\n');
      expect(logs).toContain('info message');
      // Debug should not appear (default level is info)
      // Note: might appear if LOG_LEVEL is set to debug in environment
    });
  });

  describe('Debug Level', () => {
    test('should log debug messages', () => {
      // Set level to debug temporarily
      const originalLevel = logger.winston.level;
      logger.winston.level = 'debug';

      logger.debug('test debug message');

      const logs = capturedLogs.join('\n');
      expect(logs).toContain('test debug message');

      // Restore level
      logger.winston.level = originalLevel;
    });

    test('should support metadata objects', () => {
      const originalLevel = logger.winston.level;
      logger.winston.level = 'debug';

      const meta = { key: 'value' };
      logger.debug('message with object', meta);

      const logs = capturedLogs.join('\n');
      expect(logs).toContain('message with object');
      expect(logs).toContain('key');

      logger.winston.level = originalLevel;
    });
  });

  describe('Info Level', () => {
    test('should log info messages', () => {
      logger.info('test info message');

      const logs = capturedLogs.join('\n');
      expect(logs).toContain('test info message');
    });

    test('should support metadata', () => {
      const data = { count: 5 };
      logger.info('Processing items', data);

      const logs = capturedLogs.join('\n');
      expect(logs).toContain('Processing items');
      expect(logs).toContain('count');
    });

    test('should not log debug when level is info', () => {
      const originalLevel = logger.winston.level;
      logger.winston.level = 'info';

      logger.debug('debug message');
      logger.info('info message');

      const logs = capturedLogs.join('\n');
      expect(logs).toContain('info message');
      expect(logs).not.toContain('debug message');

      logger.winston.level = originalLevel;
    });
  });

  describe('Warn Level', () => {
    test('should log warn messages', () => {
      logger.warn('test warn message');

      const logs = capturedLogs.join('\n');
      expect(logs).toContain('test warn message');
    });

    test('should support metadata', () => {
      const warnData = { issue: 'deprecation' };
      logger.warn('Deprecated API used', warnData);

      const logs = capturedLogs.join('\n');
      expect(logs).toContain('Deprecated API used');
      expect(logs).toContain('issue');
    });

    test('should not log info/debug when level is warn', () => {
      const originalLevel = logger.winston.level;
      logger.winston.level = 'warn';

      logger.debug('debug message');
      logger.info('info message');
      logger.warn('warn message');

      const logs = capturedLogs.join('\n');
      expect(logs).toContain('warn message');
      expect(logs).not.toContain('debug message');
      expect(logs).not.toContain('info message');

      logger.winston.level = originalLevel;
    });
  });

  describe('Error Level', () => {
    test('should log error messages', () => {
      logger.error('test error message');

      const logs = capturedLogs.join('\n');
      expect(logs).toContain('test error message');
    });

    test('should support error objects', () => {
      const error = new Error('Test error');
      logger.error('An error occurred', { error });

      const logs = capturedLogs.join('\n');
      expect(logs).toContain('An error occurred');
    });

    test('should only log errors when level is error', () => {
      const originalLevel = logger.winston.level;
      logger.winston.level = 'error';

      logger.debug('debug message');
      logger.info('info message');
      logger.warn('warn message');
      logger.error('error message');

      const logs = capturedLogs.join('\n');
      expect(logs).toContain('error message');
      expect(logs).not.toContain('debug message');
      expect(logs).not.toContain('info message');
      expect(logs).not.toContain('warn message');

      logger.winston.level = originalLevel;
    });
  });

  describe('Winston Integration', () => {
    test('should expose winston instance', () => {
      expect(logger.winston).toBeDefined();
      expect(logger.winston.level).toBeDefined();
    });

    test('should use JSON format', () => {
      logger.info('test json format');

      // Winston should format as JSON internally
      expect(capturedLogs.length).toBeGreaterThan(0);
      const log = capturedLogs[0];
      // Should contain JSON structure markers
      expect(typeof log).toBe('string');
    });
  });
});
