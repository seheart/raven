import { logger } from './logger.js';
import { notifications } from './notificationService.js';
import { logError } from './errorLogger.js';
import { API_CONFIG } from '../config.js';
import { websocketService } from './services/websocket.js';

const API_BASE = API_CONFIG.API_BASE;

// Throttle notifications to prevent toast spam during backend restarts or bursts
let lastTimeoutNotification = 0;
let lastApiErrorNotification = 0;
const NOTIFICATION_COOLDOWN = 5000; // 5s between error toasts

// When the self-analysis run is active, the backend is intentionally under heavy
// CPU load (build, tests, lint) and routine polls will time out or hit 503s.
// Those failures are expected and transient — we suppress their toasts so the
// screen doesn't fill with error popups during the ~80-second analysis window.
let analysisRunning = false;
websocketService.on('analysis-progress', progress => {
  analysisRunning = progress?.currentCheck !== 'Done';
});

/**
 * Enhanced fetch wrapper with automatic error notifications and timeouts
 *
 * @param {string} endpoint - API endpoint (relative path or full URL)
 * @param {Object} [options={}] - Fetch options
 * @param {string} [options.method='GET'] - HTTP method (GET, POST, PUT, DELETE)
 * @param {Object} [options.headers] - Additional headers
 * @param {string|FormData} [options.body] - Request body
 * @param {AbortSignal} [options.signal] - AbortController signal for cancellation
 * @param {RequestCache} [options.cache] - Cache mode
 * @param {number} [options.timeout=15000] - Request timeout in milliseconds (default: 15s)
 * @returns {Promise<any>} Parsed JSON response or text if not JSON
 * @throws {Error} Throws on HTTP errors (4xx, 5xx), network failures, or timeouts
 * @public
 */
export async function apiFetch(endpoint, options = {}) {
  const url = endpoint.startsWith('http') ? endpoint : `${API_BASE}${endpoint}`;

  // Default timeout: 15 seconds (prevents indefinite hangs)
  const timeout = options.timeout ?? 15000;

  const headers = {
    'Content-Type': 'application/json',
    ...options.headers
  };

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

      // Suppress toasts for 503s during analysis — they're transient load-shedding,
      // not real failures. Still surface real 4xx/5xx so genuine bugs aren't hidden.
      const isTransientDuringAnalysis = analysisRunning && response.status === 503;

      // Don't show notifications for suppressed 404s/501s, and throttle others
      if (!shouldSuppress && !isTransientDuringAnalysis) {
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
      // Only show timeout toasts when backend is connected and not mid-analysis.
      // During analysis the backend is expected to be slow — suppress the noise.
      if (websocketService.isConnected() && !analysisRunning) {
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
    if (
      !error.message.includes('API error') &&
      websocketService.isConnected() &&
      !analysisRunning
    ) {
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
