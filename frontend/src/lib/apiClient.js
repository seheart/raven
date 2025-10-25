import { notifications } from './notificationService.js';
import { authService } from './authStore.js';
import { logError } from './errorLogger.js';

const API_BASE = 'http://localhost:3030/api';

/**
 * Enhanced fetch wrapper with automatic error notifications and JWT authentication
 */
export async function apiFetch(endpoint, options = {}) {
  const url = endpoint.startsWith('http') ? endpoint : `${API_BASE}${endpoint}`;

  // Add JWT token to headers if available
  const token = authService.getToken();
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  try {
    const response = await fetch(url, {
      headers,
      ...options
    });

    // Handle HTTP errors
    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      const errorMessage = `API error (${response.status}): ${errorText}`;

      // Log HTTP error to error log (but don't log errors from the error endpoint itself)
      if (!endpoint.includes('/errors')) {
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
        ).catch(() => {
          // Silently fail if error logging fails (prevents infinite loops)
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

      notifications.apiError(endpoint, errorMessage);
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
    // Network errors or other fetch failures
    if (!error.message.includes('API error')) {
      notifications.apiError(endpoint, error.message);

      // Log network error to error log (but don't log errors from the error endpoint itself)
      if (!endpoint.includes('/errors')) {
        logError(
          error,
          'API Client',
          {
            endpoint,
            method: options.method || 'GET',
            error_type: 'Network Error'
          },
          'error'
        ).catch(() => {
          // Silently fail if error logging fails (prevents infinite loops)
        });
      }
    }
    throw error;
  }
}

// Convenience methods
export const api = {
  get: (endpoint, options = {}) => apiFetch(endpoint, { ...options, method: 'GET' }),
  post: (endpoint, data, options = {}) => apiFetch(endpoint, { ...options, method: 'POST', body: JSON.stringify(data) }),
  put: (endpoint, data, options = {}) => apiFetch(endpoint, { ...options, method: 'PUT', body: JSON.stringify(data) }),
  delete: (endpoint, options = {}) => apiFetch(endpoint, { ...options, method: 'DELETE' }),
};

// Health check with notifications
export async function checkServerHealth() {
  try {
    const health = await api.get('/health');

    // Check for critical health issues
    if (health.status !== 'healthy') {
      notifications.serverUnhealthy(health.status);
      return false;
    }

    // Check memory usage
    const memUsagePercent = (health.memory.process.heapUsed / health.memory.process.heapTotal) * 100;
    if (memUsagePercent > 90) {
      notifications.warning(`Server memory usage high: ${memUsagePercent.toFixed(1)}%`, {
        title: 'High Memory Usage'
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
    console.error('Health check failed:', error);
    return false;
  }
}
