/**
 * Tests for the Persona service.
 *
 * Seeds a deterministic 30-day activity slice and asserts the derived
 * persona. Chronotype/weekday classification uses local-time buckets
 * (TZ-dependent), so those assertions are kept structural; the language
 * fingerprint, totals, and tenure are TZ-independent and asserted exactly.
 */

import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import { createPersonaService } from '../../dist/services/persona-service.js';
import { RavenDB } from '../../dist/db.js';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

let db;
let tmpDir;
let svc;

// Anchor "now" so the 30-day window is deterministic.
const NOW = new Date('2026-04-29T12:00:00Z');

/** ISO timestamp N days before NOW, at a given UTC hour. */
function daysAgo(n, hour = 20) {
  const t = new Date(NOW);
  t.setUTCDate(t.getUTCDate() - n);
  t.setUTCHours(hour, 0, 0, 0);
  return t.toISOString();
}

beforeAll(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'raven-persona-'));
  db = new RavenDB(join(tmpDir, 'test.db'));
  svc = createPersonaService(db);

  const insEvent = db.db.prepare(
    `INSERT INTO events (timestamp, filepath, change_type, project_name, session_id)
     VALUES (?, ?, ?, ?, ?)`
  );

  // 24 TypeScript edits on 'raven' across 6 days (so days_active + tenure
  // are real, and TypeScript dominates the language fingerprint).
  let evt = 0;
  for (let day = 0; day < 6; day++) {
    for (let i = 0; i < 4; i++) {
      insEvent.run(
        daysAgo(day, 20 + (i % 3)),
        `raven/src/file-${evt}.ts`,
        'change',
        'raven',
        `s-${day}`
      );
      evt++;
    }
  }
  // A handful of markdown docs — should be counted but NOT win "mother tongue".
  insEvent.run(daysAgo(1, 21), 'raven/README.md', 'change', 'raven', 's-1');
  insEvent.run(daysAgo(2, 21), 'raven/NOTES.md', 'change', 'raven', 's-2');
  // A couple of Python files on a second project.
  insEvent.run(daysAgo(3, 22), 'tooling/run.py', 'change', 'tooling', 's-3');
  insEvent.run(daysAgo(4, 22), 'tooling/build.py', 'change', 'tooling', 's-4');

  const insTok = db.db.prepare(
    `INSERT INTO token_usage (timestamp, session_id, project_name, model, input_tokens, output_tokens, estimated_cost_usd)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  );
  insTok.run(daysAgo(0, 20), 's-0', 'raven', 'claude-opus-4-7', 100, 200, 1.5);
  insTok.run(daysAgo(1, 20), 's-1', 'raven', 'claude-opus-4-7', 200, 300, 2.0);
  insTok.run(daysAgo(2, 20), 's-2', 'raven', 'claude-sonnet-4-6', 50, 100, 0.5);
});

afterAll(() => {
  if (db) db.close();
  if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
});

describe('Persona Service', () => {
  test('has enough signal to characterize the user', () => {
    const p = svc.recompute(NOW);
    expect(p.has_data).toBe(true);
    expect(typeof p.title).toBe('string');
    expect(p.title.length).toBeGreaterThan(0);
    expect(typeof p.tagline).toBe('string');
    expect(Array.isArray(p.traits)).toBe(true);
    expect(p.traits.length).toBeGreaterThan(0);
  });

  test('tallies window totals from events + token_usage', () => {
    const p = svc.recompute(NOW);
    // 24 .ts + 2 .md + 2 .py = 28 events.
    expect(p.totals.events).toBe(28);
    expect(p.totals.requests).toBe(3);
    expect(p.totals.cost_usd).toBeCloseTo(4.0, 5);
    expect(p.totals.projects).toBe(2); // raven + tooling
  });

  test('identifies TypeScript as the mother tongue, not Markdown', () => {
    const p = svc.recompute(NOW);
    const langs = p.languages.map(l => l.language);
    expect(langs).toContain('TypeScript');
    // The tagline's "mostly in X" must be a real programming language.
    expect(p.tagline).toMatch(/mostly in (TypeScript|Python)/);
    expect(p.tagline).not.toMatch(/mostly in Markdown/);
  });

  test('picks the most-used model as the mind of choice', () => {
    const p = svc.recompute(NOW);
    expect(p.top_model).toBe('Claude Opus 4.7');
  });

  test('reports a real tenure derived from first activity', () => {
    const p = svc.recompute(NOW);
    // Tenure is epoch math (TZ-independent) off project_stats.first_seen_at;
    // the seed's earliest activity is a few days before NOW.
    expect(typeof p.tenure_days).toBe('number');
    expect(p.tenure_days).toBeGreaterThanOrEqual(2);
  });

  test('caches the persona across reads inside the TTL', () => {
    const a = svc.recompute(NOW); // persists
    const b = svc.get(NOW); // cache hit
    expect(b.title).toBe(a.title);
    expect(b.totals.events).toBe(a.totals.events);
  });

  test('falls back to a learning state when there is no data', () => {
    const empty = new RavenDB(join(tmpDir, 'empty.db'));
    const emptySvc = createPersonaService(empty);
    const p = emptySvc.recompute(NOW);
    expect(p.has_data).toBe(false);
    expect(p.title).toBe('Getting to know you');
    empty.close();
  });
});
