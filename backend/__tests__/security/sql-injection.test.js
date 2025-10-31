/**
 * SQL Injection Prevention Test Suite
 * Tests database queries against SQL injection attacks
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { RavenDB } from '../../db.js';
import fs from 'fs';

describe('SQL Injection Prevention', () => {
  let db;
  const testDbPath = '.raven/test-sql-injection.db';

  beforeEach(() => {
    // Create test database
    db = new RavenDB(testDbPath);
  });

  afterEach(() => {
    // Clean up
    db.close();
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  describe('Prepared Statements', () => {
    it('should use prepared statements for inserts', () => {
      const maliciousInput = "'; DROP TABLE events; --";
      
      const event = {
        timestamp: new Date().toISOString(),
        filepath: maliciousInput,
        change_type: 'modified'
      };

      // Should not throw and should not drop the table
      expect(() => {
        db.insertEvent(event);
      }).not.toThrow();

      // Table should still exist
      const tables = db.db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
      const hasEventsTable = tables.some(t => t.name === 'events');
      expect(hasEventsTable).toBe(true);
    });

    it('should escape quotes in queries', () => {
      const maliciousPath = "test' OR '1'='1";
      
      const event = {
        timestamp: new Date().toISOString(),
        filepath: maliciousPath,
        change_type: 'modified'
      };

      db.insertEvent(event);
      
      // Query should return only exact match, not all rows
      const result = db.db.prepare('SELECT * FROM events WHERE filepath = ?').all(maliciousPath);
      expect(result.length).toBe(1);
      expect(result[0].filepath).toBe(maliciousPath);
    });

    it('should prevent UNION-based injections', () => {
      const maliciousInput = "' UNION SELECT * FROM sqlite_master --";
      
      const event = {
        timestamp: new Date().toISOString(),
        filepath: maliciousInput,
        change_type: 'modified'
      };

      db.insertEvent(event);
      const results = db.getRecentEvents(10);
      
      // Should only return events, not schema info
      results.forEach(row => {
        expect(row).toHaveProperty('filepath');
        expect(row).toHaveProperty('change_type');
      });
    });

    it('should prevent time-based blind injections', () => {
      const maliciousInput = "' OR SLEEP(5) --";
      
      const startTime = Date.now();
      const event = {
        timestamp: new Date().toISOString(),
        filepath: maliciousInput,
        change_type: 'modified'
      };
      
      db.insertEvent(event);
      const endTime = Date.now();
      
      // Should complete quickly (< 1 second), not delay 5 seconds
      expect(endTime - startTime).toBeLessThan(1000);
    });
  });

  describe('Input Validation', () => {
    it('should handle null bytes in input', () => {
      const inputWithNull = "test\x00file.js";
      
      const event = {
        timestamp: new Date().toISOString(),
        filepath: inputWithNull,
        change_type: 'modified'
      };

      expect(() => db.insertEvent(event)).not.toThrow();
    });

    it('should handle very long inputs', () => {
      const longInput = 'a'.repeat(10000);
      
      const event = {
        timestamp: new Date().toISOString(),
        filepath: longInput,
        change_type: 'modified'
      };

      expect(() => db.insertEvent(event)).not.toThrow();
    });

    it('should handle special SQL characters', () => {
      const specialChars = ["'", '"', ';', '--', '/*', '*/', 'xp_', 'sp_'];
      
      specialChars.forEach(char => {
        const event = {
          timestamp: new Date().toISOString(),
          filepath: `test${char}file.js`,
          change_type: 'modified'
        };

        expect(() => db.insertEvent(event)).not.toThrow();
      });
    });
  });

  describe('Query Results', () => {
    it('should not leak error messages with SQL syntax', () => {
      // Intentionally malformed query through API should not expose SQL
      const maliciousInput = "'; SELECT version(); --";
      
      try {
        const event = {
          timestamp: new Date().toISOString(),
          filepath: maliciousInput,
          change_type: 'modified'
        };
        db.insertEvent(event);
      } catch (error) {
        // Error message should not contain SQL keywords
        expect(error.message.toLowerCase()).not.toContain('select');
        expect(error.message.toLowerCase()).not.toContain('insert');
        expect(error.message.toLowerCase()).not.toContain('delete');
      }
    });

    it('should not allow reading arbitrary tables', () => {
      const event = {
        timestamp: new Date().toISOString(),
        filepath: 'test.js',
        change_type: 'modified'
      };
      
      db.insertEvent(event);
      const results = db.getRecentEvents(1);
      
      // Result should only have expected columns
      const allowedColumns = ['id', 'timestamp', 'filepath', 'change_type', 'diff', 'cpu', 'mem', 'session_id', 'file_hash', 'event_size'];
      Object.keys(results[0]).forEach(key => {
        expect(allowedColumns).toContain(key);
      });
    });
  });
});
