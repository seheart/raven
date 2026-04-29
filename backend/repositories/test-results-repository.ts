/**
 * Test Results Repository — owns the `test_results` table.
 */

import type { RavenDB } from '../db.js';

interface TestResultRow {
  id: number;
  timestamp: string;
  framework: string;
  passed: number;
  total_tests: number;
  passed_tests: number;
  failed_tests: number;
  skipped_tests: number;
  duration: number;
  output: string;
  failures: string;
  session_id: string;
}

export interface TestResultsRepository {
  insert(
    timestamp: string,
    framework: string,
    passed: boolean,
    totalTests: number,
    passedTests: number,
    failedTests: number,
    skippedTests: number,
    duration: number,
    output: string,
    failures: string,
    sessionId: string
  ): number;
  list(limit?: number): TestResultRow[];
  latest(): TestResultRow | null;
  byFramework(framework: string, limit?: number): TestResultRow[];
  countFailed(): number;
}

export function createTestResultsRepository(db: RavenDB): TestResultsRepository {
  return {
    insert(timestamp, framework, passed, totalTests, passedTests, failedTests, skippedTests, duration, output, failures, sessionId) {
      const result = db.db
        .prepare(
          `INSERT INTO test_results (timestamp, framework, passed, total_tests, passed_tests, failed_tests, skipped_tests, duration, output, failures, session_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          timestamp,
          framework,
          passed ? 1 : 0,
          totalTests,
          passedTests,
          failedTests,
          skippedTests,
          duration,
          output,
          failures,
          sessionId
        );
      return result.lastInsertRowid as number;
    },

    list(limit = 50) {
      return db.db
        .prepare(`SELECT * FROM test_results ORDER BY timestamp DESC LIMIT ?`)
        .all(limit) as TestResultRow[];
    },

    latest() {
      return (db.db
        .prepare(`SELECT * FROM test_results ORDER BY timestamp DESC LIMIT 1`)
        .get() as TestResultRow) || null;
    },

    byFramework(framework, limit = 20) {
      return db.db
        .prepare(
          `SELECT * FROM test_results WHERE framework = ?
           ORDER BY timestamp DESC LIMIT ?`
        )
        .all(framework, limit) as TestResultRow[];
    },

    countFailed() {
      const row = db.db
        .prepare(`SELECT COUNT(*) as count FROM test_results WHERE passed = 0`)
        .get() as { count: number } | undefined;
      return row?.count ?? 0;
    }
  };
}
