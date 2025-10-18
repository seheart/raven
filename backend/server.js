import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { RavenDB } from './db.js';
import { MetricsCollector } from './metrics-collector.js';
import { TriggerEngine } from './trigger-engine.js';
import { randomUUID } from 'crypto';
import { join, relative } from 'path';
import chokidar from 'chokidar';
import fs from 'fs';
import { createHash } from 'crypto';
import * as Diff from 'diff';

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: 'http://localhost:5173',
    methods: ['GET', 'POST'],
    credentials: true
  },
  allowEIO3: true,
  transports: ['websocket', 'polling']
});
const PORT = 3030;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' })); // Allow large telemetry payloads

// Initialize database (use parent directory since we're in backend/)
const DB_PATH = join(process.cwd(), '..', '.raven', 'db', 'raven.db');
const RAVEN_DIR = join(process.cwd(), '..', '.raven');
const WATCH_PATH = join(process.cwd(), '..', 'test_workspace');
const SNAPSHOTS_DIR = join(RAVEN_DIR, 'snapshots');
const db = new RavenDB(DB_PATH);

// Session ID (generated once per server start)
const SESSION_ID = randomUUID();

// File cache for tracking previous states (for diff generation)
const fileCache = new Map();

// Initialize metrics collector (io will be set later after it's created)
let metricsCollector;

// Initialize trigger engine (io will be set later)
let triggerEngine;

// In-memory agent registry
const agentRegistry = new Map();

// Agent type color mapping
const AGENT_COLORS = {
  claude: '#FF6B35',
  gpt: '#10A37F',
  gemini: '#4285F4',
  ollama: '#F39C12',
  default: '#6b7280'
};

function getAgentColor(agentName) {
  const lowerName = agentName.toLowerCase();
  for (const [key, color] of Object.entries(AGENT_COLORS)) {
    if (lowerName.includes(key)) return color;
  }
  return AGENT_COLORS.default;
}

// ==================== File Watching Helper Functions ====================

function calculateFileHash(content) {
  return createHash('sha256').update(content).digest('hex');
}

function generateDiff(oldContent, newContent) {
  const diff = Diff.createPatch('file', oldContent, newContent, '', '');
  return diff;
}

async function saveSnapshot(filepath, content) {
  try {
    // Create snapshot filename: filepath_timestamp.ext
    const timestamp = Date.now();
    const relPath = relative(WATCH_PATH, filepath);
    const snapshotName = `${relPath.replace(/\//g, '_')}_${timestamp}`;
    const snapshotPath = join(SNAPSHOTS_DIR, snapshotName);

    // Ensure snapshots directory exists
    await fs.promises.mkdir(SNAPSHOTS_DIR, { recursive: true });

    // Save snapshot
    await fs.promises.writeFile(snapshotPath, content, 'utf8');

    console.log(`💾 Snapshot saved: ${snapshotName}`);
    return snapshotPath;
  } catch (error) {
    console.error('❌ Snapshot save error:', error);
    return null;
  }
}

