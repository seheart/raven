/**
 * Global Error Handler Middleware
 * Centralized error handling for Express
 */

import { Request, Response, NextFunction } from 'express';
import { RavenError, formatErrorResponse, isOperationalError } from '../types/errors.js';
import { logger } from '../utils/logger.js';

/**
 * Express error handling middleware
 * Must have 4 parameters to be recognized as error handler
 */
export function errorHandler(error: Error, req: Request, res: Response, _next: NextFunction): void {
  // Log the error
  if (isOperationalError(error)) {
    logger.warn('Operational error:', {
      method: req.method,
      path: req.path,
      error: error.message,
      code: error instanceof RavenError ? error.code : 'UNKNOWN'
    });
  } else {
    logger.error('Non-operational error:', {
      method: req.method,
      path: req.path,
      error: error.message,
      stack: error.stack
    });
  }

  // Send error response
  if (error instanceof RavenError) {
    res.status(error.statusCode).json(error.toJSON());
  } else {
    // Unknown errors - don't expose details in production
    res.status(500).json(formatErrorResponse(error));
  }
}

/**
 * Async route handler wrapper
 * Catches errors in async functions and passes to error handler
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<any>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
