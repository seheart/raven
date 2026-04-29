/**
 * Retention cleanup + daily scheduler.
 *
 * Runs an immediate cleanup at startup and re-arms a nightly cleanup at the
 * given hour. Times are unref'd so they don't block shutdown.
 */

import type { RavenDB } from '../db.js';
import { logger } from '../utils/logger.js';

const DEFAULT_EVENT_DAYS = 7;
const DEFAULT_METRICS_DAYS = 30;

interface RetentionConfig {
  eventDays?: number;
  metricsDays?: number;
}

/**
 * Delete data older than the per-table retention threshold. Returns a map of
 * table → rows deleted (only tables that actually deleted any rows).
 *
 * Tables with `events`-grade churn use `eventDays` (default 7); slower-moving
 * metric/insight tables use `metricsDays` (default 30). Missing tables are
 * skipped silently.
 */
function runRetentionCleanup(
  db: RavenDB,
  eventDays = DEFAULT_EVENT_DAYS,
  metricsDays = DEFAULT_METRICS_DAYS
): Record<string, number> {
  const results: Record<string, number> = {};

  const tables: Array<{ name: string; days: number }> = [
    { name: 'events', days: eventDays },
    { name: 'agent_events', days: eventDays },
    { name: 'syntax_errors', days: eventDays },
    { name: 'pattern_warnings', days: eventDays },
    { name: 'diff_risk_scores', days: eventDays },
    { name: 'app_errors', days: eventDays },
    { name: 'raven_metrics', days: metricsDays },
    { name: 'process_metrics', days: metricsDays },
    { name: 'token_usage', days: metricsDays },
    { name: 'insights', days: metricsDays },
    { name: 'test_results', days: metricsDays },
    { name: 'subagent_tree', days: metricsDays },
    { name: 'analysis_runs', days: metricsDays },
    { name: 'analysis_checks', days: metricsDays }
  ];

  for (const { name, days } of tables) {
    try {
      const result = db.db
        .prepare(`DELETE FROM ${name} WHERE timestamp < datetime('now', '-${days} days')`)
        .run();
      if (result.changes > 0) results[name] = result.changes;
    } catch {
      // Table may not exist yet — skip silently
    }
  }

  // Reclaim freed pages incrementally. Without this, retention deletes pile
  // up free pages that never shrink the file (no-op unless auto_vacuum is set).
  try {
    db.db.pragma('incremental_vacuum');
  } catch {
    // best-effort
  }

  return results;
}

export function startRetentionCleanup(db: RavenDB, config: RetentionConfig = {}): void {
  const eventDays = config.eventDays ?? DEFAULT_EVENT_DAYS;
  const metricsDays = config.metricsDays ?? DEFAULT_METRICS_DAYS;

  const run = () => {
    const results = runRetentionCleanup(db, eventDays, metricsDays);
    const total = Object.values(results).reduce((s, n) => s + n, 0);
    if (total > 0) {
      logger.info(`🧹 Retention cleanup: deleted ${total} old rows`, results);
    }
  };

  run();
  scheduleDaily(3, run);
}

/**
 * Schedule `fn` to run once per day at the given hour (0-23). Re-arms itself
 * after each fire. Returned timer is unref'd so it won't block shutdown.
 */
export function scheduleDaily(targetHour: number, fn: () => void): NodeJS.Timeout {
  const msUntilNext = () => {
    const now = new Date();
    const next = new Date(now);
    next.setHours(targetHour, 0, 0, 0);
    if (next.getTime() <= now.getTime()) next.setDate(next.getDate() + 1);
    return next.getTime() - now.getTime();
  };
  let timer: NodeJS.Timeout;
  const arm = () => {
    timer = setTimeout(() => {
      try {
        fn();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error(`scheduleDaily task failed: ${msg}`);
      }
      arm();
    }, msUntilNext());
    timer.unref();
  };
  arm();
  return timer!;
}
