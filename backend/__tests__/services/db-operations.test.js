/**
 * Tests for RavenDB Operations
 * Core database CRUD operations and queries
 */

import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import { RavenDB } from '../../dist/db.js';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

let db;
let tmpDir;

beforeAll(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'raven-db-test-'));
  db = new RavenDB(join(tmpDir, 'test.db'));
});

afterAll(() => {
  if (db) db.close();
  if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
});

describe('RavenDB - File Events', () => {
  test('insertEvent returns an ID', () => {
    const id = db.insertEvent(
      new Date().toISOString(),
      '/src/app.js',
      'modified',
      '+ added line',
      5.0,
      30.0,
      'session-1',
      'abc123',
      100,
      'my-project',
      'claude'
    );
    expect(typeof id).toBe('number');
    expect(id).toBeGreaterThan(0);
  });

  test('insertEvent with minimal fields', () => {
    const id = db.insertEvent(
      new Date().toISOString(),
      '/src/index.js',
      'created',
      null,
      0,
      0,
      null,
      null,
      null,
      null,
      null
    );
    expect(id).toBeGreaterThan(0);
  });

  test('getRecentFileEvents returns inserted events', () => {
    const events = db.getRecentFileEvents(10);
    expect(events.length).toBeGreaterThanOrEqual(2);
    expect(events[0]).toHaveProperty('filepath');
    expect(events[0]).toHaveProperty('change_type');
    expect(events[0]).toHaveProperty('timestamp');
  });

  test('getRecentFileEvents respects limit', () => {
    const events = db.getRecentFileEvents(1);
    expect(events.length).toBe(1);
  });

  test('getEventsBySession returns events for a specific session', () => {
    const events = db.getEventsBySession('session-1');
    expect(events.length).toBe(1);
    expect(events[0].filepath).toBe('/src/app.js');
  });

  test('getEventsBySession returns empty array for unknown session', () => {
    const events = db.getEventsBySession('nonexistent');
    expect(events).toEqual([]);
  });

  test('getTrackedFiles returns distinct filepaths', () => {
    const files = db.getTrackedFiles();
    expect(files).toContain('/src/app.js');
    expect(files).toContain('/src/index.js');
    // Should be unique
    expect(new Set(files).size).toBe(files.length);
  });
});

describe('RavenDB - Agent Events', () => {
  test('insertAgentEvent returns an ID', () => {
    const id = db.insertAgentEvent(
      new Date().toISOString(),
      'claude-sonnet',
      'file-edit',
      '/src/app.js',
      42,
      1500,
      'Modified app.js',
      { tool: 'edit' },
      'session-1',
      'my-project'
    );
    expect(id).toBeGreaterThan(0);
  });

  test('getRecentAgentEvents returns events', () => {
    const events = db.getRecentAgentEvents(10);
    expect(events.length).toBeGreaterThanOrEqual(1);
    expect(events[0]).toHaveProperty('agent');
    expect(events[0]).toHaveProperty('event_type');
    expect(events[0]).toHaveProperty('message');
  });

  test('getEventsByAgent filters by agent name', () => {
    // Insert another agent's event
    db.insertAgentEvent(
      new Date().toISOString(),
      'gpt-4',
      'file-edit',
      '/src/other.js',
      10,
      500,
      'Modified other.js',
      null,
      'session-2',
      null
    );

    const claudeEvents = db.getEventsByAgent('claude-sonnet', 10);
    expect(claudeEvents.every(e => e.agent === 'claude-sonnet')).toBe(true);

    const gptEvents = db.getEventsByAgent('gpt-4', 10);
    expect(gptEvents.every(e => e.agent === 'gpt-4')).toBe(true);
  });

  test('getAgentStats returns aggregated stats', () => {
    const stats = db.getAgentStats();
    expect(stats.length).toBeGreaterThanOrEqual(2);
    expect(stats[0]).toHaveProperty('agent');
    expect(stats[0]).toHaveProperty('event_count');
    expect(stats[0]).toHaveProperty('avg_duration_ms');
    expect(stats[0]).toHaveProperty('total_lines_changed');
  });
});

describe('RavenDB - System Metrics', () => {
  test('insertSystemMetrics stores metrics', () => {
    db.insertSystemMetrics(
      new Date().toISOString(),
      25.5,
      45.0,
      8192,
      16384,
      1000,
      2000,
      'session-1'
    );

    const metrics = db.getRecentSystemMetrics(1);
    expect(metrics.length).toBe(1);
    expect(metrics[0].cpu_percent).toBe(25.5);
    expect(metrics[0].memory_percent).toBe(45.0);
  });

  test('getRecentSystemMetrics respects limit', () => {
    // Insert a few more
    for (let i = 0; i < 5; i++) {
      db.insertSystemMetrics(
        new Date(Date.now() + i * 1000).toISOString(),
        10 + i,
        50 + i,
        8192,
        16384,
        null,
        null,
        'session-1'
      );
    }

    const metrics = db.getRecentSystemMetrics(3);
    expect(metrics.length).toBe(3);
  });

  test('getMetricsStats returns aggregated statistics', () => {
    const start = new Date(Date.now() - 3600000).toISOString();
    const end = new Date(Date.now() + 60000).toISOString();
    const stats = db.getMetricsStats(start, end);

    expect(stats).toHaveProperty('avg_cpu_percent');
    expect(stats).toHaveProperty('max_cpu_percent');
    expect(stats).toHaveProperty('avg_memory_percent');
    expect(stats).toHaveProperty('max_memory_percent');
    expect(stats).toHaveProperty('sample_count');
    expect(stats.sample_count).toBeGreaterThan(0);
  });
});

