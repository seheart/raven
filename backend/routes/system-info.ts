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
import { allBreakers } from '../utils/circuit-breaker.js';
import { getDiskState } from '../utils/disk-state.js';

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

interface WatcherHealth {
  health?(): {
    running: boolean;
    permanentlyFailed: boolean;
    restartAttempts: number;
    lastError: string | null;
  };
  isRunning(): boolean;
}

interface LogWatcherHealth {
  health?(): {
    running: boolean;
    permanentlyFailed: boolean;
    restartAttempts: number;
    lastError: string | null;
    lastSuccessfulTailAt: string | null;
  };
}

interface InsightsServiceLike {
  isGenerating(): boolean;
}

interface SystemInfoDeps {
  db: RavenDB;
  sessionId: string;
  dbPath: string;
  port: number;
  agentRegistry: Map<string, AgentInfo>;
  fileWatcher: ServiceState & WatcherHealth;
  gitMonitor: ServiceState;
  metricsCollector: MetricsService;
  projectManager: ProjectManagerLike;
  localModelWatcher: LocalModelWatcherLike;
  rateLimitStatus: RateLimitStatusMap;
  hostIdentity?: { host_id: string; host_name: string };
  claudeLogWatcher?: LogWatcherHealth;
  codexLogWatcher?: LogWatcherHealth;
  insightsService?: InsightsServiceLike;
}

/** Public health endpoint mounted at `/health` (no /api prefix). */
export function createPublicHealthRouter(deps: SystemInfoDeps): Router {
  const router = express.Router();
  router.get('/', (_req: Request, res: Response) => {
    // The previous version hard-coded `status: 'healthy'`. start.sh uses this
    // as a liveness probe, so it does need to return 200 when the server is
    // up — but lying about subsystem state was a footgun. Now we mirror the
    // /api/health logic in a stripped-down form: DB unreachable or disk full
    // demotes us to 503; everything else stays 200 with an honest status field.
    let dbReadable = true;
    try {
      deps.db.db.prepare('SELECT 1').get();
    } catch {
      dbReadable = false;
    }
    const diskState = getDiskState();
    const watcherRunning =
      deps.projectManager.activeWatcherCount() > 0 || deps.fileWatcher.isRunning();
    const status =
      !dbReadable || diskState.diskFull
        ? 'down'
        : watcherRunning && deps.metricsCollector.isCollectorRunning()
          ? 'healthy'
          : 'degraded';
    const httpCode = !dbReadable || diskState.diskFull ? 503 : 200;
    res.status(httpCode).json({
      status,
      session_id: deps.sessionId,
      uptime: process.uptime(),
      active_agents: deps.agentRegistry.size,
      modules: {
        watcher: watcherRunning,
        git: deps.gitMonitor.isRunning(),
        metrics: deps.metricsCollector.isCollectorRunning()
      },
      database: deps.dbPath,
      disk_full: diskState.diskFull
    });
  });
  return router;
}

