/**
 * Integration Tests for Database Concurrency
 * Tests database operations under load and concurrent access
 */

import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { join } from 'path';
import { existsSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { RavenDB } from '../../db.js';

const TEST_DB_PATH = join(tmpdir(), 'test-db-concurrency.db');

describe('Database Concurrency Integration', () => {
  let db;

  beforeEach(() => {
    // Remove existing test database (ignore errors if file doesn't exist)
    try {
      if (existsSync(TEST_DB_PATH)) rmSync(TEST_DB_PATH);
    } catch (e) {
      /* ignore */
    }
    try {
      if (existsSync(`${TEST_DB_PATH}-shm`)) rmSync(`${TEST_DB_PATH}-shm`);
    } catch (e) {
      /* ignore */
    }
    try {
      if (existsSync(`${TEST_DB_PATH}-wal`)) rmSync(`${TEST_DB_PATH}-wal`);
    } catch (e) {
      /* ignore */
    }

    // Create new database
    db = new RavenDB(TEST_DB_PATH);
  });

  afterEach(() => {
    if (db && !db.closed) {
      db.close();
    }

    // Clean up test database (ignore errors if file doesn't exist)
    try {
      if (existsSync(TEST_DB_PATH)) rmSync(TEST_DB_PATH);
    } catch (e) {
      /* ignore */
    }
    try {
      if (existsSync(`${TEST_DB_PATH}-shm`)) rmSync(`${TEST_DB_PATH}-shm`);
    } catch (e) {
      /* ignore */
    }
    try {
      if (existsSync(`${TEST_DB_PATH}-wal`)) rmSync(`${TEST_DB_PATH}-wal`);
    } catch (e) {
      /* ignore */
    }
  });

  test('should handle concurrent inserts without errors', async () => {
    const insertPromises = [];

    // Insert 100 events concurrently
    for (let i = 0; i < 100; i++) {
      const promise = new Promise((resolve, reject) => {
        try {
          const id = db.insertEvent({
            timestamp: new Date().toISOString(),
            filepath: `/test/file${i}.js`,
            change_type: 'modified',
            diff: `test diff ${i}`,
            session_id: 'test-session',
            file_hash: `hash${i}`,
            event_size: 100 + i
          });
          resolve(id);
        } catch (error) {
          reject(error);
        }
      });

      insertPromises.push(promise);
    }

    // All inserts should succeed
    const results = await Promise.all(insertPromises);
    expect(results).toHaveLength(100);
    expect(results.every(id => typeof id === 'number')).toBe(true);

    // Verify all events were inserted
    const events = db.getRecentFileEvents(200);
    expect(events.length).toBe(100);
  });

  test('should handle concurrent reads and writes', async () => {
    // Pre-populate with some data
    for (let i = 0; i < 50; i++) {
      db.insertEvent({
        timestamp: new Date().toISOString(),
        filepath: `/test/file${i}.js`,
        change_type: 'modified',
        session_id: 'test-session'
      });
    }

    const operations = [];

    // Mix of reads and writes
    for (let i = 0; i < 50; i++) {
      // Read operations
      operations.push(
        new Promise(resolve => {
          const events = db.getRecentFileEvents(10);
          resolve(events);
        })
      );

      // Write operations
      operations.push(
        new Promise(resolve => {
          const id = db.insertEvent({
            timestamp: new Date().toISOString(),
            filepath: `/test/new-file${i}.js`,
            change_type: 'created',
            session_id: 'test-session'
          });
          resolve(id);
        })
      );
    }

    // All operations should complete without errors
    const results = await Promise.all(operations);
    expect(results).toHaveLength(100);
  });

  test('should not allow operations after close', () => {
    db.close();

    expect(() => {
      db.insertEvent({
        timestamp: new Date().toISOString(),
        filepath: '/test/file.js',
        change_type: 'modified',
        session_id: 'test-session'
      });
    }).toThrow('Cannot prepare statement: Database is closed');
  });

  test('should allow multiple close calls safely', () => {
    expect(() => {
      db.close();
      db.close();
      db.close();
    }).not.toThrow();

    expect(db.closed).toBe(true);
  });

  test('should handle large batch inserts efficiently', () => {
    const startTime = Date.now();
    const batchSize = 1000;

    for (let i = 0; i < batchSize; i++) {
      db.insertEvent({
        timestamp: new Date().toISOString(),
        filepath: `/test/file${i}.js`,
        change_type: 'modified',
        diff: 'a'.repeat(1000), // 1KB diff
        session_id: 'test-session',
        file_hash: `hash${i}`,
        event_size: 1000
      });
    }

    const duration = Date.now() - startTime;

    // Should complete in reasonable time (< 5 seconds for 1000 inserts)
    expect(duration).toBeLessThan(5000);

    // Verify all inserted
    const events = db.getRecentFileEvents(batchSize + 10);
    expect(events.length).toBe(batchSize);
  });

  test('should maintain data integrity under stress', async () => {
    const testData = [];

    // Create test data with unique identifiers
    for (let i = 0; i < 100; i++) {
      testData.push({
        timestamp: new Date().toISOString(),
        filepath: `/test/file${i}.js`,
        change_type: 'modified',
        session_id: `session-${i}`,
        file_hash: `hash-${i}`,
        event_size: i
      });
    }

    // Insert concurrently
    await Promise.all(
      testData.map(
        data =>
          new Promise(resolve => {
            db.insertEvent(data);
            resolve();
          })
      )
    );

    // Verify all data was inserted correctly
    const events = db.getRecentFileEvents(200);
    expect(events.length).toBe(100);

    // Verify data integrity - check filepaths and file hashes
    const filepaths = events.map(e => e.filepath);
    const fileHashes = events.map(e => e.file_hash);

    // All should have unique filepaths and hashes
    expect(new Set(filepaths).size).toBe(100);
    expect(new Set(fileHashes).size).toBe(100);

    // Verify a few sample records in detail
    const sample1 = events.find(e => e.filepath === '/test/file50.js');
    expect(sample1).toBeDefined();
    expect(sample1.file_hash).toBe('hash-50');
    expect(sample1.event_size).toBe(50);

    const sample2 = events.find(e => e.filepath === '/test/file99.js');
    expect(sample2).toBeDefined();
    expect(sample2.file_hash).toBe('hash-99');
    expect(sample2.event_size).toBe(99);
  });
});
