/**
 * Tests for Logger Utility
 * Tests environment-aware logging system from Phase 3
 */

import { jest } from '@jest/globals';
import { logger } from '../../utils/logger.js';

describe('Logger Utility', () => {
  let originalLogLevel;
  let consoleLogSpy, consoleWarnSpy, consoleErrorSpy;

  beforeEach(() => {
    // Save original LOG_LEVEL
    originalLogLevel = process.env.LOG_LEVEL;

    // Spy on console methods
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
  });

  afterEach(() => {
    // Restore original LOG_LEVEL
    if (originalLogLevel) {
      process.env.LOG_LEVEL = originalLogLevel;
    } else {
      delete process.env.LOG_LEVEL;
    }

    // Restore console methods
    consoleLogSpy.mockRestore();
    consoleWarnSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  describe('Log Levels', () => {
    test('should have debug, info, warn, error methods', () => {
      expect(logger.debug).toBeDefined();
      expect(logger.info).toBeDefined();
      expect(logger.warn).toBeDefined();
      expect(logger.error).toBeDefined();
    });

    test('should default to info level when LOG_LEVEL not set', () => {
      delete process.env.LOG_LEVEL;

      // Reload logger module to pick up env change
      // (In actual implementation, LOG_LEVEL is read once at module load)

      logger.debug('debug message');
      logger.info('info message');

      expect(consoleLogSpy).not.toHaveBeenCalledWith('[DEBUG] debug message');
      expect(consoleLogSpy).toHaveBeenCalledWith('info message');
    });
  });

  describe('Debug Level', () => {
    beforeEach(() => {
      process.env.LOG_LEVEL = 'debug';
    });

    test('should log debug messages with [DEBUG] prefix', () => {
      logger.debug('test debug message');
      expect(consoleLogSpy).toHaveBeenCalledWith('[DEBUG] test debug message');
    });

    test('should support additional arguments', () => {
      const obj = { key: 'value' };
      logger.debug('message with object', obj, 123);
      expect(consoleLogSpy).toHaveBeenCalledWith('[DEBUG] message with object', obj, 123);
    });
  });

  describe('Info Level', () => {
    test('should log info messages without prefix', () => {
      logger.info('test info message');
      expect(consoleLogSpy).toHaveBeenCalledWith('test info message');
    });

    test('should support additional arguments', () => {
      const data = { count: 5 };
      logger.info('Processing items', data);
      expect(consoleLogSpy).toHaveBeenCalledWith('Processing items', data);
    });

    test('should not log debug when level is info', () => {
      process.env.LOG_LEVEL = 'info';

      logger.debug('debug message');
      expect(consoleLogSpy).not.toHaveBeenCalledWith(
        expect.stringContaining('[DEBUG]')
      );
    });
  });

  describe('Warn Level', () => {
    test('should log warn messages using console.warn', () => {
      logger.warn('test warning');
      expect(consoleWarnSpy).toHaveBeenCalledWith('test warning');
    });

    test('should support additional arguments', () => {
      const err = new Error('Something wrong');
      logger.warn('Warning occurred', err);
      expect(consoleWarnSpy).toHaveBeenCalledWith('Warning occurred', err);
    });

    test('should not log info/debug when level is warn', () => {
      process.env.LOG_LEVEL = 'warn';

      logger.debug('debug');
      logger.info('info');
      logger.warn('warn');

      expect(consoleLogSpy).not.toHaveBeenCalled();
      expect(consoleWarnSpy).toHaveBeenCalledWith('warn');
    });
  });

  describe('Error Level', () => {
    test('should log error messages using console.error', () => {
      logger.error('test error');
      expect(consoleErrorSpy).toHaveBeenCalledWith('test error');
    });

    test('should support error objects', () => {
      const error = new Error('Test error');
      logger.error('Error occurred:', error);
      expect(consoleErrorSpy).toHaveBeenCalledWith('Error occurred:', error);
    });

    test('should only log errors when level is error', () => {
      process.env.LOG_LEVEL = 'error';

      logger.debug('debug');
      logger.info('info');
      logger.warn('warn');
      logger.error('error');

      expect(consoleLogSpy).not.toHaveBeenCalled();
      expect(consoleWarnSpy).not.toHaveBeenCalled();
      expect(consoleErrorSpy).toHaveBeenCalledWith('error');
    });
  });

  describe('Log Level Filtering', () => {
    test('debug level should log all levels', () => {
      process.env.LOG_LEVEL = 'debug';

      logger.debug('debug');
      logger.info('info');
      logger.warn('warn');
      logger.error('error');

      expect(consoleLogSpy).toHaveBeenCalledTimes(2); // debug + info
      expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    });

    test('info level should log info, warn, error', () => {
      process.env.LOG_LEVEL = 'info';

      logger.debug('debug');
      logger.info('info');
      logger.warn('warn');
      logger.error('error');

      expect(consoleLogSpy).toHaveBeenCalledTimes(1); // info only
      expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    });

    test('warn level should log warn and error only', () => {
      process.env.LOG_LEVEL = 'warn';

      logger.debug('debug');
      logger.info('info');
      logger.warn('warn');
      logger.error('error');

      expect(consoleLogSpy).not.toHaveBeenCalled();
      expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    });

    test('error level should log errors only', () => {
      process.env.LOG_LEVEL = 'error';

      logger.debug('debug');
      logger.info('info');
      logger.warn('warn');
      logger.error('error');

      expect(consoleLogSpy).not.toHaveBeenCalled();
      expect(consoleWarnSpy).not.toHaveBeenCalled();
      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('Production Usage', () => {
    test('should reduce noise in production with error level', () => {
      process.env.LOG_LEVEL = 'error';

      // Simulate typical application flow
      logger.debug('Loading configuration...');
      logger.info('Server starting on port 3030');
      logger.info('Connected to database');
      logger.warn('Deprecated API used');
      logger.error('Failed to connect to external service');

      // Only error should be logged
      expect(consoleLogSpy).not.toHaveBeenCalled();
      expect(consoleWarnSpy).not.toHaveBeenCalled();
      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('Development Usage', () => {
    test('should show all logs in development with debug level', () => {
      process.env.LOG_LEVEL = 'debug';

      logger.debug('Detailed debugging info');
      logger.info('Application event');
      logger.warn('Something to watch');
      logger.error('Critical error');

      expect(consoleLogSpy).toHaveBeenCalledTimes(2);
      expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('Special Characters and Formatting', () => {
    test('should handle emoji and special characters', () => {
      logger.info('🚀 Server started successfully');
      expect(consoleLogSpy).toHaveBeenCalledWith('🚀 Server started successfully');
    });

    test('should handle multiline messages', () => {
      const message = 'Line 1\nLine 2\nLine 3';
      logger.info(message);
      expect(consoleLogSpy).toHaveBeenCalledWith(message);
    });

    test('should handle template literals', () => {
      const port = 3030;
      logger.info(`Server listening on port ${port}`);
      expect(consoleLogSpy).toHaveBeenCalledWith('Server listening on port 3030');
    });
  });
});
