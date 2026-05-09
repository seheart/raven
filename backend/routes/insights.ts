/**
 * Insights Routes — LLM-powered activity analysis
 */

import express, { Request, Response, Router } from 'express';
import { asyncHandler } from '../middleware/async-handler.js';
import type { InsightsService } from '../services/insights-service.js';
import type { RavenDB } from '../db.js';
import type { DiffRiskRepository } from '../repositories/diff-risk-repository.js';

export function createInsightsRouter(
  insightsService: InsightsService,
  db: RavenDB,
  diffRiskRepo: DiffRiskRepository
): Router {
  const router = express.Router();

  // 503 generate/* routes when the kill switch is set, instead of silently
  // returning null bodies (the previous behavior was confusing — looked
  // like "no activity to summarize" when it was actually disabled).
  // The disabled flag is read at construction, so toggling it requires a
  // restart — message reflects that to avoid users setting the env var
  // on a running process and wondering why nothing changed.
  const requireEnabled = (_req: Request, res: Response, next: () => void): void => {
    if (insightsService.isDisabled()) {
      res.status(503).json({
        error: 'Insights disabled',
        message:
          "Raven's local-LLM insights are disabled. Restart with RAVEN_INSIGHTS_DISABLED=0 (or unset) to re-enable."
      });
      return;
    }
    next();
  };

  // GET /api/insights — List recent insights
  router.get(
    '/',
    asyncHandler(async (req: Request, res: Response) => {
      const type = req.query.type as string | undefined;
      const limit = Math.min(parseInt(req.query.limit as string, 10) || 20, 100);
      const insights = insightsService.getInsights(type, limit);
      res.json(insights);
    })
  );

  // GET /api/insights/latest
  router.get(
    '/latest',
    asyncHandler(async (req: Request, res: Response) => {
      const type = (req.query.type as string) || 'session_summary';
      const insight = insightsService.getLatest(type);
      res.json(insight || {});
    })
  );

  // GET /api/insights/status
  router.get(
    '/status',
    asyncHandler(async (req: Request, res: Response) => {
      const available = await insightsService.isAvailable();
      const models = available ? await insightsService.getModels() : [];
      res.json({
        available,
        generating: insightsService.isGenerating(),
        models
      });
    })
  );

  // GET /api/insights/preview — real-data previews so each story card on
  // /insights can show what's actually in your activity ("47 events from
  // Claude in the last hour · 3 projects touched") instead of just the
  // category description. The previous cards were abstract menu items;
  // these numbers turn them into invitations.
  router.get(
    '/preview',
    asyncHandler(async (_req: Request, res: Response) => {
      const sql = db.db;
      // 60-minute window for the "Recent activity" preview.
      const oneHourAgo = new Date(Date.now() - 60 * 60_000).toISOString();
      // Today = since local midnight. SQLite's `date('now', 'localtime')`
      // collapses to the start of today in the server's local TZ — same
      // convention the dashboard already uses.
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const todayStartIso = todayStart.toISOString();

      const recentEvents =
        (
          sql.prepare('SELECT COUNT(*) as n FROM events WHERE timestamp > ?').get(oneHourAgo) as
            | { n: number }
            | undefined
        )?.n ?? 0;
      const recentAgentEvents =
        (
          sql
            .prepare('SELECT COUNT(*) as n FROM agent_events WHERE timestamp > ?')
            .get(oneHourAgo) as { n: number } | undefined
        )?.n ?? 0;
      const recentProjects =
        (
          sql
            .prepare(
              `SELECT COUNT(DISTINCT project_name) as n FROM events
              WHERE timestamp > ? AND project_name IS NOT NULL AND project_name != ''`
            )
            .get(oneHourAgo) as { n: number } | undefined
        )?.n ?? 0;

      const todayEvents =
        (
          sql.prepare('SELECT COUNT(*) as n FROM events WHERE timestamp > ?').get(todayStartIso) as
            | { n: number }
            | undefined
        )?.n ?? 0;
      const todayAgentEvents =
        (
          sql
            .prepare('SELECT COUNT(*) as n FROM agent_events WHERE timestamp > ?')
            .get(todayStartIso) as { n: number } | undefined
        )?.n ?? 0;
      const todayFiles =
        (
          sql
            .prepare(
              'SELECT COUNT(DISTINCT filepath) as n FROM events WHERE timestamp > ? AND filepath IS NOT NULL'
            )
            .get(todayStartIso) as { n: number } | undefined
        )?.n ?? 0;
      const todayProjects =
        (
          sql
            .prepare(
              `SELECT COUNT(DISTINCT project_name) as n FROM events
              WHERE timestamp > ? AND project_name IS NOT NULL AND project_name != ''`
            )
            .get(todayStartIso) as { n: number } | undefined
        )?.n ?? 0;

      // Code review preview: count of agent_events with a `file` field in
      // the last 24h. That's roughly "shipped code" — there's no diff
      // size in the stored event so the count is the honest preview.
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60_000).toISOString();
      const reviewableChanges =
        (
          sql
            .prepare(
              `SELECT COUNT(*) as n FROM agent_events
              WHERE timestamp > ? AND file IS NOT NULL AND file != ''`
            )
            .get(oneDayAgo) as { n: number } | undefined
        )?.n ?? 0;

      // Agent comparison preview: distinct agents in the last 24h, top by event count.
      const agentRows = sql
        .prepare(
          `SELECT agent, COUNT(*) as events FROM agent_events
            WHERE timestamp > ? AND agent IS NOT NULL AND agent != ''
            GROUP BY agent ORDER BY events DESC LIMIT 4`
        )
        .all(oneDayAgo) as Array<{ agent: string; events: number }>;

      // Right-now block: drives the personal hero panel on the
      // /insights overview. Lightweight queries — last event, top
      // project + agent over the last 7 days, current streak.
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60_000).toISOString();
      const lastEvent = sql
        .prepare(
          `SELECT timestamp, project_name, filepath, agent_source
             FROM events
            WHERE project_name IS NOT NULL AND project_name != ''
            ORDER BY timestamp DESC LIMIT 1`
        )
        .get() as
        | {
            timestamp: string;
            project_name: string;
            filepath: string | null;
            agent_source: string | null;
          }
        | undefined;
      const top7Project = sql
        .prepare(
          `SELECT project_name AS name, COUNT(*) AS events
             FROM events
            WHERE timestamp > ? AND project_name IS NOT NULL AND project_name != ''
            GROUP BY project_name ORDER BY events DESC LIMIT 1`
        )
        .get(sevenDaysAgo) as { name: string; events: number } | undefined;
      const top7Agent = sql
        .prepare(
          `SELECT agent AS name, COUNT(*) AS events
             FROM agent_events
            WHERE timestamp > ? AND agent IS NOT NULL AND agent != ''
            GROUP BY agent ORDER BY events DESC LIMIT 1`
        )
        .get(sevenDaysAgo) as { name: string; events: number } | undefined;

      // Current streak: walk distinct localtime days backwards from today.
      // The streak is unbroken as long as each prior day also has events.
      const recentDays = sql
        .prepare(
          `SELECT DISTINCT date(timestamp, 'localtime') AS d
             FROM events
            WHERE timestamp > date('now', '-60 days')
            ORDER BY d DESC`
        )
        .all() as Array<{ d: string }>;
      const today = new Date();
      const todayLocal = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
      let currentStreak = 0;
      let cursor = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      const haveDay = new Set(recentDays.map(r => r.d));
      // Streak counts back from today (or yesterday if today has nothing yet).
      if (!haveDay.has(todayLocal)) cursor.setDate(cursor.getDate() - 1);
      while (true) {
        const k = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(cursor.getDate()).padStart(2, '0')}`;
        if (!haveDay.has(k)) break;
        currentStreak++;
        cursor.setDate(cursor.getDate() - 1);
      }

      // Top model over the last 7 days (by output tokens).
      const top7Model = sql
        .prepare(
          `SELECT model AS name, COALESCE(SUM(output_tokens), 0) AS out_tok
             FROM token_usage
            WHERE timestamp > ? AND model IS NOT NULL AND model != ''
            GROUP BY model ORDER BY out_tok DESC LIMIT 1`
        )
        .get(sevenDaysAgo) as { name: string; out_tok: number } | undefined;

      res.json({
        generated_at: new Date().toISOString(),
        right_now: {
          last_event: lastEvent
            ? {
                timestamp: lastEvent.timestamp,
                project: lastEvent.project_name,
                file: lastEvent.filepath,
                agent: lastEvent.agent_source
              }
            : null,
          current_streak_days: currentStreak,
          top_project_7d: top7Project
            ? { name: top7Project.name, events: top7Project.events }
            : null,
          top_agent_7d: top7Agent ? { name: top7Agent.name, events: top7Agent.events } : null,
          top_model_7d: top7Model
            ? { name: top7Model.name, output_tokens: top7Model.out_tok }
            : null
        },
        recent_activity: {
          window_minutes: 60,
          events: recentEvents,
          agent_events: recentAgentEvents,
          projects: recentProjects
        },
        today_digest: {
          events: todayEvents,
          agent_events: todayAgentEvents,
          files: todayFiles,
          projects: todayProjects
        },
        code_review: {
          window_hours: 24,
          changes: reviewableChanges
        },
        agent_comparison: {
          window_hours: 24,
          agents: agentRows
        }
      });
    })
  );

  // POST /api/insights/generate/summary
  router.post(
    '/generate/summary',
    requireEnabled,
    asyncHandler(async (req: Request, res: Response) => {
      const windowMinutes = Math.min(parseInt(req.body?.windowMinutes, 10) || 60, 1440);
      const insight = await insightsService.generateSummary(windowMinutes);
      if (!insight) {
        res.status(202).json({ message: 'No activity to summarize or generation in progress' });
        return;
      }
      res.json(insight);
    })
  );

  // POST /api/insights/generate/review
  router.post(
    '/generate/review',
    requireEnabled,
    asyncHandler(async (req: Request, res: Response) => {
      const insight = await insightsService.generateCodeReview();
      if (!insight) {
        res.status(202).json({ message: 'No recent diffs to review or generation in progress' });
        return;
      }
      res.json(insight);
    })
  );

  // POST /api/insights/generate/digest — Generate daily digest
  router.post(
    '/generate/digest',
    requireEnabled,
    asyncHandler(async (req: Request, res: Response) => {
      const insight = await insightsService.generateDailyDigest();
      if (!insight) {
        res.status(202).json({ message: 'No activity to digest or generation in progress' });
        return;
      }
      res.json(insight);
    })
  );

  // POST /api/insights/generate/agent-comparison
  router.post(
    '/generate/agent-comparison',
    requireEnabled,
    asyncHandler(async (req: Request, res: Response) => {
      const insight = await insightsService.generateAgentComparison();
      if (!insight) {
        res.status(202).json({ message: 'No agent data or generation in progress' });
        return;
      }
      res.json(insight);
    })
  );

  // POST /api/insights/generate/project-health
  router.post(
    '/generate/project-health',
    requireEnabled,
    asyncHandler(async (req: Request, res: Response) => {
      const { projectName } = req.body;
      if (!projectName) {
        res.status(400).json({ error: 'projectName is required' });
        return;
      }
      const insight = await insightsService.generateProjectHealth(projectName);
      if (!insight) {
        res.status(202).json({ message: 'No project data or generation in progress' });
        return;
      }
      res.json(insight);
    })
  );

  // GET /api/insights/diff-risk-scores
  router.get(
    '/diff-risk-scores',
    asyncHandler(async (req: Request, res: Response) => {
      const limit = Math.min(parseInt(req.query.limit as string, 10) || 20, 50);
      const scores = diffRiskRepo.recent(limit);
      res.json(scores);
    })
  );

  // PUT /api/insights/model
  router.put(
    '/model',
    asyncHandler(async (req: Request, res: Response) => {
      const { model } = req.body;
      if (!model) {
        res.status(400).json({ error: 'model is required' });
        return;
      }
      const available = await insightsService.getModels();
      if (!available.includes(model)) {
        res.status(400).json({ error: 'model not found in Ollama', available });
        return;
      }
      insightsService.setModel(model);
      res.json({ model });
    })
  );

  return router;
}
