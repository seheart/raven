#!/usr/bin/env node

/**
 * Raven Monitor — Zero-config launcher.
 *
 * Usage:
 *   npx raven-monitor                    # one-shot
 *   npm i -g raven-monitor && raven-monitor
 *
 * Single-port mode: backend serves the built frontend statically. Data lives
 * under ~/.raven (or $RAVEN_DIR) so it persists across project switches. The
 * directory you invoked from is what Raven watches by default.
 */

import { spawn, execSync } from 'child_process';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { networkInterfaces } from 'os';
import { pipeline } from 'stream/promises';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const BACKEND_DIST = join(ROOT, 'backend', 'dist');
const FRONTEND_DIST = join(ROOT, 'frontend', 'dist');
const SERVER_ENTRY = join(BACKEND_DIST, 'server.js');

function log(msg) {
  console.log(`\x1b[36m[raven]\x1b[0m ${msg}`);
}
function fail(msg) {
  console.error(`\x1b[31m[raven]\x1b[0m ${msg}`);
  process.exit(1);
}

// --- Sub-commands (must run BEFORE the build / launch fallback below so the
// CLI works without a built frontend) ---

// `raven-monitor --export <format>` — pipe an export from a running Raven
// instance to stdout. Format defaults to "sqlite". The local server must
// already be running (we don't auto-start it because the user wants binary
// bytes on stdout, not a long-lived listener).
const args = process.argv.slice(2);
const exportIdx = args.indexOf('--export');
if (exportIdx !== -1) {
  const format = args[exportIdx + 1] && !args[exportIdx + 1].startsWith('-')
    ? args[exportIdx + 1]
    : 'sqlite';
  const port = process.env.PORT || '9100';
  const url = `http://localhost:${port}/api/export?format=${encodeURIComponent(format)}`;
  try {
    const res = await fetch(url);
    if (!res.ok) {
      const body = await res.text();
      console.error(`\x1b[31m[raven]\x1b[0m export failed (${res.status}): ${body}`);
      process.exit(1);
    }
    if (!res.body) {
      console.error(`\x1b[31m[raven]\x1b[0m export failed: empty body`);
      process.exit(1);
    }
    // Pipe Web ReadableStream → stdout via Node interop.
    await pipeline(res.body, process.stdout);
    process.exit(0);
  } catch (err) {
    console.error(
      `\x1b[31m[raven]\x1b[0m export failed: ${err.message}\n` +
        `       Is Raven running on port ${port}? Start it with \`raven-monitor\`.`
    );
    process.exit(1);
  }
}

// In a published package these dirs are guaranteed to exist (prepublishOnly
// builds them). In a dev checkout they only exist after `npm run build:all`.
if (!existsSync(SERVER_ENTRY) || !existsSync(FRONTEND_DIST)) {
  if (existsSync(join(ROOT, 'backend', 'package.json'))) {
    log('Build artifacts missing — running build:all...');
    try {
      execSync('npm run build:all', { cwd: ROOT, stdio: 'inherit' });
    } catch {
      fail('Build failed. Run `npm install && npm run build:all` and try again.');
    }
  } else {
    fail(`Missing ${SERVER_ENTRY} or ${FRONTEND_DIST}. Reinstall raven-monitor.`);
  }
}

const nets = networkInterfaces();
let lanIp = 'localhost';
for (const ifaces of Object.values(nets)) {
  for (const iface of ifaces || []) {
    if (iface.family === 'IPv4' && !iface.internal) {
      lanIp = iface.address;
      break;
    }
  }
}

const PORT = process.env.PORT || '9100';

log('Starting Raven...');
console.log('');
console.log(`  Local:   http://localhost:${PORT}`);
console.log(`  LAN:     http://${lanIp}:${PORT}`);
console.log(`  Watching: ${process.cwd()}`);
console.log('');

const server = spawn('node', [SERVER_ENTRY], {
  cwd: process.cwd(),
  stdio: 'inherit',
  env: { ...process.env, PORT, NODE_ENV: 'production' }
});

server.on('close', code => process.exit(code || 0));
process.on('SIGINT', () => server.kill('SIGINT'));
process.on('SIGTERM', () => server.kill('SIGTERM'));
