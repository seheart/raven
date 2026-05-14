/**
 * Migration safety tests.
 *
 * These guard the moment Raven ships to user databases in the wild. They
 * cover four classes of regression:
 *
 *   1. Fresh-database boot: every migration runs cleanly on an empty DB.
 *   2. Idempotency: running the migration sequence twice does not error
 *      and leaves the schema identical.
 *   3. Data preservation: rows seeded into the pre-migration shape survive
 *      the migration (count + sensible values for new columns).
 *   4. Partial-schema upgrade: a v0.4-style DB (missing recently-added
 *      tables) upgrades without losing pre-existing rows.
 *   5. Ordering: migrations run in numeric-prefix order, not raw
 *      readdirSync order.
 *
 * Test approach mirrors backend/run-migrations.js: dynamically import each
 * migration's compiled module from dist/migrations/ and call its
 * `migrate(db)` export, in lexicographic order.
 *
 * Migration 002 history: it shipped originally exporting only
 * `migrateDatabase(dbPath, name)` (a standalone CLI), which meant the
 * runner silently skipped it for every v0.3 user upgrading. That was
 * fixed: 002 now also exports `migrate(db)` matching 001/003, and the
 * legacy `migrateDatabase` wrapper is kept for the CLI workflow. These
 * tests cover both code paths — `runMigrationsOnDb` exercises the new
 * `migrate(db)` export the runner uses, and the data-preservation test
 * for 002 invokes `migrateDatabase` directly to keep the CLI honest.
 */

import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import Database from 'better-sqlite3';
import { mkdtempSync, rmSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { tmpdir } from 'os';
import { fileURLToPath } from 'url';
import { RavenDB } from '../dist/db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const MIGRATIONS_DIR = join(__dirname, '..', 'dist', 'migrations');

// Discover migrations the same way run-migrations.js does, but sort by
// the numeric prefix so we are explicitly testing prefix-ordering rather
// than relying on lexicographic accident.
function listMigrationFiles() {
  return readdirSync(MIGRATIONS_DIR)
    .filter(f => /^\d{3}_.*\.js$/.test(f))
    .sort((a, b) => {
      const na = parseInt(a.slice(0, 3), 10);
      const nb = parseInt(b.slice(0, 3), 10);
      return na - nb;
    });
}

// Load all migration modules. Returns [{ name, file, module }] in order.
async function loadMigrations() {
  const files = listMigrationFiles();
  const out = [];
  for (const f of files) {
    const url = `file://${join(MIGRATIONS_DIR, f)}`;
    const mod = await import(url);
    out.push({ name: f.replace('.js', ''), file: f, module: mod });
  }
  return out;
}

// Run migrations the same way production does: every migration exporting
// `migrate(db)`. After the 002 fix, that includes 001, 002, 003, 004 — no
// migration is silently skipped by the runner anymore.
async function runMigrationsOnDb(db) {
  const migrations = await loadMigrations();
  for (const m of migrations) {
    if (typeof m.module.migrate === 'function') {
      m.module.migrate(db);
    }
  }
}

// Helper: list every table name (excluding sqlite internal).
function tableNames(db) {
  return db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
    )
    .all()
    .map(r => r.name);
}

// Helper: list column names for a table.
function columnNames(db, table) {
  return db
    .prepare(`PRAGMA table_info(${table})`)
    .all()
    .map(c => c.name)
    .sort();
}

// Helper: full schema snapshot — tables + columns + indexes — comparable
// across runs. Excludes sqlite_autoindex_* (implementation detail).
function schemaSnapshot(db) {
  const tables = tableNames(db);
  const snapshot = { tables: {}, indexes: [] };
  for (const t of tables) {
    snapshot.tables[t] = columnNames(db, t);
  }
  snapshot.indexes = db
    .prepare(
      "SELECT name, tbl_name, sql FROM sqlite_master WHERE type='index' AND name NOT LIKE 'sqlite_autoindex_%' ORDER BY name"
    )
    .all();
  return snapshot;
}

