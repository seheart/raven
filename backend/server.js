import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { RavenDB } from './db.js';
import { MetricsCollector } from './metrics-collector.js';
import { TriggerEngine } from './trigger-engine.js';
import { GitMonitor } from './dist/modules/git.js';
import { randomUUID } from 'crypto';
import { join, relative } from 'path';
import chokidar from 'chokidar';
import fs from 'fs';
import { createHash } from 'crypto';
import * as Diff from 'diff';
import toml from 'toml';

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

// Performance tracking
const performanceStats = {
  totalRequests: 0,
  successfulRequests: 0,
  failedRequests: 0,
  totalResponseTime: 0,
  requestStartTime: Date.now()
};

// Request tracking middleware
app.use((req, res, next) => {
  const startTime = Date.now();
  performanceStats.totalRequests++;

  res.on('finish', () => {
    const duration = Date.now() - startTime;
    performanceStats.totalResponseTime += duration;

    if (res.statusCode >= 200 && res.statusCode < 400) {
      performanceStats.successfulRequests++;
    } else {
      performanceStats.failedRequests++;
    }
  });

  next();
});

// ==================== Configuration Loading ====================

const RAVEN_DIR = join(process.cwd(), '..', '.raven');
const CONFIG_PATH = join(RAVEN_DIR, 'config.toml');

// Load configuration
let config;
try {
  const configContent = fs.readFileSync(CONFIG_PATH, 'utf8');
  config = toml.parse(configContent);
} catch (error) {
  console.error('❌ Failed to load config.toml:', error.message);
  process.exit(1);
}

// Global state for active project
const projectState = {
  activeProject: config.projects?.active || 'raven3',
  availableProjects: config.projects?.available || [],
  watchPath: null,
  dbPath: null,
  snapshotsDir: null,
  db: null,
  watcher: null,
  gitMonitor: null
};

// Session ID (generated once per server start)
const SESSION_ID = randomUUID();

// File cache for tracking previous states (for diff generation)
const fileCache = new Map();

