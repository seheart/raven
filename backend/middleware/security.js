/**
 * Security Middleware for Raven
 * Implements helmet, rate limiting, and other security best practices
 */

import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { logger } from '../utils/logger.js';

/**
 * Rate limit status tracker
 * Stores current rate limit info for monitoring
 */
export const rateLimitStatus = {
  api: { current: 0, max: 0, windowMs: 0, resetTime: Date.now() },
  telemetry: { current: 0, max: 0, windowMs: 0, resetTime: Date.now() },
  auth: { current: 0, max: 0, windowMs: 0, resetTime: Date.now() },
  write: { current: 0, max: 0, windowMs: 0, resetTime: Date.now() }
};

/**
 * Create a custom store that tracks rate limit usage
 */
function createTrackingStore(limiterName) {
  const hits = new Map();

  return {
    async increment(key) {
      const now = Date.now();
      const count = (hits.get(key) || 0) + 1;
      hits.set(key, count);

      // Update status
      if (rateLimitStatus[limiterName]) {
        rateLimitStatus[limiterName].current = count;
      }

      return {
        totalHits: count,
        resetTime: new Date(rateLimitStatus[limiterName].resetTime)
      };
    },
    async decrement(key) {
      const count = Math.max((hits.get(key) || 1) - 1, 0);
      hits.set(key, count);

      if (rateLimitStatus[limiterName]) {
        rateLimitStatus[limiterName].current = count;
      }
    },
    async resetKey(key) {
      hits.delete(key);
      if (rateLimitStatus[limiterName]) {
        rateLimitStatus[limiterName].current = 0;
        rateLimitStatus[limiterName].resetTime = Date.now() + rateLimitStatus[limiterName].windowMs;
      }
    },
    async resetAll() {
      hits.clear();
      if (rateLimitStatus[limiterName]) {
        rateLimitStatus[limiterName].current = 0;
        rateLimitStatus[limiterName].resetTime = Date.now() + rateLimitStatus[limiterName].windowMs;
      }
    }
  };
}

/**
 * Configure Helmet for security headers
 */
export function setupHelmet() {
  const isProduction = process.env.NODE_ENV === 'production';

  return helmet({
    // Content Security Policy
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        // SECURITY NOTE: 'unsafe-inline' for styles
        //
        // Svelte compiles component-scoped styles into <style> tags and uses
        // reactive style bindings (style="width: {value}%") which require 'unsafe-inline'.
        //
        // RISK ASSESSMENT: LOW
        // - Comprehensive security audit (2025-10-31) verified no XSS vectors
        // - Zero usage of innerHTML, dangerouslySetInnerHTML, or @html in codebase
        // - All styles originate from trusted Svelte components (not user input)
        // - All API responses are properly escaped by Svelte's reactive binding
        //
        // FUTURE HARDENING OPTIONS:
        // - Implement CSP nonces for production builds
        // - Extract all Svelte styles to external CSS files
        // - Use style-src-elem to restrict inline styles further
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", 'data:', 'https:'],
        connectSrc: ["'self'", 'ws:', 'wss:'],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'"],
        frameSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
        upgradeInsecureRequests: isProduction ? [] : null
      }
    },

    // HSTS - Force HTTPS in production
    strictTransportSecurity: {
      maxAge: 31536000, // 1 year
      includeSubDomains: true,
      preload: true
    },

    // X-Frame-Options
    frameguard: {
      action: 'deny'
    },

    // X-Content-Type-Options
    noSniff: true,

    // X-DNS-Prefetch-Control
    dnsPrefetchControl: {
      allow: false
    },

    // X-Download-Options
    ieNoOpen: true,

    // X-Permitted-Cross-Domain-Policies
    permittedCrossDomainPolicies: {
      permittedPolicies: 'none'
    },

    // Referrer-Policy
    referrerPolicy: {
      policy: 'strict-origin-when-cross-origin'
    },

    // Cross-Origin policies
    crossOriginEmbedderPolicy: isProduction,
    crossOriginOpenerPolicy: { policy: 'same-origin' },
    crossOriginResourcePolicy: { policy: 'same-origin' },

    // Remove X-Powered-By header
    hidePoweredBy: true
  });
}

/**
 * General API rate limiter
 * Monitoring tools require higher limits due to:
 * - Continuous polling for metrics/status
 * - Real-time dashboard updates
 * - Multiple concurrent page views
 * - File watching events
 *
 * Configurable via environment variables:
 * - API_RATE_LIMIT_WINDOW_MS: Time window in milliseconds
 * - API_RATE_LIMIT_MAX: Maximum requests per window
 */
const apiWindowMs = parseInt(process.env.API_RATE_LIMIT_WINDOW_MS || '60000', 10);
const apiMax = parseInt(process.env.API_RATE_LIMIT_MAX || '500', 10);

// Initialize rate limit status
rateLimitStatus.api.max = apiMax;
rateLimitStatus.api.windowMs = apiWindowMs;
rateLimitStatus.api.resetTime = Date.now() + apiWindowMs;

export const apiLimiter = rateLimit({
  windowMs: apiWindowMs, // Default: 1 minute
  max: apiMax, // Default: 500/min for monitoring
  skip: req => {
    // Skip rate limiting for localhost in development
    const isLocalhost = req.ip === '127.0.0.1' || req.ip === '::1' || req.ip === '::ffff:127.0.0.1';
    const isDevelopment = process.env.NODE_ENV !== 'production';
    const isHealthEndpoint =
      req.path === '/health' || req.path === '/api/health' || req.path === '/api/rate-limit-status';

    return (isLocalhost && isDevelopment) || isHealthEndpoint;
  },
  message: {
    error: 'Too many requests from this IP, please try again later',
    retryAfter: `${apiWindowMs / 1000} seconds`
  },
  standardHeaders: true, // Return rate limit info in headers
  legacyHeaders: false,
  store: createTrackingStore('api')
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
 * High volume expected for monitoring tools
 * Configurable via environment variables:
 * - TELEMETRY_RATE_LIMIT_WINDOW_MS: Time window in milliseconds
 * - TELEMETRY_RATE_LIMIT_MAX: Maximum requests per window
 */
const telemetryWindowMs = parseInt(process.env.TELEMETRY_RATE_LIMIT_WINDOW_MS || '60000', 10);
const telemetryMax = parseInt(process.env.TELEMETRY_RATE_LIMIT_MAX || '5000', 10);

// Initialize rate limit status
rateLimitStatus.telemetry.max = telemetryMax;
rateLimitStatus.telemetry.windowMs = telemetryWindowMs;
rateLimitStatus.telemetry.resetTime = Date.now() + telemetryWindowMs;

export const telemetryLimiter = rateLimit({
  windowMs: telemetryWindowMs, // Default: 1 minute
  max: telemetryMax, // Default: 5000/min
  message: {
    error: 'Telemetry rate limit exceeded',
    retryAfter: `${telemetryWindowMs / 1000} seconds`
  },
  standardHeaders: true,
  legacyHeaders: false,
  store: createTrackingStore('telemetry')
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
