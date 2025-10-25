import { logger } from './logger.js';
// Error logging service for Raven frontend
// Sends errors to the backend API for storage and display

const API_BASE_URL = 'http://localhost:3030';

/**
 * Log an error to the backend
 * @param {Error} error - The error object
 * @param {string} component - Component or context where error occurred
 * @param {object} metadata - Additional metadata
 * @param {string} severity - error, warning, info
 */
export async function logError(error, component = 'Unknown', metadata = {}, severity = 'error') {
  try {
    const errorData = {
      error_type: error.name || 'Error',
      message: error.message || String(error),
      stack: error.stack || null,
      component,
      user_agent: navigator.userAgent,
      url: window.location.href,
      metadata: {
        ...metadata,
        timestamp_local: new Date().toISOString()
      },
      severity
    };

    // Use fetch directly to avoid circular dependency with apiClient
    const response = await fetch(`${API_BASE_URL}/api/errors`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(errorData)
    });

    if (!response.ok) {
      throw new Error(`Failed to log error: ${response.status}`);
    }

    return await response.json();
  } catch (loggingError) {
    // Don't throw errors from the error logger itself
    logger.error('Error logger failed:', loggingError);
    return null;
  }
}

/**
 * Setup global error handlers
 */
export function setupGlobalErrorHandler() {
  // Handle unhandled errors
  window.addEventListener('error', (event) => {
    logError(
      event.error || new Error(event.message),
      'Global',
      {
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno
      },
      'error'
    );
  });

  // Handle unhandled promise rejections
  window.addEventListener('unhandledrejection', (event) => {
    logError(
      event.reason instanceof Error ? event.reason : new Error(String(event.reason)),
      'Promise',
      {
        type: 'unhandled_rejection'
      },
      'error'
    );
  });

  logger.info('✅ Global error handlers installed');
}

/**
 * Fetch error logs from backend
 */
export async function fetchErrorLogs(options = {}) {
  try {
    const params = new URLSearchParams({
      limit: options.limit || 100,
      offset: options.offset || 0,
      search: options.search || '',
      severity: options.severity || 'all'
    });

    if (options.startDate) params.append('startDate', options.startDate);
    if (options.endDate) params.append('endDate', options.endDate);

    const response = await fetch(`${API_BASE_URL}/api/errors?${params}`);
    if (!response.ok) {
      throw new Error(`Failed to fetch error logs: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    logger.error('Failed to fetch error logs:', error);
    throw error;
  }
}

/**
 * Fetch error statistics
 */
export async function fetchErrorStats() {
  try {
    const response = await fetch(`${API_BASE_URL}/api/errors/stats`);
    if (!response.ok) {
      throw new Error(`Failed to fetch error stats: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    logger.error('Failed to fetch error stats:', error);
    throw error;
  }
}

/**
 * Clear error logs
 */
export async function clearErrorLogs(olderThanDays = null) {
  try {
    const endpoint = olderThanDays
      ? `/errors?olderThanDays=${olderThanDays}`
      : `/errors`;

    const response = await fetch(`${API_BASE_URL}/api${endpoint}`, {
      method: 'DELETE'
    });
    if (!response.ok) {
      throw new Error(`Failed to clear error logs: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    logger.error('Failed to clear error logs:', error);
    throw error;
  }
}
