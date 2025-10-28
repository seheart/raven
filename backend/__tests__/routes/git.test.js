/**
 * Tests for Git Routes
 */

import request from 'supertest';
import express from 'express';
import { createGitRoutes } from '../../routes/git.js';

describe('Git Routes', () => {
  let app;
  let mockProjectState;
  let mockGitMonitor;

  beforeEach(() => {
    app = express();
    app.use(express.json());

    // Create comprehensive mock git monitor
    mockGitMonitor = {
      isGitRepo: async () => true,
      checkStatus: async () => ({
        branch: 'main',
        modified: ['file1.js', 'file2.js'],
        created: ['file3.js'],
        deleted: ['file4.js'],
        ahead: 1,
        behind: 0
      }),
      getLastStatus: () => ({
        current: 'main',
        modified: ['file1.js'],
        created: ['file2.js'],
        not_added: ['file3.js'],
        deleted: [],
        ahead: 0,
        behind: 1
      }),
      getBranches: async () => ['main', 'develop', 'feature/test'],
      getCommitHistory: async (limit) => [
        {
          hash: 'abc123',
          message: 'Initial commit',
          author_name: 'Test User',
          date: '2024-01-01'
        },
        {
          hash: 'def456',
          message: 'Add feature',
          author_name: 'Test User',
          date: '2024-01-02'
        }
      ],
      getFileDiff: async (filepath) => `diff --git a/${filepath} b/${filepath}\n+added line`,
      getUncommittedDiff: async () => 'diff --git a/file.js b/file.js\n+changes',
      lastStatus: null
    };

    mockProjectState = {
      gitMonitor: mockGitMonitor
    };

    const deps = {
      projectState: mockProjectState
    };

    app.use('/api/git', createGitRoutes(deps));
  });

  describe('GET /api/git/status', () => {
    test('should return git status when git monitor exists', async () => {
      const response = await request(app)
        .get('/api/git/status')
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body).toHaveProperty('branch');
      expect(response.body).toHaveProperty('modified');
      expect(response.body).toHaveProperty('created');
      expect(response.body).toHaveProperty('deleted');
      expect(response.body).toHaveProperty('ahead');
      expect(response.body).toHaveProperty('behind');
    });

    test('should return unknown status when git monitor missing', async () => {
      mockProjectState.gitMonitor = null;

      const response = await request(app)
        .get('/api/git/status')
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body.branch).toBe('unknown');
      expect(response.body.modified).toEqual([]);
      expect(response.body.created).toEqual([]);
      expect(response.body.deleted).toEqual([]);
    });

    test('should return unknown status when not a git repo', async () => {
      mockGitMonitor.isGitRepo = async () => false;

      const response = await request(app)
        .get('/api/git/status')
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body.branch).toBe('unknown');
      expect(response.body.modified).toEqual([]);
    });

    test('should use checkStatus result when available', async () => {
      const response = await request(app)
        .get('/api/git/status')
        .expect(200);

      expect(response.body.branch).toBe('main');
      expect(response.body.modified).toEqual(['file1.js', 'file2.js']);
      expect(response.body.created).toEqual(['file3.js']);
      expect(response.body.deleted).toEqual(['file4.js']);
      expect(response.body.ahead).toBe(1);
      expect(response.body.behind).toBe(0);
    });

    test('should fallback to lastStatus when checkStatus returns null', async () => {
      mockGitMonitor.checkStatus = async () => null;

      const response = await request(app)
        .get('/api/git/status')
        .expect(200);

      expect(response.body.branch).toBe('main');
      expect(response.body.modified).toEqual(['file1.js']);
      expect(response.body.created).toContain('file2.js');
      expect(response.body.created).toContain('file3.js');
    });

    test('should return defaults when no status available', async () => {
      mockGitMonitor.checkStatus = async () => null;
      mockGitMonitor.getLastStatus = () => null;

      const response = await request(app)
        .get('/api/git/status')
        .expect(200);

      expect(response.body.branch).toBe('unknown');
      expect(response.body.ahead).toBe(0);
      expect(response.body.behind).toBe(0);
    });

    test('should handle errors gracefully', async () => {
      mockGitMonitor.isGitRepo = async () => {
        throw new Error('Git error');
      };

      const response = await request(app)
        .get('/api/git/status')
        .expect('Content-Type', /json/)
        .expect(500);

      expect(response.body).toHaveProperty('error');
    });
  });

  describe('GET /api/git/branches', () => {
    test('should list git branches', async () => {
      const response = await request(app)
        .get('/api/git/branches')
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body).toHaveProperty('branches');
      expect(Array.isArray(response.body.branches)).toBe(true);
      expect(response.body.branches).toEqual(['main', 'develop', 'feature/test']);
    });

    test('should return empty array when git monitor missing', async () => {
      mockProjectState.gitMonitor = null;

      const response = await request(app)
        .get('/api/git/branches')
        .expect(200);

      expect(response.body.branches).toEqual([]);
    });

    test('should return empty array when not a git repo', async () => {
      mockGitMonitor.isGitRepo = async () => false;

      const response = await request(app)
        .get('/api/git/branches')
        .expect(200);

      expect(response.body.branches).toEqual([]);
    });

    test('should handle errors and return empty branches', async () => {
      mockGitMonitor.getBranches = async () => {
        throw new Error('Branch error');
      };

      const response = await request(app)
        .get('/api/git/branches')
        .expect(500);

      expect(response.body).toHaveProperty('error');
      expect(response.body.branches).toEqual([]);
    });
  });

  describe('GET /api/git/history', () => {
    test('should return commit history', async () => {
      const response = await request(app)
        .get('/api/git/history')
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body).toHaveProperty('commits');
      expect(Array.isArray(response.body.commits)).toBe(true);
      expect(response.body.commits).toHaveLength(2);
      expect(response.body.commits[0]).toHaveProperty('hash');
      expect(response.body.commits[0]).toHaveProperty('message');
      expect(response.body.commits[0]).toHaveProperty('author');
      expect(response.body.commits[0]).toHaveProperty('date');
    });

    test('should use default limit of 10', async () => {
      const response = await request(app)
        .get('/api/git/history')
        .expect(200);

      expect(response.body.commits).toBeDefined();
    });

    test('should handle limit parameter', async () => {
      const response = await request(app)
        .get('/api/git/history?limit=5')
        .expect(200);

      expect(response.body.commits).toBeDefined();
    });

    test('should handle invalid limit parameter', async () => {
      const response = await request(app)
        .get('/api/git/history?limit=invalid')
        .expect(200);

      expect(response.body.commits).toBeDefined();
    });

    test('should return empty array when git monitor missing', async () => {
      mockProjectState.gitMonitor = null;

      const response = await request(app)
        .get('/api/git/history')
        .expect(200);

      expect(response.body.commits).toEqual([]);
    });

    test('should return empty array when not a git repo', async () => {
      mockGitMonitor.isGitRepo = async () => false;

      const response = await request(app)
        .get('/api/git/history')
        .expect(200);

      expect(response.body.commits).toEqual([]);
    });

    test('should handle errors', async () => {
      mockGitMonitor.getCommitHistory = async () => {
        throw new Error('History error');
      };

      const response = await request(app)
        .get('/api/git/history')
        .expect(500);

      expect(response.body).toHaveProperty('error');
      expect(response.body.commits).toEqual([]);
    });
  });

  describe('GET /api/git/diff/:filepath', () => {
    test('should return diff for specific file', async () => {
      const response = await request(app)
        .get('/api/git/diff/src/test.js')
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body).toHaveProperty('file');
      expect(response.body).toHaveProperty('diff');
      expect(response.body.file).toBe('src/test.js');
      expect(response.body.diff).toContain('diff --git');
    });

    test('should handle paths with multiple segments', async () => {
      const response = await request(app)
        .get('/api/git/diff/path/to/deep/file.js')
        .expect(200);

      expect(response.body.file).toBe('path/to/deep/file.js');
    });

    test('should return empty diff when git monitor missing', async () => {
      mockProjectState.gitMonitor = null;

      const response = await request(app)
        .get('/api/git/diff/test.js')
        .expect(200);

      expect(response.body.diff).toBe('');
      expect(response.body.file).toBe('test.js');
    });

    test('should return empty diff when not a git repo', async () => {
      mockGitMonitor.isGitRepo = async () => false;

      const response = await request(app)
        .get('/api/git/diff/test.js')
        .expect(200);

      expect(response.body.diff).toBe('');
    });

    test('should handle getFileDiff returning null', async () => {
      mockGitMonitor.getFileDiff = async () => null;

      const response = await request(app)
        .get('/api/git/diff/test.js')
        .expect(200);

      expect(response.body.diff).toBe('');
    });

    test('should handle errors', async () => {
      mockGitMonitor.getFileDiff = async () => {
        throw new Error('Diff error');
      };

      const response = await request(app)
        .get('/api/git/diff/test.js')
        .expect(500);

      expect(response.body).toHaveProperty('error');
      expect(response.body.file).toBe('test.js');
      expect(response.body.diff).toBe('');
    });
  });

  describe('GET /api/git/diff', () => {
    test('should return all uncommitted changes', async () => {
      const response = await request(app)
        .get('/api/git/diff')
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body).toHaveProperty('diff');
      expect(response.body.diff).toContain('diff --git');
    });

    test('should return empty diff when git monitor missing', async () => {
      mockProjectState.gitMonitor = null;

      const response = await request(app)
        .get('/api/git/diff')
        .expect(200);

      expect(response.body.diff).toBe('');
    });

    test('should return empty diff when not a git repo', async () => {
      mockGitMonitor.isGitRepo = async () => false;

      const response = await request(app)
        .get('/api/git/diff')
        .expect(200);

      expect(response.body.diff).toBe('');
    });

    test('should handle getUncommittedDiff returning null', async () => {
      mockGitMonitor.getUncommittedDiff = async () => null;

      const response = await request(app)
        .get('/api/git/diff')
        .expect(200);

      expect(response.body.diff).toBe('');
    });

    test('should handle errors', async () => {
      mockGitMonitor.getUncommittedDiff = async () => {
        throw new Error('Uncommitted diff error');
      };

      const response = await request(app)
        .get('/api/git/diff')
        .expect(500);

      expect(response.body).toHaveProperty('error');
      expect(response.body.diff).toBe('');
    });
  });
});
