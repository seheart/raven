import express, { Request, Response, Router } from 'express';
import type { ApiLatencyRepository } from '../repositories/api-latency-repository.js';
import type { DashboardRepository } from '../repositories/dashboard-repository.js';
import type { MetricsRepository } from '../repositories/metrics-repository.js';
import { cacheMiddleware } from '../services/cache-service.js';
import { safeInt } from '../utils/request-helpers.js';

export function createMetricsRouter(
  apiLatencyRepo: ApiLatencyRepository,
  metricsRepo: MetricsRepository,
  dashboardRepo: DashboardRepository
): Router {
  const router = express.Router();

  router.get('/system-metrics', cacheMiddleware(2000), (req: Request, res: Response) => {
    try {
      const limit = safeInt(req.query.limit, 100);
      const startTime = req.query.start_time as string | undefined;
      const endTime = req.query.end_time as string | undefined;
      const metrics = metricsRepo.systemMetricsInRange(startTime, endTime, limit);
      return res.json(metrics);
    } catch (error) {
      return res
        .status(500)
        .json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  router.get('/process-metrics/:agent', (req: Request, res: Response) => {
    try {
      const { agent } = req.params;
      const limit = safeInt(req.query.limit, 100);
      const metrics = metricsRepo.processMetricsByAgent(agent, limit);
      return res.json(metrics);
    } catch (error) {
      return res
        .status(500)
        .json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  router.get('/metrics-stats', (req: Request, res: Response) => {
    try {
      const now = Date.now();
      const dayAgo = now - 24 * 60 * 60 * 1000;
      const start_time = (req.query.start_time as string) || new Date(dayAgo).toISOString();
      const end_time = (req.query.end_time as string) || new Date(now).toISOString();
      const stats = metricsRepo.metricsStats(start_time, end_time);
      return res.json(stats);
    } catch (error) {
      return res
        .status(500)
        .json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  router.get('/process-activity', cacheMiddleware(2000), (_req: Request, res: Response) => {
    try {
      const activity = metricsRepo.latestProcessActivity();
      return res.json(activity);
    } catch (error) {
      return res
        .status(500)
        .json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  router.get('/api-latency', cacheMiddleware(2000), (req: Request, res: Response) => {
    try {
      const limit = safeInt(req.query.limit, 100);
      const minutes = safeInt(req.query.minutes, 60);
      const recent = apiLatencyRepo.recent(limit);
      const stats = apiLatencyRepo.stats(minutes);
      return res.json({ recent, stats });
    } catch (error) {
      return res
        .status(500)
        .json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  router.get('/performance-correlations', cacheMiddleware(10000), (req: Request, res: Response) => {
    try {
      const time_window_seconds = safeInt(req.query.time_window_seconds, 5);
      const correlations = dashboardRepo.correlateEventsWithMetrics(time_window_seconds);
      return res.json(correlations);
    } catch (error) {
      return res
        .status(500)
        .json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  return router;
}
