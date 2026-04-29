/**
 * Metrics Overview Routes — `/api/metrics/dashboard`, `/api/metrics/performance`
 *
 * Distinct from `routes/metrics.ts` (per-event metrics endpoints). These two
 * are aggregator queries used by the metrics overview UI.
 */

import express, { Request, Response, Router } from 'express';
import { logger } from '../utils/logger.js';
import { cacheMiddleware } from '../services/cache-service.js';
import type { DashboardRepository } from '../repositories/dashboard-repository.js';

export function createMetricsOverviewRouter(repo: DashboardRepository): Router {
  const router = express.Router();

  router.get('/dashboard', cacheMiddleware(5000), (_req: Request, res: Response) => {
    try {
      return res.json(repo.getMetricsDashboard());
    } catch (error) {
      logger.error('❌ Custom metrics error:', error as Error);
      const message = error instanceof Error ? error.message : String(error);
      return res.status(500).json({ error: message });
    }
  });

  router.get('/performance', cacheMiddleware(5000), async (req: Request, res: Response) => {
    try {
      const range = (req.query.range as string) || '1h';
      let hours = 1;
      if (range === '6h') hours = 6;
      else if (range === '24h') hours = 24;
      else if (range === '7d') hours = 168;
      const startTime = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

      const metrics = repo.getPerformanceSeries(startTime);
      return res.json({ metrics, range, start_time: startTime });
    } catch (error) {
      logger.error('❌ Performance metrics error:', error as Error);
      const message = error instanceof Error ? error.message : String(error);
      return res.status(500).json({ error: message });
    }
  });

  return router;
}
