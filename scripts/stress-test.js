#!/usr/bin/env node
/**
 * Raven Synthetic Load Stress Test
 *
 * Generates synthetic events directly into a Raven SQLite DB to flush out
 * scaling bottlenecks (slow queries, DB bloat, frontend list re-renders)
 * before real users hit them. Writes via better-sqlite3 in batched transactions,
 * then times the heaviest dashboard read queries against the loaded data.
 *
 * Usage:
 *   node scripts/stress-test.js --events 100000 --days 30 --batch 1000
 *   node scripts/stress-test.js --events 1000 --db /tmp/raven-stress.db --reset
 *
 * WARNING: Writes directly to a real Raven DB. Default path is .raven/db/raven.db.
 * Use --db <path> against a throwaway file, or --reset to truncate event tables
 * first. The script will refuse to run against the default path without --reset
 * unless --force is also passed.
 */

import Database from 'better-sqlite3';
import { existsSync, mkdirSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { argv, exit } from 'node:process';

// ==================== CLI parsing ====================

const DEFAULTS = {
  events: 100_000,
  days: 30,
  batch: 1000,
  db: '.raven/db/raven.db',
  reset: false,
  force: false
};

function parseArgs(args) {
  const out = { ...DEFAULTS };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    switch (a) {
      case '--events':
        out.events = Number(args[++i]);
        break;
      case '--days':
        out.days = Number(args[++i]);
        break;
      case '--batch':
        out.batch = Number(args[++i]);
        break;
      case '--db':
        out.db = args[++i];
        break;
      case '--reset':
        out.reset = true;
        break;
      case '--force':
        out.force = true;
        break;
      case '-h':
      case '--help':
        console.log(
          `Usage: node scripts/stress-test.js [--events N] [--days N] [--batch N] [--db PATH] [--reset] [--force]`
        );
        exit(0);
    }
  }
  if (!Number.isFinite(out.events) || out.events <= 0)
    throw new Error('--events must be > 0');
  if (!Number.isFinite(out.days) || out.days <= 0) throw new Error('--days must be > 0');
  if (!Number.isFinite(out.batch) || out.batch <= 0) throw new Error('--batch must be > 0');
  return out;
}

const opts = parseArgs(argv.slice(2));

// Safety: refuse to clobber the default DB unless caller is explicit.
const isDefaultDb = opts.db === DEFAULTS.db;
if (isDefaultDb && !opts.force) {
  console.error(
    `Refusing to run against the default Raven DB (${opts.db}) without --force. ` +
      `Pass --db /tmp/raven-stress.db (recommended) or add --force to override.`
  );
  exit(2);
}

const dbPath = resolve(opts.db);
const dbDir = dirname(dbPath);
if (!existsSync(dbDir)) mkdirSync(dbDir, { recursive: true });

// ==================== DB connection & schema ====================

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL'); // faster than FULL, still durable across crashes
db.pragma('busy_timeout = 5000');
db.pragma('foreign_keys = ON');

