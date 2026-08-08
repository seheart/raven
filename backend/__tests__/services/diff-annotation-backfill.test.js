/**
 * Tests for the one-shot diff-annotation backfill.
 *
 * The write path (event-bus-bindings) annotates new events; this job covers
 * the historical rows recorded before that path existed. The contract under
 * test: rows with diffs get scored, already-annotated rows are skipped, a
 * marker file makes the whole job a no-op on the next boot.
 */

import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { existsSync, readFileSync } from 'fs';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { RavenDB } from '../../dist/db.js';
import { createFileEventsRepository } from '../../dist/repositories/file-events-repository.js';
import { createDiffAnnotationsRepository } from '../../dist/repositories/diff-annotations-repository.js';
import { createDiffAnnotationService } from '../../dist/services/diff-annotation-service.js';

// The service delays via setTimeout; tests drive the internals directly by
// importing the module and calling through a zero-delay wrapper.
import { startDiffAnnotationBackfill } from '../../dist/services/diff-annotation-backfill.js';

const RISKY_DIFF = [
  '@@ -1,2 +1,3 @@',
  ' const a = 1;',
  `+const password = "hunter2-topsecret";`
].join('\n');
const BORING_DIFF = ['@@ -1,2 +1,2 @@', ' const a = 1;', '+const b = 2;'].join('\n');

let db;
let tmpDir;
let fileEventsRepo;
let annotationsRepo;
let annotationService;

function insertEvent(filepath, diff) {
  return fileEventsRepo.insert(
    new Date().toISOString(),
    filepath,
    'change',
    diff,
    0,
    0,
    'session-test',
    null,
    diff ? diff.length : null,
    'proj',
    null
  );
}

async function waitForMarker(marker, timeoutMs = 20000) {
  const start = Date.now();
  while (!existsSync(marker)) {
    if (Date.now() - start > timeoutMs) throw new Error('backfill marker never appeared');
    await new Promise(r => setTimeout(r, 50));
  }
}

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'raven-backfill-test-'));
  db = new RavenDB(join(tmpDir, 'test.db'));
  fileEventsRepo = createFileEventsRepository(db);
  annotationsRepo = createDiffAnnotationsRepository(db);
  annotationService = createDiffAnnotationService(annotationsRepo);
});

afterEach(() => {
  if (db) db.close();
  if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
});

describe('diff-annotation backfill', () => {
  test('scores historical diffs and writes the marker', async () => {
    const riskyId = insertEvent('proj/src/auth.js', RISKY_DIFF);
    const boringId = insertEvent('proj/src/math.js', BORING_DIFF);
    insertEvent('proj/src/no-diff.js', null);

    startDiffAnnotationBackfill({
      db,
      diffAnnotationService: annotationService,
      ravenDir: tmpDir,
      bootDelayMs: 10
    });
    const marker = join(tmpDir, 'diff-annotations-backfilled.marker');
    await waitForMarker(marker);

    const risky = annotationsRepo.byEventId(riskyId);
    expect(risky.length).toBeGreaterThan(0);
    expect(risky.some(a => a.rule_id === 'hardcoded-password')).toBe(true);
    expect(annotationsRepo.byEventId(boringId)).toHaveLength(0);
    expect(readFileSync(marker, 'utf8').length).toBeGreaterThan(0);
  }, 30000);

  test('skips rows that already have annotations (no duplicates)', async () => {
    const id = insertEvent('proj/src/auth.js', RISKY_DIFF);
    annotationService.annotate({
      event_id: id,
      filepath: 'proj/src/auth.js',
      diff: RISKY_DIFF
    });
    const before = annotationsRepo.byEventId(id).length;
    expect(before).toBeGreaterThan(0);

    startDiffAnnotationBackfill({
      db,
      diffAnnotationService: annotationService,
      ravenDir: tmpDir,
      bootDelayMs: 10
    });
    await waitForMarker(join(tmpDir, 'diff-annotations-backfilled.marker'));

    expect(annotationsRepo.byEventId(id)).toHaveLength(before);
  }, 30000);

  test('is a no-op when the marker already exists', async () => {
    const marker = join(tmpDir, 'diff-annotations-backfilled.marker');
    const { writeFileSync } = await import('fs');
    writeFileSync(marker, 'done');
    const id = insertEvent('proj/src/auth.js', RISKY_DIFF);

    startDiffAnnotationBackfill({
      db,
      diffAnnotationService: annotationService,
      ravenDir: tmpDir,
      bootDelayMs: 10
    });
    // Give it longer than the batch yield would take; nothing should happen.
    await new Promise(r => setTimeout(r, 300));
    expect(annotationsRepo.byEventId(id)).toHaveLength(0);
  });
});
