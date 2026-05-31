/**
 * Storage Repository — owns disk-level operations on Raven's data directories.
 *
 * Lives in `repositories/` because:
 *  1. It opens external SQLite databases (vacuum/clean across .db files in
 *     the storage dir) — that direct better-sqlite3 use is allowed only here
 *     by the architecture rule.
 *  2. It owns SQL queries against the active database (per-project rollups).
 *
 * Path-traversal validation lives here too — every public method that takes
 * a `dbname` validates it against the same regex.
 */

import fs from 'fs/promises';
import { join } from 'path';
import { execFile as execFileCb } from 'child_process';
import { promisify } from 'util';
import Database from 'better-sqlite3';
import type { RavenDB } from '../db.js';

const execFile = promisify(execFileCb);

const SAFE_NAME = /^[a-zA-Z0-9_-]+$/;
const SAFE_IDENT = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

export class InvalidNameError extends Error {
  constructor(name: string) {
    super(`Invalid name: ${name}`);
    this.name = 'InvalidNameError';
  }
}

export class NotFoundError extends Error {
  constructor(thing: string) {
    super(`Not found: ${thing}`);
    this.name = 'NotFoundError';
  }
}

interface DatabaseEntry {
  name: string;
  filename: string;
  size: number;
  modified: Date;
  isActive: boolean;
}

interface SnapshotGroup {
  project: string;
  files: number;
  size: number;
  oldest: Date;
  newest: Date;
}

interface OverviewStats {
  totalSize: number;
  databases: DatabaseEntry[];
  snapshots: SnapshotGroup[];
  otherFiles: { config: number; triggersLog: number };
  ravenDir: string;
  timestamp: string;
}

interface ProjectStorageRow {
  project_name: string;
  event_count: number;
  file_count: number;
  agent_event_count: number;
  first_event: string;
  last_event: string;
  estimated_size: number;
}

interface ProjectDiskRow {
  project_name: string;
  path: string | null;
  /** Source-tree size on disk, respecting ignore patterns. null = path
   *  unreachable / not configured. */
  disk_bytes: number | null;
  /** File count on disk after applying ignores. null when disk_bytes is null. */
  disk_files: number | null;
  /** Bytes Raven is using to track this project (events.diff + filepath +
   *  agent_events.message + metadata + file). Survives retention because we
   *  also pull stats from project_stats counters where they exist. */
  db_bytes: number;
  /** True when the project source path exists on disk. */
  path_exists: boolean;
  /** Tail of the duration in ms — surfaced for the UI when the scan was
   *  slow enough to warrant a tooltip. */
  scan_ms: number;
}

interface VacuumResult {
  sizeBefore: number;
  sizeAfter: number;
  spaceSaved: number;
  percentSaved: number;
}

interface CleanResult {
  totalDeleted: number;
  deletedPerTable: Record<string, number>;
  cutoffDate: string;
}

interface RetentionPolicy {
  enabled: boolean;
  retentionDays: number;
  autoCleanup: boolean;
  cleanupInterval: 'daily' | 'weekly' | 'monthly';
}

const DEFAULT_RETENTION: RetentionPolicy = {
  enabled: false,
  retentionDays: 30,
  autoCleanup: false,
  cleanupInterval: 'weekly'
};

export interface StorageRepository {
  overview(): Promise<OverviewStats>;
  perProject(): ProjectStorageRow[];
  /** Real disk + DB bytes per project. Spawns `du` per source path (in
   *  parallel) and joins SQL byte sums. Sorted by disk_bytes desc, NULL
   *  paths last. */
  diskUsage(
    projects: Array<{ name: string; path: string; ignorePatterns?: string[] }>
  ): Promise<ProjectDiskRow[]>;
  databasePath(dbname: string): string;
  /** Throws NotFoundError if the file doesn't exist. */
  ensureDatabaseExists(dbname: string): Promise<void>;
  vacuum(dbname: string): Promise<VacuumResult>;
  cleanOlderThan(dbname: string, days: number): Promise<CleanResult>;
  readRetention(): Promise<RetentionPolicy>;
  writeRetention(policy: RetentionPolicy): Promise<void>;
}

interface StorageDeps {
  db: RavenDB;
  ravenDir: string;
  snapshotsDir: string;
}

