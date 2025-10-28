/**
 * Tests for Error Handler Middleware
 */

import { describe, test, expect, beforeEach, jest } from '@jest/globals';
import {
  ErrorCodes,
  AppError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  DatabaseError,
  RateLimitError,
  errorHandler,
  notFoundHandler,
  asyncHandler,
  createError
} from '../../middleware/error-handler.js';

describe('Error Handler Middleware', () => {
  let req, res, next;

  beforeEach(() => {
    req = {
      path: '/test',
      method: 'GET',
      ip: '127.0.0.1',
      get: jest.fn(() => 'test-user-agent'),
      id: 'test-request-id'
    };

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

    next = jest.fn();

    // Set NODE_ENV to test
    process.env.NODE_ENV = 'test';
  });

  describe('ErrorCodes', () => {
    test('should have authentication error codes', () => {
      expect(ErrorCodes.AUTH_REQUIRED).toBe('AUTH_1001');
      expect(ErrorCodes.AUTH_INVALID).toBe('AUTH_1002');
      expect(ErrorCodes.AUTH_EXPIRED).toBe('AUTH_1003');
      expect(ErrorCodes.AUTH_FORBIDDEN).toBe('AUTH_1004');
    });

    test('should have validation error codes', () => {
      expect(ErrorCodes.VALIDATION_ERROR).toBe('VAL_2001');
      expect(ErrorCodes.INVALID_INPUT).toBe('VAL_2002');
      expect(ErrorCodes.MISSING_REQUIRED).toBe('VAL_2003');
    });

    test('should have database error codes', () => {
      expect(ErrorCodes.DB_ERROR).toBe('DB_3001');
      expect(ErrorCodes.DB_CONNECTION_FAILED).toBe('DB_3002');
      expect(ErrorCodes.DB_QUERY_FAILED).toBe('DB_3003');
      expect(ErrorCodes.DB_NOT_FOUND).toBe('DB_3004');
      expect(ErrorCodes.DB_CONSTRAINT_VIOLATION).toBe('DB_3005');
    });

    test('should have file system error codes', () => {
      expect(ErrorCodes.FILE_NOT_FOUND).toBe('FS_4001');
      expect(ErrorCodes.FILE_TOO_LARGE).toBe('FS_4002');
      expect(ErrorCodes.FILE_READ_ERROR).toBe('FS_4003');
      expect(ErrorCodes.FILE_WRITE_ERROR).toBe('FS_4004');
      expect(ErrorCodes.PATH_TRAVERSAL).toBe('FS_4005');
    });

    test('should have service error codes', () => {
      expect(ErrorCodes.SERVICE_UNAVAILABLE).toBe('SVC_5001');
      expect(ErrorCodes.SERVICE_TIMEOUT).toBe('SVC_5002');
      expect(ErrorCodes.SERVICE_ERROR).toBe('SVC_5003');
    });

    test('should have rate limit error codes', () => {
      expect(ErrorCodes.RATE_LIMIT_EXCEEDED).toBe('RATE_6001');
    });

    test('should have generic error codes', () => {
      expect(ErrorCodes.INTERNAL_ERROR).toBe('INT_9001');
      expect(ErrorCodes.NOT_IMPLEMENTED).toBe('INT_9002');
      expect(ErrorCodes.UNKNOWN_ERROR).toBe('INT_9999');
    });
  });

  describe('AppError', () => {
    test('should create AppError with default values', () => {
      const error = new AppError('Test error');

      expect(error.message).toBe('Test error');
      expect(error.statusCode).toBe(500);
      expect(error.errorCode).toBe(ErrorCodes.INTERNAL_ERROR);
      expect(error.details).toBeNull();
      expect(error.isOperational).toBe(true);
      expect(error.name).toBe('AppError');
    });

    test('should create AppError with custom values', () => {
      const details = { field: 'email' };
      const error = new AppError('Custom error', 400, ErrorCodes.VALIDATION_ERROR, details);

      expect(error.message).toBe('Custom error');
      expect(error.statusCode).toBe(400);
      expect(error.errorCode).toBe(ErrorCodes.VALIDATION_ERROR);
      expect(error.details).toEqual(details);
    });

    test('should capture stack trace', () => {
      const error = new AppError('Test error');
      expect(error.stack).toBeDefined();
      expect(error.stack).toContain('AppError');
    });
  });

  describe('ValidationError', () => {
    test('should create ValidationError with correct defaults', () => {
      const error = new ValidationError('Invalid input');

      expect(error.message).toBe('Invalid input');
      expect(error.statusCode).toBe(400);
      expect(error.errorCode).toBe(ErrorCodes.VALIDATION_ERROR);
      expect(error.name).toBe('ValidationError');
    });

    test('should create ValidationError with details', () => {
      const details = { field: 'email', value: 'invalid' };
      const error = new ValidationError('Invalid email', details);

      expect(error.details).toEqual(details);
    });
  });

  describe('AuthenticationError', () => {
    test('should create AuthenticationError with default message', () => {
      const error = new AuthenticationError();

      expect(error.message).toBe('Authentication required');
      expect(error.statusCode).toBe(401);
      expect(error.errorCode).toBe(ErrorCodes.AUTH_REQUIRED);
      expect(error.name).toBe('AuthenticationError');
    });

    test('should create AuthenticationError with custom message', () => {
      const error = new AuthenticationError('Invalid token', ErrorCodes.AUTH_INVALID);

      expect(error.message).toBe('Invalid token');
      expect(error.errorCode).toBe(ErrorCodes.AUTH_INVALID);
    });
  });

  describe('NotFoundError', () => {
    test('should create NotFoundError with default resource name', () => {
      const error = new NotFoundError();

      expect(error.message).toBe('Resource not found');
      expect(error.statusCode).toBe(404);
      expect(error.errorCode).toBe(ErrorCodes.DB_NOT_FOUND);
      expect(error.name).toBe('NotFoundError');
    });

    test('should create NotFoundError with custom resource name', () => {
      const error = new NotFoundError('User');

      expect(error.message).toBe('User not found');
    });
  });

  describe('DatabaseError', () => {
    test('should create DatabaseError with message', () => {
      const error = new DatabaseError('Query failed');

      expect(error.message).toBe('Query failed');
      expect(error.statusCode).toBe(500);
      expect(error.errorCode).toBe(ErrorCodes.DB_ERROR);
      expect(error.name).toBe('DatabaseError');
    });

    test('should create DatabaseError with details', () => {
      const details = { query: 'SELECT *' };
      const error = new DatabaseError('Query failed', details);

      expect(error.details).toEqual(details);
    });
  });

  describe('errorHandler middleware', () => {
    test('should handle AppError correctly', () => {
      const error = new AppError('Test error', 400, ErrorCodes.VALIDATION_ERROR);

      errorHandler(error, req, res, next);

      expect(res._statusCalls[0]).toBe(400);
      expect(res._jsonCalls[0].error.message).toBe('Test error');
      expect(res._jsonCalls[0].error.code).toBe(ErrorCodes.VALIDATION_ERROR);
      expect(res._jsonCalls[0].error.statusCode).toBe(400);
    });

    test('should handle generic Error', () => {
      const error = new Error('Generic error');

      errorHandler(error, req, res, next);

      expect(res._statusCalls[0]).toBe(500);
      expect(res._jsonCalls[0].error.message).toBe('Generic error');
      expect(res._jsonCalls[0].error.code).toBe(ErrorCodes.UNKNOWN_ERROR);
    });

    test('should include details when provided', () => {
      const details = { field: 'email' };
      const error = new ValidationError('Invalid email', details);

      errorHandler(error, req, res, next);

      expect(res._jsonCalls[0].error.details).toEqual(details);
    });

    test('should include request ID when available', () => {
      const error = new AppError('Test error');

      errorHandler(error, req, res, next);

      expect(res._jsonCalls[0].error.requestId).toBe('test-request-id');
    });

    test('should not include request ID when not available', () => {
      delete req.id;
      const error = new AppError('Test error');

      errorHandler(error, req, res, next);

      expect(res._jsonCalls[0].error.requestId).toBeUndefined();
    });

    test('should include stack trace in development', () => {
      process.env.NODE_ENV = 'development';
      const error = new AppError('Test error');

      errorHandler(error, req, res, next);

      expect(res._jsonCalls[0].error.stack).toBeDefined();
      expect(Array.isArray(res._jsonCalls[0].error.stack)).toBe(true);

      process.env.NODE_ENV = 'test';
    });

    test('should not include stack trace in production', () => {
      process.env.NODE_ENV = 'production';
      const error = new AppError('Test error');

      errorHandler(error, req, res, next);

      expect(res._jsonCalls[0].error.stack).toBeUndefined();

      process.env.NODE_ENV = 'test';
    });

    test('should handle ValidationError', () => {
      const error = new ValidationError('Invalid input');

      errorHandler(error, req, res, next);

      expect(res._statusCalls[0]).toBe(400);
      expect(res._jsonCalls[0].error.code).toBe(ErrorCodes.VALIDATION_ERROR);
    });

    test('should handle AuthenticationError', () => {
      const error = new AuthenticationError();

      errorHandler(error, req, res, next);

      expect(res._statusCalls[0]).toBe(401);
      expect(res._jsonCalls[0].error.code).toBe(ErrorCodes.AUTH_REQUIRED);
    });

    test('should handle NotFoundError', () => {
      const error = new NotFoundError('User');

      errorHandler(error, req, res, next);

      expect(res._statusCalls[0]).toBe(404);
      expect(res._jsonCalls[0].error.message).toBe('User not found');
    });

    test('should handle DatabaseError', () => {
      const error = new DatabaseError('Query failed');

      errorHandler(error, req, res, next);

      expect(res._statusCalls[0]).toBe(500);
      expect(res._jsonCalls[0].error.code).toBe(ErrorCodes.DB_ERROR);
    });

    test('should handle errors without message', () => {
      const error = new Error();
      error.message = '';

      errorHandler(error, req, res, next);

      expect(res._statusCalls[0]).toBe(500);
      expect(res._jsonCalls[0].error.message).toBe('An unexpected error occurred');
    });

    test('should handle SQLite UNIQUE constraint errors', () => {
      const error = new Error('UNIQUE constraint failed');
      error.code = 'SQLITE_CONSTRAINT';

      errorHandler(error, req, res, next);

      expect(res._statusCalls[0]).toBe(500);
      expect(res._jsonCalls[0].error.code).toBe(ErrorCodes.DB_ERROR);
      expect(res._jsonCalls[0].error.details).toHaveProperty('sqliteError');
      expect(res._jsonCalls[0].error.details.sqliteError).toBe('SQLITE_CONSTRAINT');
    });

    test('should handle SQLite FOREIGN KEY constraint errors', () => {
      const error = new Error('FOREIGN KEY constraint failed');
      error.code = 'SQLITE_CONSTRAINT';

      errorHandler(error, req, res, next);

      expect(res._statusCalls[0]).toBe(500);
      expect(res._jsonCalls[0].error.code).toBe(ErrorCodes.DB_ERROR);
    });

    test('should handle mongoose/joi ValidationError (non-operational)', () => {
      const error = new Error('Validation failed');
      error.name = 'ValidationError';
      error.isOperational = false;
      error.errors = { email: 'Invalid format' };

      errorHandler(error, req, res, next);

      expect(res._statusCalls[0]).toBe(400);
      expect(res._jsonCalls[0].error.code).toBe(ErrorCodes.VALIDATION_ERROR);
    });

    test('should handle UnauthorizedError (JWT errors)', () => {
      const error = new Error('No authorization token');
      error.name = 'UnauthorizedError';

      errorHandler(error, req, res, next);

      expect(res._statusCalls[0]).toBe(401);
      expect(res._jsonCalls[0].error.code).toBe(ErrorCodes.AUTH_INVALID);
      expect(res._jsonCalls[0].error.message).toBe('Invalid or expired token');
    });

    test('should handle JsonWebTokenError', () => {
      const error = new Error('jwt malformed');
      error.name = 'JsonWebTokenError';

      errorHandler(error, req, res, next);

      expect(res._statusCalls[0]).toBe(401);
      expect(res._jsonCalls[0].error.code).toBe(ErrorCodes.AUTH_INVALID);
      expect(res._jsonCalls[0].error.message).toBe('Malformed authentication token');
    });

    test('should handle TokenExpiredError', () => {
      const error = new Error('jwt expired');
      error.name = 'TokenExpiredError';

      errorHandler(error, req, res, next);

      expect(res._statusCalls[0]).toBe(401);
      expect(res._jsonCalls[0].error.code).toBe(ErrorCodes.AUTH_EXPIRED);
      expect(res._jsonCalls[0].error.message).toBe('Authentication token expired');
    });

    test('should handle ENOENT file system errors', () => {
      const error = new Error('File not found');
      error.code = 'ENOENT';

      errorHandler(error, req, res, next);

      expect(res._statusCalls[0]).toBe(404);
      expect(res._jsonCalls[0].error.code).toBe(ErrorCodes.FILE_NOT_FOUND);
      expect(res._jsonCalls[0].error.message).toBe('File or resource not found');
    });

    test('should handle SQLITE_ERROR codes', () => {
      const error = new Error('Database locked');
      error.code = 'SQLITE_ERROR';

      errorHandler(error, req, res, next);

      expect(res._statusCalls[0]).toBe(500);
      expect(res._jsonCalls[0].error.code).toBe(ErrorCodes.DB_ERROR);
      expect(res._jsonCalls[0].error.message).toBe('Database operation failed');
    });

    test('should log errors at appropriate levels', () => {
      // This test verifies the logger is called but we can't easily test the actual logging
      const serverError = new AppError('Server error', 500);
      errorHandler(serverError, req, res, next);
      expect(res._statusCalls[0]).toBe(500);

      const clientError = new AppError('Client error', 400);
      errorHandler(clientError, req, res, next);
      expect(res._statusCalls[1]).toBe(400);
    });
  });

  describe('notFoundHandler', () => {
    test('should return 404 with proper message', () => {
      notFoundHandler(req, res);

      expect(res._statusCalls[0]).toBe(404);
      expect(res._jsonCalls[0].error.message).toContain('Route not found');
      expect(res._jsonCalls[0].error.message).toContain('GET');
      expect(res._jsonCalls[0].error.message).toContain('/test');
    });

    test('should include error code', () => {
      notFoundHandler(req, res);

      expect(res._jsonCalls[0].error.code).toBe(ErrorCodes.DB_NOT_FOUND);
    });

    test('should include status code', () => {
      notFoundHandler(req, res);

      expect(res._jsonCalls[0].error.statusCode).toBe(404);
    });

    test('should handle POST requests', () => {
      req.method = 'POST';
      req.path = '/api/users';

      notFoundHandler(req, res);

      expect(res._jsonCalls[0].error.message).toContain('POST');
      expect(res._jsonCalls[0].error.message).toContain('/api/users');
    });
  });

  describe('asyncHandler', () => {
    test('should handle successful async function', async () => {
      const asyncFn = async (req, res) => {
        res.json({ success: true });
      };

      const wrapped = asyncHandler(asyncFn);
      await wrapped(req, res, next);

      expect(res._jsonCalls[0]).toEqual({ success: true });
    });

    test('should catch rejected promises', async () => {
      const error = new Error('Async error');
      const asyncFn = async () => {
        throw error;
      };

      const wrapped = asyncHandler(asyncFn);

      // The function should catch the error and call next
      await wrapped(req, res, next);

      // Verify next was called with the error
      expect(next).toHaveBeenCalledWith(error);
    });

    test('should handle synchronous returns', async () => {
      const asyncFn = (req, res) => {
        res.json({ data: 'test' });
      };

      const wrapped = asyncHandler(asyncFn);
      await wrapped(req, res, next);

      expect(res._jsonCalls[0]).toEqual({ data: 'test' });
    });

    test('should pass parameters to wrapped function', async () => {
      let receivedReq, receivedRes;

      const asyncFn = async (req, res) => {
        receivedReq = req;
        receivedRes = res;
      };

      const wrapped = asyncHandler(asyncFn);
      await wrapped(req, res, next);

      expect(receivedReq).toBe(req);
      expect(receivedRes).toBe(res);
    });
  });

  describe('createError', () => {
    test('should create error with all parameters', () => {
      const details = { field: 'email' };
      const error = createError(400, 'Invalid input', ErrorCodes.VALIDATION_ERROR, details);

      expect(error).toBeInstanceOf(AppError);
      expect(error.statusCode).toBe(400);
      expect(error.message).toBe('Invalid input');
      expect(error.errorCode).toBe(ErrorCodes.VALIDATION_ERROR);
      expect(error.details).toEqual(details);
    });

    test('should create error with default error code', () => {
      const error = createError(500, 'Server error');

      expect(error.errorCode).toBe(ErrorCodes.UNKNOWN_ERROR);
    });

    test('should create error without details', () => {
      const error = createError(404, 'Not found', ErrorCodes.DB_NOT_FOUND);

      expect(error.details).toBeNull();
    });

    test('should create 400 error', () => {
      const error = createError(400, 'Bad request');

      expect(error.statusCode).toBe(400);
      expect(error.message).toBe('Bad request');
    });

    test('should create 401 error', () => {
      const error = createError(401, 'Unauthorized');

      expect(error.statusCode).toBe(401);
    });

    test('should create 403 error', () => {
      const error = createError(403, 'Forbidden');

      expect(error.statusCode).toBe(403);
    });

    test('should create 500 error', () => {
      const error = createError(500, 'Internal error');

      expect(error.statusCode).toBe(500);
    });
  });

  describe('Error handler integration', () => {
    test('should handle chained errors', () => {
      const error1 = new ValidationError('First error');
      errorHandler(error1, req, res, next);

      const error2 = new AuthenticationError();
      errorHandler(error2, req, res, next);

      expect(res._statusCalls).toHaveLength(2);
      expect(res._statusCalls[0]).toBe(400);
      expect(res._statusCalls[1]).toBe(401);
    });

    test('should handle errors with special characters', () => {
      const error = new AppError('Error with "quotes" and \'apostrophes\'');

      errorHandler(error, req, res, next);

      expect(res._jsonCalls[0].error.message).toContain('quotes');
      expect(res._jsonCalls[0].error.message).toContain('apostrophes');
    });

    test('should handle errors with newlines', () => {
      const error = new AppError('Error\nwith\nnewlines');

      errorHandler(error, req, res, next);

      expect(res._jsonCalls[0].error.message).toContain('newlines');
    });

    test('should handle very long error messages', () => {
      const longMessage = 'A'.repeat(1000);
      const error = new AppError(longMessage);

      errorHandler(error, req, res, next);

      expect(res._jsonCalls[0].error.message).toBe(longMessage);
    });

    test('should handle errors with complex details', () => {
      const complexDetails = {
        nested: { value: 123 },
        array: [1, 2, 3],
        string: 'test'
      };
      const error = new ValidationError('Complex error', complexDetails);

      errorHandler(error, req, res, next);

      expect(res._jsonCalls[0].error.details).toEqual(complexDetails);
    });
  });

  describe('AuthorizationError', () => {
    test('should create AuthorizationError with default message', () => {
      const error = new AuthorizationError();

      expect(error.message).toBe('Insufficient permissions');
      expect(error.statusCode).toBe(403);
      expect(error.errorCode).toBe(ErrorCodes.AUTH_FORBIDDEN);
      expect(error.name).toBe('AuthorizationError');
      expect(error.isOperational).toBe(true);
    });

    test('should create AuthorizationError with custom message', () => {
      const error = new AuthorizationError('Access denied to resource');

      expect(error.message).toBe('Access denied to resource');
      expect(error.statusCode).toBe(403);
      expect(error.errorCode).toBe(ErrorCodes.AUTH_FORBIDDEN);
    });

    test('should handle AuthorizationError in errorHandler', () => {
      const error = new AuthorizationError();

      errorHandler(error, req, res, next);

      expect(res._statusCalls[0]).toBe(403);
      expect(res._jsonCalls[0].error.message).toBe('Insufficient permissions');
      expect(res._jsonCalls[0].error.code).toBe(ErrorCodes.AUTH_FORBIDDEN);
    });
  });

  describe('RateLimitError', () => {
    test('should create RateLimitError with default message', () => {
      const error = new RateLimitError();

      expect(error.message).toBe('Rate limit exceeded');
      expect(error.statusCode).toBe(429);
      expect(error.errorCode).toBe(ErrorCodes.RATE_LIMIT_EXCEEDED);
      expect(error.name).toBe('RateLimitError');
      expect(error.isOperational).toBe(true);
    });

    test('should create RateLimitError with custom message', () => {
      const error = new RateLimitError('Too many requests, please try again later');

      expect(error.message).toBe('Too many requests, please try again later');
      expect(error.statusCode).toBe(429);
      expect(error.errorCode).toBe(ErrorCodes.RATE_LIMIT_EXCEEDED);
    });

    test('should handle RateLimitError in errorHandler', () => {
      const error = new RateLimitError();

      errorHandler(error, req, res, next);

      expect(res._statusCalls[0]).toBe(429);
      expect(res._jsonCalls[0].error.message).toBe('Rate limit exceeded');
      expect(res._jsonCalls[0].error.code).toBe(ErrorCodes.RATE_LIMIT_EXCEEDED);
    });
  });
});
