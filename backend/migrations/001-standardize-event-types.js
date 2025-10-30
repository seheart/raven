#!/usr/bin/env node

/**
 * Database Migration: Standardize Event Types
 *
 * Migrates event type naming from file-watcher convention to agent convention:
 * - add → create
 * - change → edit
 * - unlink → delete
 *
 * Also adds 'agent' column to events table for consistency with agent_events.
 *
 * Usage: node backend/migrations/001-standardize-event-types.js
 */

import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Try project-local .raven/db first, fallback to ~/.raven/db
const localRavenDir = path.join(process.cwd(), '.raven', 'db');
const homeRavenDir = path.join(process.env.HOME || process.env.USERPROFILE, '.raven', 'db');
const RAVEN_DIR = fs.existsSync(localRavenDir) ? localRavenDir : homeRavenDir;

function migrateDatabase(dbPath, projectName) {
  console.log(`\n🔄 Migrating ${projectName}...`);

  const db = new Database(dbPath);

  try {
    // Check if events table exists
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='events'").all();
    if (tables.length === 0) {
      console.log('  ⊙ No events table - skipping');
      db.close();
      return { success: true, migrated: 0 };
    }

    // Start transaction
    db.prepare('BEGIN TRANSACTION').run();

    // 1. Add agent column to events table if it doesn't exist
    try {
      const columns = db.prepare('PRAGMA table_info(events)').all();
      const hasAgentColumn = columns.some(col => col.name === 'agent');

      if (!hasAgentColumn) {
        console.log('  ✓ Adding agent column to events table...');
        db.prepare('ALTER TABLE events ADD COLUMN agent TEXT').run();
      } else {
        console.log('  ⊙ Agent column already exists');
      }
    } catch (err) {
      console.log('  ⚠️  Could not add agent column:', err.message);
    }

    // 2. Count existing events by type (before migration)
    const beforeCounts = db.prepare(`
      SELECT change_type, COUNT(*) as count
      FROM events
      GROUP BY change_type
    `).all();

    console.log('  📊 Before migration:');
    beforeCounts.forEach(row => {
      console.log(`     - ${row.change_type}: ${row.count}`);
    });

    // 3. Update change_type values
    console.log('  🔄 Updating change_type values...');

    const addCount = db.prepare(`
      UPDATE events
      SET change_type = 'create'
      WHERE change_type = 'add'
    `).run();
    console.log(`     - add → create: ${addCount.changes} rows`);

    const changeCount = db.prepare(`
      UPDATE events
      SET change_type = 'edit'
      WHERE change_type = 'change'
    `).run();
    console.log(`     - change → edit: ${changeCount.changes} rows`);

    const unlinkCount = db.prepare(`
      UPDATE events
      SET change_type = 'delete'
      WHERE change_type = 'unlink'
    `).run();
    console.log(`     - unlink → delete: ${unlinkCount.changes} rows`);

    // 4. Verify migration
    const afterCounts = db.prepare(`
      SELECT change_type, COUNT(*) as count
      FROM events
      GROUP BY change_type
    `).all();

    console.log('  📊 After migration:');
    afterCounts.forEach(row => {
      console.log(`     - ${row.change_type}: ${row.count}`);
    });

    // 5. Update indexes if needed
    console.log('  🔍 Recreating indexes...');
    try {
      db.prepare('DROP INDEX IF EXISTS idx_events_change_type').run();
      db.prepare('CREATE INDEX idx_events_change_type ON events(change_type)').run();
      console.log('     ✓ Recreated idx_events_change_type');
    } catch (err) {
      console.log('     ⚠️  Index warning:', err.message);
    }

    // Commit transaction
    db.prepare('COMMIT').run();
    console.log(`  ✅ Migration complete for ${projectName}`);

    return {
      success: true,
      migrated: addCount.changes + changeCount.changes + unlinkCount.changes
    };

  } catch (err) {
    // Rollback on error
    try {
      db.prepare('ROLLBACK').run();
    } catch (rollbackErr) {
      console.error('  ❌ Rollback failed:', rollbackErr);
    }

    console.error(`  ❌ Migration failed for ${projectName}:`, err.message);
    return { success: false, error: err.message };

  } finally {
    db.close();
  }
}

function main() {
  console.log('🚀 Starting database schema migration...\n');
  console.log(`📁 Database directory: ${RAVEN_DIR}\n`);

  if (!fs.existsSync(RAVEN_DIR)) {
    console.error('❌ .raven/db directory not found!');
    console.error('   Make sure Raven has been initialized.');
    process.exit(1);
  }

  // Find all .db files
  const dbFiles = fs.readdirSync(RAVEN_DIR).filter(f => f.endsWith('.db'));

  if (dbFiles.length === 0) {
    console.error('❌ No database files found in .raven/db/');
    process.exit(1);
  }

  console.log(`Found ${dbFiles.length} database(s) to migrate:\n`);

  let totalMigrated = 0;
  let successCount = 0;
  let failCount = 0;

  // Migrate each database
  for (const dbFile of dbFiles) {
    const dbPath = path.join(RAVEN_DIR, dbFile);
    const projectName = path.basename(dbFile, '.db');

    const result = migrateDatabase(dbPath, projectName);

    if (result.success) {
      successCount++;
      totalMigrated += result.migrated;
    } else {
      failCount++;
    }
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('📋 MIGRATION SUMMARY');
  console.log('='.repeat(60));
  console.log(`✅ Successful: ${successCount}/${dbFiles.length} databases`);
  console.log(`❌ Failed: ${failCount}/${dbFiles.length} databases`);
  console.log(`🔄 Total rows migrated: ${totalMigrated}`);
  console.log('='.repeat(60));

  if (failCount > 0) {
    console.log('\n⚠️  Some migrations failed. Review errors above.');
    process.exit(1);
  } else {
    console.log('\n🎉 All migrations completed successfully!');
    console.log('\n📝 Next steps:');
    console.log('   1. Restart Raven backend');
    console.log('   2. Refresh frontend in browser');
    console.log('   3. Verify Event Log shows events correctly\n');
  }
}

// Run migration
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { migrateDatabase };
