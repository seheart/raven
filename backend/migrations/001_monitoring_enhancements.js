import { logger } from '../utils/logger.js';

/**
 * Migration: Monitoring Enhancements
 * Adds support for:
 * - Multi-agent monitoring
 * - Anomaly detection enhancements
 * - Risk correlation
 * - Session tracking
 */

export function migrate(db) {
  logger.info('🔄 Running migration: 001_monitoring_enhancements');

  // Add new columns to events table
  try {
    db.exec('ALTER TABLE events ADD COLUMN agent TEXT');
    logger.info('✅ Added agent column to events');
  } catch (e) {
    if (!e.message.includes('duplicate column')) throw e;
    logger.info('⏭️  agent column already exists');
  }

  try {
    db.exec('ALTER TABLE events ADD COLUMN agent_confidence INTEGER');
    logger.info('✅ Added agent_confidence column to events');
  } catch (e) {
    if (!e.message.includes('duplicate column')) throw e;
    logger.info('⏭️  agent_confidence column already exists');
  }

  try {
    db.exec('ALTER TABLE events ADD COLUMN is_anomaly INTEGER DEFAULT 0');
    logger.info('✅ Added is_anomaly column to events');
  } catch (e) {
    if (!e.message.includes('duplicate column')) throw e;
    logger.info('⏭️  is_anomaly column already exists');
  }

  try {
    db.exec('ALTER TABLE events ADD COLUMN anomaly_score INTEGER');
    logger.info('✅ Added anomaly_score column to events');
  } catch (e) {
    if (!e.message.includes('duplicate column')) throw e;
    logger.info('⏭️  anomaly_score column already exists');
  }

  try {
    db.exec('ALTER TABLE events ADD COLUMN anomaly_confidence INTEGER');
    logger.info('✅ Added anomaly_confidence column to events');
  } catch (e) {
    if (!e.message.includes('duplicate column')) throw e;
    logger.info('⏭️  anomaly_confidence column already exists');
  }

  try {
    db.exec('ALTER TABLE events ADD COLUMN anomaly_reasons TEXT');
    logger.info('✅ Added anomaly_reasons column to events');
  } catch (e) {
    if (!e.message.includes('duplicate column')) throw e;
    logger.info('⏭️  anomaly_reasons column already exists');
  }

  try {
    db.exec('ALTER TABLE events ADD COLUMN risk_level TEXT');
    logger.info('✅ Added risk_level column to events');
  } catch (e) {
    if (!e.message.includes('duplicate column')) throw e;
    logger.info('⏭️  risk_level column already exists');
  }

  try {
    db.exec('ALTER TABLE events ADD COLUMN risk_score INTEGER');
    logger.info('✅ Added risk_score column to events');
  } catch (e) {
    if (!e.message.includes('duplicate column')) throw e;
    logger.info('⏭️  risk_score column already exists');
  }

  try {
    db.exec('ALTER TABLE events ADD COLUMN risk_factors TEXT');
    logger.info('✅ Added risk_factors column to events');
  } catch (e) {
    if (!e.message.includes('duplicate column')) throw e;
    logger.info('⏭️  risk_factors column already exists');
  }

  // Create rollbacks table
  db.exec(`
    CREATE TABLE IF NOT EXISTS rollbacks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id INTEGER NOT NULL,
      timestamp TEXT NOT NULL,
      reason TEXT,
      automatic INTEGER DEFAULT 0,
      FOREIGN KEY (event_id) REFERENCES events(id)
    )
  `);
  logger.info('✅ Created rollbacks table');

  // Create agent_stats table
  db.exec(`
    CREATE TABLE IF NOT EXISTS agent_stats (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_name TEXT NOT NULL,
      agent TEXT NOT NULL,
      date TEXT NOT NULL,
      changes_count INTEGER DEFAULT 0,
      rollbacks_count INTEGER DEFAULT 0,
      avg_change_size INTEGER DEFAULT 0,
      avg_confidence INTEGER DEFAULT 0,
      success_rate REAL DEFAULT 0.0,
      UNIQUE(project_name, agent, date)
    )
  `);
  logger.info('✅ Created agent_stats table');

  // Create sessions table
  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_name TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT,
      changes_count INTEGER DEFAULT 0,
      rollbacks_count INTEGER DEFAULT 0,
      break_minutes INTEGER DEFAULT 0,
      quality_score REAL DEFAULT 0.0
    )
  `);
  logger.info('✅ Created sessions table');

  // Create change_conversations table (for AI explanations)
  db.exec(`
    CREATE TABLE IF NOT EXISTS change_conversations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      change_id INTEGER NOT NULL,
      messages TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      FOREIGN KEY (change_id) REFERENCES events(id)
    )
  `);
  logger.info('✅ Created change_conversations table');

  // Create indexes for better performance
  db.exec('CREATE INDEX IF NOT EXISTS idx_events_agent ON events(agent)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_events_anomaly ON events(is_anomaly)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_events_risk ON events(risk_level)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_rollbacks_event ON rollbacks(event_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_agent_stats_lookup ON agent_stats(project_name, agent, date)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_sessions_project ON sessions(project_name)');
  logger.info('✅ Created indexes');

  logger.info('✅ Migration complete: 001_monitoring_enhancements');
}

export function rollback(db) {
  logger.info('🔄 Rolling back migration: 001_monitoring_enhancements');

  // Note: SQLite doesn't support DROP COLUMN, so we can't truly rollback
  // Instead, we drop the new tables
  db.exec('DROP TABLE IF EXISTS rollbacks');
  db.exec('DROP TABLE IF EXISTS agent_stats');
  db.exec('DROP TABLE IF EXISTS sessions');
  db.exec('DROP TABLE IF EXISTS change_conversations');

  logger.info('✅ Rollback complete (note: columns remain but unused)');
}
