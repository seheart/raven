#!/usr/bin/env node

/**
 * Raven Monitor — Zero-config launcher
 *
 * Usage: npx raven-monitor
 *
 * Builds frontend + backend if needed, then starts the server
 * with the frontend served statically from the backend (single port).
 */

import { execSync, spawn } from 'child_process';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { networkInterfaces } from 'os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const BACKEND = join(ROOT, 'backend');
const FRONTEND = join(ROOT, 'frontend');

function log(msg) {
  console.log(`\x1b[36m[raven]\x1b[0m ${msg}`);
}

function run(cmd, cwd) {
  log(`Running: ${cmd}`);
  execSync(cmd, { cwd, stdio: 'inherit' });
}

// Install dependencies if needed
if (!existsSync(join(BACKEND, 'node_modules'))) {
  log('Installing backend dependencies...');
  run('npm install', BACKEND);
}
if (!existsSync(join(FRONTEND, 'node_modules'))) {
  log('Installing frontend dependencies...');
  run('npm install', FRONTEND);
}

// Build backend if needed
if (!existsSync(join(BACKEND, 'dist'))) {
  log('Building backend...');
  run('npm run build', BACKEND);
}

// Build frontend if needed
if (!existsSync(join(FRONTEND, 'dist'))) {
  log('Building frontend...');
  run('npm run build', FRONTEND);
}

// Get LAN IP
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
console.log('');

// Start the backend (which serves the frontend statically)
const server = spawn('node', [join(BACKEND, 'dist', 'server.js')], {
  cwd: ROOT,
  stdio: 'inherit',
  env: { ...process.env, PORT, NODE_ENV: 'production' }
});

server.on('close', code => process.exit(code || 0));

// Graceful shutdown
process.on('SIGINT', () => {
  server.kill('SIGINT');
});
process.on('SIGTERM', () => {
  server.kill('SIGTERM');
});
