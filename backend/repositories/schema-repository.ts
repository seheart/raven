/**
 * Schema Repository — SQLite schema introspection for the export tier.
 *
 * Owns the `sqlite_master` / `PRAGMA table_info` reads that the export route
 * uses to discover which tables exist and what columns they carry. These are
 * the only schema-introspection queries in the app, so they live behind one
 * small typed API instead of inline in the route handler.
 *
 * Table names returned here come from sqlite_master (trusted), so `tableColumns`
 * keeps the PRAGMA's string interpolation of the table name — PRAGMA does not
 * accept bound parameters for the table identifier.
 */

import type { RavenDB } from '../db.js';

export interface SchemaRepository {
  /** All non-internal table names, ordered by name. */
  listTables(): string[];
  /** The subset of `candidates` that actually exist as tables. Order follows
   *  the candidates array (intersection preserves the caller's ordering). */
  listTablesFiltered(candidates: readonly string[]): string[];
  /** Column names for a table. The name must come from sqlite_master. */
  tableColumns(table: string): string[];
}

export function createSchemaRepository(db: RavenDB): SchemaRepository {
  const allTablesStmt = db.db.prepare(
    `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name`
  );
  const tablesUnorderedStmt = db.db.prepare(
    `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`
  );

  return {
    listTables() {
      const rows = allTablesStmt.all() as Array<{ name: string }>;
      return rows.map(r => r.name);
    },

    listTablesFiltered(candidates) {
      const rows = tablesUnorderedStmt.all() as Array<{ name: string }>;
      const have = new Set(rows.map(r => r.name));
      return candidates.filter(t => have.has(t));
    },

    tableColumns(table) {
      // Table name comes from sqlite_master, not user input. PRAGMA can't bind
      // the table identifier as a parameter, so it's interpolated directly.
      const rows = db.db.prepare(`PRAGMA table_info("${table}")`).all() as Array<{ name: string }>;
      return rows.map(c => c.name);
    }
  };
}
