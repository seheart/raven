import { existsSync, readFileSync } from 'fs';
import { homedir } from 'os';
import { basename, dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';

interface RavenPaths {
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

// Dev mode means "running from inside the Raven source repo" — nothing else.
// A bare `.raven/` directory is NOT enough: installed mode creates ~/.raven,
// and treating that as a repo root once made a second `npx raven-monitor` run
// from anywhere under $HOME watch the entire /home tree.
function findRepoRoot(start: string): string | null {
  const home = homedir();
  let dir = start;
  while (true) {
    if (dir === home) return null;
    if (isRavenSourceRepo(dir)) return dir;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

function isRavenSourceRepo(dir: string): boolean {
  const pkgPath = join(dir, 'package.json');
  if (!existsSync(pkgPath) || !existsSync(join(dir, 'backend'))) return false;
  try {
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
    return pkg.name === 'raven-monitor';
  } catch {
    return false;
  }
}
