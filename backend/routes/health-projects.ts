/**
 * Multi-project health route — `/api/health/projects`
 *
 * Enumerates real projects from `project_stats` (trigger-maintained, survives
 * retention) and returns per-project recent activity, error counts, and a
 * derived health score. Honors ?project=<name> for a single-project view and
 * ?days=<n> to size the "recent" window.
 *
 * Earlier this handler hardcoded a single row named after PROJECT_NAME — every
 * tile on the page was a Potemkin village (one project always, days param
 * silently ignored). Fixed here.
 */

import express, { Request, Response, Router } from 'express';
import { logger } from '../utils/logger.js';
import { cacheMiddleware } from '../services/cache-service.js';
import type { DashboardRepository } from '../repositories/dashboard-repository.js';

interface HealthProjectsDeps {
  dashboardRepo: DashboardRepository;
}

export function createHealthProjectsRouter({ dashboardRepo }: HealthProjectsDeps): Router {
  const router = express.Router();

  router.get('/projects', cacheMiddleware(5000), (req: Request, res: Response) => {
    try {
      const projectFilter = (req.query.project as string) || 'all';
      const daysRaw = parseInt(String(req.query.days ?? '7'), 10);
      const days = Number.isFinite(daysRaw) && daysRaw > 0 && daysRaw <= 365 ? daysRaw : 7;
      const cutoff = new Date(Date.now() - days * 24 * 3600 * 1000).toISOString();

      let rows = dashboardRepo.listProjectStats();
      if (projectFilter && projectFilter !== 'all') {
        rows = rows.filter(r => r.project_name === projectFilter);
      }

      // Single-pass fetch for all four metrics, keyed by project_name.
      // Replaces a 4-query .get() loop per project (was 4×N round-trips,
      // now 4 round-trips regardless of project count).
      const toMap = (
        results: Array<{ project_name: string | null; count: number }>
      ): Map<string, number> => {
        const m = new Map<string, number>();
        for (const r of results) {
          if (r.project_name) m.set(r.project_name, r.count);
        }
        return m;
      };
      const recentFilesByProject = toMap(dashboardRepo.recentEventsByProject(cutoff));
      const recentAgentByProject = toMap(dashboardRepo.recentAgentEventsByProject(cutoff));
      const recentErrorsByProject = toMap(dashboardRepo.recentErrorsByProject(cutoff));
      const totalErrorsByProject = toMap(dashboardRepo.totalErrorsByProject());

      const projects = rows.map(row => {
        const recentFiles = recentFilesByProject.get(row.project_name) ?? 0;
        const recentAgent = recentAgentByProject.get(row.project_name) ?? 0;
        const recent = recentFiles + recentAgent;

        const errorCount = totalErrorsByProject.get(row.project_name) ?? 0;
        const recentErrors = recentErrorsByProject.get(row.project_name) ?? 0;

        // Activity proxy: cap at 100 so a chatty project doesn't dominate;
        // subtract a per-error penalty up to 50 so syntax-error backlog drags
        // the score down. Not a code-quality measure — it's an "is this
        // project busy AND not crashing" signal.
        const activityScore = Math.min(recent, 100);
        const errorPenalty = Math.min(recentErrors * 5, 50);
        const healthScore = Math.max(activityScore - errorPenalty, 0);

        const lastTs = row.last_agent_seen_at || row.last_seen_at;
        let status: 'active' | 'recent' | 'idle' | 'inactive' = 'inactive';
        if (lastTs) {
          const hours = (Date.now() - new Date(lastTs).getTime()) / 3_600_000;
          if (hours < 1) status = 'active';
          else if (hours < 24) status = 'recent';
          else if (hours < 168) status = 'idle';
        }

        return {
          name: row.project_name,
          project_name: row.project_name,
          status,
          health_score: healthScore,
          recent_events: recent,
          recent_file_events: recentFiles,
          recent_agent_events: recentAgent,
          total_events: row.total_events + row.total_agent_events,
          error_count: errorCount,
          recent_error_count: recentErrors,
          first_seen: row.first_seen_at,
          last_activity: lastTs
        };
      });

      return res.json({
        projects,
        total_projects: projects.length,
        active_projects: projects.filter(p => p.status === 'active').length,
        recent_projects: projects.filter(p => p.status === 'recent').length,
        days,
        // Lifetime sum across the projects in the response. With ?project=
        // applied this narrows to the single project; otherwise it's the
        // grand total of all known projects.
        total_events: projects.reduce((sum, p) => sum + p.total_events, 0),
        recent_window_events: projects.reduce((sum, p) => sum + p.recent_events, 0)
      });
    } catch (error) {
      logger.error('❌ Multi-project health error:', error as Error);
      const message = error instanceof Error ? error.message : String(error);
      return res.status(500).json({ error: message });
    }
  });

  return router;
}
