#!/usr/bin/env node
/**
 * Run Missing Tables Migration Script
 * Applies the 003_add_missing_tier4_tables migration to the raven database
 */

import Database from 'better-sqlite3';
import { join } from 'path';
import { up } from './migrations/003_add_missing_tier4_tables.js';

const DB_PATH = join(process.cwd(), '..', '.raven', 'db', 'raven.db');

console.log('Opening database:', DB_PATH);
const db = new Database(DB_PATH);

try {
  console.log('Running missing tables migration...');
  up(db);
  console.log('✓ Migration completed successfully!');

  // Verify tables were created
  const tables = db
    .prepare(
      `
    SELECT name FROM sqlite_master
    WHERE type='table'
    AND name IN ('productivity_insights', 'claude_personality')
    ORDER BY name
  `
    )
    .all();

  console.log('\nCreated tables:');
  tables.forEach(t => console.log('  -', t.name));

  if (tables.length !== 2) {
    console.warn('\n⚠ Warning: Expected 2 tables but found', tables.length);
  }
} catch (error) {
  console.error('✗ Migration failed:', error.message);
  process.exit(1);
} finally {
  db.close();
}
