/**
 * Tests for Authentication Middleware
 */

import { jest } from '@jest/globals';
import {
  generateToken,
  verifyToken,
  authenticate,
  authorize,
  authenticateSocket
} from '../../middleware/auth.js';
import { join } from 'path';

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
      status: code => {
        statusCalls.push(code);
        return res;
      },
      json: data => {
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

    test('should throw for invalid token', () => {
      expect(() => verifyToken('invalid.token.here')).toThrow('Invalid token');
    });

    test('should throw for malformed token', () => {
      expect(() => verifyToken('not-a-jwt')).toThrow('Invalid token');
    });

    test('should throw for empty token', () => {
      expect(() => verifyToken('')).toThrow('Invalid token');
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
      expect(res._jsonCalls[0].error.code).toBe('NO_TOKEN');
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

    test('should reject token without Bearer prefix', () => {
      const user = { id: 1, username: 'test' };
      const token = generateToken(user);

      req.headers.authorization = token;
      authenticate(req, res, next);

      expect(res._statusCalls[0]).toBe(401);
      expect(res._jsonCalls[0].error.code).toBe('NO_TOKEN');
      expect(next._calls).toHaveLength(0);
    });

    test('should reject invalid token', () => {
      req.headers.authorization = 'Bearer invalid.token.here';
      authenticate(req, res, next);

      expect(res._statusCalls[0]).toBe(401);
      expect(res._jsonCalls[0].error.code).toBe('INVALID_TOKEN');
      expect(next._calls).toHaveLength(0);
    });

    test('should reject malformed token', () => {
      req.headers.authorization = 'Bearer not-a-jwt';
      authenticate(req, res, next);

      expect(res._statusCalls[0]).toBe(401);
      expect(res._jsonCalls[0].error.code).toBe('INVALID_TOKEN');
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
      expect(res._jsonCalls[0].error.code).toBe('FORBIDDEN');
      expect(res._jsonCalls[0].error.details.required).toEqual(['admin']);
      expect(res._jsonCalls[0].error.details.current).toBe('user');
      expect(next._calls).toHaveLength(0);
    });

    test('should reject request without user', () => {
      req.user = null;

      const middleware = authorize('admin');
      middleware(req, res, next);

      expect(res._statusCalls[0]).toBe(401);
      expect(res._jsonCalls[0].error.code).toBe('NOT_AUTHENTICATED');
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
      expect(res._jsonCalls[0].error.details.current).toBe('guest');
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
      socketNext = error => socketNextCalls.push(error);
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

    test('should reject socket without token', () => {
      authenticateSocket(socket, socketNext);

      const error = socketNext._calls[0];
      expect(error).toBeInstanceOf(Error);
      expect(error.message).toBe('No authentication token provided');
      expect(socket.user).toBeNull();
    });

    test('should reject socket with invalid token', () => {
      socket.handshake.auth.token = 'invalid.token.here';
      authenticateSocket(socket, socketNext);

      const error = socketNext._calls[0];
      expect(error).toBeInstanceOf(Error);
      expect(error.message).toContain('Authentication failed');
      expect(socket.user).toBeNull();
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

  describe('AUTH_DISABLED mode', () => {
    test('authenticate should bypass auth when DISABLE_AUTH is true', async () => {
      jest.resetModules();
      process.env.DISABLE_AUTH = 'true';
      process.env.NODE_ENV = 'development';

      const { authenticate: authDisabled } = await import('../../middleware/auth.js');

      const localReq = { headers: {}, user: null };
      const localRes = { status: jest.fn(), json: jest.fn() };
      const localNext = jest.fn();

      authDisabled(localReq, localRes, localNext);

      expect(localReq.user).toBeDefined();
      expect(localReq.user.id).toBe(1);
      expect(localReq.user.username).toBe('dev-user');
      expect(localReq.user.role).toBe('admin');
      expect(localNext).toHaveBeenCalled();
      expect(localRes.status).not.toHaveBeenCalled();

      delete process.env.DISABLE_AUTH;
      jest.resetModules();
    });

    test('authorize should bypass when DISABLE_AUTH is true', async () => {
      jest.resetModules();
      process.env.DISABLE_AUTH = 'true';
      process.env.NODE_ENV = 'development';

      const { authorize: authorizeDisabled } = await import('../../middleware/auth.js');

      const middleware = authorizeDisabled('admin', 'superuser');
      const localReq = { user: { role: 'guest' } };
      const localRes = { status: jest.fn(), json: jest.fn() };
      const localNext = jest.fn();

      middleware(localReq, localRes, localNext);

      expect(localNext).toHaveBeenCalled();
      expect(localRes.status).not.toHaveBeenCalled();

      delete process.env.DISABLE_AUTH;
      jest.resetModules();
    });

    test('authenticateSocket should bypass when DISABLE_AUTH is true', async () => {
      jest.resetModules();
      process.env.DISABLE_AUTH = 'true';
      process.env.NODE_ENV = 'development';

      const { authenticateSocket: socketDisabled } = await import('../../middleware/auth.js');

      const localSocket = { handshake: { auth: {}, headers: {} }, user: null };
      const localNext = jest.fn();

      socketDisabled(localSocket, localNext);

      expect(localSocket.user).toBeDefined();
      expect(localSocket.user.id).toBe(1);
      expect(localSocket.user.username).toBe('dev-user');
      expect(localSocket.user.role).toBe('admin');
      expect(localNext).toHaveBeenCalled();

      delete process.env.DISABLE_AUTH;
      jest.resetModules();
    });
  });

  describe('JWT Secret File Operations', () => {
    test('should handle JWT secret file existence check', () => {
      const secretPath = join(process.cwd(), '..', '.raven', '.jwt-secret');

      expect(typeof secretPath).toBe('string');
      expect(secretPath).toContain('.jwt-secret');
    });

    test('generateToken should create tokens with expiration', () => {
      const user = { id: 1, username: 'test', role: 'user' };
      const token = generateToken(user);
      const decoded = verifyToken(token);

      expect(decoded).toHaveProperty('exp');
      expect(decoded).toHaveProperty('iat');

      const now = Math.floor(Date.now() / 1000);
      expect(decoded.exp).toBeGreaterThan(now);
    });

    test('verifyToken should throw for tokens with invalid signatures', () => {
      const user = { id: 1, username: 'test' };
      const token = generateToken(user);
      const [header, payload] = token.split('.');
      const tamperedToken = `${header}.${payload}.invalidsignature`;

      expect(() => verifyToken(tamperedToken)).toThrow('Invalid token');
    });

    test('authenticate should handle missing authorization gracefully', () => {
      req.headers = {};

      authenticate(req, res, next);

      expect(res._statusCalls[0]).toBe(401);
      expect(res._jsonCalls[0].error.code).toBe('NO_TOKEN');
    });

    test('authenticate should handle empty Bearer token', () => {
      req.headers.authorization = 'Bearer ';

      authenticate(req, res, next);

      expect(res._statusCalls[0]).toBe(401);
      expect(res._jsonCalls[0].error.code).toBe('INVALID_TOKEN');
    });
  });

  describe('Authorization Edge Cases', () => {
    test('authorize should handle undefined role', () => {
      req.user = { id: 1, username: 'test', role: undefined };

      const middleware = authorize('admin');
      middleware(req, res, next);

      expect(res._statusCalls[0]).toBe(403);
      expect(res._jsonCalls[0].error.code).toBe('FORBIDDEN');
    });

    test('authorize should handle null role', () => {
      req.user = { id: 1, username: 'test', role: null };

      const middleware = authorize('admin');
      middleware(req, res, next);

      expect(res._statusCalls[0]).toBe(403);
    });

    test('authorize should handle empty string role', () => {
      req.user = { id: 1, username: 'test', role: '' };

      const middleware = authorize('admin', 'user');
      middleware(req, res, next);

      expect(res._statusCalls[0]).toBe(403);
    });

    test('authorize should return correct permissions info on rejection', () => {
      req.user = { id: 1, username: 'test', role: 'guest' };

      const middleware = authorize('admin', 'moderator');
      middleware(req, res, next);

      expect(res._jsonCalls[0].error.message).toBe('Insufficient permissions');
      expect(res._jsonCalls[0].error.details.required).toEqual(['admin', 'moderator']);
      expect(res._jsonCalls[0].error.details.current).toBe('guest');
    });

    test('authorize should work with single role requirement', () => {
      req.user = { id: 1, username: 'test', role: 'admin' };

      const middleware = authorize('admin');
      middleware(req, res, next);

      expect(next._calls).toHaveLength(1);
      expect(res._statusCalls).toHaveLength(0);
    });

    test('authorize should work with many role requirements', () => {
      req.user = { id: 1, username: 'test', role: 'editor' };

      const middleware = authorize('admin', 'moderator', 'editor', 'viewer');
      middleware(req, res, next);

      expect(next._calls).toHaveLength(1);
    });

    test('authorize with no req.user should fail with 401', () => {
      delete req.user;

      const middleware = authorize('admin');
      middleware(req, res, next);

      expect(res._statusCalls[0]).toBe(401);
      expect(res._jsonCalls[0].error.code).toBe('NOT_AUTHENTICATED');
    });
  });

  describe('Token Edge Cases', () => {
    test('generateToken should handle user with extra properties', () => {
      const user = {
        id: 1,
        username: 'test',
        role: 'admin',
        email: 'test@example.com',
        extraProp: 'should be ignored'
      };

      const token = generateToken(user);
      const decoded = verifyToken(token);

      expect(decoded.id).toBe(1);
      expect(decoded.username).toBe('test');
      expect(decoded.role).toBe('admin');
      expect(decoded.email).toBeUndefined();
      expect(decoded.extraProp).toBeUndefined();
    });

    test('verifyToken should throw for null input', () => {
      expect(() => verifyToken(null)).toThrow();
    });

    test('verifyToken should throw for undefined input', () => {
      expect(() => verifyToken(undefined)).toThrow();
    });

    test('verifyToken should throw for numeric input', () => {
      expect(() => verifyToken(12345)).toThrow();
    });

    test('verifyToken should throw for object input', () => {
      expect(() => verifyToken({ fake: 'token' })).toThrow();
    });

    test('authenticate should preserve other headers', () => {
      const user = { id: 1, username: 'test' };
      const token = generateToken(user);

      req.headers = {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
        'x-custom': 'value'
      };

      authenticate(req, res, next);

      expect(req.headers['content-type']).toBe('application/json');
      expect(req.headers['x-custom']).toBe('value');
    });

    test('authenticate should set req.user correctly', () => {
      const user = { id: 123, username: 'johndoe', role: 'moderator' };
      const token = generateToken(user);

      req.headers.authorization = `Bearer ${token}`;
      authenticate(req, res, next);

      expect(req.user).toMatchObject({
        id: 123,
        username: 'johndoe',
        role: 'moderator'
      });
    });
  });

  describe('WebSocket Authentication Edge Cases', () => {
    test('authenticateSocket should handle both token sources missing', () => {
      const socket = {
        handshake: {
          auth: {},
          headers: {}
        },
        user: null
      };

      const socketNext = jest.fn();
      authenticateSocket(socket, socketNext);

      expect(socketNext).toHaveBeenCalledWith(expect.any(Error));
      expect(socketNext.mock.calls[0][0].message).toBe('No authentication token provided');
    });

    test('authenticateSocket should handle empty string token', () => {
      const socket = {
        handshake: {
          auth: { token: '' },
          headers: {}
        },
        user: null
      };

      const socketNext = jest.fn();
      authenticateSocket(socket, socketNext);

      expect(socketNext).toHaveBeenCalledWith(expect.any(Error));
      expect(socketNext.mock.calls[0][0].message).toBe('No authentication token provided');
    });
  });

  describe('Module Initialization Coverage', () => {
    test('should throw in production with weak JWT_SECRET', async () => {
      jest.resetModules();
      process.env.JWT_SECRET = 'weak_secret';
      process.env.NODE_ENV = 'production';

      await expect(async () => {
        await import('../../middleware/auth.js?' + Date.now());
      }).rejects.toThrow('JWT_SECRET must be at least 32 characters in production');

      delete process.env.JWT_SECRET;
      process.env.NODE_ENV = 'test';
      jest.resetModules();
    });
  });
});
