import { logger } from './logger.js';
import { notifications } from './notificationService.js';
import { authService } from './authStore.js';
import { logError } from './errorLogger.js';
import { API_CONFIG } from '../config.js';
import { websocketService } from './services/websocket.js';

const API_BASE = API_CONFIG.API_BASE;

// Throttle notifications to prevent toast spam during backend restarts or bursts
let lastTimeoutNotification = 0;
let lastApiErrorNotification = 0;
const NOTIFICATION_COOLDOWN = 5000; // 5s between error toasts

/**
 * Enhanced fetch wrapper with automatic error notifications, JWT authentication, and timeouts
 *
 * @param {string} endpoint - API endpoint (relative path or full URL)
 * @param {Object} [options={}] - Fetch options
 * @param {string} [options.method='GET'] - HTTP method (GET, POST, PUT, DELETE)
 * @param {Object} [options.headers] - Additional headers (Authorization header added automatically)
 * @param {string|FormData} [options.body] - Request body
 * @param {AbortSignal} [options.signal] - AbortController signal for cancellation
 * @param {RequestCache} [options.cache] - Cache mode
 * @param {number} [options.timeout=15000] - Request timeout in milliseconds (default: 15s)
 * @returns {Promise<any>} Parsed JSON response or text if not JSON
 * @throws {Error} Throws on HTTP errors (4xx, 5xx), network failures, or timeouts
 *
 * @example
 * // GET request
 * const data = await apiFetch('/api/users');
 *
 * @example
 * // POST request with body
 * const result = await apiFetch('/api/users', {
 *   method: 'POST',
 *   body: JSON.stringify({ name: 'John' })
 * });
 *
 * @example
 * // With custom timeout
 * const data = await apiFetch('/api/slow-endpoint', { timeout: 30000 });
 *
 * @example
 * // Using convenience methods
 * const users = await api.get('/api/users');
 * const created = await api.post('/api/users', { name: 'John' });
 */
export async function apiFetch(endpoint, options = {}) {
  const url = endpoint.startsWith('http') ? endpoint : `${API_BASE}${endpoint}`;

  // Default timeout: 15 seconds (prevents indefinite hangs)
  const timeout = options.timeout ?? 15000;

  // Add JWT token to headers if available
  const token = authService.getToken();
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  // Setup timeout using AbortController
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, timeout);

  try {
    const response = await fetch(url, {
      headers,
      ...options,
      signal: options.signal || controller.signal
    });

    // Clear timeout IMMEDIATELY after fetch completes (before any parsing)
    // This ensures timeout won't fire during JSON parsing
    clearTimeout(timeoutId);

    // Handle HTTP errors
    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      const errorMessage = `API error (${response.status}): ${errorText}`;

      // Check if this is a Tier 4 endpoint (experimental features)
      const isTier4Endpoint =
        endpoint.includes('/health/') ||
        endpoint.includes('/drift/') ||
        endpoint.includes('/productivity/') ||
        endpoint.includes('/personality/') ||
        endpoint.includes('/growth/') ||
        endpoint.includes('/integrations/') ||
        endpoint.includes('/gamification/') ||
        endpoint.includes('/easter-eggs') ||
        endpoint.includes('/social/');

      // Suppress logging and notifications for 404s/501s on Tier 4 endpoints (they're not implemented yet)
      const shouldSuppress =
        (response.status === 404 || response.status === 501) && isTier4Endpoint;

      // Log HTTP error to error log (but don't log errors from the error endpoint itself)
      if (!endpoint.includes('/errors') && !shouldSuppress) {
        logError(
          new Error(errorMessage),
          'API Client',
          {
            endpoint,
            method: options.method || 'GET',
            status_code: response.status,
            response_body: errorText
          },
          response.status >= 500 ? 'error' : 'warning'
        ).catch(logError => {
          // Fail silently to prevent infinite loops, but log to console for debugging
          logger.error(
            '[API Client] Failed to log error to backend:',
            logError.message || logError
          );
        });
      }

      // Handle 401 Unauthorized - trigger logout
      if (response.status === 401) {
        // Only logout if we actually had a token (ignore if auth is disabled)
        if (token) {
          notifications.error('Session expired. Please login again.');
          authService.logout();
          // Trigger page reload to show login
          window.location.reload();
        }

        throw new Error('Unauthorized');
      }

      // Don't show notifications for suppressed 404s/501s, and throttle others
      if (!shouldSuppress) {
        const now = Date.now();
        if (now - lastApiErrorNotification > NOTIFICATION_COOLDOWN) {
          lastApiErrorNotification = now;
          notifications.apiError(endpoint, errorMessage);
        }
      }

      throw new Error(errorMessage);
    }

    // Parse JSON response
    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      return await response.json();
    } else {
      return await response.text();
    }
  } catch (error) {
    // Clear timeout on error (if not already cleared)
    // This is redundant with line 74 but ensures cleanup in all paths
    clearTimeout(timeoutId);

    // Handle abort errors — distinguish navigation aborts from timeouts
    if (error.name === 'AbortError') {
      // If an external signal was provided and it's aborted, this is a navigation cancel — silently ignore
      if (options.signal && options.signal.aborted) {
        throw error;
      }
      const timeoutError = new Error(`Request timeout after ${timeout}ms: ${endpoint}`);
      // Only show timeout toasts when backend is connected (skip during restarts)
      if (websocketService.isConnected()) {
        const now = Date.now();
        if (now - lastTimeoutNotification > NOTIFICATION_COOLDOWN) {
          lastTimeoutNotification = now;
          notifications.error(`Request timed out after ${Math.round(timeout / 1000)}s`, {
            title: 'Request Timeout',
            duration: 5000
          });
        }
      }

      // Timeouts are transient (backend busy, cold start) — log to console only, not error DB
      logger.warn(`[API Client] Timeout after ${timeout}ms: ${endpoint}`);
      throw timeoutError;
    }

    // Network errors are transient (backend down, restart) — log to console only, not error DB
    if (!error.message.includes('API error') && websocketService.isConnected()) {
      notifications.apiError(endpoint, error.message);
    }
    logger.warn(`[API Client] Network error: ${endpoint} — ${error.message}`);
    throw error;
  }
}