describe('RavenDB - Performance Correlations', () => {
  test('correlateEventsWithMetrics returns correlations', () => {
    const correlations = db.correlateEventsWithMetrics(60);
    expect(Array.isArray(correlations)).toBe(true);
    if (correlations.length > 0) {
      expect(correlations[0]).toHaveProperty('event_id');
      expect(correlations[0]).toHaveProperty('event_timestamp');
      expect(correlations[0]).toHaveProperty('filepath');
      expect(correlations[0]).toHaveProperty('cpu_percent');
      expect(correlations[0]).toHaveProperty('mem_percent');
    }
  });

  test('correlateEventsWithMetrics returns at most 20 results', () => {
    const correlations = db.correlateEventsWithMetrics(3600);
    expect(correlations.length).toBeLessThanOrEqual(20);
  });
});

describe('RavenDB - Dashboard Stats', () => {
  test('getDashboardStats returns complete stats object', () => {
    const stats = db.getDashboardStats('session-1');
    expect(stats).toHaveProperty('total_events');
    expect(stats).toHaveProperty('total_files');
    expect(stats).toHaveProperty('creates');
    expect(stats).toHaveProperty('edits');
    expect(stats).toHaveProperty('deletes');
    expect(stats).toHaveProperty('session_duration_seconds');
    expect(stats).toHaveProperty('active_files_today');
    expect(stats.total_events).toBeGreaterThan(0);
  });

  test('getDashboardStats with project filter', () => {
    const stats = db.getDashboardStats('session-1', 'my-project');
    expect(stats.total_events).toBeGreaterThan(0);

    const noProjectStats = db.getDashboardStats('session-1', 'nonexistent-project');
    expect(noProjectStats.total_events).toBe(0);
  });

  test('getTopModifiedFiles returns sorted results', () => {
    // Insert multiple events for the same file
    for (let i = 0; i < 3; i++) {
      db.insertAgentEvent(
        new Date().toISOString(),
        'claude-sonnet',
        'file-edit',
        '/src/hot-file.js',
        10,
        100,
        'Edit hot-file',
        null,
        'session-1',
        null
      );
    }

    const topFiles = db.getTopModifiedFiles('session-1', 5);
    expect(topFiles.length).toBeGreaterThan(0);
    expect(topFiles[0]).toHaveProperty('filepath');
    expect(topFiles[0]).toHaveProperty('edit_count');
    // Should be sorted descending by edit_count
    if (topFiles.length > 1) {
      expect(topFiles[0].edit_count).toBeGreaterThanOrEqual(topFiles[1].edit_count);
    }
  });

  test('getLongestEdits returns edits sorted by lines_changed', () => {
    const edits = db.getLongestEdits(5);
    expect(Array.isArray(edits)).toBe(true);
    if (edits.length > 1) {
      expect(edits[0].lines_changed).toBeGreaterThanOrEqual(edits[1].lines_changed);
    }
  });
});

describe('RavenDB - Syntax Errors', () => {
  let errorId;

  test('insertSyntaxError stores error', () => {
    errorId = db.insertSyntaxError(
      new Date().toISOString(),
      '/src/broken.js',
      10,
      undefined, // column_number
      'Unexpected token',
      'error',
      'javascript',
      undefined // session_id
    );
    expect(errorId).toBeGreaterThan(0);
  });

  test('getSyntaxErrors returns errors', () => {
    const errors = db.getSyntaxErrors(10);
    expect(errors.length).toBeGreaterThanOrEqual(1);
    expect(errors[0]).toHaveProperty('filepath');
    expect(errors[0]).toHaveProperty('message');
  });

  test('resolveSyntaxError marks error as resolved', () => {
    db.resolveSyntaxError(errorId);
    // getSyntaxErrors only returns unresolved errors (resolved = 0)
    const errors = db.getSyntaxErrors(10);
    const found = errors.find(e => e.id === errorId);
    expect(found).toBeUndefined(); // Should not appear in unresolved list
  });

  test('getUnresolvedSyntaxErrorCount returns correct count', () => {
    db.insertSyntaxError(
      new Date().toISOString(),
      '/src/also-broken.js',
      5,
      undefined,
      'Missing semicolon',
      'warning',
      'typescript',
      undefined
    );
    const count = db.getUnresolvedSyntaxErrorCount();
    expect(count).toBeGreaterThanOrEqual(1);
  });
});

describe('RavenDB - Pattern Warnings', () => {
  test('insertPatternWarning stores warning', () => {
    const id = db.insertPatternWarning(
      new Date().toISOString(),
      '/src/app.js',
      15, // line_number
      'console-log', // pattern_id
      'Console Log Detected', // pattern_name
      'low', // severity
      'code-quality', // category
      'console.log("debug")', // match_text
      'found in production code', // context
      undefined // session_id
    );
    expect(id).toBeGreaterThan(0);
  });

  test('getPatternWarnings returns warnings', () => {
    const warnings = db.getPatternWarnings(10);
    expect(warnings.length).toBeGreaterThanOrEqual(1);
    expect(warnings[0]).toHaveProperty('filepath');
    expect(warnings[0]).toHaveProperty('category');
    expect(warnings[0]).toHaveProperty('severity');
  });

  test('getUnresolvedPatternWarningCount returns count', () => {
    const count = db.getUnresolvedPatternWarningCount();
    expect(count).toBeGreaterThanOrEqual(1);
  });
});
