import express, { Request, Response, Router } from 'express';
import type { RavenDB } from '../db.js';
import { cacheMiddleware } from '../services/cache-service.js';
import { safeInt } from '../utils/request-helpers.js';

export function createMetricsRouter(db: RavenDB): Router {
  const router = express.Router();

  router.get('/system-metrics', cacheMiddleware(2000), (req: Request, res: Response) => {
    try {
      const limit = safeInt(req.query.limit, 100);
      const startTime = req.query.start_time as string;
      const endTime = req.query.end_time as string;

      let query = `
        SELECT id, timestamp, cpu_percent, memory_percent, memory_used_mb, memory_total_mb, network_rx_bytes, network_tx_bytes
        FROM raven_metrics
      `;
      const params: any[] = [];

      if (startTime && endTime) {
        query += ' WHERE timestamp BETWEEN ? AND ?';
        params.push(startTime, endTime);
      } else if (startTime) {
        query += ' WHERE timestamp >= ?';
        params.push(startTime);
      } else if (endTime) {
        query += ' WHERE timestamp <= ?';
        params.push(endTime);
      }

      query += ' ORDER BY timestamp DESC LIMIT ?';
      params.push(limit);

      const metrics = db.db.prepare(query).all(...params);
      return res.json(metrics);
    } catch (error: any) {
      return res.status(500).json({ error: error.message });
    }
  });

  router.get('/process-metrics/:agent', (req: Request, res: Response) => {
    try {
      const { agent } = req.params;
      const limit = safeInt(req.query.limit, 100);
      const metrics = db.getProcessMetricsByAgent(agent, limit);
      return res.json(metrics);
    } catch (error: any) {
      return res.status(500).json({ error: error.message });
    }
  });

  router.get('/metrics-stats', (req: Request, res: Response) => {
    try {
      const now = Date.now();
      const dayAgo = now - 24 * 60 * 60 * 1000;
      const start_time = (req.query.start_time as string) || new Date(dayAgo).toISOString();
      const end_time = (req.query.end_time as string) || new Date(now).toISOString();
      const stats = db.getMetricsStats(start_time, end_time);
      return res.json(stats);
    } catch (error: any) {
      return res.status(500).json({ error: error.message });
    }
  });

  router.get('/process-activity', cacheMiddleware(2000), (_req: Request, res: Response) => {
    try {
      const activity = db.getLatestProcessActivity();
      return res.json(activity);
    } catch (error: any) {
      return res.status(500).json({ error: error.message });
    }
  });

  router.get('/api-latency', cacheMiddleware(2000), (req: Request, res: Response) => {
    try {
      const limit = safeInt(req.query.limit, 100);
      const minutes = safeInt(req.query.minutes, 60);
      const recent = db.getRecentApiLatency(limit);
      const stats = db.getApiLatencyStats(minutes);
      return res.json({ recent, stats });
    } catch (error: any) {
      return res.status(500).json({ error: error.message });
    }
  });

  router.get('/performance-correlations', cacheMiddleware(10000), (req: Request, res: Response) => {
    try {
      const time_window_seconds = safeInt(req.query.time_window_seconds, 5);
      const correlations = db.correlateEventsWithMetrics(time_window_seconds);
      return res.json(correlations);
    } catch (error: any) {
      return res.status(500).json({ error: error.message });
    }
  });

  return router;
}
