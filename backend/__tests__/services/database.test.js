/**
 * Tests for Database Configuration and Resilience
 */

import { describe, test, expect, afterEach } from '@jest/globals';
import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('Database Configuration', () => {
  let tmpDir;
  let db;

  afterEach(() => {
    if (db) {
      try { db.close(); } catch {}
    }
    if (tmpDir) {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('should use WAL journal mode', () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'raven-test-'));
    db = new Database(join(tmpDir, 'test.db'));
    db.pragma('journal_mode = WAL');

    const result = db.pragma('journal_mode');
    expect(result[0].journal_mode).toBe('wal');
  });

  test('should have busy_timeout configured', () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'raven-test-'));
    db = new Database(join(tmpDir, 'test.db'));
    db.pragma('busy_timeout = 5000');

    const result = db.pragma('busy_timeout');
    expect(result[0].timeout).toBe(5000);
  });

  test('should handle concurrent reads without locking errors', () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'raven-test-'));
    const dbPath = join(tmpDir, 'test.db');
    db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    db.pragma('busy_timeout = 5000');

    db.exec('CREATE TABLE test (id INTEGER PRIMARY KEY, value TEXT)');
    db.exec("INSERT INTO test VALUES (1, 'hello')");

    // Open a second connection (simulates concurrent access)
    const db2 = new Database(dbPath);
    db2.pragma('journal_mode = WAL');
    db2.pragma('busy_timeout = 5000');

    // Both should be able to read simultaneously
    const result1 = db.prepare('SELECT * FROM test').all();
    const result2 = db2.prepare('SELECT * FROM test').all();

    expect(result1).toEqual(result2);
    expect(result1.length).toBe(1);

    db2.close();
  });

  test('should handle concurrent write then read without errors', () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'raven-test-'));
    const dbPath = join(tmpDir, 'test.db');
    db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    db.pragma('busy_timeout = 5000');

    db.exec('CREATE TABLE test (id INTEGER PRIMARY KEY, value TEXT)');

    // Write from connection 1
    db.prepare("INSERT INTO test VALUES (1, 'from_conn1')").run();

    // Read from connection 2 should see the write
    const db2 = new Database(dbPath);
    db2.pragma('journal_mode = WAL');
    db2.pragma('busy_timeout = 5000');

    const result = db2.prepare('SELECT * FROM test WHERE id = 1').get();
    expect(result.value).toBe('from_conn1');

    db2.close();
  });
});
