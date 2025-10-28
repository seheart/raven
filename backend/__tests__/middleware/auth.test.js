/**
 * Tests for Authentication Middleware
 */

import { jest } from '@jest/globals';
import { generateToken, verifyToken, authenticate, authorize, authenticateSocket } from '../../middleware/auth.js';

describe('Authentication Middleware', () => {
  let req, res, next;

  beforeEach(() => {
    // Mock request
    req = {
      headers: {},
      user: null
    };

    // Mock response with tracking
    const statusCalls = [];
    const jsonCalls = [];
    res = {
      status: (code) => {
        statusCalls.push(code);
        return res;
      },
      json: (data) => {
        jsonCalls.push(data);
        return res;
      },
      _statusCalls: statusCalls,
      _jsonCalls: jsonCalls
    };

    // Mock next function
    const nextCalls = [];
    next = (...args) => nextCalls.push(args);
    next._calls = nextCalls;
  });

  describe('generateToken', () => {
    test('should generate token for user with id and username', () => {
      const user = {
        id: 1,
        username: 'testuser'
      };

      const token = generateToken(user);

      expect(typeof token).toBe('string');
      expect(token.length).toBeGreaterThan(0);
      expect(token.split('.')).toHaveLength(3); // JWT has 3 parts
    });

    test('should include user role in token', () => {
      const user = {
        id: 1,
        username: 'testuser',
        role: 'admin'
      };

      const token = generateToken(user);
      const decoded = verifyToken(token);

      expect(decoded.role).toBe('admin');
    });

    test('should default role to user if not provided', () => {
      const user = {
        id: 1,
        username: 'testuser'
      };

      const token = generateToken(user);
      const decoded = verifyToken(token);

      expect(decoded.role).toBe('user');
    });

    test('should include user id in token', () => {
      const user = {
        id: 123,
        username: 'testuser'
      };

      const token = generateToken(user);
      const decoded = verifyToken(token);

      expect(decoded.id).toBe(123);
    });

    test('should include username in token', () => {
      const user = {
        id: 1,
        username: 'johndoe'
      };

      const token = generateToken(user);
      const decoded = verifyToken(token);

      expect(decoded.username).toBe('johndoe');
    });
  });

  describe('verifyToken', () => {
    test('should verify valid token', () => {
      const user = {
        id: 1,
        username: 'testuser',
        role: 'admin'
      };

      const token = generateToken(user);
      const decoded = verifyToken(token);

      expect(decoded).not.toBeNull();
      expect(decoded.id).toBe(1);
      expect(decoded.username).toBe('testuser');
      expect(decoded.role).toBe('admin');
    });

    test('should return null for invalid token', () => {
      const decoded = verifyToken('invalid.token.here');

      expect(decoded).toBeNull();
    });

    test('should return null for malformed token', () => {
      const decoded = verifyToken('not-a-jwt');

      expect(decoded).toBeNull();
    });

    test('should return null for empty token', () => {
      const decoded = verifyToken('');

      expect(decoded).toBeNull();
    });

    test('should include iat and exp claims', () => {
      const user = { id: 1, username: 'test' };
      const token = generateToken(user);
      const decoded = verifyToken(token);

      expect(decoded).toHaveProperty('iat');
      expect(decoded).toHaveProperty('exp');
      expect(decoded.exp).toBeGreaterThan(decoded.iat);
    });
  });

  describe('authenticate middleware', () => {
    test('should reject request without authorization header', () => {
      authenticate(req, res, next);

      expect(res._statusCalls[0]).toBe(401);
      expect(res._jsonCalls[0]).toEqual({ error: 'No authorization header provided' });
      expect(next._calls).toHaveLength(0);
    });

    test('should accept valid Bearer token', () => {
      const user = { id: 1, username: 'test', role: 'user' };
      const token = generateToken(user);

      req.headers.authorization = `Bearer ${token}`;
      authenticate(req, res, next);

      expect(req.user).toBeDefined();
      expect(req.user.id).toBe(1);
      expect(req.user.username).toBe('test');
      expect(next._calls).toHaveLength(1);
    });

    test('should accept token without Bearer prefix', () => {
      const user = { id: 1, username: 'test' };
      const token = generateToken(user);

      req.headers.authorization = token;
      authenticate(req, res, next);

      expect(req.user).toBeDefined();
      expect(req.user.id).toBe(1);
      expect(next._calls).toHaveLength(1);
    });

    test('should reject invalid token', () => {
      req.headers.authorization = 'Bearer invalid.token.here';
      authenticate(req, res, next);

      expect(res._statusCalls[0]).toBe(401);
      expect(res._jsonCalls[0]).toEqual({ error: 'Invalid or expired token' });
      expect(next._calls).toHaveLength(0);
    });

    test('should reject malformed token', () => {
      req.headers.authorization = 'Bearer not-a-jwt';
      authenticate(req, res, next);

      expect(res._statusCalls[0]).toBe(401);
      expect(res._jsonCalls[0].error).toBe('Invalid or expired token');
      expect(next._calls).toHaveLength(0);
    });

    test('should extract token correctly from Bearer format', () => {
      const user = { id: 1, username: 'test' };
      const token = generateToken(user);

      req.headers.authorization = `Bearer ${token}`;
      authenticate(req, res, next);

      expect(req.user.username).toBe('test');
      expect(next._calls).toHaveLength(1);
    });
  });

  describe('authorize middleware', () => {
    test('should allow user with correct role', () => {
      req.user = { id: 1, username: 'test', role: 'admin' };

      const middleware = authorize('admin');
      middleware(req, res, next);

      expect(next._calls).toHaveLength(1);
      expect(res._statusCalls).toHaveLength(0);
    });

    test('should allow user with one of multiple allowed roles', () => {
      req.user = { id: 1, username: 'test', role: 'moderator' };

      const middleware = authorize('admin', 'moderator', 'user');
      middleware(req, res, next);

      expect(next._calls).toHaveLength(1);
    });

    test('should reject user without required role', () => {
      req.user = { id: 1, username: 'test', role: 'user' };

      const middleware = authorize('admin');
      middleware(req, res, next);

      expect(res._statusCalls[0]).toBe(403);
      expect(res._jsonCalls[0].error).toBe('Insufficient permissions');
      expect(res._jsonCalls[0].required).toEqual(['admin']);
      expect(res._jsonCalls[0].current).toBe('user');
      expect(next._calls).toHaveLength(0);
    });

    test('should reject request without user', () => {
      req.user = null;

      const middleware = authorize('admin');
      middleware(req, res, next);

      expect(res._statusCalls[0]).toBe(401);
      expect(res._jsonCalls[0]).toEqual({ error: 'Authentication required' });
      expect(next._calls).toHaveLength(0);
    });

    test('should work with multiple required roles', () => {
      req.user = { id: 1, username: 'test', role: 'admin' };

      const middleware = authorize('admin', 'superadmin');
      middleware(req, res, next);

      expect(next._calls).toHaveLength(1);
    });

    test('should reject when role not in allowed list', () => {
      req.user = { id: 1, username: 'test', role: 'guest' };

      const middleware = authorize('admin', 'user', 'moderator');
      middleware(req, res, next);

      expect(res._statusCalls[0]).toBe(403);
      expect(res._jsonCalls[0].current).toBe('guest');
    });
  });

  describe('authenticateSocket', () => {
    let socket, socketNext;

    beforeEach(() => {
      socket = {
        handshake: {
          auth: {},
          headers: {}
        },
        user: null
      };

      const socketNextCalls = [];
      socketNext = (error) => socketNextCalls.push(error);
      socketNext._calls = socketNextCalls;
    });

    test('should authenticate socket with valid token in auth', () => {
      const user = { id: 1, username: 'test', role: 'user' };
      const token = generateToken(user);

      socket.handshake.auth.token = token;
      authenticateSocket(socket, socketNext);

      expect(socket.user).toBeDefined();
      expect(socket.user.id).toBe(1);
      expect(socket.user.username).toBe('test');
      expect(socketNext._calls[0]).toBeUndefined();
    });

    test('should authenticate socket with valid token in authorization header', () => {
      const user = { id: 1, username: 'test' };
      const token = generateToken(user);

      socket.handshake.headers.authorization = `Bearer ${token}`;
      authenticateSocket(socket, socketNext);

      expect(socket.user).toBeDefined();
      expect(socket.user.id).toBe(1);
      expect(socketNext._calls[0]).toBeUndefined();
    });

    test('should prefer auth.token over authorization header', () => {
      const user1 = { id: 1, username: 'auth' };
      const user2 = { id: 2, username: 'header' };
      const token1 = generateToken(user1);
      const token2 = generateToken(user2);

      socket.handshake.auth.token = token1;
      socket.handshake.headers.authorization = token2;
      authenticateSocket(socket, socketNext);

      expect(socket.user.username).toBe('auth');
    });

    test('should reject socket without token', () => {
      authenticateSocket(socket, socketNext);

      const error = socketNext._calls[0];
      expect(error).toBeInstanceOf(Error);
      expect(error.message).toBe('Authentication required');
      expect(socket.user).toBeNull();
    });

    test('should reject socket with invalid token', () => {
      socket.handshake.auth.token = 'invalid.token.here';
      authenticateSocket(socket, socketNext);

      const error = socketNext._calls[0];
      expect(error).toBeInstanceOf(Error);
      expect(error.message).toBe('Invalid or expired token');
      expect(socket.user).toBeNull();
    });

    test('should strip Bearer prefix from token', () => {
      const user = { id: 1, username: 'test' };
      const token = generateToken(user);

      socket.handshake.auth.token = `Bearer ${token}`;
      authenticateSocket(socket, socketNext);

      expect(socket.user).toBeDefined();
      expect(socket.user.username).toBe('test');
      expect(socketNext._calls[0]).toBeUndefined();
    });

    test('should handle token without Bearer prefix', () => {
      const user = { id: 1, username: 'test' };
      const token = generateToken(user);

      socket.handshake.auth.token = token;
      authenticateSocket(socket, socketNext);

      expect(socket.user).toBeDefined();
      expect(socket.user.username).toBe('test');
    });
  });

  describe('Token Lifecycle', () => {
    test('should create and verify token round-trip', () => {
      const user = {
        id: 42,
        username: 'roundtrip',
        role: 'tester'
      };

      const token = generateToken(user);
      const decoded = verifyToken(token);

      expect(decoded.id).toBe(user.id);
      expect(decoded.username).toBe(user.username);
      expect(decoded.role).toBe(user.role);
    });

    test('should handle special characters in username', () => {
      const user = {
        id: 1,
        username: 'user@example.com'
      };

      const token = generateToken(user);
      const decoded = verifyToken(token);

      expect(decoded.username).toBe('user@example.com');
    });

    test('should handle numeric id', () => {
      const user = { id: 999, username: 'test' };
      const token = generateToken(user);
      const decoded = verifyToken(token);

      expect(decoded.id).toBe(999);
    });

    test('should handle string id', () => {
      const user = { id: 'uuid-123', username: 'test' };
      const token = generateToken(user);
      const decoded = verifyToken(token);

      expect(decoded.id).toBe('uuid-123');
    });
  });
});
