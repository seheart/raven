/**
 * Migration: Add Tier 4 (Corvus) Tables
 *
 * Adds all database tables required for Tier 4 advanced features:
 * - Health Scoring
 * - Drift Detection
 * - Productivity Insights
 * - Claude Personality Analysis
 * - Growth Tracking
 * - External Integrations
 */

export function up(db) {
  console.log('Running migration: 002_tier4_tables (up)');

  // Health Scoring table
  db.exec(`
    CREATE TABLE IF NOT EXISTS health_scores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_name TEXT NOT NULL,
      overall_score INTEGER NOT NULL,
      code_quality_score INTEGER NOT NULL,
      test_coverage_score INTEGER NOT NULL,
      documentation_score INTEGER NOT NULL,
      velocity_score INTEGER NOT NULL,
      stability_score INTEGER NOT NULL,
      security_score INTEGER NOT NULL,
      recommendations TEXT,
      metadata TEXT,
      calculated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_health_scores_project ON health_scores(project_name);
    CREATE INDEX IF NOT EXISTS idx_health_scores_date ON health_scores(calculated_at);
  `);

  // Drift Events table
  db.exec(`
    CREATE TABLE IF NOT EXISTS drift_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_name TEXT NOT NULL,
      drift_type TEXT NOT NULL,
      severity TEXT NOT NULL,
      description TEXT NOT NULL,
      baseline_value REAL,
      current_value REAL,
      deviation_percent INTEGER,
      affected_files TEXT,
      metadata TEXT,
      detected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      resolved_at TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_drift_events_project ON drift_events(project_name);
    CREATE INDEX IF NOT EXISTS idx_drift_events_type ON drift_events(drift_type);
    CREATE INDEX IF NOT EXISTS idx_drift_events_severity ON drift_events(severity);
    CREATE INDEX IF NOT EXISTS idx_drift_events_date ON drift_events(detected_at);
  `);

  // Productivity Insights table
  db.exec(`
    CREATE TABLE IF NOT EXISTS productivity_insights (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_name TEXT NOT NULL,
      insights TEXT NOT NULL,
      period_start TIMESTAMP NOT NULL,
      period_end TIMESTAMP NOT NULL,
      calculated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_productivity_insights_project ON productivity_insights(project_name);
    CREATE INDEX IF NOT EXISTS idx_productivity_insights_date ON productivity_insights(calculated_at);
  `);

  // Claude Personality table
  db.exec(`
    CREATE TABLE IF NOT EXISTS claude_personality (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_name TEXT NOT NULL,
      agent_name TEXT NOT NULL,
      insights TEXT NOT NULL,
      period_start TIMESTAMP NOT NULL,
      period_end TIMESTAMP NOT NULL,
      analyzed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_claude_personality_project ON claude_personality(project_name);
    CREATE INDEX IF NOT EXISTS idx_claude_personality_agent ON claude_personality(agent_name);
    CREATE INDEX IF NOT EXISTS idx_claude_personality_date ON claude_personality(analyzed_at);
  `);

  // Growth Snapshots table
  db.exec(`
    CREATE TABLE IF NOT EXISTS growth_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_name TEXT NOT NULL,
      snapshot_date DATE NOT NULL,
      total_events INTEGER NOT NULL,
      code_quality_avg REAL,
      rollback_rate REAL,
      velocity_score REAL,
      metadata TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(project_name, snapshot_date)
    );
    CREATE INDEX IF NOT EXISTS idx_growth_snapshots_project ON growth_snapshots(project_name);
    CREATE INDEX IF NOT EXISTS idx_growth_snapshots_date ON growth_snapshots(snapshot_date);
  `);

  // User Patterns table (for contextual observations)
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_patterns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_name TEXT NOT NULL,
      pattern_type TEXT NOT NULL,
      pattern_key TEXT NOT NULL,
      pattern_value TEXT NOT NULL,
      frequency INTEGER NOT NULL DEFAULT 1,
      last_observed TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(project_name, pattern_type, pattern_key)
    );
    CREATE INDEX IF NOT EXISTS idx_user_patterns_project ON user_patterns(project_name);
    CREATE INDEX IF NOT EXISTS idx_user_patterns_type ON user_patterns(pattern_type);
  `);

  // Integration Configs table
  db.exec(`
    CREATE TABLE IF NOT EXISTS integration_configs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_name TEXT NOT NULL,
      integration_type TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 0,
      config TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(project_name, integration_type)
    );
    CREATE INDEX IF NOT EXISTS idx_integration_configs_project ON integration_configs(project_name);
    CREATE INDEX IF NOT EXISTS idx_integration_configs_type ON integration_configs(integration_type);
  `);

  // Integration Events table
  db.exec(`
    CREATE TABLE IF NOT EXISTS integration_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_name TEXT NOT NULL,
      integration_type TEXT NOT NULL,
      event_type TEXT NOT NULL,
      metadata TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_integration_events_project ON integration_events(project_name);
    CREATE INDEX IF NOT EXISTS idx_integration_events_type ON integration_events(integration_type);
    CREATE INDEX IF NOT EXISTS idx_integration_events_date ON integration_events(created_at);
  `);

  console.log('✓ Created all Tier 4 tables');
}

export function down(db) {
  console.log('Running migration: 002_tier4_tables (down)');

  db.exec(`
    DROP TABLE IF EXISTS health_scores;
    DROP TABLE IF EXISTS drift_events;
    DROP TABLE IF EXISTS productivity_insights;
    DROP TABLE IF EXISTS claude_personality;
    DROP TABLE IF EXISTS growth_snapshots;
    DROP TABLE IF EXISTS user_patterns;
    DROP TABLE IF EXISTS integration_configs;
    DROP TABLE IF EXISTS integration_events;
  `);

  console.log('✓ Dropped all Tier 4 tables');
}
