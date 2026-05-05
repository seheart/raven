/**
 * Daily digest route — `GET /api/digest/today`
 *
 * Returns a structured snapshot of today's AI activity across the fleet,
 * shaped for narrative rendering. The frontend composes sentences from
 * this; the backend just answers "what happened today?" with structured
 * counts + flagged moments.
 *
 * v1 keeps the synthesis dumb on purpose — counts, top projects, simple
 * heuristics for "worth a glance." A future version can layer LLM
 * narrative on top by passing this same shape into a local model and
 * caching the result.
 */

import express, { type Request, type Response, type Router } from 'express';
import type { RavenDB } from '../db.js';
import type { ProjectsConfigService, KnownProject } from '../services/projects-config.js';

interface DigestProject {
  name: string;
  displayName?: string;
  mission?: string;
  total_events: number;
  edits: number;
  adds: number;
  deletes: number;
  agents: string[];
  last_activity: string | null;
  cost_usd: number;
}

interface DigestFlag {
  kind: 'large_deletion' | 'agent_error' | 'pattern_warning';
  project_name: string;
  display_name: string;
  details: string;
  severity: 'info' | 'warning';
  timestamp: string;
}

interface DigestResponse {
  date: string;
  generated_at: string;
  totals: {
    file_events: number;
    edits: number;
    adds: number;
    deletes: number;
    agent_events: number;
    projects_touched: number;
    cost_usd: number;
  };
  projects: DigestProject[];
  flagged: DigestFlag[];
  /** True when the day has zero activity — UI uses this to render "quiet day" copy. */
  empty: boolean;
}

interface DigestDeps {
  db: RavenDB;
  projectsConfigService: ProjectsConfigService;
}

interface FileEventRow {
  project_name: string | null;
  change_type: string | null;
  timestamp: string;
  diff: string | null;
}

interface AgentEventRow {
  project_name: string | null;
  agent: string;
  event_type: string;
  timestamp: string;
  message: string | null;
  file: string | null;
}

interface TokenUsageRow {
  project_name: string | null;
  estimated_cost_usd: number | null;
}

/**
 * Today in local time → ISO start. We use the server's local midnight as
 * the boundary, which matches the cost ticker's heuristic and what a
 * human means by "today" without timezone arguments.
 */
function todayStartIso(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

export function createDigestRouter(deps: DigestDeps): Router {
  const { db, projectsConfigService } = deps;
  const router = express.Router();

  router.get('/today', (_req: Request, res: Response) => {
    try {
      const startIso = todayStartIso();
      const known = projectsConfigService.getKnownProjects();
      const knownByName = new Map<string, KnownProject>(known.map(p => [p.name, p]));

      const fileEvents = db.db
        .prepare<[string], FileEventRow>(
          `SELECT project_name, change_type, timestamp, diff
           FROM events
           WHERE timestamp >= ?`
        )
        .all(startIso);

      const agentEvents = db.db
        .prepare<[string], AgentEventRow>(
          `SELECT project_name, agent, event_type, timestamp, message, file
           FROM agent_events
           WHERE timestamp >= ?`
        )
        .all(startIso);

      const tokenUsage = db.db
        .prepare<[string], TokenUsageRow>(
          `SELECT project_name, estimated_cost_usd FROM token_usage WHERE timestamp >= ?`
        )
        .all(startIso);

      // Aggregate per-project. Use a Map so we can lazily create entries
      // as we encounter project names from any of the three event streams.
      const byProject = new Map<string, DigestProject>();
      const ensure = (name: string | null): DigestProject => {
        const key = name || '(unattributed)';
        if (!byProject.has(key)) {
          const meta = knownByName.get(key);
          byProject.set(key, {
            name: key,
            displayName: meta?.displayName,
            mission: meta?.mission,
            total_events: 0,
            edits: 0,
            adds: 0,
            deletes: 0,
            agents: [],
            last_activity: null,
            cost_usd: 0
          });
        }
        return byProject.get(key)!;
      };

      let totalEdits = 0;
      let totalAdds = 0;
      let totalDeletes = 0;
      let totalCost = 0;

      for (const ev of fileEvents) {
        const p = ensure(ev.project_name);
        p.total_events++;
        if (ev.change_type === 'add') {
          p.adds++;
          totalAdds++;
        } else if (ev.change_type === 'unlink' || ev.change_type === 'delete') {
          p.deletes++;
          totalDeletes++;
        } else {
          p.edits++;
          totalEdits++;
        }
        if (!p.last_activity || ev.timestamp > p.last_activity) {
          p.last_activity = ev.timestamp;
        }
      }

      for (const ev of agentEvents) {
        const p = ensure(ev.project_name);
        if (!p.agents.includes(ev.agent)) p.agents.push(ev.agent);
        if (!p.last_activity || ev.timestamp > p.last_activity) {
          p.last_activity = ev.timestamp;
        }
      }

      for (const tu of tokenUsage) {
        const p = ensure(tu.project_name);
        const cost = tu.estimated_cost_usd ?? 0;
        p.cost_usd += cost;
        totalCost += cost;
      }

      // Order projects by recency of last activity. "Most active project"
      // is more interesting in the digest than "alphabetical."
      const projects = Array.from(byProject.values()).sort((a, b) => {
        if (a.last_activity && b.last_activity) {
          return a.last_activity > b.last_activity ? -1 : 1;
        }
        if (a.last_activity) return -1;
        if (b.last_activity) return 1;
        return 0;
      });

      // Flagged moments — v1 heuristic: any single file_event with a diff
      // whose newline count exceeds LARGE_DELETE_THRESHOLD and whose
      // change_type isn't an add. Cheap, no schema changes.
      const flagged: DigestFlag[] = [];
      const LARGE_DELETE_THRESHOLD = 60;
      for (const ev of fileEvents) {
        if (!ev.diff || ev.change_type === 'add') continue;
        const removedLines = (ev.diff.match(/^-/gm) || []).length;
        if (removedLines >= LARGE_DELETE_THRESHOLD) {
          const meta = knownByName.get(ev.project_name || '');
          flagged.push({
            kind: 'large_deletion',
            project_name: ev.project_name || '(unattributed)',
            display_name: meta?.displayName || ev.project_name || '(unattributed)',
            details: `Large deletion (~${removedLines} lines removed)`,
            severity: 'info',
            timestamp: ev.timestamp
          });
        }
      }

      // Cap the flagged list — no one wants 200 of these. Keep the
      // most recent ten; users who want the full picture have the
      // dedicated pages already.
      flagged.sort((a, b) => (a.timestamp > b.timestamp ? -1 : 1));
      const trimmedFlags = flagged.slice(0, 10);

      const response: DigestResponse = {
        date: startIso.slice(0, 10),
        generated_at: new Date().toISOString(),
        totals: {
          file_events: fileEvents.length,
          edits: totalEdits,
          adds: totalAdds,
          deletes: totalDeletes,
          agent_events: agentEvents.length,
          projects_touched: byProject.size,
          cost_usd: totalCost
        },
        projects,
        flagged: trimmedFlags,
        empty: fileEvents.length === 0 && agentEvents.length === 0
      };

      res.json(response);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: 'digest failed', message: msg });
    }
  });

  return router;
}
