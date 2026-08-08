/**
 * Root postinstall: in a source checkout, install backend/ and frontend/ deps
 * so `npm install && ./start.sh` works out of the box.
 *
 * In the published package this is a no-op — the tarball ships prebuilt
 * dist/ output and carries the backend's runtime deps at the root, and
 * frontend/package.json isn't shipped at all (that's the signal we key on).
 */
import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

if (process.env.RAVEN_SKIP_POSTINSTALL) process.exit(0);
if (!existsSync(join(root, 'frontend', 'package.json'))) process.exit(0);

for (const dir of ['backend', 'frontend']) {
  const cwd = join(root, dir);
  console.log(`[raven] installing ${dir}/ dependencies...`);
  execSync('npm install', { cwd, stdio: 'inherit', env: { ...process.env, RAVEN_SKIP_POSTINSTALL: '1' } });
}
