/**
 * Standardized Error Handler Middleware
 * Provides consistent error handling across the application
 */

import { logger } from '../utils/logger.js';

/**
 * Error codes enum for categorizing errors
 */
export const ErrorCodes = {
  // Authentication & Authorization (1xxx)
  AUTH_REQUIRED: 'AUTH_1001',
  AUTH_INVALID: 'AUTH_1002',
  AUTH_EXPIRED: 'AUTH_1003',
  AUTH_FORBIDDEN: 'AUTH_1004',

  // Validation Errors (2xxx)
  VALIDATION_ERROR: 'VAL_2001',
  INVALID_INPUT: 'VAL_2002',
  MISSING_REQUIRED: 'VAL_2003',

  // Database Errors (3xxx)
  DB_ERROR: 'DB_3001',
  DB_CONNECTION_FAILED: 'DB_3002',
  DB_QUERY_FAILED: 'DB_3003',
  DB_NOT_FOUND: 'DB_3004',
  DB_CONSTRAINT_VIOLATION: 'DB_3005',

  // File System Errors (4xxx)
  FILE_NOT_FOUND: 'FS_4001',
  FILE_TOO_LARGE: 'FS_4002',
  FILE_READ_ERROR: 'FS_4003',
  FILE_WRITE_ERROR: 'FS_4004',
  PATH_TRAVERSAL: 'FS_4005',

  // External Service Errors (5xxx)
  SERVICE_UNAVAILABLE: 'SVC_5001',
  SERVICE_TIMEOUT: 'SVC_5002',
  SERVICE_ERROR: 'SVC_5003',

  // Rate Limiting (6xxx)
  RATE_LIMIT_EXCEEDED: 'RATE_6001',

  // Generic Errors (9xxx)
  INTERNAL_ERROR: 'INT_9001',
  NOT_IMPLEMENTED: 'INT_9002',
  UNKNOWN_ERROR: 'INT_9999'
};

/**
 * Custom Application Error Class
 * Use this for creating domain-specific errors with proper context
 */
export class AppError extends Error {
  constructor(message, statusCode = 500, errorCode = ErrorCodes.INTERNAL_ERROR, details = null) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.errorCode = errorCode;
    this.details = details;
    this.isOperational = true; // Distinguishes operational errors from programming errors
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Create specific error types for common scenarios
 */
export class ValidationError extends AppError {
  constructor(message, details = null) {
    super(message, 400, ErrorCodes.VALIDATION_ERROR, details);
    this.name = 'ValidationError';
  }
}

export class AuthenticationError extends AppError {
  constructor(message = 'Authentication required', errorCode = ErrorCodes.AUTH_REQUIRED) {
    super(message, 401, errorCode);
    this.name = 'AuthenticationError';
  }
}

export class AuthorizationError extends AppError {
  constructor(message = 'Insufficient permissions') {
    super(message, 403, ErrorCodes.AUTH_FORBIDDEN);
    this.name = 'AuthorizationError';
  }
}

export class NotFoundError extends AppError {
  constructor(resource = 'Resource') {
    super(`${resource} not found`, 404, ErrorCodes.DB_NOT_FOUND);
    this.name = 'NotFoundError';
  }
}

export class DatabaseError extends AppError {
  constructor(message, details = null) {
    super(message, 500, ErrorCodes.DB_ERROR, details);
    this.name = 'DatabaseError';
  }
}

export class RateLimitError extends AppError {
  constructor(message = 'Rate limit exceeded') {
    super(message, 429, ErrorCodes.RATE_LIMIT_EXCEEDED);
    this.name = 'RateLimitError';
  }
}

/**
 * Centralized error handler middleware
 * Should be the last middleware in the chain
 */
export function errorHandler(err, req, res, _next) {
  // Default to 500 internal server error
  let statusCode = err.statusCode || 500;
  let errorCode = err.errorCode || ErrorCodes.UNKNOWN_ERROR;
  let message = err.message || 'An unexpected error occurred';
  let details = err.details || null;

  // Handle specific error types
  if (err.name === 'ValidationError' && !err.isOperational) {
    // Mongoose/Joi validation errors
    statusCode = 400;
    errorCode = ErrorCodes.VALIDATION_ERROR;
    details = err.details || err.errors;
  } else if (err.name === 'UnauthorizedError') {
    // JWT authentication errors
    statusCode = 401;
    errorCode = ErrorCodes.AUTH_INVALID;
    message = 'Invalid or expired token';
  } else if (err.name === 'JsonWebTokenError') {
    statusCode = 401;
    errorCode = ErrorCodes.AUTH_INVALID;
    message = 'Malformed authentication token';
  } else if (err.name === 'TokenExpiredError') {
    statusCode = 401;
    errorCode = ErrorCodes.AUTH_EXPIRED;
    message = 'Authentication token expired';
  } else if (err.code === 'ENOENT') {
    statusCode = 404;
    errorCode = ErrorCodes.FILE_NOT_FOUND;
    message = 'File or resource not found';
  } else if (err.code === 'SQLITE_ERROR' || err.code?.startsWith('SQLITE')) {
    statusCode = 500;
    errorCode = ErrorCodes.DB_ERROR;
    message = 'Database operation failed';
    details = { sqliteError: err.code };
  }

  // Log error with appropriate level
  const errorLog = {
    message: err.message,
    statusCode,
    errorCode,
    path: req.path,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('user-agent'),
    stack: err.stack
  };

  if (statusCode >= 500) {
    logger.error('Server error', errorLog);
  } else if (statusCode >= 400) {
    logger.warn('Client error', errorLog);
  }

  // Don't send stack traces in production
  const isDevelopment = process.env.NODE_ENV !== 'production';

  // Build error response
  const errorResponse = {
    error: {
      message,
      code: errorCode,
      statusCode
    }
  };

  // Add details if available
  if (details) {
    errorResponse.error.details = details;
  }

  // Add stack trace in development
  if (isDevelopment && err.stack) {
    errorResponse.error.stack = err.stack.split('\n');
  }

  // Add request ID if available (from tracing middleware)
  if (req.id) {
    errorResponse.error.requestId = req.id;
  }

  res.status(statusCode).json(errorResponse);
}

/**
 * Not Found (404) handler
 * Should be placed before the error handler, after all routes
 */
export function notFoundHandler(req, res) {
  logger.warn('Route not found', {
    path: req.path,
    method: req.method,
    ip: req.ip
  });

  res.status(404).json({
    error: {
      message: `Route not found: ${req.method} ${req.path}`,
      code: ErrorCodes.DB_NOT_FOUND,
      statusCode: 404
    }
  });
}

/**
 * Async error wrapper
 * Wraps async route handlers to catch promise rejections
 * Usage: router.get('/path', asyncHandler(async (req, res) => { ... }))
 */
export function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * Create a domain-specific error
 * Usage: throw createError(400, 'Invalid input', ErrorCodes.VALIDATION_ERROR, { field: 'email' })
 */
export function createError(statusCode, message, errorCode = null, details = null) {
  return new AppError(
    message,
    statusCode,
    errorCode || ErrorCodes.UNKNOWN_ERROR,
    details
  );
}