async function handleFileChange(eventType, filepath) {
  try {
    const relPath = relative(WATCH_PATH, filepath);
    const timestamp = new Date().toISOString();

    let diff = null;
    let fileHash = null;
    let eventSize = 0;
    let content = '';

    // Read file content for 'add' and 'change' events
    if (eventType === 'add' || eventType === 'change') {
      try {
        content = await fs.promises.readFile(filepath, 'utf8');
        eventSize = content.length;
        fileHash = calculateFileHash(content);

        // Generate diff for 'change' events
        if (eventType === 'change' && fileCache.has(filepath)) {
          const oldContent = fileCache.get(filepath);
          diff = generateDiff(oldContent, content);
        }

        // Save snapshot
        await saveSnapshot(filepath, content);

        // Update cache
        fileCache.set(filepath, content);
      } catch (readError) {
        console.error(`❌ Error reading file ${relPath}:`, readError.message);
        return;
      }
    } else if (eventType === 'unlink') {
      // File deleted - remove from cache
      fileCache.delete(filepath);
    }

    // Get system metrics
    const si = await import('systeminformation');
    const cpuLoad = await si.currentLoad();
    const memInfo = await si.mem();
    const cpuPercent = cpuLoad.currentLoad || 0;
    const memPercent = (memInfo.used / memInfo.total) * 100;

    // Insert event into database
    const eventId = db.insertEvent(
      timestamp,
      relPath,
      eventType,
      diff,
      cpuPercent,
      memPercent,
      SESSION_ID,
      fileHash,
      eventSize
    );

    console.log(`📁 File ${eventType}: ${relPath} (${eventSize} bytes)`);

    // Emit real-time event via WebSocket
    io.emit('file-changed', {
      id: eventId,
      timestamp,
      filepath: relPath,
      change_type: eventType,
      event_size: eventSize,
      file_hash: fileHash
    });

    // Check if this event triggers any alerts
    const triggerEvent = {
      file: relPath,
      lines_changed: diff ? diff.split('\n').length : 0,
      event_type: eventType,
      cpu_percent: cpuPercent,
      memory_percent: memPercent,
      event_size: eventSize
    };
    triggerEngine.evaluate(triggerEvent);
  } catch (error) {
    console.error('❌ File change handler error:', error);
  }
}

// ==================== Telemetry Endpoint ====================

