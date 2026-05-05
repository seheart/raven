/**
 * Graceful shutdown — stops watchers/services in order, closes the DB, and
 * exits. Also installs SIGINT/SIGTERM/uncaught-exception handlers.
 */

import type { Server as HttpServer } from 'http';
import type { RavenDB } from '../db.js';
import { logger } from '../utils/logger.js';
import { stopCacheCleanup } from './cache-service.js';

interface Stoppable {
  stop(): unknown;
}

interface AsyncStoppable {
  stop(): Promise<unknown>;
}

interface MonitorStoppable {
  stopMonitoring(): unknown;
}

interface ProjectManagerLike {
  stopAllWatchers(): Promise<unknown>;
}

interface SelfAnalysisLike {
  stopSchedule(): unknown;
}

interface ShutdownDeps {
  httpServer: HttpServer;
  db: RavenDB;
  claudeLogWatcher: AsyncStoppable;
  codexLogWatcher: AsyncStoppable;
  ollamaLogWatcher: AsyncStoppable;
  projectManager: ProjectManagerLike;
  fileWatcher: AsyncStoppable;
  gitMonitor: Stoppable;
  localModelWatcher: Stoppable;
  metricsCollector: Stoppable;
  gpuMetricsCollector?: Stoppable;
  healthMonitor: MonitorStoppable;
  insightsService?: Stoppable;
  selfAnalysisService?: SelfAnalysisLike;
  /** Optional process-check interval to clear; passed by reference. */
  getProcessCheckTimer: () => ReturnType<typeof setInterval> | null;
}

export function installGracefulShutdown(deps: ShutdownDeps): {
  shutdown: (signal: string) => Promise<void>;
} {
  let isShuttingDown = false;

  const shutdown = async (signal: string) => {
    if (isShuttingDown) {
      logger.warn(`⚠️  Already shutting down, ignoring ${signal}`);
      return;
    }
    isShuttingDown = true;
    logger.info(`\n🛑 Received ${signal}, shutting down Raven backend gracefully...`);

    try {
      deps.httpServer.close(() => logger.info('✅ HTTP server closed'));

      logger.info('🛑 Stopping Claude Code log watcher...');
      await deps.claudeLogWatcher.stop();

      logger.info('🛑 Stopping Codex log watcher...');
      await deps.codexLogWatcher.stop();

      logger.info('🛑 Stopping Ollama log watcher...');
      await deps.ollamaLogWatcher.stop();

      logger.info('🛑 Stopping project watchers...');
      await deps.projectManager.stopAllWatchers();
      await deps.fileWatcher.stop();

      logger.info('🛑 Stopping git monitor...');
      deps.gitMonitor.stop();

      const timer = deps.getProcessCheckTimer();
      if (timer) clearInterval(timer);

      logger.info('🛑 Stopping local model watcher...');
      deps.localModelWatcher.stop();

      stopCacheCleanup();

      logger.info('🛑 Stopping metrics collector...');
      deps.metricsCollector.stop();
      if (deps.gpuMetricsCollector) {
        deps.gpuMetricsCollector.stop();
      }

      logger.info('🛑 Stopping health monitor...');
      deps.healthMonitor.stopMonitoring();

      if (deps.insightsService) {
        logger.info('🛑 Stopping insights service...');
        deps.insightsService.stop();
      }
      if (deps.selfAnalysisService) {
        logger.info('🛑 Stopping self-analysis service...');
        deps.selfAnalysisService.stopSchedule();
      }

      logger.info('🛑 Closing database...');
      deps.db.close();

      logger.info('✅ Graceful shutdown complete');
      process.exit(0);
    } catch (error) {
      logger.error('❌ Error during shutdown:', error as Error);
      process.exit(1);
    }
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  process.on('unhandledRejection', (reason: unknown) => {
    logger.error(
      'Unhandled promise rejection:',
      reason instanceof Error ? reason : new Error(String(reason))
    );
  });

  process.on('uncaughtException', (error: Error) => {
    logger.error('Uncaught exception:', error);
    shutdown('uncaughtException');
  });

  return { shutdown };
}
