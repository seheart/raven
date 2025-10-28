/**
 * Validation Middleware Tests
 */

import { describe, it, expect } from '@jest/globals';
import { sanitizeFilePath, schemas, validate, validateFilePath } from '../middleware/validation.js';

describe('Validation', () => {
  describe('sanitizeFilePath', () => {
    it('should allow valid relative paths', () => {
      expect(sanitizeFilePath('src/file.js')).toBe('src/file.js');
      expect(sanitizeFilePath('test/data/file.txt')).toBe('test/data/file.txt');
    });

    it('should normalize paths', () => {
      expect(sanitizeFilePath('src/./file.js')).toBe('src/file.js');
      expect(sanitizeFilePath('src//file.js')).toBe('src/file.js');
    });

    it('should reject directory traversal attempts', () => {
      expect(() => sanitizeFilePath('../etc/passwd')).toThrow('Path traversal detected');
      expect(() => sanitizeFilePath('src/../../etc/passwd')).toThrow('Path traversal detected');
    });

    it('should handle null input', () => {
      expect(sanitizeFilePath(null)).toBeNull();
      expect(sanitizeFilePath(undefined)).toBeNull();
    });

    it('should allow absolute paths but prevent traversal', () => {
      const absolutePath = '/Users/test/project/file.js';
      expect(sanitizeFilePath(absolutePath)).toBe(absolutePath);
    });
  });

  describe('Login Schema', () => {
    it('should validate correct login data', () => {
      const { error, value } = schemas.login.validate({
        username: 'testuser',
        password: 'password123'
      });

      expect(error).toBeUndefined();
      expect(value.username).toBe('testuser');
      expect(value.password).toBe('password123');
    });

    it('should reject short usernames', () => {
      const { error } = schemas.login.validate({
        username: 'ab',
        password: 'password123'
      });

      expect(error).toBeDefined();
      expect(error.details[0].message).toContain('at least 3 characters');
    });

    it('should reject short passwords', () => {
      const { error } = schemas.login.validate({
        username: 'testuser',
        password: 'pass'
      });

      expect(error).toBeDefined();
      expect(error.details[0].message).toContain('at least 8 characters');
    });

    it('should reject non-alphanumeric usernames', () => {
      const { error } = schemas.login.validate({
        username: 'test@user',
        password: 'password123'
      });

      expect(error).toBeDefined();
    });

    it('should require both fields', () => {
      const { error: error1 } = schemas.login.validate({
        username: 'testuser'
      });

      const { error: error2 } = schemas.login.validate({
        password: 'password123'
      });

      expect(error1).toBeDefined();
      expect(error2).toBeDefined();
    });
  });

  describe('File Path Schema', () => {
    it('should validate safe file paths', () => {
      const { error } = schemas.filePath.validate({
        filepath: 'src/components/App.svelte'
      });

      expect(error).toBeUndefined();
    });

    it('should reject paths with special characters', () => {
      const { error } = schemas.filePath.validate({
        filepath: 'src/file?.js'
      });

      expect(error).toBeDefined();
    });

    it('should reject empty paths', () => {
      const { error } = schemas.filePath.validate({
        filepath: ''
      });

      expect(error).toBeDefined();
    });
  });

  describe('Event Query Schema', () => {
    it('should apply default values', () => {
      const { error, value } = schemas.eventQuery.validate({});

      expect(error).toBeUndefined();
      expect(value.limit).toBe(100);
      expect(value.offset).toBe(0);
      expect(value.search).toBe('');
      expect(value.eventType).toBe('all');
    });

    it('should validate custom values', () => {
      const { error, value } = schemas.eventQuery.validate({
        limit: 50,
        offset: 10,
        search: 'test',
        eventType: 'file'
      });

      expect(error).toBeUndefined();
      expect(value.limit).toBe(50);
      expect(value.offset).toBe(10);
      expect(value.search).toBe('test');
      expect(value.eventType).toBe('file');
    });

    it('should enforce limit maximum', () => {
      const { error } = schemas.eventQuery.validate({
        limit: 2000
      });

      expect(error).toBeDefined();
      expect(error.details[0].message).toContain('less than or equal to 1000');
    });

    it('should reject negative offset', () => {
      const { error } = schemas.eventQuery.validate({
        offset: -1
      });

      expect(error).toBeDefined();
    });

    it('should validate event types', () => {
      const validTypes = ['all', 'file', 'agent', 'system'];

      validTypes.forEach(type => {
        const { error } = schemas.eventQuery.validate({ eventType: type });
        expect(error).toBeUndefined();
      });

      const { error } = schemas.eventQuery.validate({ eventType: 'invalid' });
      expect(error).toBeDefined();
    });
  });

  describe('Error Log Schema', () => {
    it('should validate complete error log', () => {
      const { error, value } = schemas.errorLog.validate({
        error_type: 'TypeError',
        message: 'Cannot read property of undefined',
        stack: 'Error stack trace here',
        component: 'App.svelte',
        user_agent: 'Mozilla/5.0...',
        url: 'http://localhost:5173',
        metadata: { extra: 'data' },
        severity: 'error'
      });

      expect(error).toBeUndefined();
      expect(value.error_type).toBe('TypeError');
      expect(value.severity).toBe('error');
    });

    it('should require mandatory fields', () => {
      const { error } = schemas.errorLog.validate({});

      expect(error).toBeDefined();
      expect(error.details.length).toBeGreaterThan(0);
    });

    it('should apply default severity', () => {
      const { error, value } = schemas.errorLog.validate({
        error_type: 'Error',
        message: 'Test error'
      });

      expect(error).toBeUndefined();
      expect(value.severity).toBe('error');
    });

    it('should validate severity values', () => {
      const validSeverities = ['error', 'warning', 'info'];

      validSeverities.forEach(severity => {
        const { error } = schemas.errorLog.validate({
          error_type: 'Error',
          message: 'Test',
          severity
        });
        expect(error).toBeUndefined();
      });

      const { error } = schemas.errorLog.validate({
        error_type: 'Error',
        message: 'Test',
        severity: 'invalid'
      });
      expect(error).toBeDefined();
    });
  });

  describe('Notification Schema', () => {
    it('should validate notification query with defaults', () => {
      const { error, value } = schemas.notificationQuery.validate({});

      expect(error).toBeUndefined();
      expect(value.limit).toBe(50);
      expect(value.offset).toBe(0);
      expect(value.type).toBe('all');
      expect(value.severity).toBe('all');
      expect(value.unread_only).toBe(false);
    });

    it('should validate unread_only flag', () => {
      const { error, value } = schemas.notificationQuery.validate({
        unread_only: true
      });

      expect(error).toBeUndefined();
      expect(value.unread_only).toBe(true);
    });
  });

  describe('Telemetry Schema', () => {
    it('should validate complete telemetry data', () => {
      const { error, value } = schemas.telemetry.validate({
        agent: 'Claude',
        event_type: 'edit',
        file: 'src/App.svelte',
        lines_changed: 10,
        duration_ms: 150,
        message: 'Updated component',
        metadata: { tool: 'edit' }
      });

      expect(error).toBeUndefined();
      expect(value.agent).toBe('Claude');
      expect(value.lines_changed).toBe(10);
    });

    it('should require mandatory telemetry fields', () => {
      const { error } = schemas.telemetry.validate({
        agent: 'Claude'
      });

      expect(error).toBeDefined();
    });

    it('should reject negative numbers', () => {
      const { error } = schemas.telemetry.validate({
        agent: 'Claude',
        event_type: 'edit',
        message: 'Test',
        lines_changed: -5
      });

      expect(error).toBeDefined();
    });
  });

  describe('ID Parameter Schema', () => {
    it('should validate positive integers', () => {
      const { error, value } = schemas.id.validate({ id: 42 });

      expect(error).toBeUndefined();
      expect(value.id).toBe(42);
    });

    it('should reject zero and negative numbers', () => {
      const { error: error1 } = schemas.id.validate({ id: 0 });
      const { error: error2 } = schemas.id.validate({ id: -1 });

      expect(error1).toBeDefined();
      expect(error2).toBeDefined();
    });

    it('should reject non-integers', () => {
      const { error } = schemas.id.validate({ id: 3.14 });

      expect(error).toBeDefined();
    });
  });

  describe('File Content Schema', () => {
    it('should validate file content', () => {
      const { error } = schemas.fileContent.validate({
        filepath: 'src/file.js',
        content: 'console.log("test");'
      });

      expect(error).toBeUndefined();
    });

    it('should enforce content size limit', () => {
      const largeContent = 'x'.repeat(11 * 1024 * 1024); // 11MB

      const { error } = schemas.fileContent.validate({
        filepath: 'test.txt',
        content: largeContent
      });

      expect(error).toBeDefined();
    });
  });

  describe('sanitizeFilePath - Advanced', () => {
    it('should reject null bytes', () => {
      expect(() => sanitizeFilePath('file\0.txt')).toThrow('Null bytes detected');
    });

    it('should reject non-string input', () => {
      expect(sanitizeFilePath(123)).toBeNull();
      expect(sanitizeFilePath({})).toBeNull();
      expect(sanitizeFilePath([])).toBeNull();
    });

    it('should handle baseDir validation', () => {
      const baseDir = '/tmp/project';
      const result = sanitizeFilePath('src/file.js', baseDir);
      expect(result).toContain(baseDir);
    });

    it('should reject paths outside baseDir', () => {
      const baseDir = '/tmp/project';
      expect(() => sanitizeFilePath('../outside/file.js', baseDir))
        .toThrow('Path traversal detected');
    });

    it('should block sensitive paths', () => {
      expect(() => sanitizeFilePath('/etc/passwd')).toThrow('Access to sensitive path denied');
      expect(() => sanitizeFilePath('/etc/shadow')).toThrow('Access to sensitive path denied');
      expect(() => sanitizeFilePath('/home/user/.ssh/id_rsa')).toThrow('Access to sensitive path denied');
      expect(() => sanitizeFilePath('/home/user/.aws/credentials')).toThrow('Access to sensitive path denied');
      expect(() => sanitizeFilePath('/app/.env')).toThrow('Access to sensitive path denied');
    });

    it('should normalize relative paths', () => {
      expect(sanitizeFilePath('src/./././file.js')).toBe('src/file.js');
    });

    it('should handle empty string', () => {
      expect(sanitizeFilePath('')).toBeNull();
    });
  });

  describe('Register Schema', () => {
    it('should validate registration with default role', () => {
      const { error, value } = schemas.register.validate({
        username: 'newuser',
        password: 'password123'
      });

      expect(error).toBeUndefined();
      expect(value.role).toBe('user');
    });

    it('should validate with admin role', () => {
      const { error, value } = schemas.register.validate({
        username: 'admin',
        password: 'password123',
        role: 'admin'
      });

      expect(error).toBeUndefined();
      expect(value.role).toBe('admin');
    });

    it('should reject invalid roles', () => {
      const { error } = schemas.register.validate({
        username: 'test',
        password: 'password123',
        role: 'superuser'
      });

      expect(error).toBeDefined();
    });
  });

  describe('Change Password Schema', () => {
    it('should validate password change', () => {
      const { error } = schemas.changePassword.validate({
        oldPassword: 'oldpass123',
        newPassword: 'newpass123'
      });

      expect(error).toBeUndefined();
    });

    it('should require old password', () => {
      const { error } = schemas.changePassword.validate({
        newPassword: 'newpass123'
      });

      expect(error).toBeDefined();
    });

    it('should enforce new password length', () => {
      const { error } = schemas.changePassword.validate({
        oldPassword: 'oldpass123',
        newPassword: 'short'
      });

      expect(error).toBeDefined();
    });
  });

  describe('Storage Cleanup Schema', () => {
    it('should validate with days', () => {
      const { error, value } = schemas.storageCleanup.validate({
        olderThanDays: 30
      });

      expect(error).toBeUndefined();
      expect(value.olderThanDays).toBe(30);
    });

    it('should allow empty object', () => {
      const { error } = schemas.storageCleanup.validate({});
      expect(error).toBeUndefined();
    });

    it('should reject days over 365', () => {
      const { error } = schemas.storageCleanup.validate({
        olderThanDays: 400
      });

      expect(error).toBeDefined();
    });
  });

  describe('Sync Config Schema', () => {
    it('should validate complete sync config', () => {
      const { error, value } = schemas.syncConfig.validate({
        enabled: true,
        host: 'example.com',
        port: 22,
        username: 'user',
        remotePath: '/remote/path',
        schedule: '0 * * * *'
      });

      expect(error).toBeUndefined();
      expect(value.enabled).toBe(true);
    });

    it('should require enabled field', () => {
      const { error } = schemas.syncConfig.validate({});
      expect(error).toBeDefined();
    });

    it('should validate port range', () => {
      const { error: error1 } = schemas.syncConfig.validate({
        enabled: true,
        port: 0
      });
      const { error: error2 } = schemas.syncConfig.validate({
        enabled: true,
        port: 99999
      });

      expect(error1).toBeDefined();
      expect(error2).toBeDefined();
    });
  });

  describe('Pagination Schema', () => {
    it('should apply defaults', () => {
      const { error, value } = schemas.pagination.validate({});

      expect(error).toBeUndefined();
      expect(value.limit).toBe(100);
      expect(value.offset).toBe(0);
    });
  });

  describe('Error Query Schema', () => {
    it('should validate with defaults', () => {
      const { error, value } = schemas.errorQuery.validate({});

      expect(error).toBeUndefined();
      expect(value.severity).toBe('all');
    });
  });

  describe('Activity Log Query Schema', () => {
    it('should validate with defaults', () => {
      const { error, value } = schemas.activityLogQuery.validate({});

      expect(error).toBeUndefined();
      expect(value.limit).toBe(500);
      expect(value.type).toBe('all');
    });

    it('should validate type values', () => {
      ['all', 'add', 'change', 'unlink'].forEach(type => {
        const { error } = schemas.activityLogQuery.validate({ type });
        expect(error).toBeUndefined();
      });
    });
  });

  describe('Tracked Files Query Schema', () => {
    it('should validate project parameter', () => {
      const { error, value } = schemas.trackedFilesQuery.validate({
        project: 'my-project',
        limit: 50
      });

      expect(error).toBeUndefined();
      expect(value.project).toBe('my-project');
    });

    it('should reject invalid project names', () => {
      const { error } = schemas.trackedFilesQuery.validate({
        project: 'invalid@project'
      });

      expect(error).toBeDefined();
    });
  });

  describe('Events By Session Params Schema', () => {
    it('should validate UUID v4', () => {
      const { error, value } = schemas.eventsBySessionParams.validate({
        sessionId: '550e8400-e29b-41d4-a716-446655440000'
      });

      expect(error).toBeUndefined();
    });

    it('should reject invalid UUID', () => {
      const { error } = schemas.eventsBySessionParams.validate({
        sessionId: 'not-a-uuid'
      });

      expect(error).toBeDefined();
    });
  });

  describe('File Events Query Schema', () => {
    it('should validate diff parameter', () => {
      const { error, value } = schemas.fileEventsQuery.validate({
        diff: 'true'
      });

      expect(error).toBeUndefined();
      expect(value.diff).toBe('true');
    });

    it('should apply defaults', () => {
      const { error, value } = schemas.fileEventsQuery.validate({});

      expect(error).toBeUndefined();
      expect(value.diff).toBe('false');
      expect(value.limit).toBe(100);
    });
  });

  describe('All File Events Query Schema', () => {
    it('should validate query', () => {
      const { error, value } = schemas.allFileEventsQuery.validate({
        limit: 200,
        diff: 'true'
      });

      expect(error).toBeUndefined();
      expect(value.limit).toBe(200);
    });
  });

  describe('Create Notification Schema', () => {
    it('should validate complete notification', () => {
      const { error, value } = schemas.createNotification.validate({
        type: 'update',
        severity: 'info',
        title: 'New Update',
        message: 'System updated successfully',
        metadata: { version: '1.0.0' }
      });

      expect(error).toBeUndefined();
      expect(value.type).toBe('update');
    });

    it('should require all mandatory fields', () => {
      const { error } = schemas.createNotification.validate({
        type: 'update'
      });

      expect(error).toBeDefined();
    });

    it('should validate severity options', () => {
      ['info', 'warning', 'error', 'success'].forEach(severity => {
        const { error } = schemas.createNotification.validate({
          type: 'test',
          severity,
          title: 'Test',
          message: 'Test message'
        });
        expect(error).toBeUndefined();
      });
    });
  });

  describe('validate() middleware', () => {
    let req, res, next;

    beforeEach(() => {
      req = { body: {}, query: {}, params: {} };

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

      const nextCalls = [];
      next = (...args) => nextCalls.push(args);
      next._calls = nextCalls;
    });

    it('should validate body data', () => {
      req.body = { username: 'testuser', password: 'password123' };

      const middleware = validate('login', 'body');
      middleware(req, res, next);

      expect(next._calls).toHaveLength(1);
      expect(res._statusCalls).toHaveLength(0);
    });

    it('should validate query data', () => {
      req.query = { limit: '50', offset: '10' };

      const middleware = validate('pagination', 'query');
      middleware(req, res, next);

      expect(next._calls).toHaveLength(1);
    });

    it('should validate params data', () => {
      req.params = { id: '42' };

      const middleware = validate('id', 'params');
      middleware(req, res, next);

      expect(next._calls).toHaveLength(1);
    });

    it('should reject invalid data', () => {
      req.body = { username: 'ab', password: 'short' };

      const middleware = validate('login', 'body');
      middleware(req, res, next);

      expect(res._statusCalls[0]).toBe(400);
      expect(res._jsonCalls[0].error).toBe('Validation failed');
      expect(res._jsonCalls[0].details).toBeDefined();
      expect(next._calls).toHaveLength(0);
    });

    it('should return multiple validation errors', () => {
      req.body = {};

      const middleware = validate('login', 'body');
      middleware(req, res, next);

      expect(res._jsonCalls[0].details.length).toBeGreaterThan(1);
    });

    it('should strip unknown fields', () => {
      req.body = {
        username: 'testuser',
        password: 'password123',
        unknownField: 'should be removed'
      };

      const middleware = validate('login', 'body');
      middleware(req, res, next);

      expect(req.body.unknownField).toBeUndefined();
    });

    it('should handle invalid schema name', () => {
      const middleware = validate('nonexistentSchema', 'body');
      middleware(req, res, next);

      expect(res._statusCalls[0]).toBe(500);
      expect(res._jsonCalls[0].error).toBe('Invalid validation schema');
    });

    it('should default to body source', () => {
      req.body = { username: 'testuser', password: 'password123' };

      const middleware = validate('login');
      middleware(req, res, next);

      expect(next._calls).toHaveLength(1);
    });

    it('should apply defaults for optional fields', () => {
      req.body = {};

      const middleware = validate('eventQuery', 'body');
      middleware(req, res, next);

      expect(req.body.limit).toBe(100);
      expect(req.body.offset).toBe(0);
    });
  });

  describe('validateFilePath() middleware', () => {
    let req, res, next;

    beforeEach(() => {
      req = { body: {}, query: {}, params: {} };

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

      const nextCalls = [];
      next = (...args) => nextCalls.push(args);
      next._calls = nextCalls;
    });

    it('should sanitize filepath in body', () => {
      req.body.filepath = 'src/./file.js';

      validateFilePath(req, res, next);

      expect(req.body.filepath).toBe('src/file.js');
      expect(next._calls).toHaveLength(1);
    });

    it('should sanitize filepath in query', () => {
      req.query.filepath = 'src//file.js';

      validateFilePath(req, res, next);

      expect(req.query.filepath).toBe('src/file.js');
      expect(next._calls).toHaveLength(1);
    });

    it('should sanitize filepath in params', () => {
      req.params.filepath = 'src/file.js';

      validateFilePath(req, res, next);

      expect(req.params.filepath).toBe('src/file.js');
      expect(next._calls).toHaveLength(1);
    });

    it('should reject path traversal in body', () => {
      req.body.filepath = '../etc/passwd';

      validateFilePath(req, res, next);

      expect(res._statusCalls[0]).toBe(400);
      expect(res._jsonCalls[0].error).toBe('Path traversal detected');
      expect(next._calls).toHaveLength(0);
    });

    it('should reject null bytes', () => {
      req.body.filepath = 'file\0.txt';

      validateFilePath(req, res, next);

      expect(res._statusCalls[0]).toBe(400);
      expect(res._jsonCalls[0].error).toBe('Null bytes detected in path');
    });

    it('should reject sensitive paths', () => {
      req.params.filepath = '/etc/passwd';

      validateFilePath(req, res, next);

      expect(res._statusCalls[0]).toBe(400);
      expect(res._jsonCalls[0].error).toBe('Access to sensitive path denied');
    });

    it('should handle requests without filepath', () => {
      validateFilePath(req, res, next);

      expect(next._calls).toHaveLength(1);
      expect(res._statusCalls).toHaveLength(0);
    });
  });
});
