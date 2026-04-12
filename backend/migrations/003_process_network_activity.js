import { logger } from '../utils/logger.js';

/**
 * Migration: Process Network Activity
 * Adds network monitoring and activity state tracking to process_metrics.
 * Adds api_latency table for tracking API response times.
 */

export function migrate(db) {
  logger.info('🔄 Running migration: 003_process_network_activity');

  // Extend process_metrics with network and activity columns
  const columns = [
    { name: 'network_connections', def: 'INTEGER DEFAULT 0' },
    { name: 'api_connections', def: 'INTEGER DEFAULT 0' },
    { name: 'thread_count', def: 'INTEGER DEFAULT 0' },
    { name: 'fd_count', def: 'INTEGER DEFAULT 0' },
    { name: 'activity_state', def: "TEXT DEFAULT 'unknown'" }
  ];

  for (const col of columns) {
    try {
      db.exec(`ALTER TABLE process_metrics ADD COLUMN ${col.name} ${col.def}`);
      logger.info(`✅ Added ${col.name} column to process_metrics`);
    } catch (e) {
      if (!e.message.includes('duplicate column')) throw e;
      logger.info(`⏭️  ${col.name} column already exists`);
    }
  }

  // Create api_latency table
  db.exec(`
    CREATE TABLE IF NOT EXISTS api_latency (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp TEXT NOT NULL,
      session_id TEXT,
      project_name TEXT,
      model TEXT,
      latency_ms INTEGER NOT NULL
    )
  `);
  db.exec('CREATE INDEX IF NOT EXISTS idx_api_latency_timestamp ON api_latency(timestamp DESC)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_api_latency_session ON api_latency(session_id)');
  logger.info('✅ Created api_latency table');

  logger.info('✅ Migration complete: 003_process_network_activity');
}

export function rollback(db) {
  logger.info('🔄 Rolling back migration: 003_process_network_activity');
  db.exec('DROP TABLE IF EXISTS api_latency');
  logger.info('✅ Rollback complete (note: process_metrics columns remain but unused)');
}
