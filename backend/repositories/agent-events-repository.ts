/**
 * Agent Events Repository — owns the `agent_events` table.
 *
 * Started small; will grow as more routes are extracted from server.ts.
 */

import type { RavenDB } from '../db.js';

interface LastProjectForAgent {
  project: string | null;
}

interface LastModelLoad {
  project: string | null;
  pid: number | null;
  cmd: string | null;
  cwd: string | null;
  timestamp: string;
}

interface ModelConsumer {
  project: string | null;
  pid: number | null;
  cwd: string | null;
  request_count: number;
  last_seen: string;
}

interface AgentStatsRow {
  agent: string;
  total_events: number;
  inferences: number;
  tool_calls: number;
  responses: number;
  prompts: number;
  avg_duration_ms: number | null;
  total_lines_changed: number | null;
  first_seen: string | null;
  last_active: string | null;
  files_touched: number;
}

interface AgentAttributionRow {
  agent_source: string;
  file_changes: number;
  unique_files: number;
}

interface AgentEventRow {
  id: number;
  timestamp: string;
  agent: string;
  event_type: string;
  file?: string;
  lines_changed?: number;
  duration_ms?: number;
  message: string;
  metadata?: string;
  session_id?: string;
}

interface AgentTotals {
  agent: string;
  event_count: number;
  avg_duration_ms: number | null;
  total_lines_changed: number | null;
}

export interface AgentEventsRepository {
  /** Insert a new agent_events row. Returns the inserted row id. */
  insert(
    timestamp: string,
    agent: string,
    event_type: string,
    file: string | null | undefined,
    lines_changed: number | null | undefined,
    duration_ms: number | null | undefined,
    message: string,
    metadata: Record<string, unknown> | null | undefined,
    session_id: string | null | undefined,
    project_name: string | null | undefined
  ): number;

  /** Most recent agent_events rows across all agents. */
  recent(limit?: number): AgentEventRow[];

  /** Most recent rows for a specific agent. */
  byAgent(agent: string, limit?: number): AgentEventRow[];

  /** Per-agent totals. Memoized at the repo level for ~2s. */
  totals(): AgentTotals[];

  /** Rows for a session, shaped like file-event rows for the session timeline. */
  bySession(sessionId: string): unknown[];

  /**
   * Most recent project that USED a given model — only load-triggering
   * endpoints (generate/chat/embeddings). Read-only metadata calls are
   * excluded so policy-gated apps don't get misattributed.
   */
  lastProjectForModel(modelName: string): LastProjectForAgent | undefined;

  /**
   * Who last put the model into VRAM (captured by the model-load watcher).
   * May be null if the loader's connection had already closed.
   */
  lastModelLoad(modelName: string): LastModelLoad | undefined;

  /**
   * Distinct callers that have hit a given model recently. Aggregates the
   * inference/api_call rows by caller_pid (or project when pid is null)
   * to answer "who is currently using this model" — not just who first
   * loaded it. Used to surface multiple consumers (e.g. atf + sightline
   * both calling the same gemma3 instance) on the active-models card.
   */
  recentModelConsumers(modelName: string, sinceISO: string): ModelConsumer[];

  /** Per-agent activity rollup. Limited to top 100 by total_events. */
  agentStats(): AgentStatsRow[];

  /** File-change attribution rollup keyed by `agent_source`. */
  agentAttribution(): AgentAttributionRow[];

  /** Conversation rows (user/assistant/tool turns) for the conversations page. */
  conversations(
    eventType: string | undefined,
    limit: number,
    offset: number
  ): {
    conversations: unknown[];
    total: number;
  };

  /** Stats for the conversations page header. */
  conversationStats(): {
    total: number;
    by_type: Record<string, number>;
    by_project: Record<string, number>;
  };

  /**
   * Per-inference latencies grouped by agent (= local model name) since
   * `cutoffIso`. Counterpart to ApiLatencyRepository.latenciesByModelSince
   * for hosted-API calls; together they cover every observed model.
   */
  inferenceLatenciesSince(cutoffIso: string): Array<{ model: string; latency_ms: number }>;

  /**
   * Agent events list with optional time-range filter. Returns the columns
   * needed by the /api/events endpoint (no SQL injection risk; the time
   * range is parameterized).
   */
  listInTimeRange(
    startTime: string | undefined,
    endTime: string | undefined,
    limit: number
  ): unknown[];

