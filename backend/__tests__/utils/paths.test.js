/**
 * Tests for path resolution utilities.
 *
 * These are deliberately light-touch — paths.ts is small but it gates every
 * "where does my data live?" decision Raven makes at boot, so when a contributor
 * tweaks it we want a fast regression net.
 *
 * macOS angle: /tmp is a symlink to /private/tmp on macOS. Several of our
 * checks compare path strings, so we make sure those strings match the
 * canonical form that comes out of Node's `path` module — i.e. no surprise
 * /private/ prefix sneaks in via realpath.
 *
 * NOTE: paths.ts memoizes `resolveRavenPaths()` per module load. We rely on
 * `jest.resetModules()` + dynamic `import()` between cases to get a fresh
 * binding (and therefore fresh cwd / env behaviour).
 */

import { jest } from '@jest/globals';
import { mkdtempSync, rmSync, mkdirSync } from 'fs';
import { tmpdir } from 'os';
import { join, sep, parse, normalize } from 'path';

// Single source of truth for the dist path — the test imports the compiled
// `paths.js` because the rest of the test suite does too (see
// __tests__/services/*.test.js). Keeps Jest happy without a TS transformer.
const PATHS_MODULE = '../../dist/utils/paths.js';

async function freshPathsModule() {
  // jest.resetModules() clears the module registry so the next dynamic import
  // returns a new binding with `cached = null` again.
  jest.resetModules();
  return await import(`${PATHS_MODULE}?cb=${Math.random()}`);
}

describe('paths utility', () => {
  const origCwd = process.cwd();
  const origEnv = { ...process.env };
  let tmpRoot;

  beforeEach(() => {
    tmpRoot = mkdtempSync(join(tmpdir(), 'raven-paths-test-'));
    delete process.env.RAVEN_DIR;
    delete process.env.WATCH_PATH;
  });

  afterEach(() => {
    try {
      process.chdir(origCwd);
    } catch {
      /* cwd may have been the rmSync target */
    }
    if (tmpRoot) {
      rmSync(tmpRoot, { recursive: true, force: true });
    }
    process.env = { ...origEnv };
  });

  describe('symlinked /tmp consistency (macOS angle)', () => {
    test('resolveRavenPaths() uses the cwd string as-given without re-resolving symlinks', async () => {
      // The function does NOT call fs.realpath on cwd — it just splits the
      // string. That's the contract we want to lock in: macOS' /tmp ->
      // /private/tmp symlink would otherwise turn one user-visible path
      // into a different stored one, which has historically caused project
      // attribution to misfire.
      process.chdir(tmpRoot);
      const { resolveRavenPaths } = await freshPathsModule();
      const result = resolveRavenPaths();

      // tmpRoot lives under tmpdir() which on Linux is /tmp/... and on
      // macOS is /var/folders/... (NOT the symlinked /tmp). Either way the
      // function should hand back something that starts with our prefix or
      // its parent dir — we're verifying it didn't silently rewrite to a
      // different filesystem mount.
      expect(result.repoRoot.startsWith(tmpRoot) || tmpRoot.startsWith(result.repoRoot)).toBe(true);
      expect(result.mode).toBe('installed');
    });
  });

  describe('path-traversal protection sanity', () => {
    test('Node path.normalize collapses `..` segments without throwing', () => {
      // paths.ts itself doesn't accept untrusted input — it reads process.cwd()
      // and env vars only. But several callers pass user-supplied paths down
      // to fs APIs, so we sanity-check that the Node primitive we'd want to
      // reach for (path.normalize) behaves the way the rest of the code base
      // assumes: traversal segments collapse, they don't escape the prefix
      // unless explicitly written.
      expect(normalize('/foo/bar/../baz')).toBe('/foo/baz');
      expect(normalize('foo/bar/../../baz')).toBe('baz');
      expect(normalize('foo/./bar')).toBe(`foo${sep}bar`);
    });

    test('backslash paths normalize predictably on this platform', () => {
      // Windows isn't a supported target, but we still want this to NOT throw
      // — a Windows-shaped path showing up in a log on a Unix host should be
      // handled as opaque data, not a crash.
      expect(() => normalize('foo\\bar\\..\\baz')).not.toThrow();
      // On POSIX, backslashes are just characters in a filename — they don't
      // get treated as separators, so `..` won't collapse anything.
      const out = normalize('foo\\bar\\..\\baz');
      expect(typeof out).toBe('string');
      expect(out.length).toBeGreaterThan(0);
    });

    test('an absolute path containing `..` collapses to a safe canonical form', () => {
      // Probe: a malicious-looking path can be reduced to something inside its
      // intended root.
      const inside = normalize('/safe/root/sub/../file');
      expect(inside).toBe('/safe/root/file');
    });
  });

  describe('findRepoRoot walker stops at filesystem root', () => {
    test('a cwd with no .raven up the tree resolves to installed mode', async () => {
      // Pick a directory we KNOW has no .raven dir at any ancestor. Using a
      // freshly-created tmp dir guarantees we walk all the way to "/" without
      // a false positive. If the walker had an off-by-one, it would loop
      // forever (or stack-overflow on dirname(dirname(...))).
      const deep = join(tmpRoot, 'a', 'b', 'c');
      mkdirSync(deep, { recursive: true });
      process.chdir(deep);
      const { resolveRavenPaths } = await freshPathsModule();

      // The walker should return null, and resolveRavenPaths should choose
      // installed mode (no repo root found).
      const result = resolveRavenPaths();
      expect(result.mode).toBe('installed');
      // In installed mode, watchPath defaults to cwd and repoRoot mirrors cwd.
      expect(result.watchPath).toBe(deep);
      expect(result.repoRoot).toBe(deep);
    });

    test('parsing the filesystem root produces a stable parent (no infinite loop)', async () => {
      // The walker termination condition is `dirname(dir) === dir`. Verify
      // that the standard library actually has this property on this platform,
      // otherwise the walker has a latent infinite loop.
      const root = parse(process.cwd()).root;
      expect(root.length).toBeGreaterThan(0);
      // dirname('/') === '/' on POSIX, dirname('C:\\') === 'C:\\' on Windows.
      const { dirname } = await import('path');
      expect(dirname(root)).toBe(root);
    });
  });

  describe('env override behavior', () => {
    test('RAVEN_DIR overrides the default location', async () => {
      process.chdir(tmpRoot);
      process.env.RAVEN_DIR = '/custom/raven/dir';
      const { resolveRavenPaths } = await freshPathsModule();
      expect(resolveRavenPaths().ravenDir).toBe('/custom/raven/dir');
    });

    test('WATCH_PATH overrides the default watch directory', async () => {
      process.chdir(tmpRoot);
      process.env.WATCH_PATH = '/custom/watch/path';
      const { resolveRavenPaths } = await freshPathsModule();
      expect(resolveRavenPaths().watchPath).toBe('/custom/watch/path');
    });
  });
});
