/**
 * InternalMetrics — Raven monitoring Raven.
 *
 * Diagnostic counters + small ring-buffers for the operator to see, at a
 * glance, whether the ingest tier / trigger tier / broadcast tier / DB tier
 * are healthy and roughly how loaded each one is. All numbers live in
 * process memory; on restart they reset. This is not a metrics service —
 * it's a "where is the bottleneck right now" probe.
 *
 * Keep this file small and dependency-free. Instrumentation points are
 * single-line calls (`internalMetrics.recordXxx(...)`) at write/insert
 * sites; the heavy lifting (aggregation, percentiles, lag math) lives
 * here so call sites stay one-line.
 */
import { allBreakers } from '../utils/circuit-breaker.js';
import { getDiskState } from '../utils/disk-state.js';

/** Snapshot returned by /api/system/internal-metrics. */
export interface InternalMetricsSnapshot {
  uptime_seconds: number;
  ingest_events_total: number;
  ingest_events_per_second: number;
  ws_broadcast_queue_depth: number;
  ws_clients_connected: number;
  trigger_processing_p50_ms: number;
  trigger_processing_p95_ms: number;
  trigger_processing_samples: number;
  claude_log_watcher_lag_ms: number | null;
  codex_log_watcher_lag_ms: number | null;
  db_write_success_rate_pct: number;
  db_write_retry_count: number;
  db_write_samples: number;
  disk_full_state: boolean;
  circuit_breaker_states: Array<{
    name: string;
    state: 'closed' | 'open' | 'half-open';
    failure_count: number;
  }>;
}

interface LogWatcherLike {
  health?(): { lastSuccessfulTailAt?: string | null };
}

const INGEST_WINDOW_MS = 30_000;
const TRIGGER_SAMPLE_CAP = 100;
const DB_WRITE_SAMPLE_CAP = 1000;

class InternalMetrics {
  private startedAt = Date.now();

  // Ingest — total counter + a ring of recent timestamps (millisecond
  // unix). We compute the per-second rate by counting timestamps in the
  // last 30s window. Cheaper than a full histogram and accurate enough.
  private ingestTotal = 0;
  private ingestTimestamps: number[] = [];

  // Trigger latency — ring of last N evaluations. p50/p95 computed on demand.
  private triggerLatencies: number[] = [];

  // DB writes — fixed-size ring of booleans. Rate = successes / total.
  // The retry counter is a separate process-lifetime counter (bumped from
  // sqlite-retry on every backoff iteration, not on every attempt).
  private dbWriteResults: boolean[] = [];
  private dbWriteRetries = 0;

  // WebSocket state — set externally by the broadcaster shim.
  private wsQueueDepth = 0;
  private wsClientsCount = 0;

  // Watcher pointers — resolved from the watcher instances at snapshot time.
  private claudeWatcher: LogWatcherLike | null = null;
  private codexWatcher: LogWatcherLike | null = null;

  /** Called by file-events / agent-events repositories after a successful insert. */
  recordIngest(): void {
    this.ingestTotal++;
    const now = Date.now();
    this.ingestTimestamps.push(now);
    // Trim from the head — cheap because pushes are monotonic. Anything
    // older than the window can never matter again.
    const cutoff = now - INGEST_WINDOW_MS;
    while (this.ingestTimestamps.length > 0 && this.ingestTimestamps[0] < cutoff) {
      this.ingestTimestamps.shift();
    }
  }

  /** Called by trigger-engine for each evaluate() invocation. */
  recordTriggerLatency(ms: number): void {
    if (!Number.isFinite(ms) || ms < 0) return;
    this.triggerLatencies.push(ms);
    if (this.triggerLatencies.length > TRIGGER_SAMPLE_CAP) {
      this.triggerLatencies.shift();
    }
  }

  /** Called by sqlite-retry on each write attempt outcome (final). */
  recordWriteAttempt(success: boolean): void {
    this.dbWriteResults.push(success);
    if (this.dbWriteResults.length > DB_WRITE_SAMPLE_CAP) {
      this.dbWriteResults.shift();
    }
  }

  /** Called by sqlite-retry every time a backoff retry is scheduled. */
  recordWriteRetry(): void {
    this.dbWriteRetries++;
  }

  /** Broadcaster sets this on every queued/flushed cycle. */
  setBroadcastQueueDepth(depth: number): void {
    this.wsQueueDepth = Math.max(0, depth | 0);
  }

  /** Socket.IO connection / disconnection hooks set this. */
  setClientsConnected(n: number): void {
    this.wsClientsCount = Math.max(0, n | 0);
  }

  /** Wire watcher handles so getSnapshot() can compute lag. */
  setLogWatchers(claude?: LogWatcherLike | null, codex?: LogWatcherLike | null): void {
    this.claudeWatcher = claude ?? null;
    this.codexWatcher = codex ?? null;
  }

  private percentile(sorted: number[], p: number): number {
    if (sorted.length === 0) return 0;
    // Nearest-rank, clipped to bounds. Plenty good for diagnostics.
    const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
    return sorted[idx];
  }

  private ingestRate(): number {
    // Rate = events in window / window seconds, rounded to 2 decimals.
    // Trim again here in case nothing has come in for a while (push side
    // only trims on insert).
    const now = Date.now();
    const cutoff = now - INGEST_WINDOW_MS;
    while (this.ingestTimestamps.length > 0 && this.ingestTimestamps[0] < cutoff) {
      this.ingestTimestamps.shift();
    }
    const count = this.ingestTimestamps.length;
    return Math.round((count / (INGEST_WINDOW_MS / 1000)) * 100) / 100;
  }

  private watcherLag(w: LogWatcherLike | null): number | null {
    if (!w?.health) return null;
    const ts = w.health().lastSuccessfulTailAt;
    if (!ts) return null;
    const parsed = new Date(ts).getTime();
    if (!Number.isFinite(parsed)) return null;
    return Math.max(0, Date.now() - parsed);
  }

  private writeSuccessRate(): number {
    const n = this.dbWriteResults.length;
    if (n === 0) return 100; // optimistic when no writes yet
    const successes = this.dbWriteResults.reduce((s, ok) => (ok ? s + 1 : s), 0);
    return Math.round((successes / n) * 10_000) / 100;
  }

  getSnapshot(): InternalMetricsSnapshot {
    const sortedLatencies = [...this.triggerLatencies].sort((a, b) => a - b);
    const breakers = allBreakers().map(b => {
      const snap = b.snapshot();
      return { name: snap.name, state: snap.state, failure_count: snap.failures };
    });
    return {
      uptime_seconds: Math.floor((Date.now() - this.startedAt) / 1000),
      ingest_events_total: this.ingestTotal,
      ingest_events_per_second: this.ingestRate(),
      ws_broadcast_queue_depth: this.wsQueueDepth,
      ws_clients_connected: this.wsClientsCount,
      trigger_processing_p50_ms: this.percentile(sortedLatencies, 50),
      trigger_processing_p95_ms: this.percentile(sortedLatencies, 95),
      trigger_processing_samples: sortedLatencies.length,
      claude_log_watcher_lag_ms: this.watcherLag(this.claudeWatcher),
      codex_log_watcher_lag_ms: this.watcherLag(this.codexWatcher),
      db_write_success_rate_pct: this.writeSuccessRate(),
      db_write_retry_count: this.dbWriteRetries,
      db_write_samples: this.dbWriteResults.length,
      disk_full_state: getDiskState().diskFull,
      circuit_breaker_states: breakers
    };
  }
}

export const internalMetrics = new InternalMetrics();
