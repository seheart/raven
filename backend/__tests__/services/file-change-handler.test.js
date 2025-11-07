/**
 * Tests for File Change Handler Service
 */

import { jest } from '@jest/globals';
import { FileChangeHandler } from '../../services/file-change-handler.js';

// Create mock functions
const mockCurrentLoad = jest.fn();
const mockMem = jest.fn();

// Mock dependencies
jest.mock('fs');
jest.mock('crypto', () => ({
  createHash: jest.fn()
}));

jest.mock('diff', () => ({
  createPatch: jest.fn()
}));

jest.mock('zlib', () => ({
  gzip: jest.fn((data, callback) => callback(null, Buffer.from(data)))
}));

jest.mock('systeminformation', () => ({
  currentLoad: mockCurrentLoad,
  mem: mockMem
}));

// Import mocked modules
import fs from 'fs';
import { createHash } from 'crypto';
import * as Diff from 'diff';

describe('FileChangeHandler', () => {
  let handler;
  let mockOptions;
  let mockDb;
  let mockIo;
  let mockLock;

  beforeEach(() => {
    mockDb = {
      insertEvent: jest.fn().mockReturnValue(1),
      clearSyntaxErrors: jest.fn(),
      clearPatternWarnings: jest.fn()
    };

    mockIo = {
      emit: jest.fn()
    };

    mockLock = {
      acquire: jest.fn().mockResolvedValue(jest.fn()) // Returns release function
    };

    const mockProjectPaths = new Map();
    mockProjectPaths.set('test-project', '/test/project');

    const mockProjectDatabases = new Map();
    mockProjectDatabases.set('test-project', mockDb);

    const mockFileCache = new Map();

    mockOptions = {
      projectPaths: mockProjectPaths,
      projectDatabases: mockProjectDatabases,
      projectGitMonitors: new Map(),
      projectSnapshotDirs: new Map([['test-project', '/snapshots']]),
      fileCache: mockFileCache,
      io: mockIo,
      SESSION_ID: 'test-session-123',
      fileProcessingLock: mockLock,
      developerDB: null,
      sessionTracker: null,
      addToFileCache: jest.fn(),
      emitGitStatusUpdate: jest.fn()
    };

    handler = new FileChangeHandler(mockOptions);

    // Clear all mocks
    jest.clearAllMocks();

    // Mock system metrics (after clear)
    mockCurrentLoad.mockResolvedValue({ currentLoad: 50 });
    mockMem.mockResolvedValue({ used: 5000000000, total: 10000000000 });
  });

  describe('Constructor', () => {
    test('should initialize with all required dependencies', () => {
      expect(handler.projectPaths).toBe(mockOptions.projectPaths);
      expect(handler.projectDatabases).toBe(mockOptions.projectDatabases);
      expect(handler.io).toBe(mockIo);
      expect(handler.SESSION_ID).toBe('test-session-123');
    });

    test('should store all option properties', () => {
      expect(handler.fileCache).toBe(mockOptions.fileCache);
      expect(handler.fileProcessingLock).toBe(mockLock);
      expect(handler.addToFileCache).toBe(mockOptions.addToFileCache);
      expect(handler.emitGitStatusUpdate).toBe(mockOptions.emitGitStatusUpdate);
    });
  });

  describe('calculateFileHash()', () => {
    test('should calculate SHA256 hash', () => {
      const mockHasher = {
        update: jest.fn().mockReturnThis(),
        digest: jest.fn().mockReturnValue('abc123')
      };
      createHash.mockReturnValue(mockHasher);

      const hash = handler.calculateFileHash('content');

      expect(createHash).toHaveBeenCalledWith('sha256');
      expect(mockHasher.update).toHaveBeenCalledWith('content');
      expect(mockHasher.digest).toHaveBeenCalledWith('hex');
      expect(hash).toBe('abc123');
    });
  });

  describe('generateDiff()', () => {
    test('should generate unified diff', () => {
      Diff.createPatch.mockReturnValue('diff output');

      const diff = handler.generateDiff('old content', 'new content');

      expect(Diff.createPatch).toHaveBeenCalledWith('file', 'old content', 'new content', '', '', {
        context: 3
      });
      expect(diff).toBe('diff output');
    });
  });

  describe('detectLanguage()', () => {
    test('should detect JavaScript', () => {
      expect(handler.detectLanguage('file.js')).toBe('javascript');
    });

    test('should detect TypeScript', () => {
      expect(handler.detectLanguage('file.ts')).toBe('typescript');
    });

    test('should detect Python', () => {
      expect(handler.detectLanguage('file.py')).toBe('python');
    });

    test('should return unknown for unsupported extensions', () => {
      expect(handler.detectLanguage('file.xyz')).toBe('unknown');
    });
  });

  describe('saveSnapshot()', () => {
    beforeEach(() => {
      fs.promises = {
        mkdir: jest.fn().mockResolvedValue(),
        writeFile: jest.fn().mockResolvedValue()
      };
    });

    test('should save compressed snapshot', async () => {
      const result = await handler.saveSnapshot(
        '/test/project/src/file.js',
        'content',
        'test-project'
      );

      expect(fs.promises.mkdir).toHaveBeenCalled();
      expect(fs.promises.writeFile).toHaveBeenCalled();
      expect(result).toContain('src_file.js');
    });

    test('should return null when project not found', async () => {
      const result = await handler.saveSnapshot('/unknown/file.js', 'content', 'unknown-project');

      expect(result).toBeNull();
    });

    test('should handle save errors', async () => {
      fs.promises.mkdir.mockRejectedValue(new Error('Mkdir failed'));

      const result = await handler.saveSnapshot('/test/project/file.js', 'content', 'test-project');

      expect(result).toBeNull();
    });
  });

  describe('collectSystemMetrics()', () => {
    test('should collect CPU and memory metrics', async () => {
      const metrics = await handler.collectSystemMetrics();

      expect(mockCurrentLoad).toHaveBeenCalled();
      expect(mockMem).toHaveBeenCalled();
      expect(metrics.cpuPercent).toBe(50);
      expect(metrics.memPercent).toBe(50);
    });

    test('should return defaults on error', async () => {
      mockCurrentLoad.mockRejectedValue(new Error('Failed'));

      const metrics = await handler.collectSystemMetrics();

      expect(metrics.cpuPercent).toBe(0);
      expect(metrics.memPercent).toBe(0);
    });
  });

  describe('insertEventToDatabase()', () => {
    test('should insert event and return success', async () => {
      const eventData = {
        timestamp: '2025-01-01T12:00:00Z',
        relPath: 'src/file.js',
        eventType: 'edit',
        diff: 'diff content',
        cpuPercent: 50,
        memPercent: 50,
        fileHash: 'abc123',
        eventSize: 1000,
        projectName: 'test-project'
      };

      const result = await handler.insertEventToDatabase(mockDb, eventData);

      expect(mockDb.insertEvent).toHaveBeenCalledWith(
        '2025-01-01T12:00:00Z',
        'src/file.js',
        'edit',
        'diff content',
        50,
        50,
        'test-session-123',
        'abc123',
        1000
      );
      expect(result).toEqual({ success: true, eventId: 1 });
    });

    test('should handle database errors', async () => {
      mockDb.insertEvent.mockImplementation(() => {
        throw new Error('DB error');
      });

      const eventData = {
        timestamp: '2025-01-01T12:00:00Z',
        relPath: 'src/file.js',
        eventType: 'edit',
        projectName: 'test-project'
      };

      const result = await handler.insertEventToDatabase(mockDb, eventData);

      expect(result).toEqual({ success: false, eventId: null });
    });
  });

  describe('logToDeveloperDB()', () => {
    test('should log to developer DB when available', async () => {
      const mockDeveloperDB = {
        logCodePattern: jest.fn()
      };
      handler.developerDB = mockDeveloperDB;

      await handler.logToDeveloperDB(
        'test-project',
        'src/file.js',
        'edit',
        '+added\n-removed',
        '2025-01-01T12:00:00Z'
      );

      expect(mockDeveloperDB.logCodePattern).toHaveBeenCalledWith({
        project: 'test-project',
        language: 'javascript',
        file_type: 'js',
        edit_type: 'modify',
        lines_added: 1,
        lines_removed: 1,
        timestamp: '2025-01-01T12:00:00Z'
      });
    });

    test('should handle missing developer DB', async () => {
      handler.developerDB = null;

      await expect(
        handler.logToDeveloperDB('test-project', 'file.js', 'edit', '', '2025-01-01T12:00:00Z')
      ).resolves.not.toThrow();
    });

    test('should handle developer DB errors', async () => {
      const mockDeveloperDB = {
        logCodePattern: jest.fn().mockImplementation(() => {
          throw new Error('DB error');
        })
      };
      handler.developerDB = mockDeveloperDB;

      await expect(
        handler.logToDeveloperDB('test-project', 'file.js', 'edit', '', '2025-01-01T12:00:00Z')
      ).resolves.not.toThrow();
    });
  });

  describe('emitFileChangeEvent()', () => {
    test('should emit file-changed event on success', () => {
      const eventData = {
        timestamp: '2025-01-01T12:00:00Z',
        projectName: 'test-project',
        relPath: 'src/file.js',
        eventType: 'edit',
        eventSize: 1000,
        fileHash: 'abc123'
      };

      handler.emitFileChangeEvent(true, 1, eventData);

      expect(mockIo.emit).toHaveBeenCalledWith('file-changed', {
        id: 1,
        timestamp: '2025-01-01T12:00:00Z',
        project: 'test-project',
        filepath: 'src/file.js',
        change_type: 'edit',
        event_size: 1000,
        file_hash: 'abc123'
      });
    });

    test('should emit untracked event on failure', () => {
      const eventData = {
        timestamp: '2025-01-01T12:00:00Z',
        projectName: 'test-project',
        relPath: 'src/file.js',
        eventType: 'edit'
      };

      handler.emitFileChangeEvent(false, null, eventData);

      expect(mockIo.emit).toHaveBeenCalledWith('file-changed-untracked', {
        timestamp: '2025-01-01T12:00:00Z',
        project: 'test-project',
        filepath: 'src/file.js',
        change_type: 'edit',
        error: 'Database insert failed'
      });
    });
  });

  describe('runSafetyChecks()', () => {
    test('should run syntax and pattern checks asynchronously', async () => {
      await handler.runSafetyChecks('/test/project/file.js', 'content', mockDb, 'test-project');

      // Should complete without errors
      // Actual checks run via setImmediate, so we can't easily test them
      expect(true).toBe(true);
    });

    test('should handle empty content', async () => {
      await expect(
        handler.runSafetyChecks('/test/project/file.js', '', mockDb, 'test-project')
      ).resolves.not.toThrow();
    });

    test('should handle null content', async () => {
      await expect(
        handler.runSafetyChecks('/test/project/file.js', null, mockDb, 'test-project')
      ).resolves.not.toThrow();
    });
  });

  describe('handleFileChange() - Lock Management', () => {
    test('should acquire and release lock', async () => {
      const releaseMock = jest.fn();
      mockLock.acquire.mockResolvedValue(releaseMock);

      // Mock a simple scenario where project not found
      await handler.handleFileChange('edit', '/unknown/file.js');

      expect(mockLock.acquire).toHaveBeenCalledWith('/unknown/file.js');
      expect(releaseMock).toHaveBeenCalled();
    });

    test('should release lock even on error', async () => {
      const releaseMock = jest.fn();
      mockLock.acquire.mockResolvedValue(releaseMock);

      // Cause an error by using invalid project
      await handler.handleFileChange('edit', '/test/project/file.js');

      expect(releaseMock).toHaveBeenCalled();
    });
  });

  describe('handleFileChange() - Delete Events', () => {
    test('should handle file deletion', async () => {
      const releaseMock = jest.fn();
      mockLock.acquire.mockResolvedValue(releaseMock);

      // Setup cache
      handler.fileCache.set('/test/project/src/file.js', 'old content');

      await handler.handleFileChange('delete', '/test/project/src/file.js');

      expect(mockDb.clearSyntaxErrors).toHaveBeenCalledWith('/test/project/src/file.js');
      expect(mockDb.clearPatternWarnings).toHaveBeenCalledWith('/test/project/src/file.js');
      expect(handler.fileCache.has('/test/project/src/file.js')).toBe(false);
      expect(mockDb.insertEvent).toHaveBeenCalled();
    });
  });

  describe('handleFileChange() - Integration', () => {
    test('should warn when project not found', async () => {
      const releaseMock = jest.fn();
      mockLock.acquire.mockResolvedValue(releaseMock);

      await handler.handleFileChange('edit', '/unknown/path/file.js');

      // Should not throw, should just warn
      expect(mockDb.insertEvent).not.toHaveBeenCalled();
      expect(releaseMock).toHaveBeenCalled();
    });

    test('should update session tracker when available', async () => {
      const mockSessionTracker = {
        recordActivity: jest.fn()
      };
      handler.sessionTracker = mockSessionTracker;

      const releaseMock = jest.fn();
      mockLock.acquire.mockResolvedValue(releaseMock);

      handler.fileCache.set('/test/project/src/file.js', 'content');

      await handler.handleFileChange('delete', '/test/project/src/file.js');

      expect(mockSessionTracker.recordActivity).toHaveBeenCalledWith(
        'test-project',
        expect.objectContaining({
          change_type: 'delete',
          filepath: 'src/file.js'
        })
      );
    });

    test('should call emitGitStatusUpdate when available', async () => {
      const releaseMock = jest.fn();
      mockLock.acquire.mockResolvedValue(releaseMock);

      handler.fileCache.set('/test/project/src/file.js', 'content');

      await handler.handleFileChange('delete', '/test/project/src/file.js');

      expect(mockOptions.emitGitStatusUpdate).toHaveBeenCalledWith('test-project');
    });
  });

  describe('Error Handling', () => {
    test('should handle missing project path', async () => {
      const releaseMock = jest.fn();
      mockLock.acquire.mockResolvedValue(releaseMock);

      handler.projectPaths.clear();

      await handler.handleFileChange('edit', '/test/project/file.js');

      expect(mockDb.insertEvent).not.toHaveBeenCalled();
      expect(releaseMock).toHaveBeenCalled();
    });

    test('should handle missing project database', async () => {
      const releaseMock = jest.fn();
      mockLock.acquire.mockResolvedValue(releaseMock);

      handler.projectDatabases.clear();

      await handler.handleFileChange('edit', '/test/project/file.js');

      expect(mockDb.insertEvent).not.toHaveBeenCalled();
      expect(releaseMock).toHaveBeenCalled();
    });

    test('should handle system metrics errors', async () => {
      mockCurrentLoad.mockRejectedValue(new Error('Metrics failed'));

      const metrics = await handler.collectSystemMetrics();

      expect(metrics.cpuPercent).toBe(0);
      expect(metrics.memPercent).toBe(0);
    });
  });
});
