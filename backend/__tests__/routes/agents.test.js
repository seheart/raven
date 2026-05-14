/**
 * Tests for the Agents route — `/api/agent-stats` in particular.
 *
 * Regression guards from commit b5a52fc:
 *  - tool_breakdown was a single global GROUP BY, so every agent in the
 *    response carried the same global top-10 (wrong and identical).
 *  - create_count / edit_count lived only on a synthetic `_aggregate` row;
 *    every per-agent row got null and the UI rendered all-zero doughnuts.
 *  - The handler returned a "single agent" stub for empty DBs — now it must
 *    return an empty list when there are no agent events.
 */

import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import { createAgentsRouter } from '../../dist/routes/agents.js';
import { createAgentEventsRepository } from '../../dist/repositories/agent-events-repository.js';
import { createFileEventsRepository } from '../../dist/repositories/file-events-repository.js';
import { RavenDB } from '../../dist/db.js';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

function mountRouter(db) {
  const agentEventsRepo = createAgentEventsRepository(db);
  const fileEventsRepo = createFileEventsRepository(db);
  const agentRegistry = new Map();
  const app = express();
  // Unique mount point so cacheMiddleware doesn't return a previous suite's body.
  const base = '/api-' + Math.random().toString(36).slice(2, 10);
  app.use(base, createAgentsRouter(fileEventsRepo, agentRegistry, agentEventsRepo));
  return { app, base, agentEventsRepo };
}

describe('GET /api/agent-stats — per-agent breakdown', () => {
  let db;
  let tmpDir;
  let app;
  let base;
  let aggregateRow;
  let agentRows;

  beforeAll(async () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'raven-agents-multi-'));
    db = new RavenDB(join(tmpDir, 'test.db'));
    const repo = createAgentEventsRepository(db);

    const now = Date.now();
    function isoMinutesAgo(m) {
      return new Date(now - m * 60_000).toISOString();
    }

    // Agent A uses Read + Write (two distinct tools).
    repo.insert(
      isoMinutesAgo(10),
      'agent-A',
      'tool_call',
      null,
      null,
      null,
      'Read call',
      null,
      'sess-A',
      'proj'
    );
    repo.insert(
      isoMinutesAgo(9),
      'agent-A',
      'tool_call',
      null,
      null,
      null,
      'Read call',
      null,
      'sess-A',
      'proj'
    );
    repo.insert(
      isoMinutesAgo(8),
      'agent-A',
      'tool_call',
      null,
      null,
      null,
      'Write call',
      null,
      'sess-A',
      'proj'
    );

    // Agent B uses Edit + Bash (disjoint tool set from agent A).
    repo.insert(
      isoMinutesAgo(7),
      'agent-B',
      'tool_call',
      null,
      null,
      null,
      'Edit call',
      null,
      'sess-B',
      'proj'
    );
    repo.insert(
      isoMinutesAgo(6),
      'agent-B',
      'tool_call',
      null,
      null,
      null,
      'Edit call',
      null,
      'sess-B',
      'proj'
    );
    repo.insert(
      isoMinutesAgo(5),
      'agent-B',
      'tool_call',
      null,
      null,
      null,
      'Bash call',
      null,
      'sess-B',
      'proj'
    );

    ({ app, base } = mountRouter(db));

    const res = await request(app).get(`${base}/agent-stats`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    aggregateRow = res.body.find(r => r.is_aggregate);
    agentRows = res.body.filter(r => !r.is_aggregate);
  });

  afterAll(() => {
    if (db) db.close();
    if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
  });

  test('returns per-agent tool_breakdown, not a global one', () => {
    const a = agentRows.find(r => (r.agent_name || r.agent) === 'agent-A');
    const b = agentRows.find(r => (r.agent_name || r.agent) === 'agent-B');
    expect(a).toBeDefined();
    expect(b).toBeDefined();

    const messagesA = a.tool_breakdown.map(t => t.message).sort();
    const messagesB = b.tool_breakdown.map(t => t.message).sort();

    expect(messagesA).toEqual(['Read call', 'Write call']);
    expect(messagesB).toEqual(['Bash call', 'Edit call']);

    // Per-agent breakdowns must NOT be identical — the old bug returned the
    // same global aggregation for every row.
    expect(messagesA).not.toEqual(messagesB);
  });

  test('includes create_count and edit_count on every row, even when zero', () => {
    expect(agentRows.length).toBeGreaterThan(0);
    for (const row of agentRows) {
      expect(row).toHaveProperty('create_count');
      expect(row).toHaveProperty('edit_count');
      expect(typeof row.create_count).toBe('number');
      expect(typeof row.edit_count).toBe('number');
    }

    const a = agentRows.find(r => (r.agent_name || r.agent) === 'agent-A');
    const b = agentRows.find(r => (r.agent_name || r.agent) === 'agent-B');

    // agent-A: 1 Write call → create_count=1, no Edits → edit_count=0.
    expect(a.create_count).toBe(1);
    expect(a.edit_count).toBe(0);

    // agent-B: 2 Edit calls → edit_count=2, no Writes → create_count=0.
    expect(b.create_count).toBe(0);
    expect(b.edit_count).toBe(2);
  });

  test('emits the _aggregate sentinel row for backwards compatibility', () => {
    // Not strictly part of the bug fix, but the route still emits this and
    // the per-agent rows must not be confused with it.
    expect(aggregateRow).toBeDefined();
    expect(aggregateRow.is_aggregate).toBe(true);
  });
});

describe('GET /api/agent-stats — empty database', () => {
  let db;
  let tmpDir;
  let app;
  let base;

  beforeAll(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'raven-agents-empty-'));
    db = new RavenDB(join(tmpDir, 'test.db'));
    ({ app, base } = mountRouter(db));
  });

  afterAll(() => {
    if (db) db.close();
    if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
  });

  test('returns an array with no real agent rows when there are no events', async () => {
    const res = await request(app).get(`${base}/agent-stats`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);

    // The route emits an `_aggregate` sentinel row even on an empty DB; the
    // contract is that no real per-agent rows are present.
    const real = res.body.filter(r => !r.is_aggregate);
    expect(real).toEqual([]);
  });
});
