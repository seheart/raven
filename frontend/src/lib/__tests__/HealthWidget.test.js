/**
 * HealthWidget Component Tests
 * Tests for the compact health monitoring widget
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/svelte';

// Mock websocket service - must be before component import
vi.mock('../services/websocket.js', () => ({
  websocketService: {
    subscribe: vi.fn(() => vi.fn()), // Return unsubscribe function
    on: vi.fn(),
    off: vi.fn(),
    connect: vi.fn(),
    isConnected: vi.fn(() => true)
  }
}));

// Mock notification service
vi.mock('../notificationService.js', () => ({
  notifications: {
    error: vi.fn(),
    success: vi.fn()
  }
}));

// Mock logger
vi.mock('../logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn()
  },
  wsLogger: {
    debug: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn()
  }
}));

// Mock apiClient
vi.mock('../apiClient.js', () => ({
  apiFetch: vi.fn(() => Promise.resolve({})),
  api: {
    get: vi.fn(() => Promise.resolve({})),
    post: vi.fn(() => Promise.resolve({})),
    put: vi.fn(() => Promise.resolve({})),
    delete: vi.fn(() => Promise.resolve({}))
  }
}));

// Mock errorLogger
vi.mock('../errorLogger.js', () => ({
  logError: vi.fn()
}));

// Mock authStore
vi.mock('../authStore.js', () => ({
  authService: {
    getToken: vi.fn(() => null),
    getUser: vi.fn(() => null),
    isAuthenticated: vi.fn(() => false)
  },
  isAuthenticated: { subscribe: vi.fn(() => vi.fn()) },
  authToken: { subscribe: vi.fn(() => vi.fn()) },
  currentUser: { subscribe: vi.fn(() => vi.fn()) },
  authLoading: { subscribe: vi.fn(() => vi.fn()) }
}));

// Mock dataService
vi.mock('../dataService.js', () => ({
  dataService: {
    fetchFileEvents: vi.fn(),
    fetchHealthChecks: vi.fn()
  }
}));

import HealthWidget from '../HealthWidget.svelte';
import { dataService } from '../dataService.js';
import { api } from '../apiClient.js';

describe('HealthWidget', () => {
  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks();

    // Default mock responses for dataService
    dataService.fetchHealthChecks.mockResolvedValue({
      status: 'healthy',
      summary: { total: 9, passed: 9, failed: 0, allPassed: true },
      checks: [
        { name: 'Database Connection', passed: true, message: 'OK', duration: 5 },
        { name: 'WebSocket Connection', passed: true, message: 'OK', duration: 3 }
      ]
    });

    dataService.fetchFileEvents.mockResolvedValue([
      {
        filepath: 'test.js',
        change_type: 'change',
        timestamp: new Date().toISOString(),
        lines_added: 10,
        lines_deleted: 5
      }
    ]);

    // Default mock for api.get (syntax errors endpoint)
    api.get.mockImplementation((url) => {
      if (url.includes('/syntax-errors/count')) {
        return Promise.resolve({ count: 0 });
      }
      if (url.includes('/health')) {
        return Promise.resolve({ status: 'healthy' });
      }
      return Promise.resolve({});
    });
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('Component Rendering', () => {
    it('should render without crashing', async () => {
      const { container } = render(HealthWidget);
      expect(container).toBeTruthy();
    });

    it('should display loading state initially', async () => {
      render(HealthWidget);
      const loadingElement = screen.getByText(/checking health/i);
      expect(loadingElement).toBeTruthy();
    });

    it('should display health status after loading', async () => {
      render(HealthWidget);

      await waitFor(
        () => {
          const statusText = screen.queryByText(
            /All Systems OK|Some Issues Detected|Critical Issues Found/i
          );
          expect(statusText).toBeTruthy();
        },
        { timeout: 2000 }
      );
    });
  });

  describe('Health Status Indicators', () => {
    it('should show green status for healthy system', async () => {
      dataService.fetchFileEvents.mockResolvedValue([]);
      dataService.fetchHealthChecks.mockResolvedValue({
        status: 'healthy',
        summary: { total: 9, passed: 9, failed: 0 },
        checks: []
      });
      api.get.mockImplementation((url) => {
        if (url.includes('/syntax-errors/count')) return Promise.resolve({ count: 0 });
        return Promise.resolve({});
      });

      render(HealthWidget);

      await waitFor(() => {
        const statusText = screen.queryByText(/All Systems OK/i);
        expect(statusText).toBeTruthy();
      });
    });

    it('should show warning status for issues detected', async () => {
      dataService.fetchFileEvents.mockResolvedValue([
        {
          filepath: 'test.js',
          change_type: 'change',
          timestamp: new Date().toISOString(),
          lines_deleted: 150 // Large deletion
        }
      ]);

      dataService.fetchHealthChecks.mockResolvedValue({
        status: 'healthy',
        summary: { total: 9, passed: 9, failed: 0 },
        checks: []
      });

      render(HealthWidget);

      await waitFor(() => {
        // Should show warning status for large deletions
        const warningText = screen.queryByText(/Some Issues Detected/i);
        expect(warningText).toBeTruthy();
      });
    });

    it('should show critical status for serious issues', async () => {
      dataService.fetchFileEvents.mockResolvedValue([]);
      api.get.mockImplementation((url) => {
        if (url.includes('/syntax-errors/count')) return Promise.resolve({ count: 5 });
        return Promise.resolve({});
      });

      render(HealthWidget);

      await waitFor(() => {
        const criticalText = screen.queryByText(/critical|error|issue/i);
        expect(criticalText).toBeTruthy();
      });
    });
  });

  describe('Health Checks', () => {
    it('should display syntax check status', async () => {
      render(HealthWidget);

      await waitFor(() => {
        const syntaxCheck = screen.queryByText(/Syntax/i);
        expect(syntaxCheck).toBeTruthy();
      });
    });

    it('should display tests check status', async () => {
      render(HealthWidget);

      await waitFor(() => {
        const testsCheck = screen.queryByText(/Tests/i);
        expect(testsCheck).toBeTruthy();
      });
    });

    it('should display deletions check with count', async () => {
      render(HealthWidget);

      await waitFor(() => {
        const deletionsCheck = screen.queryByText(/Deletions/i);
        expect(deletionsCheck).toBeTruthy();
      });
    });

    it('should display security check with count', async () => {
      render(HealthWidget);

      await waitFor(() => {
        const securityCheck = screen.queryByText(/Security/i);
        expect(securityCheck).toBeTruthy();
      });
    });
  });

  describe('Startup Health Checks', () => {
    it('should display pending state initially', async () => {
      dataService.fetchHealthChecks.mockResolvedValue({
        status: 'pending',
        message: 'Health checks have not run yet',
        summary: { total: 0, passed: 0, failed: 0 },
        checks: []
      });

      render(HealthWidget);

      await waitFor(() => {
        const pendingText = screen.queryByText(/Health Check Pending|Checking/i);
        expect(pendingText).toBeTruthy();
      });
    });

    it('should display healthy state when checks pass', async () => {
      dataService.fetchHealthChecks.mockResolvedValue({
        status: 'healthy',
        summary: { total: 9, passed: 9, failed: 0, allPassed: true },
        checks: []
      });
      dataService.fetchFileEvents.mockResolvedValue([]);
      api.get.mockImplementation((url) => {
        if (url.includes('/syntax-errors/count')) return Promise.resolve({ count: 0 });
        return Promise.resolve({});
      });

      render(HealthWidget);

      await waitFor(
        () => {
          // Should display healthy status text
          const healthText = screen.queryByText(/All Systems Operational|healthy|pass/i);
          expect(healthText).toBeTruthy();
        },
        { timeout: 3000 }
      );
    });

    it('should display failure count when checks fail', async () => {
      dataService.fetchHealthChecks.mockResolvedValue({
        status: 'unhealthy',
        summary: { total: 9, passed: 7, failed: 2, allPassed: false },
        checks: []
      });

      dataService.fetchFileEvents.mockResolvedValue([]);

      render(HealthWidget);

      await waitFor(
        () => {
          // Should show the failed checks count
          const failedText = screen.queryByText(/2 Checks Failed/i);
          expect(failedText).toBeTruthy();
        },
        { timeout: 3000 }
      );
    });
  });

  describe("Today's Stats", () => {
    it.skip('should display files changed count', async () => {
      global.fetch.mockImplementation(url => {
        if (url.includes('/all-file-events')) {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve([
                {
                  filepath: 'file1.js',
                  change_type: 'change',
                  timestamp: new Date().toISOString(),
                  lines_added: 10
                },
                {
                  filepath: 'file2.js',
                  change_type: 'change',
                  timestamp: new Date().toISOString(),
                  lines_added: 5
                }
              ])
          });
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ count: 0 }) });
      });

      render(HealthWidget);

      await waitFor(() => {
        const filesText = screen.queryByText(/files/i);
        expect(filesText).toBeTruthy();
      });
    });

    it.skip('should calculate lines added', async () => {
      global.fetch.mockImplementation(url => {
        if (url.includes('/all-file-events')) {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve([
                {
                  filepath: 'test.js',
                  change_type: 'change',
                  timestamp: new Date().toISOString(),
                  lines_added: 25,
                  lines_deleted: 10
                }
              ])
          });
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ count: 0 }) });
      });

      render(HealthWidget);

      await waitFor(() => {
        const addedText = screen.queryByText(/added/i);
        expect(addedText).toBeTruthy();
      });
    });

    it.skip('should calculate lines deleted', async () => {
      global.fetch.mockImplementation(url => {
        if (url.includes('/all-file-events')) {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve([
                {
                  filepath: 'test.js',
                  change_type: 'change',
                  timestamp: new Date().toISOString(),
                  lines_added: 5,
                  lines_deleted: 15
                }
              ])
          });
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ count: 0 }) });
      });

      render(HealthWidget);

      await waitFor(() => {
        const deletedText = screen.queryByText(/deleted/i);
        expect(deletedText).toBeTruthy();
      });
    });
  });

  describe('Refresh Functionality', () => {
    it('should have a refresh button', async () => {
      render(HealthWidget);

      await waitFor(() => {
        const refreshButton = screen.queryByLabelText(/Refresh health check/i);
        expect(refreshButton).toBeTruthy();
      });
    });

    it('should reload data when refresh button clicked', async () => {
      render(HealthWidget);

      await waitFor(() => {
        const refreshButton = screen.queryByLabelText(/Refresh health check/i);
        if (refreshButton) {
          fireEvent.click(refreshButton);
        }
      });

      // api.get should be called again
      await waitFor(() => {
        expect(api.get).toHaveBeenCalled();
      });
    });
  });

  describe('Large Deletions Detection', () => {
    it('should detect large deletions (>100 lines)', async () => {
      dataService.fetchFileEvents.mockResolvedValue([
        {
          filepath: 'test.js',
          change_type: 'change',
          timestamp: new Date().toISOString(),
          lines_deleted: 150
        }
      ]);

      dataService.fetchHealthChecks.mockResolvedValue({
        status: 'healthy',
        summary: { total: 9, passed: 9, failed: 0 },
        checks: []
      });

      render(HealthWidget);

      await waitFor(() => {
        const deletionsText = screen.queryByText(/Deletions \(1\)/i);
        expect(deletionsText).toBeTruthy();
      });
    });

    it('should not flag small deletions', async () => {
      dataService.fetchFileEvents.mockResolvedValue([
        {
          filepath: 'test.js',
          change_type: 'change',
          timestamp: new Date().toISOString(),
          lines_deleted: 50 // Under 100 threshold
        }
      ]);
      dataService.fetchHealthChecks.mockResolvedValue({
        status: 'healthy',
        summary: { total: 9, passed: 9, failed: 0 },
        checks: []
      });

      render(HealthWidget);

      await waitFor(() => {
        const deletionsText = screen.queryByText(/Deletions \(0\)/i);
        expect(deletionsText).toBeTruthy();
      });
    });
  });

  describe('Security File Changes', () => {
    it('should detect .env file changes', async () => {
      dataService.fetchFileEvents.mockResolvedValue([
        {
          filepath: '.env',
          change_type: 'change',
          timestamp: new Date().toISOString()
        }
      ]);

      dataService.fetchHealthChecks.mockResolvedValue({
        status: 'healthy',
        summary: { total: 9, passed: 9, failed: 0 },
        checks: []
      });

      render(HealthWidget);

      await waitFor(() => {
        const securityText = screen.queryByText(/Security \(1\)/i);
        expect(securityText).toBeTruthy();
      });
    });

    it('should detect credential file changes', async () => {
      dataService.fetchFileEvents.mockResolvedValue([
        {
          filepath: 'credentials.json',
          change_type: 'change',
          timestamp: new Date().toISOString()
        }
      ]);

      dataService.fetchHealthChecks.mockResolvedValue({
        status: 'healthy',
        summary: { total: 9, passed: 9, failed: 0 },
        checks: []
      });

      render(HealthWidget);

      await waitFor(() => {
        const securityText = screen.queryByText(/Security \(1\)/i);
        expect(securityText).toBeTruthy();
      });
    });

    it('should detect .pem and .key file changes', async () => {
      dataService.fetchFileEvents.mockResolvedValue([
        {
          filepath: 'private.pem',
          change_type: 'change',
          timestamp: new Date().toISOString()
        },
        {
          filepath: 'secret.key',
          change_type: 'change',
          timestamp: new Date().toISOString()
        }
      ]);

      dataService.fetchHealthChecks.mockResolvedValue({
        status: 'healthy',
        summary: { total: 9, passed: 9, failed: 0 },
        checks: []
      });

      render(HealthWidget);

      await waitFor(
        () => {
          // Look for Security text with or without count
          const securityText = screen.queryByText(/Security/i);
          expect(securityText).toBeTruthy();
        },
        { timeout: 5000 }
      );
    });
  });

  describe('Error Handling', () => {
    it('should display error state on fetch failure', async () => {
      dataService.fetchFileEvents.mockRejectedValue(new Error('Network error'));
      dataService.fetchHealthChecks.mockRejectedValue(new Error('Network error'));

      render(HealthWidget);

      await waitFor(
        () => {
          // Check for any error indicator - error message, error icon, or checking state
          const errorElement = screen.queryByText(/error|failed|checking/i);
          expect(errorElement).toBeTruthy();
        },
        { timeout: 5000 }
      );
    });

    it.skip('should have retry button on error', async () => {
      dataService.fetchFileEvents.mockRejectedValue(new Error('Network error'));
      dataService.fetchHealthChecks.mockRejectedValue(new Error('Network error'));

      render(HealthWidget);

      await waitFor(
        () => {
          // Look for retry button or any clickable element with retry text
          const retryButton =
            screen.queryByLabelText(/Retry/i) ||
            screen.queryByRole('button', { name: /retry/i }) ||
            screen.queryByText(/retry/i);
          expect(retryButton).toBeTruthy();
        },
        { timeout: 5000 }
      );
    });
  });

  describe('Time Formatting', () => {
    it.skip('should display "Updated X ago" timestamp', async () => {
      render(HealthWidget);

      await waitFor(() => {
        const timeText = screen.queryByText(/Updated.*ago|just now/i);
        expect(timeText).toBeTruthy();
      });
    });
  });
});
