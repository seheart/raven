/**
 * Migration Runner
 * Run database migrations for all project databases
 */

import { readdirSync } from 'fs';
import { logger } from 'utils/logger.js';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const MIGRATIONS_DIR = join(__dirname, 'migrations');
const RAVEN_DIR = join(__dirname, '..', '.raven');
const DB_DIR = join(RAVEN_DIR, 'db');

async function runMigrations() {
  logger.info('🚀 Running Raven database migrations...\n');

  try {
    // Get all migration files
    const migrationFiles = readdirSync(MIGRATIONS_DIR)
      .filter(f => f.endsWith('.js'))
      .sort(); // Run in order

    if (migrationFiles.length === 0) {
      logger.info('✅ No migrations to run');
      return;
    }

    logger.info(`Found ${migrationFiles.length} migration(s):\n`);
    migrationFiles.forEach(f => logger.info(`  - ${f}`));
    logger.info();

    // Get all project databases
    const dbFiles = readdirSync(DB_DIR)
      .filter(f => f.endsWith('.db'))
      .map(f => join(DB_DIR, f));

    if (dbFiles.length === 0) {
      logger.info('⚠️  No database files found in', DB_DIR);
      return;
    }

    logger.info(`Found ${dbFiles.length} database(s) to migrate:\n`);
    dbFiles.forEach(f => logger.info(`  - ${f}`));
    logger.info();

    // Run migrations on each database
    for (const dbPath of dbFiles) {
      const dbName = dbPath.split('/').pop();
      logger.info(`\n📦 Migrating: ${dbName}`);
      logger.info('━'.repeat(60));

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
          logger.info(`  ⏭️  ${migrationFile} (already applied)`);
          continue;
        }

        logger.info(`  🔄 Running ${migrationFile}...`);

        try {
          // Import and run migration
          const migrationPath = `file://${join(MIGRATIONS_DIR, migrationFile)}`;
          const { migrate } = await import(migrationPath);

          migrate(db);

          // Record migration as applied
          db.prepare("INSERT INTO migrations (name, applied_at) VALUES (?, datetime('now'))").run(
            migrationName
          );

          logger.info(`  ✅ ${migrationFile} completed`);
        } catch (e) {
          logger.error(`  ❌ ${migrationFile} failed:`, e.message);
          db.close();
          throw e;
        }
      }

      db.close();
      logger.info(`✅ ${dbName} migration complete`);
    }

    logger.info('\n' + '━'.repeat(60));
    logger.info('🎉 All migrations completed successfully!\n');
  } catch (error) {
    logger.error('\n❌ Migration failed:', error);
    process.exit(1);
  }
}

// Run migrations
runMigrations().catch(error => {
  logger.error('Fatal error:', error);
  process.exit(1);
});
