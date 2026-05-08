import { existsSync } from 'fs';
import { homedir } from 'os';
import { basename, dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';

export interface RavenPaths {
  ravenDir: string;
  watchPath: string;
  projectName: string;
  repoRoot: string;
  packageRoot: string;
  mode: 'dev' | 'installed';
}

let cached: RavenPaths | null = null;

/**
 * Resolve where Raven stores data, what it watches, and what to call the project.
 *
 * Dev mode: invoked from inside the Raven repo (start.sh cd's into backend/).
 *   We detect this by walking up from cwd looking for a `.raven/` directory.
 *
 * Installed mode: invoked via `npx raven-monitor` or `raven-monitor` after a
 *   global install. cwd is the user's project directory; data lives under
 *   ~/.raven so it persists across project switches.
 *
 * Env overrides (RAVEN_DIR, WATCH_PATH) win in either mode. Result is memoized
 * so all callsites see the same answer for a given process.
 */
export function resolveRavenPaths(): RavenPaths {
  if (cached) return cached;
  cached = doResolveRavenPaths();
  return cached;
}

function doResolveRavenPaths(): RavenPaths {
  const cwd = process.cwd();
  const repoRoot = findRepoRoot(cwd);
  const mode: 'dev' | 'installed' = repoRoot ? 'dev' : 'installed';

  const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

  const ravenDir =
    process.env.RAVEN_DIR ||
    (mode === 'dev' ? join(repoRoot!, '.raven') : join(homedir(), '.raven'));

  // Dev mode preserves historical behavior: watch the parent of the repo so
  // file events keep their `<repo-name>/...` prefix and existing rows in the
  // DB remain consistent with new events. Installed mode watches cwd directly.
  const watchPath = process.env.WATCH_PATH || (mode === 'dev' ? dirname(repoRoot!) : cwd);

  // Project name in dev = repo dir; in installed mode = cwd basename.
  const projectName = mode === 'dev' ? basename(repoRoot!) : basename(cwd);

  return { ravenDir, watchPath, projectName, repoRoot: repoRoot || cwd, packageRoot, mode };
}

function findRepoRoot(start: string): string | null {
  let dir = start;
  while (true) {
    if (existsSync(join(dir, '.raven'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}
