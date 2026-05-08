/**
 * Token Usage Repository — owns the `token_usage` table.
 *
 * Per-inference token accounting (input/output/cache) for cost reporting
 * and the context-window vessel on Today.
 */

import type { RavenDB } from '../db.js';

interface SessionContextRow {
  session_id: string;
  model: string;
  project_name: string | null;
  last_seen: string;
  input_tokens: number;
  cache_read_tokens: number;
}

interface CostFilter {
  start?: string;
  end?: string;
  project?: string;
}

interface CostSummary {
  total_requests: number;
  total_input_tokens: number;
  total_output_tokens: number;
  total_cache_creation_tokens: number;
  total_cache_read_tokens: number;
  total_cost_usd: number;
}

export interface TokenUsageRepository {
  /**
   * For each session active since `sinceIso`, return the most recent row.
   * Used to approximate "current context size" — the latest turn's
   * input_tokens + cache_read_tokens reflects the full conversation up to
   * that turn for Anthropic-shaped requests.
   */
  recentSessionContexts(sinceIso: string, limit: number): SessionContextRow[];

  /** Aggregate totals for the given window/project filter. */
  costSummary(filter: CostFilter): CostSummary;

  /** Cost rollup grouped by project_name, ordered by cost DESC. */
  costByProject(filter: Pick<CostFilter, 'start' | 'end'>): unknown[];

  /** Cost rollup grouped by model, ordered by cost DESC. */
  costByModel(filter: Pick<CostFilter, 'start' | 'end'>): Array<{
    model: string;
    requests: number;
    input_tokens: number;
    output_tokens: number;
    cost_usd: number;
  }>;

  /** Per-session cost rollup. Limit is positional and applied after GROUP BY. */
  costBySession(filter: CostFilter, limit: number): unknown[];

  /**
   * Time-bucketed cost timeline. `bucket` is one of {'hour', 'day', 'week'};
   * the SQL strftime format is selected from a closed allowlist.
   */
  costTimeline(filter: CostFilter, bucket: 'hour' | 'day' | 'week'): unknown[];

  /**
   * Per-(agent_id) token totals for a given session — used to enrich the
   * sub-agent tree with usage stats. Skips rows with NULL agent_id.
   */
  tokensByAgentForSession(sessionId: string): Array<{
    agent_id: string;
    input_tokens: number;
    output_tokens: number;
    cost_usd: number;
  }>;
}

const BUCKET_FORMATS: Record<string, string> = {
  hour: '%Y-%m-%dT%H',
  day: '%Y-%m-%d',
  week: '%Y-%W'
};

