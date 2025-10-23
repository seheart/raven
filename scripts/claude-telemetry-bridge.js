#!/usr/bin/env node

/**
 * Claude Code → Raven Telemetry Bridge
 *
 * This script monitors file changes and automatically sends telemetry
 * events to Raven, allowing Claude Code activity to appear in the Agents panel.
 *
 * Usage:
 *   node claude-telemetry-bridge.js [working-directory]
 *
 * The script runs in the background and sends telemetry for:
 * - File creates (add)
 * - File edits (change)
 * - File deletes (unlink)
 */

const fs = require('fs');
const path = require('path');
const http = require('http');

// Configuration
const RAVEN_API = 'http://localhost:3030';
const AGENT_NAME = 'claude-code';
const WATCH_DIR = process.argv[2] || process.cwd();
const PROJECT_NAME = path.basename(WATCH_DIR);

// Debounce to avoid duplicate events
const recentEvents = new Map();
const DEBOUNCE_MS = 1000;

// Track file sizes to detect edits vs creates
const fileSizes = new Map();

console.log(`🔗 Claude Code Telemetry Bridge starting...`);
console.log(`📂 Watching: ${WATCH_DIR}`);
console.log(`🎯 Target: ${RAVEN_API}/telemetry`);
console.log(`🤖 Agent: ${AGENT_NAME}`);
console.log('');

/**
 * Send telemetry event to Raven
 */
function sendTelemetry(eventType, filepath, linesChanged = null, message = null) {
  const relativePath = path.relative(WATCH_DIR, filepath);

  // Skip node_modules, .git, etc.
  if (relativePath.includes('node_modules') ||
      relativePath.includes('.git') ||
      relativePath.startsWith('.raven') ||
      relativePath.includes('dist/') ||
      relativePath.includes('build/')) {
    return;
  }

  // Debounce - skip if we just sent this event
  const eventKey = `${eventType}:${relativePath}`;
  const now = Date.now();
  const lastEvent = recentEvents.get(eventKey);

  if (lastEvent && (now - lastEvent) < DEBOUNCE_MS) {
    return;
  }

  recentEvents.set(eventKey, now);

  const payload = {
    agent: AGENT_NAME,
    event: eventType,
    message: message || `${eventType} ${relativePath}`,
    file: relativePath,
    project: PROJECT_NAME
  };

  if (linesChanged !== null) {
    payload.lines_changed = linesChanged;
  }

  const data = JSON.stringify(payload);

  const options = {
    hostname: 'localhost',
    port: 3030,
    path: '/telemetry',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': data.length
    }
  };

  const req = http.request(options, (res) => {
    if (res.statusCode === 200) {
      console.log(`✓ ${eventType.padEnd(6)} ${relativePath}`);
    } else {
      console.error(`✗ Failed to send telemetry (${res.statusCode}): ${relativePath}`);
    }
  });

  req.on('error', (error) => {
    // Silently ignore connection errors (Raven might not be running)
  });

  req.write(data);
  req.end();
}

/**
 * Estimate lines changed by comparing file sizes
 */
function estimateLinesChanged(filepath) {
  try {
    const stats = fs.statSync(filepath);
    const oldSize = fileSizes.get(filepath) || 0;
    const newSize = stats.size;

    fileSizes.set(filepath, newSize);

    // Rough estimate: 50 chars per line average
    const bytesChanged = Math.abs(newSize - oldSize);
    const linesChanged = Math.ceil(bytesChanged / 50);

    return Math.max(1, linesChanged);
  } catch (err) {
    return 1;
  }
}

/**
 * Watch directory for changes
 */
function watchDirectory(dir) {
  try {
    fs.watch(dir, { recursive: true }, (eventType, filename) => {
      if (!filename) return;

      const filepath = path.join(dir, filename);

      // Check if file exists
      fs.stat(filepath, (err, stats) => {
        if (err) {
          // File doesn't exist - it was deleted
          sendTelemetry('delete', filepath, null, `Deleted ${filename}`);
          fileSizes.delete(filepath);
        } else if (stats.isFile()) {
          const wasTracked = fileSizes.has(filepath);
          const linesChanged = estimateLinesChanged(filepath);

          if (wasTracked) {
            // File existed before - it's an edit
            sendTelemetry('edit', filepath, linesChanged, `Edited ${filename}`);
          } else {
            // New file - it's a create
            sendTelemetry('create', filepath, linesChanged, `Created ${filename}`);
          }
        }
      });
    });

    console.log('✓ File watcher started');
    console.log('✓ Telemetry bridge active\n');

    // Send session start event
    sendTelemetry('session-start', WATCH_DIR, null, `Claude Code session started in ${PROJECT_NAME}`);

    // Initialize file sizes for existing files
    initializeFileSizes(dir);

  } catch (error) {
    console.error('✗ Failed to start file watcher:', error.message);
    process.exit(1);
  }
}

/**
 * Initialize file sizes for existing files
 */
function initializeFileSizes(dir) {
  function scanDir(directory) {
    try {
      const entries = fs.readdirSync(directory, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(directory, entry.name);
        const relativePath = path.relative(WATCH_DIR, fullPath);

        // Skip ignored directories
        if (entry.name === 'node_modules' ||
            entry.name === '.git' ||
            entry.name === '.raven' ||
            entry.name === 'dist' ||
            entry.name === 'build') {
          continue;
        }

        if (entry.isDirectory()) {
          scanDir(fullPath);
        } else if (entry.isFile()) {
          try {
            const stats = fs.statSync(fullPath);
            fileSizes.set(fullPath, stats.size);
          } catch (err) {
            // Skip files we can't read
          }
        }
      }
    } catch (err) {
      // Skip directories we can't read
    }
  }

  scanDir(dir);
  console.log(`✓ Initialized tracking for ${fileSizes.size} existing files\n`);
}

/**
 * Cleanup on exit
 */
process.on('SIGINT', () => {
  console.log('\n\n🛑 Shutting down telemetry bridge...');
  sendTelemetry('session-end', WATCH_DIR, null, `Claude Code session ended in ${PROJECT_NAME}`);
  setTimeout(() => process.exit(0), 500);
});

process.on('SIGTERM', () => {
  sendTelemetry('session-end', WATCH_DIR, null, `Claude Code session ended in ${PROJECT_NAME}`);
  setTimeout(() => process.exit(0), 500);
});

// Start watching
watchDirectory(WATCH_DIR);

// Keep process alive
process.stdin.resume();
