/**
 * Async Handler Middleware
 * Eliminates repetitive try/catch blocks in route handlers
 */

import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { logger } from '../utils/logger.js';

/**
 * Wraps async route handlers to catch errors and pass them to error middleware
 *
 * Usage:
 * app.get('/api/users', asyncHandler(async (req, res) => {
 *   const users = await getUsers();
 *   res.json(users);
 * }));
 *
 * @param fn - Async route handler function
 * @returns Express middleware function
 */
export function asyncHandler(fn: RequestHandler): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(error => {
      // Log error for debugging
      logger.error('Async handler error:', {
        path: req.path,
        method: req.method,
        error: error.message,
        stack: error.stack
      });

      // Pass to error middleware
      next(error);
    });
  };
}

/**
 * Creates a standardized error response
 * @param statusCode - HTTP status code
 * @param message - Error message
 * @param code - Error code
 * @param details - Additional error details
 */
export function createError(
  statusCode: number,
  message: string,
  code?: string,
  details?: any
): Error {
  const error: any = new Error(message);
  error.statusCode = statusCode;
  error.errorCode = code || `ERROR_${statusCode}`;
  if (details) {
    error.details = details;
  }
  return error;
}

/**
 * Async handler with automatic error response formatting
 * Returns a standardized JSON error on failure
 *
 * @param fn - Async route handler function
 * @returns Express middleware function
 */
export function asyncHandlerWithErrorResponse(fn: RequestHandler): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(error => {
      logger.error('Request error:', {
        path: req.path,
        method: req.method,
        error: error.message
      });

      const statusCode = error.statusCode || 500;
      res.status(statusCode).json({
        error: {
          message: error.message || 'Internal server error',
          code: error.errorCode || 'INTERNAL_ERROR',
          statusCode
        }
      });
    });
  };
}