app.post('/telemetry', (req, res) => {
  try {
    const { agent, event, file, lines_changed, duration_ms, message, metadata } = req.body;

    // Validate required fields
    if (!agent || !event || !message) {
      return res.status(400).json({ error: 'Missing required fields: agent, event, message' });
    }

    const timestamp = new Date().toISOString();

    // Insert into database
    const eventId = db.insertAgentEvent(
      timestamp,
      agent,
      event,
      file,
      lines_changed,
      duration_ms,
      message,
      metadata,
      SESSION_ID
    );

    // Update agent registry
    if (!agentRegistry.has(agent)) {
      agentRegistry.set(agent, {
        agent_name: agent,
        agent_type: agent, // Simplified - could parse this better
        is_running: true,
        last_seen: timestamp,
        models_available: [],
        requests_handled: 0,
        errors: 0,
        color: getAgentColor(agent)
      });
    }

    const agentStatus = agentRegistry.get(agent);
    agentStatus.last_seen = timestamp;
    agentStatus.requests_handled++;
    agentStatus.is_running = true;

    // Evaluate triggers
    const triggerEvent = {
      file: file,
      agent: agent,
      event_type: event,
      lines_changed: lines_changed,
      duration_ms: duration_ms
    };
    triggerEngine.evaluate(triggerEvent);

    console.log(`📡 Telemetry: ${agent} - ${event} - ${message}`);

    // Emit real-time event via WebSocket
    io.emit('agent-event', {
      id: eventId,
      timestamp,
      agent,
      event_type: event,
      file,
      lines_changed,
      duration_ms,
      message,
      metadata
    });

    // Emit updated agent stats
    io.emit('agent-stats', db.getAgentStats());

    res.json({
      success: true,
      event_id: eventId,
      session_id: SESSION_ID
    });
  } catch (error) {
    console.error('❌ Telemetry error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ==================== Dashboard API ====================

app.get('/api/session-id', (req, res) => {
  res.json({ session_id: SESSION_ID });
});

app.get('/api/dashboard-stats', (req, res) => {
  try {
    const stats = db.getDashboardStats(SESSION_ID);
    stats.total_agents = agentRegistry.size;
    res.json(stats);
  } catch (error) {
    console.error('❌ Dashboard stats error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/top-modified-files', (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const files = db.getTopModifiedFiles(SESSION_ID, limit);
    res.json(files);
  } catch (error) {
    console.error('❌ Top files error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/longest-edits', (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const edits = db.getLongestEdits(limit);
    res.json(edits);
  } catch (error) {
    console.error('❌ Longest edits error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/agents-status', (req, res) => {
  try {
    const now = new Date();
    const agents = Array.from(agentRegistry.values()).map(agent => {
      // Mark agent as not running if last seen > 30 seconds ago
      const lastSeen = new Date(agent.last_seen);
      const secondsSinceLastSeen = (now - lastSeen) / 1000;

      return {
        ...agent,
        is_running: secondsSinceLastSeen < 30
      };
    });

    res.json(agents);
  } catch (error) {
    console.error('❌ Agents status error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ==================== Agent Events API ====================

app.get('/api/agent-events', (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;
    const events = db.getRecentAgentEvents(limit);
    res.json(events);
  } catch (error) {
    console.error('❌ Agent events error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/events-by-agent/:agent', (req, res) => {
  try {
    const { agent } = req.params;
    const limit = parseInt(req.query.limit) || 100;
    const events = db.getEventsByAgent(agent, limit);
    res.json(events);
  } catch (error) {
    console.error('❌ Events by agent error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/agent-stats', (req, res) => {
  try {
    const stats = db.getAgentStats();
    res.json(stats);
  } catch (error) {
    console.error('❌ Agent stats error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ==================== System Metrics API ====================

app.get('/api/system-metrics', (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;
    const metrics = db.getRecentSystemMetrics(limit);
    res.json(metrics);
  } catch (error) {
    console.error('❌ System metrics error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/process-metrics/:agent', (req, res) => {
  try {
    const { agent } = req.params;
    const limit = parseInt(req.query.limit) || 100;
    const metrics = db.getProcessMetricsByAgent(agent, limit);
    res.json(metrics);
  } catch (error) {
    console.error('❌ Process metrics error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/metrics-stats', (req, res) => {
  try {
    // Default to last 24 hours if not specified
    const now = Date.now();
    const dayAgo = now - 24 * 60 * 60 * 1000;

    const start_time = req.query.start_time || new Date(dayAgo).toISOString();
    const end_time = req.query.end_time || new Date(now).toISOString();

    const stats = db.getMetricsStats(start_time, end_time);
    res.json(stats);
  } catch (error) {
    console.error('❌ Metrics stats error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/performance-correlations', (req, res) => {
  try {
    const time_window_seconds = parseInt(req.query.time_window_seconds) || 5;
    const correlations = db.correlateEventsWithMetrics(time_window_seconds);
    res.json(correlations);
  } catch (error) {
    console.error('❌ Performance correlations error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ==================== File Events API ====================

app.get('/api/tracked-files', (req, res) => {
  try {
    const files = db.getTrackedFiles();
    res.json(files);
  } catch (error) {
    console.error('❌ Tracked files error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/events-by-session/:sessionId', (req, res) => {
  try {
    const { sessionId } = req.params;
    const events = db.getEventsBySession(sessionId);
    res.json(events);
  } catch (error) {
    console.error('❌ Events by session error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get snapshots for a file
app.get('/api/snapshots/:filepath', async (req, res) => {
  try {
    const { filepath } = req.params;

    // List all snapshots for this file
    const files = await fs.promises.readdir(SNAPSHOTS_DIR);
    const filePattern = filepath.replace(/\//g, '_');
    const snapshots = files
      .filter(f => f.startsWith(filePattern))
      .map(f => {
        const timestamp = parseInt(f.split('_').pop());
        return {
          filename: f,
          timestamp: timestamp,
          date: new Date(timestamp).toISOString(),
          path: join(SNAPSHOTS_DIR, f)
        };
      })
      .sort((a, b) => b.timestamp - a.timestamp);

    res.json(snapshots);
  } catch (error) {
    console.error('❌ Snapshots error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Restore a file from snapshot
app.post('/api/restore', async (req, res) => {
  try {
    const { filepath, snapshot } = req.body;

    if (!filepath || !snapshot) {
      return res.status(400).json({ error: 'Missing filepath or snapshot' });
    }

    // Read snapshot content
    const snapshotPath = join(SNAPSHOTS_DIR, snapshot);
    const content = await fs.promises.readFile(snapshotPath, 'utf8');

    // Restore to original location
    const targetPath = join(WATCH_PATH, filepath);
    await fs.promises.writeFile(targetPath, content, 'utf8');

    console.log(`🔄 Restored ${filepath} from snapshot ${snapshot}`);

    res.json({
      success: true,
      message: `File ${filepath} restored from snapshot`,
      snapshot: snapshot
    });
  } catch (error) {
    console.error('❌ Restore error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get file events (from events table)
app.get('/api/file-events', (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;
    const includeDiff = req.query.diff === 'true';
    const events = db.getRecentFileEvents(limit, includeDiff);
    res.json(events);
  } catch (error) {
    console.error('❌ File events error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ==================== Custom Triggers API ====================

app.get('/api/triggers-config', (req, res) => {
  try {
    const triggers = triggerEngine.getTriggersConfig();
    res.json({ rules: triggers });
  } catch (error) {
    console.error('❌ Triggers config error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/triggered-events', (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;
    const events = triggerEngine.getTriggeredEvents(limit);
    res.json(events);
  } catch (error) {
    console.error('❌ Triggered events error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/trigger-stats', (req, res) => {
  try {
    const stats = triggerEngine.getTriggerStats();
    res.json(stats);
  } catch (error) {
    console.error('❌ Trigger stats error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/triggers-reload', (req, res) => {
  try {
    const message = triggerEngine.reloadConfig();
    res.json({ message });
  } catch (error) {
    console.error('❌ Triggers reload error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/triggers-clear-cooldowns', (req, res) => {
  try {
    const message = triggerEngine.clearCooldowns();
    res.json({ message });
  } catch (error) {
    console.error('❌ Clear cooldowns error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ==================== Health Check ====================

app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    session_id: SESSION_ID,
    uptime: process.uptime(),
    active_agents: agentRegistry.size,
    database: DB_PATH
  });
});

// ==================== WebSocket Connections ====================

io.on('connection', socket => {
  console.log('🔌 WebSocket client connected:', socket.id);

  socket.on('disconnect', () => {
    console.log('🔌 WebSocket client disconnected:', socket.id);
  });
});

// Export io for use in other modules
export { io };

// Start server
httpServer.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════════╗
║           🐦‍⬛ Raven Backend Server              ║
╠════════════════════════════════════════════════╣
║  Port:       ${PORT}                              ║
║  WebSocket:  ✅ Enabled                         ║
║  Session:    ${SESSION_ID}     ║
║  Database:   ${DB_PATH.slice(-30).padEnd(30)} ║
║  Status:     ✅ Ready to receive telemetry     ║
╚════════════════════════════════════════════════╝
  `);

  // Initialize trigger engine with io instance
  triggerEngine = new TriggerEngine(RAVEN_DIR, io);

  // Initialize metrics collector with io instance
  metricsCollector = new MetricsCollector(db, SESSION_ID, io);

  // Start real-time metrics collection
  metricsCollector.start();

  // Initialize file watcher
  console.log(`📁 Watching directory: ${WATCH_PATH}`);
  const watcher = chokidar.watch(WATCH_PATH, {
    ignored: [
      /(^|[\/\\])\../, // Ignore dotfiles
      '**/node_modules/**',
      '**/.git/**',
      '**/target/**',
      '**/.raven/**',
      '**/*.log',
      '**/dist/**',
      '**/.cache/**'
    ],
    persistent: true,
    ignoreInitial: true,
    awaitWriteFinish: {
      stabilityThreshold: 100,
      pollInterval: 50
    }
  });

  watcher
    .on('add', filepath => {
      console.log(`📄 File added: ${relative(WATCH_PATH, filepath)}`);
      handleFileChange('add', filepath);
    })
    .on('change', filepath => {
      console.log(`✏️  File changed: ${relative(WATCH_PATH, filepath)}`);
      handleFileChange('change', filepath);
    })
    .on('unlink', filepath => {
      console.log(`🗑️  File deleted: ${relative(WATCH_PATH, filepath)}`);
      handleFileChange('unlink', filepath);
    })
    .on('error', error => {
      console.error('❌ Watcher error:', error);
    })
    .on('ready', () => {
      console.log('✅ File watcher ready');
    });

  // Store watcher for cleanup
  global.fileWatcher = watcher;
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down Raven backend...');
  if (global.fileWatcher) {
    global.fileWatcher.close();
  }
  metricsCollector.stop();
  db.close();
  process.exit(0);
});
