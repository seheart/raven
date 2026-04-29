/**
 * Dashboard Routes — `/api/dashboard*`, `/api/top-modified-files`
 */

import express, { Request, Response, Router } from 'express';
import { logger } from '../utils/logger.js';
import { cacheMiddleware } from '../services/cache-service.js';
import { safeInt } from '../utils/request-helpers.js';
import type { ErrorsRepository } from '../repositories/errors-repository.js';
import type { DashboardRepository } from '../repositories/dashboard-repository.js';
import type { ApiLatencyRepository } from '../repositories/api-latency-repository.js';
import type { MetricsRepository } from '../repositories/metrics-repository.js';
import type { AgentInfo } from '../types/agent-info.js';

interface DashboardDeps {
  errorsRepo: ErrorsRepository;
  dashboardRepo: DashboardRepository;
  apiLatencyRepo: ApiLatencyRepository;
  metricsRepo: MetricsRepository;
  agentRegistry: Map<string, AgentInfo>;
  sessionId: string;
}

export function createDashboardRouter({
  errorsRepo,
  dashboardRepo,
  apiLatencyRepo,
  metricsRepo,
  agentRegistry,
  sessionId
}: DashboardDeps): Router {
  const router = express.Router();

  // GET /api/dashboard — aggregator for the overview page
  router.get('/dashboard', cacheMiddleware(2000), (req: Request, res: Response) => {
    try {
      const project = req.query.project as string | undefined;
      const projectFilter = project && project !== 'all' ? project : undefined;
      const todayStart = new Date(new Date().setHours(0, 0, 0, 0)).toISOString();

      const stats = metricsRepo.dashboardStats(sessionId, projectFilter);
      stats.total_agents = agentRegistry.size;
      stats.app_errors = errorsRepo.countUnresolved();

      const systemMetrics = dashboardRepo.getLatestSystemMetrics();
      const fileEvents = dashboardRepo.getRecentFileEvents(projectFilter, 100);

      const now = Date.now();
      const agentsStatus = Array.from(agentRegistry.values()).map(a => {
        const sinceLastSeen = (now - new Date(a.last_seen).getTime()) / 1000;
        return {
          ...a,
          is_running: sinceLastSeen < 300,
          confidence: a.requests_handled > 100 ? 0.95 : a.requests_handled > 10 ? 0.7 : 0.3
        };
      });

      const costs = dashboardRepo.getCostsSince(todayStart);
      const subagents = dashboardRepo.getRecentSubagents(8);
      const agentEvents = dashboardRepo.getRecentAgentEvents(300);
      const processActivity = metricsRepo.latestProcessActivity();

      const apiLatency = {
        recent: apiLatencyRepo.recent(1),
        stats: apiLatencyRepo.stats(1440)
      };

      return res.json({
        stats,
        systemMetrics,
        fileEvents,
        agentsStatus,
        costs,
        subagents,
        agentEvents,
        processActivity,
        apiLatency
      });
    } catch (error) {
      logger.error('Dashboard aggregator error:', error as Error);
      const message = error instanceof Error ? error.message : String(error);
      return res.status(500).json({ error: message });
    }
  });

  // GET /api/dashboard-stats — legacy single-call form
  router.get('/dashboard-stats', cacheMiddleware(3000), (req: Request, res: Response) => {
    try {
      const project = req.query.project as string | undefined;
      const stats = metricsRepo.dashboardStats(sessionId, project);
      stats.total_agents = agentRegistry.size;
      stats.app_errors = errorsRepo.countUnresolved();
      return res.json(stats);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return res.status(500).json({ error: message });
    }
  });

  // GET /api/top-modified-files
  router.get('/top-modified-files', cacheMiddleware(5000), (req: Request, res: Response) => {
    try {
      const limit = safeInt(req.query.limit, 10);
      const project = req.query.project as string | undefined;
      const projectFilter = project && project !== 'all' ? project : null;
      return res.json(dashboardRepo.getTopModifiedFiles(projectFilter, limit));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return res.status(500).json({ error: message });
    }
  });

  return router;
}
