/**
 * Frontend logger tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { logger, Logger, createLogger } from '../logger.js';

describe('Logger', () => {
  let consoleSpy;

  beforeEach(() => {
    consoleSpy = {
      log: vi.spyOn(console, 'log').mockImplementation(() => {}),
      error: vi.spyOn(console, 'error').mockImplementation(() => {}),
      warn: vi.spyOn(console, 'warn').mockImplementation(() => {})
    };
  });

  it('should create logger with context', () => {
    const testLogger = new Logger('Test');
    expect(testLogger.context).toBe('Test');
  });

  it('should log info messages', () => {
    logger.info('test message');
    expect(consoleSpy.log).toHaveBeenCalled();
  });

  it('should log error messages', () => {
    logger.error('error message');
    expect(consoleSpy.error).toHaveBeenCalled();
  });

  it('should log warning messages', () => {
    logger.warn('warning message');
    expect(consoleSpy.warn).toHaveBeenCalled();
  });

  it('should create child logger', () => {
    const child = logger.child('Child');
    expect(child.context).toContain('Child');
  });

  it('should create logger with factory function', () => {
    const customLogger = createLogger('Custom');
    expect(customLogger.context).toBe('Custom');
  });

  it('should handle group logging', () => {
    const groupSpy = vi.spyOn(console, 'group').mockImplementation(() => {});
    const groupEndSpy = vi.spyOn(console, 'groupEnd').mockImplementation(() => {});

    logger.group('Test Group', () => {
      logger.info('inside group');
    });

    expect(groupSpy).toHaveBeenCalled();
    expect(groupEndSpy).toHaveBeenCalled();
  });

  it('should time synchronous functions', () => {
    const timeSpy = vi.spyOn(console, 'time').mockImplementation(() => {});
    const timeEndSpy = vi.spyOn(console, 'timeEnd').mockImplementation(() => {});

    const result = logger.time('test timer', () => {
      return 42;
    });

    expect(result).toBe(42);
    expect(timeSpy).toHaveBeenCalled();
    expect(timeEndSpy).toHaveBeenCalled();
  });

  it('should time async functions', async () => {
    const timeSpy = vi.spyOn(console, 'time').mockImplementation(() => {});
    const timeEndSpy = vi.spyOn(console, 'timeEnd').mockImplementation(() => {});

    const result = await logger.timeAsync('async timer', async () => {
      return Promise.resolve(123);
    });

    expect(result).toBe(123);
    expect(timeSpy).toHaveBeenCalled();
    expect(timeEndSpy).toHaveBeenCalled();
  });
});
