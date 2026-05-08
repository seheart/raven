/**
 * API Latency Repository — owns the `api_latency` table.
 *
 * Captures per-request inference latency from the Ollama proxy and the agent
 * event handlers. Read by the dashboard and the metrics route.
 */

import type { RavenDB } from '../db.js';

interface ApiLatencyRow {
  id: number;
  timestamp: string;
  session_id?: string;
  project_name?: string;
  model?: string;
  latency_ms: number;
}

interface ApiLatencyStats {
  avg_ms: number;
  p50_ms: number;
  p95_ms: number;
  count: number;
  requests_per_min: number;
}

export interface ApiLatencyRepository {
  insert(
    timestamp: string,
    session_id: string | null | undefined,
    project_name: string | null | undefined,
    model: string | null | undefined,
    latency_ms: number
  ): number;
  recent(limit?: number): ApiLatencyRow[];
  stats(minutes?: number): ApiLatencyStats;

  /** Per-call latencies grouped by model, since `cutoffIso`. */
  latenciesByModelSince(cutoffIso: string): Array<{ model: string; latency_ms: number }>;
}

export function createApiLatencyRepository(db: RavenDB): ApiLatencyRepository {
  const insertStmt = db.db.prepare(`
    INSERT INTO api_latency (timestamp, session_id, project_name, model, latency_ms)
    VALUES (?, ?, ?, ?, ?)
  `);

  const recentStmt = db.db.prepare(`
    SELECT id, timestamp, session_id, project_name, model, latency_ms
    FROM api_latency
    ORDER BY timestamp DESC
    LIMIT ?
  `);

  const latenciesByModelSinceStmt = db.db.prepare(`
    SELECT model, latency_ms FROM api_latency
    WHERE timestamp >= ? AND latency_ms IS NOT NULL
  `);

  return {
    insert(timestamp, session_id, project_name, model, latency_ms) {
      const result = insertStmt.run(
        timestamp,
        session_id || null,
        project_name || null,
        model || null,
        latency_ms
      );
      return Number(result.lastInsertRowid);
    },

    recent(limit = 100) {
      return recentStmt.all(limit) as ApiLatencyRow[];
    },

    stats(minutes = 60) {
      const cutoff = new Date(Date.now() - minutes * 60_000).toISOString();
      const rows = db.db
        .prepare(
          `SELECT latency_ms FROM api_latency
           WHERE timestamp >= ?
           ORDER BY latency_ms ASC`
        )
        .all(cutoff) as Array<{ latency_ms: number }>;
      if (rows.length === 0) {
        return { avg_ms: 0, p50_ms: 0, p95_ms: 0, count: 0, requests_per_min: 0 };
      }
      const values = rows.map(r => r.latency_ms);
      const avg_ms = Math.round(values.reduce((a, b) => a + b, 0) / values.length);
      const p50_ms = values[Math.floor(values.length * 0.5)];
      const p95_ms = values[Math.floor(values.length * 0.95)];
      return {
        avg_ms,
        p50_ms,
        p95_ms,
        count: values.length,
        requests_per_min: Math.round((values.length / minutes) * 10) / 10
      };
    },

    latenciesByModelSince(cutoffIso) {
      return latenciesByModelSinceStmt.all(cutoffIso) as Array<{
        model: string;
        latency_ms: number;
      }>;
    }
  };
}
