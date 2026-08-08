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
import {
  createErrorsRepository,
  ERROR_BADGE_WINDOW_DAYS
} from '../../dist/repositories/errors-repository.js';
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
let errorsRepo;
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
  errorsRepo = createErrorsRepository(db);
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

  // Regression: the events table grew an `agent_source` column for agent
  // attribution. Earlier the repo's insert dropped the column on the floor
  // and downstream queries returned undefined. Round-trip ensures both the
  // write and the read paths still wire the field through.
  test('insert + byId round-trips agent_source', () => {
    const id = fileEventsRepo.insert(
      new Date().toISOString(),
      '/src/attr.js',
      'modified',
      null,
      null,
      null,
      'sess-attr',
      null,
      null,
      'attr-proj',
      'claude-code'
    );
    expect(id).toBeGreaterThan(0);

    const row = fileEventsRepo.byId(id);
    expect(row).toBeDefined();
    expect(row.agent_source).toBe('claude-code');
    expect(row.project_name).toBe('attr-proj');
    expect(row.session_id).toBe('sess-attr');
  });

  // Regression: bySession() previously projected only legacy columns and
  // dropped project_name and agent_source from the result set, so anything
  // reading those off the row got undefined. session_id is intentionally
  // not re-projected (it's the query parameter — caller already has it).
  test('bySession returns project_name and agent_source on each row', () => {
    fileEventsRepo.insert(
      new Date().toISOString(),
      '/src/bs.js',
      'modified',
      '+ x',
      0,
      0,
      'sess-bys',
      null,
      null,
      'bys-proj',
      'claude'
    );
    const rows = fileEventsRepo.bySession('sess-bys');
    expect(rows.length).toBeGreaterThan(0);
    const r = rows[0];
    expect(r).toHaveProperty('project_name', 'bys-proj');
    expect(r).toHaveProperty('agent_source', 'claude');
    expect(r.filepath).toBe('/src/bs.js');
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

  // Regression (commit b5a52fc): toolBreakdown was previously a single global
  // GROUP BY across all agents. The route would assign the same global top
  // list to every agent row. The fix groups by (agent, message) so each
  // agent's breakdown reflects only its own tool calls.
  test('toolBreakdown groups by agent, not globally', () => {
    const ts = () => new Date().toISOString();
    // Agent X: Read x2, Glob x1.
    agentEventsRepo.insert(
      ts(),
      'agent-X',
      'tool_call',
      null,
      null,
      null,
      'Read call',
      null,
      'sX',
      'tb-proj'
    );
    agentEventsRepo.insert(
      ts(),
      'agent-X',
      'tool_call',
      null,
      null,
      null,
      'Read call',
      null,
      'sX',
      'tb-proj'
    );
    agentEventsRepo.insert(
      ts(),
      'agent-X',
      'tool_call',
      null,
      null,
      null,
      'Glob call',
      null,
      'sX',
      'tb-proj'
    );
    // Agent Y: TodoWrite x2, Grep x1 — fully disjoint tool set.
    agentEventsRepo.insert(
      ts(),
      'agent-Y',
      'tool_call',
      null,
      null,
      null,
      'TodoWrite call',
      null,
      'sY',
      'tb-proj'
    );
    agentEventsRepo.insert(
      ts(),
      'agent-Y',
      'tool_call',
      null,
      null,
      null,
      'TodoWrite call',
      null,
      'sY',
      'tb-proj'
    );
    agentEventsRepo.insert(
      ts(),
      'agent-Y',
      'tool_call',
      null,
      null,
      null,
      'Grep call',
      null,
      'sY',
      'tb-proj'
    );

    const rows = agentEventsRepo.toolBreakdown();
    const byAgent = new Map();
    for (const r of rows) {
      if (!byAgent.has(r.agent)) byAgent.set(r.agent, []);
      byAgent.get(r.agent).push(r);
    }

    const xMsgs = (byAgent.get('agent-X') || []).map(r => r.message).sort();
    const yMsgs = (byAgent.get('agent-Y') || []).map(r => r.message).sort();
    expect(xMsgs).toEqual(['Glob call', 'Read call']);
    expect(yMsgs).toEqual(['Grep call', 'TodoWrite call']);

    // Counts must be per-agent, not global. Read appears twice on X but
    // never on Y — a global GROUP BY would have shown the same row count
    // for every agent.
    const xRead = byAgent.get('agent-X').find(r => r.message === 'Read call');
    expect(xRead.count).toBe(2);
    const yRead = (byAgent.get('agent-Y') || []).find(r => r.message === 'Read call');
    expect(yRead).toBeUndefined();
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
    expect(stats).toHaveProperty('creates_today');
    expect(stats).toHaveProperty('edits_today');
    expect(stats).toHaveProperty('deletes_today');
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

// Regression (commit f57399f): aggregation queries returned NULL on empty
// databases, which the front-end rendered as a silent "0 events" with no
// indication that there was simply no data yet. The repo must coerce these
// to actual zeros so consumers don't have to special-case nullish numerics.
describe('Dashboard aggregations on an empty database', () => {
  let emptyDb;
  let emptyDashboardRepo;
  let emptyDir;

  beforeAll(() => {
    emptyDir = mkdtempSync(join(tmpdir(), 'raven-db-empty-'));
    emptyDb = new RavenDB(join(emptyDir, 'empty.db'));
    emptyDashboardRepo = createDashboardRepository(emptyDb);
  });

  afterAll(() => {
    if (emptyDb) emptyDb.close();
    if (emptyDir) rmSync(emptyDir, { recursive: true, force: true });
  });

  test('dashboardStats returns 0 (not null) for every numeric field', () => {
    const stats = emptyDashboardRepo.dashboardStats('no-session');
    const numericFields = [
      'total_events',
      'lifetime_events',
      'lifetime_agent_events',
      'total_files',
      'session_duration_seconds',
      'active_files_today',
      'creates',
      'edits',
      'deletes',
      'creates_today',
      'edits_today',
      'deletes_today',
      'files_avg_14d',
      'cost_today_usd'
    ];
    for (const field of numericFields) {
      expect(stats[field]).not.toBeNull();
      expect(typeof stats[field]).toBe('number');
      expect(stats[field]).toBe(0);
    }
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

describe('ErrorsRepository', () => {
  // Rows are written straight to the table so the timestamp can be backdated —
  // insert() always stamps `now`, which can't exercise the badge window.
  const seed = (timestamp, message) =>
    db.db
      .prepare(
        `INSERT INTO app_errors (timestamp, error_type, message, component, severity)
         VALUES (?, 'Error', ?, 'test', 'error')`
      )
      .run(timestamp, message);

  const daysAgo = n => new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString();

  test('countUnresolved excludes errors older than the badge window', () => {
    seed(daysAgo(1), 'fresh');
    seed(daysAgo(ERROR_BADGE_WINDOW_DAYS + 3), 'stale');

    // Only the fresh one counts — the stale row is still in the table.
    expect(errorsRepo.countUnresolved()).toBe(1);
    expect(errorsRepo.list({ limit: 10, offset: 0 }).total).toBe(2);
  });

  test('resolveAll dismisses every unresolved row without deleting it', () => {
    const resolved = errorsRepo.resolveAll();
    expect(resolved).toBe(2);

    expect(errorsRepo.countUnresolved()).toBe(0);
    expect(errorsRepo.getStats().total).toBe(0);
    // Dismissed, not destroyed.
    expect(errorsRepo.list({ limit: 10, offset: 0 }).total).toBe(2);

    // Nothing left to flip on a second call.
    expect(errorsRepo.resolveAll()).toBe(0);
  });
});
