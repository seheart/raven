#!/usr/bin/env node
/**
 * Migration CLI tool
 * Usage:
 *   node migrate.js up           - Run pending migrations
 *   node migrate.js down          - Rollback last migration
 *   node migrate.js down <version> - Rollback to specific version
 *   node migrate.js create <name> - Create new migration file
 *   node migrate.js status        - Show migration status
 */

import { DatabaseMigrator } from './migrator.js';
import { logger } from '../utils/logger.js';
import { openProjectDatabase } from '../services/database.js';
import fs from 'fs';
import { join } from 'path';

const command = process.argv[2];
const arg = process.argv[3];

async function main() {
  if (command === 'create') {
    if (!arg) {
      logger.error('❌ Migration name required');
      logger.info('Usage: node migrate.js create <migration_name>');
      process.exit(1);
    }
    DatabaseMigrator.createMigration(arg);
    process.exit(0);
  }

  // For other commands, we need a database
  const dbPath = join(process.cwd(), '..', '.raven', 'db', 'developer.db');

  if (!fs.existsSync(dbPath)) {
    logger.error(`❌ Database not found: ${dbPath}`);
    process.exit(1);
  }

  const db = await openProjectDatabase('developer', dbPath);
  const migrator = new DatabaseMigrator(db.db, 'developer');

  switch (command) {
    case 'up':
    case 'migrate':
      await migrator.migrate();
      break;

    case 'down':
    case 'rollback':
      const version = arg ? parseInt(arg) : null;
      await migrator.rollback(version);
      break;

    case 'status': {
      migrator.initMigrationsTable();
      const current = migrator.getCurrentVersion();
      const available = migrator.getAvailableMigrations();
      const pending = available.filter(m => m.version > current);

      logger.info('\n📊 Migration Status:');
      logger.info(`Current version: ${current}`);
      logger.info(`Available migrations: ${available.length}`);
      logger.info(`Pending migrations: ${pending.length}`);

      if (pending.length > 0) {
        logger.info('\nPending:');
        pending.forEach(m => {
          logger.info(`  ${m.version}: ${m.name}`);
        });
      }
      break;
    }

    default:
      logger.info(`
Migration CLI

Commands:
  up, migrate              Run pending migrations
  down, rollback [version] Rollback migrations
  create <name>            Create new migration
  status                   Show migration status

Examples:
  node migrate.js up
  node migrate.js create add_user_preferences
  node migrate.js down
  node migrate.js down 5
      `);
  }

  db.db.close();
}

main().catch(err => {
  logger.error('❌ Migration failed:', err);
  process.exit(1);
});
