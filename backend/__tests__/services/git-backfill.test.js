/**
 * Tests for Git Backfill Service
 */

import { jest } from '@jest/globals';
import { GitBackfillService } from '../../services/git-backfill.js';

// Mock simple-git
const mockStatus = jest.fn();
const mockGit = jest.fn(() => ({
  status: mockStatus
}));

jest.mock('simple-git', () => ({
  default: mockGit
}));

describe('GitBackfillService', () => {
  let service;
  let mockDb;
  const projectPath = '/test/project';
  const sessionId = 'test-session-123';

  beforeEach(() => {
    mockDb = {
      prepareStatement: jest.fn()
    };

    service = new GitBackfillService(mockDb, projectPath, sessionId);

    // Clear all mocks
    jest.clearAllMocks();
    mockStatus.mockReset();
  });

  describe('Constructor', () => {
    test('should initialize with required dependencies', () => {
      expect(service.db).toBe(mockDb);
      expect(service.projectPath).toBe(projectPath);
      expect(service.sessionId).toBe(sessionId);
      expect(service.git).toBeDefined();
    });

    test('should create simple-git instance with project path', () => {
      expect(mockGit).toHaveBeenCalledWith(projectPath);
    });
  });

  describe('getRecentEvents()', () => {
    test('should query events from today', () => {
      const mockStmt = {
        all: jest.fn().mockReturnValue([{ filepath: 'src/file1.js' }, { filepath: 'src/file2.js' }])
      };
      mockDb.prepareStatement.mockReturnValue(mockStmt);

      const events = service.getRecentEvents();

      expect(mockDb.prepareStatement).toHaveBeenCalledWith(
        expect.stringContaining('SELECT DISTINCT filepath')
      );
      expect(mockDb.prepareStatement).toHaveBeenCalledWith(expect.stringContaining('FROM events'));
      expect(mockDb.prepareStatement).toHaveBeenCalledWith(
        expect.stringContaining('WHERE timestamp >= ?')
      );
      expect(mockStmt.all).toHaveBeenCalledWith(expect.any(String));
      expect(events).toHaveLength(2);
    });

    test('should return empty array on database error', () => {
      mockDb.prepareStatement.mockImplementation(() => {
        throw new Error('Database error');
      });

      const events = service.getRecentEvents();

      expect(events).toEqual([]);
    });

    test('should filter by today', () => {
      const mockStmt = {
        all: jest.fn().mockReturnValue([])
      };
      mockDb.prepareStatement.mockReturnValue(mockStmt);

      service.getRecentEvents();

      // Should query with today's timestamp
      const callArgs = mockStmt.all.mock.calls[0][0];
      expect(typeof callArgs).toBe('string');
      expect(callArgs).toContain('T00:00:00');
    });
  });

  describe('createSyntheticEvent()', () => {
    test('should insert synthetic event into database', () => {
      const mockStmt = { run: jest.fn() };
      const mockAgentStmt = { run: jest.fn() };

      mockDb.prepareStatement.mockReturnValueOnce(mockStmt).mockReturnValueOnce(mockAgentStmt);

      const timestamp = '2025-01-01T12:00:00.000Z';
      service.createSyntheticEvent('src/test.js', 'edit', timestamp);

      expect(mockDb.prepareStatement).toHaveBeenCalledTimes(2);

      // Check events table insert
      expect(mockDb.prepareStatement).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO events')
      );
      expect(mockStmt.run).toHaveBeenCalledWith(
        timestamp,
        'src/test.js',
        'edit',
        sessionId,
        null, // No diff
        null, // No CPU
        null, // No memory
        null, // No file hash
        null // No event size
      );

      // Check agent_events table insert
      expect(mockDb.prepareStatement).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO agent_events')
      );
      expect(mockAgentStmt.run).toHaveBeenCalledWith(
        timestamp,
        'raven-backfill',
        'edit',
        'src/test.js',
        'Git backfill synthetic event',
        expect.stringContaining('synthetic'),
        sessionId
      );
    });

    test('should handle different change types', () => {
      const mockStmt = { run: jest.fn() };
      const mockAgentStmt = { run: jest.fn() };

      mockDb.prepareStatement
        .mockReturnValue(mockStmt)
        .mockReturnValueOnce(mockStmt)
        .mockReturnValueOnce(mockAgentStmt);

      const timestamp = '2025-01-01T12:00:00.000Z';

      service.createSyntheticEvent('src/new.js', 'create', timestamp);
      expect(mockStmt.run).toHaveBeenCalledWith(
        timestamp,
        'src/new.js',
        'create',
        sessionId,
        null,
        null,
        null,
        null,
        null
      );

      mockStmt.run.mockClear();
      mockDb.prepareStatement.mockReturnValueOnce(mockStmt).mockReturnValueOnce(mockAgentStmt);

      service.createSyntheticEvent('src/old.js', 'delete', timestamp);
      expect(mockStmt.run).toHaveBeenCalledWith(
        timestamp,
        'src/old.js',
        'delete',
        sessionId,
        null,
        null,
        null,
        null,
        null
      );
    });

    test('should handle database errors gracefully', () => {
      mockDb.prepareStatement.mockImplementation(() => {
        throw new Error('Insert failed');
      });

      expect(() => {
        service.createSyntheticEvent('src/test.js', 'edit', '2025-01-01T12:00:00.000Z');
      }).not.toThrow();
    });
  });

  describe('backfillMissedChanges()', () => {
    beforeEach(() => {
      // Default: no recent events
      const mockStmt = { all: jest.fn().mockReturnValue([]) };
      mockDb.prepareStatement.mockReturnValue(mockStmt);
    });

    test('should return 0 when no git changes exist', async () => {
      mockStatus.mockResolvedValue({
        modified: [],
        not_added: [],
        created: [],
        deleted: []
      });

      const result = await service.backfillMissedChanges();

      expect(result.backfilled).toBe(0);
    });

    test('should backfill modified files not in database', async () => {
      mockStatus.mockResolvedValue({
        modified: ['src/file1.js', 'src/file2.js'],
        not_added: [],
        created: [],
        deleted: []
      });

      // Mock createSyntheticEvent
      const createSpy = jest.spyOn(service, 'createSyntheticEvent').mockImplementation(() => {});

      const result = await service.backfillMissedChanges();

      expect(result.backfilled).toBe(2);
      expect(createSpy).toHaveBeenCalledTimes(2);
      expect(createSpy).toHaveBeenCalledWith('src/file1.js', 'edit', expect.any(String));
      expect(createSpy).toHaveBeenCalledWith('src/file2.js', 'edit', expect.any(String));

      createSpy.mockRestore();
    });

    test('should backfill created files not in database', async () => {
      mockStatus.mockResolvedValue({
        modified: [],
        not_added: ['src/new1.js'],
        created: ['src/new2.js'],
        deleted: []
      });

      const createSpy = jest.spyOn(service, 'createSyntheticEvent').mockImplementation(() => {});

      const result = await service.backfillMissedChanges();

      expect(result.backfilled).toBe(2);
      expect(createSpy).toHaveBeenCalledWith('src/new1.js', 'create', expect.any(String));
      expect(createSpy).toHaveBeenCalledWith('src/new2.js', 'create', expect.any(String));

      createSpy.mockRestore();
    });

    test('should backfill deleted files not in database', async () => {
      mockStatus.mockResolvedValue({
        modified: [],
        not_added: [],
        created: [],
        deleted: ['src/deleted.js', 'src/removed.js']
      });

      const createSpy = jest.spyOn(service, 'createSyntheticEvent').mockImplementation(() => {});

      const result = await service.backfillMissedChanges();

      expect(result.backfilled).toBe(2);
      expect(createSpy).toHaveBeenCalledWith('src/deleted.js', 'delete', expect.any(String));
      expect(createSpy).toHaveBeenCalledWith('src/removed.js', 'delete', expect.any(String));

      createSpy.mockRestore();
    });

    test('should skip files already in database', async () => {
      const mockStmt = {
        all: jest.fn().mockReturnValue([{ filepath: 'src/file1.js' }, { filepath: 'src/file2.js' }])
      };
      mockDb.prepareStatement.mockReturnValue(mockStmt);

      mockStatus.mockResolvedValue({
        modified: ['src/file1.js', 'src/file2.js', 'src/file3.js'],
        not_added: [],
        created: [],
        deleted: []
      });

      const createSpy = jest.spyOn(service, 'createSyntheticEvent').mockImplementation(() => {});

      const result = await service.backfillMissedChanges();

      // Only file3 should be backfilled (file1 and file2 already tracked)
      expect(result.backfilled).toBe(1);
      expect(createSpy).toHaveBeenCalledTimes(1);
      expect(createSpy).toHaveBeenCalledWith('src/file3.js', 'edit', expect.any(String));

      createSpy.mockRestore();
    });

    test('should handle mixed change types', async () => {
      mockStatus.mockResolvedValue({
        modified: ['src/modified.js'],
        not_added: ['src/new.js'],
        created: [],
        deleted: ['src/deleted.js']
      });

      const createSpy = jest.spyOn(service, 'createSyntheticEvent').mockImplementation(() => {});

      const result = await service.backfillMissedChanges();

      expect(result.backfilled).toBe(3);
      expect(createSpy).toHaveBeenCalledWith('src/modified.js', 'edit', expect.any(String));
      expect(createSpy).toHaveBeenCalledWith('src/new.js', 'create', expect.any(String));
      expect(createSpy).toHaveBeenCalledWith('src/deleted.js', 'delete', expect.any(String));

      createSpy.mockRestore();
    });

    test('should handle git errors gracefully', async () => {
      mockStatus.mockRejectedValue(new Error('Git command failed'));

      const result = await service.backfillMissedChanges();

      expect(result.backfilled).toBe(0);
      expect(result.error).toBe('Git command failed');
    });

    test('should handle undefined arrays in git status', async () => {
      mockStatus.mockResolvedValue({
        modified: undefined,
        not_added: undefined,
        created: undefined,
        deleted: undefined
      });

      const result = await service.backfillMissedChanges();

      expect(result.backfilled).toBe(0);
    });
  });

  describe('previewBackfill()', () => {
    test('should return preview of missing files', async () => {
      const mockStmt = {
        all: jest.fn().mockReturnValue([{ filepath: 'src/tracked.js' }])
      };
      mockDb.prepareStatement.mockReturnValue(mockStmt);

      mockStatus.mockResolvedValue({
        modified: ['src/tracked.js', 'src/untracked1.js'],
        not_added: ['src/untracked2.js'],
        created: [],
        deleted: ['src/untracked3.js']
      });

      const preview = await service.previewBackfill();

      expect(preview.total).toBe(3);
      expect(preview.missing.modified).toEqual(['src/untracked1.js']);
      expect(preview.missing.created).toEqual(['src/untracked2.js']);
      expect(preview.missing.deleted).toEqual(['src/untracked3.js']);
    });

    test('should return empty preview when all files tracked', async () => {
      const mockStmt = {
        all: jest.fn().mockReturnValue([{ filepath: 'src/file1.js' }, { filepath: 'src/file2.js' }])
      };
      mockDb.prepareStatement.mockReturnValue(mockStmt);

      mockStatus.mockResolvedValue({
        modified: ['src/file1.js'],
        not_added: [],
        created: ['src/file2.js'],
        deleted: []
      });

      const preview = await service.previewBackfill();

      expect(preview.total).toBe(0);
      expect(preview.missing.modified).toEqual([]);
      expect(preview.missing.created).toEqual([]);
      expect(preview.missing.deleted).toEqual([]);
    });

    test('should handle preview errors gracefully', async () => {
      mockStatus.mockRejectedValue(new Error('Git error'));

      const preview = await service.previewBackfill();

      expect(preview.total).toBe(0);
      expect(preview.missing).toEqual({
        modified: [],
        created: [],
        deleted: []
      });
    });

    test('should combine not_added and created arrays', async () => {
      const mockStmt = { all: jest.fn().mockReturnValue([]) };
      mockDb.prepareStatement.mockReturnValue(mockStmt);

      mockStatus.mockResolvedValue({
        modified: [],
        not_added: ['file1.js', 'file2.js'],
        created: ['file3.js'],
        deleted: []
      });

      const preview = await service.previewBackfill();

      expect(preview.missing.created).toEqual(['file1.js', 'file2.js', 'file3.js']);
      expect(preview.total).toBe(3);
    });
  });

  describe('Integration', () => {
    test('should successfully backfill complete workflow', async () => {
      // Setup: Some files tracked, some not
      const mockStmt = {
        all: jest.fn().mockReturnValue([{ filepath: 'src/existing.js' }])
      };
      const mockInsertStmt = { run: jest.fn() };

      mockDb.prepareStatement
        .mockReturnValueOnce(mockStmt) // getRecentEvents
        .mockReturnValue(mockInsertStmt); // createSyntheticEvent inserts

      mockStatus.mockResolvedValue({
        modified: ['src/existing.js', 'src/new-modified.js'],
        not_added: ['src/new-file.js'],
        created: [],
        deleted: ['src/deleted-file.js']
      });

      const result = await service.backfillMissedChanges();

      // Should backfill 3 files (exclude src/existing.js which is already tracked)
      expect(result.backfilled).toBe(3);
      expect(mockInsertStmt.run).toHaveBeenCalled();
    });

    test('should handle empty git repository', async () => {
      mockStatus.mockResolvedValue({
        modified: [],
        not_added: [],
        created: [],
        deleted: []
      });

      const result = await service.backfillMissedChanges();

      expect(result.backfilled).toBe(0);
    });

    test('should not call database insert when nothing to backfill', async () => {
      const mockStmt = {
        all: jest.fn().mockReturnValue([{ filepath: 'src/file.js' }])
      };
      mockDb.prepareStatement.mockReturnValue(mockStmt);

      mockStatus.mockResolvedValue({
        modified: ['src/file.js'],
        not_added: [],
        created: [],
        deleted: []
      });

      await service.backfillMissedChanges();

      // Should only call prepareStatement for getRecentEvents
      expect(mockDb.prepareStatement).toHaveBeenCalledTimes(1);
    });
  });
});
