/**
 * Subagents Repository — owns the `subagent_tree` table.
 *
 * Tracks Task-tool spawns: who launched whom, when, with which model.
 */

import type { RavenDB } from '../db.js';

interface SubagentSessionRollup {
  session_id: string;
  project_name: string | null;
  agent_count: number;
  first_spawn: string | null;
  last_spawn: string | null;
}

interface SubagentStats {
  total: number;
  by_type: Array<{ agent_type: string; count: number }>;
  by_model: Array<{ model: string; count: number }>;
}

export interface SubagentsRepository {
  /** All subagents for a session, ordered by spawn time ASC. */
  bySession(sessionId: string): unknown[];

  /** Most recent subagent rows across all sessions. */
  recent(limit: number): unknown[];

  /** Per-session rollup of subagent counts + first/last spawn. */
  sessionRollup(): SubagentSessionRollup[];

  /** Aggregate counts for the stats endpoint. */
  stats(): SubagentStats;
}

export function createSubagentsRepository(db: RavenDB): SubagentsRepository {
  const bySessionStmt = db.db.prepare(
    `SELECT * FROM subagent_tree WHERE session_id = ? ORDER BY started_at ASC`
  );

  const recentStmt = db.db.prepare(`SELECT * FROM subagent_tree ORDER BY started_at DESC LIMIT ?`);

  const sessionRollupStmt = db.db.prepare(
    `SELECT
       session_id,
       project_name,
       COUNT(*) as agent_count,
       MIN(started_at) as first_spawn,
       MAX(started_at) as last_spawn
     FROM subagent_tree
     GROUP BY session_id
     ORDER BY last_spawn DESC
     LIMIT 50`
  );

  const totalStmt = db.db.prepare(`SELECT COUNT(*) as count FROM subagent_tree`);
  const byTypeStmt = db.db.prepare(
    `SELECT agent_type, COUNT(*) as count FROM subagent_tree GROUP BY agent_type ORDER BY count DESC`
  );
  const byModelStmt = db.db.prepare(
    `SELECT model, COUNT(*) as count FROM subagent_tree WHERE model IS NOT NULL GROUP BY model ORDER BY count DESC`
  );

  return {
    bySession(sessionId) {
      return bySessionStmt.all(sessionId);
    },

    recent(limit) {
      return recentStmt.all(limit);
    },

    sessionRollup() {
      return sessionRollupStmt.all() as SubagentSessionRollup[];
    },

    stats() {
      const total = (totalStmt.get() as { count: number } | undefined)?.count ?? 0;
      return {
        total,
        by_type: byTypeStmt.all() as Array<{ agent_type: string; count: number }>,
        by_model: byModelStmt.all() as Array<{ model: string; count: number }>
      };
    }
  };
}
