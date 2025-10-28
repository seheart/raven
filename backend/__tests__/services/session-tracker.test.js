/**
 * Tests for SessionTracker Service
 */

import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import Database from 'better-sqlite3';
import { SessionTracker, createSessionTracker } from '../../services/session-tracker.js';

describe('SessionTracker', () => {
  let tracker;
  let projectDatabases;
  let testDb;

  beforeEach(() => {
    // Create in-memory database for testing
    testDb = new Database(':memory:');

    // Create sessions table
    testDb.exec(`
      CREATE TABLE sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_name TEXT NOT NULL,
        start_time TEXT NOT NULL,
        end_time TEXT,
        changes_count INTEGER DEFAULT 0,
        rollbacks_count INTEGER DEFAULT 0,
        break_minutes INTEGER DEFAULT 0,
        quality_score REAL DEFAULT 100.0
      );
    `);

    // Set up project databases
    projectDatabases = new Map();
    projectDatabases.set('test-project', { db: testDb });

    tracker = new SessionTracker(projectDatabases);
  });

  afterEach(() => {
    testDb.close();
  });

  describe('constructor', () => {
    test('should create SessionTracker with default values', () => {
      expect(tracker.projectDatabases).toBe(projectDatabases);
      expect(tracker.activeSessions).toBeDefined();
      expect(tracker.sessionTimeout).toBe(30 * 60 * 1000); // 30 minutes
    });
  });

  describe('recordActivity', () => {
    test('should start new session on first activity', () => {
      const eventData = {
        change_type: 'change',
        filepath: 'src/test.js',
        diff: 'test code',
        agent: 'claude',
        risk_score: 20
      };

      const session = tracker.recordActivity('test-project', eventData);

      expect(session).toBeDefined();
      expect(session.changesCount).toBe(1);
      expect(session.recentChanges).toHaveLength(1);
      expect(session.recentChanges[0].changeType).toBe('change');
    });

    test('should continue existing session', () => {
      const eventData = {
        change_type: 'change',
        filepath: 'src/test.js',
        diff: 'test',
        agent: 'claude'
      };

      tracker.recordActivity('test-project', eventData);
      tracker.recordActivity('test-project', eventData);

      const session = tracker.getActiveSession('test-project');
      expect(session.changesCount).toBe(2);
      expect(session.recentChanges).toHaveLength(2);
    });

    test('should end session after timeout period', () => {
      const eventData = { change_type: 'change', filepath: 'test.js', diff: 'a' };

      tracker.recordActivity('test-project', eventData);
      const firstSession = tracker.getActiveSession('test-project');

      // Simulate session timeout by modifying lastActivity
      firstSession.lastActivity = Date.now() - (31 * 60 * 1000); // 31 minutes ago

      tracker.recordActivity('test-project', eventData);
      const secondSession = tracker.getActiveSession('test-project');

      expect(secondSession.id).not.toBe(firstSession.id);
      expect(secondSession.changesCount).toBe(1);
    });

    test('should keep only last 20 changes', () => {
      const eventData = { change_type: 'change', filepath: 'test.js', diff: 'a' };

      // Record 25 changes
      for (let i = 0; i < 25; i++) {
        tracker.recordActivity('test-project', eventData);
      }

      const session = tracker.getActiveSession('test-project');
      expect(session.recentChanges).toHaveLength(20);
    });

    test('should update session in DB every 10 changes', () => {
      const eventData = { change_type: 'change', filepath: 'test.js', diff: 'a' };

      // Record 10 changes
      for (let i = 0; i < 10; i++) {
        tracker.recordActivity('test-project', eventData);
      }

      const session = tracker.getActiveSession('test-project');
      expect(session.changesCount).toBe(10);

      // Verify session was updated in DB
      const dbSession = testDb.prepare('SELECT changes_count FROM sessions WHERE id = ?').get(session.id);
      expect(dbSession.changes_count).toBe(10);
    });

    test('should handle missing diff field', () => {
      const eventData = { change_type: 'change', filepath: 'test.js', agent: 'claude' };

      const session = tracker.recordActivity('test-project', eventData);

      expect(session.recentChanges[0].diffSize).toBe(0);
    });

    test('should handle missing risk_score field', () => {
      const eventData = { change_type: 'change', filepath: 'test.js', diff: 'test' };

      const session = tracker.recordActivity('test-project', eventData);

      expect(session.recentChanges[0].riskScore).toBe(0);
    });
  });

  describe('startSession', () => {
    test('should create session with default values', () => {
      const session = tracker.startSession('test-project');

      expect(session.projectName).toBe('test-project');
      expect(session.changesCount).toBe(0);
      expect(session.rollbacksCount).toBe(0);
      expect(session.qualityScore).toBe(100);
      expect(session.recentChanges).toEqual([]);
      expect(session.id).toBeDefined();
    });

    test('should insert session into database', () => {
      const session = tracker.startSession('test-project');

      const dbSession = testDb.prepare('SELECT * FROM sessions WHERE id = ?').get(session.id);
      expect(dbSession).toBeDefined();
      expect(dbSession.project_name).toBe('test-project');
      expect(dbSession.quality_score).toBe(100);
    });

    test('should handle database error gracefully', () => {
      testDb.close();

      const session = tracker.startSession('test-project');

      expect(session.id).toBeNull();
      expect(session.projectName).toBe('test-project');
    });
  });

  describe('endSession', () => {
    test('should do nothing if no active session', () => {
      tracker.endSession('test-project');

      const session = tracker.getActiveSession('test-project');
      expect(session).toBeNull();
    });

    test('should update database and remove from active sessions', () => {
      const eventData = { change_type: 'change', filepath: 'test.js', diff: 'a' };
      tracker.recordActivity('test-project', eventData);
      tracker.recordActivity('test-project', eventData);

      const session = tracker.getActiveSession('test-project');
      const sessionId = session.id;

      tracker.endSession('test-project');

      // Should be removed from active sessions
      expect(tracker.getActiveSession('test-project')).toBeNull();

      // Should be marked as ended in database
      const dbSession = testDb.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId);
      expect(dbSession.end_time).not.toBeNull();
      expect(dbSession.changes_count).toBe(2);
    });

    test('should handle database error gracefully', () => {
      const eventData = { change_type: 'change', filepath: 'test.js', diff: 'a' };
      tracker.recordActivity('test-project', eventData);

      testDb.close();

      tracker.endSession('test-project');

      // Should still remove from active sessions
      expect(tracker.getActiveSession('test-project')).toBeNull();
    });

    test('should not update database if session has no id', () => {
      const session = {
        id: null,
        projectName: 'test-project',
        changesCount: 5,
        rollbacksCount: 0,
        qualityScore: 90
      };

      tracker.activeSessions.set('test-project', session);

      tracker.endSession('test-project');

      expect(tracker.getActiveSession('test-project')).toBeNull();
    });
  });

  describe('updateSessionInDB', () => {
    test('should do nothing if session has no id', () => {
      const session = { id: null };

      tracker.updateSessionInDB('test-project', session);

      // No error should be thrown
    });

    test('should do nothing if project not found', () => {
      const session = { id: 1, changesCount: 5, rollbacksCount: 1, qualityScore: 80 };

      tracker.updateSessionInDB('nonexistent', session);

      // No error should be thrown
    });

    test('should update session in database', () => {
      const eventData = { change_type: 'change', filepath: 'test.js', diff: 'a' };
      tracker.recordActivity('test-project', eventData);

      const session = tracker.getActiveSession('test-project');
      session.changesCount = 15;
      session.rollbacksCount = 2;
      session.qualityScore = 75;

      tracker.updateSessionInDB('test-project', session);

      const dbSession = testDb.prepare('SELECT * FROM sessions WHERE id = ?').get(session.id);
      expect(dbSession.changes_count).toBe(15);
      expect(dbSession.rollbacks_count).toBe(2);
      expect(dbSession.quality_score).toBe(75);
    });

    test('should handle database error gracefully', () => {
      const eventData = { change_type: 'change', filepath: 'test.js', diff: 'a' };
      tracker.recordActivity('test-project', eventData);

      const session = tracker.getActiveSession('test-project');

      testDb.close();

      tracker.updateSessionInDB('test-project', session);

      // No error should be thrown
    });
  });

  describe('trackRollback', () => {
    test('should increment rollback count and decrease quality', () => {
      const eventData = { change_type: 'change', filepath: 'test.js', diff: 'a' };
      tracker.recordActivity('test-project', eventData);

      const session = tracker.getActiveSession('test-project');
      const initialQuality = session.qualityScore;

      tracker.trackRollback('test-project');

      expect(session.rollbacksCount).toBe(1);
      expect(session.qualityScore).toBe(initialQuality - 5);
    });

    test('should not decrease quality below 0', () => {
      const eventData = { change_type: 'change', filepath: 'test.js', diff: 'a' };
      tracker.recordActivity('test-project', eventData);

      const session = tracker.getActiveSession('test-project');
      session.qualityScore = 3;

      tracker.trackRollback('test-project');

      expect(session.qualityScore).toBe(0);
    });

    test('should do nothing if no active session', () => {
      tracker.trackRollback('test-project');

      // Should not throw error
    });
  });

  describe('getActiveSession', () => {
    test('should return null if no active session', () => {
      expect(tracker.getActiveSession('test-project')).toBeNull();
    });

    test('should return active session', () => {
      const eventData = { change_type: 'change', filepath: 'test.js', diff: 'a' };
      tracker.recordActivity('test-project', eventData);

      const session = tracker.getActiveSession('test-project');

      expect(session).toBeDefined();
      expect(session.projectName).toBe('test-project');
    });
  });

  describe('calculateSessionQuality', () => {
    test('should return default quality for no session', () => {
      const result = tracker.calculateSessionQuality('test-project');

      expect(result.score).toBe(100);
      expect(result.factors).toEqual([]);
      expect(result.recommendation).toBeNull();
    });

    test('should return default quality for < 5 changes', () => {
      const eventData = { change_type: 'change', filepath: 'test.js', diff: 'a' };

      for (let i = 0; i < 3; i++) {
        tracker.recordActivity('test-project', eventData);
      }

      const result = tracker.calculateSessionQuality('test-project');

      expect(result.score).toBe(100);
      expect(result.factors).toEqual([]);
    });

    test('should detect high rollback rate', () => {
      const eventData = { change_type: 'change', filepath: 'test.js', diff: 'a' };

      // Create 10 changes with 3 rollbacks (30% rate)
      for (let i = 0; i < 10; i++) {
        tracker.recordActivity('test-project', eventData);
      }

      const session = tracker.getActiveSession('test-project');
      session.rollbacksCount = 3;

      const result = tracker.calculateSessionQuality('test-project');

      expect(result.score).toBeLessThan(100);
      const rollbackFactor = result.factors.find(f => f.type === 'high_rollback_rate');
      expect(rollbackFactor).toBeDefined();
    });

    test('should detect long session', () => {
      const eventData = { change_type: 'change', filepath: 'test.js', diff: 'a' };

      for (let i = 0; i < 10; i++) {
        tracker.recordActivity('test-project', eventData);
      }

      const session = tracker.getActiveSession('test-project');
      // Simulate 5 hour session
      session.startTime = Date.now() - (5 * 60 * 60 * 1000);

      const result = tracker.calculateSessionQuality('test-project');

      expect(result.score).toBeLessThan(100);
      const longSessionFactor = result.factors.find(f => f.type === 'long_session');
      expect(longSessionFactor).toBeDefined();
    });

    test('should detect increasing change size', () => {
      // Insert 10 changes with increasing size
      for (let i = 0; i < 5; i++) {
        tracker.recordActivity('test-project', {
          change_type: 'change',
          filepath: 'test.js',
          diff: 'a'.repeat(100)
        });
      }

      for (let i = 0; i < 5; i++) {
        tracker.recordActivity('test-project', {
          change_type: 'change',
          filepath: 'test.js',
          diff: 'a'.repeat(300)
        });
      }

      const result = tracker.calculateSessionQuality('test-project');

      expect(result.score).toBeLessThan(100);
      const sizeFactor = result.factors.find(f => f.type === 'increasing_change_size');
      expect(sizeFactor).toBeDefined();
    });

    test('should detect high-risk changes', () => {
      // Insert changes with high risk scores
      for (let i = 0; i < 10; i++) {
        tracker.recordActivity('test-project', {
          change_type: 'change',
          filepath: 'test.js',
          diff: 'test',
          risk_score: i >= 8 ? 80 : 20 // Last 2 are high risk
        });
      }

      const result = tracker.calculateSessionQuality('test-project');

      expect(result.score).toBeLessThan(100);
      const riskFactor = result.factors.find(f => f.type === 'high_risk_changes');
      expect(riskFactor).toBeDefined();
    });

    test('should return critical recommendation for score < 50', () => {
      // Insert changes with increasing size for penalty
      for (let i = 0; i < 5; i++) {
        tracker.recordActivity('test-project', {
          change_type: 'change',
          filepath: 'test.js',
          diff: 'a'.repeat(100),
          risk_score: 30
        });
      }

      for (let i = 0; i < 5; i++) {
        tracker.recordActivity('test-project', {
          change_type: 'change',
          filepath: 'test.js',
          diff: 'a'.repeat(300),
          risk_score: 85 // High risk
        });
      }

      for (let i = 0; i < 10; i++) {
        tracker.recordActivity('test-project', {
          change_type: 'change',
          filepath: 'test.js',
          diff: 'a'.repeat(300)
        });
      }

      const session = tracker.getActiveSession('test-project');
      session.rollbacksCount = 11; // 55% rollback rate (20 changes, 11 rollbacks) - higher than before
      session.startTime = Date.now() - (9 * 60 * 60 * 1000); // 9 hours - longer than before

      const result = tracker.calculateSessionQuality('test-project');

      expect(result.score).toBeLessThan(50);
      expect(result.recommendation).toBeDefined();
      expect(result.recommendation.level).toBe('critical');
      expect(result.recommendation).toHaveProperty('actions');
      expect(result.recommendation.actions).toContain('Take a 15-minute break');
    });

    test('should return warning recommendation for score < 70', () => {
      // Insert older changes with small size
      for (let i = 0; i < 5; i++) {
        tracker.recordActivity('test-project', {
          change_type: 'change',
          filepath: 'test.js',
          diff: 'a'.repeat(100),
          risk_score: 30
        });
      }

      // Insert middle changes with increasing size
      for (let i = 0; i < 5; i++) {
        tracker.recordActivity('test-project', {
          change_type: 'change',
          filepath: 'test.js',
          diff: 'a'.repeat(250),
          risk_score: 30
        });
      }

      // Insert recent changes with large size and high risk (these are last 10)
      for (let i = 0; i < 10; i++) {
        tracker.recordActivity('test-project', {
          change_type: 'change',
          filepath: 'test.js',
          diff: 'a'.repeat(400), // Large diff
          risk_score: 80 // High risk (last 5 will have 2+ high risk)
        });
      }

      const session = tracker.getActiveSession('test-project');
      session.rollbacksCount = 6; // 30% rollback rate = 15 penalty
      session.startTime = Date.now() - (7 * 60 * 60 * 1000); // 7 hours = 15 penalty

      const result = tracker.calculateSessionQuality('test-project');

      // Should trigger: high rollback (15), long session (15), increasing size (15), high risk (10) = ~45 penalty
      expect(result.score).toBeLessThan(70);
      expect(result.recommendation).toBeDefined();
      expect(result.recommendation.level).toBe('warning');
    });

    test('should update session quality score', () => {
      const eventData = { change_type: 'change', filepath: 'test.js', diff: 'a' };

      for (let i = 0; i < 10; i++) {
        tracker.recordActivity('test-project', eventData);
      }

      const session = tracker.getActiveSession('test-project');
      session.rollbacksCount = 3;

      const result = tracker.calculateSessionQuality('test-project');

      expect(session.qualityScore).toBe(result.score);
    });

    test('should include sessionDuration and rollbackRate in result', () => {
      const eventData = { change_type: 'change', filepath: 'test.js', diff: 'a' };

      for (let i = 0; i < 10; i++) {
        tracker.recordActivity('test-project', eventData);
      }

      const result = tracker.calculateSessionQuality('test-project');

      expect(result.sessionDuration).toBeDefined();
      expect(result.rollbackRate).toBeDefined();
    });
  });

  describe('getSessionStats', () => {
    test('should return null if project not found', () => {
      const result = tracker.getSessionStats('nonexistent');

      expect(result).toBeNull();
    });

    test('should return default stats for no sessions', () => {
      const result = tracker.getSessionStats('test-project');

      expect(result.totalSessions).toBe(0);
      expect(result.avgDuration).toBe(0);
      expect(result.avgQuality).toBe(100);
      expect(result.avgRollbackRate).toBe(0);
      expect(result.peakHours).toEqual([]);
    });

    test('should calculate session statistics', () => {
      // Insert test sessions
      testDb.prepare(`
        INSERT INTO sessions (project_name, start_time, end_time, changes_count, rollbacks_count, quality_score)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run('test-project', '2025-10-27T10:00:00Z', '2025-10-27T12:00:00Z', 50, 5, 85);

      testDb.prepare(`
        INSERT INTO sessions (project_name, start_time, end_time, changes_count, rollbacks_count, quality_score)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run('test-project', '2025-10-27T14:00:00Z', '2025-10-27T16:00:00Z', 40, 2, 90);

      const result = tracker.getSessionStats('test-project');

      expect(result.totalSessions).toBe(2);
      expect(parseFloat(result.avgDuration)).toBeGreaterThan(0);
      expect(result.avgQuality).toBeGreaterThan(80);
      expect(result.avgRollbackRate).toContain('%');
    });

    test('should identify peak hours', () => {
      // Insert sessions at different hours
      testDb.prepare(`
        INSERT INTO sessions (project_name, start_time, end_time, changes_count, rollbacks_count, quality_score)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run('test-project', '2025-10-27T10:00:00Z', '2025-10-27T11:00:00Z', 50, 0, 90);

      testDb.prepare(`
        INSERT INTO sessions (project_name, start_time, end_time, changes_count, rollbacks_count, quality_score)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run('test-project', '2025-10-27T14:00:00Z', '2025-10-27T15:00:00Z', 30, 0, 85);

      const result = tracker.getSessionStats('test-project');

      expect(result.peakHours).toBeDefined();
      expect(result.peakHours.length).toBeGreaterThan(0);
      expect(result.peakHours[0]).toHaveProperty('hour');
      expect(result.peakHours[0]).toHaveProperty('avgChanges');
    });

    test('should limit recent sessions to 10', () => {
      // Insert 15 sessions
      for (let i = 0; i < 15; i++) {
        testDb.prepare(`
          INSERT INTO sessions (project_name, start_time, end_time, changes_count, rollbacks_count, quality_score)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run('test-project', `2025-10-${10 + i}T10:00:00Z`, `2025-10-${10 + i}T11:00:00Z`, 10, 0, 90);
      }

      const result = tracker.getSessionStats('test-project');

      expect(result.recentSessions).toHaveLength(10);
    });

    test('should filter sessions by days parameter', () => {
      // Insert old session (beyond 30 days)
      testDb.prepare(`
        INSERT INTO sessions (project_name, start_time, end_time, changes_count, rollbacks_count, quality_score)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run('test-project', '2025-01-01T10:00:00Z', '2025-01-01T11:00:00Z', 10, 0, 90);

      // Insert recent session
      testDb.prepare(`
        INSERT INTO sessions (project_name, start_time, end_time, changes_count, rollbacks_count, quality_score)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run('test-project', new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(), new Date().toISOString(), 10, 0, 90);

      const result = tracker.getSessionStats('test-project', 30);

      expect(result.totalSessions).toBe(1);
    });

    test('should handle database error gracefully', () => {
      testDb.close();

      const result = tracker.getSessionStats('test-project');

      expect(result).toBeNull();
    });
  });

  describe('getBreakRecommendation', () => {
    test('should return no break needed for no session', () => {
      const result = tracker.getBreakRecommendation('test-project');

      expect(result.shouldTakeBreak).toBe(false);
      expect(result.message).toBe('No active session');
    });

    test('should recommend critical break for low quality', () => {
      // Insert changes with increasing size
      for (let i = 0; i < 5; i++) {
        tracker.recordActivity('test-project', {
          change_type: 'change',
          filepath: 'test.js',
          diff: 'a'.repeat(100),
          risk_score: 30
        });
      }

      for (let i = 0; i < 5; i++) {
        tracker.recordActivity('test-project', {
          change_type: 'change',
          filepath: 'test.js',
          diff: 'a'.repeat(300),
          risk_score: 85
        });
      }

      for (let i = 0; i < 10; i++) {
        tracker.recordActivity('test-project', {
          change_type: 'change',
          filepath: 'test.js',
          diff: 'a'.repeat(300)
        });
      }

      const session = tracker.getActiveSession('test-project');
      session.rollbacksCount = 10; // 50% rollback rate
      session.startTime = Date.now() - (8 * 60 * 60 * 1000); // 8 hours

      const result = tracker.getBreakRecommendation('test-project');

      expect(result.shouldTakeBreak).toBe(true);
      expect(result.urgency).toBe('critical');
      expect(result.breakDuration).toBe(15);
    });

    test('should recommend critical break for > 4 hours', () => {
      const eventData = { change_type: 'change', filepath: 'test.js', diff: 'a' };

      for (let i = 0; i < 10; i++) {
        tracker.recordActivity('test-project', eventData);
      }

      const session = tracker.getActiveSession('test-project');
      session.startTime = Date.now() - (5 * 60 * 60 * 1000); // 5 hours

      const result = tracker.getBreakRecommendation('test-project');

      expect(result.shouldTakeBreak).toBe(true);
      expect(result.urgency).toBe('critical');
    });

    test('should recommend warning break for moderate quality', () => {
      const eventData = { change_type: 'change', filepath: 'test.js', diff: 'a' };

      for (let i = 0; i < 15; i++) {
        tracker.recordActivity('test-project', eventData);
      }

      const session = tracker.getActiveSession('test-project');
      session.rollbacksCount = 3;
      session.startTime = Date.now() - (2.5 * 60 * 60 * 1000); // 2.5 hours

      const result = tracker.getBreakRecommendation('test-project');

      expect(result.shouldTakeBreak).toBe(true);
      expect(result.urgency).toBe('warning');
      expect(result.breakDuration).toBe(10);
    });

    test('should recommend info break for > 90 minutes', () => {
      const eventData = { change_type: 'change', filepath: 'test.js', diff: 'a' };

      for (let i = 0; i < 5; i++) {
        tracker.recordActivity('test-project', eventData);
      }

      const session = tracker.getActiveSession('test-project');
      session.startTime = Date.now() - (95 * 60 * 1000); // 95 minutes

      const result = tracker.getBreakRecommendation('test-project');

      expect(result.shouldTakeBreak).toBe(true);
      expect(result.urgency).toBe('info');
      expect(result.breakDuration).toBe(5);
    });

    test('should return no break needed for good session', () => {
      const eventData = { change_type: 'change', filepath: 'test.js', diff: 'a' };

      for (let i = 0; i < 5; i++) {
        tracker.recordActivity('test-project', eventData);
      }

      const result = tracker.getBreakRecommendation('test-project');

      expect(result.shouldTakeBreak).toBe(false);
      expect(result.message).toContain('good shape');
    });
  });

  describe('endAllSessions', () => {
    test('should end all active sessions', () => {
      const eventData = { change_type: 'change', filepath: 'test.js', diff: 'a' };

      // Start sessions for multiple projects
      projectDatabases.set('project1', { db: testDb });
      projectDatabases.set('project2', { db: testDb });

      tracker.recordActivity('project1', eventData);
      tracker.recordActivity('project2', eventData);

      expect(tracker.getActiveSession('project1')).not.toBeNull();
      expect(tracker.getActiveSession('project2')).not.toBeNull();

      tracker.endAllSessions();

      expect(tracker.getActiveSession('project1')).toBeNull();
      expect(tracker.getActiveSession('project2')).toBeNull();
    });

    test('should do nothing if no active sessions', () => {
      tracker.endAllSessions();

      // Should not throw error
    });
  });

  describe('createSessionTracker', () => {
    test('should create SessionTracker instance', () => {
      const instance = createSessionTracker(projectDatabases);

      expect(instance).toBeInstanceOf(SessionTracker);
      expect(instance.projectDatabases).toBe(projectDatabases);
    });
  });
});
