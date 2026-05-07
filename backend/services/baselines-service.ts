/**
 * Baselines Service
 *
 * Per-agent (model) learned thresholds for anomaly scoring. Computes
 * rolling p50/p95 latency + per-request output tokens + per-request
 * cost from the last 7 days, then compares the most recent activity
 * (last 30 minutes) against those baselines. Flags drifts where:
 *
 *   - latency p95 of last 30m > 2× the 7d p95 (slow drift)
 *   - cost p95 of last 30m > 2× the 7d p95 (output bloat or model swap)
 *   - output_tokens p95 of last 30m > 2× the 7d p95 (loops)
 *
 * Exposes the table for `/api/agents/baselines` and the per-row
 * anomaly flag for `/api/agents/anomalies`.
 *
 * No machine learning — just SQL percentiles. The point is to surface
 * "this agent is behaving differently than usual", not to predict.
 */

import type { RavenDB } from '../db.js';

const BASELINE_WINDOW_DAYS = 7;
const RECENT_WINDOW_MINUTES = 30;
const ANOMALY_RATIO = 2.0;
const MIN_BASELINE_SAMPLES = 5;
const MIN_RECENT_SAMPLES = 3;

export interface AgentBaseline {
  model: string;
  samples: number;
  /** Median, 95th percentile (ms). Null when samples < MIN_BASELINE_SAMPLES. */
  latency_p50_ms: number | null;
  latency_p95_ms: number | null;
  /** Median + 95th of estimated_cost_usd per request. */
  cost_p50_usd: number | null;
  cost_p95_usd: number | null;
  /** Median + 95th of output_tokens per request. */
  output_p50: number | null;
  output_p95: number | null;
  /** Earliest + latest sample observed. */
  first_seen: string | null;
  last_seen: string | null;
}

export interface AgentAnomaly {
  model: string;
  /** Recent (30m) p95 vs baseline p95 ratios. */
  latency_ratio: number | null;
  cost_ratio: number | null;
  output_ratio: number | null;
  /** Worst ratio across the three above (used for sorting). */
  worst_ratio: number | null;
  flagged: Array<'latency' | 'cost' | 'output'>;
  /** One-line summary suitable for UI surface. */
  summary: string;
}

export interface BaselinesService {
  list(): AgentBaseline[];
  anomalies(): AgentAnomaly[];
}

function percentile(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor(p * sorted.length)));
  return sorted[idx];
}

function loadSamples(
  db: RavenDB,
  model: string,
  table: 'token_usage' | 'api_latency',
  field: string,
  startIso: string,
  endIso: string
): number[] {
  const rows = db.db
    .prepare(
      `SELECT ${field} AS v FROM ${table}
       WHERE model = ? AND timestamp >= ? AND timestamp <= ?`
    )
    .all(model, startIso, endIso) as Array<{ v: number | null }>;
  return rows
    .map(r => Number(r.v))
    .filter(n => Number.isFinite(n) && n > 0)
    .sort((a, b) => a - b);
}

