/**
 * Metrics Routes
 * Provides Prometheus and JSON metrics endpoints
 */

import express from 'express';
import { getMetricsPrometheus, getMetricsJson } from '../middleware/metrics.js';
import { env } from '../config/environment.js';

export function createMetricsRoutes() {
  const router = express.Router();

  /**
   * GET /metrics
   * Prometheus-compatible metrics endpoint
   */
  router.get('/metrics', (req, res) => {
    if (!env.ENABLE_METRICS) {
      return res.status(503).json({
        error: 'Metrics collection is disabled',
        hint: 'Set ENABLE_METRICS=true to enable'
      });
    }

    const metrics = getMetricsPrometheus();
    res.setHeader('Content-Type', 'text/plain; version=0.0.4');
    res.send(metrics);
  });

  /**
   * GET /metrics/json
   * JSON metrics for internal dashboard
   */
  router.get('/metrics/json', (req, res) => {
    if (!env.ENABLE_METRICS) {
      return res.status(503).json({
        error: 'Metrics collection is disabled',
        hint: 'Set ENABLE_METRICS=true to enable'
      });
    }

    const metrics = getMetricsJson();
    res.json(metrics);
  });

  return router;
}
