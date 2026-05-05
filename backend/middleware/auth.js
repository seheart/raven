/**
 * Authentication Middleware
 * Provides JWT token generation, verification, and route protection
 */

import jwt from 'jsonwebtoken';
import fs from 'fs';
import { join } from 'path';
import { logger } from '../utils/logger.js';

/**
 * Whether auth is disabled for this process. Requires *both* the
 * Raven-specific opt-in env var and a non-production NODE_ENV — so even
 * if the env var leaks into a prod-like context, auth still engages.
 *
 * @returns {boolean}
 */
export function isAuthDisabled() {
  return (
    process.env.RAVEN_DEV_DISABLE_AUTH === 'true' && process.env.NODE_ENV !== 'production'
  );
}

/**
 * Get JWT secret from file or environment
 * @returns {string} JWT secret
 */
function getJWTSecret() {
  // Check if auth is disabled
  if (isAuthDisabled()) {
    return 'dev-secret-key-for-testing-only';
  }

  // Try to read from .jwt-secret file
  const secretPath = join(process.cwd(), '..', '.raven', '.jwt-secret');
  try {
    if (fs.existsSync(secretPath)) {
      const secret = fs.readFileSync(secretPath, 'utf8').trim();
      if (secret && secret.length >= 32) {
        return secret;
      }
    }
  } catch (error) {
    logger.warn('Failed to read JWT secret from file:', error.message);
  }

  // Fall back to environment variable
  const envSecret = process.env.JWT_SECRET;
  if (envSecret) {
    if (envSecret.length < 32 && process.env.NODE_ENV === 'production') {
      throw new Error('JWT_SECRET must be at least 32 characters in production');
    }
    return envSecret;
  }

  // Development fallback
  if (process.env.NODE_ENV !== 'production') {
    logger.warn('⚠️  Using default JWT secret. Set JWT_SECRET for production!');
    return 'dev-secret-key-for-development-purposes-only';
  }

  throw new Error('JWT_SECRET is required in production');
}

const JWT_SECRET = getJWTSecret();
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';

/**
 * Generate JWT token for user
 * @param {Object} user - User object with id, username, and optional role
 * @returns {string} JWT token
 */
export function generateToken(user) {
  const payload = {
    id: user.id,
    username: user.username,
    role: user.role || 'user'
  };

  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN
  });
}

/**
 * Verify and decode JWT token
 * @param {string} token - JWT token to verify
 * @returns {Object} Decoded token payload
 * @throws {Error} If token is invalid or expired
 */
export function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      throw new Error('Token has expired');
    } else if (error.name === 'JsonWebTokenError') {
      throw new Error('Invalid token');
    }
    throw error;
  }
}

/**
 * Authentication middleware for Express routes
 * Verifies JWT token and attaches user to request
 *
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
export function authenticate(req, res, next) {
  // Skip authentication if disabled (dev-only opt-in)
  if (isAuthDisabled()) {
    req.user = {
      id: 1,
      username: 'dev-user',
      role: 'admin'
    };
    return next();
  }

  // Extract token from Authorization header
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      error: {
        message: 'No authorization token provided',
        code: 'NO_TOKEN',
        statusCode: 401
      }
    });
  }

  const token = authHeader.substring(7); // Remove 'Bearer ' prefix

  try {
    const decoded = verifyToken(token);
    req.user = decoded;
    next();
  } catch (error) {
    logger.warn('Authentication failed:', error.message);
    return res.status(401).json({
      error: {
        message: error.message,
        code: 'INVALID_TOKEN',
        statusCode: 401
      }
    });
  }
}

/**
 * Authorization middleware - checks if user has required role
 * Must be used after authenticate middleware
 *
 * @param {string|string[]} allowedRoles - Required role(s)
 * @returns {Function} Express middleware function
 */
export function authorize(...allowedRoles) {
  return (req, res, next) => {
    // Skip authorization if auth is disabled (dev-only opt-in)
    if (isAuthDisabled()) {
      return next();
    }

    if (!req.user) {
      return res.status(401).json({
        error: {
          message: 'Not authenticated',
          code: 'NOT_AUTHENTICATED',
          statusCode: 401
        }
      });
    }

    const roles = allowedRoles.flat(); // Handle both authorize('admin') and authorize(['admin', 'moderator'])

    if (!roles.includes(req.user.role)) {
      logger.warn(
        `Authorization failed: user ${req.user.username} (${req.user.role}) tried to access resource requiring ${roles.join(' or ')}`
      );
      return res.status(403).json({
        error: {
          message: 'Insufficient permissions',
          code: 'FORBIDDEN',
          statusCode: 403,
          details: {
            required: roles,
            current: req.user.role
          }
        }
      });
    }

    next();
  };
}

/**
 * Socket.IO authentication middleware
 * Verifies JWT token from socket handshake
 *
 * @param {Object} socket - Socket.IO socket object
 * @param {Function} next - Socket.IO next function
 */
export function authenticateSocket(socket, next) {
  // Skip authentication if disabled (dev-only opt-in)
  if (isAuthDisabled()) {
    socket.user = {
      id: 1,
      username: 'dev-user',
      role: 'admin'
    };
    return next();
  }

  try {
    const token = socket.handshake.auth.token;

    if (!token) {
      return next(new Error('No authentication token provided'));
    }

    const decoded = verifyToken(token);
    socket.user = decoded;
    next();
  } catch (error) {
    logger.warn('Socket authentication failed:', error.message);
    next(new Error('Authentication failed: ' + error.message));
  }
}
