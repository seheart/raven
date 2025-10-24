/**
 * Validation Middleware Tests
 */

import { describe, it, expect } from '@jest/globals';
import { sanitizeFilePath, schemas } from '../middleware/validation.js';

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
});
