/**
 * Migration: Monitoring Enhancements
 * Adds support for:
 * - Multi-agent monitoring
 * - Anomaly detection enhancements
 * - Risk correlation
 * - Session tracking
 */

export function migrate(db) {
  console.log('🔄 Running migration: 001_monitoring_enhancements');

  // Add new columns to events table
  try {
    db.exec(`ALTER TABLE events ADD COLUMN agent TEXT`);
    console.log('✅ Added agent column to events');
  } catch (e) {
    if (!e.message.includes('duplicate column')) throw e;
    console.log('⏭️  agent column already exists');
  }

  try {
    db.exec(`ALTER TABLE events ADD COLUMN agent_confidence INTEGER`);
    console.log('✅ Added agent_confidence column to events');
  } catch (e) {
    if (!e.message.includes('duplicate column')) throw e;
    console.log('⏭️  agent_confidence column already exists');
  }

  try {
    db.exec(`ALTER TABLE events ADD COLUMN is_anomaly INTEGER DEFAULT 0`);
    console.log('✅ Added is_anomaly column to events');
  } catch (e) {
    if (!e.message.includes('duplicate column')) throw e;
    console.log('⏭️  is_anomaly column already exists');
  }

  try {
    db.exec(`ALTER TABLE events ADD COLUMN anomaly_score INTEGER`);
    console.log('✅ Added anomaly_score column to events');
  } catch (e) {
    if (!e.message.includes('duplicate column')) throw e;
    console.log('⏭️  anomaly_score column already exists');
  }

  try {
    db.exec(`ALTER TABLE events ADD COLUMN anomaly_confidence INTEGER`);
    console.log('✅ Added anomaly_confidence column to events');
  } catch (e) {
    if (!e.message.includes('duplicate column')) throw e;
    console.log('⏭️  anomaly_confidence column already exists');
  }

  try {
    db.exec(`ALTER TABLE events ADD COLUMN anomaly_reasons TEXT`);
    console.log('✅ Added anomaly_reasons column to events');
  } catch (e) {
    if (!e.message.includes('duplicate column')) throw e;
    console.log('⏭️  anomaly_reasons column already exists');
  }

  try {
    db.exec(`ALTER TABLE events ADD COLUMN risk_level TEXT`);
    console.log('✅ Added risk_level column to events');
  } catch (e) {
    if (!e.message.includes('duplicate column')) throw e;
    console.log('⏭️  risk_level column already exists');
  }

  try {
    db.exec(`ALTER TABLE events ADD COLUMN risk_score INTEGER`);
    console.log('✅ Added risk_score column to events');
  } catch (e) {
    if (!e.message.includes('duplicate column')) throw e;
    console.log('⏭️  risk_score column already exists');
  }

  try {
    db.exec(`ALTER TABLE events ADD COLUMN risk_factors TEXT`);
    console.log('✅ Added risk_factors column to events');
  } catch (e) {
    if (!e.message.includes('duplicate column')) throw e;
    console.log('⏭️  risk_factors column already exists');
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
  console.log('✅ Created rollbacks table');

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
  console.log('✅ Created agent_stats table');

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
  console.log('✅ Created sessions table');

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
  console.log('✅ Created change_conversations table');

  // Create indexes for better performance
  db.exec(`CREATE INDEX IF NOT EXISTS idx_events_agent ON events(agent)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_events_anomaly ON events(is_anomaly)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_events_risk ON events(risk_level)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_rollbacks_event ON rollbacks(event_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_agent_stats_lookup ON agent_stats(project_name, agent, date)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_sessions_project ON sessions(project_name)`);
  console.log('✅ Created indexes');

  console.log('✅ Migration complete: 001_monitoring_enhancements');
}

export function rollback(db) {
  console.log('🔄 Rolling back migration: 001_monitoring_enhancements');

  // Note: SQLite doesn't support DROP COLUMN, so we can't truly rollback
  // Instead, we drop the new tables
  db.exec(`DROP TABLE IF EXISTS rollbacks`);
  db.exec(`DROP TABLE IF EXISTS agent_stats`);
  db.exec(`DROP TABLE IF EXISTS sessions`);
  db.exec(`DROP TABLE IF EXISTS change_conversations`);

  console.log('✅ Rollback complete (note: columns remain but unused)');
}
