/**
 * Authentication Middleware for Raven
 * Implements JWT-based authentication with role-based access control
 */

import jwt from 'jsonwebtoken';

// JWT Secret - MUST be changed in production via environment variable
const JWT_SECRET = process.env.JWT_SECRET || 'raven-dev-secret-change-in-production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';

// Authentication disabled flag (for backwards compatibility during migration)
const AUTH_DISABLED = process.env.DISABLE_AUTH === 'true';

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
  } catch (error) {
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
