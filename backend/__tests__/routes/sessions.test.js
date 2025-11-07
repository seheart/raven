/**
 * Tests for Sessions Routes
 */

import { jest } from '@jest/globals';
import request from 'supertest';
import express from 'express';
import { createSessionRoutes } from '../../routes/sessions.js';

describe('Sessions Routes', () => {
  let app;
  let mockSessionTracker;
  let mockProjectDatabases;

  beforeEach(() => {
    app = express();
    app.use(express.json());

    mockSessionTracker = {
      getActiveSession: jest.fn(),
      calculateSessionQuality: jest.fn(),
      getSessionStats: jest.fn()
    };

    mockProjectDatabases = new Map();
    mockProjectDatabases.set('test-project', {});

    const deps = {
      sessionTracker: mockSessionTracker,
      projectDatabases: mockProjectDatabases
    };

    app.use('/api/sessions', createSessionRoutes(deps));
  });

  describe('GET /api/sessions', () => {
    test('should return empty sessions list when no database', async () => {
      // Create app without mock database
      const appNoDb = express();
      appNoDb.use(express.json());
      appNoDb.use(
        '/api/sessions',
        createSessionRoutes({
          sessionTracker: mockSessionTracker,
          projectDatabases: new Map() // Empty map - no databases
        })
      );

      const response = await request(appNoDb)
        .get('/api/sessions')
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body).toHaveProperty('sessions');
      expect(response.body).toHaveProperty('total');
      expect(Array.isArray(response.body.sessions)).toBe(true);
      expect(response.body.sessions).toHaveLength(0);
      expect(response.body.total).toBe(0);
    });

    test('should return sessions with file counts from database', async () => {
      const mockDb = {
        db: {
          prepare: jest.fn().mockReturnThis(),
          all: jest.fn().mockReturnValue([
            {
              id: 1,
              project_name: 'test-project',
              start_time: '2025-01-01 10:00:00',
              end_time: '2025-01-01 11:00:00',
              changes_count: 10,
              rollbacks_count: 0,
              quality_score: 85
            }
          ]),
          get: jest.fn().mockReturnValue({ file_count: 5, event_count: 10 })
        }
      };

      const appWithDb = express();
      appWithDb.use(express.json());
      const dbMap = new Map();
      dbMap.set('test-project', mockDb);
      appWithDb.use(
        '/api/sessions',
        createSessionRoutes({
          sessionTracker: mockSessionTracker,
          projectDatabases: dbMap
        })
      );

      const response = await request(appWithDb).get('/api/sessions').expect(200);

      expect(response.body.sessions).toHaveLength(1);
      expect(response.body.sessions[0]).toMatchObject({
        id: 1,
        project_name: 'test-project',
        file_count: 5,
        event_count: 10
      });
    });

    test('should handle file counting errors gracefully', async () => {
      const mockDb = {
        db: {
          prepare: jest.fn().mockImplementation(sql => {
            if (sql.includes('FROM sessions')) {
              return {
                all: jest.fn().mockReturnValue([
                  {
                    id: 1,
                    project_name: 'test-project',
                    start_time: '2025-01-01 10:00:00',
                    end_time: '2025-01-01 11:00:00',
                    changes_count: 10
                  }
                ])
              };
            }
            // Throw error for file counting queries
            throw new Error('File count error');
          })
        }
      };

      const appWithDb = express();
      appWithDb.use(express.json());
      const dbMap = new Map();
      dbMap.set('test-project', mockDb);
      appWithDb.use(
        '/api/sessions',
        createSessionRoutes({
          sessionTracker: mockSessionTracker,
          projectDatabases: dbMap
        })
      );

      const response = await request(appWithDb).get('/api/sessions').expect(200);

      expect(response.body.sessions).toHaveLength(1);
      expect(response.body.sessions[0].file_count).toBe(0);
    });

    test('should support project query parameter', async () => {
      const mockDb = {
        db: {
          prepare: jest.fn().mockReturnThis(),
          all: jest.fn().mockReturnValue([]),
          get: jest.fn().mockReturnValue({ file_count: 0 })
        }
      };

      const appWithDb = express();
      appWithDb.use(express.json());
      const dbMap = new Map();
      dbMap.set('my-project', mockDb);
      appWithDb.use(
        '/api/sessions',
        createSessionRoutes({
          sessionTracker: mockSessionTracker,
          projectDatabases: dbMap
        })
      );

      await request(appWithDb).get('/api/sessions?project=my-project').expect(200);

      expect(mockDb.db.prepare).toHaveBeenCalled();
    });

    test('should handle database query errors', async () => {
      const mockDb = {
        db: {
          prepare: jest.fn().mockImplementation(() => {
            throw new Error('Database error');
          })
        }
      };

      const appWithDb = express();
      appWithDb.use(express.json());
      const dbMap = new Map();
      dbMap.set('test-project', mockDb);
      appWithDb.use(
        '/api/sessions',
        createSessionRoutes({
          sessionTracker: mockSessionTracker,
          projectDatabases: dbMap
        })
      );

      const response = await request(appWithDb).get('/api/sessions').expect(500);

      expect(response.body.error).toBe('Database error');
    });
  });

  describe('GET /api/sessions/:sessionId/preview', () => {
    test('should return 404 when project database not found', async () => {
      // Create app without mock database
      const appNoDb = express();
      appNoDb.use(express.json());
      appNoDb.use(
        '/api/sessions',
        createSessionRoutes({
          sessionTracker: mockSessionTracker,
          projectDatabases: new Map() // Empty map - no databases
        })
      );

      const response = await request(appNoDb)
        .get('/api/sessions/session-123/preview')
        .expect('Content-Type', /json/)
        .expect(404);

      expect(response.body).toHaveProperty('error', 'Project database not found');
    });

    test('should return 404 when session not found', async () => {
      const mockDb = {
        db: {
          prepare: jest.fn().mockReturnThis(),
          get: jest.fn().mockReturnValue(null)
        }
      };

      const appWithDb = express();
      appWithDb.use(express.json());
      const dbMap = new Map();
      dbMap.set('test-project', mockDb);
      appWithDb.use(
        '/api/sessions',
        createSessionRoutes({
          sessionTracker: mockSessionTracker,
          projectDatabases: dbMap
        })
      );

      const response = await request(appWithDb)
        .get('/api/sessions/nonexistent/preview')
        .expect(404);

      expect(response.body.error).toBe('Session not found');
    });

    test('should return preview with file changes', async () => {
      const mockSession = {
        id: 1,
        session_id: 'session-123',
        start_time: '2025-01-01 10:00:00',
        end_time: '2025-01-01 11:00:00',
        changes_count: 5
      };

      const mockFiles = [
        {
          filepath: 'src/file1.js',
          first_change: '2025-01-01 10:15:00',
          last_change: '2025-01-01 10:45:00',
          change_count: 3
        }
      ];

      const mockDb = {
        db: {
          prepare: jest.fn().mockImplementation(sql => {
            if (sql.includes('FROM sessions')) {
              return {
                get: jest.fn().mockReturnValue(mockSession)
              };
            }
            if (sql.includes('FROM events')) {
              return {
                all: jest.fn().mockReturnValue(mockFiles)
              };
            }
          })
        }
      };

      const appWithDb = express();
      appWithDb.use(express.json());
      const dbMap = new Map();
      dbMap.set('test-project', mockDb);
      appWithDb.use(
        '/api/sessions',
        createSessionRoutes({
          sessionTracker: mockSessionTracker,
          projectDatabases: dbMap,
          projectState: { snapshotsDir: '/tmp/snapshots' }
        })
      );

      const response = await request(appWithDb)
        .get('/api/sessions/session-123/preview')
        .expect(200);

      expect(response.body).toHaveProperty('canRollback');
      expect(response.body).toHaveProperty('fileCount', 1);
      expect(response.body).toHaveProperty('changes');
      expect(response.body.changes[0]).toMatchObject({
        filepath: 'src/file1.js',
        changeCount: 3
      });
    });

    test('should handle snapshot directory read errors', async () => {
      const mockSession = {
        id: 1,
        start_time: '2025-01-01 10:00:00',
        end_time: '2025-01-01 11:00:00'
      };

      const mockDb = {
        db: {
          prepare: jest.fn().mockImplementation(sql => {
            if (sql.includes('FROM sessions')) {
              return { get: jest.fn().mockReturnValue(mockSession) };
            }
            if (sql.includes('FROM events')) {
              return { all: jest.fn().mockReturnValue([{ filepath: 'test.js', change_count: 1 }]) };
            }
          })
        }
      };

      const appWithDb = express();
      appWithDb.use(express.json());
      const dbMap = new Map();
      dbMap.set('test-project', mockDb);
      appWithDb.use(
        '/api/sessions',
        createSessionRoutes({
          sessionTracker: mockSessionTracker,
          projectDatabases: dbMap,
          projectState: { snapshotsDir: '/nonexistent/dir' }
        })
      );

      const response = await request(appWithDb).get('/api/sessions/1/preview').expect(200);

      expect(response.body.changes[0].hasBackup).toBe(false);
    });

    test('should handle errors during preview', async () => {
      const mockDb = {
        db: {
          prepare: jest.fn().mockImplementation(() => {
            throw new Error('Preview error');
          })
        }
      };

      const appWithDb = express();
      appWithDb.use(express.json());
      const dbMap = new Map();
      dbMap.set('test-project', mockDb);
      appWithDb.use(
        '/api/sessions',
        createSessionRoutes({
          sessionTracker: mockSessionTracker,
          projectDatabases: dbMap
        })
      );

      const response = await request(appWithDb).get('/api/sessions/1/preview').expect(500);

      expect(response.body.error).toBe('Preview error');
    });
  });

  describe('POST /api/sessions/:sessionId/rollback', () => {
    let mockReaddir;
    let mockReadFile;
    let mockWriteFile;
    let mockExistsSync;
    let mockGunzip;

    beforeEach(async () => {
      // Mock fs and zlib for rollback tests
      const fsModule = await import('fs');
      const fsPromises = await import('fs/promises');
      const zlibModule = await import('zlib');

      mockReaddir = jest.spyOn(fsPromises, 'readdir').mockResolvedValue([]);
      mockReadFile = jest.spyOn(fsPromises, 'readFile').mockResolvedValue(Buffer.from(''));
      mockWriteFile = jest.spyOn(fsPromises, 'writeFile').mockResolvedValue();
      mockExistsSync = jest.spyOn(fsModule, 'existsSync').mockReturnValue(true);
      mockGunzip = jest.spyOn(zlibModule, 'gunzip').mockImplementation((data, callback) => {
        callback(null, Buffer.from('restored content'));
      });
    });

    afterEach(() => {
      mockReaddir?.mockRestore();
      mockReadFile?.mockRestore();
      mockWriteFile?.mockRestore();
      mockExistsSync?.mockRestore();
      mockGunzip?.mockRestore();
    });

    test('should return 404 when project database not found', async () => {
      // Create app without mock database
      const appNoDb = express();
      appNoDb.use(express.json());
      appNoDb.use(
        '/api/sessions',
        createSessionRoutes({
          sessionTracker: mockSessionTracker,
          projectDatabases: new Map() // Empty map - no databases
        })
      );

      const response = await request(appNoDb)
        .post('/api/sessions/session-123/rollback')
        .expect('Content-Type', /json/)
        .expect(404);

      expect(response.body).toHaveProperty('error', 'Project database not found');
    });

    test('should return 404 when session not found', async () => {
      const mockDb = {
        db: {
          prepare: jest.fn().mockImplementation(() => ({
            get: jest.fn().mockReturnValue(null)
          }))
        }
      };

      const appWithDb = express();
      appWithDb.use(express.json());
      const dbMap = new Map();
      dbMap.set('test-project', mockDb);
      appWithDb.use(
        '/api/sessions',
        createSessionRoutes({
          sessionTracker: mockSessionTracker,
          projectDatabases: dbMap
        })
      );

      const response = await request(appWithDb)
        .post('/api/sessions/nonexistent/rollback')
        .expect(404);

      expect(response.body.error).toBe('Session not found');
    });

    test('should successfully rollback files with snapshots', async () => {
      const mockSession = {
        id: 1,
        start_time: '2025-01-01T10:00:00.000Z',
        end_time: '2025-01-01T11:00:00.000Z'
      };

      const mockDb = {
        db: {
          prepare: jest.fn().mockImplementation(sql => {
            if (sql.includes('FROM sessions')) {
              return { get: jest.fn().mockReturnValue(mockSession) };
            }
            if (sql.includes('FROM events')) {
              return { all: jest.fn().mockReturnValue([{ filepath: 'src/test.js' }]) };
            }
          })
        }
      };

      // Mock snapshots directory with files
      mockReaddir.mockResolvedValue([
        'src_test.js_1704096000000.gz', // Before session (10:00 AM - 1000ms)
        'src_test.js_1704099600000.gz' // After session (11:00 AM)
      ]);

      const appWithDb = express();
      appWithDb.use(express.json());
      const dbMap = new Map();
      dbMap.set('test-project', mockDb);
      appWithDb.use(
        '/api/sessions',
        createSessionRoutes({
          sessionTracker: mockSessionTracker,
          projectDatabases: dbMap,
          projectState: { snapshotsDir: '/tmp/snapshots', watchPath: '/project' }
        })
      );

      const response = await request(appWithDb).post('/api/sessions/1/rollback').expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.restoredFiles).toContain('src/test.js');
      expect(response.body.restoredCount).toBe(1);
      expect(response.body.failedCount).toBe(0);
    });

    test('should handle files without snapshots', async () => {
      const mockSession = {
        id: 1,
        start_time: '2025-01-01T10:00:00.000Z',
        end_time: '2025-01-01T11:00:00.000Z'
      };

      const mockDb = {
        db: {
          prepare: jest.fn().mockImplementation(sql => {
            if (sql.includes('FROM sessions')) {
              return { get: jest.fn().mockReturnValue(mockSession) };
            }
            if (sql.includes('FROM events')) {
              return { all: jest.fn().mockReturnValue([{ filepath: 'src/new-file.js' }]) };
            }
          })
        }
      };

      // No snapshots available for this file
      mockReaddir.mockResolvedValue([]);

      const appWithDb = express();
      appWithDb.use(express.json());
      const dbMap = new Map();
      dbMap.set('test-project', mockDb);
      appWithDb.use(
        '/api/sessions',
        createSessionRoutes({
          sessionTracker: mockSessionTracker,
          projectDatabases: dbMap,
          projectState: { snapshotsDir: '/tmp/snapshots', watchPath: '/project' }
        })
      );

      const response = await request(appWithDb).post('/api/sessions/1/rollback').expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.restoredCount).toBe(0);
      expect(response.body.failedCount).toBe(1);
      expect(response.body.failedFiles[0]).toMatchObject({
        file: 'src/new-file.js',
        reason: 'No backup available'
      });
    });

    test('should handle snapshot decompression errors', async () => {
      const mockSession = {
        id: 1,
        start_time: '2025-01-01T10:00:00.000Z',
        end_time: '2025-01-01T11:00:00.000Z'
      };

      const mockDb = {
        db: {
          prepare: jest.fn().mockImplementation(sql => {
            if (sql.includes('FROM sessions')) {
              return { get: jest.fn().mockReturnValue(mockSession) };
            }
            if (sql.includes('FROM events')) {
              return { all: jest.fn().mockReturnValue([{ filepath: 'src/corrupted.js' }]) };
            }
          })
        }
      };

      mockReaddir.mockResolvedValue(['src_corrupted.js_1704096000000.gz']);
      mockGunzip.mockImplementation((data, callback) => {
        callback(new Error('Decompression failed: invalid gzip data'));
      });

      const appWithDb = express();
      appWithDb.use(express.json());
      const dbMap = new Map();
      dbMap.set('test-project', mockDb);
      appWithDb.use(
        '/api/sessions',
        createSessionRoutes({
          sessionTracker: mockSessionTracker,
          projectDatabases: dbMap,
          projectState: { snapshotsDir: '/tmp/snapshots', watchPath: '/project' }
        })
      );

      const response = await request(appWithDb).post('/api/sessions/1/rollback').expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.failedCount).toBe(1);
      expect(response.body.failedFiles[0].file).toBe('src/corrupted.js');
      expect(response.body.failedFiles[0].reason).toContain('Decompression failed');
    });

    test('should handle file write permission errors', async () => {
      const mockSession = {
        id: 1,
        start_time: '2025-01-01T10:00:00.000Z',
        end_time: '2025-01-01T11:00:00.000Z'
      };

      const mockDb = {
        db: {
          prepare: jest.fn().mockImplementation(sql => {
            if (sql.includes('FROM sessions')) {
              return { get: jest.fn().mockReturnValue(mockSession) };
            }
            if (sql.includes('FROM events')) {
              return { all: jest.fn().mockReturnValue([{ filepath: 'src/readonly.js' }]) };
            }
          })
        }
      };

      mockReaddir.mockResolvedValue(['src_readonly.js_1704096000000.gz']);
      mockWriteFile.mockRejectedValue(new Error('EACCES: permission denied'));

      const appWithDb = express();
      appWithDb.use(express.json());
      const dbMap = new Map();
      dbMap.set('test-project', mockDb);
      appWithDb.use(
        '/api/sessions',
        createSessionRoutes({
          sessionTracker: mockSessionTracker,
          projectDatabases: dbMap,
          projectState: { snapshotsDir: '/tmp/snapshots', watchPath: '/project' }
        })
      );

      const response = await request(appWithDb).post('/api/sessions/1/rollback').expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.failedCount).toBe(1);
      expect(response.body.failedFiles[0].reason).toContain('permission denied');
    });

    test('should handle mixed success and failure for multiple files', async () => {
      const mockSession = {
        id: 1,
        start_time: '2025-01-01T10:00:00.000Z',
        end_time: '2025-01-01T11:00:00.000Z'
      };

      const mockDb = {
        db: {
          prepare: jest.fn().mockImplementation(sql => {
            if (sql.includes('FROM sessions')) {
              return { get: jest.fn().mockReturnValue(mockSession) };
            }
            if (sql.includes('FROM events')) {
              return {
                all: jest
                  .fn()
                  .mockReturnValue([
                    { filepath: 'src/success1.js' },
                    { filepath: 'src/no-backup.js' },
                    { filepath: 'src/success2.js' }
                  ])
              };
            }
          })
        }
      };

      mockReaddir.mockImplementation(async dir => {
        // Return snapshots only for success1 and success2
        return ['src_success1.js_1704096000000.gz', 'src_success2.js_1704096000000.gz'];
      });

      const appWithDb = express();
      appWithDb.use(express.json());
      const dbMap = new Map();
      dbMap.set('test-project', mockDb);
      appWithDb.use(
        '/api/sessions',
        createSessionRoutes({
          sessionTracker: mockSessionTracker,
          projectDatabases: dbMap,
          projectState: { snapshotsDir: '/tmp/snapshots', watchPath: '/project' }
        })
      );

      const response = await request(appWithDb).post('/api/sessions/1/rollback').expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.totalFiles).toBe(3);
      expect(response.body.restoredCount).toBe(2);
      expect(response.body.failedCount).toBe(1);
      expect(response.body.restoredFiles).toContain('src/success1.js');
      expect(response.body.restoredFiles).toContain('src/success2.js');
      expect(response.body.failedFiles[0].file).toBe('src/no-backup.js');
    });

    test('should handle general rollback errors', async () => {
      const mockDb = {
        db: {
          prepare: jest.fn().mockImplementation(() => {
            throw new Error('Database query failed');
          })
        }
      };

      const appWithDb = express();
      appWithDb.use(express.json());
      const dbMap = new Map();
      dbMap.set('test-project', mockDb);
      appWithDb.use(
        '/api/sessions',
        createSessionRoutes({
          sessionTracker: mockSessionTracker,
          projectDatabases: dbMap
        })
      );

      const response = await request(appWithDb).post('/api/sessions/1/rollback').expect(500);

      expect(response.body.error).toBe('Database query failed');
    });

    test('should handle nonexistent snapshots directory', async () => {
      const mockSession = {
        id: 1,
        start_time: '2025-01-01T10:00:00.000Z',
        end_time: '2025-01-01T11:00:00.000Z'
      };

      const mockDb = {
        db: {
          prepare: jest.fn().mockImplementation(sql => {
            if (sql.includes('FROM sessions')) {
              return { get: jest.fn().mockReturnValue(mockSession) };
            }
            if (sql.includes('FROM events')) {
              return { all: jest.fn().mockReturnValue([{ filepath: 'src/file.js' }]) };
            }
          })
        }
      };

      mockExistsSync.mockReturnValue(false);

      const appWithDb = express();
      appWithDb.use(express.json());
      const dbMap = new Map();
      dbMap.set('test-project', mockDb);
      appWithDb.use(
        '/api/sessions',
        createSessionRoutes({
          sessionTracker: mockSessionTracker,
          projectDatabases: dbMap,
          projectState: { snapshotsDir: '/nonexistent', watchPath: '/project' }
        })
      );

      const response = await request(appWithDb).post('/api/sessions/1/rollback').expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.failedCount).toBe(1);
      expect(response.body.failedFiles[0].reason).toBe('No backup available');
    });
  });

  describe('GET /api/sessions/current', () => {
    test('should return active session', async () => {
      const mockSession = {
        id: 'session-123',
        projectName: 'test-project',
        startTime: Date.now() - 60000, // 1 minute ago
        changesCount: 5,
        rollbacksCount: 0,
        qualityScore: 85
      };

      mockSessionTracker.getActiveSession.mockReturnValue(mockSession);

      const response = await request(app)
        .get('/api/sessions/current')
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body).toHaveProperty('hasActiveSession', true);
      expect(response.body.session).toHaveProperty('id', 'session-123');
      expect(response.body.session).toHaveProperty('durationMinutes');
    });

    test('should return no active session', async () => {
      mockSessionTracker.getActiveSession.mockReturnValue(null);

      const response = await request(app)
        .get('/api/sessions/current')
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body).toHaveProperty('hasActiveSession', false);
      expect(response.body.session).toBeNull();
    });

    test('should handle missing session tracker', async () => {
      const appNoTracker = express();
      appNoTracker.use(express.json());
      appNoTracker.use(
        '/api/sessions',
        createSessionRoutes({
          projectDatabases: mockProjectDatabases
        })
      );

      const response = await request(appNoTracker)
        .get('/api/sessions/current')
        .expect('Content-Type', /json/)
        .expect(503);

      expect(response.body).toHaveProperty('error');
    });
  });

  describe('GET /api/sessions/quality', () => {
    test('should return session quality', async () => {
      const mockQuality = {
        score: 85,
        factors: {
          codeChanges: 0.9,
          errorRate: 0.1
        }
      };

      mockSessionTracker.calculateSessionQuality.mockReturnValue(mockQuality);

      const response = await request(app)
        .get('/api/sessions/quality')
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body).toHaveProperty('quality');
      expect(response.body.quality.score).toBe(85);
    });
  });

  describe('GET /api/sessions/stats', () => {
    test('should return session statistics', async () => {
      const mockStats = {
        totalSessions: 10,
        averageDuration: 45,
        totalChanges: 150
      };

      mockSessionTracker.getSessionStats.mockReturnValue(mockStats);

      const response = await request(app)
        .get('/api/sessions/stats')
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body).toHaveProperty('stats');
      expect(response.body.stats.totalSessions).toBe(10);
    });

    test('should handle days parameter', async () => {
      mockSessionTracker.getSessionStats.mockReturnValue({});

      await request(app).get('/api/sessions/stats?days=7').expect(200);

      expect(mockSessionTracker.getSessionStats).toHaveBeenCalledWith('test-project', 7);
    });
  });

  describe('Error Handling', () => {
    test('should handle errors in getActiveSession', async () => {
      mockSessionTracker.getActiveSession.mockImplementation(() => {
        throw new Error('Session retrieval failed');
      });

      const response = await request(app).get('/api/sessions/current').expect(500);

      expect(response.body.error).toBe('Session retrieval failed');
    });

    test('should handle missing session tracker in quality endpoint', async () => {
      const appNoTracker = express();
      appNoTracker.use(express.json());
      appNoTracker.use(
        '/api/sessions',
        createSessionRoutes({
          projectDatabases: mockProjectDatabases
        })
      );

      const response = await request(appNoTracker).get('/api/sessions/quality').expect(503);

      expect(response.body.error).toBe('Session tracker not initialized');
    });

    test('should handle errors in calculateSessionQuality', async () => {
      mockSessionTracker.calculateSessionQuality.mockImplementation(() => {
        throw new Error('Quality calculation failed');
      });

      const response = await request(app).get('/api/sessions/quality').expect(500);

      expect(response.body.error).toBe('Quality calculation failed');
    });

    test('should handle missing session tracker in stats endpoint', async () => {
      const appNoTracker = express();
      appNoTracker.use(express.json());
      appNoTracker.use(
        '/api/sessions',
        createSessionRoutes({
          projectDatabases: mockProjectDatabases
        })
      );

      const response = await request(appNoTracker).get('/api/sessions/stats').expect(503);

      expect(response.body.error).toBe('Session tracker not initialized');
    });

    test('should handle errors in getSessionStats', async () => {
      mockSessionTracker.getSessionStats.mockImplementation(() => {
        throw new Error('Stats retrieval failed');
      });

      const response = await request(app).get('/api/sessions/stats').expect(500);

      expect(response.body.error).toBe('Stats retrieval failed');
    });
  });
});
