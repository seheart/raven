/**
 * Retention cleanup + daily scheduler.
 *
 * Runs an immediate cleanup at startup and re-arms a nightly cleanup at the
 * given hour. Times are unref'd so they don't block shutdown.
 */

import type { RavenDB } from '../db.js';
import { logger } from '../utils/logger.js';
import { promises as fs } from 'fs';
import { join } from 'path';

const DEFAULT_EVENT_DAYS = 7;
const DEFAULT_METRICS_DAYS = 30;
const DEFAULT_SNAPSHOT_DAYS = 7;

interface RetentionConfig {
  eventDays?: number;
  metricsDays?: number;
  snapshotDays?: number;
  snapshotsDir?: string;
}

/**
 * Delete data older than the per-table retention threshold. Returns a map of
 * table → rows deleted (only tables that actually deleted any rows).
 *
 * Tables with `events`-grade churn use `eventDays` (default 7); slower-moving
 * metric/insight tables use `metricsDays` (default 30). Missing tables are
 * skipped silently.
 *
 * Exported so `/api/storage/retention/run` can fire it on demand without
 * waiting for the nightly schedule.
 */
export function runRetentionCleanup(
  db: RavenDB,
  eventDays = DEFAULT_EVENT_DAYS,
  metricsDays = DEFAULT_METRICS_DAYS
): Record<string, number> {
  const results: Record<string, number> = {};

  // Most tables share the standard `timestamp` column. A few diverge —
  // those use a custom `column` so retention actually fires (the previous
  // implementation silently no-op'd on subagent_tree/analysis_checks).
  const tables: Array<{ name: string; days: number; column?: string; via?: string }> = [
    { name: 'events', days: eventDays },
    { name: 'agent_events', days: eventDays },
    { name: 'syntax_errors', days: eventDays },
    { name: 'pattern_warnings', days: eventDays },
    { name: 'diff_risk_scores', days: eventDays },
    { name: 'app_errors', days: eventDays },
    { name: 'api_latency', days: eventDays },
    { name: 'raven_metrics', days: metricsDays },
    { name: 'process_metrics', days: metricsDays },
    { name: 'gpu_metrics', days: metricsDays },
    { name: 'token_usage', days: metricsDays },
    { name: 'insights', days: metricsDays },
    { name: 'test_results', days: metricsDays },
    { name: 'analysis_runs', days: metricsDays },
    { name: 'subagent_tree', days: metricsDays, column: 'started_at' },
    // analysis_checks lacks a timestamp; cascade from analysis_runs via run_id.
    {
      name: 'analysis_checks',
      days: metricsDays,
      via: 'DELETE FROM analysis_checks WHERE run_id IN (SELECT id FROM analysis_runs WHERE timestamp < ?)'
    }
  ];

  for (const { name, days, column = 'timestamp', via } of tables) {
    try {
      const cutoff = `datetime('now', '-${days} days')`;
      const sql = via
        ? via.replace('?', cutoff)
        : `DELETE FROM ${name} WHERE ${column} < ${cutoff}`;
      const result = db.db.prepare(sql).run();
      if (result.changes > 0) results[name] = result.changes;
    } catch (err) {
      // Table may not exist yet — log at debug rather than silently no-op'ing
      // (the silent path masked a real bug for months).
      logger.debug(
        `Retention skip on ${name}: ${err instanceof Error ? err.message : String(err)}`
      );
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

/**
 * Prune snapshot files older than `days`. Snapshots are pre-edit backups for
 * the rollback feature; without retention they accumulate indefinitely (we
 * found 28k+ files / 13 GB in the wild before this hook landed).
 */
async function runSnapshotCleanup(snapshotsDir: string, days: number): Promise<number> {
  const cutoffMs = Date.now() - days * 24 * 60 * 60 * 1000;
  let entries: string[];
  try {
    entries = await fs.readdir(snapshotsDir);
  } catch {
    return 0;
  }
  let deleted = 0;
  await Promise.all(
    entries.map(async name => {
      const filepath = join(snapshotsDir, name);
      try {
        const stat = await fs.stat(filepath);
        if (stat.isFile() && stat.mtimeMs < cutoffMs) {
          await fs.unlink(filepath);
          deleted++;
        }
      } catch {
        // Snapshot may have been removed between readdir and stat; ignore.
      }
    })
  );
  return deleted;
}

export function startRetentionCleanup(db: RavenDB, config: RetentionConfig = {}): void {
  const eventDays = config.eventDays ?? DEFAULT_EVENT_DAYS;
  const metricsDays = config.metricsDays ?? DEFAULT_METRICS_DAYS;
  const snapshotDays = config.snapshotDays ?? DEFAULT_SNAPSHOT_DAYS;
  const snapshotsDir = config.snapshotsDir;

  const run = async () => {
    const results = runRetentionCleanup(db, eventDays, metricsDays);
    const total = Object.values(results).reduce((s, n) => s + n, 0);
    if (total > 0) {
      logger.info(`🧹 Retention cleanup: deleted ${total} old rows`, results);
    }
    if (snapshotsDir) {
      try {
        const deleted = await runSnapshotCleanup(snapshotsDir, snapshotDays);
        if (deleted > 0) {
          logger.info(`🧹 Snapshot cleanup: deleted ${deleted} files older than ${snapshotDays}d`);
        }
      } catch (err) {
        logger.error(
          'Snapshot cleanup failed:',
          err instanceof Error ? err : new Error(String(err))
        );
      }
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
