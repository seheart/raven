import { GitBackfillService } from '../services/git-backfill.js';

/**
 * Initialize watchers for all projects.
 * Mirrors existing behavior in server.js but extracted for clarity.
 *
 * @param {object} params
 * @param {Map<string,string>} params.projectPaths
 * @param {Map<string,any>} params.projectDatabases
 * @param {Map<string,any>} params.projectWatchers
 * @param {Map<string,any>} params.projectConversationSyncs
 * @param {string} params.SESSION_ID
 * @param {object} params.logger
 * @param {import('socket.io').Server} params.io
 * @param {function} params.initializeWatcher - returns FSWatcher or null
 * @param {function} params.getMetricsDatabase
 * @param {function} params.registerConversationHealthChecks
 * @param {object} params.healthCheckSystem
 * @param {object} params.config
 * @returns {Promise<{successCount:number,failCount:number,skippedCount:number}>}
 */
export async function initializeAllWatchers({
  projectPaths,
  projectDatabases,
  projectWatchers,
  projectConversationSyncs,
  SESSION_ID,
  logger,
  io,
  initializeWatcher,
  getMetricsDatabase,
  registerConversationHealthChecks,
  healthCheckSystem,
  config
}) {
  logger.info('🚀 Starting file watchers for all projects');
  logger.info('   Mode: Reactive (ignoreInitial=true) - only tracking new changes');

  try {
    const skipProjects = config.projects?.skip_projects || ['echo', 'archive'];
    logger.info(`   Skip list: ${skipProjects.join(', ')}`);

    let successCount = 0;
    let failCount = 0;
    let skippedCount = 0;

    for (const [projectName, projectPath] of projectPaths.entries()) {
      if (skipProjects.includes(projectName)) {
        logger.warn(`⚠️  Skipping file watcher for ${projectName} (in skip list)`);
        skippedCount++;
        continue;
      }

      try {
        const watcher = initializeWatcher(projectName);
        if (watcher) {
          projectWatchers.set(projectName, watcher);
          successCount++;
          logger.info(`✅ Watcher started for ${projectName}`, { path: projectPath });

          // Start conversation sync for this project
          try {
            const db = projectDatabases.get(projectName);
            if (db) {
              const { ConversationSync } = await import('../services/conversation-sync.js');
              const conversationSync = new ConversationSync(db, SESSION_ID, io, projectPath);
              await conversationSync.start();
              projectConversationSyncs.set(projectName, conversationSync);
            }
          } catch (syncError) {
            logger.warn(`⚠️  Conversation sync failed for ${projectName}:`, syncError.message);
          }
        } else {
          failCount++;
        }
      } catch (error) {
        logger.error(`❌ Failed to start watcher for ${projectName}:`, error);
        failCount++;
      }
    }

    logger.info('✅ File watchers initialized', {
      success: successCount,
      failed: failCount,
      skipped: skippedCount,
      total: projectPaths.size
    });

    // Register conversation health checks now that syncs are started
    if (healthCheckSystem && projectConversationSyncs.size > 0) {
      const firstDb = getMetricsDatabase();
      if (firstDb) {
        registerConversationHealthChecks(healthCheckSystem, firstDb, projectConversationSyncs);
        logger.info('✅ Conversation health checks registered');
      }
    }

    // Backfill missed changes from git status
    logger.info('🔄 Reconciling changes with git status...');
    let totalBackfilled = 0;
    for (const [projectName, projectPath] of projectPaths.entries()) {
      const db = projectDatabases.get(projectName);
      if (db) {
        try {
          const backfillService = new GitBackfillService(db, projectPath, SESSION_ID);
          const result = await backfillService.backfillMissedChanges();
          totalBackfilled += result.backfilled || 0;
        } catch (error) {
          logger.warn(`⚠️  Git backfill failed for ${projectName}:`, error.message);
        }
      }
    }
    if (totalBackfilled > 0) {
      logger.info(`✅ Reconciled ${totalBackfilled} missed change(s) from git`);
    } else {
      logger.info('✅ All changes reconciled - telemetry is up to date');
    }

    return { successCount, failCount, skippedCount };
  } catch (error) {
    logger.error('❌ Failed to initialize file watchers:', error);
    return { successCount: 0, failCount: 1, skippedCount: 0 };
  }
}