export function createTokenUsageRepository(db: RavenDB): TokenUsageRepository {
  const recentSessionContextsStmt = db.db.prepare(`
    SELECT
      tu.session_id        AS session_id,
      tu.model             AS model,
      tu.project_name      AS project_name,
      tu.timestamp         AS last_seen,
      tu.input_tokens      AS input_tokens,
      tu.cache_read_tokens AS cache_read_tokens
    FROM token_usage tu
    INNER JOIN (
      SELECT session_id, MAX(timestamp) AS max_ts
      FROM token_usage
      WHERE timestamp >= ?
      GROUP BY session_id
    ) latest
      ON tu.session_id = latest.session_id
     AND tu.timestamp = latest.max_ts
    WHERE tu.session_id IS NOT NULL AND tu.session_id != ''
    ORDER BY tu.timestamp DESC
    LIMIT ?
  `);

  // Build a WHERE clause from a filter; returns the suffix string + ordered
  // parameter array. All values are bound, so the WHERE clause itself is
  // safe to interpolate into the prepared query.
  const buildWhere = (filter: CostFilter): { sql: string; params: unknown[] } => {
    const parts: string[] = [];
    const params: unknown[] = [];
    if (filter.start) {
      parts.push('timestamp >= ?');
      params.push(filter.start);
    }
    if (filter.end) {
      parts.push('timestamp <= ?');
      params.push(filter.end);
    }
    if (filter.project) {
      parts.push('project_name = ?');
      params.push(filter.project);
    }
    return {
      sql: parts.length > 0 ? ' WHERE ' + parts.join(' AND ') : '',
      params
    };
  };

  return {
    recentSessionContexts(sinceIso, limit) {
      return recentSessionContextsStmt.all(sinceIso, limit) as SessionContextRow[];
    },

    costSummary(filter) {
      const { sql, params } = buildWhere(filter);
      const row = db.db
        .prepare(
          `SELECT
             COUNT(*) as total_requests,
             COALESCE(SUM(input_tokens), 0) as total_input_tokens,
             COALESCE(SUM(output_tokens), 0) as total_output_tokens,
             COALESCE(SUM(cache_creation_tokens), 0) as total_cache_creation_tokens,
             COALESCE(SUM(cache_read_tokens), 0) as total_cache_read_tokens,
             COALESCE(SUM(estimated_cost_usd), 0) as total_cost_usd
           FROM token_usage${sql}`
        )
        .get(...params) as CostSummary | undefined;
      return (
        row ?? {
          total_requests: 0,
          total_input_tokens: 0,
          total_output_tokens: 0,
          total_cache_creation_tokens: 0,
          total_cache_read_tokens: 0,
          total_cost_usd: 0
        }
      );
    },

    costByProject(filter) {
      const { sql, params } = buildWhere(filter);
      return db.db
        .prepare(
          `SELECT
             project_name,
             COUNT(*) as requests,
             COALESCE(SUM(input_tokens), 0) as input_tokens,
             COALESCE(SUM(output_tokens), 0) as output_tokens,
             COALESCE(SUM(cache_read_tokens), 0) as cache_read_tokens,
             COALESCE(SUM(estimated_cost_usd), 0) as cost_usd
           FROM token_usage${sql}
           GROUP BY project_name
           ORDER BY cost_usd DESC`
        )
        .all(...params);
    },

    costByModel(filter) {
      const { sql, params } = buildWhere(filter);
      return db.db
        .prepare(
          `SELECT
             model,
             COUNT(*) as requests,
             COALESCE(SUM(input_tokens), 0) as input_tokens,
             COALESCE(SUM(output_tokens), 0) as output_tokens,
             COALESCE(SUM(estimated_cost_usd), 0) as cost_usd
           FROM token_usage${sql}
           GROUP BY model
           ORDER BY cost_usd DESC`
        )
        .all(...params) as Array<{
        model: string;
        requests: number;
        input_tokens: number;
        output_tokens: number;
        cost_usd: number;
      }>;
    },

    costBySession(filter, limit) {
      const { sql, params } = buildWhere(filter);
      return db.db
        .prepare(
          `SELECT
             session_id,
             project_name,
             MIN(timestamp) as first_seen,
             MAX(timestamp) as last_seen,
             COUNT(*) as requests,
             COALESCE(SUM(input_tokens), 0) as input_tokens,
             COALESCE(SUM(output_tokens), 0) as output_tokens,
             COALESCE(SUM(estimated_cost_usd), 0) as cost_usd
           FROM token_usage${sql}
           GROUP BY session_id
           ORDER BY last_seen DESC
           LIMIT ?`
        )
        .all(...params, limit);
    },

    tokensByAgentForSession(sessionId) {
      return db.db
        .prepare(
          `SELECT agent_id,
             COALESCE(SUM(input_tokens), 0) as input_tokens,
             COALESCE(SUM(output_tokens), 0) as output_tokens,
             COALESCE(SUM(estimated_cost_usd), 0) as cost_usd
           FROM token_usage
           WHERE session_id = ? AND agent_id IS NOT NULL
           GROUP BY agent_id`
        )
        .all(sessionId) as Array<{
        agent_id: string;
        input_tokens: number;
        output_tokens: number;
        cost_usd: number;
      }>;
    },

    costTimeline(filter, bucket) {
      // Closed allowlist on the strftime format prevents SQL injection.
      const fmt = BUCKET_FORMATS[bucket] ?? BUCKET_FORMATS.day;
      const { sql, params } = buildWhere(filter);
      return db.db
        .prepare(
          `SELECT
             strftime('${fmt}', timestamp) as bucket,
             COUNT(*) as requests,
             COALESCE(SUM(input_tokens), 0) as input_tokens,
             COALESCE(SUM(output_tokens), 0) as output_tokens,
             COALESCE(SUM(cache_read_tokens), 0) as cache_read_tokens,
             COALESCE(SUM(estimated_cost_usd), 0) as cost_usd
           FROM token_usage${sql}
           GROUP BY bucket
           ORDER BY bucket ASC`
        )
        .all(...params);
    }
  };
}
