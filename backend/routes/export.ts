/**
 * Data Export Routes — `/api/export`
 *
 * Delivers on Raven's "your data is yours" promise: a one-click full dump of
 * the local SQLite database in the format of the user's choice.
 *
 * Endpoints:
 *   GET /api/export                  → descriptor JSON (formats, sizes, row counts)
 *   GET /api/export?format=sqlite    → hot-copy of the live DB via SQLite's
 *                                      online backup API (won't block writers)
 *   GET /api/export?format=jsonl     → all high-value tables, line-delimited JSON
 *   GET /api/export?format=csv       → tarball (.tar.gz) of one CSV per table.
 *                                      We use tar+gzip because the existing
 *                                      tar-stream dep is already on disk;
 *                                      adding archiver/jszip just for this
 *                                      would be heavy.
 *
 * Safety:
 *   - sqlite export uses db.backup() (online backup API). The live DB is never
 *     locked, and the resulting file is a self-consistent snapshot.
 *   - All exports are capped at MAX_EXPORT_BYTES; we 413 if the underlying
 *     DB is already larger to avoid handing back something the user can't
 *     download.
 *   - Temp files are unlinked on stream close (including client disconnects).
 */

import express, { Request, Response, Router } from 'express';
import { createReadStream, statSync } from 'fs';
import { unlink } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { randomBytes } from 'crypto';
import { createGzip } from 'zlib';
import { pipeline } from 'stream/promises';
// @ts-expect-error — tar-stream has no @types package; we only use pack().entry/finalize.

import tarPack from 'tar-stream';
import type { RavenDB } from '../db.js';
import { logger } from '../utils/logger.js';
import {
  createSchemaRepository,
  type SchemaRepository
} from '../repositories/schema-repository.js';

const MAX_EXPORT_BYTES = 5 * 1024 * 1024 * 1024; // 5 GB hard cap

// Tables that carry user-meaningful history. Anything not here is either
// transient cache (e.g. raven_metrics samples, which churn) or an internal
// trigger-maintained counter that's reconstructible from the source tables.
// We still verify each table exists at request time before dumping — the
// schema may shrink across versions, and we'd rather skip a missing table
// than 500.
const HIGH_VALUE_TABLES = [
  'events',
  'agent_events',
  'syntax_errors',
  'token_usage',
  'project_stats',
  'pattern_warnings',
  'app_errors',
  'test_results',
  'diff_risk_scores',
  'diff_annotations',
  'subagent_tree',
  'insights',
  'analysis_runs',
  'analysis_checks',
  'api_latency'
] as const;

function rowCount(db: RavenDB, table: string): number {
  // Table name comes from sqlite_master, not user input.
  // eslint-disable-next-line no-restricted-syntax
  const row = db.db.prepare(`SELECT COUNT(*) AS c FROM "${table}"`).get() as { c: number };
  return row.c;
}

function isoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return '';
  let str: string;
  if (typeof value === 'string') str = value;
  else if (typeof value === 'number' || typeof value === 'boolean') str = String(value);
  else if (Buffer.isBuffer(value)) str = `<blob:${value.length}b>`;
  else str = JSON.stringify(value);
  // Quote if it contains comma, quote, newline, or carriage return.
  if (/[",\r\n]/.test(str)) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

interface ExportDeps {
  db: RavenDB;
  dbPath: string;
}

export function createExportRouter({ db, dbPath }: ExportDeps): Router {
  const router = express.Router();
  const schema = createSchemaRepository(db);

  router.get('/', async (req: Request, res: Response) => {
    const format = (req.query.format as string | undefined)?.toLowerCase();

    try {
      // Descriptor — no format
      if (!format) {
        const tables = schema.listTables();
        const row_counts: Record<string, number> = {};
        for (const t of tables) {
          try {
            row_counts[t] = rowCount(db, t);
          } catch {
            row_counts[t] = -1;
          }
        }
        let db_size_bytes = 0;
        try {
          db_size_bytes = statSync(dbPath).size;
        } catch {
          /* DB may live elsewhere or be inaccessible */
        }
        return res.json({
          formats: ['sqlite', 'jsonl', 'csv'],
          db_size_bytes,
          table_count: tables.length,
          row_counts,
          max_export_bytes: MAX_EXPORT_BYTES,
          generated_at: new Date().toISOString()
        });
      }

      // Size precheck — applies to all binary exports. JSONL/CSV are derived
      // streams that won't necessarily mirror DB size, but the DB itself is
      // the upper bound on what we can read, so the same cap is reasonable.
      let dbSize = 0;
      try {
        dbSize = statSync(dbPath).size;
      } catch {
        /* fall through — we'll discover failure when we try to read */
      }
      if (dbSize > MAX_EXPORT_BYTES) {
        return res.status(413).json({
          error: 'export_too_large',
          message: `Database is ${dbSize} bytes, exceeds the ${MAX_EXPORT_BYTES}-byte export cap.`,
          db_size_bytes: dbSize,
          max_export_bytes: MAX_EXPORT_BYTES
        });
      }

      if (format === 'sqlite') {
        return await streamSqliteBackup(db, res);
      }
      if (format === 'jsonl') {
        return streamJsonl(db, schema, res);
      }
      if (format === 'csv') {
        return await streamCsvTarball(db, schema, res);
      }

      return res.status(400).json({
        error: 'unknown_format',
        message: `Unknown format "${format}". Use sqlite | jsonl | csv, or omit for descriptor.`
      });
    } catch (err) {
      logger.error('Export failed:', err as Error);
      if (!res.headersSent) {
        return res.status(500).json({ error: 'export_failed', message: (err as Error).message });
      }
      // Headers already out; close the stream.
      try {
        res.end();
      } catch {
        /* noop */
      }
    }
  });

  return router;
}

// ==================== sqlite (online backup) ====================

async function streamSqliteBackup(db: RavenDB, res: Response): Promise<void> {
  const tempName = `raven-backup-${Date.now()}-${randomBytes(4).toString('hex')}.db`;
  const tempPath = join(tmpdir(), tempName);

  // SQLite's online backup API — copies pages incrementally, safe while
  // writers are active. Returns a Promise that resolves when the snapshot
  // file is fully written and closed.
  try {
    await db.db.backup(tempPath);
  } catch (err) {
    logger.error('SQLite backup() failed:', err as Error);
    res.status(500).json({ error: 'backup_failed', message: (err as Error).message });
    // Best-effort cleanup if backup() created a partial file before failing.
    await unlink(tempPath).catch(() => {});
    return;
  }

  let size = 0;
  try {
    size = statSync(tempPath).size;
  } catch {
    /* size will be 0; pipeline will still work */
  }

  if (size > MAX_EXPORT_BYTES) {
    await unlink(tempPath).catch(() => {});
    res.status(413).json({
      error: 'export_too_large',
      message: `Snapshot is ${size} bytes, exceeds the ${MAX_EXPORT_BYTES}-byte cap.`,
      max_export_bytes: MAX_EXPORT_BYTES
    });
    return;
  }

  const filename = `raven-backup-${isoDate()}.db`;
  res.setHeader('Content-Type', 'application/x-sqlite3');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  if (size > 0) res.setHeader('Content-Length', String(size));
  res.setHeader('Cache-Control', 'no-store');

  const source = createReadStream(tempPath);
  const cleanup = async () => {
    await unlink(tempPath).catch(() => {});
  };

  try {
    await pipeline(source, res);
  } catch (err) {
    // Client disconnect mid-stream is normal; log at debug-equivalent.
    logger.warn(`sqlite export stream ended early: ${(err as Error).message}`);
  } finally {
    await cleanup();
  }
}

// ==================== jsonl (line-delimited JSON) ====================

function streamJsonl(db: RavenDB, schema: SchemaRepository, res: Response): void {
  const tables = schema.listTablesFiltered(HIGH_VALUE_TABLES);
  const filename = `raven-export-${isoDate()}.jsonl`;

  res.setHeader('Content-Type', 'application/x-ndjson');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Cache-Control', 'no-store');

  let bytesWritten = 0;
  let aborted = false;
  res.on('close', () => {
    aborted = true;
  });

  for (const table of tables) {
    if (aborted) return;
    // Table name comes from a static allowlist intersected with sqlite_master.
    // eslint-disable-next-line no-restricted-syntax
    const stmt = db.db.prepare(`SELECT * FROM "${table}"`);
    for (const row of stmt.iterate() as Iterable<Record<string, unknown>>) {
      if (aborted) return;
      const line = JSON.stringify({ table, row }) + '\n';
      bytesWritten += Buffer.byteLength(line);
      if (bytesWritten > MAX_EXPORT_BYTES) {
        // Emit a final note so consumers know the stream is truncated, then
        // end. We can't switch to a 413 status now — headers are sent.
        res.write(
          JSON.stringify({
            table: '__meta__',
            row: {
              warning: 'export_truncated',
              message: `Exceeded ${MAX_EXPORT_BYTES}-byte cap`,
              bytes_written: bytesWritten
            }
          }) + '\n'
        );
        res.end();
        return;
      }
      res.write(line);
    }
  }
  res.end();
}

// ==================== csv (tarball) ====================

async function streamCsvTarball(
  db: RavenDB,
  schema: SchemaRepository,
  res: Response
): Promise<void> {
  const tables = schema.listTablesFiltered(schema.listTables());
  const filename = `raven-export-${isoDate()}.tar.gz`;

  res.setHeader('Content-Type', 'application/gzip');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Cache-Control', 'no-store');

  const pack: any = (tarPack as any).pack();
  const gzip = createGzip({ level: 6 });

  // Wire pack → gzip → res. Errors anywhere should tear the whole chain
  // down. pipeline() handles that, but we also want to be able to abort
  // the row iteration on client close.
  let aborted = false;
  res.on('close', () => {
    aborted = true;
    try {
      pack.destroy();
    } catch {
      /* noop */
    }
  });

  // Kick the pipeline off in parallel with the producer; await it at the
  // end so the request handler doesn't return before the response is done.
  const pipelineDone = pipeline(pack, gzip, res).catch(err => {
    logger.warn(`csv tarball stream ended early: ${(err as Error).message}`);
  });

  let totalBytes = 0;

  for (const table of tables) {
    if (aborted) break;
    const cols = schema.tableColumns(table);
    if (cols.length === 0) continue;

    // Build the CSV in memory per-table. Streaming each row into tar-stream
    // requires knowing the size up front (tar header has a size field), so
    // we buffer per file. The user can still download in chunks via the
    // outer gzip+TCP stream — we just can't avoid one buffer per table.
    const header = cols.map(csvEscape).join(',') + '\n';
    const chunks: Buffer[] = [Buffer.from(header, 'utf8')];
    // eslint-disable-next-line no-restricted-syntax
    const stmt = db.db.prepare(`SELECT * FROM "${table}"`);
    for (const row of stmt.iterate() as Iterable<Record<string, unknown>>) {
      if (aborted) break;
      const line = cols.map(c => csvEscape(row[c])).join(',') + '\n';
      chunks.push(Buffer.from(line, 'utf8'));
    }
    if (aborted) break;

    const body = Buffer.concat(chunks);
    totalBytes += body.length;
    if (totalBytes > MAX_EXPORT_BYTES) {
      // Already streaming; write a marker file and stop.
      const note = Buffer.from(
        `Export truncated: exceeded ${MAX_EXPORT_BYTES}-byte cap at table "${table}".\n`,
        'utf8'
      );
      await new Promise<void>(resolve => {
        pack.entry({ name: 'TRUNCATED.txt', size: note.length }, note, () => resolve());
      });
      break;
    }

    await new Promise<void>((resolve, reject) => {
      pack.entry({ name: `${table}.csv`, size: body.length }, body, (err: Error | null) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  pack.finalize();
  await pipelineDone;
}