// Watcher statistics
const watcherStats = {
  totalFilesWatched: 0,
  ignoredFiles: 0,
  errors: []
};

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
    const relPath = relative(projectState.watchPath, filepath);
    const snapshotName = `${relPath.replace(/\//g, '_')}_${timestamp}`;
    const snapshotPath = join(projectState.snapshotsDir, snapshotName);

    // Ensure snapshots directory exists
    await fs.promises.mkdir(projectState.snapshotsDir, { recursive: true });

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
    const relPath = relative(projectState.watchPath, filepath);
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
    const eventId = projectState.db.insertEvent(
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

// ==================== Project Management Functions ====================

/**
 * Initialize paths and database for a project
 */
function initializeProject(projectName) {
  const project = projectState.availableProjects.find(p => p.name === projectName);
  if (!project) {
    throw new Error(`Project "${projectName}" not found in config`);
  }

  // Set project paths
  projectState.activeProject = projectName;
  projectState.watchPath = join(process.cwd(), '..', project.path);
  projectState.dbPath = join(RAVEN_DIR, 'db', `${projectName}.db`);
  projectState.snapshotsDir = join(RAVEN_DIR, 'snapshots', projectName);

  // Initialize database
  if (projectState.db) {
    projectState.db.close();
  }
  projectState.db = new RavenDB(projectState.dbPath);

  // Ensure snapshots directory exists
  fs.mkdirSync(projectState.snapshotsDir, { recursive: true });

  // Initialize GitMonitor
  if (projectState.gitMonitor) {
    projectState.gitMonitor.stop();
  }
  projectState.gitMonitor = new GitMonitor({
    repoPath: projectState.watchPath,
    pollIntervalMs: 2000,
    enableAutoPoll: false // Manual polling only, no auto-commits
  });

  console.log(`✅ Initialized project: ${projectName}`);
  console.log(`   Watch Path: ${projectState.watchPath}`);
  console.log(`   Database: ${projectState.dbPath}`);
  console.log(`   Snapshots: ${projectState.snapshotsDir}`);
}

/**
 * Emit real-time git status update via WebSocket
 */
async function emitGitStatusUpdate() {
  if (!projectState.gitMonitor) {
    return;
  }

  try {
    const isRepo = await projectState.gitMonitor.isGitRepo();
    if (!isRepo) return;

    // Force a fresh status check by temporarily clearing lastStatus
    const previousStatus = projectState.gitMonitor.lastStatus;
    projectState.gitMonitor.lastStatus = null;

    const status = await projectState.gitMonitor.checkStatus();

    // Restore the previous status to avoid repeated emissions
    if (!status && previousStatus) {
      projectState.gitMonitor.lastStatus = previousStatus;
    }

    if (status) {
      io.emit('git-status-updated', {
        branch: status.branch,
        modified: status.modified,
        created: status.created,
        deleted: status.deleted,
        ahead: status.ahead || 0,
        behind: status.behind || 0,
        timestamp: new Date().toISOString()
      });
      console.log('🔀 Git status emitted via WebSocket');
    }
  } catch (error) {
    console.error('❌ Error emitting git status:', error);
  }
}

/**
 * Initialize file watcher for the current project
 */
function initializeWatcher() {
  const watcher = chokidar.watch(projectState.watchPath, {
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
      console.log(`📄 File added: ${relative(projectState.watchPath, filepath)}`);
      handleFileChange('add', filepath);
      emitGitStatusUpdate();
    })
    .on('change', filepath => {
      console.log(`✏️  File changed: ${relative(projectState.watchPath, filepath)}`);
      handleFileChange('change', filepath);
      emitGitStatusUpdate();
    })
    .on('unlink', filepath => {
      console.log(`🗑️  File deleted: ${relative(projectState.watchPath, filepath)}`);
      handleFileChange('unlink', filepath);
      emitGitStatusUpdate();
    })
    .on('error', error => {
      console.error('❌ Watcher error:', error);
    })
    .on('ready', () => {
      console.log('✅ File watcher ready');
    });

  return watcher;
}

/**
 * Switch to a different project
 */
async function switchProject(projectName) {
  console.log(`🔄 Switching to project: ${projectName}`);

  // Close existing watcher
  if (projectState.watcher) {
    await projectState.watcher.close();
    console.log('✅ Closed previous watcher');
  }

  // Clear file cache
  fileCache.clear();

  // Initialize new project
  initializeProject(projectName);

  // Update metrics collector database reference
  if (metricsCollector) {
    metricsCollector.db = projectState.db;
    console.log('✅ Updated metrics collector database reference');
  }

  // Initialize new watcher
  projectState.watcher = initializeWatcher();

  // Emit event to all connected clients
  io.emit('project-switched', {
    project: projectName,
    timestamp: new Date().toISOString()
  });

  console.log(`✅ Switched to project: ${projectName}`);
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
    const eventId = projectState.db.insertAgentEvent(
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
    io.emit('agent-stats', projectState.db.getAgentStats());

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
    const stats = projectState.db.getDashboardStats(SESSION_ID);
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
    const files = projectState.db.getTopModifiedFiles(SESSION_ID, limit);
    res.json(files);
  } catch (error) {
    console.error('❌ Top files error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/longest-edits', (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const edits = projectState.db.getLongestEdits(limit);
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
    const events = projectState.db.getRecentAgentEvents(limit);
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
    const events = projectState.db.getEventsByAgent(agent, limit);
    res.json(events);
  } catch (error) {
    console.error('❌ Events by agent error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/agent-stats', (req, res) => {
  try {
    const stats = projectState.db.getAgentStats();
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
    const metrics = projectState.db.getRecentSystemMetrics(limit);
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
    const metrics = projectState.db.getProcessMetricsByAgent(agent, limit);
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

    const stats = projectState.db.getMetricsStats(start_time, end_time);
    res.json(stats);
  } catch (error) {
    console.error('❌ Metrics stats error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/performance-correlations', (req, res) => {
  try {
    const time_window_seconds = parseInt(req.query.time_window_seconds) || 5;
    const correlations = projectState.db.correlateEventsWithMetrics(time_window_seconds);
    res.json(correlations);
  } catch (error) {
    console.error('❌ Performance correlations error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ==================== File Events API ====================

app.get('/api/tracked-files', (req, res) => {
  try {
    const files = projectState.db.getTrackedFiles();
    res.json(files);
  } catch (error) {
    console.error('❌ Tracked files error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/events-by-session/:sessionId', (req, res) => {
  try {
    const { sessionId } = req.params;
    const events = projectState.db.getEventsBySession(sessionId);
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
    const files = await fs.promises.readdir(projectState.snapshotsDir);
    const filePattern = filepath.replace(/\//g, '_');
    const snapshots = files
      .filter(f => f.startsWith(filePattern))
      .map(f => {
        const timestamp = parseInt(f.split('_').pop());
        return {
          filename: f,
          timestamp: timestamp,
          date: new Date(timestamp).toISOString(),
          path: join(projectState.snapshotsDir, f)
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
    const snapshotPath = join(projectState.snapshotsDir, snapshot);
    const content = await fs.promises.readFile(snapshotPath, 'utf8');

    // Restore to original location
    const targetPath = join(projectState.watchPath, filepath);
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
    const events = projectState.db.getRecentFileEvents(limit, includeDiff);
    res.json(events);
  } catch (error) {
    console.error('❌ File events error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get unified activity log
app.get('/api/activity-log', (req, res) => {
  try {
    const options = {
      limit: parseInt(req.query.limit) || 500,
      offset: parseInt(req.query.offset) || 0,
      search: req.query.search || '',
      eventType: req.query.type || 'all',
      startDate: req.query.startDate || null,
      endDate: req.query.endDate || null
    };

    const result = projectState.db.getActivityLog(options);
    res.json(result);
  } catch (error) {
    console.error('❌ Activity log error:', error);
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

app.get('/health', async (req, res) => {
  try {
    const si = await import('systeminformation');

    // Get memory usage (process)
    const memUsage = process.memoryUsage();

    // Get system-level metrics
    const cpuLoad = await si.currentLoad();
    const memInfo = await si.mem();
    const fsSize = await si.fsSize();
    const osInfo = await si.osInfo();

    // Get database file size
    let dbSize = 0;
    let dbStats = null;
    try {
      dbStats = fs.statSync(projectState.dbPath);
      dbSize = dbStats.size;
    } catch (error) {
      console.error('Error getting database size:', error);
    }

    // Get disk space for database partition
    let diskSpace = { total: 0, used: 0, available: 0, usePercent: 0 };
    if (fsSize && fsSize.length > 0) {
      // Find the filesystem where the database is located
      const dbFs = fsSize.find(fs => projectState.dbPath.startsWith(fs.mount)) || fsSize[0];
      diskSpace = {
        total: dbFs.size,
        used: dbFs.used,
        available: dbFs.available,
        usePercent: dbFs.use
      };
    }

    // Get watcher count (1 if active, 0 if not)
    const watcherCount = projectState.watcher ? 1 : 0;

    // Get cached files count
    const cachedFilesCount = fileCache.size;

    // Database analytics
    let dbAnalytics = {
      totalEvents: 0,
      recentEvents: 0,
      oldestEventDate: null,
      newestEventDate: null,
      eventBreakdown: {
        add: 0,
        change: 0,
        unlink: 0
      }
    };

    try {
      // Get all events for analytics
      const allEvents = projectState.db.getRecentFileEvents(999999, false);
      dbAnalytics.totalEvents = allEvents.length;
      dbAnalytics.recentEvents = Math.min(1000, allEvents.length);

      if (allEvents.length > 0) {
        dbAnalytics.oldestEventDate = allEvents[allEvents.length - 1].timestamp;
        dbAnalytics.newestEventDate = allEvents[0].timestamp;

        // Count event types
        allEvents.forEach(event => {
          if (event.change_type === 'add') dbAnalytics.eventBreakdown.add++;
          else if (event.change_type === 'change') dbAnalytics.eventBreakdown.change++;
          else if (event.change_type === 'unlink') dbAnalytics.eventBreakdown.unlink++;
        });
      }
    } catch (error) {
      console.error('Error getting database analytics:', error);
    }

    // Calculate database growth rate (bytes per hour)
    let dbGrowthRate = 0;
    if (dbStats && dbStats.birthtimeMs) {
      const ageInHours = (Date.now() - dbStats.birthtimeMs) / (1000 * 60 * 60);
      if (ageInHours > 0) {
        dbGrowthRate = dbSize / ageInHours;
      }
    }

    // Performance metrics
    const avgResponseTime = performanceStats.totalRequests > 0
      ? performanceStats.totalResponseTime / performanceStats.totalRequests
      : 0;

    const errorRate = performanceStats.totalRequests > 0
      ? (performanceStats.failedRequests / performanceStats.totalRequests) * 100
      : 0;

    const uptime = process.uptime();
    const eventsPerSecond = dbAnalytics.totalEvents > 0 && uptime > 0
      ? dbAnalytics.totalEvents / uptime
      : 0;

    // Watcher details
    const totalFilesTracked = projectState.db.getTrackedFiles().length;

    // Process info
    const processInfo = {
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
      pid: process.pid,
      cwd: process.cwd()
    };

    res.json({
      status: 'healthy',
      session_id: SESSION_ID,
      uptime: uptime,
      active_agents: agentRegistry.size,
      active_project: projectState.activeProject,
      database: projectState.dbPath,

      // Memory (process-level)
      memory: {
        heapUsed: memUsage.heapUsed,
        heapTotal: memUsage.heapTotal,
        rss: memUsage.rss,
        external: memUsage.external
      },

      // System-level metrics
      system: {
        cpuPercent: cpuLoad.currentLoad || 0,
        totalMemory: memInfo.total,
        usedMemory: memInfo.used,
        freeMemory: memInfo.free,
        memoryPercent: ((memInfo.used / memInfo.total) * 100) || 0,
        platform: osInfo.platform,
        distro: osInfo.distro,
        release: osInfo.release
      },

      // Storage
      storage: {
        databaseSize: dbSize,
        dbGrowthRate: dbGrowthRate,
        diskTotal: diskSpace.total,
        diskUsed: diskSpace.used,
        diskAvailable: diskSpace.available,
        diskUsePercent: diskSpace.usePercent
      },

      // Database analytics
      database_analytics: dbAnalytics,

      // Watchers
      watchers: {
        active: watcherCount,
        total: projectState.availableProjects.length,
        totalFilesTracked: totalFilesTracked,
        cachedFiles: cachedFilesCount,
        ignoredFiles: watcherStats.ignoredFiles,
        errors: watcherStats.errors.slice(-10) // Last 10 errors
      },

      // Performance
      performance: {
        totalRequests: performanceStats.totalRequests,
        successfulRequests: performanceStats.successfulRequests,
        failedRequests: performanceStats.failedRequests,
        avgResponseTime: avgResponseTime,
        errorRate: errorRate,
        eventsPerSecond: eventsPerSecond
      },

      // Process info
      process: processInfo
    });
  } catch (error) {
    console.error('Health check error:', error);
    res.status(500).json({
      status: 'error',
      error: error.message
    });
  }
});

// ==================== Control Actions ====================

app.post('/api/control/clear-cache', (req, res) => {
  try {
    const previousSize = fileCache.size;
    fileCache.clear();
    console.log(`🗑️  Cleared file cache (${previousSize} files)`);
    res.json({
      success: true,
      message: `Cleared ${previousSize} cached files`,
      previousSize
    });
  } catch (error) {
    console.error('Error clearing cache:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/database/clear-old/:days', (req, res) => {
  try {
    const days = parseInt(req.params.days);

    if (isNaN(days) || days < 1) {
      return res.status(400).json({ error: 'Invalid days parameter' });
    }

    if (!projectState.db || !projectState.db.db) {
      return res.status(500).json({ error: 'Database not initialized' });
    }

    // Calculate cutoff timestamp
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    const cutoffTimestamp = cutoffDate.getTime();

    // Delete from all tables
    const tables = ['events', 'agent_events', 'raven_metrics', 'process_metrics'];
    let totalDeleted = 0;

    for (const table of tables) {
      const deleteStmt = projectState.db.db.prepare(`
        DELETE FROM ${table} WHERE timestamp < ?
      `);
      const result = deleteStmt.run(cutoffTimestamp);
      totalDeleted += result.changes;
      console.log(`🗑️  Deleted ${result.changes} entries from ${table}`);
    }

    console.log(`🗑️  Total deleted: ${totalDeleted} entries older than ${days} days`);

    res.json({
      success: true,
      message: `Deleted ${totalDeleted} entries older than ${days} days`,
      deletedCount: totalDeleted,
      cutoffDate: cutoffDate.toISOString()
    });
  } catch (error) {
    console.error('Error clearing old database entries:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/control/restart-watcher', async (req, res) => {
  try {
    console.log('🔄 Restarting file watcher...');

    // Close existing watcher
    if (projectState.watcher) {
      await projectState.watcher.close();
      console.log('✅ Closed watcher');
    }

    // Reinitialize watcher
    projectState.watcher = initializeWatcher();

    res.json({
      success: true,
      message: 'File watcher restarted successfully',
      project: projectState.activeProject
    });
  } catch (error) {
    console.error('Error restarting watcher:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/control/export-health', async (req, res) => {
  try {
    // Get full health data
    const healthResponse = await fetch(`http://localhost:${PORT}/health`);
    const healthData = await healthResponse.json();

    // Add timestamp
    const exportData = {
      exported_at: new Date().toISOString(),
      ...healthData
    };

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="raven-health-${Date.now()}.json"`);
    res.json(exportData);
  } catch (error) {
    console.error('Error exporting health report:', error);
    res.status(500).json({ error: error.message });
  }
});

// ==================== Project Management API ====================

app.get('/api/projects/list', (req, res) => {
  try {
    const projects = projectState.availableProjects.map(p => p.name);
    res.json({
      projects,
      active: projectState.activeProject
    });
  } catch (error) {
    console.error('❌ Projects list error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/projects/select', async (req, res) => {
  try {
    const { project } = req.body;

    if (!project) {
      return res.status(400).json({ error: 'Missing project name' });
    }

    // Validate project exists
    const projectConfig = projectState.availableProjects.find(p => p.name === project);
    if (!projectConfig) {
      return res.status(404).json({ error: `Project "${project}" not found` });
    }

    // Don't switch if already on this project
    if (project === projectState.activeProject) {
      return res.json({
        success: true,
        project,
        message: 'Already on this project'
      });
    }

    // Switch to the new project
    await switchProject(project);

    res.json({
      success: true,
      project,
      message: `Switched to project: ${project}`
    });
  } catch (error) {
    console.error('❌ Project select error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ==================== Git Endpoints ====================

/**
 * Get current git status
 */
app.get('/api/git/status', async (req, res) => {
  try {
    if (!projectState.gitMonitor) {
      return res.json({
        branch: 'unknown',
        modified: [],
        created: [],
        deleted: []
      });
    }

    // Check if this is a git repository
    const isRepo = await projectState.gitMonitor.isGitRepo();
    if (!isRepo) {
      return res.json({
        branch: 'unknown',
        modified: [],
        created: [],
        deleted: []
      });
    }

    // Get current status (force a fresh check)
    const previousStatus = projectState.gitMonitor.lastStatus;
    projectState.gitMonitor.lastStatus = null;

    const status = await projectState.gitMonitor.checkStatus();

    // Restore previous status to avoid repeated emissions
    if (!status && previousStatus) {
      projectState.gitMonitor.lastStatus = previousStatus;
    }

    if (status) {
      res.json({
        branch: status.branch,
        modified: status.modified,
        created: status.created,
        deleted: status.deleted,
        ahead: status.ahead || 0,
        behind: status.behind || 0
      });
    } else {
      // Return last known status if available
      const lastStatus = projectState.gitMonitor.getLastStatus();
      if (lastStatus) {
        res.json({
          branch: lastStatus.current || 'unknown',
          modified: lastStatus.modified || [],
          created: [...(lastStatus.created || []), ...(lastStatus.not_added || [])],
          deleted: lastStatus.deleted || [],
          ahead: lastStatus.ahead || 0,
          behind: lastStatus.behind || 0
        });
      } else {
        res.json({
          branch: 'unknown',
          modified: [],
          created: [],
          deleted: [],
          ahead: 0,
          behind: 0
        });
      }
    }
  } catch (error) {
    console.error('❌ Git status error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get list of all branches
 */
app.get('/api/git/branches', async (req, res) => {
  try {
    if (!projectState.gitMonitor) {
      return res.json({ branches: [] });
    }

    const isRepo = await projectState.gitMonitor.isGitRepo();
    if (!isRepo) {
      return res.json({ branches: [] });
    }

    const branches = await projectState.gitMonitor.getBranches();
    res.json({ branches });
  } catch (error) {
    console.error('❌ Git branches error:', error);
    res.status(500).json({ error: error.message, branches: [] });
  }
});

/**
 * Get commit history
 */
app.get('/api/git/history', async (req, res) => {
  try {
    if (!projectState.gitMonitor) {
      return res.json({ commits: [] });
    }

    const isRepo = await projectState.gitMonitor.isGitRepo();
    if (!isRepo) {
      return res.json({ commits: [] });
    }

    const limit = parseInt(req.query.limit) || 10;
    const commits = await projectState.gitMonitor.getCommitHistory(limit);

    // Format commits for frontend
    const formattedCommits = commits.map(commit => ({
      hash: commit.hash,
      message: commit.message,
      author: commit.author_name,
      date: commit.date
    }));

    res.json({ commits: formattedCommits });
  } catch (error) {
    console.error('❌ Git history error:', error);
    res.status(500).json({ error: error.message, commits: [] });
  }
});

/**
 * Get diff for a specific file
 */
app.get('/api/git/diff/:filepath(*)', async (req, res) => {
  try {
    if (!projectState.gitMonitor) {
      return res.json({ file: req.params.filepath, diff: '' });
    }

    const isRepo = await projectState.gitMonitor.isGitRepo();
    if (!isRepo) {
      return res.json({ file: req.params.filepath, diff: '' });
    }

    const filepath = req.params.filepath;
    const diff = await projectState.gitMonitor.getFileDiff(filepath);

    res.json({
      file: filepath,
      diff: diff || ''
    });
  } catch (error) {
    console.error('❌ Git diff error:', error);
    res.status(500).json({ error: error.message, file: req.params.filepath, diff: '' });
  }
});

/**
 * Get all uncommitted changes as unified diff
 */
app.get('/api/git/diff', async (req, res) => {
  try {
    if (!projectState.gitMonitor) {
      return res.json({ diff: '' });
    }

    const isRepo = await projectState.gitMonitor.isGitRepo();
    if (!isRepo) {
      return res.json({ diff: '' });
    }

    const diff = await projectState.gitMonitor.getUncommittedDiff();

    res.json({ diff: diff || '' });
  } catch (error) {
    console.error('❌ Git uncommitted diff error:', error);
    res.status(500).json({ error: error.message, diff: '' });
  }
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
║  Status:     ✅ Ready to receive telemetry     ║
╚════════════════════════════════════════════════╝
  `);

  // Initialize default project
  initializeProject(projectState.activeProject);

  // Initialize trigger engine with io instance
  triggerEngine = new TriggerEngine(RAVEN_DIR, io);

  // Initialize metrics collector with io instance
  metricsCollector = new MetricsCollector(projectState.db, SESSION_ID, io);

  // Start real-time metrics collection
  metricsCollector.start();

  // Initialize file watcher for the active project
  console.log(`📁 Watching directory: ${projectState.watchPath}`);
  projectState.watcher = initializeWatcher();
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down Raven backend...');
  if (projectState.watcher) {
    projectState.watcher.close();
  }
  if (metricsCollector) {
    metricsCollector.stop();
  }
  if (projectState.db) {
    projectState.db.close();
  }
  process.exit(0);
});
