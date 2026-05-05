/**
 * Tests for Monitoring Service
 */

import { jest } from '@jest/globals';
import { MonitoringService } from '../../dist/services/monitoring.js';

describe('MonitoringService', () => {
  let service;
  let mockIo;

  beforeEach(() => {
    mockIo = {
      emit: jest.fn()
    };

    service = new MonitoringService({
      io: mockIo,
      errorRateThreshold: 5,
      memoryPercentThreshold: 85,
      cpuPercentThreshold: 80,
      watcherFailuresThreshold: 3
    });

    jest.useFakeTimers();
  });

  afterEach(() => {
    service.stop();
    jest.useRealTimers();
  });

  describe('Constructor', () => {
    test('should initialize with default thresholds', () => {
      const defaultService = new MonitoringService();
      expect(defaultService.alertThresholds.errorRate).toBe(10);
      expect(defaultService.alertThresholds.memoryPercent).toBe(85);
      expect(defaultService.alertThresholds.cpuPercent).toBe(80);
      expect(defaultService.alertThresholds.watcherFailures).toBe(3);
    });

    test('should initialize with custom thresholds', () => {
      expect(service.alertThresholds.errorRate).toBe(5);
      expect(service.alertThresholds.memoryPercent).toBe(85);
    });

    test('should initialize metrics structure', () => {
      expect(service.metrics.errors).toEqual([]);
      expect(service.metrics.warnings).toEqual([]);
      expect(service.metrics.memory).toEqual([]);
      expect(service.metrics.cpu).toEqual([]);
      expect(service.metrics.watcherHealth).toBeInstanceOf(Map);
      expect(service.metrics.websocketConnections).toBe(0);
      expect(service.metrics.dbOperations).toEqual({
        reads: 0,
        writes: 0,
        errors: 0
      });
    });
  });

  describe('start() and stop()', () => {
    test('should start monitoring intervals', () => {
      service.start();
      expect(service.intervals.length).toBe(3);
    });

    test('should stop all monitoring intervals', () => {
      service.start();
      const clearIntervalSpy = jest.spyOn(global, 'clearInterval');

      service.stop();

      expect(service.intervals.length).toBe(0);
      expect(clearIntervalSpy).toHaveBeenCalledTimes(3);

      clearIntervalSpy.mockRestore();
    });

    test('should call monitoring functions at correct intervals', () => {
      const checkErrorRateSpy = jest.spyOn(service, 'checkErrorRate');
      const checkResourceUsageSpy = jest.spyOn(service, 'checkResourceUsage');
      const checkWatcherHealthSpy = jest.spyOn(service, 'checkWatcherHealth');

      service.start();

      // Advance time by 1 minute
      jest.advanceTimersByTime(60000);
      expect(checkErrorRateSpy).toHaveBeenCalledTimes(1);

      // Advance time by 30 seconds
      jest.advanceTimersByTime(30000);
      expect(checkResourceUsageSpy).toHaveBeenCalledTimes(3); // 30s, 60s, 90s

      // Advance time by 2 minutes
      jest.advanceTimersByTime(120000);
      expect(checkWatcherHealthSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('recordError()', () => {
    test('should record an error', () => {
      const error = new Error('Test error');
      const context = { file: 'test.js' };

      service.recordError(error, context);

      expect(service.metrics.errors).toHaveLength(1);
      expect(service.metrics.errors[0]).toMatchObject({
        message: 'Test error',
        stack: expect.any(String),
        context
      });
      expect(service.metrics.errors[0].timestamp).toBeGreaterThan(0);
    });

    test('should emit error to frontend via WebSocket', () => {
      const error = new Error('Test error');

      service.recordError(error, { file: 'test.js' });

      expect(mockIo.emit).toHaveBeenCalledWith('monitoring-error', {
        timestamp: expect.any(Number),
        message: 'Test error',
        context: { file: 'test.js' }
      });
    });

    test('should handle non-Error objects', () => {
      service.recordError('String error');

      expect(service.metrics.errors[0].message).toBe('String error');
      expect(service.metrics.errors[0].stack).toBeUndefined();
    });

    test('should keep only last hour of errors', () => {
      // Record old error
      const oldError = {
        timestamp: Date.now() - 4000000, // 66 minutes ago
        message: 'Old error',
        context: {}
      };
      service.metrics.errors.push(oldError);

      // Record new error
      service.recordError(new Error('New error'));

      expect(service.metrics.errors).toHaveLength(1);
      expect(service.metrics.errors[0].message).toBe('New error');
    });

    test('should work without io', () => {
      const noIoService = new MonitoringService();
      expect(() => {
        noIoService.recordError(new Error('Test'));
      }).not.toThrow();
    });
  });

  describe('recordWarning()', () => {
    test('should record a warning', () => {
      const message = 'Test warning';
      const context = { component: 'watcher' };

      service.recordWarning(message, context);

      expect(service.metrics.warnings).toHaveLength(1);
      expect(service.metrics.warnings[0]).toMatchObject({
        message,
        context,
        timestamp: expect.any(Number)
      });
    });

    test('should keep only last hour of warnings', () => {
      // Record old warning
      const oldWarning = {
        timestamp: Date.now() - 4000000, // 66 minutes ago
        message: 'Old warning',
        context: {}
      };
      service.metrics.warnings.push(oldWarning);

      // Record new warning
      service.recordWarning('New warning');

      expect(service.metrics.warnings).toHaveLength(1);
      expect(service.metrics.warnings[0].message).toBe('New warning');
    });
  });

  describe('checkErrorRate()', () => {
    test('should alert on high error rate', () => {
      // Record 5 errors in the last minute
      for (let i = 0; i < 5; i++) {
        service.recordError(new Error(`Error ${i}`));
      }

      service.checkErrorRate();

      expect(mockIo.emit).toHaveBeenCalledWith('monitoring-alert', {
        type: 'error-rate',
        severity: 'high',
        message: '5 errors in last minute',
        threshold: 5
      });
    });

    test('should not alert when error rate is below threshold', () => {
      // Clear previous emit calls
      mockIo.emit.mockClear();

      // Record 3 errors (below threshold of 5)
      for (let i = 0; i < 3; i++) {
        service.recordError(new Error(`Error ${i}`));
      }

      service.checkErrorRate();

      expect(mockIo.emit).not.toHaveBeenCalledWith(
        'monitoring-alert',
        expect.objectContaining({ type: 'error-rate' })
      );
    });

    test('should only count recent errors', () => {
      mockIo.emit.mockClear();

      // Add old error
      service.metrics.errors.push({
        timestamp: Date.now() - 120000, // 2 minutes ago
        message: 'Old error',
        context: {}
      });

      // Add recent errors
      for (let i = 0; i < 3; i++) {
        service.recordError(new Error(`Error ${i}`));
      }

      service.checkErrorRate();

      // Should not alert (only 3 recent errors)
      expect(mockIo.emit).not.toHaveBeenCalledWith(
        'monitoring-alert',
        expect.objectContaining({ type: 'error-rate' })
      );
    });
  });

  describe('checkResourceUsage()', () => {
    test('should record memory metrics', () => {
      service.checkResourceUsage();

      expect(service.metrics.memory).toHaveLength(1);
      expect(service.metrics.memory[0]).toMatchObject({
        timestamp: expect.any(Number),
        process: expect.any(Number),
        system: expect.any(Number)
      });
    });

    test('should keep only last 100 memory samples', () => {
      // Add 100 samples
      for (let i = 0; i < 100; i++) {
        service.checkResourceUsage();
      }

      expect(service.metrics.memory).toHaveLength(100);

      // Add one more
      service.checkResourceUsage();

      expect(service.metrics.memory).toHaveLength(100);
    });

    test('should alert on high memory usage', () => {
      // Mock high memory usage
      const originalTotalmem = jest.spyOn(require('os'), 'totalmem');
      const originalFreemem = jest.spyOn(require('os'), 'freemem');

      originalTotalmem.mockReturnValue(1000000000); // 1GB
      originalFreemem.mockReturnValue(100000000); // 100MB (90% used)

      mockIo.emit.mockClear();
      service.checkResourceUsage();

      expect(mockIo.emit).toHaveBeenCalledWith('monitoring-alert', {
        type: 'memory',
        severity: 'high',
        value: expect.any(Number),
        threshold: 85
      });

      originalTotalmem.mockRestore();
      originalFreemem.mockRestore();
    });
  });

  describe('Watcher Health', () => {
    test('should record watcher failure', () => {
      service.recordWatcherFailure('project-watcher');

      const health = service.metrics.watcherHealth.get('project-watcher');
      expect(health).toBeDefined();
      expect(health.failures).toBe(1);
      expect(health.lastFailure).toBeGreaterThan(0);
    });

    test('should increment failure count', () => {
      service.recordWatcherFailure('project-watcher');
      service.recordWatcherFailure('project-watcher');

      const health = service.metrics.watcherHealth.get('project-watcher');
      expect(health.failures).toBe(2);
    });

    test('should record watcher recovery', () => {
      service.recordWatcherFailure('project-watcher');
      service.recordWatcherRecovery('project-watcher');

      const health = service.metrics.watcherHealth.get('project-watcher');
      expect(health.failures).toBe(0);
    });

    test('should handle recovery for non-existent watcher', () => {
      expect(() => {
        service.recordWatcherRecovery('nonexistent-watcher');
      }).not.toThrow();
    });

    test('should alert on watcher health check', () => {
      // Record failures for a watcher
      for (let i = 0; i < 3; i++) {
        service.recordWatcherFailure('failing-watcher');
      }

      mockIo.emit.mockClear();
      service.checkWatcherHealth();

      expect(mockIo.emit).toHaveBeenCalledWith('monitoring-alert', {
        type: 'watcher-health',
        severity: 'medium',
        failedWatchers: 1,
        threshold: 3
      });
    });

    test('should not alert when no watchers have failures', () => {
      mockIo.emit.mockClear();
      service.checkWatcherHealth();

      expect(mockIo.emit).not.toHaveBeenCalledWith(
        'monitoring-alert',
        expect.objectContaining({ type: 'watcher-health' })
      );
    });
  });

  describe('Database Operations', () => {
    test('should record database reads', () => {
      service.recordDbOperation('read');
      service.recordDbOperation('read');

      expect(service.metrics.dbOperations.reads).toBe(2);
    });

    test('should record database writes', () => {
      service.recordDbOperation('write');
      service.recordDbOperation('write');
      service.recordDbOperation('write');

      expect(service.metrics.dbOperations.writes).toBe(3);
    });

    test('should record database errors', () => {
      service.recordDbOperation('error');

      expect(service.metrics.dbOperations.errors).toBe(1);
    });

    test('should handle unknown operation types', () => {
      service.recordDbOperation('unknown');

      expect(service.metrics.dbOperations.reads).toBe(0);
      expect(service.metrics.dbOperations.writes).toBe(0);
      expect(service.metrics.dbOperations.errors).toBe(0);
    });
  });

  describe('WebSocket Connections', () => {
    test('should update WebSocket connection count', () => {
      service.updateWebSocketCount(5);

      expect(service.metrics.websocketConnections).toBe(5);
    });

    test('should update multiple times', () => {
      service.updateWebSocketCount(5);
      service.updateWebSocketCount(10);
      service.updateWebSocketCount(3);

      expect(service.metrics.websocketConnections).toBe(3);
    });
  });

  describe('getMetrics()', () => {
    test('should return comprehensive metrics', () => {
      // Add some test data
      service.recordError(new Error('Test error'));
      service.recordWarning('Test warning');
      service.recordDbOperation('read');
      service.recordDbOperation('write');
      service.recordWatcherFailure('test-watcher');
      service.updateWebSocketCount(5);

      const metrics = service.getMetrics();

      expect(metrics).toMatchObject({
        uptime: expect.any(Number),
        errorCount: 1,
        recentErrorCount: 1,
        warningCount: 1,
        dbOperations: {
          reads: 1,
          writes: 1,
          errors: 0
        },
        websocketConnections: 5,
        watcherHealth: [
          {
            name: 'test-watcher',
            failures: 1,
            lastFailure: expect.any(Number)
          }
        ]
      });
    });

    test('should calculate recent error count correctly', () => {
      // Add old error (6 minutes ago)
      service.metrics.errors.push({
        timestamp: Date.now() - 360000,
        message: 'Old error',
        context: {}
      });

      // Add recent error
      service.recordError(new Error('Recent error'));

      const metrics = service.getMetrics();

      expect(metrics.errorCount).toBe(2); // Total
      expect(metrics.recentErrorCount).toBe(1); // Last 5 minutes
    });

    test('should return empty watcher health when no watchers', () => {
      const metrics = service.getMetrics();

      expect(metrics.watcherHealth).toEqual([]);
    });
  });
});
