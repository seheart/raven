/**
 * Raven Server - Modular TypeScript Integration Example
 *
 * This file demonstrates how to integrate the new TypeScript modules
 * into the existing server.js. It can run alongside or replace parts
 * of the current implementation.
 *
 * Usage: node server-modular-example.js
 */

import express from 'express';
import { logger } from 'utils/logger.js';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { join } from 'path';

// Import new TypeScript modules (compiled to dist/)
import {
  EventBus,
  FileWatcher,
  GitMonitor,
  telemetryCollector,
  getDiffStats
} from './dist/modules/index.js';

// Import existing modules
import { RavenDB } from './db.js';

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: 'http://localhost:9000',
    methods: ['GET', 'POST']
  }
});
const PORT = 9100;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Configuration
const RAVEN_DIR = join(process.cwd(), '..', '.raven');
const WATCH_PATH = join(process.cwd(), '..', 'test_workspace');
const DB_PATH = join(RAVEN_DIR, 'db', 'raven.db');

// Initialize database
const db = new RavenDB(DB_PATH);

// Generate session ID
import { randomUUID } from 'crypto';
const SESSION_ID = randomUUID();

// ==================== EventBus Listeners ====================

/**
 * Wire EventBus events to database and WebSocket
 */
EventBus.onFileEvent(async event => {
  try {
    // Insert into database
    const eventId = db.insertEvent(
      new Date().toISOString(),
      event.path,
      event.type,
      null, // diff will be calculated separately
      0,
      0,
      SESSION_ID,
      event.hash,
      event.size
    );

    logger.info(`📁 File ${event.type}: ${event.path} (ID: ${eventId})`);

    // Emit to WebSocket clients
    io.emit('file-changed', {
      id: eventId,
      timestamp: new Date(event.ts).toISOString(),
      filepath: event.path,
      change_type: event.type,
      event_size: event.size,
      file_hash: event.hash
    });

    // Trigger git status check if this is a code file
    if (event.path.match(/\.(js|ts|jsx|tsx|py|java|go|rs)$/)) {
      await gitMonitor.checkStatus();
    }
  } catch (error) {
    logger.error('❌ Error handling file event:', error);
  }
});

EventBus.onGitStatus(status => {
  logger.info(
    `🔀 Git status: ${status.branch} (${status.modified.length} modified, ${status.created.length} created)`
  );

  // Emit to WebSocket clients
  io.emit('git-status', status);
});

EventBus.onTelemetry(telemetry => {
  // Insert into database
  db.insertSystemMetrics(
    new Date(telemetry.ts).toISOString(),
    telemetry.cpu,
    telemetry.mem,
    0, // memUsedMB - calculated from percentage
    0, // memTotalMB
    telemetry.networkRx || 0,
    telemetry.networkTx || 0,
    SESSION_ID
  );

  // Emit to WebSocket clients
  io.emit('metrics-update', telemetry);
});

// ==================== REST API ====================

app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    session_id: SESSION_ID,
    uptime: process.uptime(),
    modules: {
      watcher: fileWatcher.isRunning(),
      git: gitMonitor.isRunning(),
      telemetry: telemetryCollector.isRunning()
    }
  });
});

app.get('/api/session-id', (req, res) => {
  res.json({ session_id: SESSION_ID });
});

app.get('/api/git/status', async (req, res) => {
  try {
    const status = await gitMonitor.checkStatus();
    res.json(status || gitMonitor.getLastStatus());
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/git/diff', async (req, res) => {
  try {
    const diff = await gitMonitor.getUncommittedDiff();
    res.json({ diff });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/file-events', (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;
    const events = db.getRecentFileEvents(limit, false);
    res.json(events);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== WebSocket ====================

io.on('connection', socket => {
  logger.info('🔌 WebSocket client connected:', socket.id);

  socket.on('disconnect', () => {
    logger.info('🔌 WebSocket client disconnected:', socket.id);
  });
});

// ==================== Initialize Services ====================

logger.info(`
╔════════════════════════════════════════════════╗
║     Raven Backend (Modular TypeScript)         ║
╠════════════════════════════════════════════════╣
║  Port:       ${PORT}                              ║
║  Session:    ${SESSION_ID}     ║
║  Watch Path: ${WATCH_PATH.slice(-30).padEnd(30)} ║
╚════════════════════════════════════════════════╝
`);

// Initialize FileWatcher
const fileWatcher = new FileWatcher({
  watchPath: WATCH_PATH,
  ignored: ['**/node_modules/**', '**/.git/**', '**/target/**', '**/.raven/**'],
  debounceMs: 50
});

// Initialize GitMonitor
const gitMonitor = new GitMonitor({
  repoPath: WATCH_PATH,
  pollIntervalMs: 5000,
  enableAutoPoll: false // Manual polling when files change
});

// Start services
httpServer.listen(PORT, async () => {
  logger.info('✅ HTTP server started');

  // Start file watcher
  fileWatcher.start();

  // Start git monitor (if it's a git repo)
  const isRepo = await gitMonitor.isGitRepo();
  if (isRepo) {
    await gitMonitor.start();
  } else {
    logger.info('⚠️  Not a git repository, skipping git monitor');
  }

  // Start telemetry
  telemetryCollector.start();

  logger.info('🚀 All services started successfully');
});

// Graceful shutdown
process.on('SIGINT', async () => {
  logger.info('\n🛑 Shutting down Raven backend...');

  await fileWatcher.stop();
  gitMonitor.stop();
  telemetryCollector.stop();
  db.close();

  process.exit(0);
});
