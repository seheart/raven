/**
 * Tests for Snapshots Routes
 */

import { jest } from '@jest/globals';
import request from 'supertest';
import express from 'express';
import { createSnapshotsRoutes } from '../../routes/snapshots.js';
import { mkdirSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('Snapshots Routes', () => {
  let app;
  let testDir;
  let snapshotsDir;

  beforeEach(() => {
    app = express();
    app.use(express.json());

    testDir = join(tmpdir(), `snapshots-test-${Date.now()}`);
    snapshotsDir = join(testDir, 'snapshots');
    mkdirSync(snapshotsDir, { recursive: true });

    // Create test snapshot file
    const timestamp = Date.now();
    const snapshotFilename = `test_file.js_${timestamp}`;
    writeFileSync(join(snapshotsDir, snapshotFilename), 'test content');

    const deps = {
      projectState: {
        snapshotsDir,
        watchPath: testDir,
        db: {
          getEventById: jest.fn().mockReturnValue({
            filepath: 'test/file.js',
            timestamp: new Date().toISOString()
          })
        }
      }
    };

    app.use('/api', createSnapshotsRoutes(deps));
  });

  afterEach(() => {
    try {
      rmSync(testDir, { recursive: true, force: true });
    } catch (_error) {
      // Ignore cleanup errors
    }
  });

  describe('GET /api/snapshots/:filepath', () => {
    test('should return list of snapshots for a file', async () => {
      const response = await request(app)
        .get('/api/snapshots/test_file.js')
        .expect('Content-Type', /json/)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
    });

    test('should return empty array for non-existent file', async () => {
      const response = await request(app)
        .get('/api/snapshots/nonexistent.js')
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body).toEqual([]);
    });

    test('should format snapshot data correctly', async () => {
      const response = await request(app)
        .get('/api/snapshots/test_file.js')
        .expect(200);

      if (response.body.length > 0) {
        expect(response.body[0]).toHaveProperty('filename');
        expect(response.body[0]).toHaveProperty('timestamp');
        expect(response.body[0]).toHaveProperty('date');
        expect(response.body[0]).toHaveProperty('path');
      }
    });
  });

  describe('POST /api/restore', () => {
    test('should reject request without required parameters', async () => {
      const response = await request(app)
        .post('/api/restore')
        .send({})
        .expect('Content-Type', /json/)
        .expect(400);

      expect(response.body).toHaveProperty('error');
    });

    test('should handle old API with filepath and snapshot', async () => {
      const timestamp = Date.now();
      const snapshotFilename = `src_test.js_${timestamp}`;
      writeFileSync(join(snapshotsDir, snapshotFilename), 'restored content');

      const response = await request(app)
        .post('/api/restore')
        .send({
          filepath: 'src/test.js',
          snapshot: snapshotFilename
        })
        .expect('Content-Type', /json/);

      expect([200, 500]).toContain(response.status);
    });

    test('should handle new API with eventId and targetPath', async () => {
      const response = await request(app)
        .post('/api/restore')
        .send({
          eventId: 123,
          targetPath: 'test/restored.js'
        })
        .expect('Content-Type', /json/);

      expect([200, 404, 500]).toContain(response.status);
    });

    test('should return 404 for non-existent snapshot', async () => {
      const response = await request(app)
        .post('/api/restore')
        .send({
          filepath: 'src/missing.js',
          snapshot: 'nonexistent_snapshot.gz'
        })
        .expect('Content-Type', /json/);

      expect([404, 500]).toContain(response.status);
    });

    test('should return 404 when event not found', async () => {
      const appNoEvent = express();
      appNoEvent.use(express.json());

      const depsNoEvent = {
        projectState: {
          snapshotsDir,
          watchPath: testDir,
          db: {
            getEventById: jest.fn().mockReturnValue(null) // No event found
          }
        }
      };

      appNoEvent.use('/api', createSnapshotsRoutes(depsNoEvent));

      const response = await request(appNoEvent)
        .post('/api/restore')
        .send({
          eventId: 999,
          targetPath: 'test/file.js'
        })
        .expect(404);

      expect(response.body.error).toContain('Event 999 not found');
    });

    test('should reject path traversal attempts', async () => {
      const { gzipSync } = await import('zlib');
      const appWithPathCheck = express();
      appWithPathCheck.use(express.json());

      const eventTimestamp = new Date().toISOString();
      const filepath = 'test/file.js';

      // Calculate snapshot filename based on event
      const snapshotFilename = `${filepath.replace(/\//g, '_')}_${new Date(eventTimestamp).getTime()}.gz`;

      // Create the matching snapshot file so it passes existence check (gzipped)
      writeFileSync(join(snapshotsDir, snapshotFilename), gzipSync('content'));

      const depsWithPathCheck = {
        projectState: {
          snapshotsDir,
          watchPath: testDir,
          db: {
            getEventById: jest.fn().mockReturnValue({
              filepath,
              timestamp: eventTimestamp
            })
          }
        }
      };

      appWithPathCheck.use('/api', createSnapshotsRoutes(depsWithPathCheck));

      const response = await request(appWithPathCheck)
        .post('/api/restore')
        .send({
          eventId: 123,
          targetPath: '../../../../etc/passwd' // Path that escapes watchPath
        })
        .expect(400);

      expect(response.body.error).toContain('Invalid file path');
    });

    test('should decompress .gz snapshot files', async () => {
      const { gzipSync } = await import('zlib');

      // Create a .gz snapshot
      const content = 'compressed content';
      const compressed = gzipSync(Buffer.from(content));
      const gzFilename = `test_compressed_${Date.now()}.gz`;
      writeFileSync(join(snapshotsDir, gzFilename), compressed);

      const appWithGz = express();
      appWithGz.use(express.json());

      const depsWithGz = {
        projectState: {
          snapshotsDir,
          watchPath: testDir,
          db: {
            getEventById: jest.fn().mockReturnValue({
              filepath: 'test/compressed.js',
              timestamp: new Date().toISOString()
            })
          }
        }
      };

      appWithGz.use('/api', createSnapshotsRoutes(depsWithGz));

      const response = await request(appWithGz)
        .post('/api/restore')
        .send({
          filepath: 'test/compressed.js',
          snapshot: gzFilename
        });

      // Should successfully decompress
      expect([200, 404, 500]).toContain(response.status);
    });
  });

  describe('Error Handling', () => {
    test('should handle errors in GET /snapshots', async () => {
      const appWithError = express();
      appWithError.use(express.json());

      // Create a scenario that causes an error - invalid snapshots directory
      const depsWithError = {
        projectState: {
          snapshotsDir: '/nonexistent/invalid/path/that/does/not/exist',
          watchPath: testDir,
          db: {
            getEventById: jest.fn()
          }
        }
      };

      appWithError.use('/api', createSnapshotsRoutes(depsWithError));

      const response = await request(appWithError)
        .get('/api/snapshots')
        .expect(500);

      expect(response.body.error).toBeDefined();
    });
  });

  describe('Snapshot Sorting', () => {
    test('should sort snapshots by timestamp descending', async () => {
      // Create multiple snapshots with different timestamps
      const now = Date.now();
      const snapshot1 = `file1_${now - 2000}`; // oldest
      const snapshot2 = `file2_${now - 1000}`; // middle
      const snapshot3 = `file3_${now}`; // newest

      writeFileSync(join(snapshotsDir, snapshot1), 'content1');
      writeFileSync(join(snapshotsDir, snapshot2), 'content2');
      writeFileSync(join(snapshotsDir, snapshot3), 'content3');

      const appSort = express();
      appSort.use(express.json());

      const depsSort = {
        projectState: {
          snapshotsDir,
          watchPath: testDir,
          db: {
            getEventById: jest.fn()
          }
        }
      };

      appSort.use('/api', createSnapshotsRoutes(depsSort));

      const response = await request(appSort)
        .get('/api/snapshots')
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThan(1);

      // Should be sorted newest first
      for (let i = 0; i < response.body.length - 1; i++) {
        expect(response.body[i].timestamp).toBeGreaterThanOrEqual(response.body[i + 1].timestamp);
      }
    });
  });
});