/** Full system-info routes mounted under /api. */
export function createSystemInfoRouter(deps: SystemInfoDeps): Router {
  const router = express.Router();

  router.get('/health', (_req: Request, res: Response) => {
    // ---- DB: read probe + writable probe -----------------------------------
    // SELECT 1 only proves the DB is open. A read-only / corrupted DB or
    // disk-full filesystem would still pass that, but writes would fail. The
    // write probe uses a temp table that doesn't touch real data.
    let dbReadable = true;
    let dbWritable = true;
    try {
      deps.db.db.prepare('SELECT 1').get();
    } catch {
      dbReadable = false;
    }
    try {
      // CREATE TEMP TABLE writes to the WAL but is scoped to the connection;
      // skips the disk if WAL was already opened. Combined with the disk
      // state below it gives an honest "can we write?" answer.
      deps.db.db.exec(
        'CREATE TEMP TABLE IF NOT EXISTS _health_probe(x INTEGER); INSERT INTO _health_probe(x) VALUES(1); DELETE FROM _health_probe'
      );
    } catch {
      dbWritable = false;
    }

    // ---- File watcher -------------------------------------------------------
    const fwHealth = deps.fileWatcher.health?.() ?? null;
    const projectWatcherCount = deps.projectManager.activeWatcherCount();
    const watcherRunning =
      projectWatcherCount > 0 || (fwHealth ? fwHealth.running : deps.fileWatcher.isRunning());
    const watcherUnhealthy = (fwHealth?.permanentlyFailed ?? false) && projectWatcherCount === 0;

    // ---- Log watchers (claude, codex) --------------------------------------
    const claudeHealth = deps.claudeLogWatcher?.health?.() ?? null;
    const codexHealth = deps.codexLogWatcher?.health?.() ?? null;

    // ---- Ollama breaker -----------------------------------------------------
    const ollamaBreaker =
      allBreakers()
        .find(b => b.name === 'ollama')
        ?.snapshot() ?? null;

    // ---- Disk state ---------------------------------------------------------
    const diskState = getDiskState();

    // ---- Metrics + git ------------------------------------------------------
    const metrics = deps.metricsCollector.isCollectorRunning();

    // ---- Overall status -----------------------------------------------------
    // DB read/write + watcher are load-bearing; metrics is load-bearing too
    // (without it the dashboard goes silent). Everything else is informational.
    const subsystemStatuses: Record<string, 'ok' | 'degraded' | 'down'> = {
      db: dbReadable && dbWritable ? 'ok' : !dbReadable ? 'down' : 'degraded',
      watcher: watcherUnhealthy ? 'down' : watcherRunning ? 'ok' : 'degraded',
      metrics: metrics ? 'ok' : 'degraded',
      disk: diskState.diskFull ? 'down' : 'ok',
      claude_log_watcher: claudeHealth
        ? claudeHealth.permanentlyFailed
          ? 'down'
          : claudeHealth.running
            ? 'ok'
            : 'degraded'
        : 'ok',
      codex_log_watcher: codexHealth
        ? codexHealth.permanentlyFailed
          ? 'down'
          : codexHealth.running
            ? 'ok'
            : 'degraded'
        : 'ok',
      ollama: ollamaBreaker?.state === 'open' ? 'degraded' : 'ok'
    };
    const anyDown = Object.values(subsystemStatuses).some(s => s === 'down');
    const anyDegraded = Object.values(subsystemStatuses).some(s => s === 'degraded');
    const status = anyDown ? 'down' : anyDegraded ? 'degraded' : 'healthy';
    const httpCode = anyDown ? 503 : 200;

    res.status(httpCode).json({
      status,
      version: '0.5.0',
      session_id: deps.sessionId,
      uptime: process.uptime(),
      active_agents: deps.agentRegistry.size,
      modules: {
        watcher: watcherRunning,
        git: deps.gitMonitor.isRunning(),
        metrics
      },
      // Honest per-subsystem state. The frontend health chip should derive its
      // color from this `subsystems` map, not from the boolean `modules` block.
      subsystems: {
        db: {
          status: subsystemStatuses.db,
          readable: dbReadable,
          writable: dbWritable
        },
        watcher: {
          status: subsystemStatuses.watcher,
          running: watcherRunning,
          project_watcher_count: projectWatcherCount,
          permanently_failed: fwHealth?.permanentlyFailed ?? false,
          restart_attempts: fwHealth?.restartAttempts ?? 0,
          last_error: fwHealth?.lastError ?? null
        },
        metrics: { status: subsystemStatuses.metrics, running: metrics },
        disk: {
          status: subsystemStatuses.disk,
          disk_full: diskState.diskFull,
          detected_at: diskState.detectedAt,
          message: diskState.message
        },
        claude_log_watcher: {
          status: subsystemStatuses.claude_log_watcher,
          ...(claudeHealth ?? { running: true })
        },
        codex_log_watcher: {
          status: subsystemStatuses.codex_log_watcher,
          ...(codexHealth ?? { running: true })
        },
        ollama: {
          status: subsystemStatuses.ollama,
          ...(ollamaBreaker ?? { state: 'closed', failures: 0, retryInSec: 0 })
        },
        insights_queue: {
          generating: deps.insightsService?.isGenerating?.() ?? false
        }
      },
      project_watchers: {
        active: projectWatcherCount,
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
      database_health: {
        status: dbReadable && dbWritable ? 'healthy' : 'error',
        accessible: dbReadable,
        writable: dbWritable
      },
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
    // Only advertise LAN URLs when the server is actually reachable from the
    // LAN. The default bind is 127.0.0.1, where a LAN URL is a lie — Settings
    // used to show one anyway ("open this on your phone") and it never worked.
    const bindHost = process.env.RAVEN_BIND || '127.0.0.1';
    const isExposed = bindHost !== '127.0.0.1' && bindHost !== 'localhost';
    res.json({
      addresses,
      backend_port: deps.port,
      frontend_port: frontendPort,
      bind_host: bindHost,
      lan_url:
        isExposed && addresses.length > 0 ? `http://${addresses[0].address}:${frontendPort}` : null,
      backend_url:
        isExposed && addresses.length > 0 ? `http://${addresses[0].address}:${deps.port}` : null
    });
  });

  return router;
}