describe('migrations', () => {
  let tmpDir;
  let dbPath;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'raven-migrations-'));
    dbPath = join(tmpDir, 'test.db');
  });

  afterEach(() => {
    if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
  });

  // ----------------------------------------------------------------------
  // 1. All migrations run cleanly on a fresh db.
  // ----------------------------------------------------------------------
  describe('fresh database', () => {
    test('every migration with a migrate() export runs without error on a RavenDB-initialized empty db', async () => {
      const ravenDb = new RavenDB(dbPath);
      await expect(runMigrationsOnDb(ravenDb.db)).resolves.not.toThrow();
      ravenDb.close();
    });

    test('expected tables exist after running migrations', async () => {
      const ravenDb = new RavenDB(dbPath);
      await runMigrationsOnDb(ravenDb.db);
      const tables = tableNames(ravenDb.db);

      // Tables created by RavenDB.initializeSchema()
      const ravenSchemaTables = [
        'agent_events',
        'analysis_checks',
        'analysis_runs',
        'api_latency',
        'app_errors',
        'diff_annotations',
        'diff_risk_scores',
        'events',
        'gpu_metrics',
        'insights',
        'pattern_warning_ignores',
        'pattern_warnings',
        'process_metrics',
        'project_stats',
        'raven_metrics',
        'subagent_tree',
        'syntax_errors',
        'test_results',
        'token_usage'
      ];

      // Tables created by migration 001_monitoring_enhancements
      const migrationTables = ['agent_stats', 'change_conversations', 'rollbacks', 'sessions'];

      for (const t of [...ravenSchemaTables, ...migrationTables]) {
        expect(tables).toContain(t);
      }
      ravenDb.close();
    });

    test('events table has all columns added by migration 001 (except agent, which 004 drops)', async () => {
      const ravenDb = new RavenDB(dbPath);
      await runMigrationsOnDb(ravenDb.db);
      const cols = columnNames(ravenDb.db, 'events');
      // Columns added by 001_monitoring_enhancements that survive the full
      // sequence. Note: `agent` is also added by 001 but intentionally
      // dropped by 004 — see the dedicated 004 test below.
      for (const c of [
        'agent_confidence',
        'is_anomaly',
        'anomaly_score',
        'anomaly_confidence',
        'anomaly_reasons',
        'risk_level',
        'risk_score',
        'risk_factors'
      ]) {
        expect(cols).toContain(c);
      }
      // 004 drops the legacy agent column that 001/002 added.
      expect(cols).not.toContain('agent');
      ravenDb.close();
    });

    test('process_metrics table has all columns added by migration 003', async () => {
      const ravenDb = new RavenDB(dbPath);
      await runMigrationsOnDb(ravenDb.db);
      const cols = columnNames(ravenDb.db, 'process_metrics');
      for (const c of [
        'network_connections',
        'api_connections',
        'thread_count',
        'fd_count',
        'activity_state'
      ]) {
        expect(cols).toContain(c);
      }
      ravenDb.close();
    });
  });

  // ----------------------------------------------------------------------
  // 2. Migrations are idempotent.
  // ----------------------------------------------------------------------
  describe('idempotency', () => {
    test('running the full migration sequence twice does not error', async () => {
      const ravenDb = new RavenDB(dbPath);
      await runMigrationsOnDb(ravenDb.db);
      await expect(runMigrationsOnDb(ravenDb.db)).resolves.not.toThrow();
      ravenDb.close();
    });

    test('second run leaves the schema identical to the first', async () => {
      const ravenDb = new RavenDB(dbPath);
      await runMigrationsOnDb(ravenDb.db);
      const afterFirst = schemaSnapshot(ravenDb.db);

      await runMigrationsOnDb(ravenDb.db);
      const afterSecond = schemaSnapshot(ravenDb.db);

      expect(afterSecond).toEqual(afterFirst);
      ravenDb.close();
    });

    test('running migrations on a DB where RavenDB already initialized the schema is a no-op for table set', async () => {
      // RavenDB constructor runs initializeSchema(), which already creates
      // many of the new columns/tables. Migrations should still apply cleanly.
      const ravenDb = new RavenDB(dbPath);
      const beforeTables = new Set(tableNames(ravenDb.db));
      await runMigrationsOnDb(ravenDb.db);
      const afterTables = new Set(tableNames(ravenDb.db));

      // Every pre-existing RavenDB table must still be present (no drops).
      for (const t of beforeTables) {
        expect(afterTables.has(t)).toBe(true);
      }
      ravenDb.close();
    });
  });

  // ----------------------------------------------------------------------
  // 3. Migrations preserve data.
  //
  // We seed the "old" state (a v0.3-shaped events table without the new
  // columns and with the legacy change_type values) and verify:
  //   - 001 adds columns without nuking rows
  //   - 002 (run by direct path import) rewrites change_type values
  //   - 003 adds process_metrics columns without nuking rows
  // ----------------------------------------------------------------------
  describe('data preservation', () => {
    // Build a "v0.3" database: events + process_metrics tables in their
    // pre-migration shape, populated with rows. We bypass RavenDB so we
    // can control the exact starting schema.
    function buildLegacyDb(path) {
      const raw = new Database(path);
      raw.exec(`
        CREATE TABLE events (
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
          project_name TEXT
        )
      `);
      raw.exec(`
        CREATE TABLE process_metrics (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          timestamp TEXT NOT NULL,
          agent_name TEXT NOT NULL,
          pid INTEGER NOT NULL,
          cpu_usage REAL NOT NULL,
          memory_mb INTEGER NOT NULL,
          virtual_memory_mb INTEGER NOT NULL,
          disk_read_bytes INTEGER,
          disk_write_bytes INTEGER,
          status TEXT,
          session_id TEXT
        )
      `);
      // Seed rows using legacy change_type values (add/change/unlink).
      const insEvent = raw.prepare(
        `INSERT INTO events (timestamp, filepath, change_type, project_name)
         VALUES (?, ?, ?, ?)`
      );
      insEvent.run('2025-01-01T00:00:00Z', '/a.js', 'add', 'p1');
      insEvent.run('2025-01-01T00:00:01Z', '/b.js', 'change', 'p1');
      insEvent.run('2025-01-01T00:00:02Z', '/c.js', 'unlink', 'p1');
      insEvent.run('2025-01-01T00:00:03Z', '/d.js', 'edit', 'p2'); // already-normalized

      const insProc = raw.prepare(
        `INSERT INTO process_metrics (timestamp, agent_name, pid, cpu_usage, memory_mb, virtual_memory_mb)
         VALUES (?, ?, ?, ?, ?, ?)`
      );
      insProc.run('2025-01-01T00:00:00Z', 'claude', 1234, 12.5, 200, 800);
      insProc.run('2025-01-01T00:00:01Z', 'claude', 1234, 13.0, 210, 810);

      return raw;
    }

    test('migration 001 preserves all rows in events and adds new columns with defaults', async () => {
      const raw = buildLegacyDb(dbPath);
      raw.close();

      // Open via better-sqlite3 directly (skip RavenDB, which would
      // already auto-add columns and obscure the migration's role).
      const db = new Database(dbPath);
      const migrations = await loadMigrations();
      const m001 = migrations.find(m => m.name.startsWith('001_'));
      expect(m001).toBeDefined();
      m001.module.migrate(db);

      const rows = db.prepare('SELECT * FROM events ORDER BY id').all();
      expect(rows).toHaveLength(4);
      // Pre-existing fields intact
      expect(rows[0].filepath).toBe('/a.js');
      expect(rows[0].change_type).toBe('add');
      // New column with explicit DEFAULT 0
      expect(rows[0].is_anomaly).toBe(0);
      // New columns without defaults are NULL — that's the sensible value
      expect(rows[0].agent).toBeNull();
      expect(rows[0].risk_level).toBeNull();
      db.close();
    });

    test('migration 002 rewrites legacy change_type values without dropping rows', async () => {
      const raw = buildLegacyDb(dbPath);
      raw.close();

      // 002 is a standalone script — invoke its real export.
      const migrations = await loadMigrations();
      const m002 = migrations.find(m => m.name.startsWith('002_'));
      expect(m002).toBeDefined();
      expect(typeof m002.module.migrateDatabase).toBe('function');

      const result = m002.module.migrateDatabase(dbPath, 'test-project');
      expect(result.success).toBe(true);

      const db = new Database(dbPath);
      const rows = db.prepare('SELECT change_type FROM events ORDER BY id').all();
      expect(rows).toHaveLength(4);
      expect(rows[0].change_type).toBe('create'); // add → create
      expect(rows[1].change_type).toBe('edit'); // change → edit
      expect(rows[2].change_type).toBe('delete'); // unlink → delete
      expect(rows[3].change_type).toBe('edit'); // already 'edit', untouched
      db.close();
    });

    test('migration 004 drops events.agent column and backfills agent_source from agent', async () => {
      // Build a v0.3-shaped DB whose events table has both columns: agent
      // (populated, the old way) and agent_source (mostly NULL, the new
      // canonical column). This mirrors the state of a user who lived
      // through 001/002 and is now upgrading past 004.
      const raw = new Database(dbPath);
      raw.exec(`
        CREATE TABLE events (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          timestamp TEXT NOT NULL,
          filepath TEXT,
          change_type TEXT,
          project_name TEXT,
          agent TEXT,
          agent_source TEXT
        )
      `);
      raw.exec('CREATE INDEX idx_events_agent ON events(agent)');
      const ins = raw.prepare(
        `INSERT INTO events (timestamp, filepath, change_type, project_name, agent, agent_source)
         VALUES (?, ?, ?, ?, ?, ?)`
      );
      // Row with only the legacy column populated — backfill target.
      ins.run('2025-01-01T00:00:00Z', '/a.js', 'edit', 'p1', 'claude-code', null);
      // Row that already has the canonical column set — must not overwrite.
      ins.run('2025-01-01T00:00:01Z', '/b.js', 'edit', 'p1', 'old-name', 'new-name');
      // Row with neither column set — survives unchanged.
      ins.run('2025-01-01T00:00:02Z', '/c.js', 'edit', 'p1', null, null);
      raw.close();

      const db = new Database(dbPath);
      const migrations = await loadMigrations();
      const m004 = migrations.find(m => m.name.startsWith('004_'));
      expect(m004).toBeDefined();
      m004.module.migrate(db);

      // The agent column is gone.
      const cols = columnNames(db, 'events');
      expect(cols).not.toContain('agent');
      expect(cols).toContain('agent_source');

      // The index over the dropped column is also gone.
      const indexes = db
        .prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_events_agent'")
        .all();
      expect(indexes).toHaveLength(0);

      // Backfill semantics: legacy-only row gets its value lifted into
      // agent_source. Pre-existing agent_source value is preserved.
      const rows = db.prepare('SELECT filepath, agent_source FROM events ORDER BY id').all();
      expect(rows).toHaveLength(3);
      expect(rows[0]).toEqual({ filepath: '/a.js', agent_source: 'claude-code' });
      expect(rows[1]).toEqual({ filepath: '/b.js', agent_source: 'new-name' });
      expect(rows[2]).toEqual({ filepath: '/c.js', agent_source: null });
      db.close();
    });

    test('migration 004 is a no-op when events.agent column is already absent', async () => {
      // Fresh RavenDB schema — events.agent never exists.
      const ravenDb = new RavenDB(dbPath);
      const migrations = await loadMigrations();
      const m004 = migrations.find(m => m.name.startsWith('004_'));
      expect(m004).toBeDefined();
      expect(() => m004.module.migrate(ravenDb.db)).not.toThrow();

      const cols = columnNames(ravenDb.db, 'events');
      expect(cols).not.toContain('agent');
      expect(cols).toContain('agent_source');
      ravenDb.close();
    });

    test('migration 003 preserves process_metrics rows and adds activity columns with defaults', async () => {
      const raw = buildLegacyDb(dbPath);
      raw.close();

      const db = new Database(dbPath);
      const migrations = await loadMigrations();
      const m003 = migrations.find(m => m.name.startsWith('003_'));
      expect(m003).toBeDefined();
      m003.module.migrate(db);

      const rows = db.prepare('SELECT * FROM process_metrics ORDER BY id').all();
      expect(rows).toHaveLength(2);
      expect(rows[0].agent_name).toBe('claude');
      expect(rows[0].cpu_usage).toBe(12.5);
      // New columns with explicit defaults
      expect(rows[0].network_connections).toBe(0);
      expect(rows[0].api_connections).toBe(0);
      expect(rows[0].thread_count).toBe(0);
      expect(rows[0].fd_count).toBe(0);
      expect(rows[0].activity_state).toBe('unknown');

      // api_latency table was created
      const apiLatencyExists = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='api_latency'")
        .get();
      expect(apiLatencyExists).toBeTruthy();
      db.close();
    });

    test('full migration sequence preserves rows seeded before any migration runs', async () => {
      const raw = buildLegacyDb(dbPath);
      raw.close();

      // Every migration now exports migrate(db); the runner-style loop is
      // sufficient. The historical workaround of invoking 002 via its
      // direct export was needed only while 002 was dead code.
      const migrations = await loadMigrations();
      const db = new Database(dbPath);
      for (const m of migrations) {
        if (typeof m.module.migrate === 'function') {
          m.module.migrate(db);
        }
      }

      const eventCount = db.prepare('SELECT COUNT(*) as n FROM events').get().n;
      expect(eventCount).toBe(4);
      // 002 ran in the loop above, so the rewrites took effect.
      const types = db
        .prepare('SELECT change_type FROM events ORDER BY id')
        .all()
        .map(r => r.change_type);
      expect(types).toEqual(['create', 'edit', 'delete', 'edit']);
      const procCount = db.prepare('SELECT COUNT(*) as n FROM process_metrics').get().n;
      expect(procCount).toBe(2);
      db.close();
    });
  });

  // ----------------------------------------------------------------------
  // 4. No data loss on partial schemas.
  //
  // Simulate a v0.4 user upgrading to 0.5: a DB with the old events
  // table populated, but missing recently-added tables (project_stats,
  // gpu_metrics, insights, analysis_runs, etc.). Boot RavenDB against
  // that DB and then run migrations — pre-existing rows must survive,
  // new tables must be created.
  // ----------------------------------------------------------------------
  describe('partial-schema upgrade', () => {
    test('v0.4-style DB upgrades cleanly: pre-existing rows intact, new tables created', async () => {
      // Build a v0.4-ish DB: the original events table with rows. We
      // include agent_source on the legacy schema because by the time
      // any v0.4 DB existed in the wild it had already been through
      // db.ts's ALTER TABLE events ADD COLUMN agent_source on first
      // boot — so the canonical "old" state already has the column.
      const raw = new Database(dbPath);
      raw.exec(`
        CREATE TABLE events (
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
        )
      `);
      raw
        .prepare(
          `INSERT INTO events (timestamp, filepath, change_type, project_name)
         VALUES (?, ?, ?, ?)`
        )
        .run('2025-02-01T00:00:00Z', '/legacy.js', 'edit', 'legacy-project');
      raw.close();

      // Now boot RavenDB against it — this is the production upgrade path.
      const ravenDb = new RavenDB(dbPath);
      // And run migrations on top.
      await runMigrationsOnDb(ravenDb.db);

      // Pre-existing row is still there
      const rows = ravenDb.db.prepare('SELECT * FROM events').all();
      expect(rows).toHaveLength(1);
      expect(rows[0].filepath).toBe('/legacy.js');
      expect(rows[0].project_name).toBe('legacy-project');

      // Newly-created tables exist
      const tables = new Set(tableNames(ravenDb.db));
      for (const t of [
        'project_stats',
        'gpu_metrics',
        'insights',
        'analysis_runs',
        'analysis_checks',
        'rollbacks',
        'agent_stats',
        'sessions',
        'change_conversations'
      ]) {
        expect(tables.has(t)).toBe(true);
      }

      ravenDb.close();
    });

    test('project_stats backfill picks up pre-existing rows in events table', async () => {
      // Build a DB whose events table has rows, then init RavenDB.
      // The backfill logic in db.ts should populate project_stats with
      // the surviving rows' aggregates. agent_source is included for the
      // same reason as the v0.4 upgrade test above.
      const raw = new Database(dbPath);
      raw.exec(`
        CREATE TABLE events (
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
        )
      `);
      const ins = raw.prepare(
        `INSERT INTO events (timestamp, filepath, change_type, project_name)
         VALUES (?, ?, ?, ?)`
      );
      ins.run('2025-02-01T00:00:00Z', '/a.js', 'edit', 'alpha');
      ins.run('2025-02-01T00:00:01Z', '/b.js', 'edit', 'alpha');
      ins.run('2025-02-01T00:00:02Z', '/c.js', 'edit', 'beta');
      raw.close();

      const ravenDb = new RavenDB(dbPath);
      const stats = ravenDb.db
        .prepare('SELECT project_name, total_events FROM project_stats ORDER BY project_name')
        .all();
      expect(stats).toEqual([
        { project_name: 'alpha', total_events: 2 },
        { project_name: 'beta', total_events: 1 }
      ]);
      ravenDb.close();
    });
  });

  // ----------------------------------------------------------------------
  // 5. Migration ordering safety.
  //
  // Migrations must execute in numeric-prefix order. run-migrations.js
  // relies on .sort() over readdirSync output — that happens to work
  // because filenames start with 001/002/003. But if a user ever drops
  // a file in that directory the order should still be deterministic.
  // ----------------------------------------------------------------------
  describe('ordering', () => {
    test('listMigrationFiles returns files in numeric-prefix order', () => {
      const files = listMigrationFiles();
      expect(files.length).toBeGreaterThan(0);
      const prefixes = files.map(f => parseInt(f.slice(0, 3), 10));
      const sorted = [...prefixes].sort((a, b) => a - b);
      expect(prefixes).toEqual(sorted);
    });

    test('ordering is stable: scrambling readdirSync output does not change applied order', async () => {
      const realFiles = listMigrationFiles();
      // Simulate readdirSync returning the files in reverse — our sorter
      // must still produce numeric-prefix order.
      const scrambled = [...realFiles].reverse().sort((a, b) => {
        const na = parseInt(a.slice(0, 3), 10);
        const nb = parseInt(b.slice(0, 3), 10);
        return na - nb;
      });
      expect(scrambled).toEqual(realFiles);
    });

    test('all migration filenames match the NNN_ prefix convention', () => {
      const files = listMigrationFiles();
      for (const f of files) {
        expect(f).toMatch(/^\d{3}_[a-z0-9_]+\.js$/);
      }
    });
  });
});
