/**
 * Sync export — Phase 1 of the multi-machine roll-up design.
 *
 * GET /api/sync/export?since=<table>:<cursor>&since=<table>:<cursor>
 *
 * Streams NDJSON. Each line is `{table, row}`; the final line is
 * `{done: true, host_id, host_name, schema_version, cursors}`.
 *
 * Bearer-token auth against `.raven/peers.json`. If no peers are configured
 * the endpoint is dormant (503) — Phase 1 ships the capability without any
 * aggregator on the other side, so silence-by-default is the safe posture.
 *
 * Schema version is bumped here when any tracked table changes shape.
 */

import express, { Request, Response, Router } from 'express';
import type { RavenDB } from '../db.js';
import { logger } from '../utils/logger.js';
import {
  getAcceptedPeerSecrets,
  getHostIdentity,
  isPeerAuthEnabled
} from '../services/host-identity.js';

const SCHEMA_VERSION = 1;

const EXPORTABLE_TABLES = ['events', 'agent_events', 'token_usage', 'api_latency'] as const;
type ExportableTable = (typeof EXPORTABLE_TABLES)[number];

const TABLE_SET = new Set<string>(EXPORTABLE_TABLES);
const ROW_LIMIT = 5_000; // per-table per-request, prevents one host hogging the stream

interface SinceCursor {
  table: ExportableTable;
  cursor: number;
}

function parseSinceParams(value: string | string[] | undefined): SinceCursor[] {
  if (!value) return EXPORTABLE_TABLES.map(table => ({ table, cursor: 0 }));
  const list = Array.isArray(value) ? value : [value];
  const cursors: SinceCursor[] = [];
  for (const entry of list) {
    const [table, cursor] = entry.split(':');
    if (!TABLE_SET.has(table)) continue;
    const n = Number.parseInt(cursor, 10);
    cursors.push({ table: table as ExportableTable, cursor: Number.isFinite(n) ? n : 0 });
  }
  // Fill in any missing tables at cursor=0 so callers don't have to enumerate
  // every table on first call.
  const seen = new Set(cursors.map(c => c.table));
  for (const table of EXPORTABLE_TABLES) {
    if (!seen.has(table)) cursors.push({ table, cursor: 0 });
  }
  return cursors;
}

export function createSyncRouter(db: RavenDB, ravenDir: string): Router {
  const router = express.Router();

  router.get('/export', (req: Request, res: Response) => {
    if (!isPeerAuthEnabled(ravenDir)) {
      res.status(503).json({
        error: 'sync_disabled',
        message: 'No peers configured. Add .raven/peers.json to enable sync.'
      });
      return;
    }

    const auth = req.header('authorization') || '';
    const match = auth.match(/^Bearer\s+(.+)$/i);
    const presented = match ? match[1].trim() : '';
    const accepted = getAcceptedPeerSecrets(ravenDir);
    if (!presented || !accepted.has(presented)) {
      res.status(401).json({ error: 'unauthorized' });
      return;
    }

    const cursors = parseSinceParams(req.query.since as string | string[] | undefined);
    const identity = getHostIdentity(ravenDir);
    const nextCursors: Record<string, number> = {};

    res.setHeader('Content-Type', 'application/x-ndjson');
    res.setHeader('Cache-Control', 'no-store');

    let totalWritten = 0;
    try {
      for (const { table, cursor } of cursors) {
        // Generic table dump for sync — adding repository methods for each table
        // would duplicate the same SELECT four times. The table name is from
        // EXPORTABLE_TABLES (closed allowlist), so this isn't an injection vector.
        // eslint-disable-next-line no-restricted-syntax
        const stmt = db.db.prepare(`SELECT * FROM ${table} WHERE id > ? ORDER BY id ASC LIMIT ?`);
        let highest = cursor;
        let written = 0;
        for (const row of stmt.iterate(cursor, ROW_LIMIT) as Iterable<{ id: number }>) {
          res.write(JSON.stringify({ table, row }) + '\n');
          highest = row.id;
          written += 1;
          totalWritten += 1;
        }
        nextCursors[table] = highest;
        if (written === ROW_LIMIT) {
          // Hit the limit — caller should re-fetch with the new cursor.
          // We still emit the trailer so they know per-table state.
        }
      }

      res.write(
        JSON.stringify({
          done: true,
          host_id: identity.host_id,
          host_name: identity.host_name,
          schema_version: SCHEMA_VERSION,
          cursors: nextCursors,
          rows_written: totalWritten
        }) + '\n'
      );
      res.end();
    } catch (err) {
      logger.error(`sync export failed: ${(err as Error).message}`);
      // Headers may already be sent; safest to just close.
      try {
        res.write(
          JSON.stringify({ error: 'export_failed', message: (err as Error).message }) + '\n'
        );
      } catch {
        /* noop */
      }
      res.end();
    }
  });

  router.get('/identity', (_req: Request, res: Response) => {
    const identity = getHostIdentity(ravenDir);
    res.json({
      host_id: identity.host_id,
      host_name: identity.host_name,
      schema_version: SCHEMA_VERSION,
      sync_enabled: isPeerAuthEnabled(ravenDir),
      exportable_tables: EXPORTABLE_TABLES
    });
  });

  return router;
}
