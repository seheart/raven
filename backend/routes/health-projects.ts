/**
 * Multi-project health route — `/api/health/projects`
 *
 * Aggregate "is anything happening?" rollup. Currently treats the whole
 * database as a single project (named after PROJECT_NAME) — multi-project
 * tracking is pending.
 */

import express, { Request, Response, Router } from 'express';
import { logger } from '../utils/logger.js';
import { cacheMiddleware } from '../services/cache-service.js';
import type { FileEventsRepository } from '../repositories/file-events-repository.js';
import type { SyntaxErrorsRepository } from '../repositories/syntax-errors-repository.js';

interface HealthProjectsDeps {
  fileEventsRepo: FileEventsRepository;
  syntaxErrorsRepo: SyntaxErrorsRepository;
  projectName: string;
}

export function createHealthProjectsRouter({
  fileEventsRepo,
  syntaxErrorsRepo,
  projectName
}: HealthProjectsDeps): Router {
  const router = express.Router();

  router.get('/projects', cacheMiddleware(5000), (_req: Request, res: Response) => {
    try {
      const totalEventsCount = fileEventsRepo.totalCount();
      const recent = fileEventsRepo.countSinceHours(24);
      const lastActivityTs = fileEventsRepo.lastTimestamp();
      const errorCount = syntaxErrorsRepo.totalCount();

      const activityScore = Math.min(recent, 100);
      const errorPenalty = Math.min(errorCount * 5, 50);
      const healthScore = Math.max(activityScore - errorPenalty, 0);

      let status: 'active' | 'recent' | 'idle' | 'inactive' = 'inactive';
      if (lastActivityTs) {
        const hours = (Date.now() - new Date(lastActivityTs).getTime()) / 3_600_000;
        if (hours < 1) status = 'active';
        else if (hours < 24) status = 'recent';
        else if (hours < 168) status = 'idle';
      }

      const projects = [
        {
          name: projectName,
          status,
          health_score: healthScore,
          recent_events: recent,
          error_count: errorCount,
          last_activity: lastActivityTs
        }
      ];

      return res.json({
        projects,
        total_projects: projects.length,
        active_projects: projects.filter(p => p.status === 'active').length,
        recent_projects: projects.filter(p => p.status === 'recent').length,
        // Kept for legacy callers — `total_events` was reported alongside the
        // project entries in the original handler.
        total_events: totalEventsCount
      });
    } catch (error) {
      logger.error('❌ Multi-project health error:', error as Error);
      const message = error instanceof Error ? error.message : String(error);
      return res.status(500).json({ error: message });
    }
  });

  return router;
}
