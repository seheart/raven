/**
 * Tests for ClaudeLogWatcher
 */

import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import { tmpdir } from 'os';
import { homedir } from 'os';

// Mock chokidar before importing ClaudeLogWatcher
const mockWatch = jest.fn();
jest.unstable_mockModule('chokidar', () => ({
  default: {
    watch: mockWatch
  }
}));

// Now import ClaudeLogWatcher after mocking
const { ClaudeLogWatcher } = await import('../../dist/services/claude-log-watcher.js');

describe('ClaudeLogWatcher', () => {
  let watcher;
  let mockCallback;
  let mockLogger;
  let mockWatcherInstance;
  let testDir;

  beforeEach(() => {
    // Setup test directory
    testDir = path.join(tmpdir(), `claude-watcher-test-${Date.now()}`);
    fs.mkdirSync(testDir, { recursive: true });

    // Mock callback
    mockCallback = jest.fn();

    // Mock logger
    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn()
    };

    // Mock chokidar watcher instance
    mockWatcherInstance = {
      on: jest.fn((event, handler) => {
        // Store handlers for later use
        mockWatcherInstance.handlers = mockWatcherInstance.handlers || {};
        mockWatcherInstance.handlers[event] = handler;
        return mockWatcherInstance;
      }),
      close: jest.fn().mockResolvedValue(undefined),
      getWatched: jest.fn().mockReturnValue({})
    };

    mockWatch.mockReturnValue(mockWatcherInstance);
  });

  afterEach(async () => {
    if (watcher) {
      await watcher.stop();
    }

    // Clean up test directory
    try {
      fs.rmSync(testDir, { recursive: true, force: true });
    } catch (_error) {
      // Ignore cleanup errors
    }

    jest.clearAllMocks();
  });

  describe('Constructor', () => {
    test('should initialize with correct properties', () => {
      watcher = new ClaudeLogWatcher(mockCallback, mockLogger);

      expect(watcher.eventCallback).toBe(mockCallback);
      expect(watcher.logger).toBe(mockLogger);
      expect(watcher.claudeProjectsDir).toBe(path.join(homedir(), '.claude', 'projects'));
      expect(watcher.logWatcher).toBeNull();
      expect(watcher.filePositions).toBeInstanceOf(Map);
      expect(watcher.activeProjects).toBeInstanceOf(Map);
    });

    test('should initialize empty maps', () => {
      watcher = new ClaudeLogWatcher(mockCallback, mockLogger);

      expect(watcher.filePositions.size).toBe(0);
      expect(watcher.activeProjects.size).toBe(0);
    });
  });

  describe('start()', () => {
    test('should start watching Claude projects directory', async () => {
      watcher = new ClaudeLogWatcher(mockCallback, mockLogger);

      await watcher.start();

      expect(mockWatch).toHaveBeenCalledWith(
        watcher.claudeProjectsDir,
        expect.objectContaining({
          persistent: true,
          usePolling: true,
          interval: 100
        })
      );
    });

    test('should create Claude projects directory if it does not exist', async () => {
      watcher = new ClaudeLogWatcher(mockCallback, mockLogger);
      // Override claudeProjectsDir to use test directory
      watcher.claudeProjectsDir = path.join(testDir, 'nonexistent');

      await watcher.start();

      expect(fs.existsSync(watcher.claudeProjectsDir)).toBe(true);
      expect(mockLogger.warn).toHaveBeenCalled();
    });

    test('should setup event handlers for chokidar', async () => {
      watcher = new ClaudeLogWatcher(mockCallback, mockLogger);

      await watcher.start();

      expect(mockWatcherInstance.on).toHaveBeenCalledWith('add', expect.any(Function));
      expect(mockWatcherInstance.on).toHaveBeenCalledWith('change', expect.any(Function));
      expect(mockWatcherInstance.on).toHaveBeenCalledWith('error', expect.any(Function));
      expect(mockWatcherInstance.on).toHaveBeenCalledWith('ready', expect.any(Function));
    });

    test('should log starting message', async () => {
      watcher = new ClaudeLogWatcher(mockCallback, mockLogger);

      await watcher.start();

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Starting Claude Log Watcher')
      );
    });

    test('should configure ignored files correctly', async () => {
      watcher = new ClaudeLogWatcher(mockCallback, mockLogger);

      await watcher.start();

      const watchOptions = mockWatch.mock.calls[0][1];
      const ignoreFn = watchOptions.ignored;

      // Should not ignore .jsonl files
      expect(ignoreFn('test.jsonl', { isFile: () => true })).toBe(false);

      // Should ignore non-.jsonl files
      expect(ignoreFn('test.txt', { isFile: () => true })).toBe(true);

      // Should not ignore directories
      expect(ignoreFn('somedir', { isFile: () => false })).toBe(false);
    });
  });

  describe('stop()', () => {
    test('should close watcher when stopping', async () => {
      watcher = new ClaudeLogWatcher(mockCallback, mockLogger);
      await watcher.start();

      await watcher.stop();

      expect(mockWatcherInstance.close).toHaveBeenCalled();
      expect(watcher.logWatcher).toBeNull();
    });

    test('should log stop message', async () => {
      watcher = new ClaudeLogWatcher(mockCallback, mockLogger);
      await watcher.start();

      await watcher.stop();

      expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('stopped'));
    });

    test('should do nothing if watcher not started', async () => {
      watcher = new ClaudeLogWatcher(mockCallback, mockLogger);

      await watcher.stop();

      expect(mockWatcherInstance.close).not.toHaveBeenCalled();
    });
  });

  describe('handleLogFileAdded()', () => {
    test('should initialize file position for new file', async () => {
      watcher = new ClaudeLogWatcher(mockCallback, mockLogger);

      const testFile = path.join(testDir, 'test.jsonl');
      fs.writeFileSync(testFile, 'test content');

      await watcher.handleLogFileAdded(testFile);

      expect(watcher.filePositions.has(testFile)).toBe(true);
      expect(watcher.filePositions.get(testFile)).toBeGreaterThan(0);
    });

    test('should extract and store project info', async () => {
      watcher = new ClaudeLogWatcher(mockCallback, mockLogger);
      watcher.claudeProjectsDir = testDir;

      // Create mock Claude project structure
      const projectDir = path.join(testDir, '-home-user-myproject');
      fs.mkdirSync(projectDir, { recursive: true });
      const logFile = path.join(projectDir, 'session-123.jsonl');
      fs.writeFileSync(logFile, '');

      await watcher.handleLogFileAdded(logFile);

      expect(watcher.activeProjects.size).toBeGreaterThan(0);
    });

    test('should log session info', async () => {
      watcher = new ClaudeLogWatcher(mockCallback, mockLogger);

      const testFile = path.join(testDir, 'test.jsonl');
      fs.writeFileSync(testFile, '');

      await watcher.handleLogFileAdded(testFile);

      expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('Claude session log'));
    });

    test('should handle file with no project info gracefully', async () => {
      watcher = new ClaudeLogWatcher(mockCallback, mockLogger);
      watcher.claudeProjectsDir = testDir;

      // Create file directly in watched directory (no project subdirectory)
      const logFile = path.join(testDir, 'orphan-session.jsonl');
      fs.writeFileSync(logFile, '');

      await watcher.handleLogFileAdded(logFile);

      // Should still add file position, but no project info
      expect(watcher.filePositions.has(logFile)).toBe(true);
      expect(watcher.activeProjects.size).toBe(0);
    });
  });

  describe('handleLogFileChanged()', () => {
    test('should process new content in changed file', async () => {
      watcher = new ClaudeLogWatcher(mockCallback, mockLogger);

      const testFile = path.join(testDir, 'test.jsonl');
      fs.writeFileSync(testFile, '');
      watcher.filePositions.set(testFile, 0);

      // Add new content
      const logEntry = JSON.stringify({
        type: 'assistant',
        message: {
          content: [
            {
              type: 'tool_use',
              name: 'Write',
              input: { file_path: '/test/file.js' }
            }
          ]
        }
      });
      fs.writeFileSync(testFile, logEntry + '\n');

      await watcher.handleLogFileChanged(testFile);

      expect(watcher.filePositions.get(testFile)).toBeGreaterThan(0);
    });

    test('should handle file shrinking (recreation)', async () => {
      watcher = new ClaudeLogWatcher(mockCallback, mockLogger);

      const testFile = path.join(testDir, 'test.jsonl');
      fs.writeFileSync(testFile, 'original content that is long');
      watcher.filePositions.set(testFile, 100); // Larger than actual

      await watcher.handleLogFileChanged(testFile);

      expect(watcher.filePositions.get(testFile)).toBe(0);
    });

    test('should skip if no new data', async () => {
      watcher = new ClaudeLogWatcher(mockCallback, mockLogger);

      const testFile = path.join(testDir, 'test.jsonl');
      const content = 'test content';
      fs.writeFileSync(testFile, content);
      watcher.filePositions.set(testFile, content.length);

      await watcher.handleLogFileChanged(testFile);

      expect(mockCallback).not.toHaveBeenCalled();
    });

    test('should handle malformed JSON gracefully', async () => {
      watcher = new ClaudeLogWatcher(mockCallback, mockLogger);

      const testFile = path.join(testDir, 'test.jsonl');
      fs.writeFileSync(testFile, '');
      watcher.filePositions.set(testFile, 0);

      // Add malformed JSON — parser will break on it, no callback emitted
      fs.writeFileSync(testFile, '{invalid json that is malformed}\n');

      await watcher.handleLogFileChanged(testFile);

      // Should not throw, just silently skip the malformed line
      expect(mockCallback).not.toHaveBeenCalled();
    });

    test('should handle file read errors', async () => {
      watcher = new ClaudeLogWatcher(mockCallback, mockLogger);

      const nonexistentFile = path.join(testDir, 'nonexistent.jsonl');
      watcher.filePositions.set(nonexistentFile, 0);

      await watcher.handleLogFileChanged(nonexistentFile);

      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('processLogEntry()', () => {
    beforeEach(() => {
      watcher = new ClaudeLogWatcher(mockCallback, mockLogger);
      watcher.claudeProjectsDir = testDir;
    });

    test('should process Write tool operation', async () => {
      const projectDir = path.join(testDir, '-home-user-project');
      fs.mkdirSync(projectDir, { recursive: true });
      const logFile = path.join(projectDir, 'session-123.jsonl');

      const entry = {
        type: 'assistant',
        message: {
          content: [
            {
              type: 'tool_use',
              name: 'Write',
              input: { file_path: '/test/newfile.js' }
            }
          ]
        },
        timestamp: '2025-01-01T00:00:00Z'
      };

      await watcher.processLogEntry(entry, logFile);

      expect(mockCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'add',
          path: '/test/newfile.js',
          tool: 'Write',
          source: 'claude-code'
        })
      );
    });

    test('should process Edit tool operation', async () => {
      const projectDir = path.join(testDir, '-home-user-project');
      fs.mkdirSync(projectDir, { recursive: true });
      const logFile = path.join(projectDir, 'session-123.jsonl');

      const entry = {
        type: 'assistant',
        message: {
          content: [
            {
              type: 'tool_use',
              name: 'Edit',
              input: { file_path: '/test/existing.js' }
            }
          ]
        }
      };

      await watcher.processLogEntry(entry, logFile);

      expect(mockCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'change',
          path: '/test/existing.js',
          tool: 'Edit'
        })
      );
    });

    test('should not emit file_change for Read tool operations', async () => {
      const projectDir = path.join(testDir, '-home-user-project');
      fs.mkdirSync(projectDir, { recursive: true });
      const logFile = path.join(projectDir, 'session-123.jsonl');

      const entry = {
        type: 'assistant',
        message: {
          content: [
            {
              type: 'tool_use',
              name: 'Read',
              input: { file_path: '/test/file.js' }
            }
          ]
        }
      };

      await watcher.processLogEntry(entry, logFile);

      // Read emits an agent_event but not a file_change
      const fileChangeCalls = mockCallback.mock.calls.filter(
        call => call[0].eventCategory === 'file_change'
      );
      expect(fileChangeCalls).toHaveLength(0);
      expect(mockCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'tool_call',
          tool: 'Read',
          eventCategory: 'agent_event'
        })
      );
    });

    test('should not emit file_change for Bash tool operations', async () => {
      const projectDir = path.join(testDir, '-home-user-project');
      fs.mkdirSync(projectDir, { recursive: true });
      const logFile = path.join(projectDir, 'session-123.jsonl');

      const entry = {
        type: 'assistant',
        message: {
          content: [
            {
              type: 'tool_use',
              name: 'Bash',
              input: { command: 'ls -la' }
            }
          ]
        }
      };

      await watcher.processLogEntry(entry, logFile);

      // Bash emits an agent_event but not a file_change
      const fileChangeCalls = mockCallback.mock.calls.filter(
        call => call[0].eventCategory === 'file_change'
      );
      expect(fileChangeCalls).toHaveLength(0);
      expect(mockCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'tool_call',
          tool: 'Bash',
          eventCategory: 'agent_event'
        })
      );
    });

    test('should ignore non-assistant messages', async () => {
      const logFile = path.join(testDir, 'session.jsonl');

      const entry = {
        type: 'user',
        message: { content: [] }
      };

      await watcher.processLogEntry(entry, logFile);

      expect(mockCallback).not.toHaveBeenCalled();
    });

    test('should ignore messages without content', async () => {
      const logFile = path.join(testDir, 'session.jsonl');

      const entry = {
        type: 'assistant',
        message: {}
      };

      await watcher.processLogEntry(entry, logFile);

      expect(mockCallback).not.toHaveBeenCalled();
    });

    test('should process multiple tool uses in one entry', async () => {
      const projectDir = path.join(testDir, '-home-user-project');
      fs.mkdirSync(projectDir, { recursive: true });
      const logFile = path.join(projectDir, 'session-123.jsonl');

      const entry = {
        type: 'assistant',
        message: {
          content: [
            {
              type: 'tool_use',
              name: 'Write',
              input: { file_path: '/test/file1.js' }
            },
            {
              type: 'tool_use',
              name: 'Edit',
              input: { file_path: '/test/file2.js' }
            }
          ]
        }
      };

      await watcher.processLogEntry(entry, logFile);

      // Each tool emits a file_change + an agent_event = 4 calls total
      expect(mockCallback).toHaveBeenCalledTimes(4);
      const fileChangeCalls = mockCallback.mock.calls.filter(
        call => call[0].eventCategory === 'file_change'
      );
      expect(fileChangeCalls).toHaveLength(2);
    });

    test('should return early when no project info can be extracted', async () => {
      // Use a log file path that won't yield valid project info
      const logFile = path.join(testDir, 'orphan-session.jsonl');

      const entry = {
        type: 'assistant',
        message: {
          content: [
            {
              type: 'tool_use',
              name: 'Write',
              input: { file_path: '/test/file.js' }
            }
          ]
        }
      };

      await watcher.processLogEntry(entry, logFile);

      // Should not call callback because projectInfo is null
      expect(mockCallback).not.toHaveBeenCalled();
    });
  });

  describe('extractProjectFromPath()', () => {
    beforeEach(() => {
      watcher = new ClaudeLogWatcher(mockCallback, mockLogger);
      watcher.claudeProjectsDir = testDir;
    });

    test('should extract project info from valid path', () => {
      const logFile = path.join(testDir, '-home-user-myproject', 'session-abc123.jsonl');

      const result = watcher.extractProjectFromPath(logFile);

      expect(result).toBeDefined();
      expect(result.projectPath).toBe('/home/user/myproject');
      expect(result.projectName).toBe('myproject');
      expect(result.sessionId).toBe('session-abc123');
    });

    test('should handle Windows-style paths', () => {
      const logFile = path.join(testDir, '-C-Users-user-project', 'session-xyz.jsonl');

      const result = watcher.extractProjectFromPath(logFile);

      expect(result).toBeDefined();
      expect(result.projectPath).toContain('C/Users/user/project');
      expect(result.sessionId).toBe('session-xyz');
    });

    test('should return null for invalid path', () => {
      const logFile = path.join(testDir, 'invalid.jsonl');

      const result = watcher.extractProjectFromPath(logFile);

      expect(result).toBeNull();
    });

    test('should extract basename as project name', () => {
      const logFile = path.join(testDir, '-home-user-very-long-path', 'session.jsonl');

      const result = watcher.extractProjectFromPath(logFile);

      expect(result.projectName).toBe('path'); // basename of /home/user/very/long/path
    });
  });

  describe('getWatchStats()', () => {
    beforeEach(() => {
      watcher = new ClaudeLogWatcher(mockCallback, mockLogger);
      watcher.claudeProjectsDir = testDir;
    });

    test('should return count of .jsonl files', async () => {
      // Create test structure
      const projectDir = path.join(testDir, 'project1');
      fs.mkdirSync(projectDir, { recursive: true });
      fs.writeFileSync(path.join(projectDir, 'session1.jsonl'), '');
      fs.writeFileSync(path.join(projectDir, 'session2.jsonl'), '');
      fs.writeFileSync(path.join(projectDir, 'other.txt'), '');

      const stats = await watcher.getWatchStats();

      expect(stats.fileCount).toBe(2);
      expect(stats.files.length).toBe(2);
    });

    test('should return zero files for empty directory', async () => {
      const stats = await watcher.getWatchStats();

      expect(stats.fileCount).toBe(0);
      expect(stats.files).toEqual([]);
    });

    test('should walk nested directories', async () => {
      const project1 = path.join(testDir, 'project1');
      const project2 = path.join(testDir, 'project2');
      fs.mkdirSync(project1, { recursive: true });
      fs.mkdirSync(project2, { recursive: true });
      fs.writeFileSync(path.join(project1, 'session.jsonl'), '');
      fs.writeFileSync(path.join(project2, 'session.jsonl'), '');

      const stats = await watcher.getWatchStats();

      expect(stats.fileCount).toBe(2);
    });

    test('should handle errors gracefully', async () => {
      watcher.claudeProjectsDir = '/nonexistent/invalid/path/that/does/not/exist';

      const stats = await watcher.getWatchStats();

      expect(stats.fileCount).toBe(0);
      // Error is logged only if directory exists but walk fails
      // For nonexistent directory, walk is never called, so no error logged
    });
  });

  describe('getActiveProjects()', () => {
    beforeEach(() => {
      watcher = new ClaudeLogWatcher(mockCallback, mockLogger);
    });

    test('should return empty array when no projects', () => {
      const projects = watcher.getActiveProjects();

      expect(projects).toEqual([]);
    });

    test('should return list of active projects', () => {
      watcher.activeProjects.set('/home/user/project1', 'session-123');
      watcher.activeProjects.set('/home/user/project2', 'session-456');

      const projects = watcher.getActiveProjects();

      expect(projects.length).toBe(2);
      expect(projects[0]).toHaveProperty('projectPath');
      expect(projects[0]).toHaveProperty('projectName');
      expect(projects[0]).toHaveProperty('sessionId');
    });

    test('should extract project names correctly', () => {
      watcher.activeProjects.set('/home/user/myproject', 'session-abc');

      const projects = watcher.getActiveProjects();

      expect(projects[0].projectName).toBe('myproject');
      expect(projects[0].sessionId).toBe('session-abc');
    });
  });

  describe('Event Handlers', () => {
    test('should trigger add handler when file added', async () => {
      watcher = new ClaudeLogWatcher(mockCallback, mockLogger);
      await watcher.start();

      const addHandler = mockWatcherInstance.handlers.add;
      expect(addHandler).toBeDefined();

      const testFile = path.join(testDir, 'test.jsonl');
      fs.writeFileSync(testFile, '');

      addHandler(testFile);

      expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('New log file'));
    });

    test('should trigger change handler when file changes', async () => {
      watcher = new ClaudeLogWatcher(mockCallback, mockLogger);
      await watcher.start();

      const changeHandler = mockWatcherInstance.handlers.change;
      expect(changeHandler).toBeDefined();

      const testFile = path.join(testDir, 'test.jsonl');
      fs.writeFileSync(testFile, 'content');
      watcher.filePositions.set(testFile, 0);

      changeHandler(testFile);

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Log file change detected')
      );
    });

    test('should trigger error handler on watcher error', async () => {
      watcher = new ClaudeLogWatcher(mockCallback, mockLogger);
      await watcher.start();

      const errorHandler = mockWatcherInstance.handlers.error;
      expect(errorHandler).toBeDefined();

      const testError = new Error('Test watcher error');
      errorHandler(testError);

      expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining('Watcher error'));
    });

    test('should trigger ready handler when watcher ready', async () => {
      watcher = new ClaudeLogWatcher(mockCallback, mockLogger);

      mockWatcherInstance.getWatched.mockReturnValue({
        '/test/dir': ['file1.jsonl', 'file2.jsonl']
      });

      await watcher.start();

      const readyHandler = mockWatcherInstance.handlers.ready;
      expect(readyHandler).toBeDefined();

      readyHandler();

      expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('ready'));
    });

    test('should log watched files after ready event with delay', async () => {
      // Use fake timers
      jest.useFakeTimers();

      watcher = new ClaudeLogWatcher(mockCallback, mockLogger);

      mockWatcherInstance.getWatched.mockReturnValue({
        '/test/dir': ['file1.jsonl', 'file2.jsonl', 'file3.jsonl']
      });

      await watcher.start();

      const readyHandler = mockWatcherInstance.handlers.ready;
      readyHandler();

      // Fast-forward time
      jest.advanceTimersByTime(2100);

      // Should log file count and sample
      expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('Actually watching'));
      expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('Sample:'));

      jest.useRealTimers();
    });

    test('should warn when no files discovered after ready', async () => {
      // Use fake timers
      jest.useFakeTimers();

      watcher = new ClaudeLogWatcher(mockCallback, mockLogger);

      // Return empty watched files
      mockWatcherInstance.getWatched.mockReturnValue({});

      await watcher.start();

      const readyHandler = mockWatcherInstance.handlers.ready;
      readyHandler();

      // Fast-forward time
      jest.advanceTimersByTime(2100);

      // Should warn about no files
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('No .jsonl files discovered')
      );

      jest.useRealTimers();
    });
  });

  describe('Error Handling', () => {
    test('should handle getWatchStats errors during directory walk', async () => {
      watcher = new ClaudeLogWatcher(mockCallback, mockLogger);

      // Create directory that will cause error during walk
      const badDir = path.join(testDir, 'test-project');
      fs.mkdirSync(badDir, { recursive: true });
      watcher.claudeProjectsDir = badDir;

      // Mock readdirSync to throw an error
      const originalReaddirSync = fs.readdirSync;
      fs.readdirSync = () => {
        throw new Error('Permission denied');
      };

      const stats = await watcher.getWatchStats();

      expect(stats.fileCount).toBe(0);
      expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining('Error walking'));

      // Restore original
      fs.readdirSync = originalReaddirSync;
    });

    test('should emit agent_event for unknown tool operations but not file_change', async () => {
      watcher = new ClaudeLogWatcher(mockCallback, mockLogger);
      watcher.claudeProjectsDir = testDir;

      const projectDir = path.join(testDir, '-home-user-project');
      fs.mkdirSync(projectDir, { recursive: true });
      const logFile = path.join(projectDir, 'session-123.jsonl');

      const entry = {
        type: 'assistant',
        message: {
          content: [
            {
              type: 'tool_use',
              name: 'UnknownTool',
              input: { some: 'data' }
            }
          ]
        }
      };

      await watcher.processLogEntry(entry, logFile);

      // Unknown tools still emit an agent_event (tool_call) but not a file_change
      expect(mockCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'tool_call',
          tool: 'UnknownTool',
          eventCategory: 'agent_event'
        })
      );
      // Should NOT have been called with file_change category
      const fileChangeCalls = mockCallback.mock.calls.filter(
        call => call[0].eventCategory === 'file_change'
      );
      expect(fileChangeCalls).toHaveLength(0);
    });
  });
});
