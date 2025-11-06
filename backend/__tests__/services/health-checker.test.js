/**
 * Tests for Health Checker Service
 */

import { jest } from '@jest/globals';
import { HealthChecker } from '../../services/health-checker.js';

// Mock fetch globally
global.fetch = jest.fn();

describe('HealthChecker', () => {
  let healthChecker;
  let mockDb;
  let mockConversationSyncs;

  beforeEach(() => {
    mockDb = {
      prepareStatement: jest.fn()
    };

    mockConversationSyncs = new Map();

    healthChecker = new HealthChecker('http://localhost:3030', mockDb, mockConversationSyncs);

    // Clear fetch mock
    global.fetch.mockClear();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Constructor', () => {
    test('should initialize with default baseUrl', () => {
      const checker = new HealthChecker();
      expect(checker.baseUrl).toBe('http://localhost:3030');
      expect(checker.results).toEqual([]);
    });

    test('should initialize with custom baseUrl', () => {
      const checker = new HealthChecker('http://example.com:4000');
      expect(checker.baseUrl).toBe('http://example.com:4000');
    });

    test('should store db and conversationSyncs references', () => {
      expect(healthChecker.db).toBe(mockDb);
      expect(healthChecker.conversationSyncs).toBe(mockConversationSyncs);
    });
  });

  describe('checkEndpoint()', () => {
    test('should successfully check a healthy endpoint', async () => {
      global.fetch.mockResolvedValue({
        ok: true,
        json: async () => ({ status: 'ok' })
      });

      const result = await healthChecker.checkEndpoint('/api/health');

      expect(result).toEqual({ status: 'ok' });
      expect(global.fetch).toHaveBeenCalledWith('http://localhost:3030/api/health', {
        method: 'GET',
        headers: { Accept: 'application/json' }
      });
    });

    test('should throw error on non-200 response', async () => {
      global.fetch.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error'
      });

      await expect(healthChecker.checkEndpoint('/api/health')).rejects.toThrow(
        'HTTP 500: Internal Server Error'
      );
    });

    test('should throw error if response contains error field', async () => {
      global.fetch.mockResolvedValue({
        ok: true,
        json: async () => ({ error: 'Database connection failed' })
      });

      await expect(healthChecker.checkEndpoint('/api/health')).rejects.toThrow(
        'Database connection failed'
      );
    });

    test('should throw error if response message includes "not available"', async () => {
      global.fetch.mockResolvedValue({
        ok: true,
        json: async () => ({ message: 'Service not available' })
      });

      await expect(healthChecker.checkEndpoint('/api/health')).rejects.toThrow(
        'Service not available'
      );
    });

    test('should handle fetch errors', async () => {
      global.fetch.mockRejectedValue(new Error('Network error'));

      await expect(healthChecker.checkEndpoint('/api/health')).rejects.toThrow('Network error');
    });
  });

  describe('checkConversationFreshness()', () => {
    test('should handle no conversations (new installation)', async () => {
      const mockStmt = {
        get: jest.fn().mockReturnValue(null)
      };
      mockDb.prepareStatement.mockReturnValue(mockStmt);

      await expect(healthChecker.checkConversationFreshness()).resolves.toBeUndefined();
      expect(mockDb.prepareStatement).toHaveBeenCalled();
    });

    test('should pass for fresh conversations', async () => {
      const recentTime = new Date(Date.now() - 1000 * 60 * 30); // 30 minutes ago
      const mockStmt = {
        get: jest.fn().mockReturnValue({
          timestamp: recentTime.toISOString(),
          event_type: 'user_message'
        })
      };
      mockDb.prepareStatement.mockReturnValue(mockStmt);

      await expect(healthChecker.checkConversationFreshness()).resolves.toBeUndefined();
    });

    test('should throw error for stale conversations', async () => {
      const staleTime = new Date(Date.now() - 1000 * 60 * 60 * 30); // 30 hours ago
      const mockStmt = {
        get: jest.fn().mockReturnValue({
          timestamp: staleTime.toISOString(),
          event_type: 'user_message'
        })
      };
      mockDb.prepareStatement.mockReturnValue(mockStmt);

      await expect(healthChecker.checkConversationFreshness()).rejects.toThrow(
        /Stale conversation data/
      );
    });

    test('should throw error when database not available', async () => {
      const checkerNoDb = new HealthChecker('http://localhost:3030', null);

      await expect(checkerNoDb.checkConversationFreshness()).rejects.toThrow(
        'Database not available for data freshness check'
      );
    });
  });

  describe('checkConversationSyncActive()', () => {
    test('should handle no syncs (no projects started)', async () => {
      await expect(healthChecker.checkConversationSyncActive()).resolves.toBeUndefined();
    });

    test('should pass when syncs are running', async () => {
      const mockSync = {
        getStatus: jest.fn().mockReturnValue({ running: true })
      };
      mockConversationSyncs.set('project1', mockSync);

      await expect(healthChecker.checkConversationSyncActive()).resolves.toBeUndefined();
      expect(mockSync.getStatus).toHaveBeenCalled();
    });

    test('should throw error when syncs exist but none running', async () => {
      const mockSync = {
        getStatus: jest.fn().mockReturnValue({ running: false })
      };
      mockConversationSyncs.set('project1', mockSync);

      await expect(healthChecker.checkConversationSyncActive()).rejects.toThrow(
        '1 conversation sync(s) registered but none running'
      );
    });

    test('should throw error when conversationSyncs not available', async () => {
      const checkerNoSyncs = new HealthChecker('http://localhost:3030', mockDb, null);

      await expect(checkerNoSyncs.checkConversationSyncActive()).rejects.toThrow(
        'Conversation sync tracking not available'
      );
    });

    test('should handle mixed running/stopped syncs', async () => {
      const runningSyne = {
        getStatus: jest.fn().mockReturnValue({ running: true })
      };
      const stoppedSync = {
        getStatus: jest.fn().mockReturnValue({ running: false })
      };

      mockConversationSyncs.set('project1', runningSync);
      mockConversationSyncs.set('project2', stoppedSync);

      await expect(healthChecker.checkConversationSyncActive()).resolves.toBeUndefined();
    });
  });

  describe('runAll()', () => {
    beforeEach(() => {
      // Mock successful responses for all endpoints
      global.fetch.mockImplementation(url => {
        return Promise.resolve({
          ok: true,
          json: async () => ({ status: 'ok', data: [] })
        });
      });
    });

    test('should run all health checks', async () => {
      const result = await healthChecker.runAll();

      expect(result).toMatchObject({
        total: expect.any(Number),
        passed: expect.any(Number),
        failed: expect.any(Number),
        criticalFailed: expect.any(Number),
        warnings: expect.any(Number),
        results: expect.any(Array),
        healthy: expect.any(Boolean)
      });

      expect(result.total).toBeGreaterThan(15); // Should have many checks
    });

    test('should mark system as healthy when no critical failures', async () => {
      const result = await healthChecker.runAll();

      expect(result.healthy).toBe(true);
      expect(result.criticalFailed).toBe(0);
    });

    test('should mark system as unhealthy when critical checks fail', async () => {
      // Mock critical endpoint failure
      global.fetch.mockImplementation(url => {
        if (url.includes('/api/health')) {
          return Promise.resolve({
            ok: false,
            status: 500,
            statusText: 'Internal Server Error'
          });
        }
        return Promise.resolve({
          ok: true,
          json: async () => ({ status: 'ok' })
        });
      });

      const result = await healthChecker.runAll();

      expect(result.healthy).toBe(false);
      expect(result.criticalFailed).toBeGreaterThan(0);
    });

    test('should include warnings for non-critical failures', async () => {
      // Mock non-critical endpoint failure
      global.fetch.mockImplementation(url => {
        if (url.includes('/api/dashboard-stats')) {
          return Promise.resolve({
            ok: false,
            status: 500,
            statusText: 'Error'
          });
        }
        return Promise.resolve({
          ok: true,
          json: async () => ({ status: 'ok' })
        });
      });

      const result = await healthChecker.runAll();

      expect(result.warnings).toBeGreaterThan(0);
      expect(result.healthy).toBe(true); // Still healthy (non-critical)
    });

    test('should store results with duration', async () => {
      const result = await healthChecker.runAll();

      expect(result.results.length).toBeGreaterThan(0);
      result.results.forEach(check => {
        expect(check).toMatchObject({
          name: expect.any(String),
          status: expect.stringMatching(/passed|failed/),
          critical: expect.any(Boolean),
          duration: expect.any(Number),
          error: expect.anything()
        });
      });
    });

    test('should run checks in parallel', async () => {
      const startTime = Date.now();
      await healthChecker.runAll();
      const duration = Date.now() - startTime;

      // If run sequentially, would take much longer
      // Parallel execution should be < 1 second with mocks
      expect(duration).toBeLessThan(1000);
    });
  });

  describe('getResults()', () => {
    test('should return empty results initially', () => {
      expect(healthChecker.getResults()).toEqual([]);
    });

    test('should return results after runAll', async () => {
      global.fetch.mockResolvedValue({
        ok: true,
        json: async () => ({ status: 'ok' })
      });

      await healthChecker.runAll();
      const results = healthChecker.getResults();

      expect(results.length).toBeGreaterThan(0);
      expect(Array.isArray(results)).toBe(true);
    });
  });

  describe('isHealthy()', () => {
    test('should return true when no critical failures', async () => {
      global.fetch.mockResolvedValue({
        ok: true,
        json: async () => ({ status: 'ok' })
      });

      await healthChecker.runAll();

      expect(healthChecker.isHealthy()).toBe(true);
    });

    test('should return false when critical failures exist', async () => {
      // Mock critical failure
      global.fetch.mockImplementation(url => {
        if (url.includes('/api/session-id')) {
          return Promise.resolve({
            ok: false,
            status: 500,
            statusText: 'Error'
          });
        }
        return Promise.resolve({
          ok: true,
          json: async () => ({ status: 'ok' })
        });
      });

      await healthChecker.runAll();

      expect(healthChecker.isHealthy()).toBe(false);
    });

    test('should return true even with non-critical failures', async () => {
      // Mock non-critical failure
      global.fetch.mockImplementation(url => {
        if (url.includes('/api/dashboard-stats')) {
          return Promise.resolve({
            ok: false,
            status: 500,
            statusText: 'Error'
          });
        }
        return Promise.resolve({
          ok: true,
          json: async () => ({ status: 'ok' })
        });
      });

      await healthChecker.runAll();

      expect(healthChecker.isHealthy()).toBe(true); // Non-critical failure doesn't affect health
    });
  });

  describe('Check Categories', () => {
    test('should include critical checks', async () => {
      global.fetch.mockResolvedValue({
        ok: true,
        json: async () => ({ status: 'ok' })
      });

      await healthChecker.runAll();
      const criticalChecks = healthChecker.results.filter(r => r.critical);

      expect(criticalChecks.length).toBeGreaterThan(0);
      expect(criticalChecks.some(c => c.name.includes('Health Endpoint'))).toBe(true);
      expect(criticalChecks.some(c => c.name.includes('Session ID'))).toBe(true);
    });

    test('should include non-critical checks', async () => {
      global.fetch.mockResolvedValue({
        ok: true,
        json: async () => ({ status: 'ok' })
      });

      await healthChecker.runAll();
      const nonCriticalChecks = healthChecker.results.filter(r => !r.critical);

      expect(nonCriticalChecks.length).toBeGreaterThan(0);
      expect(nonCriticalChecks.some(c => c.name.includes('Dashboard'))).toBe(true);
    });
  });
});
