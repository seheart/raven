#!/usr/bin/env node
/**
 * Run Tier 4 Migration Script
 * Applies the 002_tier4_tables migration to the raven database
 */

import Database from 'better-sqlite3';
import { join } from 'path';
import { up } from './migrations/002_tier4_tables.js';

const DB_PATH = join(process.cwd(), '..', '.raven', 'db', 'raven.db');

console.log('Opening database:', DB_PATH);
const db = new Database(DB_PATH);

try {
  console.log('Running Tier 4 migration...');
  up(db);
  console.log('✓ Migration completed successfully!');

  // Verify tables were created
  const tables = db
    .prepare(
      `
    SELECT name FROM sqlite_master
    WHERE type='table'
    AND name IN (
      'health_scores',
      'drift_events',
      'productivity_insights',
      'claude_personality',
      'growth_snapshots',
      'user_patterns',
      'integration_configs',
      'integration_events'
    )
    ORDER BY name
  `
    )
    .all();

  console.log('\nCreated tables:');
  tables.forEach(t => console.log('  -', t.name));
} catch (error) {
  console.error('✗ Migration failed:', error.message);
  process.exit(1);
} finally {
  db.close();
}
