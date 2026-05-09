/**
 * Health Monitoring API Routes
 * Exposes health check data and monitoring dashboard endpoints
 */

import express, { Request, Response } from 'express';
import { HealthMonitor } from '../services/health-monitor.js';
import { HealthChecker } from '../services/health-checker.js';
import type { RavenDB } from '../db.js';

export function createHealthMonitoringRouter(healthMonitor: HealthMonitor, db?: RavenDB) {
  const router = express.Router();

  /**
   * Comprehensive endpoint sweep — runs HealthChecker.runAll() against every
   * registered /api/* check (one per /system page's primary endpoint, plus
   * dashboard/today/conversations feeders). Used by /system/diagnostic to
   * verify nothing has silently regressed. Slow (parallel network calls,
   * ~1-3s); rides under the long-running prefix in server.ts so it doesn't
   * trip the 30s global timeout.
   */
  router.get('/comprehensive', async (_req: Request, res: Response) => {
    try {
      const checker = new HealthChecker(`http://localhost:${process.env.PORT || 9100}`, db ?? null);
      const summary = await checker.runAll();
      res.json(summary);
    } catch (error: unknown) {
      res.status(500).json({
        error: 'Comprehensive health check failed',
        message: error instanceof Error ? error.message : String(error)
      });
    }
  });

  /**
   * Get current health status
   * GET /api/health/status
   */
  router.get('/status', async (req: Request, res: Response) => {
    try {
      const report = await healthMonitor.runHealthCheck();
      res.json(report);
    } catch (error: any) {
      res.status(500).json({
        error: 'Health check failed',
        message: error.message
      });
    }
  });

  /**
   * Get last cached health report (faster)
   * GET /api/health/last-report
   */
  router.get('/last-report', (req: Request, res: Response) => {
    const report = healthMonitor.getLastReport();

    if (!report) {
      return res.status(404).json({
        error: 'No health report available yet',
        message: 'Health monitoring has not run yet'
      });
    }

    return res.json(report);
  });

  /**
   * Get critical issues only
   * GET /api/health/critical
   */
  router.get('/critical', (req: Request, res: Response) => {
    const report = healthMonitor.getLastReport();

    if (!report) {
      return res.json({ critical: [] });
    }

    const criticalIssues = report.checks.filter(c => c.status === 'critical');

    return res.json({
      count: criticalIssues.length,
      issues: criticalIssues
    });
  });

  /**
   * Get warnings
   * GET /api/health/warnings
   */
  router.get('/warnings', (req: Request, res: Response) => {
    const report = healthMonitor.getLastReport();

    if (!report) {
      return res.json({ warnings: [] });
    }

    const warnings = report.checks.filter(c => c.status === 'warning');

    return res.json({
      count: warnings.length,
      issues: warnings
    });
  });

  /**
   * Get health status for specific category
   * GET /api/health/category/:category
   */
  router.get('/category/:category', (req: Request, res: Response) => {
    const { category } = req.params;
    const checks = healthMonitor.getStatusForCategory(category);

    res.json({
      category,
      checks
    });
  });

  /**
   * Check if system is healthy (simple boolean)
   * GET /api/health/is-healthy
   */
  router.get('/is-healthy', (req: Request, res: Response) => {
    const isHealthy = healthMonitor.isHealthy();

    res.json({
      healthy: isHealthy,
      status: isHealthy ? 'All systems operational' : 'System degraded or critical'
    });
  });

  return router;
}
