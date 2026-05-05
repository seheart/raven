/**
 * Tests for RavenDB Operations
 * Core database CRUD operations and queries
 */

import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import { RavenDB } from '../../dist/db.js';
import { createSyntaxErrorsRepository } from '../../dist/repositories/syntax-errors-repository.js';
import { createPatternWarningsRepository } from '../../dist/repositories/pattern-warnings-repository.js';
import { createAgentEventsRepository } from '../../dist/repositories/agent-events-repository.js';
import { createFileEventsRepository } from '../../dist/repositories/file-events-repository.js';
import { createMetricsRepository } from '../../dist/repositories/metrics-repository.js';
import { createDashboardRepository } from '../../dist/repositories/dashboard-repository.js';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

let db;
let syntaxErrorsRepo;
let patternWarningsRepo;
let agentEventsRepo;
let fileEventsRepo;
let metricsRepo;
let dashboardRepo;
let tmpDir;

beforeAll(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'raven-db-test-'));
  db = new RavenDB(join(tmpDir, 'test.db'));
  syntaxErrorsRepo = createSyntaxErrorsRepository(db);
  patternWarningsRepo = createPatternWarningsRepository(db);
  agentEventsRepo = createAgentEventsRepository(db);
  fileEventsRepo = createFileEventsRepository(db);
  metricsRepo = createMetricsRepository(db);
  dashboardRepo = createDashboardRepository(db);
});

afterAll(() => {
  if (db) db.close();
  if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
});