  /**
   * Per-(agent, message) tool-call counts across all of agent_events. Used
   * to render the per-agent tool-breakdown card. Ordered agent ASC, count DESC.
   */
  toolBreakdown(): Array<{ agent: string; message: string; count: number }>;

  /** Aggregated activity profile per agent: counts, first/last seen, file count. */
  agentProfiles(): unknown[];

  /** Per-(agent, event_type) counts. Used to render the event-type distribution. */
  eventTypeDistribution(): Array<{ agent: string; event_type: string; count: number }>;
}

const AGENT_TOTALS_TTL_MS = 2000;

export function createAgentEventsRepository(db: RavenDB): AgentEventsRepository {
  const insertStmt = db.db.prepare(`
    INSERT INTO agent_events (timestamp, agent, event_type, file, lines_changed, duration_ms, message, metadata, session_id, project_name)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const recentStmt = db.db.prepare(`
    SELECT id, timestamp, agent, event_type, file, lines_changed, duration_ms, message, metadata
    FROM agent_events
    ORDER BY timestamp DESC
    LIMIT ?
  `);

  const byAgentStmt = db.db.prepare(`
    SELECT id, timestamp, agent, event_type, file, lines_changed, duration_ms, message, metadata
    FROM agent_events
    WHERE agent = ?
    ORDER BY timestamp DESC
    LIMIT ?
  `);

  const totalsStmt = db.db.prepare(`
    SELECT
      agent,
      COUNT(*) as event_count,
      AVG(duration_ms) as avg_duration_ms,
      SUM(lines_changed) as total_lines_changed
    FROM agent_events
    GROUP BY agent
    ORDER BY event_count DESC
  `);

  const bySessionStmt = db.db.prepare(`
    SELECT id, timestamp, agent, event_type as change_type, file as filepath, lines_changed, duration_ms, message
    FROM agent_events
    WHERE session_id = ?
    ORDER BY timestamp ASC
  `);

  let totalsCache: { value: AgentTotals[]; expiresAt: number } | null = null;

  const lastProjectStmt = db.db.prepare(`
    SELECT COALESCE(project_name, json_extract(metadata, '$.project')) AS project
    FROM agent_events
    WHERE agent = ?
      AND COALESCE(project_name, json_extract(metadata, '$.project')) IS NOT NULL
      AND (
        event_type = 'inference'
        OR (event_type = 'api_call' AND json_extract(metadata, '$.endpoint') = '/api/embeddings')
      )
    ORDER BY timestamp DESC LIMIT 1
  `);

  const lastLoadStmt = db.db.prepare(`
    SELECT
      COALESCE(project_name, json_extract(metadata, '$.project')) AS project,
      CAST(json_extract(metadata, '$.loader_pid') AS INTEGER) AS pid,
      json_extract(metadata, '$.loader_cmd') AS cmd,
      json_extract(metadata, '$.loader_cwd') AS cwd,
      timestamp
    FROM agent_events
    WHERE agent = ? AND event_type = 'model_load'
    ORDER BY timestamp DESC LIMIT 1
  `);

  // Distinct callers in a recent window. Group by caller_pid first
  // (most-specific signal — distinguishes two processes from the same
  // project), falling back to project when pid is missing. The HAVING
  // clause skips rows where every identifier is null so the UI doesn't
  // render meaningless "pid undefined" chips for anonymous traffic
  // (typically pre-instrumentation history before caller_pid was logged).
  // Limit 8 so a chatty test loop doesn't blow up the response.
  const recentConsumersStmt = db.db.prepare(`
    SELECT
      COALESCE(project_name, json_extract(metadata, '$.project')) AS project,
      CAST(json_extract(metadata, '$.caller_pid') AS INTEGER) AS pid,
      json_extract(metadata, '$.caller_cwd') AS cwd,
      COUNT(*) AS request_count,
      MAX(timestamp) AS last_seen
    FROM agent_events
    WHERE agent = ?
      AND event_type IN ('inference', 'api_call')
      AND timestamp >= ?
    GROUP BY pid, project
    HAVING project IS NOT NULL OR pid IS NOT NULL
    ORDER BY last_seen DESC
    LIMIT 8
  `);

  const agentStatsStmt = db.db.prepare(`
    SELECT
      agent,
      COUNT(*) as total_events,
      SUM(CASE WHEN event_type = 'inference' THEN 1 ELSE 0 END) as inferences,
      SUM(CASE WHEN event_type = 'tool_call' THEN 1 ELSE 0 END) as tool_calls,
      SUM(CASE WHEN event_type = 'assistant_text' THEN 1 ELSE 0 END) as responses,
      SUM(CASE WHEN event_type = 'user_message' THEN 1 ELSE 0 END) as prompts,
      AVG(CASE WHEN duration_ms > 0 THEN duration_ms ELSE NULL END) as avg_duration_ms,
      SUM(lines_changed) as total_lines_changed,
      MIN(timestamp) as first_seen,
      MAX(timestamp) as last_active,
      COUNT(DISTINCT file) as files_touched
    FROM agent_events
    GROUP BY agent
    ORDER BY total_events DESC
    LIMIT 100
  `);

  const attributionStmt = db.db.prepare(`
    SELECT
      agent_source,
      COUNT(*) as file_changes,
      COUNT(DISTINCT filepath) as unique_files
    FROM events
    WHERE agent_source IS NOT NULL
    GROUP BY agent_source
    LIMIT 100
  `);

  // Project to a small column set + truncate `message` for list responses.
  // `SELECT *` would balloon payloads on chatty sessions where assistant_text
  // messages can be tens of KB. Detail endpoints can fetch full text by id.
  const CONVERSATION_COLS = `id, timestamp, agent, event_type, file, lines_changed, duration_ms,
    SUBSTR(message, 1, 500) as message, metadata, session_id, project_name`;
  const conversationsAllStmt = db.db.prepare(
    `SELECT ${CONVERSATION_COLS} FROM agent_events
     WHERE event_type IN ('user_message', 'assistant_text', 'tool_call', 'tool_result')
     ORDER BY timestamp DESC LIMIT ? OFFSET ?`
  );
  const conversationsByTypeStmt = db.db.prepare(
    `SELECT ${CONVERSATION_COLS} FROM agent_events
     WHERE event_type = ?
     ORDER BY timestamp DESC LIMIT ? OFFSET ?`
  );
  const conversationsTotalStmt = db.db.prepare(
    `SELECT COUNT(*) as total FROM agent_events
     WHERE event_type IN ('user_message', 'assistant_text', 'tool_call', 'tool_result')`
  );
  const conversationStatsTotalStmt = db.db.prepare(
    `SELECT COUNT(*) as total FROM agent_events
     WHERE event_type IN ('conversation', 'user_message', 'assistant_text', 'tool_call', 'tool_result')`
  );
  const conversationStatsTypeStmt = db.db.prepare(
    `SELECT event_type, COUNT(*) as count FROM agent_events
     WHERE event_type IN ('user_message', 'assistant_text', 'tool_call', 'tool_result')
     GROUP BY event_type`
  );
  const conversationStatsProjectStmt = db.db.prepare(
    `SELECT project_name, COUNT(*) as count FROM agent_events
     WHERE project_name IS NOT NULL
     GROUP BY project_name`
  );

  const inferenceLatenciesSinceStmt = db.db.prepare(
    `SELECT agent as model, duration_ms as latency_ms FROM agent_events
     WHERE timestamp >= ? AND event_type = 'inference' AND duration_ms IS NOT NULL`
  );

  const toolBreakdownStmt = db.db.prepare(
    `SELECT agent, message, COUNT(*) as count
     FROM agent_events
     WHERE event_type = 'tool_call' AND agent IS NOT NULL
     GROUP BY agent, message
     ORDER BY agent, count DESC`
  );

  const agentProfilesStmt = db.db.prepare(
    `SELECT
       agent,
       COUNT(*) as event_count,
       MIN(timestamp) as first_seen,
       MAX(timestamp) as last_seen,
       COUNT(DISTINCT file) as unique_files
     FROM agent_events
     GROUP BY agent
     ORDER BY event_count DESC`
  );

  const eventTypeDistributionStmt = db.db.prepare(
    `SELECT agent, event_type, COUNT(*) as count
     FROM agent_events
     GROUP BY agent, event_type
     ORDER BY agent, count DESC`
  );

  // Time-bounded list. Both bounds optional; ASC param positions adjust by
  // building the WHERE clause in code rather than a string-templated query.
  const listAllStmt = db.db.prepare(
    `SELECT id, timestamp, agent, event_type, file, lines_changed, duration_ms, message, metadata
     FROM agent_events
     ORDER BY timestamp DESC LIMIT ?`
  );
  const listFromStmt = db.db.prepare(
    `SELECT id, timestamp, agent, event_type, file, lines_changed, duration_ms, message, metadata
     FROM agent_events
     WHERE timestamp >= ?
     ORDER BY timestamp DESC LIMIT ?`
  );
  const listUntilStmt = db.db.prepare(
    `SELECT id, timestamp, agent, event_type, file, lines_changed, duration_ms, message, metadata
     FROM agent_events
     WHERE timestamp <= ?
     ORDER BY timestamp DESC LIMIT ?`
  );
  const listBetweenStmt = db.db.prepare(
    `SELECT id, timestamp, agent, event_type, file, lines_changed, duration_ms, message, metadata
     FROM agent_events
     WHERE timestamp >= ? AND timestamp <= ?
     ORDER BY timestamp DESC LIMIT ?`
  );

  return {
    insert(
      timestamp,
      agent,
      event_type,
      file,
      lines_changed,
      duration_ms,
      message,
      metadata,
      session_id,
      project_name
    ) {
      const result = insertStmt.run(
        timestamp,
        agent,
        event_type,
        file || null,
        lines_changed || null,
        duration_ms || null,
        message,
        metadata ? JSON.stringify(metadata) : null,
        session_id || null,
        project_name || null
      );
      return Number(result.lastInsertRowid);
    },

    recent(limit = 100) {
      return recentStmt.all(limit) as AgentEventRow[];
    },

    byAgent(agent, limit = 100) {
      return byAgentStmt.all(agent, limit) as AgentEventRow[];
    },

    totals() {
      const now = Date.now();
      if (totalsCache && totalsCache.expiresAt > now) return totalsCache.value;
      const value = totalsStmt.all() as AgentTotals[];
      totalsCache = { value, expiresAt: now + AGENT_TOTALS_TTL_MS };
      return value;
    },

    bySession(sessionId) {
      return bySessionStmt.all(sessionId);
    },

    lastProjectForModel(modelName) {
      return lastProjectStmt.get(modelName) as LastProjectForAgent | undefined;
    },
    lastModelLoad(modelName) {
      return lastLoadStmt.get(modelName) as LastModelLoad | undefined;
    },
    recentModelConsumers(modelName, sinceISO) {
      return recentConsumersStmt.all(modelName, sinceISO) as ModelConsumer[];
    },
    agentStats() {
      return agentStatsStmt.all() as AgentStatsRow[];
    },
    agentAttribution() {
      return attributionStmt.all() as AgentAttributionRow[];
    },

    conversations(eventType, limit, offset) {
      const filterAll = !eventType || eventType === 'all';
      const conversations = filterAll
        ? conversationsAllStmt.all(limit, offset)
        : conversationsByTypeStmt.all(eventType, limit, offset);
      const totalRow = conversationsTotalStmt.get() as { total: number } | undefined;
      return { conversations, total: totalRow?.total ?? 0 };
    },

    conversationStats() {
      const totalRow = conversationStatsTotalStmt.get() as { total: number } | undefined;
      const typeRows = conversationStatsTypeStmt.all() as Array<{
        event_type: string;
        count: number;
      }>;
      const projectRows = conversationStatsProjectStmt.all() as Array<{
        project_name: string;
        count: number;
      }>;

      const by_type: Record<string, number> = {};
      for (const r of typeRows) by_type[r.event_type] = r.count;
      const by_project: Record<string, number> = {};
      for (const r of projectRows) by_project[r.project_name] = r.count;

      return { total: totalRow?.total ?? 0, by_type, by_project };
    },

    inferenceLatenciesSince(cutoffIso) {
      return inferenceLatenciesSinceStmt.all(cutoffIso) as Array<{
        model: string;
        latency_ms: number;
      }>;
    },

    listInTimeRange(startTime, endTime, limit) {
      if (startTime && endTime) return listBetweenStmt.all(startTime, endTime, limit);
      if (startTime) return listFromStmt.all(startTime, limit);
      if (endTime) return listUntilStmt.all(endTime, limit);
      return listAllStmt.all(limit);
    },

    toolBreakdown() {
      return toolBreakdownStmt.all() as Array<{
        agent: string;
        message: string;
        count: number;
      }>;
    },

    agentProfiles() {
      return agentProfilesStmt.all();
    },

    eventTypeDistribution() {
      return eventTypeDistributionStmt.all() as Array<{
        agent: string;
        event_type: string;
        count: number;
      }>;
    }
  };
}
