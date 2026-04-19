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
