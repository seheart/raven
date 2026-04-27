import { logger } from './logger.js';
import { API_CONFIG } from '../config.js';
// Error logging service for Raven frontend
// Sends errors to the backend API for storage and display

const API_BASE_URL = API_CONFIG.BASE_URL;

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
  window.addEventListener('error', event => {
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
  window.addEventListener('unhandledrejection', event => {
    logError(
      event.reason instanceof Error ? event.reason : new Error(String(event.reason)),
      'Promise',
      {
        type: 'unhandled_rejection'
      },
      'error'
    );
  });

  logger.info(' Global error handlers installed');
}
