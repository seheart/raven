/**
 * System-info Routes — small endpoints reporting Raven's own runtime state.
 *
 *   GET /health                  liveness ping (used by start.sh)
 *   GET /api/health               full health report
 *   GET /api/health-checks        legacy stub
 *   GET /api/session-id           current session id
 *   GET /api/rate-limit-status    rate-limiter snapshot
 *   GET /api/network-info         LAN URLs for QR-code mobile access
 *
 * These are tightly coupled to server-startup state (project manager,
 * watchers, registry) so the deps object is intentionally fat — the cost
 * of having a single home for them is the cost of passing them in.
 */

import os from 'os';
import express, { Request, Response, Router } from 'express';
import type { RavenDB } from '../db.js';
import type { AgentInfo } from '../types/agent-info.js';

interface RateLimitBucket {
  current: number;
  max: number;
  resetTime: number;
}

type RateLimitStatusMap = Record<string, RateLimitBucket>;

interface ServiceState {
  isRunning(): boolean;
}

interface MetricsService {
  isCollectorRunning(): boolean;
}

interface ProjectManagerLike {
  isWatching(): boolean;
  activeWatcherCount(): number;
  getWatcherStatus(): unknown;
}

interface LocalModelWatcherLike {
  getDetectedModels(): { name: string; type: string; models: string[] }[];
  getRunningModels(): { name: string; type: string; models: string[] }[];
}

interface SystemInfoDeps {
  db: RavenDB;
  sessionId: string;
  dbPath: string;
  port: number;
  agentRegistry: Map<string, AgentInfo>;
  fileWatcher: ServiceState;
  gitMonitor: ServiceState;
  metricsCollector: MetricsService;
  projectManager: ProjectManagerLike;
  localModelWatcher: LocalModelWatcherLike;
  rateLimitStatus: RateLimitStatusMap;
  hostIdentity?: { host_id: string; host_name: string };
}

/** Public health endpoint mounted at `/health` (no /api prefix). */
export function createPublicHealthRouter(deps: SystemInfoDeps): Router {
  const router = express.Router();
  router.get('/', (_req: Request, res: Response) => {
    res.json({
      status: 'healthy',
      session_id: deps.sessionId,
      uptime: process.uptime(),
      active_agents: deps.agentRegistry.size,
      modules: {
        watcher: deps.fileWatcher.isRunning(),
        git: deps.gitMonitor.isRunning(),
        metrics: deps.metricsCollector.isCollectorRunning()
      },
      database: deps.dbPath
    });
  });
  return router;
}

/** Full system-info routes mounted under /api. */
export function createSystemInfoRouter(deps: SystemInfoDeps): Router {
  const router = express.Router();

  router.get('/health', (_req: Request, res: Response) => {
    let dbHealthy = true;
    try {
      deps.db.db.prepare('SELECT 1').get();
    } catch {
      dbHealthy = false;
    }
    const watcher = deps.projectManager.isWatching() || deps.fileWatcher.isRunning();
    const metrics = deps.metricsCollector.isCollectorRunning();
    // DB and watcher are load-bearing; without them the rest of the app is
    // serving stale or zero data. Git monitor is informational. Earlier this
    // endpoint returned `status: 'healthy'` unconditionally — the canonical
    // liveness probe was lying.
    const status = dbHealthy && watcher && metrics ? 'healthy' : 'degraded';
    const httpCode = dbHealthy ? 200 : 503;
    res.status(httpCode).json({
      status,
      version: '2.2.0',
      session_id: deps.sessionId,
      uptime: process.uptime(),
      active_agents: deps.agentRegistry.size,
      modules: {
        watcher,
        git: deps.gitMonitor.isRunning(),
        metrics
      },
      project_watchers: {
        active: deps.projectManager.activeWatcherCount(),
        projects: deps.projectManager.getWatcherStatus()
      },
      local_models: {
        detected: deps.localModelWatcher.getDetectedModels().length,
        running: deps.localModelWatcher.getRunningModels().length,
        models: deps.localModelWatcher.getRunningModels().map(m => ({
          name: m.name,
          type: m.type,
          models: m.models
        }))
      },
      database: deps.dbPath,
      database_health: { status: dbHealthy ? 'healthy' : 'error', accessible: dbHealthy },
      host: deps.hostIdentity
        ? { id: deps.hostIdentity.host_id, name: deps.hostIdentity.host_name }
        : undefined
    });
  });

  // /health-checks was a legacy stub that always returned `{status:'healthy',
  // checks:[], summary:{total:0,passed:0,failed:0}}`. The real implementation
  // lives at /api/health/comprehensive (HealthChecker.runAll()). Redirect
  // legacy callers there rather than serving a fake-success.
  router.get('/health-checks', (_req: Request, res: Response) => {
    res.redirect(308, '/api/health/comprehensive');
  });

  router.get('/session-id', (_req: Request, res: Response) => {
    res.json({ session_id: deps.sessionId });
  });

  router.get('/rate-limit-status', (_req: Request, res: Response) => {
    try {
      const now = Date.now();
      const status = Object.entries(deps.rateLimitStatus).reduce(
        (acc, [key, value]) => {
          const secondsUntilReset = Math.max(0, Math.floor((value.resetTime - now) / 1000));
          const percentUsed = value.max > 0 ? Math.round((value.current / value.max) * 100) : 0;
          acc[key] = {
            current: value.current,
            max: value.max,
            percentUsed,
            secondsUntilReset,
            status: percentUsed >= 95 ? 'critical' : percentUsed >= 80 ? 'warning' : 'ok'
          };
          return acc;
        },
        {} as Record<
          string,
          {
            current: number;
            max: number;
            percentUsed: number;
            secondsUntilReset: number;
            status: 'critical' | 'warning' | 'ok';
          }
        >
      );
      res.json(status);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: message });
    }
  });

  router.get('/network-info', (_req: Request, res: Response) => {
    const nets = os.networkInterfaces();
    const addresses: { name: string; address: string; family: string }[] = [];
    for (const [name, ifaces] of Object.entries(nets)) {
      for (const iface of ifaces || []) {
        if (iface.family === 'IPv4' && !iface.internal) {
          addresses.push({ name, address: iface.address, family: 'IPv4' });
        }
      }
    }
    const frontendPort = parseInt(process.env.FRONTEND_PORT || '9000', 10);
    res.json({
      addresses,
      backend_port: deps.port,
      frontend_port: frontendPort,
      lan_url: addresses.length > 0 ? `http://${addresses[0].address}:${frontendPort}` : null,
      backend_url: addresses.length > 0 ? `http://${addresses[0].address}:${deps.port}` : null
    });
  });

  return router;
}
