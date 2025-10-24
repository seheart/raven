/**
 * Request Tracing Middleware
 * Adds correlation IDs and request/response logging
 */

import { generateCorrelationId, createRequestLogger } from '../utils/structured-logger.js';
import { env } from '../config/environment.js';
import onFinished from 'on-finished';

/**
 * Request tracing middleware
 * Adds correlation ID and logging to all requests
 */
export function requestTracing(req, res, next) {
  // Generate correlation ID (case-insensitive header check)
  const correlationId = req.get('x-correlation-id') || generateCorrelationId();

  // Attach to request
  req.correlationId = correlationId;
  req.logger = createRequestLogger(correlationId);

  // Add correlation ID to response headers
  res.setHeader('X-Correlation-ID', correlationId);

  // Track request start time
  const startTime = Date.now();

  // Log incoming request
  if (env.ENABLE_TRACING) {
    req.logger.logRequest(req);
  }

  // Use on-finished to handle response completion
  onFinished(res, () => {
    // Calculate duration
    const duration = Date.now() - startTime;

    // Log response
    if (env.ENABLE_TRACING) {
      req.logger.logResponse(req, res, duration);
    }
  });

  next();
}

/**
 * Error logging middleware
 * Logs errors with correlation ID
 */
export function errorLogging(err, req, res, next) {
  const logger = req.logger || createRequestLogger(req.correlationId || 'unknown');

  logger.error('Request Error', err, {
    method: req.method,
    path: req.path,
    statusCode: err.statusCode || 500
  });

  next(err);
}