export function createStorageRepository({
  db,
  ravenDir,
  snapshotsDir
}: StorageDeps): StorageRepository {
  const dbDir = join(ravenDir, 'db');

  function validateDbName(name: string): void {
    if (!name || name.includes('..') || name.includes('/') || !SAFE_NAME.test(name)) {
      throw new InvalidNameError(name);
    }
  }

  function dbPath(name: string): string {
    return join(dbDir, `${name}.db`);
  }

  return {
    async overview() {
      const dbFiles = (await fs.readdir(dbDir)).filter(f => f.endsWith('.db'));
      const databases: DatabaseEntry[] = await Promise.all(
        dbFiles.map(async dbFile => {
          const stats = await fs.stat(join(dbDir, dbFile));
          const name = dbFile.replace('.db', '');
          return {
            name,
            filename: dbFile,
            size: stats.size,
            modified: stats.mtime,
            isActive: name === 'raven'
          };
        })
      );

      const snapshots: SnapshotGroup[] = [];
      try {
        await fs.access(snapshotsDir);
        const entries = await fs.readdir(snapshotsDir);
        const entryStats = await Promise.all(
          entries.map(async entry => {
            const entryPath = join(snapshotsDir, entry);
            const stat = await fs.stat(entryPath);
            const fileCount = stat.isDirectory() ? (await fs.readdir(entryPath)).length : 0;
            return { entry, entryPath, stat, fileCount };
          })
        );

        let flatCount = 0;
        let oldest: Date | null = null;
        let newest: Date | null = null;

        for (const { entry, stat, fileCount } of entryStats) {
          if (stat.isDirectory()) {
            snapshots.push({
              project: entry,
              files: fileCount,
              size: 0,
              oldest: stat.mtime,
              newest: stat.mtime
            });
          } else if (stat.isFile()) {
            flatCount++;
            if (!oldest || stat.mtime < oldest) oldest = stat.mtime;
            if (!newest || stat.mtime > newest) newest = stat.mtime;
          }
        }
        if (flatCount > 0) {
          snapshots.push({
            project: '(unscoped)',
            files: flatCount,
            size: 0,
            oldest: oldest ?? new Date(),
            newest: newest ?? new Date()
          });
        }
      } catch {
        // Snapshots directory doesn't exist — leave empty
      }

      let configSize = 0;
      let triggersLogSize = 0;
      try {
        configSize = (await fs.stat(join(ravenDir, 'config.toml'))).size;
      } catch {
        /* missing */
      }
      try {
        triggersLogSize = (await fs.stat(join(ravenDir, 'triggers.log'))).size;
      } catch {
        /* missing */
      }

      const totalSize = databases.reduce((sum, d) => sum + d.size, 0);

      return {
        totalSize,
        databases: databases.sort((a, b) => b.size - a.size),
        snapshots: snapshots.sort((a, b) => b.size - a.size),
        otherFiles: { config: configSize, triggersLog: triggersLogSize },
        ravenDir,
        timestamp: new Date().toISOString()
      };
    },

    perProject() {
      const projects = db.db
        .prepare(
          `SELECT
             project_name,
             COUNT(*) as event_count,
             COUNT(DISTINCT filepath) as file_count,
             MIN(timestamp) as first_event,
             MAX(timestamp) as last_event,
             SUM(COALESCE(event_size, 0)) as total_size
           FROM events
           WHERE project_name IS NOT NULL
           GROUP BY project_name
           ORDER BY event_count DESC`
        )
        .all() as Array<{
        project_name: string;
        event_count: number;
        file_count: number;
        first_event: string;
        last_event: string;
        total_size: number;
      }>;

      const agentEvents = db.db
        .prepare(
          `SELECT project_name, COUNT(*) as agent_event_count
           FROM agent_events
           WHERE project_name IS NOT NULL
           GROUP BY project_name`
        )
        .all() as Array<{ project_name: string; agent_event_count: number }>;
      const agentMap = new Map(agentEvents.map(a => [a.project_name, a.agent_event_count]));

      return projects.map(p => ({
        project_name: p.project_name,
        event_count: p.event_count,
        file_count: p.file_count,
        agent_event_count: agentMap.get(p.project_name) || 0,
        first_event: p.first_event,
        last_event: p.last_event,
        estimated_size: p.total_size
      }));
    },

    async diskUsage(projects) {
      // Per-project DB byte totals. LENGTH() on TEXT columns returns the
      // string byte length in SQLite; nulls are coerced to 0. The diff
      // column dominates by far — typical events row is 80 bytes without
      // diff, multi-KB with one. Agent events add message + metadata
      // payloads. Filepath, file_hash, and a few numeric columns round it
      // out but the diff/payload bytes are the only ones worth tracking.
      const eventBytes = db.db
        .prepare(
          `SELECT project_name,
                  SUM(COALESCE(LENGTH(diff), 0) + COALESCE(LENGTH(filepath), 0)
                      + COALESCE(LENGTH(file_hash), 0)) as bytes
             FROM events
            WHERE project_name IS NOT NULL AND project_name != ''
            GROUP BY project_name`
        )
        .all() as Array<{ project_name: string; bytes: number }>;
      const agentBytes = db.db
        .prepare(
          `SELECT project_name,
                  SUM(COALESCE(LENGTH(message), 0) + COALESCE(LENGTH(metadata), 0)
                      + COALESCE(LENGTH(file), 0)) as bytes
             FROM agent_events
            WHERE project_name IS NOT NULL AND project_name != ''
            GROUP BY project_name`
        )
        .all() as Array<{ project_name: string; bytes: number }>;
      const dbMap = new Map<string, number>();
      for (const r of eventBytes) dbMap.set(r.project_name, r.bytes ?? 0);
      for (const r of agentBytes) {
        dbMap.set(r.project_name, (dbMap.get(r.project_name) ?? 0) + (r.bytes ?? 0));
      }

      // Disk scan in parallel. `du -sb` prints bytes (Linux GNU du); we use
      // --exclude per ignore pattern. Default ignores get applied in addition
      // to the project's configured ones because every Node/Python tree
      // accumulates them and they dominate the total. Bounded execution
      // time per project so a giant tree can't hang the response.
      const DEFAULT_IGNORES = [
        'node_modules',
        '.git',
        'dist',
        'build',
        'target',
        'venv',
        '.venv',
        '.next',
        '.cache'
      ];

      const scanOne = async (project: {
        name: string;
        path: string;
        ignorePatterns?: string[];
      }): Promise<ProjectDiskRow> => {
        const start = Date.now();
        let pathExists = false;
        try {
          const stat = await fs.stat(project.path);
          pathExists = stat.isDirectory();
        } catch {
          /* unreachable / missing */
        }
        if (!pathExists) {
          return {
            project_name: project.name,
            path: project.path,
            disk_bytes: null,
            disk_files: null,
            db_bytes: dbMap.get(project.name) ?? 0,
            path_exists: false,
            scan_ms: Date.now() - start
          };
        }

        // Merge default + per-project ignores, dedupe.
        const ignores = Array.from(
          new Set([...DEFAULT_IGNORES, ...(project.ignorePatterns ?? [])])
        ).map(p => p.replace(/\/.*$/, '').replace(/\/$/, '')); // normalize "node_modules/**" → "node_modules"

        // du -sb: -s summary, -b bytes (also implies --apparent-size)
        // --exclude is repeatable; matches anywhere in the tree.
        const args = ['-sb'];
        for (const ig of ignores) {
          if (ig) args.push(`--exclude=${ig}`);
        }
        args.push(project.path);

        let bytes: number | null = null;
        let files: number | null = null;
        try {
          const { stdout } = await execFile('du', args, {
            timeout: 15_000,
            maxBuffer: 4 * 1024 * 1024
          });
          const m = stdout.trim().match(/^(\d+)/);
          if (m) bytes = parseInt(m[1], 10);
        } catch {
          // du may fail on permission errors or timeout — leave bytes null.
        }
        // File count via find. Cheap relative to du; same exclude logic.
        try {
          const findArgs: string[] = [project.path];
          for (const ig of ignores) {
            if (ig) {
              findArgs.push('-name', ig, '-prune', '-o');
            }
          }
          findArgs.push('-type', 'f', '-print');
          const { stdout } = await execFile('find', findArgs, {
            timeout: 15_000,
            maxBuffer: 16 * 1024 * 1024
          });
          files = stdout ? stdout.split('\n').filter(Boolean).length : 0;
        } catch {
          /* ignore */
        }

        return {
          project_name: project.name,
          path: project.path,
          disk_bytes: bytes,
          disk_files: files,
          db_bytes: dbMap.get(project.name) ?? 0,
          path_exists: true,
          scan_ms: Date.now() - start
        };
      };

      const rows = await Promise.all(projects.map(scanOne));

      // Also surface DB-tracked projects whose source dir we don't know about
      // (e.g. removed from config but events still in DB).
      const known = new Set(rows.map(r => r.project_name));
      for (const [name, bytes] of dbMap) {
        if (!known.has(name)) {
          rows.push({
            project_name: name,
            path: null,
            disk_bytes: null,
            disk_files: null,
            db_bytes: bytes,
            path_exists: false,
            scan_ms: 0
          });
        }
      }

      // Sort: configured + reachable + biggest disk first; unreachable last.
      rows.sort((a, b) => {
        const ax = a.disk_bytes ?? -1;
        const bx = b.disk_bytes ?? -1;
        if (ax !== bx) return bx - ax;
        return b.db_bytes - a.db_bytes;
      });

      return rows;
    },

    databasePath(dbname) {
      validateDbName(dbname);
      return dbPath(dbname);
    },

    async ensureDatabaseExists(dbname) {
      validateDbName(dbname);
      try {
        await fs.access(dbPath(dbname));
      } catch {
        throw new NotFoundError(`database ${dbname}`);
      }
    },

    async vacuum(dbname) {
      validateDbName(dbname);
      const path = dbPath(dbname);
      try {
        await fs.access(path);
      } catch {
        throw new NotFoundError(`database ${dbname}`);
      }
      const sizeBefore = (await fs.stat(path)).size;
      const conn = new Database(path);
      try {
        conn.pragma('wal_checkpoint(TRUNCATE)');
        conn.exec('VACUUM');
      } finally {
        conn.close();
      }
      const sizeAfter = (await fs.stat(path)).size;
      const spaceSaved = sizeBefore - sizeAfter;
      return {
        sizeBefore,
        sizeAfter,
        spaceSaved,
        percentSaved: sizeBefore > 0 ? +((spaceSaved / sizeBefore) * 100).toFixed(2) : 0
      };
    },

    async cleanOlderThan(dbname, days) {
      validateDbName(dbname);
      if (!Number.isFinite(days) || days < 1 || days > 365) {
        throw new InvalidNameError(`days=${days}`);
      }
      const path = dbPath(dbname);
      try {
        await fs.access(path);
      } catch {
        throw new NotFoundError(`database ${dbname}`);
      }

      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - days);
      const cutoffTimestamp = cutoff.toISOString();

      const conn = new Database(path);
      let totalDeleted = 0;
      const deletedPerTable: Record<string, number> = {};
      try {
        const tables = conn
          .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
          .all() as { name: string }[];

        for (const table of tables) {
          if (!SAFE_IDENT.test(table.name)) continue;
          const cols = conn.prepare(`PRAGMA table_info(${table.name})`).all() as Array<{
            name: string;
          }>;
          const tsCol = cols.find(c => c.name === 'timestamp' || c.name === 'created_at');
          if (!tsCol || !SAFE_IDENT.test(tsCol.name)) continue;
          const result = conn
            .prepare(`DELETE FROM ${table.name} WHERE ${tsCol.name} < ?`)
            .run(cutoffTimestamp);
          if (result.changes > 0) {
            deletedPerTable[table.name] = result.changes;
            totalDeleted += result.changes;
          }
        }
      } finally {
        conn.close();
      }

      return { totalDeleted, deletedPerTable, cutoffDate: cutoffTimestamp };
    },

    async readRetention() {
      const path = join(ravenDir, 'retention-policy.json');
      try {
        await fs.access(path);
      } catch {
        return DEFAULT_RETENTION;
      }
      const data = await fs.readFile(path, 'utf-8');
      return JSON.parse(data) as RetentionPolicy;
    },

    async writeRetention(policy) {
      const path = join(ravenDir, 'retention-policy.json');
      await fs.writeFile(path, JSON.stringify(policy, null, 2), 'utf-8');
    }
  };
}
