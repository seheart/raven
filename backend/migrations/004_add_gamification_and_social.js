/**
 * Migration: Add Gamification, Achievements, and Social Features
 *
 * Tables for:
 * - Achievements and badges
 * - User points and levels
 * - Easter eggs
 * - Sound/voice preferences
 * - Social sharing and team features
 */

export function up(db) {
  console.log('Running migration: 004_add_gamification_and_social (up)');

  // Achievements table
  db.exec(`
    CREATE TABLE IF NOT EXISTS achievements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_name TEXT NOT NULL,
      achievement_type TEXT NOT NULL,
      achievement_id TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      icon TEXT,
      rarity TEXT DEFAULT 'common',
      points INTEGER DEFAULT 10,
      unlocked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      celebrated BOOLEAN DEFAULT 0,
      UNIQUE(project_name, achievement_id)
    );
    CREATE INDEX IF NOT EXISTS idx_achievements_project ON achievements(project_name);
    CREATE INDEX IF NOT EXISTS idx_achievements_unlocked ON achievements(unlocked_at);
  `);

  // User stats and gamification
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_stats (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_name TEXT NOT NULL,
      total_points INTEGER DEFAULT 0,
      level INTEGER DEFAULT 1,
      experience INTEGER DEFAULT 0,
      streak_days INTEGER DEFAULT 0,
      last_active_date TEXT,
      badges_unlocked INTEGER DEFAULT 0,
      milestones_reached INTEGER DEFAULT 0,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(project_name)
    );
  `);

  // Easter eggs discovered
  db.exec(`
    CREATE TABLE IF NOT EXISTS easter_eggs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_name TEXT NOT NULL,
      egg_id TEXT NOT NULL,
      title TEXT NOT NULL,
      message TEXT,
      discovered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      trigger_type TEXT,
      UNIQUE(project_name, egg_id)
    );
  `);

  // Sound and voice preferences (extends user_preferences)
  db.exec(`
    CREATE TABLE IF NOT EXISTS audio_preferences (
      id INTEGER PRIMARY KEY DEFAULT 1,
      sound_enabled BOOLEAN DEFAULT 1,
      sound_volume REAL DEFAULT 0.7,
      achievement_sounds BOOLEAN DEFAULT 1,
      notification_sounds BOOLEAN DEFAULT 1,
      ambient_sounds BOOLEAN DEFAULT 0,
      voice_enabled BOOLEAN DEFAULT 0,
      voice_type TEXT DEFAULT 'female',
      voice_speed REAL DEFAULT 1.0,
      voice_pitch REAL DEFAULT 1.0,
      CHECK(id = 1)
    );
    INSERT OR IGNORE INTO audio_preferences (id) VALUES (1);
  `);

  // Social shares and exports
  db.exec(`
    CREATE TABLE IF NOT EXISTS social_shares (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_name TEXT NOT NULL,
      share_type TEXT NOT NULL,
      content TEXT NOT NULL,
      platform TEXT,
      shared_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Team insights (for collaborative features)
  db.exec(`
    CREATE TABLE IF NOT EXISTS team_members (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_name TEXT NOT NULL,
      member_name TEXT NOT NULL,
      role TEXT,
      joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      last_seen TIMESTAMP,
      UNIQUE(project_name, member_name)
    );
  `);

  console.log('✓ Created gamification, achievements, social, and audio tables');
}

export function down(db) {
  console.log('Running migration: 004_add_gamification_and_social (down)');

  db.exec(`
    DROP TABLE IF EXISTS achievements;
    DROP TABLE IF EXISTS user_stats;
    DROP TABLE IF EXISTS easter_eggs;
    DROP TABLE IF EXISTS audio_preferences;
    DROP TABLE IF EXISTS social_shares;
    DROP TABLE IF EXISTS team_members;
  `);

  console.log('✓ Dropped gamification, achievements, social, and audio tables');
}
