/**
 * Diff Annotation Backfill — one-shot, runs once per data directory.
 *
 * The annotation service scores diffs at ingest time (event-bus-bindings),
 * but any event recorded before that write path existed has a stored diff
 * and no annotations. This job walks those rows once, scores them, and
 * drops a marker file so subsequent boots skip the work entirely.
 *
 * Runs shortly after boot, in id-ordered batches with an event-loop yield
 * between each, so it never competes with live ingest for more than a
 * batch's worth of time.
 */

import { existsSync, writeFileSync } from 'fs';
import { join } from 'path';
import type { RavenDB } from '../db.js';
import type { DiffAnnotationService } from './diff-annotation-service.js';
import { logger } from '../utils/logger.js';

const BATCH_SIZE = 500;
const BOOT_DELAY_MS = 15_000;

interface BackfillDeps {
  db: RavenDB;
  diffAnnotationService: DiffAnnotationService;
  ravenDir: string;
  /** Override the post-boot delay (tests). */
  bootDelayMs?: number;
}

export function startDiffAnnotationBackfill(deps: BackfillDeps): void {
  const marker = join(deps.ravenDir, 'diff-annotations-backfilled.marker');
  if (existsSync(marker)) return;

  const timer = setTimeout(() => {
    run(deps, marker).catch(err => {
      logger.error('❌ Diff annotation backfill failed:', err as Error);
    });
  }, deps.bootDelayMs ?? BOOT_DELAY_MS);
  timer.unref();
}

async function run(deps: BackfillDeps, marker: string): Promise<void> {
  const { db, diffAnnotationService } = deps;
  const selectBatch = db.db.prepare(
    `SELECT id, timestamp, filepath, diff
     FROM events
     WHERE diff IS NOT NULL
       AND id > ?
       AND id NOT IN (SELECT DISTINCT event_id FROM diff_annotations)
     ORDER BY id
     LIMIT ?`
  );

  let lastId = 0;
  let scanned = 0;
  let flagged = 0;
  const started = Date.now();

  for (;;) {
    const rows = selectBatch.all(lastId, BATCH_SIZE) as Array<{
      id: number;
      timestamp: string;
      filepath: string;
      diff: string;
    }>;
    if (rows.length === 0) break;

    for (const row of rows) {
      try {
        const found = diffAnnotationService.annotate({
          event_id: row.id,
          filepath: row.filepath,
          diff: row.diff,
          timestamp: row.timestamp
        });
        if (found.length > 0) flagged++;
      } catch {
        // One bad diff must not sink the sweep.
      }
    }

    scanned += rows.length;
    lastId = rows[rows.length - 1].id;
    // Yield so live ingest and requests interleave between batches.
    await new Promise(resolve => setImmediate(resolve));
  }

  try {
    writeFileSync(marker, new Date().toISOString());
  } catch (err) {
    logger.error('❌ Could not write backfill marker:', err as Error);
  }
  logger.info(
    `🔎 Diff annotation backfill: ${scanned} historical diffs scanned, ` +
      `${flagged} flagged, in ${Math.round((Date.now() - started) / 1000)}s`
  );
}