// Mirror the schema we depend on. Production code creates these in backend/db.ts;
// we replicate the minimum so the script can also bootstrap a fresh file
// (e.g. /tmp/raven-stress.db).
function ensureSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp TEXT NOT NULL,
      filepath TEXT,
      change_type TEXT,
      diff TEXT,
      cpu REAL,
      mem REAL,
      session_id TEXT,
      file_hash TEXT,
      event_size INTEGER,
      project_name TEXT,
      agent_source TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp DESC);
    CREATE INDEX IF NOT EXISTS idx_events_session_id ON events(session_id);
    CREATE INDEX IF NOT EXISTS idx_events_project_name ON events(project_name);
    CREATE INDEX IF NOT EXISTS idx_events_change_type ON events(change_type);
    CREATE INDEX IF NOT EXISTS idx_events_filepath ON events(filepath);
    CREATE INDEX IF NOT EXISTS idx_events_agent_source ON events(agent_source);

    CREATE TABLE IF NOT EXISTS agent_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp TEXT NOT NULL,
      agent TEXT NOT NULL,
      event_type TEXT NOT NULL,
      file TEXT,
      lines_changed INTEGER,
      duration_ms INTEGER,
      message TEXT NOT NULL,
      metadata TEXT,
      session_id TEXT,
      project_name TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_agent_events_timestamp ON agent_events(timestamp DESC);
    CREATE INDEX IF NOT EXISTS idx_agent_events_agent ON agent_events(agent);
    CREATE INDEX IF NOT EXISTS idx_agent_events_session_id ON agent_events(session_id);
    CREATE INDEX IF NOT EXISTS idx_agent_events_type ON agent_events(event_type);
    CREATE INDEX IF NOT EXISTS idx_agent_events_project_name ON agent_events(project_name);

    CREATE TABLE IF NOT EXISTS syntax_errors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp TEXT NOT NULL,
      filepath TEXT NOT NULL,
      line_number INTEGER NOT NULL,
      column_number INTEGER,
      message TEXT NOT NULL,
      severity TEXT NOT NULL,
      language TEXT NOT NULL,
      resolved INTEGER DEFAULT 0,
      session_id TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_syntax_errors_timestamp ON syntax_errors(timestamp DESC);
    CREATE INDEX IF NOT EXISTS idx_syntax_errors_filepath ON syntax_errors(filepath);
    CREATE INDEX IF NOT EXISTS idx_syntax_errors_resolved ON syntax_errors(resolved);

    CREATE TABLE IF NOT EXISTS project_stats (
      project_name TEXT PRIMARY KEY,
      total_events INTEGER NOT NULL DEFAULT 0,
      total_agent_events INTEGER NOT NULL DEFAULT 0,
      first_seen_at TEXT,
      last_seen_at TEXT,
      last_agent_seen_at TEXT
    );

    -- Lifetime per-filepath rollup. Mirrors production schema (backend/db.ts).
    -- Trigger-maintained so topModifiedFiles becomes an index seek + LIMIT
    -- instead of a full-table GROUP BY filepath.
    CREATE TABLE IF NOT EXISTS file_stats (
      filepath TEXT PRIMARY KEY,
      total_modifications INTEGER NOT NULL DEFAULT 0,
      last_modified TEXT,
      agent_source TEXT,
      project_name TEXT,
      create_count INTEGER NOT NULL DEFAULT 0,
      edit_count INTEGER NOT NULL DEFAULT 0,
      delete_count INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_file_stats_project_mods ON file_stats(project_name, total_modifications DESC);
    CREATE INDEX IF NOT EXISTS idx_file_stats_total_modifications ON file_stats(total_modifications DESC);

    -- Lifetime per-change_type rollup. Powers dashboardStats.eventStats.
    CREATE TABLE IF NOT EXISTS event_type_stats (
      change_type TEXT PRIMARY KEY,
      count INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS token_usage (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp TEXT NOT NULL,
      session_id TEXT NOT NULL,
      project_name TEXT,
      model TEXT NOT NULL,
      input_tokens INTEGER DEFAULT 0,
      output_tokens INTEGER DEFAULT 0,
      cache_creation_tokens INTEGER DEFAULT 0,
      cache_read_tokens INTEGER DEFAULT 0,
      estimated_cost_usd REAL DEFAULT 0,
      request_id TEXT,
      agent_id TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_token_usage_timestamp ON token_usage(timestamp DESC);
    CREATE INDEX IF NOT EXISTS idx_token_usage_project_name ON token_usage(project_name);
  `);

  // Triggers that maintain project_stats. Match production exactly so the
  // load test exercises the same write path (including trigger overhead).
  db.exec(`
    CREATE TRIGGER IF NOT EXISTS bump_project_stats_events
    AFTER INSERT ON events
    WHEN NEW.project_name IS NOT NULL AND NEW.project_name != ''
    BEGIN
      INSERT INTO project_stats (project_name, total_events, first_seen_at, last_seen_at)
      VALUES (NEW.project_name, 1, NEW.timestamp, NEW.timestamp)
      ON CONFLICT(project_name) DO UPDATE SET
        total_events = total_events + 1,
        last_seen_at = NEW.timestamp,
        first_seen_at = COALESCE(first_seen_at, NEW.timestamp);
    END;
    CREATE TRIGGER IF NOT EXISTS bump_project_stats_agent_events
    AFTER INSERT ON agent_events
    WHEN NEW.project_name IS NOT NULL AND NEW.project_name != ''
    BEGIN
      INSERT INTO project_stats (project_name, total_agent_events, first_seen_at, last_agent_seen_at)
      VALUES (NEW.project_name, 1, NEW.timestamp, NEW.timestamp)
      ON CONFLICT(project_name) DO UPDATE SET
        total_agent_events = total_agent_events + 1,
        last_agent_seen_at = NEW.timestamp,
        first_seen_at = COALESCE(first_seen_at, NEW.timestamp);
    END;

    CREATE TRIGGER IF NOT EXISTS bump_file_stats_events
    AFTER INSERT ON events
    WHEN NEW.filepath IS NOT NULL AND NEW.filepath != ''
    BEGIN
      INSERT INTO file_stats (
        filepath, total_modifications, last_modified, agent_source, project_name,
        create_count, edit_count, delete_count
      ) VALUES (
        NEW.filepath,
        1,
        NEW.timestamp,
        NEW.agent_source,
        NEW.project_name,
        CASE WHEN NEW.change_type IN ('add','create') THEN 1 ELSE 0 END,
        CASE WHEN NEW.change_type IN ('change','edit','modified') THEN 1 ELSE 0 END,
        CASE WHEN NEW.change_type IN ('unlink','delete') THEN 1 ELSE 0 END
      )
      ON CONFLICT(filepath) DO UPDATE SET
        total_modifications = total_modifications + 1,
        last_modified = NEW.timestamp,
        agent_source = COALESCE(NEW.agent_source, agent_source),
        project_name = COALESCE(NEW.project_name, project_name),
        create_count = create_count + CASE WHEN NEW.change_type IN ('add','create') THEN 1 ELSE 0 END,
        edit_count   = edit_count   + CASE WHEN NEW.change_type IN ('change','edit','modified') THEN 1 ELSE 0 END,
        delete_count = delete_count + CASE WHEN NEW.change_type IN ('unlink','delete') THEN 1 ELSE 0 END;
    END;

    CREATE TRIGGER IF NOT EXISTS bump_event_type_stats_events
    AFTER INSERT ON events
    WHEN NEW.change_type IS NOT NULL AND NEW.change_type != ''
    BEGIN
      INSERT INTO event_type_stats (change_type, count)
      VALUES (NEW.change_type, 1)
      ON CONFLICT(change_type) DO UPDATE SET
        count = count + 1;
    END;
  `);
}

ensureSchema();

if (opts.reset) {
  console.log('[reset] truncating event tables…');
  const truncate = db.transaction(() => {
    db.exec('DELETE FROM events');
    db.exec('DELETE FROM agent_events');
    db.exec('DELETE FROM syntax_errors');
    db.exec('DELETE FROM token_usage');
    db.exec('DELETE FROM project_stats');
    // Reset rollups too so the next load reflects only this run.
    try {
      db.exec('DELETE FROM file_stats');
      db.exec('DELETE FROM event_type_stats');
    } catch {
      /* tables may not exist on older DBs */
    }
    // Reset autoincrement counters so ids start at 1 again (idempotent state).
    try {
      db.exec(
        `DELETE FROM sqlite_sequence WHERE name IN ('events','agent_events','syntax_errors','token_usage')`
      );
    } catch {
      /* sqlite_sequence may not exist if no AUTOINCREMENT rows ever inserted */
    }
  });
  truncate();
}

// ==================== Synthetic data generators ====================

const PROJECTS = Array.from({ length: 10 }, (_, i) => `project-${String(i + 1).padStart(2, '0')}`);
const FILES_PER_PROJECT = 50;
const FILE_EXTENSIONS = ['.ts', '.js', '.tsx', '.svelte', '.py', '.md', '.json'];
const CHANGE_TYPES = ['change', 'add', 'unlink']; // skewed below
const AGENTS = [
  { name: 'claude-code', weight: 0.75 },
  { name: 'ollama:llama3', weight: 0.1 },
  { name: 'ollama:gemma3', weight: 0.08 },
  { name: 'ollama:qwen2.5-coder', weight: 0.07 }
];
const AGENT_EVENT_TYPES = [
  { type: 'inference', weight: 0.4 },
  { type: 'tool_call', weight: 0.3 },
  { type: 'assistant_text', weight: 0.15 },
  { type: 'user_message', weight: 0.1 },
  { type: 'api_call', weight: 0.05 }
];
const TOOL_MESSAGES = ['Read', 'Edit', 'Write', 'Bash', 'Grep', 'Glob', 'WebFetch', 'Task'];
const SYNTAX_SEVERITIES = ['error', 'warning', 'info'];
const SYNTAX_LANGUAGES = ['typescript', 'javascript', 'python', 'svelte'];

// Pre-compute the file table: 10 projects × 50 files = 500 files
const FILE_TABLE = [];
for (const project of PROJECTS) {
  for (let i = 0; i < FILES_PER_PROJECT; i++) {
    const ext = FILE_EXTENSIONS[i % FILE_EXTENSIONS.length];
    FILE_TABLE.push({
      project,
      path: `/fake/repos/${project}/src/module-${Math.floor(i / 10)}/file-${i}${ext}`
    });
  }
}

// Weighted picker: O(n) per call, fine for our small arrays.
function pickWeighted(items) {
  const total = items.reduce((s, x) => s + x.weight, 0);
  let r = Math.random() * total;
  for (const item of items) {
    r -= item.weight;
    if (r <= 0) return item;
  }
  return items[items.length - 1];
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// Change_type distribution: writes dominate, deletes rare.
function pickChangeType() {
  const r = Math.random();
  if (r < 0.6) return 'change';
  if (r < 0.95) return 'add';
  return 'unlink';
}

// Realistic-ish session id (one per ~100 events).
function makeSessionId(seq) {
  return `stress-${Math.floor(seq / 100).toString(36)}`;
}

// Distribute timestamps across the last N days. Uniform random within window —
// good enough to exercise indexes and time-range queries; not trying to model
// diurnal patterns.
const windowEndMs = Date.now();
const windowStartMs = windowEndMs - opts.days * 24 * 60 * 60 * 1000;
function randomTimestamp() {
  return new Date(windowStartMs + Math.random() * (windowEndMs - windowStartMs)).toISOString();
}

// Token counts skewed toward smaller calls; long tail for big context.
function randomTokens() {
  // log-uniform between 10 and 10_000
  const minLog = Math.log(10);
  const maxLog = Math.log(10_000);
  return Math.round(Math.exp(minLog + Math.random() * (maxLog - minLog)));
}

// Tiny synthetic diff. Real diffs can be many KB; we keep these ~100 chars so
// the DB grows realistically without bloating from one giant column.
function makeDiff(filepath, change_type) {
  if (change_type === 'unlink') return null;
  return `--- a${filepath}\n+++ b${filepath}\n@@ -1 +1 @@\n-old\n+new`;
}

// ==================== Insert statements ====================

const insertEvent = db.prepare(`
  INSERT INTO events
    (timestamp, filepath, change_type, diff, cpu, mem, session_id, file_hash, event_size, project_name, agent_source)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);
const insertAgentEvent = db.prepare(`
  INSERT INTO agent_events
    (timestamp, agent, event_type, file, lines_changed, duration_ms, message, metadata, session_id, project_name)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);
const insertSyntaxError = db.prepare(`
  INSERT INTO syntax_errors
    (timestamp, filepath, line_number, column_number, message, severity, language, resolved, session_id)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`);
const insertTokenUsage = db.prepare(`
  INSERT INTO token_usage
    (timestamp, session_id, project_name, model, input_tokens, output_tokens,
     cache_creation_tokens, cache_read_tokens, estimated_cost_usd, request_id, agent_id)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

// One row emitter per category. We pick the category up front (weighted) and
// generate a single row + (for agent events) a matching token_usage row, so
// cost data is always coherent with the agent events that produced it.
function emitFileEvent(seq) {
  const file = pick(FILE_TABLE);
  const change_type = pickChangeType();
  const ts = randomTimestamp();
  insertEvent.run(
    ts,
    file.path,
    change_type,
    makeDiff(file.path, change_type),
    Math.random() * 100,
    Math.random() * 100,
    makeSessionId(seq),
    `hash-${seq.toString(36)}`,
    Math.floor(Math.random() * 8000) + 100,
    file.project,
    Math.random() < 0.7 ? 'claude-code' : null
  );
}

function emitAgentEvent(seq) {
  const file = pick(FILE_TABLE);
  const agent = pickWeighted(AGENTS).name;
  const et = pickWeighted(AGENT_EVENT_TYPES).type;
  const ts = randomTimestamp();
  const sessionId = makeSessionId(seq);
  const inputTokens = randomTokens();
  const outputTokens = randomTokens();
  insertAgentEvent.run(
    ts,
    agent,
    et,
    et === 'tool_call' ? file.path : null,
    et === 'tool_call' ? Math.floor(Math.random() * 200) : null,
    Math.floor(Math.random() * 30_000) + 100,
    et === 'tool_call' ? pick(TOOL_MESSAGES) : `synthetic ${et} #${seq}`,
    JSON.stringify({ project: file.project, caller_pid: 10_000 + (seq % 50) }),
    sessionId,
    file.project
  );

  // Pair claude-code inference/api_call events with a token_usage row so the
  // dashboard cost query has something to aggregate. Local-model events
  // (ollama:*) skip this — they're free.
  if (agent === 'claude-code' && (et === 'inference' || et === 'api_call')) {
    // Pricing roughly matches Sonnet 4 ($3/M input, $15/M output) so the
    // estimated_cost_usd is a plausible dollar figure for sanity checks.
    const cost = (inputTokens * 3 + outputTokens * 15) / 1_000_000;
    insertTokenUsage.run(
      ts,
      sessionId,
      file.project,
      'claude-sonnet-4',
      inputTokens,
      outputTokens,
      Math.floor(inputTokens * 0.1),
      Math.floor(inputTokens * 0.3),
      cost,
      `req-${seq.toString(36)}`,
      null
    );
  }
}

function emitSyntaxError(seq) {
  const file = pick(FILE_TABLE);
  const lang = pick(SYNTAX_LANGUAGES);
  insertSyntaxError.run(
    randomTimestamp(),
    file.path,
    Math.floor(Math.random() * 500) + 1,
    Math.floor(Math.random() * 80) + 1,
    `synthetic ${lang} parse error #${seq}`,
    pick(SYNTAX_SEVERITIES),
    lang,
    Math.random() < 0.4 ? 1 : 0,
    makeSessionId(seq)
  );
}

// ==================== DB size helper ====================

function dbSizeBytes() {
  let total = 0;
  for (const suffix of ['', '-wal', '-shm']) {
    const p = dbPath + suffix;
    if (existsSync(p)) {
      try {
        total += statSync(p).size;
      } catch {
        /* race with WAL checkpoint, ignore */
      }
    }
  }
  return total;
}

function fmtBytes(n) {
  const u = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < u.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(2)} ${u[i]}`;
}

// ==================== Load phase ====================

console.log(`\n=== Raven Stress Test ===`);
console.log(`db:       ${dbPath}`);
console.log(`events:   ${opts.events.toLocaleString()}`);
console.log(`days:     ${opts.days}`);
console.log(`batch:    ${opts.batch}`);
console.log(`reset:    ${opts.reset}`);
console.log(`projects: ${PROJECTS.length} × ${FILES_PER_PROJECT} files = ${FILE_TABLE.length}\n`);

const sizeBefore = dbSizeBytes();
console.log(`db size before: ${fmtBytes(sizeBefore)}`);

// Pre-bind the per-batch transaction. better-sqlite3 transactions are
// dramatically faster than individual inserts because each transaction
// fsyncs once at commit instead of once per row.
const writeBatch = db.transaction((startSeq, count) => {
  for (let i = 0; i < count; i++) {
    const seq = startSeq + i;
    const roll = Math.random();
    if (roll < 0.8) emitFileEvent(seq);
    else if (roll < 0.95) emitAgentEvent(seq);
    else emitSyntaxError(seq);
  }
});

const t0 = process.hrtime.bigint();
let written = 0;
let lastReport = t0;
while (written < opts.events) {
  const n = Math.min(opts.batch, opts.events - written);
  writeBatch(written, n);
  written += n;

  const now = process.hrtime.bigint();
  if (Number(now - lastReport) / 1e9 > 1 || written === opts.events) {
    const elapsedSec = Number(now - t0) / 1e9;
    const rate = written / elapsedSec;
    process.stdout.write(
      `\r  wrote ${written.toLocaleString()} / ${opts.events.toLocaleString()} ` +
        `(${rate.toFixed(0)} ev/s)`
    );
    lastReport = now;
  }
}
process.stdout.write('\n');

const tLoadEnd = process.hrtime.bigint();
const loadSec = Number(tLoadEnd - t0) / 1e9;
const throughput = written / loadSec;

// Force a WAL checkpoint so the .db file reflects all writes for size measurement.
db.pragma('wal_checkpoint(TRUNCATE)');

const sizeAfter = dbSizeBytes();

console.log(`\n=== Load complete ===`);
console.log(`events written:  ${written.toLocaleString()}`);
console.log(`elapsed:         ${loadSec.toFixed(2)} s`);
console.log(`throughput:      ${throughput.toFixed(0)} events/sec`);
console.log(`db size after:   ${fmtBytes(sizeAfter)}`);
console.log(
  `delta:           ${fmtBytes(sizeAfter - sizeBefore)} ` +
    `(${((sizeAfter - sizeBefore) / Math.max(1, written)).toFixed(1)} B/event avg)`
);

// ==================== Row counts ====================

const tableCounts = {
  events: db.prepare('SELECT COUNT(*) as n FROM events').get().n,
  agent_events: db.prepare('SELECT COUNT(*) as n FROM agent_events').get().n,
  syntax_errors: db.prepare('SELECT COUNT(*) as n FROM syntax_errors').get().n,
  token_usage: db.prepare('SELECT COUNT(*) as n FROM token_usage').get().n,
  project_stats: db.prepare('SELECT COUNT(*) as n FROM project_stats').get().n
};
console.log(`\n=== Row counts ===`);
for (const [t, n] of Object.entries(tableCounts)) {
  console.log(`  ${t.padEnd(16)} ${n.toLocaleString()}`);
}

// ==================== Spot-check query latency ====================

// Mirror the three heaviest queries from dashboard-repository.ts. We're not
// going through the repository class (would require building backend/dist);
// we run the SQL directly so we measure the DB cost cleanly.

function timeQuery(label, fn) {
  // Two passes — first warms the page cache, second is the number we report.
  // For the stress test we mostly care about the cold-ish path so we report both.
  const t1 = process.hrtime.bigint();
  const r1 = fn();
  const t2 = process.hrtime.bigint();
  const r2 = fn();
  const t3 = process.hrtime.bigint();
  const cold = Number(t2 - t1) / 1e6;
  const warm = Number(t3 - t2) / 1e6;
  const rowCount = Array.isArray(r1) ? r1.length : r1 ? 1 : 0;
  console.log(
    `  ${label.padEnd(40)} cold ${cold.toFixed(2).padStart(8)} ms  warm ${warm.toFixed(2).padStart(8)} ms  rows ${rowCount}`
  );
  void r2; // kept to ensure the second call isn't optimized away
}

console.log(`\n=== Query latency (cold = first call, warm = page cache hit) ===`);
const since24h = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
const since7d = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();

// 1) historicalTrends/daily — group-by date(timestamp) is the most expensive
//    dashboard read; touches every event row in the window.
timeQuery('historicalTrends daily (7d)', () =>
  db
    .prepare(
      `SELECT strftime('%Y-%m-%d', timestamp) as period,
              COUNT(*) as event_count,
              SUM(CASE WHEN change_type IN ('change', 'modified') THEN 1 ELSE 0 END) as modifications,
              SUM(CASE WHEN change_type = 'add' THEN 1 ELSE 0 END) as creations,
              SUM(CASE WHEN change_type = 'unlink' THEN 1 ELSE 0 END) as deletions,
              COUNT(DISTINCT filepath) as unique_files,
              COUNT(DISTINCT project_name) as active_projects
       FROM events
       WHERE timestamp >= ?
       GROUP BY period
       ORDER BY period ASC`
    )
    .all(since7d)
);

// 2) topModified — GROUP BY filepath with no WHERE filter is the canonical
//    "scans the whole table" query. This is the one most likely to slow as
//    rows accumulate.
timeQuery('topModifiedFiles OLD (events GROUP BY)', () =>
  db
    .prepare(
      `SELECT filepath, COUNT(*) as edit_count, MAX(timestamp) as last_modified
       FROM events WHERE filepath IS NOT NULL
       GROUP BY filepath ORDER BY edit_count DESC LIMIT 20`
    )
    .all()
);

// 2b) topModified — rollup-table version. Index-backed top-K read; should
//     stay flat regardless of row count in events.
timeQuery('topModifiedFiles NEW (file_stats top-K)', () =>
  db
    .prepare(
      `SELECT filepath, total_modifications as edit_count, last_modified
       FROM file_stats ORDER BY total_modifications DESC LIMIT 20`
    )
    .all()
);

// 3) dashboardStats (eventStats + duration) — duplicates the per-load
//    overhead on every dashboard refresh.
timeQuery('dashboardStats OLD (events full scan)', () =>
  db
    .prepare(
      `SELECT COUNT(*) as total_events,
              COUNT(DISTINCT filepath) as total_files,
              SUM(CASE WHEN change_type IN ('add','create') THEN 1 ELSE 0 END) as creates,
              SUM(CASE WHEN change_type IN ('change','edit','modified') THEN 1 ELSE 0 END) as edits,
              SUM(CASE WHEN change_type IN ('unlink','delete') THEN 1 ELSE 0 END) as deletes
       FROM events`
    )
    .get()
);

// 3b) dashboardStats — rollup version. Two tiny reads against
//     event_type_stats (handful of rows) + file_stats COUNT(*).
timeQuery('dashboardStats NEW (event_type_stats rollup)', () => {
  const typeRow = db
    .prepare(
      `SELECT COALESCE(SUM(count), 0) AS total_events,
              COALESCE(SUM(CASE WHEN change_type IN ('add','create') THEN count ELSE 0 END), 0) AS creates,
              COALESCE(SUM(CASE WHEN change_type IN ('change','edit','modified') THEN count ELSE 0 END), 0) AS edits,
              COALESCE(SUM(CASE WHEN change_type IN ('unlink','delete') THEN count ELSE 0 END), 0) AS deletes
       FROM event_type_stats`
    )
    .get();
  const filesRow = db.prepare(`SELECT COUNT(*) AS total_files FROM file_stats`).get();
  return { ...typeRow, ...filesRow };
});

// Bonus: a couple of "should-be-fast" indexed queries for contrast.
timeQuery('recent file events LIMIT 100 (uses idx_events_timestamp)', () =>
  db.prepare(`SELECT * FROM events ORDER BY timestamp DESC LIMIT 100`).all()
);
timeQuery('events 24h count (uses idx_events_timestamp)', () =>
  db.prepare(`SELECT COUNT(*) as n FROM events WHERE timestamp >= ?`).get(since24h)
);
timeQuery('costs since 24h (uses idx_token_usage_timestamp)', () =>
  db
    .prepare(
      `SELECT COUNT(*) as total_requests,
              COALESCE(SUM(estimated_cost_usd), 0) as total_cost_usd
       FROM token_usage WHERE timestamp >= ?`
    )
    .get(since24h)
);

console.log('\nDone.');
db.close();
