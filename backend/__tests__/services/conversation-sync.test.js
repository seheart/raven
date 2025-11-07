/**
 * Tests for Conversation Sync Service
 */

import { jest } from '@jest/globals';

// Create mock functions before jest.mock
const mockExistsSync = jest.fn();
const mockReadFileSync = jest.fn();
const mockReaddirSync = jest.fn();
const mockStatSync = jest.fn();
const mockWatch = jest.fn();
const mockHomedir = jest.fn(() => '/home/testuser');
const mockJoin = jest.fn((...args) => args.join('/'));
const mockBasename = jest.fn(path => path.split('/').pop());

// Mock modules with explicit mock implementations
jest.mock('fs', () => ({
  existsSync: mockExistsSync,
  readFileSync: mockReadFileSync,
  readdirSync: mockReaddirSync,
  statSync: mockStatSync,
  watch: mockWatch
}));

jest.mock('path', () => ({
  join: mockJoin,
  basename: mockBasename
}));

jest.mock('os', () => ({
  homedir: mockHomedir
}));

jest.mock('../../utils/logger.js', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  }
}));

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ConversationSync } from '../../services/conversation-sync.js';

describe('ConversationSync', () => {
  let sync;
  let mockDb;
  let mockIo;
  const sessionId = 'test-session-123';
  const projectPath = '/test/project';
  const projectName = 'project';

  beforeEach(() => {
    mockDb = {
      insertConversation: jest.fn()
    };

    mockIo = {
      emit: jest.fn()
    };

    // Reset all mock implementations
    mockExistsSync.mockReset();
    mockReadFileSync.mockReset();
    mockReaddirSync.mockReset();
    mockStatSync.mockReset();
    mockWatch.mockReset();
    mockHomedir.mockReturnValue('/home/testuser');

    sync = new ConversationSync(mockDb, sessionId, mockIo, projectPath);

    // Clear all mocks after service creation
    jest.clearAllMocks();
  });

  describe('Constructor', () => {
    test('should initialize with required dependencies', () => {
      expect(sync.db).toBe(mockDb);
      expect(sync.sessionId).toBe(sessionId);
      expect(sync.io).toBe(mockIo);
      expect(sync.projectPath).toBe(projectPath);
      expect(sync.projectName).toBe('project');
    });

    test('should initialize state properties', () => {
      expect(sync.watcher).toBeNull();
      expect(sync.processedLines).toBeInstanceOf(Map);
      expect(sync.isRunning).toBe(false);
      expect(sync.lastSyncTime).toBeNull();
      expect(sync.syncedCount).toBe(0);
    });

    test('should set claudeProjectDir based on project path', () => {
      expect(sync.claudeProjectDir).toBe('/home/testuser/.claude/projects/-test-project');
    });

    test('should handle project path with slashes correctly', () => {
      const deepPathSync = new ConversationSync(mockDb, sessionId, mockIo, '/a/b/c/project');
      expect(deepPathSync.claudeProjectDir).toBe('/home/testuser/.claude/projects/-a-b-c-project');
    });
  });

  describe('getStatus()', () => {
    test('should return sync status', () => {
      mockExistsSync.mockReturnValue(true);

      const status = sync.getStatus();

      expect(status).toMatchObject({
        running: false,
        projectName: 'project',
        claudeProjectDir: sync.claudeProjectDir,
        exists: true,
        lastSyncTime: null,
        syncedCount: 0
      });
    });

    test('should reflect running state', () => {
      sync.isRunning = true;
      sync.lastSyncTime = new Date('2025-01-01T12:00:00Z');
      sync.syncedCount = 5;
      mockExistsSync.mockReturnValue(true);

      const status = sync.getStatus();

      expect(status.running).toBe(true);
      expect(status.lastSyncTime).toEqual(new Date('2025-01-01T12:00:00Z'));
      expect(status.syncedCount).toBe(5);
    });

    test('should check directory existence', () => {
      mockExistsSync.mockReturnValue(false);

      const status = sync.getStatus();

      expect(status.exists).toBe(false);
      expect(mockExistsSync).toHaveBeenCalledWith(sync.claudeProjectDir);
    });
  });

  describe('stop()', () => {
    test('should close watcher and update state', () => {
      const mockWatcher = { close: jest.fn() };
      sync.watcher = mockWatcher;
      sync.isRunning = true;

      sync.stop();

      expect(mockWatcher.close).toHaveBeenCalled();
      expect(sync.watcher).toBeNull();
      expect(sync.isRunning).toBe(false);
    });

    test('should handle no watcher gracefully', () => {
      sync.watcher = null;

      expect(() => sync.stop()).not.toThrow();
      expect(sync.isRunning).toBe(false);
    });
  });

  describe('start()', () => {
    beforeEach(() => {
      mockExistsSync.mockReturnValue(true);
    });

    test('should not start if already running', async () => {
      sync.isRunning = true;

      await sync.start();

      expect(mockWatch).not.toHaveBeenCalled();
    });

    test('should warn if Claude project directory does not exist', async () => {
      mockExistsSync.mockReturnValue(false);

      await sync.start();

      expect(mockWatch).not.toHaveBeenCalled();
      expect(sync.isRunning).toBe(false);
    });

    test('should process existing files and start watching', async () => {
      const mockWatcher = { close: jest.fn() };
      mockWatch.mockReturnValue(mockWatcher);

      jest.spyOn(sync, 'processExistingFiles').mockResolvedValue();

      await sync.start();

      expect(sync.processExistingFiles).toHaveBeenCalled();
      expect(mockWatch).toHaveBeenCalledWith(
        sync.claudeProjectDir,
        { recursive: false },
        expect.any(Function)
      );
      expect(sync.isRunning).toBe(true);
      expect(sync.watcher).toBe(mockWatcher);
      expect(sync.lastSyncTime).toBeInstanceOf(Date);
    });

    test('should handle file change events from watcher', async () => {
      let changeCallback;
      mockWatch.mockImplementation((dir, options, callback) => {
        changeCallback = callback;
        return { close: jest.fn() };
      });

      jest.spyOn(sync, 'processExistingFiles').mockResolvedValue();
      jest.spyOn(sync, 'handleFileChange').mockImplementation(() => {});

      await sync.start();

      // Trigger file change
      changeCallback('change', 'session-123.jsonl');

      expect(sync.handleFileChange).toHaveBeenCalledWith(
        expect.stringContaining('session-123.jsonl')
      );
    });

    test('should ignore non-jsonl files in watcher', async () => {
      let changeCallback;
      mockWatch.mockImplementation((dir, options, callback) => {
        changeCallback = callback;
        return { close: jest.fn() };
      });

      jest.spyOn(sync, 'processExistingFiles').mockResolvedValue();
      jest.spyOn(sync, 'handleFileChange').mockImplementation(() => {});

      await sync.start();

      changeCallback('change', 'other-file.txt');

      expect(sync.handleFileChange).not.toHaveBeenCalled();
    });

    test('should handle start errors gracefully', async () => {
      jest.spyOn(sync, 'processExistingFiles').mockRejectedValue(new Error('Process error'));

      await expect(sync.start()).resolves.not.toThrow();
    });
  });

  describe('processExistingFiles()', () => {
    test('should process most recent session file', async () => {
      mockReaddirSync.mockReturnValue(['session-old.jsonl', 'session-recent.jsonl']);
      mockStatSync.mockReturnValueOnce({ mtime: new Date('2025-01-01') });
      mockStatSync.mockReturnValueOnce({ mtime: new Date('2025-01-10') });

      jest.spyOn(sync, 'processFile').mockResolvedValue();

      await sync.processExistingFiles();

      // Should process the most recent file
      expect(sync.processFile).toHaveBeenCalledWith(
        expect.stringContaining('session-recent.jsonl'),
        true
      );
    });

    test('should skip files older than 7 days', async () => {
      const oldDate = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000); // 8 days ago

      mockReaddirSync.mockReturnValue(['session-old.jsonl']);
      mockStatSync.mockReturnValue({ mtime: oldDate });

      jest.spyOn(sync, 'processFile').mockResolvedValue();

      await sync.processExistingFiles();

      expect(sync.processFile).not.toHaveBeenCalled();
    });

    test('should handle no session files', async () => {
      mockReaddirSync.mockReturnValue([]);

      jest.spyOn(sync, 'processFile').mockResolvedValue();

      await sync.processExistingFiles();

      expect(sync.processFile).not.toHaveBeenCalled();
    });

    test('should handle errors gracefully', async () => {
      mockReaddirSync.mockImplementation(() => {
        throw new Error('Import failed');
      });

      await expect(sync.processExistingFiles()).resolves.not.toThrow();
    });
  });

  describe('handleFileChange()', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    test('should debounce file processing', async () => {
      jest.spyOn(sync, 'processFile').mockResolvedValue();

      const promise = sync.handleFileChange('/path/to/file.jsonl');

      // Should not call immediately
      expect(sync.processFile).not.toHaveBeenCalled();

      // Advance timers past debounce
      jest.advanceTimersByTime(500);

      await promise;

      expect(sync.processFile).toHaveBeenCalledWith('/path/to/file.jsonl', false);
    });

    test('should handle process errors', async () => {
      jest.spyOn(sync, 'processFile').mockRejectedValue(new Error('Process failed'));

      const promise = sync.handleFileChange('/path/to/file.jsonl');
      jest.advanceTimersByTime(500);

      await expect(promise).resolves.not.toThrow();
    });
  });

  describe('processFile()', () => {
    test('should skip non-existent files', async () => {
      mockExistsSync.mockReturnValue(false);

      await sync.processFile('/path/to/nonexistent.jsonl');

      expect(mockReadFileSync).not.toHaveBeenCalled();
    });

    test('should process new conversation entries', async () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(
        '{"type":"user_message","timestamp":"2025-01-01T12:00:00Z","content":"Hello"}\n' +
          '{"type":"assistant_text","timestamp":"2025-01-01T12:00:01Z","content":"Hi there"}'
      );

      await sync.processFile('/path/to/session-123.jsonl', false);

      expect(mockDb.insertConversation).toHaveBeenCalledTimes(2);
      expect(mockDb.insertConversation).toHaveBeenCalledWith(
        '2025-01-01T12:00:00Z',
        'session-123',
        'user_message',
        'Hello',
        null,
        null,
        null,
        false,
        null,
        null,
        projectName,
        sessionId
      );
    });

    test('should support new format types (user, assistant)', async () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(
        '{"type":"user","timestamp":"2025-01-01T12:00:00Z","content":"Question"}\n' +
          '{"type":"assistant","timestamp":"2025-01-01T12:00:01Z","content":"Answer"}'
      );

      await sync.processFile('/path/to/session-123.jsonl', false);

      expect(mockDb.insertConversation).toHaveBeenCalledTimes(2);
    });

    test('should process tool calls', async () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(
        '{"type":"tool_call","timestamp":"2025-01-01T12:00:00Z","tool":{"name":"Read","input":{"file":"test.js"}}}'
      );

      await sync.processFile('/path/to/session-123.jsonl', false);

      expect(mockDb.insertConversation).toHaveBeenCalledWith(
        '2025-01-01T12:00:00Z',
        'session-123',
        'tool_call',
        null,
        'Read',
        '{"file":"test.js"}',
        null,
        false,
        null,
        null,
        projectName,
        sessionId
      );
    });

    test('should process tool results', async () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(
        '{"type":"tool_result","timestamp":"2025-01-01T12:00:00Z","output":"Success"}'
      );

      await sync.processFile('/path/to/session-123.jsonl', false);

      expect(mockDb.insertConversation).toHaveBeenCalledWith(
        '2025-01-01T12:00:00Z',
        'session-123',
        'tool_result',
        null,
        null,
        null,
        'Success',
        false,
        null,
        null,
        projectName,
        sessionId
      );
    });

    test('should skip non-conversation entries', async () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(
        '{"type":"system_config","setting":"value"}\n' +
          '{"type":"user_message","content":"Real message"}'
      );

      await sync.processFile('/path/to/session-123.jsonl', false);

      // Should only process the user_message
      expect(mockDb.insertConversation).toHaveBeenCalledTimes(1);
    });

    test('should skip malformed JSON lines', async () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue('not json\n' + '{"type":"user_message","content":"Valid"}');

      await sync.processFile('/path/to/session-123.jsonl', false);

      expect(mockDb.insertConversation).toHaveBeenCalledTimes(1);
    });

    test('should track processed lines to avoid duplicates', async () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue('{"type":"user_message","content":"Message 1"}');

      await sync.processFile('/path/to/session-123.jsonl', false);
      expect(mockDb.insertConversation).toHaveBeenCalledTimes(1);

      // Process again with same content
      mockDb.insertConversation.mockClear();
      await sync.processFile('/path/to/session-123.jsonl', false);
      expect(mockDb.insertConversation).not.toHaveBeenCalled();

      // Process with new line added
      mockReadFileSync.mockReturnValue(
        '{"type":"user_message","content":"Message 1"}\n' +
          '{"type":"user_message","content":"Message 2"}'
      );
      await sync.processFile('/path/to/session-123.jsonl', false);
      expect(mockDb.insertConversation).toHaveBeenCalledTimes(1);
    });

    test('should emit WebSocket event when conversations imported', async () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue('{"type":"user_message","content":"Test"}');

      await sync.processFile('/path/to/session-123.jsonl', false);

      expect(mockIo.emit).toHaveBeenCalledWith('conversation', {
        imported: 1,
        sessionFile: 'session-123.jsonl',
        project: projectName
      });
    });

    test('should not emit WebSocket when nothing imported', async () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue('');

      await sync.processFile('/path/to/session-123.jsonl', false);

      expect(mockIo.emit).not.toHaveBeenCalled();
    });

    test('should update syncedCount', async () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(
        '{"type":"user_message","content":"M1"}\n' + '{"type":"assistant_text","content":"M2"}'
      );

      expect(sync.syncedCount).toBe(0);

      await sync.processFile('/path/to/session-123.jsonl', false);

      expect(sync.syncedCount).toBe(2);
    });

    test('should update lastSyncTime', async () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue('{"type":"user_message","content":"Test"}');

      expect(sync.lastSyncTime).toBeNull();

      await sync.processFile('/path/to/session-123.jsonl', false);

      expect(sync.lastSyncTime).toBeInstanceOf(Date);
    });

    test('should handle file read errors', async () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockImplementation(() => {
        throw new Error('Read error');
      });

      await expect(sync.processFile('/path/to/session-123.jsonl')).resolves.not.toThrow();
    });

    test('should work without io', async () => {
      const noIoSync = new ConversationSync(mockDb, sessionId, null, projectPath);

      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue('{"type":"user_message","content":"Test"}');

      await expect(noIoSync.processFile('/path/to/session-123.jsonl')).resolves.not.toThrow();
    });

    test('should handle default timestamp when missing', async () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue('{"type":"user_message","content":"Test"}');

      await sync.processFile('/path/to/session-123.jsonl', false);

      expect(mockDb.insertConversation).toHaveBeenCalledWith(
        expect.stringMatching(/\d{4}-\d{2}-\d{2}T/),
        expect.any(String),
        'user_message',
        'Test',
        null,
        null,
        null,
        false,
        null,
        null,
        projectName,
        sessionId
      );
    });
  });

  describe('forceSync()', () => {
    test('should clear processed lines and reprocess files', async () => {
      sync.processedLines.set('session-123.jsonl', 5);
      jest.spyOn(sync, 'processExistingFiles').mockResolvedValue();

      await sync.forceSync();

      expect(sync.processedLines.size).toBe(0);
      expect(sync.processExistingFiles).toHaveBeenCalled();
    });
  });

  describe('Integration', () => {
    test('should complete full sync workflow', async () => {
      // Setup
      mockExistsSync.mockReturnValue(true);
      const mockWatcher = { close: jest.fn() };
      mockWatch.mockReturnValue(mockWatcher);

      mockReaddirSync.mockReturnValue(['session-123.jsonl']);
      mockStatSync.mockReturnValue({ mtime: new Date() });

      mockReadFileSync.mockReturnValue(
        '{"type":"user_message","timestamp":"2025-01-01T12:00:00Z","content":"Hello"}\n' +
          '{"type":"assistant_text","timestamp":"2025-01-01T12:00:01Z","content":"Hi"}'
      );

      // Start sync
      await sync.start();

      // Verify initial state
      expect(sync.isRunning).toBe(true);
      expect(sync.syncedCount).toBeGreaterThan(0);
      expect(mockDb.insertConversation).toHaveBeenCalled();
      expect(mockIo.emit).toHaveBeenCalledWith('conversation', expect.any(Object));

      // Stop sync
      sync.stop();
      expect(sync.isRunning).toBe(false);
    });
  });

  describe('Additional Edge Cases', () => {
    test('should handle metadata field in entries', async () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(
        '{"type":"user","content":"Test","metadata":{"source":"test","priority":1}}'
      );

      await sync.processFile('/path/to/session-123.jsonl', false);

      expect(mockDb.insertConversation).toHaveBeenCalledWith(
        expect.any(String),
        'session-123',
        'user',
        'Test',
        null,
        null,
        null,
        false,
        null,
        '{"source":"test","priority":1}',
        projectName,
        sessionId
      );
    });

    test('should handle parent_uuid field', async () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(
        '{"type":"assistant","content":"Response","parent_uuid":"parent-id-123"}'
      );

      await sync.processFile('/path/to/session-123.jsonl', false);

      expect(mockDb.insertConversation).toHaveBeenCalledWith(
        expect.any(String),
        'session-123',
        'assistant',
        'Response',
        null,
        null,
        null,
        false,
        'parent-id-123',
        null,
        projectName,
        sessionId
      );
    });

    test('should handle error field in entries', async () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(
        '{"type":"tool_result","output":"Failed to execute","error":true}'
      );

      await sync.processFile('/path/to/session-123.jsonl', false);

      expect(mockDb.insertConversation).toHaveBeenCalledWith(
        expect.any(String),
        'session-123',
        'tool_result',
        null,
        null,
        null,
        'Failed to execute',
        true,
        null,
        null,
        projectName,
        sessionId
      );
    });

    test('should handle old format tool_name and input fields', async () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(
        '{"type":"tool_call","tool_name":"ReadFile","input":{"path":"test.js"}}'
      );

      await sync.processFile('/path/to/session-123.jsonl', false);

      expect(mockDb.insertConversation).toHaveBeenCalledWith(
        expect.any(String),
        'session-123',
        'tool_call',
        null,
        'ReadFile',
        '{"path":"test.js"}',
        null,
        false,
        null,
        null,
        projectName,
        sessionId
      );
    });

    test('should handle old format result field instead of output', async () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue('{"type":"tool_result","result":"File contents here"}');

      await sync.processFile('/path/to/session-123.jsonl', false);

      expect(mockDb.insertConversation).toHaveBeenCalledWith(
        expect.any(String),
        'session-123',
        'tool_result',
        null,
        null,
        null,
        'File contents here',
        false,
        null,
        null,
        projectName,
        sessionId
      );
    });

    test('should handle text field fallback for content', async () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(
        '{"type":"assistant_text","text":"Using text field instead of content"}'
      );

      await sync.processFile('/path/to/session-123.jsonl', false);

      expect(mockDb.insertConversation).toHaveBeenCalledWith(
        expect.any(String),
        'session-123',
        'assistant_text',
        'Using text field instead of content',
        null,
        null,
        null,
        false,
        null,
        null,
        projectName,
        sessionId
      );
    });

    test('should skip empty lines when processing file', async () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(
        '\n' +
          '{"type":"user","content":"Message 1"}\n' +
          '\n' +
          '   \n' +
          '{"type":"user","content":"Message 2"}\n' +
          '\n'
      );

      await sync.processFile('/path/to/session-123.jsonl', false);

      expect(mockDb.insertConversation).toHaveBeenCalledTimes(2);
    });

    test('should only process .jsonl files in directory', async () => {
      mockReaddirSync.mockReturnValue([
        'session-123.jsonl',
        'session-456.jsonl',
        'config.json',
        'readme.md',
        'backup.txt'
      ]);
      mockStatSync.mockReturnValue({ mtime: new Date() });
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue('{"type":"user","content":"test"}');

      jest.spyOn(sync, 'processFile').mockResolvedValue();

      await sync.processExistingFiles();

      // Should only call with .jsonl file
      expect(sync.processFile).toHaveBeenCalledTimes(1);
      expect(sync.processFile).toHaveBeenCalledWith(expect.stringContaining('.jsonl'), true);
    });

    test('should handle all conversation entry types', async () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(
        '{"type":"user_message","content":"A"}\n' +
          '{"type":"assistant_text","content":"B"}\n' +
          '{"type":"tool_call","content":"C"}\n' +
          '{"type":"tool_result","content":"D"}\n' +
          '{"type":"user","content":"E"}\n' +
          '{"type":"assistant","content":"F"}'
      );

      await sync.processFile('/path/to/session-123.jsonl', false);

      expect(mockDb.insertConversation).toHaveBeenCalledTimes(6);
    });

    test('should log import count with initial sync', async () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue('{"type":"user","content":"test"}');

      await sync.processFile('/path/to/session-123.jsonl', true);

      // Just verify it doesn't throw - logger is mocked
      expect(mockDb.insertConversation).toHaveBeenCalledTimes(1);
    });

    test('should handle multiple files but only process most recent', async () => {
      const now = Date.now();
      mockReaddirSync.mockReturnValue([
        'session-1.jsonl',
        'session-2.jsonl',
        'session-3.jsonl',
        'session-4.jsonl'
      ]);

      // Make session-3 the most recent
      mockStatSync
        .mockReturnValueOnce({ mtime: new Date(now - 1000000) })
        .mockReturnValueOnce({ mtime: new Date(now - 500000) })
        .mockReturnValueOnce({ mtime: new Date(now - 100) }) // Most recent
        .mockReturnValueOnce({ mtime: new Date(now - 2000000) });

      jest.spyOn(sync, 'processFile').mockResolvedValue();

      await sync.processExistingFiles();

      expect(sync.processFile).toHaveBeenCalledTimes(1);
      expect(sync.processFile).toHaveBeenCalledWith(
        expect.stringContaining('session-3.jsonl'),
        true
      );
    });

    test('should handle watcher callback with null filename', async () => {
      mockExistsSync.mockReturnValue(true);
      let changeCallback;
      mockWatch.mockImplementation((dir, options, callback) => {
        changeCallback = callback;
        return { close: jest.fn() };
      });

      jest.spyOn(sync, 'processExistingFiles').mockResolvedValue();
      jest.spyOn(sync, 'handleFileChange').mockImplementation(() => {});

      await sync.start();

      // Trigger with null filename
      changeCallback('change', null);

      expect(sync.handleFileChange).not.toHaveBeenCalled();
    });

    test('should calculate days since modified correctly', async () => {
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      mockReaddirSync.mockReturnValue(['session-recent.jsonl']);
      mockStatSync.mockReturnValue({ mtime: sevenDaysAgo });

      jest.spyOn(sync, 'processFile').mockResolvedValue();

      await sync.processExistingFiles();

      // Should process files that are exactly 7 days old
      expect(sync.processFile).toHaveBeenCalled();
    });
  });
});
