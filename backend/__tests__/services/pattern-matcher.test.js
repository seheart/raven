/**
 * Tests for PatternMatcher Service
 */

import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import Database from 'better-sqlite3';
import { PatternMatcher, createPatternMatcher } from '../../services/pattern-matcher.js';

describe('PatternMatcher', () => {
  let matcher;
  let projectDatabases;
  let testDb;

  beforeEach(() => {
    // Create in-memory database for testing
    testDb = new Database(':memory:');

    // Create events table
    testDb.exec(`
      CREATE TABLE events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_name TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        filepath TEXT NOT NULL,
        change_type TEXT NOT NULL,
        diff TEXT,
        agent TEXT,
        agent_confidence INTEGER
      );

      CREATE TABLE rollbacks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event_id INTEGER NOT NULL,
        timestamp TEXT NOT NULL,
        reason TEXT,
        FOREIGN KEY (event_id) REFERENCES events(id)
      );
    `);

    // Set up project databases
    projectDatabases = new Map();
    projectDatabases.set('test-project', { db: testDb });

    matcher = new PatternMatcher(projectDatabases);
  });

  afterEach(() => {
    testDb.close();
  });

  describe('constructor', () => {
    test('should create PatternMatcher with project databases', () => {
      expect(matcher.projectDatabases).toBe(projectDatabases);
    });
  });

  describe('findSimilarChanges', () => {
    test('should return empty array if project not found', () => {
      const result = matcher.findSimilarChanges({ id: 1 }, 'nonexistent', 5);
      expect(result).toEqual([]);
    });

    test('should find similar changes', () => {
      // Insert test data
      const stmt = testDb.prepare(`
        INSERT INTO events (project_name, timestamp, filepath, change_type, diff, agent)
        VALUES (?, ?, ?, ?, ?, ?)
      `);

      stmt.run('test-project', '2025-10-27T10:00:00Z', 'src/auth.js', 'change', 'function login() {}', 'claude');
      stmt.run('test-project', '2025-10-26T10:00:00Z', 'src/auth.js', 'change', 'function logout() {}', 'claude');
      stmt.run('test-project', '2025-10-25T10:00:00Z', 'src/payment.js', 'change', 'function pay() {}', 'cursor');

      const change = {
        id: 1,
        filepath: 'src/auth.js',
        change_type: 'change',
        diff: 'function login() {}',
        agent: 'claude',
        timestamp: '2025-10-27T10:00:00Z'
      };

      const results = matcher.findSimilarChanges(change, 'test-project', 5);

      expect(results.length).toBeGreaterThan(0);
      expect(results[0]).toHaveProperty('similarity');
      expect(results[0]).toHaveProperty('outcome');
      expect(results[0].similarity).toBeGreaterThan(0.5);
    });

    test('should filter out changes with similarity <= 0.5', () => {
      const stmt = testDb.prepare(`
        INSERT INTO events (project_name, timestamp, filepath, change_type, diff, agent)
        VALUES (?, ?, ?, ?, ?, ?)
      `);

      stmt.run('test-project', '2025-10-27T10:00:00Z', 'src/auth.js', 'change', 'test', 'claude');
      stmt.run('test-project', '2025-10-26T10:00:00Z', 'src/completely-different.js', 'add', 'different', 'cursor');

      const change = {
        id: 1,
        filepath: 'src/auth.js',
        change_type: 'change',
        diff: 'test',
        agent: 'claude',
        timestamp: '2025-10-27T10:00:00Z'
      };

      const results = matcher.findSimilarChanges(change, 'test-project', 5);

      // Should not include very dissimilar changes
      results.forEach(r => {
        expect(r.similarity).toBeGreaterThan(0.5);
      });
    });

    test('should respect limit parameter', () => {
      const stmt = testDb.prepare(`
        INSERT INTO events (project_name, timestamp, filepath, change_type, diff, agent)
        VALUES (?, ?, ?, ?, ?, ?)
      `);

      // Insert many similar changes
      for (let i = 0; i < 10; i++) {
        stmt.run('test-project', `2025-10-${20 + i}T10:00:00Z`, 'src/auth.js', 'change', `test ${i}`, 'claude');
      }

      const change = {
        id: 100,
        filepath: 'src/auth.js',
        change_type: 'change',
        diff: 'test',
        agent: 'claude',
        timestamp: '2025-10-27T10:00:00Z'
      };

      const results = matcher.findSimilarChanges(change, 'test-project', 3);

      expect(results.length).toBeLessThanOrEqual(3);
    });

    test('should mark rolled back changes', () => {
      const stmt = testDb.prepare(`
        INSERT INTO events (project_name, timestamp, filepath, change_type, diff, agent)
        VALUES (?, ?, ?, ?, ?, ?)
      `);

      const insertResult = stmt.run('test-project', '2025-10-27T10:00:00Z', 'src/auth.js', 'change', 'test', 'claude');

      testDb.prepare(`
        INSERT INTO rollbacks (event_id, timestamp, reason)
        VALUES (?, ?, ?)
      `).run(insertResult.lastInsertRowid, '2025-10-27T11:00:00Z', 'broke tests');

      const change = {
        id: 100,
        filepath: 'src/auth.js',
        change_type: 'change',
        diff: 'test',
        agent: 'claude',
        timestamp: '2025-10-27T12:00:00Z'
      };

      const results = matcher.findSimilarChanges(change, 'test-project', 5);

      if (results.length > 0) {
        const rolledBack = results.find(r => r.rollback_id !== null);
        if (rolledBack) {
          expect(rolledBack.outcome).toBe('rolled_back');
        }
      }
    });

    test('should handle database errors gracefully', () => {
      // Close the database to cause an error
      testDb.close();

      const change = { id: 1, filepath: 'test.js' };
      const results = matcher.findSimilarChanges(change, 'test-project', 5);

      expect(results).toEqual([]);
    });
  });

  describe('calculateSimilarity', () => {
    test('should return high score for identical changes', () => {
      const change1 = {
        filepath: 'src/auth.js',
        change_type: 'change',
        diff: 'function login() { return true; }',
        agent: 'claude',
        timestamp: '2025-10-27T10:00:00Z'
      };

      const change2 = {
        filepath: 'src/auth.js',
        change_type: 'change',
        diff: 'function login() { return true; }',
        agent: 'claude',
        timestamp: '2025-10-27T10:30:00Z'
      };

      const score = matcher.calculateSimilarity(change1, change2);

      expect(score).toBeGreaterThan(0.8);
    });

    test('should give weight to same filepath', () => {
      const change1 = {
        filepath: 'src/auth.js',
        change_type: 'change',
        diff: 'a',
        agent: 'claude',
        timestamp: '2025-10-27T10:00:00Z'
      };

      const change2 = {
        filepath: 'src/auth.js',
        change_type: 'add',
        diff: 'b',
        agent: 'cursor',
        timestamp: '2025-10-27T20:00:00Z'
      };

      const score = matcher.calculateSimilarity(change1, change2);

      // Should get points for same file (0.4)
      expect(score).toBeGreaterThan(0.3);
    });

    test('should give partial points for similar files', () => {
      const change1 = {
        filepath: 'src/auth.js',
        change_type: 'change',
        diff: 'test'
      };

      const change2 = {
        filepath: 'src/auth-service.js',
        change_type: 'change',
        diff: 'test'
      };

      const score = matcher.calculateSimilarity(change1, change2);

      // Should get points for similar file (0.2)
      expect(score).toBeGreaterThan(0.15);
    });

    test('should give points for same change type', () => {
      const change1 = {
        filepath: 'a.js',
        change_type: 'add',
        diff: 'test'
      };

      const change2 = {
        filepath: 'b.js',
        change_type: 'add',
        diff: 'test'
      };

      const score = matcher.calculateSimilarity(change1, change2);

      // Should get points for same change type
      expect(score).toBeGreaterThan(0);
    });

    test('should give points for similar sizes', () => {
      const change1 = {
        filepath: 'a.js',
        change_type: 'change',
        diff: 'a'.repeat(100)
      };

      const change2 = {
        filepath: 'b.js',
        change_type: 'change',
        diff: 'b'.repeat(100)
      };

      const score = matcher.calculateSimilarity(change1, change2);

      expect(score).toBeGreaterThan(0);
    });

    test('should give points for same agent', () => {
      const change1 = {
        filepath: 'a.js',
        change_type: 'change',
        diff: 'a',
        agent: 'claude'
      };

      const change2 = {
        filepath: 'b.js',
        change_type: 'change',
        diff: 'b',
        agent: 'claude'
      };

      const score = matcher.calculateSimilarity(change1, change2);

      expect(score).toBeGreaterThan(0);
    });

    test('should give points for similar time of day', () => {
      const change1 = {
        filepath: 'a.js',
        change_type: 'change',
        diff: 'a',
        timestamp: '2025-10-27T10:00:00Z'
      };

      const change2 = {
        filepath: 'b.js',
        change_type: 'change',
        diff: 'b',
        timestamp: '2025-10-27T10:30:00Z'
      };

      const score = matcher.calculateSimilarity(change1, change2);

      expect(score).toBeGreaterThan(0);
    });

    test('should give points for similar diff content', () => {
      const change1 = {
        filepath: 'a.js',
        change_type: 'change',
        diff: 'function login() { return true; }'
      };

      const change2 = {
        filepath: 'b.js',
        change_type: 'change',
        diff: 'function login() { return false; }'
      };

      const score = matcher.calculateSimilarity(change1, change2);

      expect(score).toBeGreaterThan(0);
    });

    test('should handle missing diff fields', () => {
      const change1 = {
        filepath: 'a.js',
        change_type: 'change'
      };

      const change2 = {
        filepath: 'b.js',
        change_type: 'change'
      };

      const score = matcher.calculateSimilarity(change1, change2);

      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(1);
    });

    test('should handle missing agent fields', () => {
      const change1 = {
        filepath: 'a.js',
        change_type: 'change',
        diff: 'test'
      };

      const change2 = {
        filepath: 'b.js',
        change_type: 'change',
        diff: 'test',
        agent: 'claude'
      };

      const score = matcher.calculateSimilarity(change1, change2);

      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(1);
    });
  });

  describe('isSimilarFile', () => {
    test('should return true for files where one contains the other', () => {
      expect(matcher.isSimilarFile('auth.js', 'auth-service.js')).toBe(true);
      expect(matcher.isSimilarFile('auth-service.js', 'auth.js')).toBe(true);
    });

    test('should return true for files with common patterns', () => {
      expect(matcher.isSimilarFile('auth-login.js', 'auth-logout.js')).toBe(true);
      expect(matcher.isSimilarFile('payment-stripe.js', 'payment-paypal.js')).toBe(true);
      expect(matcher.isSimilarFile('user-model.js', 'user-service.js')).toBe(true);
    });

    test('should return false for unrelated files', () => {
      expect(matcher.isSimilarFile('auth.js', 'payment.js')).toBe(false);
      expect(matcher.isSimilarFile('config.js', 'test.js')).toBe(false);
    });

    test('should be case insensitive', () => {
      expect(matcher.isSimilarFile('Auth.js', 'auth-service.js')).toBe(true);
      expect(matcher.isSimilarFile('AUTH.js', 'auth.js')).toBe(true);
    });
  });

  describe('compareSizes', () => {
    test('should return 1.0 for same sizes', () => {
      expect(matcher.compareSizes(100, 100)).toBe(1.0);
    });

    test('should return 0 if either size is 0', () => {
      expect(matcher.compareSizes(0, 100)).toBe(0);
      expect(matcher.compareSizes(100, 0)).toBe(0);
      expect(matcher.compareSizes(0, 0)).toBe(0);
    });

    test('should return ratio for different sizes', () => {
      const ratio = matcher.compareSizes(100, 200);
      expect(ratio).toBe(0.5);
    });

    test('should return same ratio regardless of order', () => {
      const ratio1 = matcher.compareSizes(100, 200);
      const ratio2 = matcher.compareSizes(200, 100);
      expect(ratio1).toBe(ratio2);
    });
  });

  describe('compareTimeOfDay', () => {
    test('should return 1.0 for times within 2 hours', () => {
      const time1 = '2025-10-27T10:00:00Z';
      const time2 = '2025-10-27T11:00:00Z';
      expect(matcher.compareTimeOfDay(time1, time2)).toBe(1.0);
    });

    test('should return 0.5 for times within 4 hours', () => {
      const time1 = '2025-10-27T10:00:00Z';
      const time2 = '2025-10-27T13:00:00Z';
      expect(matcher.compareTimeOfDay(time1, time2)).toBe(0.5);
    });

    test('should return 0.0 for times more than 4 hours apart', () => {
      const time1 = '2025-10-27T10:00:00Z';
      const time2 = '2025-10-27T20:00:00Z';
      expect(matcher.compareTimeOfDay(time1, time2)).toBe(0.0);
    });

    test('should handle time differences across days', () => {
      const time1 = '2025-10-27T23:00:00Z';
      const time2 = '2025-10-28T01:00:00Z';
      expect(matcher.compareTimeOfDay(time1, time2)).toBe(1.0);
    });
  });

  describe('compareDiffs', () => {
    test('should return 1.0 for identical diffs', () => {
      const diff1 = 'function login() {}';
      const diff2 = 'function login() {}';
      expect(matcher.compareDiffs(diff1, diff2)).toBe(1.0);
    });

    test('should return > 0 for similar diffs', () => {
      const diff1 = 'function login() { return true; }';
      const diff2 = 'function login() { return false; }';
      const similarity = matcher.compareDiffs(diff1, diff2);
      expect(similarity).toBeGreaterThan(0);
      expect(similarity).toBeLessThan(1);
    });

    test('should return 0 for completely different diffs', () => {
      const diff1 = 'aaa';
      const diff2 = 'bbb';
      expect(matcher.compareDiffs(diff1, diff2)).toBe(0);
    });

    test('should return 0 if either diff has no tokens', () => {
      const diff1 = 'function login() {}';
      const diff2 = 'ab';
      expect(matcher.compareDiffs(diff1, diff2)).toBe(0);
    });

    test('should use Jaccard similarity', () => {
      const diff1 = 'hello world test';
      const diff2 = 'hello world example';
      const similarity = matcher.compareDiffs(diff1, diff2);

      // Tokens: {hello, world, test} and {hello, world, example}
      // Intersection: {hello, world} = 2
      // Union: {hello, world, test, example} = 4
      // Jaccard: 2/4 = 0.5
      expect(similarity).toBeCloseTo(0.5, 1);
    });
  });

  describe('tokenize', () => {
    test('should extract words from diff', () => {
      const diff = 'function login() { return true; }';
      const tokens = matcher.tokenize(diff);

      expect(tokens.has('function')).toBe(true);
      expect(tokens.has('login')).toBe(true);
      expect(tokens.has('return')).toBe(true);
      expect(tokens.has('true')).toBe(true);
    });

    test('should remove diff markers', () => {
      const diff = '+function login()\n-function logout()';
      const tokens = matcher.tokenize(diff);

      expect(tokens.has('function')).toBe(true);
      expect(tokens.has('login')).toBe(true);
      expect(tokens.has('logout')).toBe(true);
    });

    test('should filter out short tokens', () => {
      const diff = 'a ab abc abcd abcde';
      const tokens = matcher.tokenize(diff);

      expect(tokens.has('a')).toBe(false);
      expect(tokens.has('ab')).toBe(false);
      expect(tokens.has('abc')).toBe(true);
      expect(tokens.has('abcd')).toBe(true);
      expect(tokens.has('abcde')).toBe(true);
    });

    test('should filter out very long tokens', () => {
      const diff = 'a'.repeat(31);
      const tokens = matcher.tokenize(diff);

      expect(tokens.size).toBe(0);
    });

    test('should convert to lowercase', () => {
      const diff = 'Function Login';
      const tokens = matcher.tokenize(diff);

      expect(tokens.has('function')).toBe(true);
      expect(tokens.has('login')).toBe(true);
      expect(tokens.has('Function')).toBe(false);
      expect(tokens.has('Login')).toBe(false);
    });

    test('should handle empty diff', () => {
      const tokens = matcher.tokenize('');
      expect(tokens.size).toBe(0);
    });
  });

  describe('analyzeRollbackPatterns', () => {
    test('should return empty array if project not found', () => {
      const result = matcher.analyzeRollbackPatterns('nonexistent');
      expect(result).toEqual([]);
    });

    test('should return empty array if no rollbacks', () => {
      const result = matcher.analyzeRollbackPatterns('test-project');
      expect(result).toEqual([]);
    });

    test('should identify problematic files', () => {
      const stmt = testDb.prepare(`
        INSERT INTO events (project_name, timestamp, filepath, change_type, diff, agent)
        VALUES (?, ?, ?, ?, ?, ?)
      `);

      // Insert same file rolled back multiple times
      for (let i = 0; i < 5; i++) {
        const eventId = stmt.run('test-project', `2025-10-${20 + i}T10:00:00Z`, 'src/auth.js', 'change', 'test', 'claude').lastInsertRowid;
        testDb.prepare(`
          INSERT INTO rollbacks (event_id, timestamp, reason)
          VALUES (?, ?, ?)
        `).run(eventId, `2025-10-${20 + i}T11:00:00Z`, 'broke tests');
      }

      const results = matcher.analyzeRollbackPatterns('test-project');

      const filePattern = results.find(r => r.type === 'file' && r.value === 'src/auth.js');
      expect(filePattern).toBeDefined();
      expect(filePattern.count).toBe(5);
    });

    test('should identify problematic agents', () => {
      const stmt = testDb.prepare(`
        INSERT INTO events (project_name, timestamp, filepath, change_type, diff, agent)
        VALUES (?, ?, ?, ?, ?, ?)
      `);

      // Insert same agent with multiple rollbacks
      for (let i = 0; i < 5; i++) {
        const eventId = stmt.run('test-project', `2025-10-${20 + i}T10:00:00Z`, `src/file${i}.js`, 'change', 'test', 'claude').lastInsertRowid;
        testDb.prepare(`
          INSERT INTO rollbacks (event_id, timestamp, reason)
          VALUES (?, ?, ?)
        `).run(eventId, `2025-10-${20 + i}T11:00:00Z`, 'broke tests');
      }

      const results = matcher.analyzeRollbackPatterns('test-project');

      const agentPattern = results.find(r => r.type === 'agent' && r.value === 'claude');
      expect(agentPattern).toBeDefined();
      expect(agentPattern.count).toBe(5);
    });

    test('should sort agents by rollback count', () => {
      const stmt = testDb.prepare(`
        INSERT INTO events (project_name, timestamp, filepath, change_type, diff, agent)
        VALUES (?, ?, ?, ?, ?, ?)
      `);

      // Insert multiple agents with different rollback counts
      // claude: 5 rollbacks
      for (let i = 0; i < 5; i++) {
        const eventId = stmt.run('test-project', `2025-10-${10 + i}T10:00:00Z`, `src/file${i}.js`, 'change', 'test', 'claude').lastInsertRowid;
        testDb.prepare(`
          INSERT INTO rollbacks (event_id, timestamp, reason)
          VALUES (?, ?, ?)
        `).run(eventId, `2025-10-${10 + i}T11:00:00Z`, 'broke tests');
      }

      // cursor: 3 rollbacks
      for (let i = 0; i < 3; i++) {
        const eventId = stmt.run('test-project', `2025-10-${15 + i}T10:00:00Z`, `src/file${i}.js`, 'change', 'test', 'cursor').lastInsertRowid;
        testDb.prepare(`
          INSERT INTO rollbacks (event_id, timestamp, reason)
          VALUES (?, ?, ?)
        `).run(eventId, `2025-10-${15 + i}T11:00:00Z`, 'broke tests');
      }

      // copilot: 4 rollbacks
      for (let i = 0; i < 4; i++) {
        const eventId = stmt.run('test-project', `2025-10-${18 + i}T10:00:00Z`, `src/file${i}.js`, 'change', 'test', 'copilot').lastInsertRowid;
        testDb.prepare(`
          INSERT INTO rollbacks (event_id, timestamp, reason)
          VALUES (?, ?, ?)
        `).run(eventId, `2025-10-${18 + i}T11:00:00Z`, 'broke tests');
      }

      const results = matcher.analyzeRollbackPatterns('test-project');

      const agentPatterns = results.filter(r => r.type === 'agent');

      // Should have all three agents
      expect(agentPatterns.length).toBe(3);

      // Should be sorted by count (highest first)
      const claudeIdx = agentPatterns.findIndex(r => r.value === 'claude');
      const copilotIdx = agentPatterns.findIndex(r => r.value === 'copilot');
      const cursorIdx = agentPatterns.findIndex(r => r.value === 'cursor');

      // claude (5) should come before copilot (4)
      expect(claudeIdx).toBeLessThan(copilotIdx);
      // copilot (4) should come before cursor (3)
      expect(copilotIdx).toBeLessThan(cursorIdx);
    });

    test('should identify common rollback reasons', () => {
      const stmt = testDb.prepare(`
        INSERT INTO events (project_name, timestamp, filepath, change_type, diff, agent)
        VALUES (?, ?, ?, ?, ?, ?)
      `);

      // Insert rollbacks with common reason keyword
      for (let i = 0; i < 3; i++) {
        const eventId = stmt.run('test-project', `2025-10-${20 + i}T10:00:00Z`, `src/file${i}.js`, 'change', 'test', 'claude').lastInsertRowid;
        testDb.prepare(`
          INSERT INTO rollbacks (event_id, timestamp, reason)
          VALUES (?, ?, ?)
        `).run(eventId, `2025-10-${20 + i}T11:00:00Z`, 'broke tests and failed build');
      }

      const results = matcher.analyzeRollbackPatterns('test-project');

      const reasonPattern = results.find(r => r.type === 'reason');
      expect(reasonPattern).toBeDefined();
    });

    test('should only include patterns with count >= threshold', () => {
      const stmt = testDb.prepare(`
        INSERT INTO events (project_name, timestamp, filepath, change_type, diff, agent)
        VALUES (?, ?, ?, ?, ?, ?)
      `);

      // Single rollback (should not appear)
      const eventId = stmt.run('test-project', '2025-10-27T10:00:00Z', 'src/rare.js', 'change', 'test', 'claude').lastInsertRowid;
      testDb.prepare(`
        INSERT INTO rollbacks (event_id, timestamp, reason)
        VALUES (?, ?, ?)
      `).run(eventId, '2025-10-27T11:00:00Z', 'broke tests');

      const results = matcher.analyzeRollbackPatterns('test-project');

      // Should not include files with count < 3
      const rareFile = results.find(r => r.type === 'file' && r.value === 'src/rare.js');
      expect(rareFile).toBeUndefined();
    });

    test('should handle database errors gracefully', () => {
      testDb.close();

      const results = matcher.analyzeRollbackPatterns('test-project');

      expect(results).toEqual([]);
    });
  });

  describe('extractKeywords', () => {
    test('should extract words >= 4 characters', () => {
      const text = 'The test failed';
      const keywords = matcher.extractKeywords(text);

      expect(keywords).toContain('test');
      expect(keywords).toContain('failed');
      expect(keywords).not.toContain('the');
    });

    test('should filter out stopwords', () => {
      const text = 'The test failed and broke the build';
      const keywords = matcher.extractKeywords(text);

      expect(keywords).not.toContain('the');
      expect(keywords).not.toContain('and');
    });

    test('should convert to lowercase', () => {
      const text = 'Test FAILED Build';
      const keywords = matcher.extractKeywords(text);

      expect(keywords).toContain('test');
      expect(keywords).toContain('failed');
      expect(keywords).toContain('build');
    });

    test('should remove punctuation', () => {
      const text = 'Test! Failed. Build?';
      const keywords = matcher.extractKeywords(text);

      expect(keywords).toContain('test');
      expect(keywords).toContain('failed');
      expect(keywords).toContain('build');
    });

    test('should handle empty text', () => {
      const keywords = matcher.extractKeywords('');
      expect(keywords).toEqual([]);
    });
  });

  describe('predictOutcome', () => {
    test('should return default for no similar changes', () => {
      const change = {
        id: 1,
        filepath: 'src/test.js',
        change_type: 'change',
        diff: 'test'
      };

      const result = matcher.predictOutcome(change, 'test-project');

      expect(result.confidence).toBe('low');
      expect(result.successRate).toBe(0.88);
      expect(result.sampleSize).toBe(0);
    });

    test('should calculate success rate from similar changes', () => {
      const stmt = testDb.prepare(`
        INSERT INTO events (project_name, timestamp, filepath, change_type, diff, agent)
        VALUES (?, ?, ?, ?, ?, ?)
      `);

      // Insert 10 similar changes, 8 kept, 2 rolled back
      for (let i = 0; i < 10; i++) {
        const eventId = stmt.run('test-project', `2025-10-${10 + i}T10:00:00Z`, 'src/auth.js', 'change', 'test', 'claude').lastInsertRowid;

        if (i < 2) {
          testDb.prepare(`
            INSERT INTO rollbacks (event_id, timestamp, reason)
            VALUES (?, ?, ?)
          `).run(eventId, `2025-10-${10 + i}T11:00:00Z`, 'broke tests');
        }
      }

      const change = {
        id: 100,
        filepath: 'src/auth.js',
        change_type: 'change',
        diff: 'test',
        agent: 'claude',
        timestamp: '2025-10-27T10:00:00Z'
      };

      const result = matcher.predictOutcome(change, 'test-project');

      expect(result.sampleSize).toBeGreaterThan(0);
      expect(result.successRate).toBeGreaterThan(0);
      expect(result.successRate).toBeLessThanOrEqual(1);
    });

    test('should return high confidence for > 10 samples', () => {
      const stmt = testDb.prepare(`
        INSERT INTO events (project_name, timestamp, filepath, change_type, diff, agent)
        VALUES (?, ?, ?, ?, ?, ?)
      `);

      for (let i = 0; i < 15; i++) {
        stmt.run('test-project', `2025-10-${10 + i % 20}T10:00:00Z`, 'src/auth.js', 'change', 'test', 'claude');
      }

      const change = {
        id: 100,
        filepath: 'src/auth.js',
        change_type: 'change',
        diff: 'test',
        agent: 'claude',
        timestamp: '2025-10-27T10:00:00Z'
      };

      const result = matcher.predictOutcome(change, 'test-project');

      expect(result.confidence).toBe('high');
    });

    test('should return medium confidence for 6-10 samples', () => {
      const stmt = testDb.prepare(`
        INSERT INTO events (project_name, timestamp, filepath, change_type, diff, agent)
        VALUES (?, ?, ?, ?, ?, ?)
      `);

      for (let i = 0; i < 7; i++) {
        stmt.run('test-project', `2025-10-${20 + i}T10:00:00Z`, 'src/auth.js', 'change', 'test', 'claude');
      }

      const change = {
        id: 100,
        filepath: 'src/auth.js',
        change_type: 'change',
        diff: 'test',
        agent: 'claude',
        timestamp: '2025-10-27T10:00:00Z'
      };

      const result = matcher.predictOutcome(change, 'test-project');

      expect(result.confidence).toBe('medium');
    });

    test('should return low confidence for <= 5 samples', () => {
      const stmt = testDb.prepare(`
        INSERT INTO events (project_name, timestamp, filepath, change_type, diff, agent)
        VALUES (?, ?, ?, ?, ?, ?)
      `);

      for (let i = 0; i < 3; i++) {
        stmt.run('test-project', `2025-10-${25 + i}T10:00:00Z`, 'src/auth.js', 'change', 'test', 'claude');
      }

      const change = {
        id: 100,
        filepath: 'src/auth.js',
        change_type: 'change',
        diff: 'test',
        agent: 'claude',
        timestamp: '2025-10-27T10:00:00Z'
      };

      const result = matcher.predictOutcome(change, 'test-project');

      expect(result.confidence).toBe('low');
    });

    test('should include top matches with details', () => {
      const stmt = testDb.prepare(`
        INSERT INTO events (project_name, timestamp, filepath, change_type, diff, agent)
        VALUES (?, ?, ?, ?, ?, ?)
      `);

      for (let i = 0; i < 5; i++) {
        stmt.run('test-project', `2025-10-${23 + i}T10:00:00Z`, 'src/auth.js', 'change', 'test', 'claude');
      }

      const change = {
        id: 100,
        filepath: 'src/auth.js',
        change_type: 'change',
        diff: 'test',
        agent: 'claude',
        timestamp: '2025-10-27T10:00:00Z'
      };

      const result = matcher.predictOutcome(change, 'test-project');

      expect(result.topMatches).toBeDefined();
      expect(result.topMatches.length).toBeLessThanOrEqual(3);

      if (result.topMatches.length > 0) {
        expect(result.topMatches[0]).toHaveProperty('similarity');
        expect(result.topMatches[0]).toHaveProperty('outcome');
        expect(result.topMatches[0]).toHaveProperty('file');
      }
    });
  });

  describe('createPatternMatcher', () => {
    test('should create PatternMatcher instance', () => {
      const instance = createPatternMatcher(projectDatabases);

      expect(instance).toBeInstanceOf(PatternMatcher);
      expect(instance.projectDatabases).toBe(projectDatabases);
    });
  });
});
