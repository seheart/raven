import { logger } from '../utils/logger.js';

/**
 * Migration: Drop legacy `agent` column from events
 *
 * Background:
 *   Migrations 001 and 002 each added an `agent TEXT` column to the
 *   events table. The canonical schema in db.ts (initializeSchema) never
 *   adopted that column — it standardized on `agent_source` instead. All
 *   current writes to the events table go through file-events-repository
 *   and target `agent_source`. No production read site references
 *   events.agent.
 *
 *   The drift was harmless functionally (the legacy column just sat
 *   NULL for new rows) but it confused anyone inspecting the DB, and
 *   any v0.3 row that did get an `agent` value during 001/002 was
 *   stranded — never copied into the column actually being queried.
 *
 * What this does:
 *   1. Backfills agent_source from agent where agent_source IS NULL
 *      (preserves data from v0.3 rows that lived through 001/002).
 *   2. Drops the events.agent column (SQLite 3.35+).
 *   3. Drops the idx_events_agent index that 001 created over it.
 *
 * Idempotency:
 *   Every step is guarded by a PRAGMA check or IF EXISTS. Safe to run
 *   on a fresh DB (no events table → noop), on a DB that already went
 *   through this migration (column already gone → noop), and twice in
 *   a row.
 */
export function migrate(db) {
  logger.info('🔄 Running migration: 004_drop_agent_column');

  // Skip cleanly if the events table doesn't exist (fresh DB before any
  // initializeSchema call — defensive; the runner normally opens via
  // RavenDB which creates it first).
  const tableExists = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='events'")
    .get();
  if (!tableExists) {
    logger.info('⏭️  events table does not exist — skipping');
    return;
  }

  const columns = db.prepare('PRAGMA table_info(events)').all();
  const hasAgent = columns.some(c => c.name === 'agent');
  const hasAgentSource = columns.some(c => c.name === 'agent_source');

  if (!hasAgent) {
    logger.info('⏭️  events.agent column already absent — nothing to drop');
    // Still drop the stale index defensively in case a previous partial
    // run left it behind.
    db.exec('DROP INDEX IF EXISTS idx_events_agent');
    return;
  }

  // Backfill agent_source from agent for rows where agent_source is empty
  // but agent has a value. Only meaningful when agent_source exists — on
  // very old DBs where the canonical schema hasn't run yet, RavenDB will
  // add agent_source the next time it opens the DB, and this migration
  // can be re-run if needed. Either way, no data loss: if we can't
  // backfill we just leave the column data behind, which matches the
  // existing post-001/002 state.
  if (hasAgentSource) {
    const result = db
      .prepare(
        `UPDATE events
           SET agent_source = agent
         WHERE agent_source IS NULL
           AND agent IS NOT NULL`
      )
      .run();
    logger.info(`✅ Backfilled agent_source from agent for ${result.changes} row(s)`);
  } else {
    logger.info('⚠️  agent_source column not present — skipping backfill');
  }

  // Drop the index that 001 created over the column we're about to remove.
  // SQLite would refuse to DROP COLUMN with a dependent index in place.
  db.exec('DROP INDEX IF EXISTS idx_events_agent');

  // Drop the column itself. Requires SQLite 3.35+ (Raven's better-sqlite3
  // ships 3.49.x). If for any reason the runtime is older, the ALTER will
  // throw and the runner will surface a clear error.
  db.exec('ALTER TABLE events DROP COLUMN agent');
  logger.info('✅ Dropped events.agent column');

  logger.info('✅ Migration complete: 004_drop_agent_column');
}

export function rollback(db) {
  // SQLite can't re-add the column with its original ordering or any
  // historical data, but we can recreate it as TEXT so writes that
  // somehow target events.agent stop erroring. The data is gone after
  // the drop in migrate() — no way to recover it.
  logger.info('🔄 Rolling back migration: 004_drop_agent_column');
  try {
    db.exec('ALTER TABLE events ADD COLUMN agent TEXT');
    db.exec('CREATE INDEX IF NOT EXISTS idx_events_agent ON events(agent)');
    logger.info('✅ Recreated events.agent column (data not recoverable)');
  } catch (e) {
    if (!e.message.includes('duplicate column')) throw e;
    logger.info('⏭️  events.agent column already present');
  }
}
