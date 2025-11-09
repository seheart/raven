#!/usr/bin/env node
/**
 * Run Gamification Migration Script
 * Applies the 004_add_gamification_and_social migration to the raven database
 */

import Database from 'better-sqlite3';
import { join } from 'path';
import { up } from './migrations/004_add_gamification_and_social.js';

const DB_PATH = join(process.cwd(), '..', '.raven', 'db', 'raven.db');

console.log('Opening database:', DB_PATH);
const db = new Database(DB_PATH);

try {
  console.log('Running gamification migration...');
  up(db);
  console.log('✓ Migration completed successfully!');

  // Verify tables were created
  const tables = db
    .prepare(
      `
    SELECT name FROM sqlite_master
    WHERE type='table'
    AND name IN ('achievements', 'user_stats', 'easter_eggs', 'audio_preferences', 'social_shares', 'team_members')
    ORDER BY name
  `
    )
    .all();

  console.log('\nCreated tables:');
  tables.forEach(t => console.log('  -', t.name));

  if (tables.length !== 6) {
    console.warn('\n⚠ Warning: Expected 6 tables but found', tables.length);
  }
} catch (error) {
  console.error('✗ Migration failed:', error.message);
  process.exit(1);
} finally {
  db.close();
}
