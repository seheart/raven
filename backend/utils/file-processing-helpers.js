/**
 * File-processing helpers for the watcher pipeline.
 *
 * Two responsibilities:
 *  1. Decide whether a path should have its diff captured at all
 *     (binary/lockfile/snapshot files would just bloat the events table).
 *  2. Cap diff size so a single huge change can't blow up storage.
 *
 * Other helpers in this file were removed as dead code; all current
 * callers (server.ts) only need shouldSkipDiff and capDiff.
 */

const BINARY_EXTENSIONS = [
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.ico',
  '.bmp',
  '.tiff',
  '.pdf',
  '.zip',
  '.tar',
  '.gz',
  '.bz2',
  '.7z',
  '.rar',
  '.woff',
  '.woff2',
  '.ttf',
  '.eot',
  '.otf',
  '.mp3',
  '.mp4',
  '.wav',
  '.ogg',
  '.webm',
  '.mov',
  '.avi',
  '.mkv',
  '.flac',
  '.exe',
  '.dll',
  '.so',
  '.dylib',
  '.bin',
  '.dat',
  '.class',
  '.o',
  '.a',
  '.pyc',
  '.pyo',
  '.wasm'
];

const MAX_DIFF_BYTES = 64 * 1024;

function isBinaryFile(filepath) {
  const ext = filepath.substring(filepath.lastIndexOf('.')).toLowerCase();
  return BINARY_EXTENSIONS.includes(ext);
}

/**
 * True if a path should never have its diff captured: binary by extension, or
 * a known auto-generated artifact (visual-regression PNGs, lockfiles).
 */
export function shouldSkipDiff(filepath) {
  if (isBinaryFile(filepath)) return true;
  if (filepath.includes('__diffs__/') || filepath.includes('__snapshots__/')) return true;
  const base = filepath.slice(filepath.lastIndexOf('/') + 1);
  return (
    base === 'package-lock.json' ||
    base === 'yarn.lock' ||
    base === 'pnpm-lock.yaml' ||
    base === 'poetry.lock' ||
    base === 'cargo.lock' ||
    base === 'uv.lock' ||
    base === 'composer.lock' ||
    base === 'Gemfile.lock' ||
    base === 'go.sum'
  );
}

/**
 * Cap a diff at MAX_DIFF_BYTES; longer diffs are truncated with a marker so
 * the events table can't be blown up by a single huge change.
 */
export function capDiff(diff) {
  if (!diff || diff.length <= MAX_DIFF_BYTES) return diff;
  return (
    diff.slice(0, MAX_DIFF_BYTES) +
    `\n... [truncated, ${diff.length - MAX_DIFF_BYTES} bytes omitted]`
  );
}
