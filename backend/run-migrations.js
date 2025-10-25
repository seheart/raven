/**
 * Migration Runner
 * Run database migrations for all project databases
 */

import { readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const MIGRATIONS_DIR = join(__dirname, 'migrations');
const RAVEN_DIR = join(__dirname, '..', '.raven');
const DB_DIR = join(RAVEN_DIR, 'db');

async function runMigrations() {
  console.log('🚀 Running Raven database migrations...\n');

  try {
    // Get all migration files
    const migrationFiles = readdirSync(MIGRATIONS_DIR)
      .filter(f => f.endsWith('.js'))
      .sort(); // Run in order

    if (migrationFiles.length === 0) {
      console.log('✅ No migrations to run');
      return;
    }

    console.log(`Found ${migrationFiles.length} migration(s):\n`);
    migrationFiles.forEach(f => console.log(`  - ${f}`));
    console.log();

    // Get all project databases
    const dbFiles = readdirSync(DB_DIR)
      .filter(f => f.endsWith('.db'))
      .map(f => join(DB_DIR, f));

    if (dbFiles.length === 0) {
      console.log('⚠️  No database files found in', DB_DIR);
      return;
    }

    console.log(`Found ${dbFiles.length} database(s) to migrate:\n`);
    dbFiles.forEach(f => console.log(`  - ${f}`));
    console.log();

    // Run migrations on each database
    for (const dbPath of dbFiles) {
      const dbName = dbPath.split('/').pop();
      console.log(`\n📦 Migrating: ${dbName}`);
      console.log('━'.repeat(60));

      const db = new Database(dbPath);
      db.pragma('journal_mode = WAL');

      // Create migrations tracking table if it doesn't exist
      db.exec(`
        CREATE TABLE IF NOT EXISTS migrations (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT UNIQUE NOT NULL,
          applied_at TEXT NOT NULL
        )
      `);

      // Get applied migrations
      const applied = db.prepare('SELECT name FROM migrations').all();
      const appliedNames = new Set(applied.map(m => m.name));

      // Run each migration
      for (const migrationFile of migrationFiles) {
        const migrationName = migrationFile.replace('.js', '');

        if (appliedNames.has(migrationName)) {
          console.log(`  ⏭️  ${migrationFile} (already applied)`);
          continue;
        }

        console.log(`  🔄 Running ${migrationFile}...`);

        try {
          // Import and run migration
          const migrationPath = `file://${join(MIGRATIONS_DIR, migrationFile)}`;
          const { migrate } = await import(migrationPath);

          migrate(db);

          // Record migration as applied
          db.prepare('INSERT INTO migrations (name, applied_at) VALUES (?, datetime(\'now\'))')
            .run(migrationName);

          console.log(`  ✅ ${migrationFile} completed`);
        } catch (e) {
          console.error(`  ❌ ${migrationFile} failed:`, e.message);
          db.close();
          throw e;
        }
      }

      db.close();
      console.log(`✅ ${dbName} migration complete`);
    }

    console.log('\n' + '━'.repeat(60));
    console.log('🎉 All migrations completed successfully!\n');
  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    process.exit(1);
  }
}

// Run migrations
runMigrations().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
