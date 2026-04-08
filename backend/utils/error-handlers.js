/**
 * Standardized Error Handling Utilities
 * Provides consistent error handling patterns across route handlers
 */

import { logger } from './logger.js';
import { HTTP_STATUS, ERROR_CODES } from '../config/constants.js';
import { DatabaseNotFoundError, DatabaseOperationError } from './database-helpers.js';

/**
 * Async route handler wrapper to catch errors automatically
 * Eliminates try-catch boilerplate in route handlers
 *
 * @param {Function} fn - Async route handler function
 * @returns {Function} - Wrapped handler with error catching
 *
 * @example
 * router.get('/api/data', asyncHandler(async (req, res) => {
 *   const data = await getData();
 *   res.json(data);
 * }));
 */
export function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * Standard error response object
 * @typedef {Object} ErrorResponse
 * @property {string} error - Error message
 * @property {string} [code] - Error code
 * @property {string} [details] - Additional details
 * @property {any} [context] - Additional context
 * @property {number} [retryAfter] - Milliseconds before retry
 */

/**
 * Send standardized error response
 * @param {object} res - Express response object
 * @param {number} statusCode - HTTP status code
 * @param {string} message - Error message
 * @param {object} options - Additional options
 * @param {string} [options.code] - Error code
 * @param {string} [options.details] - Additional details
 * @param {any} [options.context] - Additional context
 * @param {number} [options.retryAfter] - Milliseconds before retry
 */
export function sendErrorResponse(res, statusCode, message, options = {}) {
  const response = {
    error: message,
    ...(options.code && { code: options.code }),
    ...(options.details && { details: options.details }),
    ...(options.context && { context: options.context }),
    ...(options.retryAfter && { retryAfter: options.retryAfter })
  };

  res.status(statusCode).json(response);
}

/**
 * Send database not found error (404)
 * @param {object} res - Express response object
 * @param {string} projectName - Name of the project
 */
export function sendDatabaseNotFoundError(res, projectName) {
  sendErrorResponse(res, HTTP_STATUS.NOT_FOUND, `Database not found for project: ${projectName}`, {
    code: ERROR_CODES.NOT_FOUND,
    context: { projectName }
  });
}

/**
 * Send validation error (400)
 * @param {object} res - Express response object
 * @param {string} message - Validation error message
 * @param {object} details - Validation details
 */
export function sendValidationError(res, message, details = {}) {
  sendErrorResponse(res, HTTP_STATUS.BAD_REQUEST, message, {
    code: ERROR_CODES.VALIDATION_ERROR,
    details
  });
}

/**
 * Send internal server error (500)
 * @param {object} res - Express response object
 * @param {string} message - Error message
 * @param {Error} [error] - Original error object
 */
export function sendInternalError(res, message, error = null) {
  const details = error ? error.message : undefined;
  sendErrorResponse(res, HTTP_STATUS.INTERNAL_SERVER_ERROR, message, {
    code: ERROR_CODES.INTERNAL_ERROR,
    details
  });
}

/**
 * Send service unavailable error (503)
 * @param {object} res - Express response object
 * @param {string} message - Error message
 * @param {number} [retryAfter] - Milliseconds before retry
 */
export function sendServiceUnavailableError(res, message, retryAfter = 5000) {
  sendErrorResponse(res, HTTP_STATUS.SERVICE_UNAVAILABLE, message, {
    retryAfter
  });
}

/**
 * Send unauthorized error (401)
 * @param {object} res - Express response object
 * @param {string} [message] - Error message
 */
export function sendUnauthorizedError(res, message = 'Unauthorized') {
  sendErrorResponse(res, HTTP_STATUS.UNAUTHORIZED, message, {
    code: ERROR_CODES.UNAUTHORIZED
  });
}

/**
 * Send forbidden error (403)
 * @param {object} res - Express response object
 * @param {string} [message] - Error message
 */
export function sendForbiddenError(res, message = 'Forbidden') {
  sendErrorResponse(res, HTTP_STATUS.FORBIDDEN, message, {
    code: ERROR_CODES.FORBIDDEN
  });
}

/**
 * Log and send error based on error type
 * Automatically determines appropriate status code and response
 *
 * @param {object} res - Express response object
 * @param {Error} error - Error object
 * @param {string} operation - Operation that failed
 * @param {object} context - Additional context for logging
 */
export function handleOperationError(res, error, operation, context = {}) {
  // Log the error with context
  logger.error(`Operation failed: ${operation}`, {
    error: error.message,
    stack: error.stack,
    name: error.name,
    ...context
  });

  // Handle specific error types
  if (error instanceof DatabaseNotFoundError) {
    sendDatabaseNotFoundError(res, error.projectName);
    return;
  }

  if (error instanceof DatabaseOperationError) {
    sendInternalError(res, `Database operation failed: ${error.operation}`, error.originalError);
    return;
  }

  // Handle errors with status codes
  if (error.statusCode) {
    sendErrorResponse(res, error.statusCode, error.message, {
      code: error.code,
      details: error.details
    });
    return;
  }

  // Default to internal server error
  sendInternalError(res, `Failed to ${operation}`, error);
}

/**
 * Create an error with status code
 * @param {string} message - Error message
 * @param {number} statusCode - HTTP status code
 * @param {string} [code] - Error code
 * @returns {Error} - Error with statusCode property
 */
export function createError(message, statusCode, code = null) {
  const error = new Error(message);
  error.statusCode = statusCode;
  if (code) {
    error.code = code;
  }
  return error;
}

/**
 * Create a validation error
 * @param {string} message - Error message
 * @param {object} [details] - Validation details
 * @returns {Error} - Validation error
 */
export function createValidationError(message, details = {}) {
  const error = createError(message, HTTP_STATUS.BAD_REQUEST, ERROR_CODES.VALIDATION_ERROR);
  error.details = details;
  return error;
}

/**
 * Create a not found error
 * @param {string} resource - Resource that was not found
 * @returns {Error} - Not found error
 */
export function createNotFoundError(resource) {
  return createError(`${resource} not found`, HTTP_STATUS.NOT_FOUND, ERROR_CODES.NOT_FOUND);
}

/**
 * Middleware to handle errors globally
 * Place this after all routes as the last middleware
 */
export function globalErrorHandler(err, req, res, _next) {
  // Log the error
  logger.error('Global error handler caught error', {
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
    name: err.name
  });

  // Handle specific error types
  if (err instanceof DatabaseNotFoundError) {
    sendDatabaseNotFoundError(res, err.projectName);
    return;
  }

  if (err instanceof DatabaseOperationError) {
    sendInternalError(res, `Database operation failed: ${err.operation}`, err.originalError);
    return;
  }

  // Use error's status code if available
  const statusCode = err.statusCode || HTTP_STATUS.INTERNAL_SERVER_ERROR;
  const code = err.code || ERROR_CODES.INTERNAL_ERROR;

  sendErrorResponse(res, statusCode, err.message || 'Internal server error', {
    code,
    details: err.details
  });
}