describe('RavenDB - File Events', () => {
  test('insertEvent returns an ID', () => {
    const id = fileEventsRepo.insert(
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
    const id = fileEventsRepo.insert(
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
    const events = fileEventsRepo.recent(10);
    expect(events.length).toBeGreaterThanOrEqual(2);
    expect(events[0]).toHaveProperty('filepath');
    expect(events[0]).toHaveProperty('change_type');
    expect(events[0]).toHaveProperty('timestamp');
  });

  test('getRecentFileEvents respects limit', () => {
    const events = fileEventsRepo.recent(1);
    expect(events.length).toBe(1);
  });

  test('getEventsBySession returns events for a specific session', () => {
    const events = fileEventsRepo.bySession('session-1');
    expect(events.length).toBe(1);
    expect(events[0].filepath).toBe('/src/app.js');
  });

  test('getEventsBySession returns empty array for unknown session', () => {
    const events = fileEventsRepo.bySession('nonexistent');
    expect(events).toEqual([]);
  });

  test('getTrackedFiles returns distinct filepaths', () => {
    const files = fileEventsRepo.trackedFiles();
    expect(files).toContain('/src/app.js');
    expect(files).toContain('/src/index.js');
    // Should be unique
    expect(new Set(files).size).toBe(files.length);
  });
});

describe('AgentEventsRepository', () => {
  test('insert returns an ID', () => {
    const id = agentEventsRepo.insert(
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

  test('recent returns events', () => {
    const events = agentEventsRepo.recent(10);
    expect(events.length).toBeGreaterThanOrEqual(1);
    expect(events[0]).toHaveProperty('agent');
    expect(events[0]).toHaveProperty('event_type');
    expect(events[0]).toHaveProperty('message');
  });

  test('byAgent filters by agent name', () => {
    agentEventsRepo.insert(
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

    const claudeEvents = agentEventsRepo.byAgent('claude-sonnet', 10);
    expect(claudeEvents.every(e => e.agent === 'claude-sonnet')).toBe(true);

    const gptEvents = agentEventsRepo.byAgent('gpt-4', 10);
    expect(gptEvents.every(e => e.agent === 'gpt-4')).toBe(true);
  });

  test('totals returns aggregated stats', () => {
    const stats = agentEventsRepo.totals();
    expect(stats.length).toBeGreaterThanOrEqual(2);
    expect(stats[0]).toHaveProperty('agent');
    expect(stats[0]).toHaveProperty('event_count');
    expect(stats[0]).toHaveProperty('avg_duration_ms');
    expect(stats[0]).toHaveProperty('total_lines_changed');
  });
});

describe('RavenDB - System Metrics', () => {
  test('insertSystemMetrics stores metrics', () => {
    metricsRepo.insertSystemMetrics(
      new Date().toISOString(),
      25.5,
      45.0,
      8192,
      16384,
      1000,
      2000,
      'session-1'
    );

    const metrics = metricsRepo.recentSystemMetrics(1);
    expect(metrics.length).toBe(1);
    expect(metrics[0].cpu_percent).toBe(25.5);
    expect(metrics[0].memory_percent).toBe(45.0);
  });

  test('getRecentSystemMetrics respects limit', () => {
    // Insert a few more
    for (let i = 0; i < 5; i++) {
      metricsRepo.insertSystemMetrics(
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

    const metrics = metricsRepo.recentSystemMetrics(3);
    expect(metrics.length).toBe(3);
  });

  test('getMetricsStats returns aggregated statistics', () => {
    const start = new Date(Date.now() - 3600000).toISOString();
    const end = new Date(Date.now() + 60000).toISOString();
    const stats = metricsRepo.metricsStats(start, end);

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
    const correlations = dashboardRepo.correlateEventsWithMetrics(60);
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
    const correlations = dashboardRepo.correlateEventsWithMetrics(3600);
    expect(correlations.length).toBeLessThanOrEqual(20);
  });
});

describe('RavenDB - Dashboard Stats', () => {
  test('getDashboardStats returns complete stats object', () => {
    const stats = dashboardRepo.dashboardStats('session-1');
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
    const stats = dashboardRepo.dashboardStats('session-1', 'my-project');
    expect(stats.total_events).toBeGreaterThan(0);

    const noProjectStats = dashboardRepo.dashboardStats('session-1', 'nonexistent-project');
    expect(noProjectStats.total_events).toBe(0);
  });

  test('getTopModifiedFiles returns sorted results', () => {
    // Insert multiple file events for the same file (events table backs this query)
    for (let i = 0; i < 3; i++) {
      fileEventsRepo.insert(
        new Date().toISOString(),
        '/src/hot-file.js',
        'modified',
        '+ added line',
        5.0,
        30.0,
        'session-1',
        'abc123',
        100,
        'my-project'
      );
    }

    const topFiles = dashboardRepo.getTopModifiedFiles('my-project', 5);
    expect(Array.isArray(topFiles)).toBe(true);
    if (topFiles.length > 0) {
      expect(topFiles[0]).toHaveProperty('filepath');
      expect(topFiles[0]).toHaveProperty('edit_count');
    }
    if (topFiles.length > 1) {
      expect(topFiles[0].edit_count).toBeGreaterThanOrEqual(topFiles[1].edit_count);
    }
  });

  test('getLongestEdits returns edits sorted by lines_changed', () => {
    const edits = dashboardRepo.longestEdits(5);
    expect(Array.isArray(edits)).toBe(true);
    if (edits.length > 1) {
      expect(edits[0].lines_changed).toBeGreaterThanOrEqual(edits[1].lines_changed);
    }
  });
});

describe('SyntaxErrorsRepository', () => {
  let errorId;

  test('insert stores error', () => {
    errorId = syntaxErrorsRepo.insert(
      new Date().toISOString(),
      '/src/broken.js',
      10,
      undefined,
      'Unexpected token',
      'error',
      'javascript',
      undefined
    );
    expect(errorId).toBeGreaterThan(0);
  });

  test('list returns errors', () => {
    const errors = syntaxErrorsRepo.list(10);
    expect(errors.length).toBeGreaterThanOrEqual(1);
    expect(errors[0]).toHaveProperty('filepath');
    expect(errors[0]).toHaveProperty('message');
  });

  test('resolveById marks error as resolved', () => {
    syntaxErrorsRepo.resolveById(errorId);
    const errors = syntaxErrorsRepo.list(10);
    const found = errors.find(e => e.id === errorId);
    expect(found).toBeUndefined();
  });

  test('countUnresolved returns correct count', () => {
    syntaxErrorsRepo.insert(
      new Date().toISOString(),
      '/src/also-broken.js',
      5,
      undefined,
      'Missing semicolon',
      'warning',
      'typescript',
      undefined
    );
    const count = syntaxErrorsRepo.countUnresolved();
    expect(count).toBeGreaterThanOrEqual(1);
  });
});

describe('PatternWarningsRepository', () => {
  test('insert stores warning', () => {
    const id = patternWarningsRepo.insert(
      new Date().toISOString(),
      '/src/app.js',
      15,
      'console-log',
      'Console Log Detected',
      'low',
      'code-quality',
      'console.log("debug")',
      'found in production code',
      undefined
    );
    expect(id).toBeGreaterThan(0);
  });

  test('list returns warnings', () => {
    const warnings = patternWarningsRepo.list(10);
    expect(warnings.length).toBeGreaterThanOrEqual(1);
    expect(warnings[0]).toHaveProperty('filepath');
    expect(warnings[0]).toHaveProperty('category');
    expect(warnings[0]).toHaveProperty('severity');
  });

  test('countUnresolved returns count', () => {
    const count = patternWarningsRepo.countUnresolved();
    expect(count).toBeGreaterThanOrEqual(1);
  });
});
