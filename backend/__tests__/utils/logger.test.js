/**
 * Tests for Logger Utility
 * Tests Winston-based logging system
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

      logger.debug('debug message');
      logger.info('info message');

      // With Winston, output includes timestamp and formatting
      // Just check that info was called and debug was not
      expect(consoleLogSpy).toHaveBeenCalled();
      const calls = consoleLogSpy.mock.calls.map(call => call[0]);
      const hasInfo = calls.some(call => call && call.includes('info message'));
      const hasDebug = calls.some(call => call && call.includes('debug message'));

      expect(hasInfo).toBe(true);
      expect(hasDebug).toBe(false);
    });
  });

  describe('Debug Level', () => {
    beforeEach(() => {
      process.env.LOG_LEVEL = 'debug';
    });

    test('should log debug messages', () => {
      logger.debug('test debug message');

      const calls = consoleLogSpy.mock.calls.map(call => call[0]);
      const hasDebugMessage = calls.some(call => call && call.includes('test debug message'));
      expect(hasDebugMessage).toBe(true);
    });

    test('should support metadata objects', () => {
      const meta = { key: 'value' };
      logger.debug('message with object', meta);

      const calls = consoleLogSpy.mock.calls.map(call => call[0]);
      const hasMessage = calls.some(call => call && call.includes('message with object'));
      expect(hasMessage).toBe(true);
    });
  });

  describe('Info Level', () => {
    test('should log info messages', () => {
      logger.info('test info message');

      const calls = consoleLogSpy.mock.calls.map(call => call[0]);
      const hasInfoMessage = calls.some(call => call && call.includes('test info message'));
      expect(hasInfoMessage).toBe(true);
    });

    test('should support metadata', () => {
      const data = { count: 5 };
      logger.info('Processing items', data);

      const calls = consoleLogSpy.mock.calls.map(call => call[0]);
      const hasMessage = calls.some(call => call && call.includes('Processing items'));
      expect(hasMessage).toBe(true);
    });

    test('should not log debug when level is info', () => {
      process.env.LOG_LEVEL = 'info';

      logger.debug('debug message');
      logger.info('info message');

      const calls = consoleLogSpy.mock.calls.map(call => call[0]);
      const hasDebug = calls.some(call => call && call.includes('debug message'));
      const hasInfo = calls.some(call => call && call.includes('info message'));

      expect(hasDebug).toBe(false);
      expect(hasInfo).toBe(true);
    });
  });

  describe('Warn Level', () => {
    test('should log warn messages', () => {
      logger.warn('test warning');

      const calls = consoleLogSpy.mock.calls.map(call => call[0]);
      const hasWarning = calls.some(call => call && call.includes('test warning'));
      expect(hasWarning).toBe(true);
    });

    test('should support metadata', () => {
      const err = { message: 'Something wrong' };
      logger.warn('Warning occurred', err);

      const calls = consoleLogSpy.mock.calls.map(call => call[0]);
      const hasWarning = calls.some(call => call && call.includes('Warning occurred'));
      expect(hasWarning).toBe(true);
    });

    test('should not log info/debug when level is warn', () => {
      process.env.LOG_LEVEL = 'warn';

      logger.debug('debug');
      logger.info('info');
      logger.warn('warn');

      const calls = consoleLogSpy.mock.calls.map(call => call[0]);
      const hasWarn = calls.some(call => call && call.includes('warn'));
      const hasDebug = calls.some(call => call && call.includes('debug'));
      const hasInfo = calls.some(call => call && call.includes('info'));

      expect(hasWarn).toBe(true);
      expect(hasDebug).toBe(false);
      expect(hasInfo).toBe(false);
    });
  });

  describe('Error Level', () => {
    test('should log error messages', () => {
      logger.error('test error');

      const calls = consoleLogSpy.mock.calls.map(call => call[0]);
      const hasError = calls.some(call => call && call.includes('test error'));
      expect(hasError).toBe(true);
    });

    test('should support error objects', () => {
      const error = { message: 'Test error', stack: 'stack trace' };
      logger.error('Error occurred:', error);

      const calls = consoleLogSpy.mock.calls.map(call => call[0]);
      const hasError = calls.some(call => call && call.includes('Error occurred:'));
      expect(hasError).toBe(true);
    });

    test('should only log errors when level is error', () => {
      process.env.LOG_LEVEL = 'error';

      logger.debug('debug');
      logger.info('info');
      logger.warn('warn');
      logger.error('error');

      const calls = consoleLogSpy.mock.calls.map(call => call[0]);
      const hasError = calls.some(call => call && call.includes('error'));
      const hasOthers = calls.some(call => call && (call.includes('debug') || call.includes('info') || call.includes('warn')));

      expect(hasError).toBe(true);
      expect(hasOthers).toBe(false);
    });
  });

  describe('Log Level Filtering', () => {
    test('debug level should log all levels', () => {
      process.env.LOG_LEVEL = 'debug';

      logger.debug('debug');
      logger.info('info');
      logger.warn('warn');
      logger.error('error');

      // Console should have been called (exact count varies with Winston)
      expect(consoleLogSpy).toHaveBeenCalled();

      const calls = consoleLogSpy.mock.calls.map(call => call[0]);
      const hasDebug = calls.some(call => call && call.includes('debug'));
      const hasInfo = calls.some(call => call && call.includes('info'));
      const hasWarn = calls.some(call => call && call.includes('warn'));
      const hasError = calls.some(call => call && call.includes('error'));

      expect(hasDebug).toBe(true);
      expect(hasInfo).toBe(true);
      expect(hasWarn).toBe(true);
      expect(hasError).toBe(true);
    });

    test('info level should log info, warn, error', () => {
      process.env.LOG_LEVEL = 'info';

      logger.debug('debug');
      logger.info('info');
      logger.warn('warn');
      logger.error('error');

      const calls = consoleLogSpy.mock.calls.map(call => call[0]);
      const hasDebug = calls.some(call => call && call.includes('debug'));
      const hasInfo = calls.some(call => call && call.includes('info'));
      const hasWarn = calls.some(call => call && call.includes('warn'));
      const hasError = calls.some(call => call && call.includes('error'));

      expect(hasDebug).toBe(false);
      expect(hasInfo).toBe(true);
      expect(hasWarn).toBe(true);
      expect(hasError).toBe(true);
    });

    test('warn level should log warn and error only', () => {
      process.env.LOG_LEVEL = 'warn';

      logger.debug('debug');
      logger.info('info');
      logger.warn('warn');
      logger.error('error');

      const calls = consoleLogSpy.mock.calls.map(call => call[0]);
      const hasDebug = calls.some(call => call && call.includes('debug'));
      const hasInfo = calls.some(call => call && call.includes('info'));
      const hasWarn = calls.some(call => call && call.includes('warn'));
      const hasError = calls.some(call => call && call.includes('error'));

      expect(hasDebug).toBe(false);
      expect(hasInfo).toBe(false);
      expect(hasWarn).toBe(true);
      expect(hasError).toBe(true);
    });

    test('error level should log errors only', () => {
      process.env.LOG_LEVEL = 'error';

      logger.debug('debug');
      logger.info('info');
      logger.warn('warn');
      logger.error('error');

      const calls = consoleLogSpy.mock.calls.map(call => call[0]);
      const hasDebug = calls.some(call => call && call.includes('debug'));
      const hasInfo = calls.some(call => call && call.includes('info'));
      const hasWarn = calls.some(call => call && call.includes('warn'));
      const hasError = calls.some(call => call && call.includes('error'));

      expect(hasDebug).toBe(false);
      expect(hasInfo).toBe(false);
      expect(hasWarn).toBe(false);
      expect(hasError).toBe(true);
    });
  });

  describe('Production Usage', () => {
    test('should reduce noise in production with error level', () => {
      process.env.LOG_LEVEL = 'error';
      process.env.NODE_ENV = 'production';

      logger.info('Server starting on port 3030');
      logger.warn('Deprecated API used');
      logger.error('Failed to connect to external service');

      const calls = consoleLogSpy.mock.calls.map(call => call[0]);
      const hasError = calls.some(call => call && call.includes('Failed to connect'));
      const hasInfo = calls.some(call => call && call.includes('Server starting'));

      expect(hasError).toBe(true);
      expect(hasInfo).toBe(false);
    });
  });

  describe('Development Usage', () => {
    test('should show all logs in development with debug level', () => {
      process.env.LOG_LEVEL = 'debug';
      process.env.NODE_ENV = 'development';

      logger.debug('Application event');
      logger.info('Something to watch');
      logger.warn('Warning');
      logger.error('Critical error');

      expect(consoleLogSpy).toHaveBeenCalled();

      const calls = consoleLogSpy.mock.calls.map(call => call[0]);
      const hasDebug = calls.some(call => call && call.includes('Application event'));
      const hasInfo = calls.some(call => call && call.includes('Something to watch'));

      expect(hasDebug).toBe(true);
      expect(hasInfo).toBe(true);
    });
  });

  describe('Special Characters and Formatting', () => {
    test('should handle emoji and special characters', () => {
      logger.info('🚀 Server started successfully');

      const calls = consoleLogSpy.mock.calls.map(call => call[0]);
      const hasEmoji = calls.some(call => call && call.includes('🚀'));
      expect(hasEmoji).toBe(true);
    });

    test('should handle multiline messages', () => {
      const message = 'Line 1\nLine 2\nLine 3';
      logger.info(message);

      const calls = consoleLogSpy.mock.calls.map(call => call[0]);
      const hasMessage = calls.some(call => call && call.includes('Line 1'));
      expect(hasMessage).toBe(true);
    });

    test('should handle template literals', () => {
      const port = 3030;
      logger.info(`Server listening on port ${port}`);

      const calls = consoleLogSpy.mock.calls.map(call => call[0]);
      const hasMessage = calls.some(call => call && call.includes('port 3030'));
      expect(hasMessage).toBe(true);
    });
  });
});
