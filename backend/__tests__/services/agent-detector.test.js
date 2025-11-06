/**
 * Tests for AgentDetector Service
 */

import { describe, test, expect, beforeEach, jest } from '@jest/globals';

// Mock modules BEFORE importing the service
const mockExecSync = jest.fn();
const mockExecFileSync = jest.fn();
const mockExistsSync = jest.fn();

jest.unstable_mockModule('child_process', () => ({
  execSync: mockExecSync,
  execFileSync: mockExecFileSync
}));

jest.unstable_mockModule('fs', () => ({
  existsSync: mockExistsSync
}));

// Now import the service (after mocks are set up)
const { AgentDetector } = await import('../../services/agent-detector.js');

describe('AgentDetector', () => {
  let detector;

  beforeEach(() => {
    detector = new AgentDetector();
    detector.clearCache();
    jest.clearAllMocks();
    mockExecSync.mockReset();
    mockExecFileSync.mockReset();
    mockExistsSync.mockReset();
  });

  describe('Constructor and initialization', () => {
    test('should initialize with detection cache', () => {
      expect(detector.detectionCache).toBeInstanceOf(Map);
      expect(detector.detectionCache.size).toBe(0);
    });

    test('should load process patterns', () => {
      expect(detector.processPatterns).toBeDefined();
      expect(detector.processPatterns).toHaveProperty('ant');
      expect(detector.processPatterns).toHaveProperty('claude-code');
      expect(detector.processPatterns).toHaveProperty('cursor');
      expect(detector.processPatterns).toHaveProperty('github-copilot');
      expect(detector.processPatterns).toHaveProperty('aider');
    });

    test('should configure ant pattern correctly', () => {
      const antPattern = detector.processPatterns.ant;
      expect(antPattern.processNames).toContain('ant');
      expect(antPattern.confidence).toBe(95);
      expect(antPattern.envVars).toContain('ANT_SESSION');
      expect(antPattern.fileMarkers).toContain('.ant');
    });

    test('should configure claude-code pattern correctly', () => {
      const claudePattern = detector.processPatterns['claude-code'];
      expect(claudePattern.processNames).toContain('claude-code');
      expect(claudePattern.confidence).toBe(90);
      expect(claudePattern.envVars).toContain('CLAUDE_SESSION');
    });
  });

  describe('detectFromProcess', () => {
    test('should detect ant from process name', () => {
      const result = detector.detectFromProcess('ant-cli');
      expect(result.agent).toBe('ant');
      expect(result.confidence).toBe(95);
      expect(result.signal).toBe('process_name');
    });

    test('should detect claude-code from process name', () => {
      const result = detector.detectFromProcess('claude-code-server');
      expect(result.agent).toBe('claude-code');
      expect(result.confidence).toBe(90);
    });

    test('should detect cursor from process name', () => {
      const result = detector.detectFromProcess('cursor-server');
      expect(result.agent).toBe('cursor');
      expect(result.confidence).toBe(90);
    });

    test('should detect github-copilot from process name', () => {
      const result = detector.detectFromProcess('github-copilot-agent');
      expect(result.agent).toBe('github-copilot');
      expect(result.confidence).toBe(85);
    });

    test('should be case-insensitive', () => {
      const result = detector.detectFromProcess('CURSOR-SERVER');
      expect(result.agent).toBe('cursor');
    });

    test('should return null for unknown process', () => {
      const result = detector.detectFromProcess('unknown-process');
      expect(result).toBeNull();
    });

    test('should return null for empty process name', () => {
      const result = detector.detectFromProcess('');
      expect(result).toBeNull();
    });

    test('should return null for null process name', () => {
      const result = detector.detectFromProcess(null);
      expect(result).toBeNull();
    });

    test('should detect partial matches in process name', () => {
      const result = detector.detectFromProcess('/usr/bin/ant-cli-server');
      expect(result.agent).toBe('ant');
    });
  });

  describe('detectFromEnv', () => {
    test('should detect ant from environment variables', () => {
      const env = { ANT_SESSION: 'abc123' };
      const result = detector.detectFromEnv(env);
      expect(result.agent).toBe('ant');
      expect(result.confidence).toBe(90);
      expect(result.signal).toBe('environment_variable');
    });

    test('should detect claude-code from environment variables', () => {
      const env = { CLAUDE_SESSION: 'xyz789' };
      const result = detector.detectFromEnv(env);
      expect(result.agent).toBe('claude-code');
      expect(result.confidence).toBe(85); // pattern.confidence - 5 = 90 - 5 = 85
    });

    test('should detect cursor from environment variables', () => {
      const env = { CURSOR_SESSION: '12345' };
      const result = detector.detectFromEnv(env);
      expect(result.agent).toBe('cursor');
    });

    test('should detect github-copilot from environment variables', () => {
      const env = { GITHUB_COPILOT_TOKEN: 'token123' };
      const result = detector.detectFromEnv(env);
      expect(result.agent).toBe('github-copilot');
    });

    test('should detect aider from environment variables', () => {
      const env = { AIDER_MODEL: 'gpt-4' };
      const result = detector.detectFromEnv(env);
      expect(result.agent).toBe('aider');
      expect(result.confidence).toBe(85); // pattern.confidence - 5 = 90 - 5 = 85
    });

    test('should return null for empty environment', () => {
      const result = detector.detectFromEnv({});
      expect(result).toBeNull();
    });

    test('should return null for unrecognized environment variables', () => {
      const env = { RANDOM_VAR: 'value' };
      const result = detector.detectFromEnv(env);
      expect(result).toBeNull();
    });

    test('should handle multiple env vars and return first match', () => {
      const env = { ANT_SESSION: 'abc', CURSOR_SESSION: 'xyz' };
      const result = detector.detectFromEnv(env);
      expect(result.agent).toBe('ant');
    });
  });

  describe('detectFromFileMarkers', () => {
    test('should detect ant from file marker', () => {
      mockExistsSync.mockReturnValue(true);
      const result = detector.detectFromFileMarkers('/project');
      expect(result.agent).toBe('ant');
      expect(result.confidence).toBe(85); // pattern.confidence - 10 = 95 - 10 = 85
      expect(result.signal).toBe('file_marker');
    });

    test('should return null when project root not provided', () => {
      const result = detector.detectFromFileMarkers(null);
      expect(result).toBeNull();
    });

    test('should return null when no markers exist', () => {
      mockExistsSync.mockReturnValue(false);
      const result = detector.detectFromFileMarkers('/project');
      expect(result).toBeNull();
    });

    test('should have lower confidence than process detection', () => {
      mockExistsSync.mockReturnValue(true);
      const fileResult = detector.detectFromFileMarkers('/project');
      const processResult = detector.detectFromProcess('ant-cli');
      expect(fileResult.confidence).toBeLessThan(processResult.confidence);
    });

    test('should detect cursor from .cursorrules', () => {
      mockExistsSync.mockImplementation(path => path.includes('.cursorrules'));
      const result = detector.detectFromFileMarkers('/project');
      expect(result.agent).toBe('cursor');
    });

    test('should detect claude-code from .anthropic file', () => {
      mockExistsSync.mockImplementation(path => path.includes('.anthropic'));
      const result = detector.detectFromFileMarkers('/project');
      expect(result.agent).toBe('claude-code');
    });
  });

  describe('analyzeChangePattern', () => {
    test('should detect copilot pattern - small additions', () => {
      const change = {
        diff: '+function foo() {\n+  return bar;\n+}',
        linesAdded: 3,
        linesDeleted: 0,
        filesChanged: 1
      };
      const result = detector.analyzeChangePattern(change);
      expect(result.agent).toBe('github-copilot');
      expect(result.signal).toBe('change_pattern');
    });

    test('should detect claude-code pattern - large refactor', () => {
      // Need total > 100 AND abs(additions - deletions) < 20
      // Create 60 additions and 50 deletions (total 110, diff 10)
      const additions = Array(60).fill('+new line').join('\n');
      const deletions = Array(50).fill('-old line').join('\n');
      const change = {
        diff: additions + '\n' + deletions
      };
      const result = detector.analyzeChangePattern(change);
      expect(result.agent).toBe('claude-code');
      expect(result.confidence).toBe(65);
    });

    test('should detect ant pattern - aggressive cleanup', () => {
      // Need total > 50 AND deletions > additions * 2
      // Create 10 additions and 60 deletions (total 70, deletions = 6*additions)
      const additions = Array(10).fill('+new line').join('\n');
      const deletions = Array(60).fill('-old line').join('\n');
      const change = {
        diff: additions + '\n' + deletions
      };
      const result = detector.analyzeChangePattern(change);
      expect(result.agent).toBe('ant');
      expect(result.confidence).toBe(60);
    });

    test('should detect cursor pattern - precise edit', () => {
      const change = {
        diff: '-old\n+new',
        linesAdded: 3,
        linesDeleted: 3,
        filesChanged: 1
      };
      const result = detector.analyzeChangePattern(change);
      expect(result.agent).toBe('cursor');
    });

    test('should return null for no diff', () => {
      const change = { linesAdded: 0, linesDeleted: 0, filesChanged: 0 };
      const result = detector.analyzeChangePattern(change);
      expect(result).toBeNull();
    });

    test('should return null for patterns that do not match', () => {
      // Create a diff that doesn't match any pattern
      // 30 additions, 10 deletions (total 40, unbalanced, not > 50)
      const additions = Array(30).fill('+line').join('\n');
      const deletions = Array(10).fill('-line').join('\n');
      const change = {
        diff: additions + '\n' + deletions
      };
      const result = detector.analyzeChangePattern(change);
      expect(result).toBeNull();
    });

    test('should return null for empty diff', () => {
      const change = { diff: '' };
      const result = detector.analyzeChangePattern(change);
      expect(result).toBeNull();
    });
  });

  describe('analyzeGitInfo', () => {
    test('should detect claude from git author', () => {
      mockExecFileSync.mockReturnValue('Claude <noreply@anthropic.com>\n');
      const result = detector.analyzeGitInfo('/test.js');
      expect(result.agent).toBe('claude-code');
      expect(result.confidence).toBe(70);
      expect(result.signal).toBe('git_author');
    });

    test('should detect cursor from git author', () => {
      mockExecFileSync.mockReturnValue('Cursor <cursor@cursor.sh>\n');
      const result = detector.analyzeGitInfo('/test.js');
      expect(result.agent).toBe('cursor');
    });

    test('should detect copilot from git author', () => {
      mockExecFileSync.mockReturnValue('GitHub Copilot <copilot@github.com>\n');
      const result = detector.analyzeGitInfo('/test.js');
      expect(result.agent).toBe('github-copilot');
    });

    test('should detect ant from git author', () => {
      mockExecFileSync.mockReturnValue('ANT <ant@anthropic.com>\n');
      const result = detector.analyzeGitInfo('/test.js');
      expect(result.agent).toBe('ant');
    });

    test('should return null for non-agent git author', () => {
      mockExecFileSync.mockReturnValue('John Doe <john@example.com>\n');
      const result = detector.analyzeGitInfo('/test.js');
      expect(result).toBeNull();
    });

    test('should return null when git command fails', () => {
      mockExecFileSync.mockImplementation(() => {
        throw new Error('not a git repository');
      });
      const result = detector.analyzeGitInfo('/test.js');
      expect(result).toBeNull();
    });

    test('should be case-insensitive for author matching', () => {
      mockExecFileSync.mockReturnValue('CLAUDE <noreply@anthropic.com>\n');
      const result = detector.analyzeGitInfo('/test.js');
      expect(result.agent).toBe('claude-code');
    });
  });

  describe('aggregateSignals', () => {
    test('should return manual when no signals', () => {
      const result = detector.aggregateSignals([]);
      expect(result.agent).toBe('manual');
      expect(result.confidence).toBe(80);
      expect(result.signals).toEqual(['no_agent_detected']);
    });

    test('should aggregate single signal', () => {
      const signals = [{ agent: 'ant', confidence: 90, signal: 'process_name' }];
      const result = detector.aggregateSignals(signals);
      expect(result.agent).toBe('ant');
      expect(result.confidence).toBe(90);
    });

    test('should aggregate multiple signals for same agent', () => {
      const signals = [
        { agent: 'claude-code', confidence: 90, signal: 'process_name' },
        { agent: 'claude-code', confidence: 85, signal: 'environment_variable' }
      ];
      const result = detector.aggregateSignals(signals);
      expect(result.agent).toBe('claude-code');
      expect(result.confidence).toBe(95); // Capped at 95%
    });

    test('should choose agent with highest total score', () => {
      const signals = [
        { agent: 'ant', confidence: 80, signal: 'process_name' },
        { agent: 'cursor', confidence: 90, signal: 'environment_variable' },
        { agent: 'cursor', confidence: 85, signal: 'file_marker' }
      ];
      const result = detector.aggregateSignals(signals);
      expect(result.agent).toBe('cursor');
    });

    test('should return unknown for low confidence', () => {
      const signals = [{ agent: 'ant', confidence: 30, signal: 'change_pattern' }];
      const result = detector.aggregateSignals(signals);
      expect(result.agent).toBe('unknown');
      expect(result.confidence).toBe(50); // Low confidence returns exactly 50
    });

    test('should cap confidence at 95%', () => {
      const signals = [
        { agent: 'ant', confidence: 95, signal: 'process_name' },
        { agent: 'ant', confidence: 95, signal: 'environment_variable' },
        { agent: 'ant', confidence: 95, signal: 'file_marker' }
      ];
      const result = detector.aggregateSignals(signals);
      expect(result.confidence).toBe(95);
    });

    test('should filter signals to include only winning agent', () => {
      const signals = [
        { agent: 'ant', confidence: 80, signal: 'process_name' },
        { agent: 'cursor', confidence: 90, signal: 'environment_variable' }
      ];
      const result = detector.aggregateSignals(signals);
      expect(result.signals).toEqual(['environment_variable']);
      expect(result.signals).not.toContain('process_name');
    });
  });

  describe('detectAgent', () => {
    test('should detect agent from process name', () => {
      const change = { filepath: '/test.js', timestamp: '2025-10-28' };
      const context = { processName: 'ant-cli' };

      const result = detector.detectAgent(change, context);
      expect(result.agent).toBe('ant');
      expect(result.confidence).toBeGreaterThan(80);
    });

    test('should detect agent from environment variables', () => {
      const change = { filepath: '/test.js', timestamp: '2025-10-28' };
      const context = { env: { CURSOR_SESSION: 'abc123' } };

      const result = detector.detectAgent(change, context);
      expect(result.agent).toBe('cursor');
    });

    test('should detect agent from file markers', () => {
      mockExistsSync.mockReturnValue(true);
      const change = { filepath: '/test.js', timestamp: '2025-10-28' };
      const context = { projectRoot: '/project' };

      const result = detector.detectAgent(change, context);
      expect(result.agent).toBe('ant');
    });

    test('should detect agent from change pattern', () => {
      const change = {
        filepath: '/test.js',
        timestamp: '2025-10-28',
        diff: '+new code',
        linesAdded: 3,
        linesDeleted: 0,
        filesChanged: 1
      };

      const result = detector.detectAgent(change);
      expect(result.agent).toBe('github-copilot');
    });

    test('should use cache for repeated detections', () => {
      mockExecFileSync.mockReturnValue('Claude\n');
      const change = { filepath: '/test.js', timestamp: '2025-10-28' };

      // First call
      const result1 = detector.detectAgent(change);
      const callCount1 = mockExecFileSync.mock.calls.length;

      // Second call - should use cache
      const result2 = detector.detectAgent(change);
      const callCount2 = mockExecFileSync.mock.calls.length;

      expect(result1.agent).toBe(result2.agent);
      expect(callCount2).toBe(callCount1); // No additional calls
    });

    test('should return manual for no signals', () => {
      mockExistsSync.mockReturnValue(false);
      mockExecSync.mockImplementation(() => {
        throw new Error('Git error');
      });

      const change = { filepath: '/test.js', timestamp: '2025-10-28' };
      const result = detector.detectAgent(change);

      expect(result.agent).toBe('manual');
    });

    test('should combine multiple signals', () => {
      mockExistsSync.mockReturnValue(true);
      const change = { filepath: '/test.js', timestamp: '2025-10-28' };
      const context = {
        processName: 'cursor-server',
        env: { CURSOR_SESSION: 'abc123' },
        projectRoot: '/project'
      };

      const result = detector.detectAgent(change, context);
      expect(result.agent).toBe('cursor');
      expect(result.confidence).toBeGreaterThan(90);
    });
  });

  describe('getCurrentAgent', () => {
    test('should detect currently running ant', () => {
      mockExecFileSync.mockReturnValue('ant-cli process running\nother stuff');
      const result = detector.getCurrentAgent();
      expect(result.agent).toBe('ant');
      expect(result.active).toBe(true);
    });

    test('should detect currently running cursor', () => {
      mockExecFileSync.mockReturnValue('cursor-server is running');
      const result = detector.getCurrentAgent();
      expect(result.agent).toBe('cursor');
      expect(result.active).toBe(true);
    });

    test('should return none when no agent running', () => {
      mockExecFileSync.mockReturnValue('bash\nnode\nvscode');
      const result = detector.getCurrentAgent();
      expect(result.agent).toBe('none');
      expect(result.active).toBe(false);
    });

    test('should handle ps command failure gracefully', () => {
      mockExecFileSync.mockImplementation(() => {
        throw new Error('ps command failed');
      });
      const result = detector.getCurrentAgent();
      expect(result.agent).toBe('none');
      expect(result.active).toBe(false);
    });

    test('should be case-insensitive for process matching', () => {
      mockExecFileSync.mockReturnValue('CURSOR-SERVER running');
      const result = detector.getCurrentAgent();
      expect(result.agent).toBe('cursor');
    });
  });

  describe('clearCache', () => {
    test('should clear detection cache', () => {
      // Add something to cache
      const change = { filepath: '/test.js', timestamp: '2025-10-28' };
      const context = { processName: 'ant-cli' };
      detector.detectAgent(change, context);

      expect(detector.detectionCache.size).toBeGreaterThan(0);

      detector.clearCache();
      expect(detector.detectionCache.size).toBe(0);
    });

    test('should allow fresh detections after clear', () => {
      const change = { filepath: '/test.js', timestamp: '2025-10-28' };
      const context = { processName: 'ant-cli' };

      // First detection
      const result1 = detector.detectAgent(change, context);

      // Clear cache
      detector.clearCache();

      // Second detection should work
      const result2 = detector.detectAgent(change, context);

      expect(result1.agent).toBe(result2.agent);
    });
  });

  describe('Edge cases and error handling', () => {
    test('should handle undefined context gracefully', () => {
      const change = { filepath: '/test.js', timestamp: '2025-10-28' };
      const result = detector.detectAgent(change, undefined);

      expect(result).toBeDefined();
      expect(result.agent).toBeDefined();
    });

    test('should handle empty context gracefully', () => {
      const change = { filepath: '/test.js', timestamp: '2025-10-28' };
      const result = detector.detectAgent(change, {});

      expect(result).toBeDefined();
      expect(result.agent).toBeDefined();
    });

    test('should handle malformed change object', () => {
      const change = { someRandomField: 'value' };
      const result = detector.detectAgent(change);

      expect(result).toBeDefined();
      expect(result.agent).toBe('manual');
    });

    test('should handle null diff gracefully', () => {
      const change = { filepath: '/test.js', diff: null };
      const result = detector.detectAgent(change);

      expect(result).toBeDefined();
    });

    test('should handle very large diffs', () => {
      const largeDiff = '+new line\n'.repeat(10000);
      const change = {
        filepath: '/test.js',
        diff: largeDiff,
        linesAdded: 10000,
        linesDeleted: 0,
        filesChanged: 1
      };

      const result = detector.detectAgent(change);
      expect(result).toBeDefined();
      expect(result.agent).toBeDefined();
    });
  });
});
