/**
 * SQLite write retry helper.
 *
 * better-sqlite3 throws synchronously with `code === 'SQLITE_BUSY'` when
 * another writer is holding the lock (most common: retention sweep colliding
 * with normal inserts). The WAL journal + 5s busy_timeout pragma usually
 * resolves this, but we've still observed transient BUSY under load — a
 * retry with exponential backoff drops the failure rate to ~zero.
 *
 * Apply only to writes (.run() on INSERT/UPDATE/DELETE). DON'T wrap reads —
 * reads in WAL mode don't block writers and vice versa, so a BUSY on a read
 * is a deeper problem the retry won't fix.
 *
 * On ENOSPC: bubble up immediately. Retry will not help and the disk-full
 * subsystem state must be observable.
 */

import { logger } from './logger.js';
import { markDiskFull, markWriteSuccess } from './disk-state.js';
import { internalMetrics } from '../services/internal-metrics.js';

const BACKOFFS_MS = [10, 50, 200] as const;

/** Sync variant — better-sqlite3 is synchronous. */
export function retryWrite<T>(fn: () => T, label = 'sqlite write'): T {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= BACKOFFS_MS.length; attempt++) {
    try {
      const result = fn();
      // Clears the disk-full flag if it was set — proves writes are working again.
      markWriteSuccess();
      internalMetrics.recordWriteAttempt(true);
      return result;
    } catch (err) {
      lastErr = err;
      const code = (err as NodeJS.ErrnoException)?.code;
      // Better-sqlite3 wraps the underlying errno in `code` like 'SQLITE_FULL'.
      // 'ENOSPC' shows up when the FS write itself fails (e.g. WAL).
      if (code === 'ENOSPC' || code === 'SQLITE_FULL') {
        const e = err instanceof Error ? err : new Error(String(err));
        logger.error(`💾 DISK FULL (${label}): ${e.message}`);
        markDiskFull(e);
        internalMetrics.recordWriteAttempt(false);
        throw err;
      }
      if (code !== 'SQLITE_BUSY' || attempt >= BACKOFFS_MS.length) {
        internalMetrics.recordWriteAttempt(false);
        throw err;
      }
      internalMetrics.recordWriteRetry();
      const delay = BACKOFFS_MS[attempt];
      // Block synchronously — better-sqlite3 callers expect a synchronous
      // return value, and the retry window is bounded (10+50+200 = 260ms).
      const end = Date.now() + delay;
      while (Date.now() < end) {
        // Atomics.wait blocks the thread without spinning; falls back to a
        // tight loop on environments that don't expose SharedArrayBuffer.
        try {
          Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, delay);
          break;
        } catch {
          // fall through to spin
        }
      }
      logger.debug(`SQLITE_BUSY on ${label}, retry ${attempt + 1}/${BACKOFFS_MS.length}`);
    }
  }
  throw lastErr;
}
