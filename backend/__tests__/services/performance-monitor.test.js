/**
 * Tests for PerformanceMonitor
 */

import { jest } from '@jest/globals';
import { PerformanceMonitor } from '../../services/performance-monitor.js';

describe('PerformanceMonitor', () => {
  let monitor;
  let mockIO;

  beforeEach(() => {
    mockIO = {
      emit: jest.fn()
    };

    monitor = new PerformanceMonitor({
      io: mockIO,
      interval: 100 // Short interval for testing
    });
  });

  afterEach(() => {
    if (monitor) {
      monitor.stop();
    }
  });

  describe('Initialization', () => {
    test('should initialize with default config', () => {
      expect(monitor.isRunning).toBe(false);
      expect(monitor.interval).toBe(100);
      expect(monitor.thresholds).toBeDefined();
    });

    test('should initialize with custom thresholds', () => {
      const customMonitor = new PerformanceMonitor({
        memoryCritical: 95,
        memoryWarning: 90,
        heapWarning: 85
      });

      expect(customMonitor.thresholds.memory.critical).toBe(95);
      expect(customMonitor.thresholds.memory.warning).toBe(90);
      expect(customMonitor.thresholds.heap.warning).toBe(85);

      customMonitor.stop();
    });

    test('should set IO instance', () => {
      const io = { emit: jest.fn() };
      monitor.setIO(io);
      expect(monitor.io).toBe(io);
    });
  });

  describe('Monitoring', () => {
    test('should start monitoring', () => {
      monitor.start();
      expect(monitor.isRunning).toBe(true);
      expect(monitor.intervalId).not.toBeNull();
    });

    test('should not start if already running', () => {
      monitor.start();
      const firstIntervalId = monitor.intervalId;

      monitor.start(); // Try starting again
      expect(monitor.intervalId).toBe(firstIntervalId);
    });

    test('should stop monitoring', () => {
      monitor.start();
      monitor.stop();

      expect(monitor.isRunning).toBe(false);
      expect(monitor.intervalId).toBeNull();
    });

    test('should handle stop when not running', () => {
      expect(() => monitor.stop()).not.toThrow();
    });
  });

  describe('Memory Usage', () => {
    test('should get current memory usage', () => {
      const usage = monitor.getMemoryUsage();

      expect(usage).toHaveProperty('heapUsed');
      expect(usage).toHaveProperty('heapTotal');
      expect(usage).toHaveProperty('heapPercent');
      expect(usage).toHaveProperty('rss');
      expect(usage).toHaveProperty('external');

      expect(typeof usage.heapUsed).toBe('number');
      expect(typeof usage.heapPercent).toBe('string');
    });
  });

  describe('Statistics', () => {
    test('should return monitoring stats', () => {
      const stats = monitor.getStats();

      expect(stats).toHaveProperty('checksPerformed');
      expect(stats).toHaveProperty('alertsEmitted');
      expect(stats).toHaveProperty('isRunning');
      expect(stats).toHaveProperty('interval');
      expect(stats).toHaveProperty('thresholds');
      expect(stats).toHaveProperty('currentMemory');
    });

    test('should track check count', () => {
      expect(monitor.stats.checksPerformed).toBe(0);

      monitor.stats.checksPerformed = 5;
      const stats = monitor.getStats();
      expect(stats.checksPerformed).toBe(5);
    });

    test('should reset stats', () => {
      monitor.stats.checksPerformed = 10;
      monitor.stats.alertsEmitted = 5;

      monitor.resetStats();

      expect(monitor.stats.checksPerformed).toBe(0);
      expect(monitor.stats.alertsEmitted).toBe(0);
      expect(monitor.stats.lastCheck).toBeNull();
      expect(monitor.stats.lastAlert).toBeNull();
    });
  });

  describe('Thresholds', () => {
    test('should update thresholds', () => {
      monitor.updateThresholds({
        memory: { critical: 95, warning: 88 }
      });

      expect(monitor.thresholds.memory.critical).toBe(95);
      expect(monitor.thresholds.memory.warning).toBe(88);
    });

    test('should preserve existing thresholds when updating', () => {
      const originalHeapWarning = monitor.thresholds.heap.warning;

      monitor.updateThresholds({
        memory: { critical: 95 }
      });

      expect(monitor.thresholds.heap.warning).toBe(originalHeapWarning);
    });
  });

  describe('Alerts', () => {
    test('should emit alert with correct structure', () => {
      const alert = {
        type: 'memory',
        severity: 'warning',
        title: 'Test Alert',
        message: 'Test message',
        value: '85.5'
      };

      monitor.emitAlert(alert);

      expect(monitor.stats.alertsEmitted).toBe(1);
      expect(monitor.stats.lastAlert).toMatchObject(alert);
      expect(monitor.stats.lastAlert).toHaveProperty('timestamp');
    });

    test('should emit alert via WebSocket', () => {
      const alert = {
        type: 'heap',
        severity: 'critical',
        title: 'Critical Heap',
        message: 'Heap usage too high',
        value: '95.0'
      };

      monitor.emitAlert(alert);

      expect(mockIO.emit).toHaveBeenCalledWith('performance-alert', alert);
    });

    test('should increment alert count', () => {
      expect(monitor.stats.alertsEmitted).toBe(0);

      monitor.emitAlert({
        type: 'memory',
        severity: 'warning',
        title: 'Test',
        message: 'Test',
        value: '90'
      });

      expect(monitor.stats.alertsEmitted).toBe(1);
    });
  });

  describe('Force Check', () => {
    test('should perform immediate check', () => {
      const stats = monitor.checkNow();

      expect(stats).toBeDefined();
      expect(stats.checksPerformed).toBeGreaterThan(0);
      expect(stats.lastCheck).not.toBeNull();
    });
  });
});
