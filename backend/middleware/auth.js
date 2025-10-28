/**
 * Authentication Middleware for Raven
 * Implements JWT-based authentication with role-based access control
 */

import jwt from 'jsonwebtoken';
import { randomBytes } from 'crypto';
import fs from 'fs';
import { join } from 'path';
import { logger } from '../utils/logger.js';

// Validate JWT secret in production
const NODE_ENV = process.env.NODE_ENV || 'development';
const IS_PRODUCTION = NODE_ENV === 'production';

/**
 * Load or generate JWT secret
 * - Tries to load from .raven/.jwt-secret file
 * - Generates new random secret if file doesn't exist
 * - Validates secret strength
 */
function loadOrGenerateJWTSecret() {
  const RAVEN_DIR = join(process.cwd(), '..', '.raven');
  const SECRET_FILE = join(RAVEN_DIR, '.jwt-secret');

  // Try to load existing secret
  if (fs.existsSync(SECRET_FILE)) {
    try {
      const secret = fs.readFileSync(SECRET_FILE, 'utf8').trim();

      // Validate secret strength
      if (secret.length < 32) {
        logger.warn('⚠️  Loaded JWT secret is weak (< 32 chars) - consider regenerating');
      }

      logger.info('✓ Loaded JWT secret from file');
      return secret;
    } catch (error) {
      logger.error('Failed to read JWT secret file:', error);
      // Fall through to generate new secret
    }
  }

  // Generate new secure secret (64 bytes = 128 hex chars)
  const secret = randomBytes(64).toString('hex');

  // Ensure .raven directory exists
  if (!fs.existsSync(RAVEN_DIR)) {
    fs.mkdirSync(RAVEN_DIR, { recursive: true, mode: 0o700 });
  }

  // Write secret to file with restrictive permissions
  try {
    fs.writeFileSync(SECRET_FILE, secret, { mode: 0o600 });
    logger.warn('🔐 Generated new JWT secret - stored in .raven/.jwt-secret');
    logger.warn('⚠️  IMPORTANT: Back up this file! Lost secrets invalidate all tokens.');
    logger.warn('⚠️  IMPORTANT: Set JWT_SECRET environment variable in production.');
  } catch (error) {
    logger.error('Failed to write JWT secret file:', error);
    logger.warn('Using in-memory secret (will change on restart)');
  }

  return secret;
}

// JWT Secret - Load from env or generate/load from file
const JWT_SECRET = process.env.JWT_SECRET || loadOrGenerateJWTSecret();

// Validate secret strength
if (JWT_SECRET.length < 32) {
  logger.error('❌ JWT_SECRET is too weak (< 32 chars)');
  if (IS_PRODUCTION) {
    throw new Error('JWT_SECRET must be at least 32 characters in production');
  }
}

// Warn if using potentially default-looking secret
if (JWT_SECRET.includes('dev') || JWT_SECRET.includes('secret') || JWT_SECRET.includes('default')) {
  logger.warn('⚠️  JWT_SECRET appears to contain common words - ensure it is truly random');
}

const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';

// Authentication disabled flag - ONLY allowed in development
const AUTH_DISABLED = process.env.DISABLE_AUTH === 'true' && !IS_PRODUCTION;

// Log warnings for security configurations
if (AUTH_DISABLED) {
  logger.warn('⚠️  Authentication is DISABLED (development mode only)');
} else if (process.env.DISABLE_AUTH === 'true' && IS_PRODUCTION) {
  logger.error('❌ DISABLE_AUTH is not allowed in production mode - ignoring');
}

if (IS_PRODUCTION && !process.env.JWT_SECRET) {
  logger.warn('⚠️  Production detected but JWT_SECRET not set in environment');
  logger.warn('⚠️  Using file-based secret - set JWT_SECRET env var for best security');
}

/**
 * Generate JWT token for user
 */
export function generateToken(user) {
  return jwt.sign(
    {
      id: user.id,
      username: user.username,
      role: user.role || 'user'
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

/**
 * Verify JWT token
 */
export function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (_error) {
    return null;
  }
}

/**
 * Authentication middleware - protects routes
 */
export function authenticate(req, res, next) {
  // Allow bypass if authentication is disabled (backwards compatibility)
  if (AUTH_DISABLED) {
    req.user = { id: 'system', username: 'system', role: 'admin' };
    return next();
  }

  // Extract token from Authorization header
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ error: 'No authorization header provided' });
  }

  const token = authHeader.startsWith('Bearer ')
    ? authHeader.substring(7)
    : authHeader;

  const decoded = verifyToken(token);
  if (!decoded) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  req.user = decoded;
  next();
}

/**
 * Role-based authorization middleware
 */
export function authorize(...allowedRoles) {
  return (req, res, next) => {
    if (AUTH_DISABLED) {
      return next();
    }

    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        error: 'Insufficient permissions',
        required: allowedRoles,
        current: req.user.role
      });
    }

    next();
  };
}

/**
 * WebSocket authentication middleware
 */
export function authenticateSocket(socket, next) {
  if (AUTH_DISABLED) {
    socket.user = { id: 'system', username: 'system', role: 'admin' };
    return next();
  }

  const token = socket.handshake.auth.token || socket.handshake.headers.authorization;

  if (!token) {
    return next(new Error('Authentication required'));
  }

  const cleanToken = token.startsWith('Bearer ') ? token.substring(7) : token;
  const decoded = verifyToken(cleanToken);

  if (!decoded) {
    return next(new Error('Invalid or expired token'));
  }

  socket.user = decoded;
  next();
}