export function createBaselinesService(db: RavenDB): BaselinesService {
  function distinctModels(sinceIso: string): string[] {
    const rows = db.db
      .prepare(
        `SELECT DISTINCT model AS m FROM token_usage
         WHERE model IS NOT NULL AND model != '' AND timestamp >= ?
         UNION
         SELECT DISTINCT model AS m FROM api_latency
         WHERE model IS NOT NULL AND model != '' AND timestamp >= ?`
      )
      .all(sinceIso, sinceIso) as Array<{ m: string }>;
    return rows.map(r => r.m).filter(Boolean);
  }

  function baselineFor(model: string, baselineStart: string, now: string): AgentBaseline {
    const cost = loadSamples(db, model, 'token_usage', 'estimated_cost_usd', baselineStart, now);
    const output = loadSamples(db, model, 'token_usage', 'output_tokens', baselineStart, now);
    const lat = loadSamples(db, model, 'api_latency', 'latency_ms', baselineStart, now);

    // Range info from token_usage (preferred — wider coverage).
    const range = db.db
      .prepare(
        `SELECT MIN(timestamp) AS first_seen, MAX(timestamp) AS last_seen
         FROM token_usage WHERE model = ? AND timestamp >= ?`
      )
      .get(model, baselineStart) as { first_seen: string | null; last_seen: string | null } | undefined;

    const samples = Math.max(cost.length, output.length, lat.length);

    return {
      model,
      samples,
      latency_p50_ms: lat.length >= MIN_BASELINE_SAMPLES ? percentile(lat, 0.5) : null,
      latency_p95_ms: lat.length >= MIN_BASELINE_SAMPLES ? percentile(lat, 0.95) : null,
      cost_p50_usd: cost.length >= MIN_BASELINE_SAMPLES ? percentile(cost, 0.5) : null,
      cost_p95_usd: cost.length >= MIN_BASELINE_SAMPLES ? percentile(cost, 0.95) : null,
      output_p50: output.length >= MIN_BASELINE_SAMPLES ? percentile(output, 0.5) : null,
      output_p95: output.length >= MIN_BASELINE_SAMPLES ? percentile(output, 0.95) : null,
      first_seen: range?.first_seen ?? null,
      last_seen: range?.last_seen ?? null
    };
  }

  return {
    list() {
      // For the public list endpoint we DO include the most-recent
      // window in the baseline — the user is looking at "what's the
      // typical behavior including right now". For anomaly detection
      // (below), we exclude the recent window so it can't skew its
      // own threshold.
      const now = new Date().toISOString();
      const baselineStart = new Date(
        Date.now() - BASELINE_WINDOW_DAYS * 86_400_000
      ).toISOString();
      const models = distinctModels(baselineStart);
      return models.map(m => baselineFor(m, baselineStart, now));
    },

    anomalies() {
      const now = new Date().toISOString();
      const recentStart = new Date(
        Date.now() - RECENT_WINDOW_MINUTES * 60_000
      ).toISOString();
      // Baseline ends at recentStart so the comparison window doesn't
      // pollute the threshold it's being tested against.
      const baselineStart = new Date(
        Date.now() - BASELINE_WINDOW_DAYS * 86_400_000
      ).toISOString();
      const models = distinctModels(recentStart);

      const out: AgentAnomaly[] = [];
      for (const m of models) {
        const baseline = baselineFor(m, baselineStart, recentStart);
        const recentCost = loadSamples(db, m, 'token_usage', 'estimated_cost_usd', recentStart, now);
        const recentOutput = loadSamples(db, m, 'token_usage', 'output_tokens', recentStart, now);
        const recentLat = loadSamples(db, m, 'api_latency', 'latency_ms', recentStart, now);
        if (
          recentCost.length < MIN_RECENT_SAMPLES &&
          recentOutput.length < MIN_RECENT_SAMPLES &&
          recentLat.length < MIN_RECENT_SAMPLES
        ) {
          continue;
        }

        const recCostP95 = recentCost.length >= MIN_RECENT_SAMPLES ? percentile(recentCost, 0.95) : null;
        const recOutP95 = recentOutput.length >= MIN_RECENT_SAMPLES ? percentile(recentOutput, 0.95) : null;
        const recLatP95 = recentLat.length >= MIN_RECENT_SAMPLES ? percentile(recentLat, 0.95) : null;

        const costRatio = baseline.cost_p95_usd && recCostP95 ? recCostP95 / baseline.cost_p95_usd : null;
        const outRatio = baseline.output_p95 && recOutP95 ? recOutP95 / baseline.output_p95 : null;
        const latRatio = baseline.latency_p95_ms && recLatP95 ? recLatP95 / baseline.latency_p95_ms : null;

        /** @type {Array<'latency' | 'cost' | 'output'>} */
        const flagged: Array<'latency' | 'cost' | 'output'> = [];
        if (latRatio != null && latRatio >= ANOMALY_RATIO) flagged.push('latency');
        if (costRatio != null && costRatio >= ANOMALY_RATIO) flagged.push('cost');
        if (outRatio != null && outRatio >= ANOMALY_RATIO) flagged.push('output');

        const allRatios = [latRatio, costRatio, outRatio].filter(
          (n): n is number => typeof n === 'number' && Number.isFinite(n)
        );
        const worst = allRatios.length ? Math.max(...allRatios) : null;

        const summaryParts: string[] = [];
        if (flagged.includes('latency')) summaryParts.push(`latency ${latRatio?.toFixed(1)}× baseline`);
        if (flagged.includes('cost')) summaryParts.push(`cost ${costRatio?.toFixed(1)}× baseline`);
        if (flagged.includes('output')) summaryParts.push(`output ${outRatio?.toFixed(1)}× baseline`);

        const summary = flagged.length
          ? `${m} drifting — ${summaryParts.join(', ')}`
          : `${m} within normal range`;

        out.push({
          model: m,
          latency_ratio: latRatio,
          cost_ratio: costRatio,
          output_ratio: outRatio,
          worst_ratio: worst,
          flagged,
          summary
        });
      }

      // Flagged first, then by worst ratio descending.
      out.sort((a, b) => {
        if (a.flagged.length !== b.flagged.length) return b.flagged.length - a.flagged.length;
        return (b.worst_ratio ?? 0) - (a.worst_ratio ?? 0);
      });
      return out;
    }
  };
}
