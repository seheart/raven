/**
 * Database Migration System for Raven
 * Handles versioned schema changes across all project databases
 */

import { logger } from '../utils/logger.js';
import fs from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export class DatabaseMigrator {
  constructor(db, dbName = 'unknown') {
    this.db = db;
    this.dbName = dbName;
    this.migrationsDir = join(__dirname, 'migrations');
  }

  /**
   * Initialize migrations table
   */
  initMigrationsTable() {
    this.db
      .prepare(
        `
      CREATE TABLE IF NOT EXISTS migrations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        version INTEGER NOT NULL UNIQUE,
        name TEXT NOT NULL,
        applied_at INTEGER NOT NULL,
        checksum TEXT NOT NULL
      )
    `
      )
      .run();
    logger.info(`Migrations table initialized for ${this.dbName}`);
  }

  /**
   * Get current schema version
   */
  getCurrentVersion() {
    try {
      const result = this.db
        .prepare(
          `
        SELECT MAX(version) as version FROM migrations
      `
        )
        .get();
      return result?.version || 0;
    } catch (_err) {
      return 0;
    }
  }

  /**
   * Get all available migrations
   */
  getAvailableMigrations() {
    if (!fs.existsSync(this.migrationsDir)) {
      fs.mkdirSync(this.migrationsDir, { recursive: true });
      return [];
    }

    const files = fs
      .readdirSync(this.migrationsDir)
      .filter(f => f.endsWith('.js'))
      .sort();

    return files
      .map(file => {
        const match = file.match(/^(\d+)_(.+)\.js$/);
        if (!match) return null;

        return {
          version: parseInt(match[1]),
          name: match[2],
          filename: file,
          path: join(this.migrationsDir, file)
        };
      })
      .filter(Boolean);
  }

  /**
   * Run pending migrations
   */
  async migrate() {
    this.initMigrationsTable();

    const currentVersion = this.getCurrentVersion();
    const migrations = this.getAvailableMigrations();
    const pending = migrations.filter(m => m.version > currentVersion);

    if (pending.length === 0) {
      logger.info(`${this.dbName}: Database is up to date (v${currentVersion})`);
      return { current: currentVersion, applied: 0 };
    }

    logger.info(`${this.dbName}: Running ${pending.length} pending migrations...`);

    for (const migration of pending) {
      try {
        // Dynamic import of migration file
        const migrationModule = await import(migration.path);
        const { up, checksum } = migrationModule;

        if (!up) {
          throw new Error(`Migration ${migration.filename} missing 'up' function`);
        }

        // Begin transaction
        this.db.prepare('BEGIN').run();

        try {
          // Run migration
          await up(this.db);

          // Record migration
          this.db
            .prepare(
              `
            INSERT INTO migrations (version, name, applied_at, checksum)
            VALUES (?, ?, ?, ?)
          `
            )
            .run(migration.version, migration.name, Date.now(), checksum || 'no-checksum');

          // Commit transaction
          this.db.prepare('COMMIT').run();

          logger.info(`✓ Applied migration ${migration.version}: ${migration.name}`);
        } catch (_err) {
          // Rollback on error
          this.db.prepare('ROLLBACK').run();
          throw _err;
        }
      } catch (_err) {
        logger.error(`✗ Failed to apply migration ${migration.filename}:`, _err);
        throw _err;
      }
    }

    const newVersion = this.getCurrentVersion();
    logger.info(`${this.dbName}: Migrations complete (v${currentVersion} → v${newVersion})`);

    return {
      current: newVersion,
      applied: pending.length
    };
  }

  /**
   * Rollback to specific version
   */
  async rollback(targetVersion = null) {
    this.initMigrationsTable();

    const currentVersion = this.getCurrentVersion();
    const migrations = this.getAvailableMigrations().reverse();

    const toRollback = migrations.filter(m => {
      if (targetVersion === null) {
        return m.version === currentVersion; // Rollback one
      }
      return m.version > targetVersion && m.version <= currentVersion;
    });

    if (toRollback.length === 0) {
      logger.info(`${this.dbName}: No migrations to rollback`);
      return { current: currentVersion, rolled: 0 };
    }

    logger.info(`${this.dbName}: Rolling back ${toRollback.length} migrations...`);

    for (const migration of toRollback) {
      try {
        const migrationModule = await import(migration.path);
        const { down } = migrationModule;

        if (!down) {
          logger.warn(`Migration ${migration.filename} has no 'down' function, skipping rollback`);
          continue;
        }

        this.db.prepare('BEGIN').run();

        try {
          await down(this.db);

          this.db
            .prepare(
              `
            DELETE FROM migrations WHERE version = ?
          `
            )
            .run(migration.version);

          this.db.prepare('COMMIT').run();

          logger.info(`✓ Rolled back migration ${migration.version}: ${migration.name}`);
        } catch (_err) {
          this.db.prepare('ROLLBACK').run();
          throw err;
        }
      } catch (_err) {
        logger.error(`✗ Failed to rollback migration ${migration.filename}:`, err);
        throw err;
      }
    }

    const newVersion = this.getCurrentVersion();
    logger.info(`${this.dbName}: Rollback complete (v${currentVersion} → v${newVersion})`);

    return {
      current: newVersion,
      rolled: toRollback.length
    };
  }

  /**
   * Create a new migration file
   */
  static createMigration(name) {
    const migrationsDir = join(__dirname, 'migrations');
    if (!fs.existsSync(migrationsDir)) {
      fs.mkdirSync(migrationsDir, { recursive: true });
    }

    const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.js'));
    const versions = files.map(f => parseInt(f.split('_')[0], 10)).filter(v => !isNaN(v));
    const lastVersion = versions.length > 0 ? Math.max(...versions) : 0;

    const version = lastVersion + 1;
    const filename = `${version.toString().padStart(3, '0')}_${name}.js`;
    const filepath = join(migrationsDir, filename);

    const template = `/**
 * Migration: ${name}
 * Version: ${version}
 * Created: ${new Date().toISOString()}
 */

/**
 * Apply migration
 * @param {Database} db - SQLite database instance
 */
export async function up(db) {
  // Add your migration code here
  // Example:
  // db.prepare(\`
  //   ALTER TABLE events ADD COLUMN new_field TEXT
  // \`).run();
}

/**
 * Revert migration
 * @param {Database} db - SQLite database instance
 */
export async function down(db) {
  // Add rollback code here
  // Example:
  // db.prepare(\`
  //   ALTER TABLE events DROP COLUMN new_field
  // \`).run();
}

// Checksum for migration integrity
export const checksum = '${Math.random().toString(36).substring(7)}';
`;

    fs.writeFileSync(filepath, template, 'utf8');
    logger.info(`Created migration: ${filename}`);
    return filepath;
  }
}

/**
 * Run migrations on all project databases
 */
export async function migrateAllProjects(projectDatabases) {
  const results = {};

  for (const [projectName, projectDb] of projectDatabases.entries()) {
    try {
      const migrator = new DatabaseMigrator(projectDb.db, projectName);
      results[projectName] = await migrator.migrate();
    } catch (_err) {
      logger.error(`Failed to migrate ${projectName}:`, err);
      results[projectName] = { error: err.message };
    }
  }

  return results;
}
