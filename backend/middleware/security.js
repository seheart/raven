/**
 * Security Middleware for Raven
 * Implements helmet, rate limiting, and other security best practices
 */

import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { logger } from '../utils/logger.js';

/**
 * Configure Helmet for security headers
 */
export function setupHelmet() {
  return helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", 'data:', 'https:'],
        connectSrc: ["'self'", 'ws:', 'wss:'],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'"],
        frameSrc: ["'none'"]
      }
    },
    crossOriginEmbedderPolicy: false, // Disable for development
    crossOriginResourcePolicy: { policy: 'cross-origin' }
  });
}

/**
 * General API rate limiter
 * Development: 1000 requests per minute
 * Production: 100 requests per 15 minutes per IP
 */
export const apiLimiter = rateLimit({
  windowMs: process.env.NODE_ENV === 'production' ? 15 * 60 * 1000 : 60 * 1000, // 15 min (prod) or 1 min (dev)
  max: process.env.NODE_ENV === 'production' ? 100 : 1000, // 100 (prod) or 1000 (dev)
  message: {
    error: 'Too many requests from this IP, please try again later',
    retryAfter: process.env.NODE_ENV === 'production' ? '15 minutes' : '1 minute'
  },
  standardHeaders: true, // Return rate limit info in headers
  legacyHeaders: false,
  skip: (req) => {
    // Skip rate limiting for health check endpoints
    return req.path === '/health' || req.path === '/api/health';
  }
});

/**
 * Authentication rate limiter (stricter)
 * Limits: 5 login attempts per 15 minutes per IP
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit each IP to 5 login attempts per windowMs
  message: {
    error: 'Too many login attempts, please try again later',
    retryAfter: '15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false
});

/**
 * Telemetry endpoint rate limiter
 * Limits: 1000 requests per minute (high volume expected)
 */
export const telemetryLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 1000,
  message: {
    error: 'Telemetry rate limit exceeded',
    retryAfter: '1 minute'
  },
  standardHeaders: true,
  legacyHeaders: false
});

/**
 * Write operations rate limiter (create, update, delete)
 * Limits: 50 requests per 15 minutes per IP
 */
export const writeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 50,
  message: {
    error: 'Too many write operations, please try again later',
    retryAfter: '15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false
});

/**
 * Request logging middleware
 */
export function requestLogger(req, res, next) {
  const startTime = Date.now();
  const { method, url, ip } = req;

  res.on('finish', () => {
    const duration = Date.now() - startTime;
    const { statusCode } = res;

    // Log requests (use production logger in real app)
    if (statusCode >= 400) {
      logger.warn(`[${method}] ${url} - ${statusCode} - ${duration}ms - ${ip}`);
    } else if (process.env.NODE_ENV !== 'production') {
      logger.info(`[${method}] ${url} - ${statusCode} - ${duration}ms`);
    }
  });

  next();
}

/**
 * Error handler middleware (enhanced version)
 * Provides standardized error responses with error codes
 */
export function errorHandler(err, req, res, next) {
  // Default to 500 internal server error
  const statusCode = err.statusCode || err.status || 500;
  const errorCode = err.errorCode || 'INTERNAL_ERROR';
  const message = err.message || 'An unexpected error occurred';

  // Log error with context
  const errorLog = {
    message: err.message,
    statusCode,
    errorCode,
    path: req.path,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('user-agent')
  };

  if (statusCode >= 500) {
    logger.error('Server error', { ...errorLog, stack: err.stack });
  } else if (statusCode >= 400) {
    logger.warn('Client error', errorLog);
  }

  // Don't leak error details in production
  const isDev = process.env.NODE_ENV !== 'production';

  // Build error response
  const errorResponse = {
    error: {
      message,
      code: errorCode,
      statusCode
    }
  };

  // Add details if available
  if (err.details) {
    errorResponse.error.details = err.details;
  }

  // Add stack trace in development
  if (isDev && err.stack) {
    errorResponse.error.stack = err.stack.split('\n');
  }

  // Add request ID if available
  if (req.id) {
    errorResponse.error.requestId = req.id;
  }

  res.status(statusCode).json(errorResponse);
}

/**
 * 404 handler (enhanced version)
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
      code: 'NOT_FOUND',
      statusCode: 404
    }
  });
}

/**
 * CORS configuration for production
 */
export function setupCORS(allowedOrigins) {
  return {
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, curl, etc.)
      if (!origin) return callback(null, true);

      if (allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization']
  };
}

/**
 * Request size limiter
 */
export function setupRequestSizeLimit() {
  return {
    // Limit JSON payload size
    json: { limit: '10mb' },
    // Limit URL-encoded payload size
    urlencoded: { limit: '10mb', extended: true }
  };
}
