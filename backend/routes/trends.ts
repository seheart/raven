/**
 * Trends Routes — `/api/trends/*`
 */

import express, { Request, Response, Router } from 'express';
import { logger } from '../utils/logger.js';
import { cacheMiddleware } from '../services/cache-service.js';
import { safeInt } from '../utils/request-helpers.js';
import type { DashboardRepository, TrendPeriod } from '../repositories/dashboard-repository.js';

const VALID_PERIODS = new Set<TrendPeriod>(['hourly', 'daily', 'weekly']);

export function createTrendsRouter(repo: DashboardRepository): Router {
  const router = express.Router();

  // GET /api/trends/historical?period=hourly|daily|weekly&days=N
  router.get('/historical', cacheMiddleware(5000), (req: Request, res: Response) => {
    try {
      const rawPeriod = (req.query.period as string) || 'hourly';
      const period: TrendPeriod = VALID_PERIODS.has(rawPeriod as TrendPeriod)
        ? (rawPeriod as TrendPeriod)
        : 'hourly';
      const days = safeInt(req.query.days, 7);
      const startTime = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

      const trends = repo.getHistoricalTrends(period, startTime);

      return res.json({
        trends,
        period,
        days,
        start_time: startTime
      });
    } catch (error) {
      logger.error('❌ Historical trends error:', error as Error);
      const message = error instanceof Error ? error.message : String(error);
      return res.status(500).json({ error: message });
    }
  });

  return router;
}
