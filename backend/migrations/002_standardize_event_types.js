#!/usr/bin/env node

/**
 * Database Migration: Standardize Event Types
 *
 * Migrates event type naming from file-watcher convention to agent convention:
 * - add → create
 * - change → edit
 * - unlink → delete
 *
 * Also adds 'agent' column to events table for consistency with agent_events.
 *
 * This file exposes two entry points:
 *
 *   - migrate(db): the canonical export used by the migration runner
 *     (backend/run-migrations.js). Takes an already-open better-sqlite3
 *     handle. This matches the export shape of 001 and 003 and is what
 *     production calls during boot.
 *
 *   - migrateDatabase(dbPath, projectName): backward-compatible wrapper
 *     for the original standalone CLI invocation. Opens the DB itself,
 *     delegates to migrate(), then closes. Retained so the historical
 *     `node backend/migrations/002_standardize_event_types.js` workflow
 *     still works.
 *
 * Bug history: until 0.5, this module exported only migrateDatabase. The
 * runner imports `{ migrate }`, so on every upgrade the runner silently
 * skipped 002 and v0.3 users' add/change/unlink rows never got rewritten.
 *
 * Usage (standalone): node backend/migrations/002_standardize_event_types.js
 */

import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

// Try project-local .raven/db first, fallback to ~/.raven/db
const localRavenDir = path.join(process.cwd(), '.raven', 'db');
const homeRavenDir = path.join(process.env.HOME || process.env.USERPROFILE, '.raven', 'db');
const RAVEN_DIR = fs.existsSync(localRavenDir) ? localRavenDir : homeRavenDir;

/**
 * Canonical migration entry. Operates on an already-open db handle so the
 * runner can manage transactions, the migrations tracking table, and the
 * lifecycle of the connection.
 *
 * Returns { migrated: number } indicating how many rows were rewritten.
 * Idempotent: a second invocation finds no legacy values and does nothing.
 */
export function migrate(db) {
  // Skip cleanly if events table is missing (fresh DBs that never had the
  // legacy schema). Matches the original migrateDatabase behavior.
  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='events'")
    .all();
  if (tables.length === 0) {
    return { migrated: 0 };
  }

  // 1. Add agent column to events table if it doesn't exist. Kept for
  //    historical fidelity with the original script — migration 001 also
  //    adds this column, so on a runner pass after 001 this is a no-op.
  //    Migration 004 later drops the column once 002's data work is done.
  const columns = db.prepare('PRAGMA table_info(events)').all();
  const hasAgentColumn = columns.some(col => col.name === 'agent');
  if (!hasAgentColumn) {
    db.prepare('ALTER TABLE events ADD COLUMN agent TEXT').run();
  }

  // 2. Rewrite legacy change_type values. Each UPDATE is its own statement;
  //    if the runner wraps us in a transaction, all three succeed or all
  //    fail atomically.
  const addResult = db
    .prepare(`UPDATE events SET change_type = 'create' WHERE change_type = 'add'`)
    .run();
  const changeResult = db
    .prepare(`UPDATE events SET change_type = 'edit' WHERE change_type = 'change'`)
    .run();
  const unlinkResult = db
    .prepare(`UPDATE events SET change_type = 'delete' WHERE change_type = 'unlink'`)
    .run();

  // 3. Refresh the change_type index so it reflects the rewritten values.
  //    CREATE INDEX IF NOT EXISTS would not rebuild a stale index, but
  //    SQLite indexes track row updates anyway — the drop+create dance
  //    from the original script was defensive theatre, replaced here with
  //    a single idempotent CREATE.
  db.exec('CREATE INDEX IF NOT EXISTS idx_events_change_type ON events(change_type)');

  return {
    migrated: addResult.changes + changeResult.changes + unlinkResult.changes
  };
}

/**
 * Standalone wrapper retained for the historical CLI invocation. Opens
 * the database itself, runs migrate(db), closes. Returns the same shape
 * the original script returned so any external caller still works.
 */
function migrateDatabase(dbPath, projectName) {
  console.log(`\n🔄 Migrating ${projectName}...`);

  const db = new Database(dbPath);

  try {
    db.prepare('BEGIN TRANSACTION').run();
    const result = migrate(db);
    db.prepare('COMMIT').run();
    console.log(`  ✅ Migration complete for ${projectName} (${result.migrated} rows rewritten)`);
    return { success: true, migrated: result.migrated };
  } catch (err) {
    try {
      db.prepare('ROLLBACK').run();
    } catch (rollbackErr) {
      console.error('  ❌ Rollback failed:', rollbackErr);
    }
    console.error(`  ❌ Migration failed for ${projectName}:`, err.message);
    return { success: false, error: err.message };
  } finally {
    db.close();
  }
}

function main() {
  console.log('🚀 Starting database schema migration...\n');
  console.log(`📁 Database directory: ${RAVEN_DIR}\n`);

  if (!fs.existsSync(RAVEN_DIR)) {
    console.error('❌ .raven/db directory not found!');
    console.error('   Make sure Raven has been initialized.');
    process.exit(1);
  }

  // Find all .db files
  const dbFiles = fs.readdirSync(RAVEN_DIR).filter(f => f.endsWith('.db'));

  if (dbFiles.length === 0) {
    console.error('❌ No database files found in .raven/db/');
    process.exit(1);
  }

  console.log(`Found ${dbFiles.length} database(s) to migrate:\n`);

  let totalMigrated = 0;
  let successCount = 0;
  let failCount = 0;

  // Migrate each database
  for (const dbFile of dbFiles) {
    const dbPath = path.join(RAVEN_DIR, dbFile);
    const projectName = path.basename(dbFile, '.db');

    const result = migrateDatabase(dbPath, projectName);

    if (result.success) {
      successCount++;
      totalMigrated += result.migrated;
    } else {
      failCount++;
    }
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('📋 MIGRATION SUMMARY');
  console.log('='.repeat(60));
  console.log(`✅ Successful: ${successCount}/${dbFiles.length} databases`);
  console.log(`❌ Failed: ${failCount}/${dbFiles.length} databases`);
  console.log(`🔄 Total rows migrated: ${totalMigrated}`);
  console.log('='.repeat(60));

  if (failCount > 0) {
    console.log('\n⚠️  Some migrations failed. Review errors above.');
    process.exit(1);
  } else {
    console.log('\n🎉 All migrations completed successfully!');
    console.log('\n📝 Next steps:');
    console.log('   1. Restart Raven backend');
    console.log('   2. Refresh frontend in browser');
    console.log('   3. Verify Event Log shows events correctly\n');
  }
}

// Run migration if invoked directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { migrateDatabase };