/**
 * Convenience methods for common HTTP operations
 * Automatically handles JSON serialization and sets appropriate headers
 */
export const api = {
  get: (endpoint, options = {}) => apiFetch(endpoint, { ...options, method: 'GET' }),

  post: (endpoint, data, options = {}) =>
    apiFetch(endpoint, { ...options, method: 'POST', body: JSON.stringify(data) }),

  put: (endpoint, data, options = {}) =>
    apiFetch(endpoint, { ...options, method: 'PUT', body: JSON.stringify(data) }),

  delete: (endpoint, options = {}) => apiFetch(endpoint, { ...options, method: 'DELETE' })
};

/**
 * Create an API wrapper bound to an AbortController.
 * Call controller.abort() in onDestroy to cancel all in-flight requests when navigating away.
 *
 * @returns {{ api: typeof api, abort: () => void }}
 */
export function createPageApi() {
  let controller = new AbortController();

  const withSignal = (options = {}) => {
    if (controller.signal.aborted) {
      controller = new AbortController();
    }
    return { ...options, signal: controller.signal };
  };

  return {
    api: {
      get: (endpoint, options = {}) => api.get(endpoint, withSignal(options)),
      post: (endpoint, data, options = {}) => api.post(endpoint, data, withSignal(options)),
      put: (endpoint, data, options = {}) => api.put(endpoint, data, withSignal(options)),
      delete: (endpoint, options = {}) => api.delete(endpoint, withSignal(options))
    },
    abort: () => controller.abort()
  };
}

/**
 * Check server health status and show notifications for issues
 * @returns {Promise<Object>} Health status object with status and issues array
 * @throws {Error} Throws if health check request fails
 */
export async function checkServerHealth() {
  try {
    const health = await api.get('/health');

    // Handle different health statuses
    if (health.status === 'critical' || health.status === 'error') {
      // Critical issues - show error notification
      const issuesList = health.issues?.join(', ') || health.status;
      notifications.serverUnhealthy(issuesList);
      return false;
    } else if (health.status === 'warning') {
      // Warning status - show warning (not error) with specific issues
      const issuesList = health.issues?.join(', ') || 'System resources under pressure';
      notifications.warning(issuesList, {
        title: 'Server Health Warning',
        duration: 5000
      });
      // Still return true - server is operational, just under stress
    }

    // Check memory usage
    const memUsagePercent =
      (health.memory.process.heapUsed / health.memory.process.heapTotal) * 100;
    if (memUsagePercent > 90) {
      notifications.warning(`Server memory usage high: ${memUsagePercent.toFixed(1)}%`, {
        title: 'High Memory Usage',
        duration: 5000
      });
    }

    // Check disk usage (parse as float since it comes as string)
    const diskPercent = parseFloat(health.storage?.diskUsePercent || 0);
    if (diskPercent > 95) {
      notifications.storageCritical(diskPercent.toFixed(1));
    } else if (diskPercent > 85) {
      notifications.storageWarning(diskPercent.toFixed(1));
    }

    return true;
  } catch (error) {
    logger.error('Health check failed:', error);
    notifications.error('Failed to connect to server', {
      title: 'Connection Error',
      duration: 0
    });
    return false;
  }
}
