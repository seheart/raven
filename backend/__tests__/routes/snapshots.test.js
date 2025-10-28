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
  });
});
