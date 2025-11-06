/**
 * Tests for Startup Validator Service
 */

import { jest } from '@jest/globals';
import { StartupValidator } from '../../services/startup-validator.js';

// Mock fetch globally
global.fetch = jest.fn();

// Mock console methods to avoid cluttering test output
global.console = {
  log: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  debug: jest.fn()
};

describe('StartupValidator', () => {
  let validator;
  let mockDb;
  let mockConversationSyncs;

  beforeEach(() => {
    mockDb = {
      db: {
        prepare: jest.fn().mockReturnThis(),
        get: jest.fn()
      }
    };

    mockConversationSyncs = new Map();

    validator = new StartupValidator({
      backendUrl: 'http://localhost:3030',
      frontendUrl: 'http://localhost:5173',
      db: mockDb,
      conversationSyncs: mockConversationSyncs
    });

    // Clear mocks
    global.fetch.mockClear();
    global.console.log.mockClear();
  });

  describe('Constructor', () => {
    test('should initialize with default URLs', () => {
      const defaultValidator = new StartupValidator();
      expect(defaultValidator.backendUrl).toBe('http://localhost:3030');
      expect(defaultValidator.frontendUrl).toBe('http://localhost:5173');
    });

    test('should initialize with custom URLs', () => {
      expect(validator.backendUrl).toBe('http://localhost:3030');
      expect(validator.frontendUrl).toBe('http://localhost:5173');
    });

    test('should initialize results structure', () => {
      expect(validator.results).toEqual({
        backend: [],
        frontend: [],
        integration: [],
        components: [],
        userFlows: []
      });
    });

    test('should create a HealthChecker instance', () => {
      expect(validator.healthChecker).toBeDefined();
    });
  });

  describe('Backend Checks', () => {
    beforeEach(() => {
      global.fetch.mockResolvedValue({
        ok: true,
        json: async () => ({ status: 'ok' })
      });

      mockDb.db.get.mockReturnValue({ count: 0 });
    });

    test('should run all backend checks', async () => {
      await validator.runBackendChecks();

      expect(validator.results.backend.length).toBe(5);
      expect(validator.results.backend.every(r => r.status === 'passed')).toBe(true);
    });

    test('should check backend server', async () => {
      await validator.checkBackendServer();

      expect(global.fetch).toHaveBeenCalledWith('http://localhost:3030/api/health', {
        signal: expect.any(AbortSignal)
      });
    });

    test('should throw error when backend server is down', async () => {
      global.fetch.mockResolvedValue({
        ok: false,
        status: 500
      });

      await expect(validator.checkBackendServer()).rejects.toThrow('HTTP 500');
    });

    test('should check database', async () => {
      mockDb.db.get.mockReturnValue({ count: 10 });

      await expect(validator.checkDatabase()).resolves.toBeUndefined();
      expect(mockDb.db.prepare).toHaveBeenCalledWith('SELECT COUNT(*) as count FROM events');
    });

    test('should throw error when database fails', async () => {
      mockDb.db.get.mockReturnValue({ count: 'invalid' });

      await expect(validator.checkDatabase()).rejects.toThrow('Database query failed');
    });

    test('should throw error when database not initialized', async () => {
      validator.db = null;

      await expect(validator.checkDatabase()).rejects.toThrow('Database not initialized');
    });

    test('should check API endpoints', async () => {
      global.fetch.mockResolvedValue({
        ok: true,
        json: async () => ({ total: 150, healthy: 150 })
      });

      await validator.checkAPIEndpoints();

      expect(global.fetch).toHaveBeenCalledWith('http://localhost:3030/api/endpoints');
    });

    test('should throw error when too few endpoints found', async () => {
      global.fetch.mockResolvedValue({
        ok: true,
        json: async () => ({ total: 50 })
      });

      await expect(validator.checkAPIEndpoints()).rejects.toThrow(
        'Only 50 endpoints found (expected 150+)'
      );
    });
  });

  describe('Frontend Checks', () => {
    beforeEach(() => {
      global.fetch.mockResolvedValue({
        ok: true,
        text: async () =>
          '<!DOCTYPE html><html><head><script type="module" src="/src/main.js"></script></head></html>'
      });
    });

    test('should run all frontend checks', async () => {
      await validator.runFrontendChecks();

      expect(validator.results.frontend.length).toBe(3);
    });

    test('should check frontend server', async () => {
      await validator.checkFrontendServer();

      expect(global.fetch).toHaveBeenCalledWith('http://localhost:5173', {
        signal: expect.any(AbortSignal)
      });
    });

    test('should throw error on invalid HTML', async () => {
      global.fetch.mockResolvedValue({
        ok: true,
        text: async () => 'Not HTML content'
      });

      await expect(validator.checkFrontendServer()).rejects.toThrow('Invalid HTML response');
    });

    test('should handle timeout error', async () => {
      const timeoutError = new Error('Timeout');
      timeoutError.name = 'TimeoutError';
      global.fetch.mockRejectedValue(timeoutError);

      await expect(validator.checkFrontendServer()).rejects.toThrow('Server timeout');
    });

    test('should check assets', async () => {
      await validator.checkAssets();

      expect(global.fetch).toHaveBeenCalledWith('http://localhost:5173');
    });

    test('should throw error when Vite assets missing', async () => {
      global.fetch.mockResolvedValue({
        ok: true,
        text: async () => '<!DOCTYPE html><html><body>No Vite here</body></html>'
      });

      await expect(validator.checkAssets()).rejects.toThrow('Vite assets not found in HTML');
    });

    test('should check pages', async () => {
      await validator.checkPages();

      expect(global.fetch).toHaveBeenCalledWith('http://localhost:5173');
    });
  });

  describe('Integration Checks', () => {
    beforeEach(() => {
      global.fetch.mockResolvedValue({
        ok: true,
        headers: {
          get: jest.fn().mockReturnValue('application/json')
        },
        json: async () => ({ data: [] })
      });
    });

    test('should run all integration checks', async () => {
      await validator.runIntegrationChecks();

      expect(validator.results.integration.length).toBeGreaterThan(5);
    });

    test('should check data flow', async () => {
      await validator.checkDataFlow('/api/activity-log');

      expect(global.fetch).toHaveBeenCalledWith('http://localhost:3030/api/activity-log', {
        signal: expect.any(AbortSignal)
      });
    });

    test('should throw error on non-200 response', async () => {
      global.fetch.mockResolvedValue({
        ok: false,
        status: 500
      });

      await expect(validator.checkDataFlow('/api/test')).rejects.toThrow('HTTP 500');
    });

    test('should throw error on invalid content-type', async () => {
      global.fetch.mockResolvedValue({
        ok: true,
        headers: {
          get: jest.fn().mockReturnValue('text/html')
        },
        json: async () => ({})
      });

      await expect(validator.checkDataFlow('/api/test')).rejects.toThrow(
        'Invalid content-type (expected JSON)'
      );
    });

    test('should throw error when response contains error', async () => {
      global.fetch.mockResolvedValue({
        ok: true,
        headers: {
          get: jest.fn().mockReturnValue('application/json')
        },
        json: async () => ({ error: 'Database connection failed' })
      });

      await expect(validator.checkDataFlow('/api/test')).rejects.toThrow(
        'Database connection failed'
      );
    });

    test('should accept empty arrays for new installations', async () => {
      global.fetch.mockResolvedValue({
        ok: true,
        headers: {
          get: jest.fn().mockReturnValue('application/json')
        },
        json: async () => []
      });

      await expect(validator.checkDataFlow('/api/test')).resolves.toBeUndefined();
    });

    test('should accept responses with data arrays', async () => {
      global.fetch.mockResolvedValue({
        ok: true,
        headers: {
          get: jest.fn().mockReturnValue('application/json')
        },
        json: async () => ({ events: [], total: 0 })
      });

      await expect(validator.checkDataFlow('/api/test')).resolves.toBeUndefined();
    });
  });

  describe('Component Checks', () => {
    beforeEach(() => {
      global.fetch.mockResolvedValue({
        ok: true,
        json: async () => ({ status: 'ok' })
      });
    });

    test('should run all component checks', async () => {
      await validator.runComponentChecks();

      expect(validator.results.components.length).toBe(4);
    });

    test('should check dashboard panels', async () => {
      await validator.checkDashboardPanels();

      expect(global.fetch).toHaveBeenCalledWith('http://localhost:3030/api/dashboard-stats');
      expect(global.fetch).toHaveBeenCalledWith('http://localhost:3030/api/agents-status');
      expect(global.fetch).toHaveBeenCalledWith('http://localhost:3030/api/projects');
    });

    test('should check charts', async () => {
      await validator.checkCharts();

      expect(global.fetch).toHaveBeenCalledWith('http://localhost:3030/api/metrics?limit=10');
    });

    test('should check tables', async () => {
      await validator.checkTables();

      expect(global.fetch).toHaveBeenCalledWith('http://localhost:3030/api/activity-log?limit=10');
    });

    test('should check forms', async () => {
      await validator.checkForms();

      expect(global.fetch).toHaveBeenCalledWith('http://localhost:3030/api/preferences');
    });

    test('should accept 404 for preferences endpoint', async () => {
      global.fetch.mockResolvedValue({
        ok: false,
        status: 404
      });

      await expect(validator.checkForms()).resolves.toBeUndefined();
    });
  });

  describe('User Flow Checks', () => {
    beforeEach(() => {
      global.fetch.mockResolvedValue({
        ok: true,
        json: async () => ({ status: 'ok', projects: [], total: 0 })
      });
    });

    test('should run all user flow checks', async () => {
      await validator.runUserFlowChecks();

      expect(validator.results.userFlows.length).toBe(5);
    });

    test('should check project switching', async () => {
      global.fetch.mockResolvedValue({
        ok: true,
        json: async () => ({ projects: [], autoDiscover: true, basePath: '/projects' })
      });

      await validator.checkProjectSwitching();

      expect(global.fetch).toHaveBeenCalledWith('http://localhost:3030/api/projects');
    });

    test('should throw error when projects data invalid', async () => {
      global.fetch.mockResolvedValue({
        ok: true,
        json: async () => ({ projects: 'not an array' })
      });

      await expect(validator.checkProjectSwitching()).rejects.toThrow(
        'Projects endpoint returned invalid data structure'
      );
    });

    test('should check historical data', async () => {
      global.fetch.mockResolvedValue({
        ok: true,
        json: async () => ({ activities: [], total: 100 })
      });

      await validator.checkHistoricalData();

      expect(global.fetch).toHaveBeenCalledWith('http://localhost:3030/api/activity-log?limit=10');
    });

    test('should throw error when total missing', async () => {
      global.fetch.mockResolvedValue({
        ok: true,
        json: async () => ({ activities: [] })
      });

      await expect(validator.checkHistoricalData()).rejects.toThrow(
        'Activity log missing total count'
      );
    });
  });

  describe('runAll()', () => {
    beforeEach(() => {
      global.fetch.mockResolvedValue({
        ok: true,
        headers: {
          get: jest.fn().mockReturnValue('application/json')
        },
        text: async () =>
          '<!DOCTYPE html><html><head><script type="module"></script></head></html>',
        json: async () => ({ status: 'ok', projects: [], total: 150 })
      });

      mockDb.db.get.mockReturnValue({ count: 0 });
    });

    test('should run all validation phases', async () => {
      const result = await validator.runAll();

      expect(result).toMatchObject({
        healthy: expect.any(Boolean),
        passed: expect.any(Number),
        failed: expect.any(Number),
        total: expect.any(Number),
        duration: expect.any(Number),
        details: expect.objectContaining({
          backend: expect.any(Array),
          frontend: expect.any(Array),
          integration: expect.any(Array),
          components: expect.any(Array),
          userFlows: expect.any(Array)
        })
      });
    });

    test('should print banner and summary', async () => {
      await validator.runAll();

      expect(global.console.log).toHaveBeenCalled();
    });

    test('should calculate total duration', async () => {
      const result = await validator.runAll();

      expect(result.duration).toBeGreaterThan(0);
      expect(validator.totalDuration).toBeGreaterThan(0);
    });
  });

  describe('quickCheck()', () => {
    beforeEach(() => {
      global.fetch.mockResolvedValue({
        ok: true,
        headers: {
          get: jest.fn().mockReturnValue('application/json')
        },
        json: async () => ({ status: 'ok', total: 150 })
      });

      mockDb.db.get.mockReturnValue({ count: 0 });
    });

    test('should run only backend and integration checks', async () => {
      const result = await validator.quickCheck();

      expect(validator.results.backend.length).toBeGreaterThan(0);
      expect(validator.results.integration.length).toBeGreaterThan(0);
      expect(validator.results.frontend.length).toBe(0);
      expect(validator.results.components.length).toBe(0);
      expect(validator.results.userFlows.length).toBe(0);
    });

    test('should return results', async () => {
      const result = await validator.quickCheck();

      expect(result).toMatchObject({
        healthy: expect.any(Boolean),
        passed: expect.any(Number),
        failed: expect.any(Number),
        total: expect.any(Number)
      });
    });
  });

  describe('getResults()', () => {
    test('should return results summary', () => {
      validator.results.backend.push({
        name: 'Test',
        status: 'passed',
        duration: 10,
        error: null
      });

      validator.results.frontend.push({
        name: 'Test2',
        status: 'failed',
        duration: 20,
        error: 'Error message'
      });

      validator.totalDuration = 100;

      const results = validator.getResults();

      expect(results).toMatchObject({
        healthy: false, // Has failures
        passed: 1,
        failed: 1,
        total: 2,
        duration: 100,
        details: validator.results
      });
    });

    test('should return healthy when no failures', () => {
      validator.results.backend.push({
        name: 'Test',
        status: 'passed',
        duration: 10,
        error: null
      });

      const results = validator.getResults();

      expect(results.healthy).toBe(true);
    });
  });

  describe('UI Output Methods', () => {
    test('should print banner', () => {
      validator.printBanner();

      expect(global.console.log).toHaveBeenCalled();
    });

    test('should print phase header', () => {
      validator.printPhaseHeader('Test Phase');

      expect(global.console.log).toHaveBeenCalledWith(expect.stringContaining('Test Phase'));
    });

    test('should print summary with no failures', () => {
      validator.totalDuration = 5000;
      validator.results.backend.push({
        name: 'Test',
        status: 'passed',
        duration: 10,
        error: null
      });

      validator.printSummary();

      expect(global.console.log).toHaveBeenCalled();
    });

    test('should print summary with failures', () => {
      validator.totalDuration = 5000;
      validator.results.backend.push({
        name: 'Test',
        status: 'failed',
        duration: 10,
        error: 'Error'
      });

      validator.printSummary();

      expect(global.console.log).toHaveBeenCalledWith(expect.stringContaining('WARNINGS'));
    });
  });
});
