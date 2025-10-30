/**
 * API Routes - REST endpoints for Raven
 *
 * All GET endpoints for querying data:
 * - Health check
 * - Dashboard stats
 * - File events
 * - Agent events
 * - System metrics
 * - Git status
 * - Triggers
 */

import { Router, Request, Response } from 'express';
import type { RavenDB } from '../db.js';
import type { GitMonitor } from '../modules/git.js';
import type { TriggerEngine } from '../trigger-engine.js';

export interface ApiDependencies {
  db: RavenDB;
  gitMonitor: GitMonitor;
  triggerEngine: TriggerEngine;
  sessionId: string;
  agentRegistry: Map<string, any>;
  dbPath: string;
  isWatcherRunning: () => boolean;
  isGitRunning: () => boolean;
  isMetricsRunning: () => boolean;
}

export function createApiRouter(deps: ApiDependencies): Router {
  const router = Router();
  const { db, gitMonitor, triggerEngine, sessionId, agentRegistry, dbPath } = deps;

  // ==================== Health & Status ====================

  router.get('/health', (req: Request, res: Response) => {
    res.json({
      status: 'healthy',
      session_id: sessionId,
      uptime: process.uptime(),
      active_agents: agentRegistry.size,
      modules: {
        watcher: deps.isWatcherRunning(),
        git: deps.isGitRunning(),
        metrics: deps.isMetricsRunning()
      },
      database: dbPath
    });
  });

  router.get('/api/session-id', (req: Request, res: Response) => {
    res.json({ session_id: sessionId });
  });

  // ==================== Dashboard ====================

  router.get('/api/dashboard-stats', (req: Request, res: Response) => {
    try {
      const stats = db.getDashboardStats(sessionId);
      stats.total_agents = agentRegistry.size;
      res.json(stats);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  router.get('/api/top-modified-files', (req: Request, res: Response) => {
    try {
      const limit = parseInt(req.query.limit as string) || 10;
      const files = db.getTopModifiedFiles(sessionId, limit);
      res.json(files);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  router.get('/api/longest-edits', (req: Request, res: Response) => {
    try {
      const limit = parseInt(req.query.limit as string) || 10;
      const edits = db.getLongestEdits(limit);
      res.json(edits);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ==================== Agents ====================

  router.get('/api/agents-status', (req: Request, res: Response) => {
    try {
      const now = new Date();
      const agents = Array.from(agentRegistry.values()).map(agent => {
        const lastSeen = new Date(agent.last_seen);
        const secondsSinceLastSeen = (now.getTime() - lastSeen.getTime()) / 1000;
        return {
          ...agent,
          is_running: secondsSinceLastSeen < 30
        };
      });
      res.json(agents);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  router.get('/api/agent-events', (req: Request, res: Response) => {
    try {
      const limit = parseInt(req.query.limit as string) || 100;
      const events = db.getRecentAgentEvents(limit);
      res.json(events);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  router.get('/api/events-by-agent/:agent', (req: Request, res: Response) => {
    try {
      const { agent } = req.params;
      const limit = parseInt(req.query.limit as string) || 100;
      const events = db.getEventsByAgent(agent, limit);
      res.json(events);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  router.get('/api/agent-stats', (req: Request, res: Response) => {
    try {
      const stats = db.getAgentStats();
      res.json(stats);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ==================== File Events ====================

  router.get('/api/file-events', (req: Request, res: Response) => {
    try {
      const limit = parseInt(req.query.limit as string) || 100;
      const includeDiff = req.query.diff === 'true';
      const events = db.getRecentFileEvents(limit, includeDiff);
      res.json(events);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  router.get('/api/tracked-files', (req: Request, res: Response) => {
    try {
      const files = db.getTrackedFiles();
      res.json(files);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  router.get('/api/events-by-session/:sessionId', (req: Request, res: Response) => {
    try {
      const { sessionId: sid } = req.params;
      const events = db.getAgentEventsBySession(sid);
      res.json(events);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ==================== System Metrics ====================

  router.get('/api/system-metrics', (req: Request, res: Response) => {
    try {
      const limit = parseInt(req.query.limit as string) || 100;
      const metrics = db.getRecentSystemMetrics(limit);
      res.json(metrics);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  router.get('/api/process-metrics/:agent', (req: Request, res: Response) => {
    try {
      const { agent } = req.params;
      const limit = parseInt(req.query.limit as string) || 100;
      const metrics = db.getProcessMetricsByAgent(agent, limit);
      res.json(metrics);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  router.get('/api/metrics-stats', (req: Request, res: Response) => {
    try {
      const now = Date.now();
      const dayAgo = now - 24 * 60 * 60 * 1000;
      const start_time = req.query.start_time as string || new Date(dayAgo).toISOString();
      const end_time = req.query.end_time as string || new Date(now).toISOString();
      const stats = db.getMetricsStats(start_time, end_time);
      res.json(stats);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  router.get('/api/performance-correlations', (req: Request, res: Response) => {
    try {
      const time_window_seconds = parseInt(req.query.time_window_seconds as string) || 5;
      const correlations = db.correlateEventsWithMetrics(time_window_seconds);
      res.json(correlations);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ==================== Git ====================

  router.get('/api/git/status', async (req: Request, res: Response) => {
    try {
      const status = await gitMonitor.checkStatus();
      res.json(status || gitMonitor.getLastStatus());
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  router.get('/api/git/diff', async (req: Request, res: Response) => {
    try {
      const diff = await gitMonitor.getUncommittedDiff();
      res.json({ diff });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  router.get('/api/git/branches', async (req: Request, res: Response) => {
    try {
      const branches = await gitMonitor.getBranches();
      res.json({ branches });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  router.get('/api/git/history', async (req: Request, res: Response) => {
    try {
      const limit = parseInt(req.query.limit as string) || 10;
      const commits = await gitMonitor.getCommitHistory(limit);
      res.json({ commits });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ==================== Triggers ====================

  router.get('/api/triggers-config', (req: Request, res: Response) => {
    try {
      const triggers = triggerEngine.getTriggersConfig();
      res.json({ rules: triggers });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  router.get('/api/triggered-events', (req: Request, res: Response) => {
    try {
      const limit = parseInt(req.query.limit as string) || 100;
      const events = triggerEngine.getTriggeredEvents(limit);
      res.json(events);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  router.get('/api/trigger-stats', (req: Request, res: Response) => {
    try {
      const stats = triggerEngine.getTriggerStats();
      res.json(stats);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  router.post('/api/triggers-reload', (req: Request, res: Response) => {
    try {
      const message = triggerEngine.reloadConfig();
      res.json({ message });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  router.post('/api/triggers-clear-cooldowns', (req: Request, res: Response) => {
    try {
      const message = triggerEngine.clearCooldowns();
      res.json({ message });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}
