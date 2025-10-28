/**
 * Tests for RiskAnalyzer Service
 */

import { describe, test, expect, beforeEach, jest } from '@jest/globals';
import { RiskAnalyzer, createRiskAnalyzer } from '../../services/risk-analyzer.js';

describe('RiskAnalyzer', () => {
  let analyzer;
  let mockProjectDatabases;
  let mockDb;
  let mockPrepare;

  beforeEach(() => {
    mockPrepare = jest.fn();
    mockDb = {
      db: {
        prepare: mockPrepare
      }
    };

    mockProjectDatabases = new Map();
    mockProjectDatabases.set('test-project', mockDb);

    analyzer = new RiskAnalyzer(mockProjectDatabases);
  });

  describe('Constructor', () => {
    test('should initialize with project databases', () => {
      expect(analyzer.projectDatabases).toBe(mockProjectDatabases);
      expect(analyzer.criticalityCache).toBeInstanceOf(Map);
    });
  });

  describe('analyzeRisk', () => {
    test('should analyze risk with all factors', () => {
      const change = {
        filepath: '/src/database.js',
        change_type: 'change',
        diff: 'x'.repeat(500)
      };

      // Mock rollback history (high risk)
      const mockHistory = [
        { id: 1, rollback_id: 1, reason: 'broke stuff', rollback_time: '2025-10-20' },
        { id: 2, rollback_id: 2, reason: 'syntax error', rollback_time: '2025-10-22' },
        { id: 3, rollback_id: null }
      ];

      const mockOverallRate = { rate: 0.1 }; // 10% overall rate
      const mockRecentRollbacks = [
        { reason: 'broke stuff', timestamp: '2025-10-20' }
      ];

      mockPrepare
        .mockReturnValueOnce({ all: () => mockHistory }) // analyzeRollbackHistory
        .mockReturnValueOnce({ get: () => mockOverallRate }) // getOverallRollbackRate
        .mockReturnValueOnce({ get: () => ({ avg_size: 300, count: 10 }) }) // analyzeChangeSize
        .mockReturnValueOnce({ get: () => ({ recent_rollbacks: 2, recent_changes: 5 }) }) // analyzeRecentRollbacks
        .mockReturnValueOnce({ get: () => ({ total_changes: 100, rollbacks: 50 }) }) // analyzeChangePattern
        .mockReturnValueOnce({ all: () => mockRecentRollbacks }) // getRecentRollbacks
        .mockReturnValueOnce({ get: () => ({ rate: 0.15 }) }); // getOverallRollbackRate (final)

      const result = analyzer.analyzeRisk(change, 'test-project');

      expect(result).toBeDefined();
      expect(result.riskScore).toBeDefined();
      expect(result.riskLevel).toBeDefined();
      expect(result.riskFactors).toBeDefined();
      expect(result.riskFactors.length).toBeGreaterThan(0);
      expect(result.recommendation).toBeDefined();
    });

    test('should return error for nonexistent project', () => {
      const change = { filepath: '/test.js' };
      const result = analyzer.analyzeRisk(change, 'nonexistent');

      expect(result.riskScore).toBe(0);
      expect(result.riskLevel).toBe('unknown');
      expect(result.error).toBe('Project database not found');
    });

    test('should handle low risk scenario', () => {
      const change = {
        filepath: '/src/utils.js',
        change_type: 'change',
        diff: 'x'.repeat(100)
      };

      const mockHistory = [
        { id: 1, rollback_id: null },
        { id: 2, rollback_id: null },
        { id: 3, rollback_id: null }
      ];

      mockPrepare
        .mockReturnValueOnce({ all: () => mockHistory })
        .mockReturnValueOnce({ get: () => ({ rate: 0.1 }) })
        .mockReturnValueOnce({ get: () => ({ avg_size: 300, count: 10 }) })
        .mockReturnValueOnce({ get: () => ({ recent_rollbacks: 0, recent_changes: 10 }) })
        .mockReturnValueOnce({ get: () => ({ total_changes: 100, rollbacks: 5 }) })
        .mockReturnValueOnce({ all: () => [] })
        .mockReturnValueOnce({ get: () => ({ rate: 0.05 }) });

      const result = analyzer.analyzeRisk(change, 'test-project');

      expect(result.riskScore).toBeLessThan(50);
      expect(result.riskLevel).toMatch(/low|minimal/i);
    });

    test('should handle missing diff', () => {
      const change = {
        filepath: '/test.js',
        change_type: 'change'
      };

      mockPrepare
        .mockReturnValue({ all: () => [], get: () => null });

      const result = analyzer.analyzeRisk(change, 'test-project');
      expect(result).toBeDefined();
    });
  });

  describe('analyzeRollbackHistory', () => {
    test('should detect high rollback rate', () => {
      const mockHistory = [
        { id: 1, rollback_id: 1 },
        { id: 2, rollback_id: 2 },
        { id: 3, rollback_id: null }
      ];

      const mockOverallRate = { rate: 0.1 }; // 10% overall

      mockPrepare
        .mockReturnValueOnce({ all: () => mockHistory })
        .mockReturnValueOnce({ get: () => mockOverallRate });

      const result = analyzer.analyzeRollbackHistory(mockDb, '/critical.js');

      expect(result).toBeDefined();
      expect(result.type).toBe('high_rollback_rate');
      expect(result.severity).toBeGreaterThan(0.5);
    });

    test('should return null for files with no history', () => {
      mockPrepare.mockReturnValueOnce({ all: () => [] });

      const result = analyzer.analyzeRollbackHistory(mockDb, '/new-file.js');
      expect(result).toBeNull();
    });

    test('should return null for stable files', () => {
      const mockHistory = [
        { id: 1, rollback_id: null },
        { id: 2, rollback_id: null },
        { id: 3, rollback_id: null }
      ];

      const mockOverallRate = { rate: 0.1 };

      mockPrepare
        .mockReturnValueOnce({ all: () => mockHistory })
        .mockReturnValueOnce({ get: () => mockOverallRate });

      const result = analyzer.analyzeRollbackHistory(mockDb, '/stable.js');
      expect(result).toBeNull();
    });

    test('should handle database errors', () => {
      mockPrepare.mockImplementation(() => {
        throw new Error('Query error');
      });

      const result = analyzer.analyzeRollbackHistory(mockDb, '/test.js');
      expect(result).toBeNull();
    });
  });

  describe('analyzeFileCriticality', () => {
    test('should identify critical database files', () => {
      const result = analyzer.analyzeFileCriticality('/src/database.js');
      expect(result).toBeDefined();
      expect(result.type).toBe('critical_file');
      expect(result.severity).toBeGreaterThan(0.7);
    });

    test('should identify critical auth files', () => {
      const result = analyzer.analyzeFileCriticality('/src/auth.js');
      expect(result).toBeDefined();
      expect(result.type).toBe('critical_file');
    });

    test('should identify critical security files', () => {
      const result = analyzer.analyzeFileCriticality('/src/security/index.js');
      expect(result).toBeDefined();
      expect(result.type).toBe('critical_file');
    });

    test('should identify critical payment files', () => {
      const result = analyzer.analyzeFileCriticality('/src/payment.js');
      expect(result).toBeDefined();
      expect(result.type).toBe('critical_file');
    });

    test('should return null for non-critical files', () => {
      const result = analyzer.analyzeFileCriticality('/src/utils.js');
      expect(result).toBeNull();
    });

    test('should cache results', () => {
      const filepath = '/src/database.js';

      const result1 = analyzer.analyzeFileCriticality(filepath);
      const result2 = analyzer.analyzeFileCriticality(filepath);

      expect(result1).toBe(result2); // Same object reference
    });

    test('should handle various file extensions', () => {
      const jsResult = analyzer.analyzeFileCriticality('/src/database.js');
      const tsResult = analyzer.analyzeFileCriticality('/src/database.ts');

      expect(jsResult).toBeDefined();
      expect(tsResult).toBeDefined();
    });
  });

  describe('analyzeChangeSize', () => {
    test('should detect unusually large changes', () => {
      const change = {
        filepath: '/test.js',
        diff: 'x'.repeat(2000) // Very large change
      };

      mockPrepare.mockReturnValueOnce({
        get: () => ({ avg_size: 300, count: 10 })
      });

      const result = analyzer.analyzeChangeSize(mockDb, change);

      expect(result).toBeDefined();
      expect(result.type).toBe('large_change');
      expect(result.severity).toBeGreaterThan(0.5);
    });

    test('should return null for normal-sized changes', () => {
      const change = {
        filepath: '/test.js',
        diff: 'x'.repeat(250) // Close to average
      };

      mockPrepare.mockReturnValueOnce({
        get: () => ({ avg_size: 300, count: 10 })
      });

      const result = analyzer.analyzeChangeSize(mockDb, change);
      expect(result).toBeNull();
    });

    test('should return null for changes without diff', () => {
      const change = {
        filepath: '/test.js'
      };

      const result = analyzer.analyzeChangeSize(mockDb, change);
      expect(result).toBeNull();
    });

    test('should return null when no historical data exists', () => {
      const change = {
        filepath: '/test.js',
        diff: 'x'.repeat(2000)
      };

      mockPrepare.mockReturnValueOnce({
        get: () => null
      });

      const result = analyzer.analyzeChangeSize(mockDb, change);
      expect(result).toBeNull();
    });

    test('should handle database errors', () => {
      const change = {
        filepath: '/test.js',
        diff: 'test'
      };

      mockPrepare.mockImplementation(() => {
        throw new Error('Query error');
      });

      const result = analyzer.analyzeChangeSize(mockDb, change);
      expect(result).toBeNull();
    });
  });

  describe('analyzeRecentRollbacks', () => {
    test('should detect recent rollback spike', () => {
      mockPrepare.mockReturnValueOnce({
        get: () => ({
          recent_rollbacks: 5,
          recent_changes: 10 // 50% rollback rate recently
        })
      });

      const result = analyzer.analyzeRecentRollbacks(mockDb, '/test.js');

      expect(result).toBeDefined();
      expect(result.type).toBe('recent_rollbacks');
      expect(result.severity).toBeGreaterThan(0.5);
    });

    test('should return null when no recent rollbacks', () => {
      mockPrepare.mockReturnValueOnce({
        get: () => ({
          recent_rollbacks: 0,
          recent_changes: 10
        })
      });

      const result = analyzer.analyzeRecentRollbacks(mockDb, '/test.js');
      expect(result).toBeNull();
    });

    test('should return null when no recent activity', () => {
      mockPrepare.mockReturnValueOnce({
        get: () => null
      });

      const result = analyzer.analyzeRecentRollbacks(mockDb, '/test.js');
      expect(result).toBeNull();
    });

    test('should handle database errors', () => {
      mockPrepare.mockImplementation(() => {
        throw new Error('Query error');
      });

      const result = analyzer.analyzeRecentRollbacks(mockDb, '/test.js');
      expect(result).toBeNull();
    });
  });

  describe('analyzeChangePattern', () => {
    test('should detect high-risk change type patterns', () => {
      const change = {
        filepath: '/test.js',
        change_type: 'unlink' // Deletion
      };

      mockPrepare.mockReturnValueOnce({
        get: () => ({
          total_changes: 100,
          rollbacks: 60 // 60% rollback rate for this change type
        })
      });

      const result = analyzer.analyzeChangePattern(mockDb, change);

      expect(result).toBeDefined();
      expect(result.type).toBe('risky_change_pattern');
      expect(result.severity).toBeGreaterThan(0.5);
    });

    test('should return null for safe change patterns', () => {
      const change = {
        filepath: '/test.js',
        change_type: 'add'
      };

      mockPrepare.mockReturnValueOnce({
        get: () => ({
          total_changes: 100,
          rollbacks: 5 // 5% rollback rate
        })
      });

      const result = analyzer.analyzeChangePattern(mockDb, change);
      expect(result).toBeNull();
    });

    test('should return null when no pattern data exists', () => {
      const change = {
        filepath: '/test.js',
        change_type: 'change'
      };

      mockPrepare.mockReturnValueOnce({
        get: () => null
      });

      const result = analyzer.analyzeChangePattern(mockDb, change);
      expect(result).toBeNull();
    });

    test('should handle database errors', () => {
      const change = {
        filepath: '/test.js',
        change_type: 'change'
      };

      mockPrepare.mockImplementation(() => {
        throw new Error('Query error');
      });

      const result = analyzer.analyzeChangePattern(mockDb, change);
      expect(result).toBeNull();
    });
  });

  describe('calculateRiskScore', () => {
    test('should calculate weighted risk score', () => {
      const riskFactors = [
        { type: 'high_rollback_rate', severity: 0.8 },
        { type: 'critical_file', severity: 0.9 },
        { type: 'large_change', severity: 0.6 }
      ];

      const score = analyzer.calculateRiskScore(riskFactors);

      expect(score).toBeGreaterThan(0);
      expect(score).toBeLessThanOrEqual(1);
    });

    test('should return 0 for no risk factors', () => {
      const score = analyzer.calculateRiskScore([]);
      expect(score).toBe(0);
    });

    test('should cap score at 1.0', () => {
      const riskFactors = [
        { type: 'high_rollback_rate', severity: 1.0 },
        { type: 'critical_file', severity: 1.0 },
        { type: 'large_change', severity: 1.0 },
        { type: 'recent_rollbacks', severity: 1.0 }
      ];

      const score = analyzer.calculateRiskScore(riskFactors);
      expect(score).toBeLessThanOrEqual(1.0);
    });
  });

  describe('getRiskLevel', () => {
    test('should return minimal for very low scores', () => {
      expect(analyzer.getRiskLevel(0.05)).toMatch(/minimal/i);
    });

    test('should return low for low scores', () => {
      expect(analyzer.getRiskLevel(0.25)).toMatch(/low/i);
    });

    test('should return medium for medium scores', () => {
      expect(analyzer.getRiskLevel(0.50)).toMatch(/medium/i);
    });

    test('should return high for high scores', () => {
      expect(analyzer.getRiskLevel(0.75)).toMatch(/high/i);
    });

    test('should return critical for very high scores', () => {
      expect(analyzer.getRiskLevel(0.95)).toMatch(/critical/i);
    });
  });

  describe('generateRecommendation', () => {
    test('should recommend caution for high risk', () => {
      const riskFactors = [
        { type: 'high_rollback_rate', severity: 0.9, message: 'High rollback rate' }
      ];

      const recommendation = analyzer.generateRecommendation(0.8, riskFactors);

      expect(recommendation).toBeDefined();
      expect(typeof recommendation).toBe('string');
      expect(recommendation.length).toBeGreaterThan(0);
    });

    test('should provide approval for low risk', () => {
      const recommendation = analyzer.generateRecommendation(0.1, []);

      expect(recommendation).toBeDefined();
      expect(recommendation.length).toBeGreaterThan(0);
    });

    test('should mention critical files in recommendation', () => {
      const riskFactors = [
        { type: 'critical_file', severity: 0.9, message: 'Critical database file' }
      ];

      const recommendation = analyzer.generateRecommendation(0.7, riskFactors);

      expect(recommendation).toMatch(/critical|review|careful/i);
    });
  });

  describe('getRecentRollbacks', () => {
    test('should retrieve recent rollbacks for file', () => {
      const mockRollbacks = [
        { reason: 'Broke production', timestamp: '2025-10-25', automatic: 0 },
        { reason: 'Syntax error', timestamp: '2025-10-24', automatic: 1 }
      ];

      mockPrepare.mockReturnValueOnce({
        all: () => mockRollbacks
      });

      const result = analyzer.getRecentRollbacks(mockDb, '/test.js', 2);

      expect(result).toHaveLength(2);
      expect(result[0].reason).toBe('Broke production');
    });

    test('should limit results', () => {
      const mockRollbacks = Array(10).fill({ reason: 'Test', timestamp: '2025-10-25' });

      mockPrepare.mockReturnValueOnce({
        all: () => mockRollbacks
      });

      const result = analyzer.getRecentRollbacks(mockDb, '/test.js', 3);

      expect(result.length).toBeLessThanOrEqual(3);
    });

    test('should return empty array on error', () => {
      mockPrepare.mockImplementation(() => {
        throw new Error('Query error');
      });

      const result = analyzer.getRecentRollbacks(mockDb, '/test.js');
      expect(result).toEqual([]);
    });

    test('should use default limit of 5', () => {
      const mockRollbacks = Array(10).fill({ reason: 'Test', timestamp: '2025-10-25' });

      mockPrepare.mockReturnValueOnce({
        all: () => mockRollbacks
      });

      analyzer.getRecentRollbacks(mockDb, '/test.js');

      const allArgs = mockPrepare.mock.calls[0][0];
      expect(allArgs).toContain('LIMIT');
    });
  });

  describe('getOverallRollbackRate', () => {
    test('should calculate overall rollback rate', () => {
      mockPrepare.mockReturnValueOnce({
        get: () => ({ rate: 0.15 }) // 15%
      });

      const rate = analyzer.getOverallRollbackRate(mockDb);
      expect(rate).toBe(0.15);
    });

    test('should return 0 for no data', () => {
      mockPrepare.mockReturnValueOnce({
        get: () => null
      });

      const rate = analyzer.getOverallRollbackRate(mockDb);
      expect(rate).toBe(0);
    });

    test('should handle database errors', () => {
      mockPrepare.mockImplementation(() => {
        throw new Error('Query error');
      });

      const rate = analyzer.getOverallRollbackRate(mockDb);
      expect(rate).toBe(0);
    });

    test('should handle null rate in result', () => {
      mockPrepare.mockReturnValueOnce({
        get: () => ({ rate: null })
      });

      const rate = analyzer.getOverallRollbackRate(mockDb);
      expect(rate).toBe(0);
    });
  });

  describe('trackRollback', () => {
    test('should track manual rollback', () => {
      const mockRun = jest.fn();

      mockPrepare.mockReturnValueOnce({
        run: mockRun
      });

      analyzer.trackRollback(mockDb, 123, 'broke production', false);

      expect(mockRun).toHaveBeenCalled();
      const runArgs = mockRun.mock.calls[0];
      expect(runArgs[0]).toBe(123); // event_id
      expect(runArgs[1]).toBe('broke production'); // reason
      expect(runArgs[2]).toBe(0); // automatic (false = 0)
    });

    test('should track automatic rollback', () => {
      const mockRun = jest.fn();

      mockPrepare.mockReturnValueOnce({
        run: mockRun
      });

      analyzer.trackRollback(mockDb, 456, 'auto-rollback', true);

      expect(mockRun).toHaveBeenCalled();
      const runArgs = mockRun.mock.calls[0];
      expect(runArgs[2]).toBe(1); // automatic (true = 1)
    });

    test('should handle database errors gracefully', () => {
      mockPrepare.mockImplementation(() => {
        throw new Error('Insert failed');
      });

      // Should not throw
      expect(() => {
        analyzer.trackRollback(mockDb, 123, 'test');
      }).not.toThrow();
    });

    test('should handle missing reason', () => {
      const mockRun = jest.fn();

      mockPrepare.mockReturnValueOnce({
        run: mockRun
      });

      analyzer.trackRollback(mockDb, 123);

      expect(mockRun).toHaveBeenCalled();
    });
  });

  describe('clearCache', () => {
    test('should clear criticality cache', () => {
      analyzer.criticalityCache.set('/test.js', { data: 'test' });
      expect(analyzer.criticalityCache.size).toBe(1);

      analyzer.clearCache();
      expect(analyzer.criticalityCache.size).toBe(0);
    });
  });

  describe('createRiskAnalyzer factory', () => {
    test('should create RiskAnalyzer instance', () => {
      const instance = createRiskAnalyzer(mockProjectDatabases);
      expect(instance).toBeInstanceOf(RiskAnalyzer);
      expect(instance.projectDatabases).toBe(mockProjectDatabases);
    });
  });

  describe('Edge cases', () => {
    test('should handle filepath with special characters', () => {
      const filepath = '/src/files/my-file (copy).js';
      const result = analyzer.analyzeFileCriticality(filepath);
      expect(result).toBeDefined();
    });

    test('should handle very long filepaths', () => {
      const filepath = '/src/' + 'a/'.repeat(100) + 'database.js';
      const result = analyzer.analyzeFileCriticality(filepath);
      expect(result).toBeDefined();
      expect(result.type).toBe('critical_file');
    });

    test('should handle empty diff', () => {
      const change = {
        filepath: '/test.js',
        diff: ''
      };

      mockPrepare.mockReturnValueOnce({
        get: () => ({ avg_size: 300, count: 10 })
      });

      const result = analyzer.analyzeChangeSize(mockDb, change);
      expect(result).toBeNull();
    });

    test('should handle change without filepath', () => {
      const change = {
        change_type: 'change'
      };

      mockPrepare.mockReturnValue({ all: () => [], get: () => null });

      const result = analyzer.analyzeRisk(change, 'test-project');
      expect(result).toBeDefined();
    });

    test('should handle null projectName in getOverallRollbackRate', () => {
      mockPrepare.mockReturnValueOnce({
        get: () => ({ rate: 0.1 })
      });

      const rate = analyzer.getOverallRollbackRate(mockDb, null);
      expect(rate).toBe(0.1);
    });
  });
});
