/**
 * Tests for BehaviorProfiler Service
 */

import { describe, test, expect, beforeEach, jest } from '@jest/globals';
import { BehaviorProfiler, createBehaviorProfiler } from '../../services/behavior-profiler.js';

describe('BehaviorProfiler', () => {
  let profiler;
  let mockProjectDatabases;
  let mockDb;
  let mockPrepare;

  beforeEach(() => {
    // Mock database
    mockPrepare = jest.fn();
    mockDb = {
      db: {
        prepare: mockPrepare
      }
    };

    mockProjectDatabases = new Map();
    mockProjectDatabases.set('test-project', mockDb);

    profiler = new BehaviorProfiler(mockProjectDatabases);
  });

  describe('Constructor', () => {
    test('should initialize with project databases', () => {
      expect(profiler.projectDatabases).toBe(mockProjectDatabases);
      expect(profiler.profiles).toBeInstanceOf(Map);
      expect(profiler.profiles.size).toBe(0);
    });
  });

  describe('getAgentProfile', () => {
    test('should return profile for agent with activity', () => {
      const mockStats = {
        total_changes: 100,
        creations: 20,
        modifications: 60,
        deletions: 20,
        avg_diff_size: 500,
        unique_files: 25
      };

      const mockRollbackStats = {
        total: 100,
        rollbacks: 10
      };

      mockPrepare
        .mockReturnValueOnce({ get: () => mockStats })
        .mockReturnValueOnce({ get: () => mockRollbackStats });

      const profile = profiler.getAgentProfile('test-project', 'claude-code', 30);

      expect(profile).toBeDefined();
      expect(profile.agent).toBe('claude-code');
      expect(profile.totalChanges).toBe(100);
      expect(profile.creationRate).toBeCloseTo(0.2);
      expect(profile.modificationRate).toBeCloseTo(0.6);
      expect(profile.deletionRate).toBeCloseTo(0.2);
      expect(profile.avgChangeSize).toBe(500);
      expect(profile.uniqueFiles).toBe(25);
      expect(profile.changesPerDay).toBeCloseTo(100 / 30);
      expect(profile.mood).toBeDefined();
      expect(profile.style).toBeDefined();
      expect(profile.confidence).toBeDefined();
    });

    test('should return null if no changes found', () => {
      const mockStats = {
        total_changes: 0
      };

      mockPrepare.mockReturnValueOnce({ get: () => mockStats });

      const profile = profiler.getAgentProfile('test-project', 'ant', 30);
      expect(profile).toBeNull();
    });

    test('should return null if database not found', () => {
      const profile = profiler.getAgentProfile('nonexistent-project', 'ant', 30);
      expect(profile).toBeNull();
    });

    test('should cache profiles for 5 minutes', () => {
      const mockStats = {
        total_changes: 50,
        creations: 10,
        modifications: 30,
        deletions: 10,
        avg_diff_size: 300,
        unique_files: 15
      };

      const mockRollbackStats = {
        total: 50,
        rollbacks: 5
      };

      mockPrepare
        .mockReturnValueOnce({ get: () => mockStats })
        .mockReturnValueOnce({ get: () => mockRollbackStats });

      // First call
      const profile1 = profiler.getAgentProfile('test-project', 'cursor', 30);
      expect(mockPrepare).toHaveBeenCalledTimes(2);

      // Second call - should use cache
      const profile2 = profiler.getAgentProfile('test-project', 'cursor', 30);
      expect(mockPrepare).toHaveBeenCalledTimes(2); // No additional calls
      expect(profile2).toBe(profile1);
    });

    test('should expire cache after 5 minutes', () => {
      const mockStats = {
        total_changes: 50,
        creations: 10,
        modifications: 30,
        deletions: 10,
        avg_diff_size: 300,
        unique_files: 15
      };

      const mockRollbackStats = {
        total: 50,
        rollbacks: 5
      };

      mockPrepare
        .mockReturnValueOnce({ get: () => mockStats })
        .mockReturnValueOnce({ get: () => mockRollbackStats });

      // First call
      profiler.getAgentProfile('test-project', 'cursor', 30);

      // Manually expire cache by setting timestamp to 6 minutes ago
      const cacheKey = 'test-project_cursor_30';
      const cached = profiler.profiles.get(cacheKey);
      cached.timestamp = Date.now() - 6 * 60 * 1000;

      // Second call - should fetch fresh data
      mockPrepare
        .mockReturnValueOnce({ get: () => mockStats })
        .mockReturnValueOnce({ get: () => mockRollbackStats });

      profiler.getAgentProfile('test-project', 'cursor', 30);
      expect(mockPrepare).toHaveBeenCalledTimes(4); // 2 + 2 new calls
    });

    test('should handle database errors gracefully', () => {
      mockPrepare.mockImplementation(() => {
        throw new Error('Database error');
      });

      const profile = profiler.getAgentProfile('test-project', 'ant', 30);
      expect(profile).toBeNull();
    });

    test('should use custom lookback period', () => {
      const mockStats = {
        total_changes: 200,
        creations: 40,
        modifications: 120,
        deletions: 40,
        avg_diff_size: 600,
        unique_files: 50
      };

      const mockRollbackStats = {
        total: 200,
        rollbacks: 20
      };

      mockPrepare
        .mockReturnValueOnce({ get: () => mockStats })
        .mockReturnValueOnce({ get: () => mockRollbackStats });

      const profile = profiler.getAgentProfile('test-project', 'copilot', 7);
      expect(profile.changesPerDay).toBeCloseTo(200 / 7);
    });
  });

  describe('detectBehaviorChange', () => {
    test('should detect deletion rate deviation', () => {
      const baselineStats = {
        total_changes: 100,
        creations: 50,
        modifications: 40,
        deletions: 10, // 10% baseline
        avg_diff_size: 500,
        unique_files: 25
      };

      const recentStats = {
        total_changes: 20,
        creations: 2,
        modifications: 3,
        deletions: 15, // 75% recent (huge increase)
        avg_diff_size: 500
      };

      const mockRollbackStats = {
        total: 100,
        rollbacks: 10
      };

      mockPrepare
        .mockReturnValueOnce({ get: () => baselineStats })
        .mockReturnValueOnce({ get: () => mockRollbackStats })
        .mockReturnValueOnce({ get: () => recentStats });

      const change = profiler.detectBehaviorChange('test-project', 'claude-code', 24);

      expect(change).toBeDefined();
      expect(change.agent).toBe('claude-code');
      expect(change.deviations.length).toBeGreaterThan(0);
      expect(change.deviations.some(d => d.metric === 'deletion_rate')).toBe(true);
      expect(change.severity).toBeGreaterThan(0);
      expect(change.message).toBeDefined();
    });

    test('should detect change size deviation', () => {
      const baselineStats = {
        total_changes: 100,
        creations: 50,
        modifications: 40,
        deletions: 10,
        avg_diff_size: 200, // Small baseline
        unique_files: 25
      };

      const recentStats = {
        total_changes: 20,
        creations: 10,
        modifications: 8,
        deletions: 2,
        avg_diff_size: 1000 // 5x larger (huge increase)
      };

      const mockRollbackStats = {
        total: 100,
        rollbacks: 10
      };

      mockPrepare
        .mockReturnValueOnce({ get: () => baselineStats })
        .mockReturnValueOnce({ get: () => mockRollbackStats })
        .mockReturnValueOnce({ get: () => recentStats });

      const change = profiler.detectBehaviorChange('test-project', 'cursor', 24);

      expect(change).toBeDefined();
      expect(change.deviations.some(d => d.metric === 'change_size')).toBe(true);
    });

    test('should detect activity level deviation', () => {
      const baselineStats = {
        total_changes: 30, // 1 change/day
        creations: 15,
        modifications: 10,
        deletions: 5,
        avg_diff_size: 500,
        unique_files: 10
      };

      const recentStats = {
        total_changes: 100, // 100 changes in 24 hours = ~100 changes/day (huge spike)
        creations: 50,
        modifications: 40,
        deletions: 10,
        avg_diff_size: 500
      };

      const mockRollbackStats = {
        total: 30,
        rollbacks: 3
      };

      mockPrepare
        .mockReturnValueOnce({ get: () => baselineStats })
        .mockReturnValueOnce({ get: () => mockRollbackStats })
        .mockReturnValueOnce({ get: () => recentStats });

      const change = profiler.detectBehaviorChange('test-project', 'ant', 24);

      expect(change).toBeDefined();
      expect(change.deviations.some(d => d.metric === 'activity_level')).toBe(true);
    });

    test('should return null if no significant deviations', () => {
      const baselineStats = {
        total_changes: 300, // 10 changes/day
        creations: 150,
        modifications: 120,
        deletions: 30,
        avg_diff_size: 500,
        unique_files: 75
      };

      const recentStats = {
        total_changes: 12, // 12 changes in 24 hours = 12 changes/day (only 20% increase)
        creations: 6,
        modifications: 5,
        deletions: 1,
        avg_diff_size: 510 // Very similar to baseline
      };

      const mockRollbackStats = {
        total: 300,
        rollbacks: 30
      };

      mockPrepare
        .mockReturnValueOnce({ get: () => baselineStats })
        .mockReturnValueOnce({ get: () => mockRollbackStats })
        .mockReturnValueOnce({ get: () => recentStats });

      const change = profiler.detectBehaviorChange('test-project', 'copilot', 24);
      expect(change).toBeNull();
    });

    test('should return null if no recent activity', () => {
      const baselineStats = {
        total_changes: 100,
        creations: 50,
        modifications: 40,
        deletions: 10,
        avg_diff_size: 500,
        unique_files: 25
      };

      const recentStats = {
        total_changes: 0
      };

      const mockRollbackStats = {
        total: 100,
        rollbacks: 10
      };

      mockPrepare
        .mockReturnValueOnce({ get: () => baselineStats })
        .mockReturnValueOnce({ get: () => mockRollbackStats })
        .mockReturnValueOnce({ get: () => recentStats });

      const change = profiler.detectBehaviorChange('test-project', 'aider', 24);
      expect(change).toBeNull();
    });

    test('should return null if no baseline', () => {
      mockPrepare.mockReturnValueOnce({ get: () => ({ total_changes: 0 }) });

      const change = profiler.detectBehaviorChange('test-project', 'unknown-agent', 24);
      expect(change).toBeNull();
    });

    test('should detect mood shift', () => {
      const baselineStats = {
        total_changes: 100,
        creations: 50,
        modifications: 45,
        deletions: 5, // Conservative: 5% deletion
        avg_diff_size: 200, // Small changes
        unique_files: 25
      };

      const recentStats = {
        total_changes: 20,
        creations: 2,
        modifications: 3,
        deletions: 15, // Aggressive: 75% deletion
        avg_diff_size: 1500 // Large changes
      };

      const mockRollbackStats = {
        total: 100,
        rollbacks: 10
      };

      mockPrepare
        .mockReturnValueOnce({ get: () => baselineStats })
        .mockReturnValueOnce({ get: () => mockRollbackStats })
        .mockReturnValueOnce({ get: () => recentStats });

      const change = profiler.detectBehaviorChange('test-project', 'claude-code', 24);

      expect(change).toBeDefined();
      expect(change.baselineMood).toBe('conservative');
      expect(change.currentMood).toBe('aggressive');
      expect(change.message).toContain('mood shifted');
    });

    test('should handle database errors gracefully', () => {
      mockPrepare.mockImplementation(() => {
        throw new Error('Database error');
      });

      const change = profiler.detectBehaviorChange('test-project', 'ant', 24);
      expect(change).toBeNull();
    });

    test('should return null for nonexistent project', () => {
      const change = profiler.detectBehaviorChange('nonexistent', 'ant', 24);
      expect(change).toBeNull();
    });
  });

  describe('determineAgentMood', () => {
    test('should return aggressive for high deletion rate', () => {
      const stats = {
        total_changes: 100,
        deletions: 50, // 50% deletion
        avg_diff_size: 500
      };

      const mood = profiler.determineAgentMood(stats);
      expect(mood).toBe('aggressive');
    });

    test('should return aggressive for large changes', () => {
      const stats = {
        total_changes: 100,
        deletions: 20,
        avg_diff_size: 1500 // Large changes
      };

      const mood = profiler.determineAgentMood(stats);
      expect(mood).toBe('aggressive');
    });

    test('should return conservative for low deletion and small changes', () => {
      const stats = {
        total_changes: 100,
        deletions: 10, // 10% deletion
        avg_diff_size: 200 // Small changes
      };

      const mood = profiler.determineAgentMood(stats);
      expect(mood).toBe('conservative');
    });

    test('should return balanced for moderate values', () => {
      const stats = {
        total_changes: 100,
        deletions: 25, // 25% deletion
        avg_diff_size: 500 // Moderate size
      };

      const mood = profiler.determineAgentMood(stats);
      expect(mood).toBe('balanced');
    });

    test('should handle edge case with zero total changes', () => {
      const stats = {
        total_changes: 0,
        deletions: 0,
        avg_diff_size: 0
      };

      // With total_changes = 0, deletionRate = 0/0 = NaN
      // NaN doesn't match any condition, so returns 'balanced'
      const mood = profiler.determineAgentMood(stats);
      expect(mood).toBe('balanced');
    });
  });

  describe('determineAgentStyle', () => {
    test('should return builder for high creation rate', () => {
      const stats = {
        total_changes: 100,
        creations: 60, // 60% creation
        modifications: 30,
        deletions: 10
      };

      const style = profiler.determineAgentStyle(stats);
      expect(style).toBe('builder');
    });

    test('should return cleanup for high deletion rate', () => {
      const stats = {
        total_changes: 100,
        creations: 10,
        modifications: 40,
        deletions: 50 // 50% deletion
      };

      const style = profiler.determineAgentStyle(stats);
      expect(style).toBe('cleanup');
    });

    test('should return refactorer for high modification rate', () => {
      const stats = {
        total_changes: 100,
        creations: 10,
        modifications: 80, // 80% modification
        deletions: 10
      };

      const style = profiler.determineAgentStyle(stats);
      expect(style).toBe('refactorer');
    });

    test('should return mixed for balanced operations', () => {
      const stats = {
        total_changes: 100,
        creations: 30,
        modifications: 40,
        deletions: 30
      };

      const style = profiler.determineAgentStyle(stats);
      expect(style).toBe('mixed');
    });
  });

  describe('calculateConfidence', () => {
    test('should return high confidence with no rollbacks', () => {
      const mockStats = {
        total: 100,
        rollbacks: 0
      };

      mockPrepare.mockReturnValueOnce({ get: () => mockStats });

      const confidence = profiler.calculateConfidence(mockDb, 'claude-code', '2025-01-01');
      expect(confidence).toBe(100);
    });

    test('should return medium confidence with some rollbacks', () => {
      const mockStats = {
        total: 100,
        rollbacks: 20 // 20% rollback rate
      };

      mockPrepare.mockReturnValueOnce({ get: () => mockStats });

      const confidence = profiler.calculateConfidence(mockDb, 'cursor', '2025-01-01');
      expect(confidence).toBe(80);
    });

    test('should return low confidence with many rollbacks', () => {
      const mockStats = {
        total: 100,
        rollbacks: 70 // 70% rollback rate
      };

      mockPrepare.mockReturnValueOnce({ get: () => mockStats });

      const confidence = profiler.calculateConfidence(mockDb, 'copilot', '2025-01-01');
      expect(confidence).toBe(30);
    });

    test('should return default 50 confidence for no data', () => {
      const mockStats = {
        total: 0,
        rollbacks: 0
      };

      mockPrepare.mockReturnValueOnce({ get: () => mockStats });

      const confidence = profiler.calculateConfidence(mockDb, 'ant', '2025-01-01');
      expect(confidence).toBe(50);
    });

    test('should return default 50 confidence on error', () => {
      mockPrepare.mockImplementation(() => {
        throw new Error('Query error');
      });

      const confidence = profiler.calculateConfidence(mockDb, 'ant', '2025-01-01');
      expect(confidence).toBe(50);
    });
  });

  describe('generateBehaviorChangeMessage', () => {
    test('should include mood shift in message', () => {
      const deviations = [];
      const message = profiler.generateBehaviorChangeMessage('conservative', 'aggressive', deviations);
      expect(message).toContain('mood shifted from conservative to aggressive');
    });

    test('should not include mood shift if unchanged', () => {
      const deviations = [];
      const message = profiler.generateBehaviorChangeMessage('balanced', 'balanced', deviations);
      expect(message).not.toContain('mood shifted');
    });

    test('should include deviation details', () => {
      const deviations = [
        {
          metric: 'deletion_rate',
          change: '↑200%',
          baseline: '10.0%',
          current: '30.0%'
        },
        {
          metric: 'change_size',
          change: '↑150%',
          baseline: '500 bytes',
          current: '1250 bytes'
        }
      ];

      const message = profiler.generateBehaviorChangeMessage('balanced', 'aggressive', deviations);
      expect(message).toContain('deletion rate');
      expect(message).toContain('↑200%');
      expect(message).toContain('change size');
      expect(message).toContain('↑150%');
    });

    test('should handle empty deviations with mood shift', () => {
      const message = profiler.generateBehaviorChangeMessage('balanced', 'aggressive', []);
      expect(message).toBe('Agent mood shifted from balanced to aggressive');
    });
  });

  describe('compareAgents', () => {
    test('should return profiles for all active agents', () => {
      const mockAgents = [
        { agent: 'claude-code' },
        { agent: 'cursor' },
        { agent: 'copilot' }
      ];

      const mockStats1 = {
        total_changes: 100,
        creations: 50,
        modifications: 40,
        deletions: 10,
        avg_diff_size: 500,
        unique_files: 25
      };

      const mockStats2 = {
        total_changes: 50,
        creations: 20,
        modifications: 25,
        deletions: 5,
        avg_diff_size: 300,
        unique_files: 15
      };

      const mockStats3 = {
        total_changes: 75,
        creations: 30,
        modifications: 35,
        deletions: 10,
        avg_diff_size: 400,
        unique_files: 20
      };

      const mockRollbackStats = {
        total: 100,
        rollbacks: 10
      };

      mockPrepare
        .mockReturnValueOnce({ all: () => mockAgents })
        .mockReturnValueOnce({ get: () => mockStats1 })
        .mockReturnValueOnce({ get: () => mockRollbackStats })
        .mockReturnValueOnce({ get: () => mockStats2 })
        .mockReturnValueOnce({ get: () => mockRollbackStats })
        .mockReturnValueOnce({ get: () => mockStats3 })
        .mockReturnValueOnce({ get: () => mockRollbackStats });

      const comparisons = profiler.compareAgents('test-project');

      expect(comparisons).toHaveLength(3);
      // Should be sorted by totalChanges descending
      expect(comparisons[0].totalChanges).toBeGreaterThanOrEqual(comparisons[1].totalChanges);
      expect(comparisons[1].totalChanges).toBeGreaterThanOrEqual(comparisons[2].totalChanges);
    });

    test('should return empty array for nonexistent project', () => {
      const comparisons = profiler.compareAgents('nonexistent');
      expect(comparisons).toEqual([]);
    });

    test('should handle agents with no profile', () => {
      const mockAgents = [
        { agent: 'claude-code' },
        { agent: 'unknown-agent' }
      ];

      const mockStats = {
        total_changes: 100,
        creations: 50,
        modifications: 40,
        deletions: 10,
        avg_diff_size: 500,
        unique_files: 25
      };

      const mockRollbackStats = {
        total: 100,
        rollbacks: 10
      };

      mockPrepare
        .mockReturnValueOnce({ all: () => mockAgents })
        .mockReturnValueOnce({ get: () => mockStats })
        .mockReturnValueOnce({ get: () => mockRollbackStats })
        .mockReturnValueOnce({ get: () => ({ total_changes: 0 }) });

      const comparisons = profiler.compareAgents('test-project');

      expect(comparisons).toHaveLength(1); // Only claude-code has a valid profile
      expect(comparisons[0].agent).toBe('claude-code');
    });

    test('should handle database errors gracefully', () => {
      mockPrepare.mockImplementation(() => {
        throw new Error('Query error');
      });

      const comparisons = profiler.compareAgents('test-project');
      expect(comparisons).toEqual([]);
    });
  });

  describe('updateDailyStats', () => {
    test('should update stats for active agents', () => {
      const mockAgents = [
        { agent: 'claude-code' },
        { agent: 'cursor' }
      ];

      const mockStats = {
        changes_count: 50,
        avg_change_size: 500,
        avg_confidence: 85
      };

      const mockRollbacks = {
        count: 5
      };

      const mockRun = jest.fn();

      mockPrepare
        .mockReturnValueOnce({ all: () => mockAgents })
        .mockReturnValueOnce({ get: () => mockStats })
        .mockReturnValueOnce({ get: () => mockRollbacks })
        .mockReturnValueOnce({ run: mockRun })
        .mockReturnValueOnce({ get: () => mockStats })
        .mockReturnValueOnce({ get: () => mockRollbacks })
        .mockReturnValueOnce({ run: mockRun });

      profiler.updateDailyStats('test-project', new Date('2025-10-28'));

      expect(mockRun).toHaveBeenCalledTimes(2);
    });

    test('should calculate success rate correctly', () => {
      const mockAgents = [{ agent: 'claude-code' }];
      const mockStats = {
        changes_count: 100,
        avg_change_size: 500,
        avg_confidence: 90
      };
      const mockRollbacks = {
        count: 20 // 20% rollback rate
      };

      const mockRun = jest.fn();

      mockPrepare
        .mockReturnValueOnce({ all: () => mockAgents })
        .mockReturnValueOnce({ get: () => mockStats })
        .mockReturnValueOnce({ get: () => mockRollbacks })
        .mockReturnValueOnce({ run: mockRun });

      profiler.updateDailyStats('test-project', new Date('2025-10-28'));

      // Check the success rate argument (8th argument in run call)
      const runArgs = mockRun.mock.calls[0];
      expect(runArgs[7]).toBeCloseTo(0.8); // 80% success rate
    });

    test('should handle 100% success rate (no rollbacks)', () => {
      const mockAgents = [{ agent: 'claude-code' }];
      const mockStats = {
        changes_count: 100,
        avg_change_size: 500,
        avg_confidence: 95
      };
      const mockRollbacks = {
        count: 0 // No rollbacks
      };

      const mockRun = jest.fn();

      mockPrepare
        .mockReturnValueOnce({ all: () => mockAgents })
        .mockReturnValueOnce({ get: () => mockStats })
        .mockReturnValueOnce({ get: () => mockRollbacks })
        .mockReturnValueOnce({ run: mockRun });

      profiler.updateDailyStats('test-project', new Date('2025-10-28'));

      const runArgs = mockRun.mock.calls[0];
      expect(runArgs[7]).toBe(1.0); // 100% success rate
    });

    test('should handle zero changes gracefully', () => {
      const mockAgents = [{ agent: 'inactive-agent' }];
      const mockStats = {
        changes_count: 0,
        avg_change_size: null,
        avg_confidence: null
      };
      const mockRollbacks = {
        count: 0
      };

      const mockRun = jest.fn();

      mockPrepare
        .mockReturnValueOnce({ all: () => mockAgents })
        .mockReturnValueOnce({ get: () => mockStats })
        .mockReturnValueOnce({ get: () => mockRollbacks })
        .mockReturnValueOnce({ run: mockRun });

      profiler.updateDailyStats('test-project', new Date('2025-10-28'));

      expect(mockRun).toHaveBeenCalled();
      const runArgs = mockRun.mock.calls[0];
      expect(runArgs[5]).toBe(0); // avg_change_size
      expect(runArgs[6]).toBe(0); // avg_confidence
      expect(runArgs[7]).toBe(1.0); // success_rate (default to 100% if no changes)
    });

    test('should handle database errors gracefully', () => {
      mockPrepare.mockImplementation(() => {
        throw new Error('Database error');
      });

      // Should not throw
      expect(() => {
        profiler.updateDailyStats('test-project', new Date('2025-10-28'));
      }).not.toThrow();
    });

    test('should return early if database not found', () => {
      profiler.updateDailyStats('nonexistent', new Date('2025-10-28'));
      expect(mockPrepare).not.toHaveBeenCalled();
    });
  });

  describe('clearCache', () => {
    test('should clear profile cache', () => {
      // Add something to cache
      profiler.profiles.set('key1', { data: 'value1' });
      profiler.profiles.set('key2', { data: 'value2' });

      expect(profiler.profiles.size).toBe(2);

      profiler.clearCache();
      expect(profiler.profiles.size).toBe(0);
    });
  });

  describe('createBehaviorProfiler factory', () => {
    test('should create BehaviorProfiler instance', () => {
      const instance = createBehaviorProfiler(mockProjectDatabases);
      expect(instance).toBeInstanceOf(BehaviorProfiler);
      expect(instance.projectDatabases).toBe(mockProjectDatabases);
    });
  });

  describe('Edge cases', () => {
    test('should handle null stats', () => {
      mockPrepare.mockReturnValueOnce({ get: () => null });

      const profile = profiler.getAgentProfile('test-project', 'agent', 30);
      expect(profile).toBeNull();
    });

    test('should handle null avg_diff_size', () => {
      const mockStats = {
        total_changes: 100,
        creations: 50,
        modifications: 40,
        deletions: 10,
        avg_diff_size: null, // SQL AVG returns null when no data
        unique_files: 25
      };

      const mockRollbackStats = {
        total: 100,
        rollbacks: 10
      };

      mockPrepare
        .mockReturnValueOnce({ get: () => mockStats })
        .mockReturnValueOnce({ get: () => mockRollbackStats });

      const profile = profiler.getAgentProfile('test-project', 'agent', 30);
      expect(profile).toBeDefined();
      // Math.round(null) returns 0
      expect(profile.avgChangeSize).toBe(0);
    });

    test('should handle very small baseline values in deviation detection', () => {
      const baselineStats = {
        total_changes: 100,
        creations: 99,
        modifications: 0,
        deletions: 1, // Very small baseline: 1%
        avg_diff_size: 10, // Very small
        unique_files: 25
      };

      const recentStats = {
        total_changes: 20,
        creations: 10,
        modifications: 5,
        deletions: 5, // 25% - but baseline is so small this triggers deviation
        avg_diff_size: 500 // Much larger
      };

      const mockRollbackStats = {
        total: 100,
        rollbacks: 10
      };

      mockPrepare
        .mockReturnValueOnce({ get: () => baselineStats })
        .mockReturnValueOnce({ get: () => mockRollbackStats })
        .mockReturnValueOnce({ get: () => recentStats });

      const change = profiler.detectBehaviorChange('test-project', 'agent', 24);
      expect(change).toBeDefined();
      expect(change.deviations.length).toBeGreaterThan(0);
    });
  });
});
