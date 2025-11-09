/**
 * Migration: Add Missing Tier 4 Tables
 *
 * Adds the productivity_insights and claude_personality tables
 * that were missing from the initial Tier 4 migration
 */

export function up(db) {
  console.log('Running migration: 003_add_missing_tier4_tables (up)');

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

  console.log('✓ Created productivity_insights and claude_personality tables');
}

export function down(db) {
  console.log('Running migration: 003_add_missing_tier4_tables (down)');

  db.exec(`
    DROP TABLE IF EXISTS productivity_insights;
    DROP TABLE IF EXISTS claude_personality;
  `);

  console.log('✓ Dropped productivity_insights and claude_personality tables');
}
