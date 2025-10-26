/**
 * Database Index Migration
 * Adds missing indexes for performance optimization
 *
 * Run with: node backend/add-database-indexes.js
 */

import Database from 'better-sqlite3';
import { logger } from 'utils/logger.js';
import { readdirSync, existsSync } from 'fs';
import { join } from 'path';

const DB_DIR = '.raven/db';

// Indexes to create for performance optimization
const INDEXES = [
  // Changes table - most frequently queried
  { table: 'changes', name: 'idx_changes_timestamp', columns: 'timestamp DESC' },
  { table: 'changes', name: 'idx_changes_project', columns: 'project' },
  { table: 'changes', name: 'idx_changes_project_timestamp', columns: 'project, timestamp DESC' },
  { table: 'changes', name: 'idx_changes_change_type', columns: 'change_type' },
  { table: 'changes', name: 'idx_changes_agent', columns: 'agent' },

  // Events table
  { table: 'events', name: 'idx_events_timestamp', columns: 'timestamp DESC' },
  { table: 'events', name: 'idx_events_session', columns: 'session_id' },
  { table: 'events', name: 'idx_events_filepath', columns: 'filepath' },

  // Sessions table
  { table: 'sessions', name: 'idx_sessions_project', columns: 'project_name' },
  { table: 'sessions', name: 'idx_sessions_start_time', columns: 'start_time DESC' },
  { table: 'sessions', name: 'idx_sessions_quality', columns: 'quality_score DESC' },

  // Agent events table
  { table: 'agent_events', name: 'idx_agent_events_agent', columns: 'agent' },
  { table: 'agent_events', name: 'idx_agent_events_timestamp', columns: 'timestamp DESC' },
  { table: 'agent_events', name: 'idx_agent_events_session', columns: 'session_id' },
  { table: 'agent_events', name: 'idx_agent_events_event_type', columns: 'event_type' },

  // Rollbacks table
  { table: 'rollbacks', name: 'idx_rollbacks_project', columns: 'project_name' },
  { table: 'rollbacks', name: 'idx_rollbacks_timestamp', columns: 'created_at DESC' },
  { table: 'rollbacks', name: 'idx_rollbacks_project_timestamp', columns: 'project_name, created_at DESC' },

  // Similar changes table
  { table: 'similar_changes', name: 'idx_similar_changes_change_id', columns: 'change_id' },
  { table: 'similar_changes', name: 'idx_similar_changes_similar_id', columns: 'similar_change_id' },
  { table: 'similar_changes', name: 'idx_similar_changes_similarity', columns: 'similarity_score DESC' },

  // Metrics tables
  { table: 'raven_metrics', name: 'idx_metrics_timestamp', columns: 'timestamp DESC' },
  { table: 'raven_metrics', name: 'idx_metrics_session', columns: 'session_id' },

  { table: 'process_metrics', name: 'idx_process_metrics_timestamp', columns: 'timestamp DESC' },
  { table: 'process_metrics', name: 'idx_process_metrics_agent', columns: 'agent_name' },

  // Error logs table
  { table: 'error_logs', name: 'idx_error_logs_timestamp', columns: 'timestamp DESC' },
  { table: 'error_logs', name: 'idx_error_logs_severity', columns: 'severity' },

  // Notifications table
  { table: 'notifications', name: 'idx_notifications_timestamp', columns: 'timestamp DESC' },
  { table: 'notifications', name: 'idx_notifications_read', columns: 'read' },
  { table: 'notifications', name: 'idx_notifications_type', columns: 'type' }
];

function addIndexesToDatabase(dbPath, projectName) {
  logger.info(`\n📊 Processing: ${projectName}`);

  try {
    const db = new Database(dbPath);
    let indexesCreated = 0;
    let indexesSkipped = 0;

    for (const index of INDEXES) {
      try {
        // Check if table exists
        const tableExists = db.prepare(`
          SELECT name FROM sqlite_master
          WHERE type='table' AND name=?
        `).get(index.table);

        if (!tableExists) {
          // logger.info(`   ⏭️  Skip: ${index.name} (table ${index.table} doesn't exist)`);
          continue;
        }

        // Check if index already exists
        const existingIndex = db.prepare(`
          SELECT name FROM sqlite_master
          WHERE type='index' AND name=?
        `).get(index.name);

        if (existingIndex) {
          indexesSkipped++;
          continue;
        }

        // Create the index
        db.prepare(`
          CREATE INDEX ${index.name} ON ${index.table}(${index.columns})
        `).run();

        logger.info(`   ✅ Created: ${index.name} on ${index.table}(${index.columns})`);
        indexesCreated++;

      } catch (err) {
        logger.error(`   ❌ Error creating ${index.name}:`, err.message);
      }
    }

    db.close();

    if (indexesCreated > 0) {
      logger.info(`   📈 Created ${indexesCreated} new indexes, skipped ${indexesSkipped} existing`);
    } else {
      logger.info(`   ✨ All indexes already exist (${indexesSkipped} total)`);
    }

    return { created: indexesCreated, skipped: indexesSkipped };

  } catch (err) {
    logger.error(`   ❌ Failed to process database:`, err.message);
    return { created: 0, skipped: 0 };
  }
}

async function main() {
  logger.info('🚀 DATABASE INDEX MIGRATION');
  logger.info('====================================');

  if (!existsSync(DB_DIR)) {
    logger.error(`❌ Database directory not found: ${DB_DIR}`);
    process.exit(1);
  }

  const dbFiles = readdirSync(DB_DIR).filter(file => file.endsWith('.db'));

  if (dbFiles.length === 0) {
    logger.error(`❌ No database files found in ${DB_DIR}`);
    process.exit(1);
  }

  logger.info(`Found ${dbFiles.length} database(s)\n`);

  let totalCreated = 0;
  let totalSkipped = 0;

  for (const dbFile of dbFiles) {
    const dbPath = join(DB_DIR, dbFile);
    const projectName = dbFile.replace('.db', '');

    const result = addIndexesToDatabase(dbPath, projectName);
    totalCreated += result.created;
    totalSkipped += result.skipped;
  }

  logger.info('\n====================================');
  logger.info('📊 SUMMARY:');
  logger.info(`   Databases processed: ${dbFiles.length}`);
  logger.info(`   New indexes created: ${totalCreated}`);
  logger.info(`   Existing indexes: ${totalSkipped}`);
  logger.info('====================================');
  logger.info('✅ Index migration complete!');
}

main().catch(err => {
  logger.error('Fatal error:', err);
  process.exit(1);
});
