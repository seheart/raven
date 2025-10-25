import express from 'express';
import cors from 'cors';
import compression from 'compression';
import { createServer } from 'http';
import { Server } from 'socket.io';
import Database from 'better-sqlite3';
import { RavenDB } from './db.js';
import DeveloperDB from './developer-db.js';
import { MetricsCollector } from './metrics-collector.js';
import { TriggerEngine } from './trigger-engine.js';
import { GitMonitor } from './dist/modules/git.js';
import { randomUUID } from 'crypto';
import * as SyncService from './sync-service.js';
import { createDefaultHealthChecks } from './health-checks.js';
import { join, relative, normalize, isAbsolute } from 'path';
import chokidar from 'chokidar';
import fs from 'fs';
import { readFileSync } from 'fs';
import { promises as fsPromises } from 'fs';
import { createHash } from 'crypto';
import * as Diff from 'diff';
import toml from 'toml';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as si from 'systeminformation';
import { gzip, gunzip } from 'zlib';

// Security imports
import { authenticate, authenticateSocket } from './middleware/auth.js';
import { validate } from './middleware/validation.js';
import {
  setupHelmet,
  apiLimiter,
  authLimiter,
  telemetryLimiter,
  writeLimiter,
  requestLogger,
  errorHandler,
  notFoundHandler
} from './middleware/security.js';
import { AuthService } from './services/auth-service.js';
import { createAuthRoutes } from './routes/auth.js';

// Modular routes (Phase 3)
import { createTelemetryRoutes } from './routes/telemetry.js';
import { createDashboardRoutes } from './routes/dashboard.js';
import { createControlRoutes } from './routes/control.js';
import { createMetricsRoutes } from './routes/metrics.js';
import { createApiDocsRoutes } from './routes/api-docs.js';
import { createConversationRoutes } from './routes/conversations.js';

// Monitoring services
import { agentDetector } from './services/agent-detector.js';
import { createRiskAnalyzer } from './services/risk-analyzer.js';
import { createBehaviorProfiler } from './services/behavior-profiler.js';
import { createPatternMatcher } from './services/pattern-matcher.js';
import { createSessionTracker } from './services/session-tracker.js';
import { createDeveloperRoutes } from './routes/developer.js';

// Utilities (Phase 3)
import { logger } from './utils/logger.js';
import { fileCache, addToFileCache, getHealthCache, updateHealthCache, clearFileCache } from './utils/cache.js';
import { config as appConfig } from './config/index.js';

// Observability (Phase 5C)
import { requestTracing, errorLogging } from './middleware/request-tracing.js';
import { metricsMiddleware } from './middleware/metrics.js';
import { env, initConfig } from './config/environment.js';

// Initialize and validate configuration
initConfig();

const execAsync = promisify(exec);
const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);

const app = express();
const httpServer = createServer(app);

// Configuration: Load from environment variables with fallback defaults
const CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:5173';
const PORT = parseInt(process.env.PORT) || 3030;

// File size limits and other constants
const MAX_FILE_SIZE_BYTES = parseInt(process.env.MAX_FILE_SIZE_BYTES) || 10 * 1024 * 1024; // 10MB default
const FILE_WATCH_DEBOUNCE_MS = 50;
const AGENT_CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
const SNAPSHOT_CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours
const PERFORMANCE_MONITOR_INTERVAL_MS = 30 * 1000; // 30 seconds
const PERFORMANCE_ALERT_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes

const io = new Server(httpServer, {
  cors: {
    origin: CORS_ORIGIN,
    methods: ['GET', 'POST'],
    credentials: true
  },
  allowEIO3: true,
  transports: ['websocket', 'polling']
});

// ==================== Security Middleware ====================

// Apply security headers (Helmet)
app.use(setupHelmet());

// HTTP Compression (gzip/deflate) - 60-80% bandwidth savings
app.use(compression({
  threshold: 1024, // Only compress responses > 1KB
  level: 6, // Compression level (0-9, 6 is default balance)
  filter: (req, res) => {
    // Don't compress if client explicitly opts out
    if (req.headers['x-no-compression']) {
      return false;
    }
    // Use default compression filter
    return compression.filter(req, res);
  }
}));

// Request logging
app.use(requestLogger);

// Observability: Request tracing and metrics (Phase 5C)
if (env.ENABLE_TRACING || env.ENABLE_METRICS) {
  app.use(requestTracing);
}
if (env.ENABLE_METRICS) {
  app.use(metricsMiddleware);
}

// CORS
app.use(cors());

// JSON payload parsing with size limit
const JSON_LIMIT = process.env.JSON_PAYLOAD_LIMIT || '10mb';
app.use(express.json({ limit: JSON_LIMIT }));
app.use(express.urlencoded({ limit: JSON_LIMIT, extended: true }));

// ==================== Public API Endpoints (No Auth, No Rate Limiting) ====================
// NOTE: These must be defined BEFORE rate limiting middleware to remain accessible

/**
 * GET /api/health
 * Public health check endpoint - no authentication, no rate limiting
 */
app.get('/api/health', async (req, res) => {
  try {
    const os = await import('os');

    // Memory usage
    const totalMemory = os.totalmem();
    const freeMemory = os.freemem();
    const usedMemory = totalMemory - freeMemory;
    const memoryPercent = (usedMemory / totalMemory) * 100;

    // Process memory
    const processMemory = process.memoryUsage();

    // Calculate .raven directory size
    const getRavenDirSize = (dirPath) => {
      let totalSize = 0;
      try {
        const items = fs.readdirSync(dirPath);
        for (const item of items) {
          const itemPath = join(dirPath, item);
          const stat = fs.statSync(itemPath);
          if (stat.isDirectory()) {
            totalSize += getRavenDirSize(itemPath);
          } else {
            totalSize += stat.size;
          }
        }
      } catch (err) {
        logger.error('Error calculating directory size:', err);
      }
      return totalSize;
    };

    const ravenSize = getRavenDirSize(RAVEN_DIR);

    // Estimate disk usage
    const estimatedDiskTotal = 100 * 1024 * 1024 * 1024; // 100GB
    const diskUsePercent = (ravenSize / estimatedDiskTotal) * 100;

    // Determine health status
    let status = 'healthy';
    const issues = [];

    if (memoryPercent > 90) {
      status = 'warning';
      issues.push('High system memory usage');
    }

    if (processMemory.heapUsed / processMemory.heapTotal > 0.9) {
      status = 'warning';
      issues.push('High process heap usage');
    }

    if (diskUsePercent > 95) {
      status = 'critical';
      issues.push('Critical storage usage');
      io.emit('storage-warning', {
        percentage: diskUsePercent.toFixed(1),
        size: ravenSize,
        critical: true
      });
    } else if (diskUsePercent > 85) {
      status = 'warning';
      issues.push('High storage usage');
      io.emit('storage-warning', {
        percentage: diskUsePercent.toFixed(1),
        size: ravenSize,
        critical: false
      });
    }

    res.json({
      status,
      issues,
      uptime: process.uptime(),
      memory: {
        system: {
          total: totalMemory,
          free: freeMemory,
          used: usedMemory,
          percent: memoryPercent.toFixed(1)
        },
        process: {
          heapTotal: processMemory.heapTotal,
          heapUsed: processMemory.heapUsed,
          external: processMemory.external,
          rss: processMemory.rss
        }
      },
      storage: {
        ravenSize,
        diskUsePercent: diskUsePercent.toFixed(1)
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('❌ Health check error:', error);
    res.status(500).json({
      status: 'error',
      error: error.message
    });
  }
});

/**
 * GET /api/session-id
 * Public endpoint - returns current session ID
 */
app.get('/api/session-id', (req, res) => {
  res.json({ session_id: SESSION_ID });
});

/**
 * POST /api/errors
 * Public endpoint - Log an error from the frontend
 * Note: This must be public to log errors even when not authenticated
 */
app.post('/api/errors', (req, res) => {
  try {
    const {
      error_type,
      message,
      stack,
      component,
      user_agent,
      url,
      metadata,
      severity
    } = req.body;

    // Validate required fields
    if (!error_type || !message) {
      return res.status(400).json({ error: 'Missing required fields: error_type, message' });
    }

    const timestamp = new Date().toISOString();

    // Insert into database
    const errorId = projectState.db.insertErrorLog(
      timestamp,
      error_type,
      message,
      stack,
      component,
      user_agent,
      url,
      metadata,
      SESSION_ID,
      severity || 'error'
    );

    logger.error(`Error logged: ${error_type} - ${message}`, {
      component,
      error_id: errorId
    });

    // Create notification for errors (not warnings or info)
    if (severity === 'error' || !severity) {
      const notificationId = projectState.db.insertNotification(
        timestamp,
        'error',
        'critical',
        `${error_type}: ${message.substring(0, 80)}`,
        message,
        { component, error_id: errorId, stack: stack?.substring(0, 500) },
        SESSION_ID
      );

      io.emit('notification', {
        id: notificationId,
        timestamp,
        type: 'error',
        severity: 'critical',
        title: `${error_type}: ${message.substring(0, 80)}`,
        message,
        read: false,
        metadata: { component, error_id: errorId }
      });
    }

    // Emit real-time event via WebSocket
    io.emit('error-logged', {
      id: errorId,
      timestamp,
      error_type,
      message,
      component,
      severity: severity || 'error'
    });

    res.json({
      success: true,
      error_id: errorId
    });
  } catch (error) {
    logger.error('❌ Error logging endpoint error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ==================== Stub Endpoints (Features Not Yet Implemented) ====================
// These endpoints return placeholder data to prevent 404 errors in the frontend
// Must be BEFORE authentication/rate limiting middleware to be accessible

// Safety Tab Endpoints
app.get('/api/syntax-errors', (req, res) => {
  res.json({ errors: [], count: 0, message: 'Syntax checking not available in JavaScript version' });
});

app.get('/api/syntax-errors/count', (req, res) => {
  res.json({ count: 0 });
});

app.get('/api/tests/frameworks', (req, res) => {
  res.json({ frameworks: [], message: 'Test runner not available in JavaScript version' });
});

app.get('/api/tests/results', (req, res) => {
  res.json({ results: [], total: 0 });
});

app.post('/api/tests/run', (req, res) => {
  res.status(501).json({ error: 'Test running not available in JavaScript version' });
});

app.get('/api/pause/status', (req, res) => {
  res.json({ paused: false, message: 'Pause feature not available in JavaScript version' });
});

app.post('/api/pause', (req, res) => {
  res.status(501).json({ error: 'Pause feature not available in JavaScript version' });
});

app.post('/api/resume', (req, res) => {
  res.status(501).json({ error: 'Resume feature not available in JavaScript version' });
});

app.get('/api/sessions', (req, res) => {
  res.json({ sessions: [], total: 0, message: 'Session management not available in JavaScript version' });
});

app.get('/api/sessions/:sessionId/preview', (req, res) => {
  res.status(404).json({ error: 'Session rollback not available in JavaScript version' });
});

app.post('/api/sessions/:sessionId/rollback', (req, res) => {
  res.status(501).json({ error: 'Session rollback not available in JavaScript version' });
});

app.get('/api/pattern-warnings', (req, res) => {
  res.json({ warnings: [], count: 0, message: 'Pattern warnings not available in JavaScript version' });
});

app.get('/api/pattern-warnings/category/:category', (req, res) => {
  res.json({ warnings: [], count: 0, category: req.params.category });
});

app.post('/api/pattern-warnings/:warningId/resolve', (req, res) => {
  res.status(501).json({ error: 'Pattern warnings not available in JavaScript version' });
});

app.post('/api/syntax-errors/:errorId/resolve', (req, res) => {
  res.status(501).json({ error: 'Syntax error resolution not available in JavaScript version' });
});

app.get('/api/alerts/templates', (req, res) => {
  res.json({ templates: [] });
});

app.get('/api/projects', (req, res) => {
  try {
    // Return full project configuration with stats
    const projectsWithStats = Array.from(projectDatabases.entries()).map(([name, db]) => {
      // Get database stats
      let dbSize = 0;
      let eventCount = 0;

      try {
        const dbPath = join(process.cwd(), '..', '.raven', 'db', `${name}.db`);
        if (fs.existsSync(dbPath)) {
          const stats = fs.statSync(dbPath);
          dbSize = stats.size;
        }

        const countResult = db.db.prepare('SELECT COUNT(*) as count FROM events').get();
        eventCount = countResult.count;
      } catch (err) {
        logger.error(`Error getting stats for ${name}:`, err);
      }

      // Find config from projects.json if it exists
      let projectConfig = {};
      if (config && config.projects && Array.isArray(config.projects)) {
        projectConfig = config.projects.find(p => p.name === name) || {};
      }

      // Get the actual project path
      const projectPath = projectPaths.get(name) || '';

      return {
        name,
        path: projectPath,
        enabled: projectConfig.enabled !== false, // Default to true
        ignorePatterns: projectConfig.ignorePatterns || [],
        maxFileSize: projectConfig.maxFileSize || 10485760,
        retentionDays: projectConfig.retentionDays || 30,
        dbSize,
        eventCount
      };
    });

    // Prevent caching of project configuration
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');

    res.json({
      autoDiscover: config.autoDiscover !== false,
      basePath: config.basePath || join(process.cwd(), '..', '..'),
      projects: projectsWithStats
    });
  } catch (error) {
    logger.error('Error fetching projects config:', error);
    res.status(500).json({ error: 'Failed to fetch projects configuration' });
  }
});

app.get('/api/status', (req, res) => {
  // General status endpoint
  res.json({
    status: 'online',
    version: '0.16.0',
    session_id: SESSION_ID,
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

// ==================== Rate Limiting Middleware ====================
// Apply rate limiting to all /api routes EXCEPT the public endpoints defined above
app.use('/api', apiLimiter);

// ==================== Authentication Middleware ====================

// Apply authentication to all API routes (unless DISABLE_AUTH=true)
app.use('/api', authenticate);

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
  logger.error('❌ Failed to load config.toml:', error.message);
  process.exit(1);
}

// ==================== Project Auto-Discovery ====================

/**
 * Auto-discover all projects in the parent directory
 * @returns {Array} Array of project objects with name, path, and description
 */
function discoverProjects() {
  try {
    // Backend is in /home/seth/Projects/raven/backend
    // We want to scan /home/seth/Projects/ (two levels up)
    const projectsDir = join(process.cwd(), '..', '..');
    const entries = fs.readdirSync(projectsDir, { withFileTypes: true });

    const projects = entries
      .filter(entry => {
        // Only include directories
        if (!entry.isDirectory()) return false;

        // Exclude hidden folders, node_modules, and system folders
        if (entry.name.startsWith('.')) return false;
        if (entry.name === 'node_modules') return false;

        return true;
      })
      .map(entry => ({
        name: entry.name,
        path: join(projectsDir, entry.name),
        description: `Project: ${entry.name}`
      }));

    console.log(`📂 Auto-discovered ${projects.length} projects in ${projectsDir}`);
    return projects;
  } catch (error) {
    logger.error('❌ Error discovering projects:', error.message);
    return [];
  }
}

// Auto-discover projects or use config
const discoveredProjects = discoverProjects();

// Simple async mutex for protecting projectState from race conditions
class AsyncMutex {
  constructor() {
    this.locked = false;
    this.queue = [];
  }

  async acquire() {
    if (!this.locked) {
      this.locked = true;
      return;
    }

    // Wait in queue
    return new Promise(resolve => {
      this.queue.push(resolve);
    });
  }

  release() {
    if (this.queue.length > 0) {
      // Wake up next waiter
      const resolve = this.queue.shift();
      resolve();
    } else {
      this.locked = false;
    }
  }

  async runExclusive(fn) {
    await this.acquire();
    try {
      return await fn();
    } finally {
      this.release();
    }
  }
}

// Mutex for protecting projectState during project switches
const projectStateMutex = new AsyncMutex();

// Initialize Developer Persona Database (global across all projects)
const DEVELOPER_DB_PATH = join(RAVEN_DIR, 'db', 'developer.db');
const developerDB = new DeveloperDB(DEVELOPER_DB_PATH);
console.log(`✅ Developer persona database ready at ${DEVELOPER_DB_PATH}`);

// Initialize Authentication Service (global user management)
const AUTH_DB_PATH = join(RAVEN_DIR, 'db', 'auth.db');
const authDB = new Database(AUTH_DB_PATH);
const authService = new AuthService(authDB);
console.log(`✅ Authentication service initialized at ${AUTH_DB_PATH}`);

// Multi-project state: Maps for managing all projects simultaneously
const projectWatchers = new Map();      // projectName -> chokidar watcher
const projectDatabases = new Map();     // projectName -> RavenDB instance
const projectGitMonitors = new Map();   // projectName -> GitMonitor instance
const projectPaths = new Map();         // projectName -> absolute path
const projectSnapshotDirs = new Map();  // projectName -> snapshots directory

// Available projects list
const availableProjects = discoveredProjects.length > 0
  ? discoveredProjects
  : (config.projects?.available || []);

// Session ID (generated once per server start)
const SESSION_ID = randomUUID();

// ==================== Logger & Cache (imported from modules) ====================
// logger, fileCache, addToFileCache imported from utils/ (Phase 3)

// Track files currently being processed to prevent race conditions
const filesInProgress = new Set();

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

// Health check system
let healthCheckSystem;

// In-memory agent registry
const agentRegistry = new Map();

// Cleanup inactive agents periodically (every hour, remove agents not seen in 24 hours)
const agentCleanupInterval = setInterval(() => {
  const now = Date.now();
  const TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
  let removed = 0;

  for (const [agentName, agentData] of agentRegistry.entries()) {
    const lastSeen = new Date(agentData.last_seen).getTime();
    if (now - lastSeen > TTL_MS) {
      agentRegistry.delete(agentName);
      removed++;
    }
  }

  if (removed > 0) {
    logger.info(`🧹 Cleaned up ${removed} inactive agents from registry`);
  }
}, AGENT_CLEANUP_INTERVAL_MS);

// Cleanup old snapshots periodically (daily, remove snapshots older than 30 days)
const snapshotCleanupInterval = setInterval(async () => {
  try {
    const SNAPSHOT_TTL_MS = parseInt(process.env.SNAPSHOT_TTL_DAYS || '30') * 24 * 60 * 60 * 1000;
    const now = Date.now();
    let removed = 0;

    // Check if snapshots directory exists
    if (!fs.existsSync(projectState.snapshotsDir)) {
      return;
    }

    const files = await fs.promises.readdir(projectState.snapshotsDir);

    for (const file of files) {
      const filePath = join(projectState.snapshotsDir, file);
      const stats = await fs.promises.stat(filePath);

      if (now - stats.mtimeMs > SNAPSHOT_TTL_MS) {
        await fs.promises.unlink(filePath);
        removed++;
      }
    }

    if (removed > 0) {
      logger.info(`🧹 Cleaned up ${removed} old snapshots (>${process.env.SNAPSHOT_TTL_DAYS || '30'} days)`);
    }
  } catch (error) {
    logger.error('Error cleaning snapshots:', error);
  }
}, SNAPSHOT_CLEANUP_INTERVAL_MS);

// Performance monitoring
let lastPerformanceAlert = 0;

const performanceMonitorInterval = setInterval(async () => {
  try {
    const os = await import('os');
    const now = Date.now();

    // Skip if we recently sent an alert (avoid spam)
    if (now - lastPerformanceAlert < PERFORMANCE_ALERT_COOLDOWN_MS) {
      return;
    }

    // Memory usage
    const totalMemory = os.totalmem();
    const freeMemory = os.freemem();
    const usedMemory = totalMemory - freeMemory;
    const memoryPercent = (usedMemory / totalMemory) * 100;

    // Process memory
    const processMemory = process.memoryUsage();
    const heapPercent = (processMemory.heapUsed / processMemory.heapTotal) * 100;

    // Check for critical conditions
    if (memoryPercent > 90) {
      io.emit('performance-alert', {
        type: 'memory',
        severity: 'critical',
        title: 'Critical System Memory',
        message: `System memory usage is critically high: ${memoryPercent.toFixed(1)}%`,
        value: memoryPercent.toFixed(1)
      });
      lastPerformanceAlert = now;
      logger.warn(`⚠️ Critical system memory: ${memoryPercent.toFixed(1)}%`);
    } else if (heapPercent > 90) {
      io.emit('performance-alert', {
        type: 'heap',
        severity: 'warning',
        title: 'High Heap Memory',
        message: `Process heap usage is high: ${heapPercent.toFixed(1)}%`,
        value: heapPercent.toFixed(1)
      });
      lastPerformanceAlert = now;
      logger.warn(`⚠️ High heap usage: ${heapPercent.toFixed(1)}%`);
    } else if (memoryPercent > 85) {
      io.emit('performance-alert', {
        type: 'memory',
        severity: 'warning',
        title: 'High System Memory',
        message: `System memory usage is high: ${memoryPercent.toFixed(1)}%`,
        value: memoryPercent.toFixed(1)
      });
      lastPerformanceAlert = now;
    }
  } catch (error) {
    logger.error('Performance monitoring error:', error);
  }
}, PERFORMANCE_MONITOR_INTERVAL_MS);

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
  // Optimized: Use minimal context (3 lines) instead of default to reduce diff size
  const diff = Diff.createPatch('file', oldContent, newContent, '', '', { context: 3 });
  return diff;
}

function detectLanguage(filepath) {
  const ext = filepath.split('.').pop().toLowerCase();
  const languageMap = {
    js: 'javascript',
    jsx: 'javascript',
    ts: 'typescript',
    tsx: 'typescript',
    py: 'python',
    rs: 'rust',
    go: 'go',
    java: 'java',
    c: 'c',
    cpp: 'c++',
    cc: 'c++',
    h: 'c',
    hpp: 'c++',
    cs: 'csharp',
    rb: 'ruby',
    php: 'php',
    swift: 'swift',
    kt: 'kotlin',
    scala: 'scala',
    r: 'r',
    m: 'objective-c',
    sh: 'shell',
    bash: 'shell',
    sql: 'sql',
    html: 'html',
    css: 'css',
    scss: 'scss',
    sass: 'sass',
    vue: 'vue',
    svelte: 'svelte',
    json: 'json',
    xml: 'xml',
    yaml: 'yaml',
    yml: 'yaml',
    toml: 'toml',
    md: 'markdown',
    txt: 'text'
  };
  return languageMap[ext] || 'unknown';
}

/**
 * Detect which project a file belongs to based on its path
 * @param {string} filepath - Absolute file path
 * @returns {string|null} - Project name or null if not found
 */
function detectProjectFromPath(filepath) {
  const normalizedPath = normalize(filepath);

  // Sort projects by path length (longest first) to avoid substring matching issues
  // e.g., "ant312" should match before "ant"
  const sortedProjects = Array.from(projectPaths.entries()).sort((a, b) => {
    return b[1].length - a[1].length;
  });

  for (const [projectName, projectPath] of sortedProjects) {
    const normalizedProjectPath = normalize(projectPath);
    if (normalizedPath.startsWith(normalizedProjectPath + '/') || normalizedPath === normalizedProjectPath) {
      return projectName;
    }
  }

  return null;
}

async function saveSnapshot(filepath, content, projectName) {
  try {
    // Get project-specific paths
    const projectPath = projectPaths.get(projectName);
    const snapshotsDir = projectSnapshotDirs.get(projectName);

    if (!projectPath || !snapshotsDir) {
      logger.error(`❌ Project paths not found for ${projectName}`);
      return null;
    }

    // Create snapshot filename: filepath_timestamp.gz (compressed)
    const timestamp = Date.now();
    const relPath = relative(projectPath, filepath);
    const snapshotName = `${relPath.replace(/\//g, '_')}_${timestamp}.gz`;
    const snapshotPath = join(snapshotsDir, snapshotName);

    // Ensure snapshots directory exists
    await fs.promises.mkdir(snapshotsDir, { recursive: true });

    // Compress content using gzip (saves ~60-80% space for text files)
    const compressed = await gzipAsync(content);

    // Save compressed snapshot
    await fs.promises.writeFile(snapshotPath, compressed);

    const originalSize = Buffer.byteLength(content, 'utf8');
    const compressedSize = compressed.length;
    const ratio = ((1 - compressedSize / originalSize) * 100).toFixed(1);

    logger.info(`💾 Snapshot saved [${projectName}]: ${snapshotName} (${originalSize} → ${compressedSize} bytes, ${ratio}% reduction)`);
    return snapshotPath;
  } catch (error) {
    logger.error(`❌ Snapshot save error [${projectName}]:`, error);
    return null;
  }
}

async function handleFileChange(eventType, filepath) {
  // Prevent race conditions: skip if file is already being processed
  if (filesInProgress.has(filepath)) {
    console.log(`⏭️  Skipping ${filepath} - already processing`);
    return;
  }

  // Mark file as being processed
  filesInProgress.add(filepath);

  try {
    // Detect which project this file belongs to
    const projectName = detectProjectFromPath(filepath);
    if (!projectName) {
      logger.warn(`⚠️  Could not determine project for file: ${filepath}`);
      return;
    }

    // Get project-specific resources
    const projectPath = projectPaths.get(projectName);
    const db = projectDatabases.get(projectName);
    const gitMonitor = projectGitMonitors.get(projectName);

    if (!db || !projectPath) {
      logger.error(`❌ Project resources not found for ${projectName}`);
      return;
    }

    const relPath = relative(projectPath, filepath);
    const timestamp = new Date().toISOString();

    let diff = null;
    let fileHash = null;
    let eventSize = 0;
    let content = '';

    // Read file content for 'add' and 'change' events
    if (eventType === 'add' || eventType === 'change') {
      try {
        // Check file size before reading to prevent OOM errors
        const stats = await fs.promises.stat(filepath);
        const fileSizeBytes = stats.size;

        if (fileSizeBytes > MAX_FILE_SIZE_BYTES) {
          logger.warn(`File too large to track: [${projectName}] ${relPath} (${(fileSizeBytes / 1024 / 1024).toFixed(2)} MB, limit: ${(MAX_FILE_SIZE_BYTES / 1024 / 1024).toFixed(2)} MB)`);

          // Emit a special event for large files
          io.emit('file-too-large', {
            timestamp,
            project: projectName,
            filepath: relPath,
            size_bytes: fileSizeBytes,
            limit_bytes: MAX_FILE_SIZE_BYTES
          });

          return; // Skip processing this file
        }

        content = await fs.promises.readFile(filepath, 'utf8');
        eventSize = content.length;
        fileHash = calculateFileHash(content);

        // Generate diff for 'change' events
        if (eventType === 'change' && fileCache.has(filepath)) {
          const oldContent = fileCache.get(filepath);
          diff = generateDiff(oldContent, content);
        }

        // Save snapshot (project-specific)
        await saveSnapshot(filepath, content, projectName);

        // Update cache with LRU eviction (only if file is not too large)
        if (fileSizeBytes < MAX_FILE_SIZE_BYTES / 2) { // Only cache files up to 5MB
          addToFileCache(filepath, content);
        }
      } catch (readError) {
        logger.error(`Error reading file [${projectName}] ${relPath}:`, readError);
        return;
      }
    } else if (eventType === 'unlink') {
      // File deleted - remove from cache
      fileCache.delete(filepath);
    }

    // Get system metrics
    const cpuLoad = await si.currentLoad();
    const memInfo = await si.mem();
    const cpuPercent = cpuLoad.currentLoad || 0;
    const memPercent = (memInfo.used / memInfo.total) * 100;

    // Insert event into project-specific database
    let eventId = null;
    let dbInsertSuccess = false;
    try {
      eventId = db.insertEvent(
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
      dbInsertSuccess = true;
      logger.info(`📁 [${projectName}] File ${eventType}: ${relPath} (${eventSize} bytes)`);

      // Track session activity
      if (sessionTracker) {
        sessionTracker.recordActivity(projectName, {
          change_type: eventType,
          diff,
          filepath: relPath,
          agent: null, // Will be enriched by agent detector
          risk_score: 0 // Will be calculated if needed
        });
      }

      // ALSO log to global developer persona database
      const language = detectLanguage(filepath);
      const linesAdded = diff ? (diff.match(/^\+/gm) || []).length : 0;
      const linesRemoved = diff ? (diff.match(/^-/gm) || []).length : 0;

      try {
        developerDB.logCodePattern({
          project: projectName,
          language,
          file_type: filepath.split('.').pop(),
          edit_type: eventType === 'add' ? 'create' : eventType === 'unlink' ? 'delete' : 'modify',
          lines_added: linesAdded,
          lines_removed: linesRemoved,
          timestamp
        });
      } catch (devDbError) {
        logger.error(`Failed to log to developer DB [${projectName}]:`, devDbError);
        // Don't fail the whole operation if dev DB logging fails
      }
    } catch (dbError) {
      logger.error(`Database insert failed [${projectName}]:`, dbError);
      // Continue processing to ensure event is still emitted
    }

    // Only emit WebSocket event if database insert succeeded
    if (dbInsertSuccess && eventId) {
      io.emit('file-changed', {
        id: eventId,
        timestamp,
        project: projectName,
        filepath: relPath,
        change_type: eventType,
        event_size: eventSize,
        file_hash: fileHash
      });
    } else {
      // Emit without ID to indicate tracking failure
      logger.warn(`File change tracked but not persisted: [${projectName}] ${relPath}`);
      io.emit('file-changed-untracked', {
        timestamp,
        project: projectName,
        filepath: relPath,
        change_type: eventType,
        error: 'Database insert failed'
      });
    }

    // Check if this event triggers any alerts
    const linesDeleted = diff ? (diff.match(/^-/gm) || []).length : 0;
    const linesAdded = diff ? (diff.match(/^\+/gm) || []).length : 0;

    const triggerEvent = {
      file: relPath,
      lines_changed: diff ? diff.split('\n').length : 0,
      lines_deleted: linesDeleted,
      lines_added: linesAdded,
      event_type: eventType,
      cpu_percent: cpuPercent,
      memory_percent: memPercent,
      event_size: eventSize,
      project: projectName
    };
    triggerEngine.evaluate(triggerEvent);

    // Emit git status update for this project
    if (gitMonitor) {
      await emitGitStatusUpdate(projectName);
    }
  } catch (error) {
    logger.error('❌ File change handler error:', error);
  } finally {
    // Always remove file from in-progress set to prevent deadlock
    filesInProgress.delete(filepath);
  }
}

// ==================== Project Management Functions ====================

// Monitoring service instances
let riskAnalyzer;
let behaviorProfiler;
let patternMatcher;
let sessionTracker;

/**
 * Initialize monitoring services after projects are loaded
 */
function initializeMonitoringServices() {
  try {
    console.log('🔍 Initializing monitoring services...');

    riskAnalyzer = createRiskAnalyzer(projectDatabases);
    behaviorProfiler = createBehaviorProfiler(projectDatabases);
    patternMatcher = createPatternMatcher(projectDatabases);
    sessionTracker = createSessionTracker(projectDatabases);

    console.log('✅ Monitoring services initialized');
    console.log('   - AgentDetector: Ready');
    console.log('   - RiskAnalyzer: Ready');
    console.log('   - BehaviorProfiler: Ready');
    console.log('   - PatternMatcher: Ready');
    console.log('   - SessionTracker: Ready\n');
  } catch (error) {
    logger.error('❌ Failed to initialize monitoring services:', error);
  }
}

/**
 * Initialize a single project (database, paths, git monitor)
 * @param {string} projectName - Name of the project to initialize
 * @returns {boolean} - True if successful, false otherwise
 */
function initializeProject(projectName) {
  try {
    const project = availableProjects.find(p => p.name === projectName);
    if (!project) {
      logger.error(`❌ Project "${projectName}" not found`);
      return false;
    }

    // Set project paths
    // Use absolute path if provided, otherwise resolve relative to Projects dir
    const projectPath = isAbsolute(project.path)
      ? project.path
      : join(process.cwd(), '..', '..', project.path);
    const dbPath = join(RAVEN_DIR, 'db', `${projectName}.db`);
    const snapshotsDir = join(RAVEN_DIR, 'snapshots', projectName);

    // Store paths in Maps
    projectPaths.set(projectName, projectPath);
    projectSnapshotDirs.set(projectName, snapshotsDir);

    // Initialize database
    const db = new RavenDB(dbPath);
    projectDatabases.set(projectName, db);

    // Ensure snapshots directory exists
    fs.mkdirSync(snapshotsDir, { recursive: true });

    // Initialize GitMonitor
    const gitMonitor = new GitMonitor({
      repoPath: projectPath,
      pollIntervalMs: 2000,
      enableAutoPoll: false // Manual polling only, no auto-commits
    });
    projectGitMonitors.set(projectName, gitMonitor);

    console.log(`✅ Initialized project: ${projectName}`);
    console.log(`   Watch Path: ${projectPath}`);
    console.log(`   Database: ${dbPath}`);
    console.log(`   Snapshots: ${snapshotsDir}`);

    return true;
  } catch (error) {
    logger.error(`❌ Error initializing project ${projectName}:`, error);
    return false;
  }
}

/**
 * Initialize ALL discovered projects for global monitoring
 */
function initializeAllProjects() {
  console.log(`\n🚀 Initializing ${availableProjects.length} projects for global monitoring...\n`);

  let successCount = 0;
  let failCount = 0;

  for (const project of availableProjects) {
    const success = initializeProject(project.name);
    if (success) {
      successCount++;
    } else {
      failCount++;
    }
  }

  console.log('\n✅ Project initialization complete:');
  console.log(`   Successful: ${successCount}`);
  console.log(`   Failed: ${failCount}`);
  console.log(`   Total: ${availableProjects.length}\n`);

  // Initialize monitoring services
  initializeMonitoringServices();

  return { successCount, failCount };
}

/**
 * Emit real-time git status update via WebSocket for a specific project
 */
async function emitGitStatusUpdate(projectName) {
  const gitMonitor = projectGitMonitors.get(projectName);
  if (!gitMonitor) {
    return;
  }

  try {
    const isRepo = await gitMonitor.isGitRepo();
    if (!isRepo) return;

    // Force a fresh status check by temporarily clearing lastStatus
    const previousStatus = gitMonitor.lastStatus;
    gitMonitor.lastStatus = null;

    const status = await gitMonitor.checkStatus();

    // Restore the previous status to avoid repeated emissions
    if (!status && previousStatus) {
      gitMonitor.lastStatus = previousStatus;
    }

    if (status) {
      io.emit('git-status-updated', {
        project: projectName,
        branch: status.branch,
        modified: status.modified,
        created: status.created,
        deleted: status.deleted,
        ahead: status.ahead || 0,
        behind: status.behind || 0,
        timestamp: new Date().toISOString()
      });
      console.log(`🔀 [${projectName}] Git status emitted via WebSocket`);
    }
  } catch (error) {
    logger.error(`❌ Error emitting git status [${projectName}]:`, error);
  }
}

/**
 * Initialize file watcher for a specific project
 * @param {string} projectName - Name of the project to watch
 * @returns {object|null} - Chokidar watcher instance or null if failed
 */
function initializeWatcher(projectName) {
  const projectPath = projectPaths.get(projectName);
  if (!projectPath) {
    logger.error(`❌ Cannot create watcher for ${projectName}: path not found`);
    return null;
  }

  // Default ignore patterns (can be extended via CHOKIDAR_IGNORE_PATTERNS env var)
  const defaultIgnored = [
    /(^|[\/\\])\../, // Ignore dotfiles
    '**/node_modules/**',
    '**/.git/**',
    '**/target/**',
    '**/.raven/**',
    '**/*.log',
    '**/dist/**',
    '**/build/**',
    '**/.cache/**',
    '**/.next/**',
    '**/.turbo/**',
    '**/.svelte-kit/**',
    '**/coverage/**',
    '**/.DS_Store'
  ];

  // Allow custom ignore patterns via environment variable (comma-separated)
  const customIgnored = process.env.CHOKIDAR_IGNORE_PATTERNS
    ? process.env.CHOKIDAR_IGNORE_PATTERNS.split(',').map(p => p.trim())
    : [];

  // macOS-optimized configuration for file watching
  const isMacOS = process.platform === 'darwin';

  // Special handling for raven project to avoid watching its own node_modules
  const isRavenProject = projectName === 'raven';

  // For raven project, only watch specific directories to avoid node_modules
  const watchPaths = isRavenProject ? [
    join(projectPath, 'docs'),
    join(projectPath, 'test_workspace'),
    join(projectPath, 'backend/*.js'),      // Only .js files in backend root
    join(projectPath, 'frontend/src'),      // Only src directory
    join(projectPath, '*.md'),              // Root markdown files
    join(projectPath, '*.sh')              // Shell scripts
  ] : projectPath;

  const watcher = chokidar.watch(watchPaths, {
    ignored: [...defaultIgnored, ...customIgnored],
    persistent: true,
    ignoreInitial: true,
    awaitWriteFinish: {
      stabilityThreshold: 100,
      pollInterval: FILE_WATCH_DEBOUNCE_MS
    },
    // macOS-specific optimizations
    usePolling: false,           // Use native FSEvents on macOS
    useFsEvents: isMacOS,         // Enable FSEvents API on macOS for better performance
    depth: 99,
    ignorePermissionErrors: true  // Ignore permission errors on macOS
  });

  watcher
    .on('add', filepath => {
      handleFileChange('add', filepath);
    })
    .on('change', filepath => {
      handleFileChange('change', filepath);
    })
    .on('unlink', filepath => {
      handleFileChange('unlink', filepath);
    })
    .on('error', error => {
      logger.error(`❌ Watcher error [${projectName}]:`, error);

      // Emit file watcher error via WebSocket
      io.emit('file-watcher-error', {
        project: projectName,
        timestamp: new Date().toISOString(),
        message: error.message || 'File watcher encountered an error',
        error: error.toString()
      });
    })
    .on('ready', () => {
      console.log(`✅ File watcher ready [${projectName}]`);
    });

  return watcher;
}

/**
 * Initialize watchers for ALL projects
 */
function initializeAllWatchers() {
  console.log('\n👀 Starting file watchers for all projects...\n');

  let successCount = 0;
  let failCount = 0;

  for (const [projectName, projectPath] of projectPaths.entries()) {
    const watcher = initializeWatcher(projectName);
    if (watcher) {
      projectWatchers.set(projectName, watcher);
      successCount++;
    } else {
      failCount++;
    }
  }

  console.log('\n✅ Watcher initialization complete:');
  console.log(`   Watching: ${successCount} projects`);
  console.log(`   Failed: ${failCount}\n`);

  return { successCount, failCount };
}

// NOTE: switchProject() function removed - now watching all projects simultaneously
// The old single-project switching model is deprecated

/**
 * Get default project database (for legacy API endpoints)
 * Prefers 'raven' project if it exists, otherwise first available
 */
function getDefaultProjectDb() {
  const ravenDb = projectDatabases.get('raven');
  if (ravenDb) return ravenDb;

  return projectDatabases.values().next().value;
}

/**
 * Get default project name (for legacy API endpoints)
 */
function getDefaultProjectName() {
  if (projectDatabases.has('raven')) return 'raven';

  const firstProject = projectPaths.keys().next().value;
  return firstProject || null;
}

/**
 * Compatibility shim: Provides backward-compatible projectState object
 * for legacy API endpoints during transition to multi-project architecture
 */
const projectState = {
  get activeProject() {
    return getDefaultProjectName();
  },
  get availableProjects() {
    return availableProjects;
  },
  get db() {
    return getDefaultProjectDb();
  },
  get watchPath() {
    const defaultProject = getDefaultProjectName();
    return defaultProject ? projectPaths.get(defaultProject) : null;
  },
  get dbPath() {
    const defaultProject = getDefaultProjectName();
    return defaultProject ? join(RAVEN_DIR, 'db', `${defaultProject}.db`) : null;
  },
  get snapshotsDir() {
    const defaultProject = getDefaultProjectName();
    return defaultProject ? projectSnapshotDirs.get(defaultProject) : null;
  },
  get watcher() {
    const defaultProject = getDefaultProjectName();
    return defaultProject ? projectWatchers.get(defaultProject) : null;
  },
  get gitMonitor() {
    const defaultProject = getDefaultProjectName();
    return defaultProject ? projectGitMonitors.get(defaultProject) : null;
  }
};

// ==================== Dependency Injection for Modular Routes (Phase 3) ====================

const routeDependencies = {
  // Databases
  projectDatabases,
  developerDB,
  projectState,

  // Registry & State
  agentRegistry,
  availableProjects,
  SESSION_ID,

  // Services
  triggerEngine,
  io,
  getAgentColor,

  // Cache
  fileCache,

  // Utilities
  projectStateMutex,
  initializeWatcher,
  PORT
};

// ==================== Modular Routes (Phase 3) ====================

// Telemetry endpoint (with rate limiting)
app.use('/telemetry', telemetryLimiter, createTelemetryRoutes(routeDependencies));

// Dashboard routes
app.use('/api', createDashboardRoutes(routeDependencies));

// Conversation routes (Agent Conversation Tracker)
app.use('/api', createConversationRoutes(routeDependencies));

// Developer Persona routes (AI Training Data)
app.use('/api/developer', createDeveloperRoutes(routeDependencies));

// Metrics routes - system and process metrics
app.get('/api/system-metrics', (req, res) => {
  try {
    const { limit = 100, offset = 0 } = req.query;
    const ravenDb = projectDatabases.get('raven');
    if (!ravenDb || !ravenDb.db) {
      return res.status(500).json({ error: 'Raven database not initialized' });
    }
    const stmt = ravenDb.db.prepare('SELECT * FROM raven_metrics ORDER BY timestamp DESC LIMIT ? OFFSET ?');
    const metrics = stmt.all(parseInt(limit), parseInt(offset));
    res.json(metrics);
  } catch (error) {
    logger.error('Get system metrics error:', error);
    res.status(500).json({ error: 'Failed to retrieve system metrics' });
  }
});

app.get('/api/process-metrics/:agent', (req, res) => {
  try {
    const { limit = 100, offset = 0 } = req.query;
    const agent = req.params.agent;
    const ravenDb = projectDatabases.get('raven');
    if (!ravenDb || !ravenDb.db) {
      return res.status(500).json({ error: 'Raven database not initialized' });
    }
    const stmt = ravenDb.db.prepare('SELECT * FROM process_metrics WHERE agent_name = ? ORDER BY timestamp DESC LIMIT ? OFFSET ?');
    const metrics = stmt.all(agent, parseInt(limit), parseInt(offset));
    res.json(metrics);
  } catch (error) {
    logger.error('Get process metrics by agent error:', error);
    res.status(500).json({ error: 'Failed to retrieve process metrics' });
  }
});

app.get('/api/process-metrics', (req, res) => {
  try {
    const { limit = 100, offset = 0, agent = null } = req.query;
    const ravenDb = projectDatabases.get('raven');
    if (!ravenDb || !ravenDb.db) {
      return res.status(500).json({ error: 'Raven database not initialized' });
    }
    let query = 'SELECT * FROM process_metrics';
    const params = [];
    if (agent) {
      query += ' WHERE agent_name = ?';
      params.push(agent);
    }
    query += ' ORDER BY timestamp DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));
    const stmt = ravenDb.db.prepare(query);
    const metrics = stmt.all(...params);
    res.json(metrics);
  } catch (error) {
    logger.error('Get process metrics error:', error);
    res.status(500).json({ error: 'Failed to retrieve process metrics' });
  }
});

// Control routes
app.use('/api/control', createControlRoutes(routeDependencies));

// Metrics routes (Phase 5C)
app.use('/', createMetricsRoutes());

// API Documentation (Phase 5A)
app.use('/api-docs', createApiDocsRoutes());

// ==================== Legacy Routes (to be extracted or kept) ====================
// The routes below are still in server.js - can be extracted later if needed

// ==================== Telemetry Endpoint (NOW MODULAR - see routes/telemetry.js) ====================
// Deleted - now using modular route

// ==================== Authentication Routes ====================

// Mount authentication routes (no auth required for login)
app.use('/auth', createAuthRoutes(authService));

// ==================== Dashboard API ====================

// NOTE: /api/health and /api/session-id endpoints moved to BEFORE authentication middleware (line ~237-243)
// This allows frontend to check health and get session ID without requiring auth token

/**
 * GET /api/health-checks
 * Get startup health check results
 */
app.get('/api/health-checks', (req, res) => {
  try {
    if (!healthCheckSystem) {
      return res.json({
        status: 'pending',
        message: 'Health checks have not run yet',
        results: []
      });
    }

    const results = healthCheckSystem.getResults();
    res.json({
      status: results.summary.allPassed ? 'healthy' : 'unhealthy',
      ...results
    });
  } catch (error) {
    logger.error('❌ Health checks API error:', error);
    res.status(500).json({
      status: 'error',
      error: error.message
    });
  }
});

// ==================== Dashboard Routes (NOW MODULAR - see routes/dashboard.js) ====================
// Deleted: /api/dashboard-stats, /api/top-modified-files, /api/longest-edits, /api/agents-status

// ==================== Agent Events API ====================

app.get('/api/agent-events', (req, res) => {
  try {
    if (!projectState.db) {
      return res.status(500).json({ error: 'Database not initialized' });
    }
    const limit = parseInt(req.query.limit) || 100;
    const events = projectState.db.getRecentAgentEvents(limit);
    res.json(events);
  } catch (error) {
    logger.error('Agent events error:', error);
    res.status(500).json({ error: 'Failed to retrieve agent events' });
  }
});

app.get('/api/events-by-agent/:agent', (req, res) => {
  try {
    if (!projectState.db) {
      return res.status(500).json({ error: 'Database not initialized' });
    }
    const { agent } = req.params;
    const limit = parseInt(req.query.limit) || 100;
    const events = projectState.db.getEventsByAgent(agent, limit);
    res.json(events);
  } catch (error) {
    logger.error('Events by agent error:', error);
    res.status(500).json({ error: 'Failed to retrieve events by agent' });
  }
});

// /api/agent-stats - now in routes/dashboard.js

// ==================== System Metrics API ====================
// NOTE: /api/system-metrics and /api/process-metrics are defined earlier (lines 1248-1286)
// Duplicate endpoints removed to prevent conflicts

app.get('/api/metrics-stats', (req, res) => {
  try {
    const ravenDb = projectDatabases.get('raven');
    if (!ravenDb || !ravenDb.db) {
      return res.status(500).json({ error: 'Raven database not initialized' });
    }
    // Default to last 24 hours if not specified
    const now = Date.now();
    const dayAgo = now - 24 * 60 * 60 * 1000;

    const start_time = req.query.start_time || new Date(dayAgo).toISOString();
    const end_time = req.query.end_time || new Date(now).toISOString();

    const stats = ravenDb.getMetricsStats(start_time, end_time);
    res.json(stats);
  } catch (error) {
    logger.error('Metrics stats error:', error);
    res.status(500).json({ error: 'Failed to retrieve metrics stats' });
  }
});

app.get('/api/performance-correlations', (req, res) => {
  try {
    const ravenDb = projectDatabases.get('raven');
    if (!ravenDb || !ravenDb.db) {
      return res.status(500).json({ error: 'Raven database not initialized' });
    }
    const time_window_seconds = parseInt(req.query.time_window_seconds) || 5;
    const correlations = ravenDb.correlateEventsWithMetrics(time_window_seconds);
    res.json(correlations);
  } catch (error) {
    logger.error('Performance correlations error:', error);
    res.status(500).json({ error: 'Failed to retrieve performance correlations' });
  }
});

// ==================== Custom Metrics Dashboard API ====================

app.get('/api/metrics/dashboard', (req, res) => {
  try {
    if (projectDatabases.size === 0) {
      return res.status(500).json({ error: 'No project databases initialized' });
    }

    // Aggregate metrics across all projects
    const metrics = {
      total_events: 0,
      events_24h: 0,
      total_files: 0,
      error_count: 0,
      conversation_count: 0,
      events_by_type: {},
      active_projects: 0
    };

    const fileActivity = new Map();
    const hourlyActivity = new Map();
    const dailyEvents = [];

    // Iterate through all project databases
    for (const [projectName, db] of projectDatabases.entries()) {
      try {
        // Total events
        const totalEvents = db.db.prepare('SELECT COUNT(*) as count FROM events').get();
        metrics.total_events += totalEvents.count;

        // Events by type (normalize names: add->created, change->modified, unlink->deleted)
        const eventsByType = db.db.prepare(`
          SELECT change_type, COUNT(*) as count
          FROM events
          GROUP BY change_type
        `).all();

        for (const row of eventsByType) {
          let normalizedType = row.change_type;
          if (row.change_type === 'add') normalizedType = 'created';
          else if (row.change_type === 'change') normalizedType = 'modified';
          else if (row.change_type === 'unlink') normalizedType = 'deleted';

          metrics.events_by_type[normalizedType] = (metrics.events_by_type[normalizedType] || 0) + row.count;
        }

        // Events last 24h
        const events24h = db.db.prepare(`
          SELECT COUNT(*) as count FROM events
          WHERE timestamp >= datetime('now', '-24 hours')
        `).get();
        metrics.events_24h += events24h.count;

        // Check if project was active in last 7 days
        const projectActivity = db.db.prepare(`
          SELECT COUNT(*) as count FROM events
          WHERE timestamp >= datetime('now', '-7 days')
        `).get();
        if (projectActivity.count > 0) metrics.active_projects++;

        // Track unique files
        const files = db.db.prepare(`
          SELECT DISTINCT filepath FROM events
        `).all();
        metrics.total_files += files.length;

        // File activity for most active file
        const fileStats = db.db.prepare(`
          SELECT filepath, COUNT(*) as count FROM events
          WHERE timestamp >= datetime('now', '-7 days')
          GROUP BY filepath
        `).all();
        for (const stat of fileStats) {
          const key = `${projectName}/${stat.filepath}`;
          fileActivity.set(key, (fileActivity.get(key) || 0) + stat.count);
        }

        // Error count
        const errors = db.db.prepare('SELECT COUNT(*) as count FROM error_logs').get();
        metrics.error_count += errors.count;

        // Conversation count
        const convos = db.db.prepare('SELECT COUNT(*) as count FROM conversations').get();
        metrics.conversation_count += convos.count;

        // Daily events for average
        const daily = db.db.prepare(`
          SELECT DATE(timestamp) as day, COUNT(*) as count
          FROM events
          WHERE timestamp >= datetime('now', '-7 days')
          GROUP BY day
        `).all();
        dailyEvents.push(...daily.map(d => d.count));

        // Hourly activity
        const hourly = db.db.prepare(`
          SELECT strftime('%H', timestamp) as hour, COUNT(*) as count
          FROM events
          GROUP BY hour
        `).all();
        for (const h of hourly) {
          hourlyActivity.set(h.hour, (hourlyActivity.get(h.hour) || 0) + h.count);
        }
      } catch (dbError) {
        logger.error(`Error querying ${projectName} database:`, dbError);
      }
    }

    // Calculate most active file
    let mostActiveFile = null;
    let maxCount = 0;
    for (const [file, count] of fileActivity.entries()) {
      if (count > maxCount) {
        maxCount = count;
        mostActiveFile = file;
      }
    }
    metrics.most_active_file = mostActiveFile ? { file: mostActiveFile, changes: maxCount } : null;

    // Calculate average events per day
    metrics.avg_events_per_day = dailyEvents.length > 0
      ? Math.round(dailyEvents.reduce((a, b) => a + b, 0) / dailyEvents.length)
      : 0;

    // Find busiest hour
    let busiestHour = null;
    let maxHourCount = 0;
    for (const [hour, count] of hourlyActivity.entries()) {
      if (count > maxHourCount) {
        maxHourCount = count;
        busiestHour = { hour: parseInt(hour), count };
      }
    }
    metrics.busiest_hour = busiestHour;

    res.json({ metrics });
  } catch (error) {
    logger.error('Custom metrics error:', error);
    res.status(500).json({ error: 'Failed to retrieve custom metrics' });
  }
});

// ==================== Global Search API ====================

app.get('/api/search/global', (req, res) => {
  try {
    const query = req.query.q || '';
    const limit = parseInt(req.query.limit) || 50;

    if (!query || query.trim().length < 2) {
      return res.json({ results: [], total: 0, query: '' });
    }

    const searchPattern = `%${query}%`;
    const results = [];

    // Search events (files, changes)
    const eventsSql = `
      SELECT 'event' as type, id, filepath as title, change_type as subtitle,
             timestamp, project_name
      FROM events
      WHERE filepath LIKE ? OR change_type LIKE ?
      ORDER BY timestamp DESC
      LIMIT ?
    `;
    const events = projectState.db.db.prepare(eventsSql).all(searchPattern, searchPattern, limit);
    results.push(...events.map(e => ({
      ...e,
      icon: '📄',
      description: `${e.subtitle} - ${e.project_name || 'Unknown'}`
    })));

    // Search conversations
    const convsSql = `
      SELECT 'conversation' as type, id, tool_name as title, content as subtitle,
             timestamp, project_name
      FROM conversations
      WHERE content LIKE ? OR tool_name LIKE ? OR project_name LIKE ?
      ORDER BY timestamp DESC
      LIMIT ?
    `;
    const convs = projectState.db.db.prepare(convsSql).all(searchPattern, searchPattern, searchPattern, limit);
    results.push(...convs.map(c => ({
      ...c,
      icon: '💬',
      description: c.subtitle ? c.subtitle.substring(0, 100) : ''
    })));

    // Search errors
    const errorsSql = `
      SELECT 'error' as type, id, message as title, severity as subtitle,
             timestamp, '' as project_name
      FROM error_logs
      WHERE message LIKE ? OR context LIKE ?
      ORDER BY timestamp DESC
      LIMIT ?
    `;
    const errors = projectState.db.db.prepare(errorsSql).all(searchPattern, searchPattern, limit);
    results.push(...errors.map(e => ({
      ...e,
      icon: '❌',
      description: `${e.subtitle} severity`
    })));

    // Search notifications
    const notifsSql = `
      SELECT 'notification' as type, id, title, message as subtitle,
             timestamp, '' as project_name
      FROM notifications
      WHERE title LIKE ? OR message LIKE ?
      ORDER BY timestamp DESC
      LIMIT ?
    `;
    const notifs = projectState.db.db.prepare(notifsSql).all(searchPattern, searchPattern, limit);
    results.push(...notifs.map(n => ({
      ...n,
      icon: '🔔',
      description: n.subtitle || ''
    })));

    // Sort all results by timestamp desc and limit
    const sortedResults = results
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, limit);

    res.json({
      query,
      results: sortedResults,
      total: sortedResults.length,
      categories: {
        events: events.length,
        conversations: convs.length,
        errors: errors.length,
        notifications: notifs.length
      }
    });
  } catch (error) {
    logger.error('❌ Global search error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ==================== Multi-Project Health Dashboard API ====================

app.get('/api/health/projects', (req, res) => {
  try {
    const healthData = [];

    // Calculate health for each project
    for (const [projectName, db] of projectDatabases.entries()) {
      try {
        // Component 1: Code Velocity (20 points) - Changes per day over last 7 days
        const velocityData = db.db.prepare(`
          SELECT COUNT(*) as total_changes,
                 JULIANDAY('now') - JULIANDAY(MIN(timestamp)) as days
          FROM events
          WHERE timestamp >= datetime('now', '-7 days')
        `).get();
        const changesPerDay = velocityData.days > 0 ? velocityData.total_changes / velocityData.days : 0;
        const velocityScore = Math.min((changesPerDay / 50) * 20, 20); // Max 20 points if 50+ changes/day

        // Component 2: Rollback Rate (25 points) - Stability measure
        const rollbackData = db.db.prepare(`
          SELECT
            COUNT(DISTINCT e.id) as total_changes,
            COUNT(DISTINCT r.id) as rollback_count
          FROM events e
          LEFT JOIN rollbacks r ON e.id = r.event_id
          WHERE e.timestamp >= datetime('now', '-30 days')
        `).get();
        const rollbackRate = rollbackData.total_changes > 0
          ? rollbackData.rollback_count / rollbackData.total_changes
          : 0;
        const stabilityScore = Math.max((1 - rollbackRate) * 25, 0); // Max 25 points if 0% rollback

        // Component 3: Agent Reliability (20 points) - Agent success rates
        const agentStats = db.db.prepare(`
          SELECT
            agent,
            COUNT(*) as total,
            COUNT(CASE WHEN agent_confidence > 70 THEN 1 END) as high_confidence
          FROM events
          WHERE timestamp >= datetime('now', '-30 days')
          AND agent IS NOT NULL
          GROUP BY agent
        `).all();
        let avgConfidence = 0;
        if (agentStats.length > 0) {
          avgConfidence = agentStats.reduce((sum, a) => sum + (a.high_confidence / a.total), 0) / agentStats.length;
        }
        const reliabilityScore = avgConfidence * 20; // Max 20 points if 100% high confidence

        // Component 4: Change Complexity (15 points) - Smaller, focused changes are better
        const complexityData = db.db.prepare(`
          SELECT AVG(LENGTH(diff)) as avg_diff_size
          FROM events
          WHERE timestamp >= datetime('now', '-7 days')
          AND diff IS NOT NULL
        `).get();
        const avgDiffSize = complexityData.avg_diff_size || 0;
        // Score inversely - smaller changes = better (ideal: 200-500 bytes)
        const complexityScore = avgDiffSize > 0
          ? Math.max(15 - ((avgDiffSize - 350) / 100), 0)
          : 15;

        // Component 5: Activity Recency (20 points) - How recent is development
        const latest = db.db.prepare(`
          SELECT timestamp FROM events ORDER BY timestamp DESC LIMIT 1
        `).get();
        let recencyScore = 0;
        if (latest) {
          const hoursSinceActivity = (Date.now() - new Date(latest.timestamp).getTime()) / (1000 * 60 * 60);
          if (hoursSinceActivity < 1) recencyScore = 20;
          else if (hoursSinceActivity < 6) recencyScore = 18;
          else if (hoursSinceActivity < 24) recencyScore = 15;
          else if (hoursSinceActivity < 72) recencyScore = 10;
          else if (hoursSinceActivity < 168) recencyScore = 5;
        }

        // Calculate total health score (0-100)
        const healthScore = Math.round(
          velocityScore + stabilityScore + reliabilityScore +
          Math.min(complexityScore, 15) + recencyScore
        );

        // Determine status
        let status = 'inactive';
        if (latest) {
          const lastActivityHours = (Date.now() - new Date(latest.timestamp).getTime()) / (1000 * 60 * 60);
          if (lastActivityHours < 1) status = 'active';
          else if (lastActivityHours < 24) status = 'recent';
          else if (lastActivityHours < 168) status = 'idle';
        }

        // Get recent event count
        const recentEvents = db.db.prepare(`
          SELECT COUNT(*) as count FROM events
          WHERE timestamp >= datetime('now', '-24 hours')
        `).get();

        healthData.push({
          name: projectName,
          status,
          health_score: healthScore,
          components: {
            velocity: Math.round(velocityScore),
            stability: Math.round(stabilityScore),
            reliability: Math.round(reliabilityScore),
            complexity: Math.round(Math.min(complexityScore, 15)),
            recency: Math.round(recencyScore)
          },
          metrics: {
            changes_per_day: changesPerDay.toFixed(1),
            rollback_rate: (rollbackRate * 100).toFixed(1) + '%',
            avg_diff_size: Math.round(avgDiffSize),
            hours_since_activity: latest ?
              ((Date.now() - new Date(latest.timestamp).getTime()) / (1000 * 60 * 60)).toFixed(1) :
              null
          },
          recent_events: recentEvents.count || 0,
          last_activity: latest?.timestamp || null
        });
      } catch (projectError) {
        logger.error(`Error calculating health for project ${projectName}:`, projectError);
        // Add project with minimal data on error
        healthData.push({
          name: projectName,
          status: 'error',
          health_score: 0,
          error: 'Failed to calculate health'
        });
      }
    }

    // Sort by health score descending
    healthData.sort((a, b) => b.health_score - a.health_score);

    res.json({
      projects: healthData,
      total_projects: projectDatabases.size,
      active_projects: healthData.filter(p => p.status === 'active').length,
      recent_projects: healthData.filter(p => p.status === 'recent').length,
      idle_projects: healthData.filter(p => p.status === 'idle').length,
      inactive_projects: healthData.filter(p => p.status === 'inactive').length,
      average_health: healthData.length > 0
        ? Math.round(healthData.reduce((sum, p) => sum + p.health_score, 0) / healthData.length)
        : 0
    });
  } catch (error) {
    logger.error('❌ Multi-project health error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ==================== Anomaly Detection API ====================

app.get('/api/anomalies/detect', (req, res) => {
  try {
    const lookbackHours = parseInt(req.query.hours) || 24;
    const threshold = parseFloat(req.query.threshold) || 2.0; // Standard deviations
    const lookbackTime = new Date(Date.now() - lookbackHours * 60 * 60 * 1000).toISOString();

    const allAnomalies = [];

    // Aggregate across all projects
    for (const [projectName, db] of projectDatabases.entries()) {
      try {
        // Get baseline (historical hourly average)
        const baseline = db.db.prepare(`
          SELECT strftime('%H', timestamp) as hour, COUNT(*) as count
          FROM events
          WHERE timestamp < ?
          GROUP BY hour
        `).all(lookbackTime);

        const avgPerHour = baseline.reduce((sum, h) => sum + h.count, 0) / Math.max(baseline.length, 1);
        const stdDev = Math.sqrt(
          baseline.reduce((sum, h) => sum + Math.pow(h.count - avgPerHour, 2), 0) / Math.max(baseline.length, 1)
        );

        // Check recent activity with agent attribution
        const recent = db.db.prepare(`
          SELECT
            strftime('%Y-%m-%d %H:00:00', timestamp) as hour,
            COUNT(*) as event_count,
            SUM(CASE WHEN change_type = 'unlink' THEN 1 ELSE 0 END) as deletions,
            COUNT(DISTINCT filepath) as unique_files,
            agent
          FROM events
          WHERE timestamp >= ?
          GROUP BY hour, agent
          ORDER BY hour DESC
        `).all(lookbackTime);

        // Detect anomalies for this project
        for (const hour of recent) {
          // Activity spike detection
          if (hour.event_count > avgPerHour + (threshold * stdDev)) {
            allAnomalies.push({
              project: projectName,
              type: 'activity_spike',
              severity: 'warning',
              timestamp: hour.hour,
              agent: hour.agent,
              message: `${projectName}: Unusual activity spike - ${hour.event_count} events (avg: ${Math.round(avgPerHour)})`,
              details: {
                event_count: hour.event_count,
                average: Math.round(avgPerHour),
                std_devs: ((hour.event_count - avgPerHour) / Math.max(stdDev, 1)).toFixed(2)
              }
            });
          }

          // Excessive deletions detection
          if (hour.deletions > 10) {
            allAnomalies.push({
              project: projectName,
              type: 'excessive_deletions',
              severity: 'critical',
              timestamp: hour.hour,
              agent: hour.agent,
              message: `${projectName}: High deletion count - ${hour.deletions} files deleted`,
              details: { deletions: hour.deletions, threshold: 10 }
            });
          }
        }

        // Detect hot files (frequently modified)
        const hotFiles = db.db.prepare(`
          SELECT filepath, COUNT(*) as change_count, agent
          FROM events
          WHERE timestamp >= ?
          GROUP BY filepath
          HAVING change_count > 20
          ORDER BY change_count DESC
          LIMIT 5
        `).all(lookbackTime);

        for (const file of hotFiles) {
          allAnomalies.push({
            project: projectName,
            type: 'hot_file',
            severity: 'info',
            timestamp: new Date().toISOString(),
            agent: file.agent,
            message: `${projectName}: File modified frequently - ${file.filepath} (${file.change_count} changes)`,
            details: { filepath: file.filepath, change_count: file.change_count }
          });
        }
      } catch (projectError) {
        logger.error(`Error detecting anomalies for project ${projectName}:`, projectError);
      }
    }

    // Sort by timestamp descending
    allAnomalies.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    res.json({
      lookback_hours: lookbackHours,
      threshold,
      anomalies: allAnomalies,
      total_anomalies: allAnomalies.length,
      projects_scanned: projectDatabases.size
    });
  } catch (error) {
    logger.error('❌ Anomaly detection error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ==================== Historical Trends API ====================

app.get('/api/trends/historical', (req, res) => {
  try {
    const period = req.query.period || 'hourly'; // hourly, daily, weekly
    const days = parseInt(req.query.days) || 7; // last N days

    const now = Date.now();
    const startTime = new Date(now - (days * 24 * 60 * 60 * 1000)).toISOString();

    if (projectDatabases.size === 0) {
      return res.json({
        period,
        days,
        start_time: startTime,
        trends: []
      });
    }

    // Aggregate trends across all projects
    const aggregatedTrends = new Map();

    // Get events grouped by time period from all databases
    const sql = `
      SELECT
        CASE
          WHEN ? = 'hourly' THEN strftime('%Y-%m-%d %H:00:00', timestamp)
          WHEN ? = 'daily' THEN strftime('%Y-%m-%d', timestamp)
          WHEN ? = 'weekly' THEN strftime('%Y-W%W', timestamp)
          ELSE strftime('%Y-%m-%d %H:00:00', timestamp)
        END as period,
        COUNT(*) as event_count,
        SUM(CASE WHEN change_type = 'change' THEN 1 ELSE 0 END) as modifications,
        SUM(CASE WHEN change_type = 'add' THEN 1 ELSE 0 END) as creations,
        SUM(CASE WHEN change_type = 'unlink' THEN 1 ELSE 0 END) as deletions,
        COUNT(DISTINCT filepath) as unique_files
      FROM events
      WHERE timestamp >= ?
      GROUP BY period
      ORDER BY period ASC
    `;

    for (const [projectName, db] of projectDatabases.entries()) {
      try {
        const stmt = db.db.prepare(sql);
        const projectTrends = stmt.all(period, period, period, startTime);

        for (const trend of projectTrends) {
          const existing = aggregatedTrends.get(trend.period) || {
            period: trend.period,
            event_count: 0,
            modifications: 0,
            creations: 0,
            deletions: 0,
            unique_files: 0
          };

          existing.event_count += trend.event_count;
          existing.modifications += trend.modifications;
          existing.creations += trend.creations;
          existing.deletions += trend.deletions;
          existing.unique_files += trend.unique_files;

          aggregatedTrends.set(trend.period, existing);
        }
      } catch (dbError) {
        logger.error(`Error querying trends from ${projectName}:`, dbError);
      }
    }

    // Convert map to sorted array
    const trends = Array.from(aggregatedTrends.values()).sort((a, b) =>
      a.period.localeCompare(b.period)
    );

    res.json({
      period,
      days,
      start_time: startTime,
      trends
    });
  } catch (error) {
    logger.error('❌ Historical trends error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ==================== Agent Monitoring API ====================

// Agent behavior profile
app.get('/api/agents/:agent/profile', (req, res) => {
  try {
    const { agent } = req.params;
    const { project, days } = req.query;

    if (!behaviorProfiler) {
      return res.status(503).json({ error: 'Behavior profiler not initialized' });
    }

    const profile = behaviorProfiler.getAgentProfile(
      project || Array.from(projectDatabases.keys())[0],
      agent,
      parseInt(days) || 30
    );

    if (!profile) {
      return res.status(404).json({ error: 'No data found for this agent' });
    }

    res.json({ profile });
  } catch (error) {
    logger.error('Error getting agent profile:', error);
    res.status(500).json({ error: error.message });
  }
});

// Behavior change detection
app.get('/api/agents/:agent/behavior-change', (req, res) => {
  try {
    const { agent } = req.params;
    const { project, hours } = req.query;

    if (!behaviorProfiler) {
      return res.status(503).json({ error: 'Behavior profiler not initialized' });
    }

    const change = behaviorProfiler.detectBehaviorChange(
      project || Array.from(projectDatabases.keys())[0],
      agent,
      parseInt(hours) || 24
    );

    res.json({ change });
  } catch (error) {
    logger.error('Error detecting behavior change:', error);
    res.status(500).json({ error: error.message });
  }
});

// Agent comparison
app.get('/api/agents/compare', (req, res) => {
  try {
    const { project } = req.query;

    if (!behaviorProfiler) {
      return res.status(503).json({ error: 'Behavior profiler not initialized' });
    }

    const comparison = behaviorProfiler.compareAgents(
      project || Array.from(projectDatabases.keys())[0]
    );

    res.json({ agents: comparison });
  } catch (error) {
    logger.error('Error comparing agents:', error);
    res.status(500).json({ error: error.message });
  }
});

// Find similar changes (pattern matching)
app.post('/api/changes/:id/similar', (req, res) => {
  try {
    const { id } = req.params;
    const { project, limit } = req.query;

    if (!patternMatcher) {
      return res.status(503).json({ error: 'Pattern matcher not initialized' });
    }

    const projectName = project || Array.from(projectDatabases.keys())[0];
    const db = projectDatabases.get(projectName);

    if (!db) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Get the change
    const change = db.db.prepare('SELECT * FROM events WHERE id = ?').get(id);

    if (!change) {
      return res.status(404).json({ error: 'Change not found' });
    }

    const similar = patternMatcher.findSimilarChanges(
      change,
      projectName,
      parseInt(limit) || 5
    );

    res.json({ similar });
  } catch (error) {
    logger.error('Error finding similar changes:', error);
    res.status(500).json({ error: error.message });
  }
});

// Track rollback
app.post('/api/changes/:id/rollback', (req, res) => {
  try {
    const { id } = req.params;
    const { project, reason } = req.body;

    if (!riskAnalyzer) {
      return res.status(503).json({ error: 'Risk analyzer not initialized' });
    }

    const projectName = project || Array.from(projectDatabases.keys())[0];
    const db = projectDatabases.get(projectName);

    if (!db) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const success = riskAnalyzer.trackRollback(db, id, reason, false);

    if (success) {
      // Track rollback in session
      if (sessionTracker) {
        sessionTracker.trackRollback(projectName);
      }

      res.json({ success: true, message: 'Rollback tracked' });
    } else {
      res.status(500).json({ error: 'Failed to track rollback' });
    }
  } catch (error) {
    logger.error('Error tracking rollback:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get rollback patterns
app.get('/api/rollbacks/patterns', (req, res) => {
  try {
    const { project } = req.query;

    if (!patternMatcher) {
      return res.status(503).json({ error: 'Pattern matcher not initialized' });
    }

    const projectName = project || Array.from(projectDatabases.keys())[0];
    const patterns = patternMatcher.analyzeRollbackPatterns(projectName);

    res.json({ patterns });
  } catch (error) {
    logger.error('Error analyzing rollback patterns:', error);
    res.status(500).json({ error: error.message });
  }
});

// ==================== Session Intelligence API ====================

// Get current active session
app.get('/api/sessions/current', (req, res) => {
  try {
    const { project } = req.query;

    if (!sessionTracker) {
      return res.status(503).json({ error: 'Session tracker not initialized' });
    }

    const projectName = project || Array.from(projectDatabases.keys())[0];
    const session = sessionTracker.getActiveSession(projectName);

    if (!session) {
      return res.json({ hasActiveSession: false, session: null });
    }

    // Calculate session duration
    const durationMinutes = (Date.now() - session.startTime) / (1000 * 60);
    const durationHours = durationMinutes / 60;

    res.json({
      hasActiveSession: true,
      session: {
        id: session.id,
        projectName: session.projectName,
        startTime: new Date(session.startTime).toISOString(),
        durationMinutes: Math.round(durationMinutes),
        durationHours: durationHours.toFixed(2),
        changesCount: session.changesCount,
        rollbacksCount: session.rollbacksCount,
        qualityScore: Math.round(session.qualityScore)
      }
    });
  } catch (error) {
    logger.error('Error getting current session:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get session quality analysis
app.get('/api/sessions/quality', (req, res) => {
  try {
    const { project } = req.query;

    if (!sessionTracker) {
      return res.status(503).json({ error: 'Session tracker not initialized' });
    }

    const projectName = project || Array.from(projectDatabases.keys())[0];
    const quality = sessionTracker.calculateSessionQuality(projectName);

    res.json({ quality });
  } catch (error) {
    logger.error('Error calculating session quality:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get break recommendation
app.get('/api/sessions/break-recommendation', (req, res) => {
  try {
    const { project } = req.query;

    if (!sessionTracker) {
      return res.status(503).json({ error: 'Session tracker not initialized' });
    }

    const projectName = project || Array.from(projectDatabases.keys())[0];
    const recommendation = sessionTracker.getBreakRecommendation(projectName);

    res.json({ recommendation });
  } catch (error) {
    logger.error('Error getting break recommendation:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get session statistics
app.get('/api/sessions/stats', (req, res) => {
  try {
    const { project, days } = req.query;

    if (!sessionTracker) {
      return res.status(503).json({ error: 'Session tracker not initialized' });
    }

    const projectName = project || Array.from(projectDatabases.keys())[0];
    const stats = sessionTracker.getSessionStats(projectName, parseInt(days) || 30);

    res.json({ stats });
  } catch (error) {
    logger.error('Error getting session stats:', error);
    res.status(500).json({ error: error.message });
  }
});

// ==================== File Events API ====================

app.get('/api/tracked-files', async (req, res) => {
  try {
    let files = projectState.db.getTrackedFiles();

    // If no files tracked yet (fresh project), try to get files from Git
    if (files.length === 0 && projectState.watchPath) {
      try {
        const { stdout } = await execAsync('git ls-files', {
          cwd: projectState.watchPath,
          maxBuffer: 10 * 1024 * 1024 // 10MB buffer for large repos
        });
        files = stdout.split('\n').filter(f => f.trim() !== '');
        console.log(`📂 Populated file list from Git: ${files.length} files`);
      } catch (gitError) {
        console.log('ℹ️  No Git repository or git ls-files failed, showing empty list');
      }
    }

    res.json(files);
  } catch (error) {
    logger.error('❌ Tracked files error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/events-by-session/:sessionId', (req, res) => {
  try {
    const { sessionId } = req.params;
    const events = projectState.db.getEventsBySession(sessionId);
    res.json(events);
  } catch (error) {
    logger.error('❌ Events by session error:', error);
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
    logger.error('❌ Snapshots error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Restore a file from snapshot
app.post('/api/restore', async (req, res) => {
  try {
    const { eventId, targetPath, filepath, snapshot } = req.body;

    // Support both old API (filepath + snapshot) and new API (eventId + targetPath)
    let snapshotPath;
    let restoredFilepath;

    if (eventId && targetPath) {
      // New API: Look up event and find corresponding snapshot
      const event = projectState.db.getEventById(eventId);
      if (!event) {
        return res.status(404).json({ error: `Event ${eventId} not found` });
      }

      // Find snapshot file
      const snapshotFilename = `${event.filepath.replace(/\//g, '_')}_${new Date(event.timestamp).getTime()}.gz`;
      snapshotPath = join(projectState.snapshotsDir, snapshotFilename);
      restoredFilepath = targetPath;

      // Check if snapshot exists
      if (!fs.existsSync(snapshotPath)) {
        return res.status(404).json({
          error: `Snapshot not found: ${snapshotFilename}`,
          details: 'The snapshot file may have been cleaned up or deleted'
        });
      }
    } else if (filepath && snapshot) {
      // Old API: Direct snapshot restoration
      snapshotPath = join(projectState.snapshotsDir, snapshot);
      restoredFilepath = filepath;
    } else {
      return res.status(400).json({
        error: 'Missing required parameters. Provide either (eventId + targetPath) or (filepath + snapshot)'
      });
    }

    // Read snapshot (may be compressed or uncompressed for backwards compatibility)
    const data = await fs.promises.readFile(snapshotPath);

    // Decompress if it's a .gz file, otherwise treat as plain text
    let content;
    if (snapshotPath.endsWith('.gz')) {
      const decompressed = await gunzipAsync(data);
      content = decompressed.toString('utf8');
    } else {
      content = data.toString('utf8');
    }

    // Restore to original location
    const targetFilePath = join(projectState.watchPath, restoredFilepath);
    await fs.promises.writeFile(targetFilePath, content, 'utf8');

    logger.info(`🔄 Restored ${restoredFilepath} from snapshot`, {
      event_id: eventId,
      snapshot_path: snapshotPath
    });

    res.json({
      success: true,
      message: `File ${restoredFilepath} successfully restored`,
      filepath: restoredFilepath,
      event_id: eventId
    });
  } catch (error) {
    logger.error('❌ Restore error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get file events (from events table)
app.get('/api/file-events', (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;
    const includeDiff = req.query.diff === 'true';
    const projectName = req.query.project;

    let db;
    if (projectName) {
      // Get database for specific project
      db = projectDatabases.get(projectName);
      if (!db) {
        return res.status(404).json({ error: `Project '${projectName}' not found` });
      }
    } else {
      // Use active project database
      if (!projectState.db) {
        return res.status(500).json({ error: 'No active project database' });
      }
      db = projectState.db;
    }

    const events = db.getRecentFileEvents(limit, includeDiff);

    // Get total count
    const totalCount = db.getTotalEventCount ? db.getTotalEventCount() : events.length;

    res.json({
      events: events,
      total: totalCount,
      project: projectName || projectState.activeProject
    });
  } catch (error) {
    logger.error('File events error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get file events from ALL projects (multi-project aggregation)
app.get('/api/all-file-events', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;
    const includeDiff = req.query.diff === 'true';

    // Parallelize event collection from all projects
    const eventsPromises = Array.from(projectDatabases.entries()).map(
      ([projectName, db]) => Promise.resolve({
        projectName,
        events: db.getRecentFileEvents(limit, includeDiff)
      })
    );

    const allProjectEvents = await Promise.all(eventsPromises);

    // Collect and tag events with project names
    const allEvents = [];
    for (const { projectName, events } of allProjectEvents) {
      events.forEach(event => {
        event.project = projectName;
      });
      allEvents.push(...events);
    }

    // Sort by timestamp (newest first) and limit
    allEvents.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    const limitedEvents = allEvents.slice(0, limit);

    res.json(limitedEvents);
  } catch (error) {
    logger.error('❌ All file events error:', error);
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
    logger.error('❌ Activity log error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ==================== Custom Triggers API ====================

app.get('/api/triggers-config', (req, res) => {
  try {
    const triggers = triggerEngine.getTriggersConfig();
    res.json({ rules: triggers });
  } catch (error) {
    logger.error('❌ Triggers config error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/triggered-events', (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;
    const events = triggerEngine.getTriggeredEvents(limit);
    res.json(events);
  } catch (error) {
    logger.error('❌ Triggered events error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/trigger-stats', (req, res) => {
  try {
    const stats = triggerEngine.getTriggerStats();
    res.json(stats);
  } catch (error) {
    logger.error('❌ Trigger stats error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/triggers-reload', (req, res) => {
  try {
    const message = triggerEngine.reloadConfig();
    res.json({ message });
  } catch (error) {
    logger.error('❌ Triggers reload error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/triggers-clear-cooldowns', (req, res) => {
  try {
    const message = triggerEngine.clearCooldowns();
    res.json({ message });
  } catch (error) {
    logger.error('❌ Clear cooldowns error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ==================== Changelog ====================

app.get('/api/changelog', async (req, res) => {
  try {
    // Read CHANGELOG.md file
    const changelogPath = join(process.cwd(), '..', 'docs', 'CHANGELOG.md');

    try {
      await fsPromises.access(changelogPath);
    } catch (err) {
      return res.status(404).json({ error: 'CHANGELOG.md not found', changelog: [] });
    }

    const changelogContent = await fsPromises.readFile(changelogPath, 'utf8');

    // Parse the changelog
    const releases = [];
    const lines = changelogContent.split('\n');

    let currentRelease = null;
    let currentSection = null;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      // Match version headers: ## [0.8.0] - 2025-10-20
      const versionMatch = line.match(/^##\s+\[([^\]]+)\]\s+-\s+(\d{4}-\d{2}-\d{2})/);
      if (versionMatch) {
        // Save previous release
        if (currentRelease) {
          releases.push(currentRelease);
        }

        // Start new release
        currentRelease = {
          version: versionMatch[1],
          date: versionMatch[2],
          title: null,
          changes: []
        };
        currentSection = null;
        continue;
      }

      // Match section headers: ### Added, ### Fixed, etc.
      const sectionMatch = line.match(/^###\s+(.+)/);
      if (sectionMatch && currentRelease) {
        currentSection = sectionMatch[1].toLowerCase();
        continue;
      }

      // Match bullet points with emoji: - ✨ **Feature Name**
      const bulletMatch = line.match(/^-\s+([🎉✨🐛📝🚀🔒🏗️⚡])\s+(.+)/);
      if (bulletMatch && currentRelease) {
        const emoji = bulletMatch[1];
        const description = bulletMatch[2].replace(/\*\*/g, ''); // Remove bold markdown

        // Map emoji to type
        let type = 'improvement';
        if (emoji === '✨') type = 'feature';
        else if (emoji === '🐛') type = 'fix';
        else if (emoji === '📝') type = 'docs';
        else if (emoji === '🚀' || emoji === '⚡') type = 'improvement';
        else if (emoji === '🔒') type = 'security';
        else if (emoji === '🏗️') type = 'feature';
        else if (emoji === '🎉') type = 'feature';

        currentRelease.changes.push({
          type,
          description
        });
        continue;
      }

      // Match regular bullet points: - Text
      const simpleBulletMatch = line.match(/^-\s+(.+)/);
      if (simpleBulletMatch && currentRelease && currentSection) {
        let description = simpleBulletMatch[1].replace(/\*\*/g, ''); // Remove bold markdown

        // Map section to type
        let type = 'improvement';
        if (currentSection === 'added') type = 'feature';
        else if (currentSection === 'fixed') type = 'fix';
        else if (currentSection === 'changed') type = 'improvement';
        else if (currentSection === 'performance') type = 'improvement';
        else if (currentSection === 'security') type = 'security';

        currentRelease.changes.push({
          type,
          description
        });
      }
    }

    // Don't forget the last release
    if (currentRelease) {
      releases.push(currentRelease);
    }

    res.json(releases);
  } catch (error) {
    logger.error('❌ Changelog error:', error);
    res.status(500).json({ error: error.message, changelog: [] });
  }
});

// Helper functions for changelog
function getWeekKey(dateStr) {
  const date = new Date(dateStr);
  const year = date.getFullYear();
  const week = getWeekNumber(date);
  return `${year}-W${String(week).padStart(2, '0')}`;
}

function getWeekNumber(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

function detectChangeType(subject, body) {
  const text = (subject + ' ' + body).toLowerCase();

  // Check for explicit type markers
  if (text.match(/^(feat|feature):/i)) return 'feature';
  if (text.match(/^fix:/i)) return 'fix';
  if (text.match(/^improve|improvement|perf|performance:/i)) return 'improvement';
  if (text.match(/^breaking:/i)) return 'breaking';
  if (text.match(/^security|sec:/i)) return 'security';
  if (text.match(/^docs?:/i)) return 'docs';

  // Infer from content
  if (text.includes('add') || text.includes('implement') || text.includes('create')) return 'feature';
  if (text.includes('fix') || text.includes('bug') || text.includes('issue')) return 'fix';
  if (text.includes('improve') || text.includes('enhance') || text.includes('update') || text.includes('polish')) return 'improvement';
  if (text.includes('break') || text.includes('remove')) return 'breaking';
  if (text.includes('security') || text.includes('vulnerability')) return 'security';
  if (text.includes('doc') || text.includes('readme')) return 'docs';

  return 'improvement'; // Default
}

function cleanDescription(subject) {
  // Remove common prefixes
  return subject
    .replace(/^(feat|feature|fix|improve|improvement|perf|performance|breaking|security|sec|docs?):\s*/i, '')
    .trim();
}

// ==================== User Preferences ====================

// Simple in-memory storage for user preferences (could be moved to DB later)
const userPreferences = new Map();

// GET user preferences
app.get('/api/preferences', (req, res) => {
  try {
    const userId = req.query.userId || 'default';
    const preferences = userPreferences.get(userId) || {
      notifications: {
        enabled: true,
        showToasts: true,
        soundEnabled: false,
        desktopNotifications: false,
        types: {
          errors: true,
          warnings: true,
          triggers: true,
          performance: false,
          info: true
        }
      },
      ui: {
        theme: 'theme--night',
        compactMode: false,
        animationsEnabled: true,
        autoRefresh: true,
        refreshInterval: 10
      },
      performance: {
        enableMetrics: true,
        metricsInterval: 10,
        enableFileWatcher: true,
        maxEventsDisplay: 100
      }
    };

    res.json(preferences);
  } catch (error) {
    logger.error('❌ Failed to get preferences:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST user preferences (save/update)
app.post('/api/preferences', (req, res) => {
  try {
    const userId = req.body.userId || 'default';
    const preferences = req.body.preferences;

    if (!preferences) {
      return res.status(400).json({ error: 'Preferences data required' });
    }

    userPreferences.set(userId, preferences);

    logger.info(`💾 Saved preferences for user: ${userId}`);
    res.json({ success: true, message: 'Preferences saved successfully' });
  } catch (error) {
    logger.error('❌ Failed to save preferences:', error);
    res.status(500).json({ error: error.message });
  }
});

// ==================== Health Check ====================

app.get('/health', async (req, res) => {
  try {
    // Return cached response if still valid (reduces expensive queries)
    const cachedHealth = getHealthCache();
    if (cachedHealth) {
      return res.json(cachedHealth);
    }

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
      logger.error('Error getting database size:', error);
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
      // Optimized: Use SQL COUNT queries instead of loading all events
      const totalCount = projectState.db.db.prepare('SELECT COUNT(*) as count FROM events').get();
      dbAnalytics.totalEvents = totalCount.count;
      dbAnalytics.recentEvents = Math.min(1000, totalCount.count);

      // Get date range efficiently
      const dateRange = projectState.db.db.prepare(
        'SELECT MIN(timestamp) as oldest, MAX(timestamp) as newest FROM events'
      ).get();

      if (dateRange.oldest) {
        dbAnalytics.oldestEventDate = dateRange.oldest;
        dbAnalytics.newestEventDate = dateRange.newest;
      }

      // Count event types efficiently
      const eventTypes = projectState.db.db.prepare(
        'SELECT change_type, COUNT(*) as count FROM events GROUP BY change_type'
      ).all();

      eventTypes.forEach(row => {
        if (row.change_type === 'add') dbAnalytics.eventBreakdown.add = row.count;
        else if (row.change_type === 'change') dbAnalytics.eventBreakdown.change = row.count;
        else if (row.change_type === 'unlink') dbAnalytics.eventBreakdown.unlink = row.count;
      });
    } catch (error) {
      logger.error('Error getting database analytics:', error);
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

    // Telemetry bridge status check
    let bridgeStatus = {
      running: false,
      pid: null,
      healthy: false
    };

    try {
      const bridgePidFile = '/tmp/claude-telemetry-bridge.pid';
      if (fs.existsSync(bridgePidFile)) {
        const bridgePid = parseInt(fs.readFileSync(bridgePidFile, 'utf-8').trim());

        // Check if process is actually running
        try {
          // process.kill with signal 0 doesn't actually kill, just checks if process exists
          process.kill(bridgePid, 0);
          bridgeStatus.running = true;
          bridgeStatus.pid = bridgePid;
          bridgeStatus.healthy = true;
        } catch (err) {
          // Process doesn't exist
          bridgeStatus.running = false;
          bridgeStatus.healthy = false;
        }
      }
    } catch (err) {
      logger.error('Error checking bridge status:', err);
    }

    // Read version from package.json
    let version = '0.8.0';
    try {
      const packageJson = JSON.parse(readFileSync('./package.json', 'utf-8'));
      version = packageJson.version;
    } catch (err) {
      logger.error('Failed to read version:', err);
    }

    // Database health check
    let databaseHealth = {
      status: 'healthy',
      size: dbSize,
      accessible: true,
      lastError: null
    };

    try {
      // Try to query database to verify it's accessible
      const testQuery = projectState.db.db.prepare('SELECT COUNT(*) as count FROM sqlite_master').get();
      databaseHealth.accessible = true;
      databaseHealth.status = 'healthy';
    } catch (err) {
      databaseHealth.accessible = false;
      databaseHealth.status = 'error';
      databaseHealth.lastError = err.message;
    }

    const healthData = {
      status: 'healthy',
      version: version,
      session_id: SESSION_ID,
      uptime: uptime,
      active_agents: agentRegistry.size,
      active_project: projectState.activeProject,
      database: projectState.dbPath,
      database_health: databaseHealth,

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
      process: processInfo,

      // Telemetry bridge status
      telemetry_bridge: bridgeStatus
    };

    // Cache the result
    updateHealthCache(healthData);

    res.json(healthData);
  } catch (error) {
    logger.error('Health check error:', error);
    res.status(500).json({
      status: 'error',
      error: error.message
    });
  }
});

// GET /api/endpoints - Discover all registered API endpoints
app.get('/api/endpoints', (req, res) => {
  try {
    const endpoints = [];
    const routes = [];

    // Helper to extract routes from Express app stack
    function extractRoutes(stack, basePath = '') {
      stack.forEach(layer => {
        if (layer.route) {
          // This is a route
          const path = basePath + layer.route.path;
          const methods = Object.keys(layer.route.methods).map(m => m.toUpperCase());

          methods.forEach(method => {
            routes.push({ method, path });
          });
        } else if (layer.name === 'router' && layer.handle.stack) {
          // This is a sub-router (e.g., router.use('/api', router))
          const routerPath = layer.regexp.source
            .replace('\\/?', '')
            .replace('(?=\\/|$)', '')
            .replace(/\\\//g, '/')
            .replace(/\^/g, '')
            .replace(/\$/g, '');

          extractRoutes(layer.handle.stack, basePath + routerPath);
        }
      });
    }

    // Extract all routes from app
    extractRoutes(app._router.stack);

    // Categorize endpoints
    const categorizeEndpoint = (path) => {
      if (path.startsWith('/api/sync')) return 'Sync';
      if (path.startsWith('/api/storage')) return 'Storage';
      if (path.startsWith('/api/git')) return 'Git';
      if (path.startsWith('/api/projects')) return 'Projects';
      if (path.startsWith('/api/notifications')) return 'Notifications';
      if (path.startsWith('/api/errors')) return 'Errors';
      if (path.startsWith('/api/agents')) return 'Agents';
      if (path.startsWith('/api/agent')) return 'Agents';
      if (path.startsWith('/api/metrics') || path.startsWith('/api/system-metrics') || path.startsWith('/api/process-metrics') || path.startsWith('/api/performance')) return 'Metrics';
      if (path.startsWith('/api/triggers') || path.startsWith('/api/triggered')) return 'Triggers';
      if (path.startsWith('/api/file') || path.startsWith('/api/tracked-files') || path.startsWith('/api/events-by')) return 'Files';
      if (path.startsWith('/api/control')) return 'Control';
      if (path.startsWith('/api/dashboard') || path.startsWith('/api/top-') || path.startsWith('/api/longest-')) return 'Dashboard';
      if (path.startsWith('/api/docs')) return 'Documentation';
      if (path.startsWith('/api/changelog')) return 'Changelog';
      if (path.includes('health') || path.includes('session-id')) return 'Core';
      return 'Other';
    };

    // Build endpoint list with categories
    routes.forEach(route => {
      endpoints.push({
        category: categorizeEndpoint(route.path),
        method: route.method,
        path: route.path,
        description: route.path.split('/').pop().replace(/-/g, ' ')
      });
    });

    // Sort by category then path
    endpoints.sort((a, b) => {
      if (a.category !== b.category) {
        return a.category.localeCompare(b.category);
      }
      return a.path.localeCompare(b.path);
    });

    res.json({
      total: endpoints.length,
      endpoints
    });
  } catch (error) {
    logger.error('❌ Error discovering endpoints:', error);
    res.status(500).json({ error: 'Failed to discover endpoints' });
  }
});

// ==================== Control Actions (NOW MODULAR - see routes/control.js) ====================
// Deleted: /api/control/clear-cache, /api/control/restart-watcher, /api/control/restart-bridge, /api/control/export-health

// Database cleanup endpoint (not yet modularized)
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
    // Security: Whitelist of allowed tables to prevent SQL injection
    const ALLOWED_TABLES = ['events', 'agent_events', 'raven_metrics', 'process_metrics', 'error_logs', 'notifications'];
    const tables = ['events', 'agent_events', 'raven_metrics', 'process_metrics'];
    let totalDeleted = 0;

    for (const table of tables) {
      // Security: Validate table name is in whitelist
      if (!ALLOWED_TABLES.includes(table)) {
        logger.error(`❌ Security: Attempted to delete from non-whitelisted table: ${table}`);
        continue;
      }

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
    logger.error('Error clearing old database entries:', error);
    res.status(500).json({ error: error.message });
  }
});

// ==================== Project Management API ====================

app.get('/api/projects/list', (req, res) => {
  try {
    // Return full project objects with name, path, and description
    const projects = projectState.availableProjects.map(p => ({
      name: p.name,
      path: p.path,
      description: p.description || `Project: ${p.name}`
    }));
    res.json({
      projects,
      active: projectState.activeProject
    });
  } catch (error) {
    logger.error('Projects list error:', error);
    res.status(500).json({ error: 'Failed to retrieve projects list' });
  }
});

app.post('/api/projects/refresh', async (req, res) => {
  try {
    // Re-scan for projects
    const newProjects = discoverProjects();

    if (newProjects.length > 0) {
      // Protected by mutex to prevent race conditions with project switching
      await projectStateMutex.runExclusive(async () => {
        projectState.availableProjects = newProjects;

        // If current active project no longer exists, switch to first available
        const activeExists = newProjects.find(p => p.name === projectState.activeProject);
        if (!activeExists && newProjects.length > 0) {
          projectState.activeProject = newProjects[0].name;
        }
      });

      console.log(`✅ Refreshed projects: ${newProjects.length} found`);
      res.json({
        success: true,
        projects: newProjects.map(p => p.name),
        active: projectState.activeProject,
        message: `Found ${newProjects.length} projects`
      });
    } else {
      res.json({
        success: false,
        message: 'No projects found',
        projects: [],
        active: projectState.activeProject
      });
    }
  } catch (error) {
    logger.error('❌ Projects refresh error:', error);
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

    // Persist the active project to config file
    try {
      const configContent = await fsPromises.readFile(CONFIG_PATH, 'utf8');
      const updatedConfig = configContent.replace(
        /^active\s*=\s*".*"$/m,
        `active = "${project}"`
      );
      await fsPromises.writeFile(CONFIG_PATH, updatedConfig, 'utf8');
      logger.info(`💾 Persisted active project: ${project}`);
    } catch (configError) {
      logger.error('⚠️  Failed to persist project selection:', configError.message);
      // Don't fail the request if we can't persist - the switch still worked
    }

    res.json({
      success: true,
      project,
      message: `Switched to project: ${project}`
    });
  } catch (error) {
    logger.error('❌ Project select error:', error);
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/projects/:name - Update project settings (toggle enabled, etc.)
app.put('/api/projects/:name', async (req, res) => {
  try {
    const projectName = req.params.name;
    const updates = req.body;

    // Find the project in available projects
    const projectIndex = projectState.availableProjects.findIndex(p => p.name === projectName);

    if (projectIndex === -1) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Update project properties
    projectState.availableProjects[projectIndex] = {
      ...projectState.availableProjects[projectIndex],
      ...updates
    };

    logger.info(`Project ${projectName} updated:`, updates);
    res.json({ success: true, project: projectState.availableProjects[projectIndex] });
  } catch (error) {
    logger.error('Update project error:', error);
    res.status(500).json({ error: 'Failed to update project' });
  }
});

// DELETE /api/projects/:name - Remove project from monitoring
app.delete('/api/projects/:name', async (req, res) => {
  try {
    const projectName = req.params.name;
    const deleteDb = req.query.deleteDb === 'true';

    // Find the project
    const projectIndex = projectState.availableProjects.findIndex(p => p.name === projectName);

    if (projectIndex === -1) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Remove from available projects
    projectState.availableProjects.splice(projectIndex, 1);

    // If deleting database, remove it
    if (deleteDb) {
      const dbPath = path.join(projectsDir, '../.raven/db', `${projectName}.db`);
      try {
        await fs.promises.unlink(dbPath);
        logger.info(`Deleted database for project: ${projectName}`);
      } catch (err) {
        logger.warn(`Failed to delete database for ${projectName}:`, err);
      }
    }

    // If this was the active project, switch to first available
    if (projectState.activeProject === projectName) {
      if (projectState.availableProjects.length > 0) {
        await switchToProject(projectState.availableProjects[0].name);
      }
    }

    logger.info(`Project ${projectName} removed`);
    res.json({ success: true, message: 'Project removed' });
  } catch (error) {
    logger.error('Delete project error:', error);
    res.status(500).json({ error: 'Failed to delete project' });
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
    logger.error('❌ Git status error:', error);
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
    logger.error('❌ Git branches error:', error);
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
    logger.error('❌ Git history error:', error);
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
    logger.error('❌ Git diff error:', error);
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
    logger.error('❌ Git uncommitted diff error:', error);
    res.status(500).json({ error: error.message, diff: '' });
  }
});

// ==================== Documentation API ====================

/**
 * GET /api/docs/list
 * Get list of all available documentation files
 */
app.get('/api/docs/list', (req, res) => {
  try {
    const docsDir = join(process.cwd(), '..', 'docs');

    const getMarkdownFiles = (dir, baseDir = dir) => {
      const files = [];
      const entries = fs.readdirSync(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = join(dir, entry.name);

        if (entry.isDirectory()) {
          // Recursively get files from subdirectories
          files.push(...getMarkdownFiles(fullPath, baseDir));
        } else if (entry.name.endsWith('.md')) {
          // Get relative path from docs directory
          const relativePath = fullPath.replace(baseDir + '/', '');
          files.push({
            path: relativePath,
            name: entry.name,
            title: entry.name.replace(/\.md$/, ''),
            category: relativePath.includes('/') ? relativePath.split('/')[0] : 'root'
          });
        }
      }

      return files;
    };

    const docs = getMarkdownFiles(docsDir);

    // Organize by category
    const organized = {
      root: [],
      api: [],
      guides: [],
      other: []
    };

    docs.forEach(doc => {
      if (doc.category === 'root') {
        organized.root.push(doc);
      } else if (doc.category === 'api') {
        organized.api.push(doc);
      } else {
        organized.other.push(doc);
      }
    });

    res.json({
      total: docs.length,
      docs: organized,
      all: docs
    });
  } catch (error) {
    logger.error('❌ Documentation list error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/docs/README.md
 * Get a specific documentation file
 */
app.get('/api/docs/:filepath(*)', async (req, res) => {
  try {
    const { filepath } = req.params;

    // Security: only allow .md files in docs/ directory
    if (!filepath.endsWith('.md')) {
      return res.status(400).json({ error: 'Only markdown files allowed' });
    }

    // Security: Prevent path traversal attacks
    const docsDir = normalize(join(process.cwd(), '..', 'docs'));
    const docsPath = normalize(join(process.cwd(), '..', 'docs', filepath));

    // Ensure the resolved path is still within the docs directory
    if (!docsPath.startsWith(docsDir)) {
      return res.status(403).json({ error: 'Access denied: Path traversal attempt detected' });
    }

    // Check if file exists
    try {
      await fsPromises.access(docsPath);
    } catch (err) {
      return res.status(404).json({ error: 'Documentation file not found' });
    }

    // Read markdown file
    const markdown = await fsPromises.readFile(docsPath, 'utf8');

    res.json({
      filepath,
      markdown,
      title: filepath.replace(/\.md$/, '').replace(/\//g, ' / ')
    });
  } catch (error) {
    logger.error('❌ Documentation error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ==================== Error Logging API ====================

/**
 * GET /api/errors
 * Get error logs with search and filter
 */
app.get('/api/errors', (req, res) => {
  try {
    const options = {
      limit: parseInt(req.query.limit) || 100,
      offset: parseInt(req.query.offset) || 0,
      search: req.query.search || '',
      severity: req.query.severity || 'all',
      startDate: req.query.startDate || null,
      endDate: req.query.endDate || null
    };

    const result = projectState.db.getErrorLogs(options);
    res.json(result);
  } catch (error) {
    logger.error('❌ Get errors endpoint error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/errors/stats
 * Get error statistics
 */
app.get('/api/errors/stats', (req, res) => {
  try {
    const projectName = req.query.project;

    let db;
    if (projectName) {
      // Get database for specific project
      db = projectDatabases.get(projectName);
      if (!db) {
        return res.status(404).json({ error: `Project '${projectName}' not found` });
      }
    } else {
      // Use active project database
      if (!projectState.db) {
        return res.status(500).json({ error: 'No active project database' });
      }
      db = projectState.db;
    }

    const stats = db.getErrorStats();

    // Ensure we return total field even if getErrorStats doesn't provide it
    if (!stats.total && stats.count !== undefined) {
      stats.total = stats.count;
    } else if (!stats.total) {
      stats.total = 0;
    }

    res.json(stats);
  } catch (error) {
    logger.error('Error stats endpoint error:', error);
    res.status(500).json({ error: error.message, total: 0 });
  }
});

/**
 * DELETE /api/errors
 * Clear error logs
 */
app.delete('/api/errors', (req, res) => {
  try {
    const olderThanDays = req.query.olderThanDays ? parseInt(req.query.olderThanDays) : null;
    const deletedCount = projectState.db.clearErrorLogs(olderThanDays);

    console.log(`🗑️  Cleared ${deletedCount} error logs`);

    res.json({
      success: true,
      deletedCount,
      message: olderThanDays
        ? `Deleted ${deletedCount} errors older than ${olderThanDays} days`
        : `Deleted all ${deletedCount} errors`
    });
  } catch (error) {
    logger.error('❌ Clear errors endpoint error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ==================== Notification endpoints ====================

app.get('/api/notifications', (req, res) => {
  try {
    const options = {
      limit: parseInt(req.query.limit) || 50,
      offset: parseInt(req.query.offset) || 0,
      type: req.query.type || 'all',
      severity: req.query.severity || 'all',
      unread_only: req.query.unread_only === 'true'
    };

    const result = projectState.db.getNotifications(options);
    res.json(result);
  } catch (error) {
    logger.error('❌ Error fetching notifications:', error);
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
});

app.get('/api/notifications/stats', (req, res) => {
  try {
    const stats = projectState.db.getNotificationStats();
    res.json(stats);
  } catch (error) {
    logger.error('❌ Error fetching notification stats:', error);
    res.status(500).json({ error: 'Failed to fetch notification stats' });
  }
});

app.post('/api/notifications/:id/read', (req, res) => {
  try {
    const id = parseInt(req.params.id);
    projectState.db.markNotificationAsRead(id);
    res.json({ success: true });
  } catch (error) {
    logger.error('❌ Error marking notification as read:', error);
    res.status(500).json({ error: 'Failed to mark notification as read' });
  }
});

app.post('/api/notifications/mark-all-read', (req, res) => {
  try {
    projectState.db.markAllNotificationsAsRead();
    res.json({ success: true });
  } catch (error) {
    logger.error('❌ Error marking all notifications as read:', error);
    res.status(500).json({ error: 'Failed to mark all notifications as read' });
  }
});

app.delete('/api/notifications/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id);
    projectState.db.deleteNotification(id);
    res.json({ success: true });
  } catch (error) {
    logger.error('❌ Error deleting notification:', error);
    res.status(500).json({ error: 'Failed to delete notification' });
  }
});

app.delete('/api/notifications', (req, res) => {
  try {
    const olderThanDays = req.query.olderThanDays ? parseInt(req.query.olderThanDays) : null;
    const result = projectState.db.clearNotifications(olderThanDays);
    res.json(result);
  } catch (error) {
    logger.error('❌ Error clearing notifications:', error);
    res.status(500).json({ error: 'Failed to clear notifications' });
  }
});

// ==================== Storage Statistics ====================

// GET /api/storage - Get comprehensive storage statistics
app.get('/api/storage', async (req, res) => {
  try {
    const dbDir = join(RAVEN_DIR, 'db');
    const snapshotsDir = join(RAVEN_DIR, 'snapshots');

    // Get all database files
    const databases = [];
    const dbFiles = fs.readdirSync(dbDir).filter(f => f.endsWith('.db'));

    for (const dbFile of dbFiles) {
      const dbPath = join(dbDir, dbFile);
      const stats = fs.statSync(dbPath);
      const dbName = dbFile.replace('.db', '');

      // Try to get record counts
      let recordCounts = {};
      let tableStats = [];
      try {
        const Database = (await import('better-sqlite3')).default;
        const db = new Database(dbPath, { readonly: true });

        // Get record counts for each table
        const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all();
        let totalRecords = 0;

        for (const table of tables) {
          const count = db.prepare(`SELECT COUNT(*) as count FROM ${table.name}`).get();
          recordCounts[table.name] = count.count;
          totalRecords += count.count;

          // Get table size
          const sizeQuery = db.prepare('SELECT SUM(pgsize) as size FROM dbstat WHERE name = ?').get(table.name);
          tableStats.push({
            name: table.name,
            records: count.count,
            size: sizeQuery?.size || 0
          });
        }

        db.close();

        databases.push({
          name: dbName,
          filename: dbFile,
          size: stats.size,
          totalRecords,
          recordCounts,
          tableStats: tableStats.sort((a, b) => b.size - a.size),
          modified: stats.mtime,
          isActive: dbName === projectState.activeProject
        });
      } catch (err) {
        databases.push({
          name: dbName,
          filename: dbFile,
          size: stats.size,
          totalRecords: 0,
          recordCounts: {},
          tableStats: [],
          modified: stats.mtime,
          isActive: dbName === projectState.activeProject,
          error: 'Failed to read database'
        });
      }
    }

    // Get snapshot directory stats
    const snapshots = [];
    if (fs.existsSync(snapshotsDir)) {
      const snapshotProjects = fs.readdirSync(snapshotsDir);

      for (const project of snapshotProjects) {
        const projectSnapshotPath = join(snapshotsDir, project);
        const stat = fs.statSync(projectSnapshotPath);

        if (stat.isDirectory()) {
          const files = fs.readdirSync(projectSnapshotPath);
          let totalSize = 0;
          let oldestFile = null;
          let newestFile = null;

          for (const file of files) {
            const filePath = join(projectSnapshotPath, file);
            const fileStat = fs.statSync(filePath);
            totalSize += fileStat.size;

            if (!oldestFile || fileStat.mtime < oldestFile) {
              oldestFile = fileStat.mtime;
            }
            if (!newestFile || fileStat.mtime > newestFile) {
              newestFile = fileStat.mtime;
            }
          }

          snapshots.push({
            project,
            files: files.length,
            size: totalSize,
            oldest: oldestFile,
            newest: newestFile
          });
        }
      }
    }

    // Get total .raven directory size
    const getRavenDirSize = (dirPath) => {
      let totalSize = 0;
      const items = fs.readdirSync(dirPath);

      for (const item of items) {
        const itemPath = join(dirPath, item);
        const stat = fs.statSync(itemPath);

        if (stat.isDirectory()) {
          totalSize += getRavenDirSize(itemPath);
        } else {
          totalSize += stat.size;
        }
      }

      return totalSize;
    };

    const totalSize = getRavenDirSize(RAVEN_DIR);

    // Get other files
    const configSize = fs.existsSync(join(RAVEN_DIR, 'config.toml'))
      ? fs.statSync(join(RAVEN_DIR, 'config.toml')).size
      : 0;
    const triggersLogSize = fs.existsSync(join(RAVEN_DIR, 'triggers.log'))
      ? fs.statSync(join(RAVEN_DIR, 'triggers.log')).size
      : 0;

    res.json({
      totalSize,
      databases: databases.sort((a, b) => b.size - a.size),
      snapshots: snapshots.sort((a, b) => b.size - a.size),
      otherFiles: {
        config: configSize,
        triggersLog: triggersLogSize
      },
      ravenDir: RAVEN_DIR,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('❌ Error getting storage stats:', error);
    res.status(500).json({ error: 'Failed to get storage statistics' });
  }
});

// POST /api/storage/export/:dbname - Export a database file
app.get('/api/storage/export/:dbname', async (req, res) => {
  try {
    const { dbname } = req.params;

    // Validate database name to prevent path traversal
    if (!dbname || dbname.includes('..') || dbname.includes('/') || !dbname.match(/^[a-zA-Z0-9_-]+$/)) {
      return res.status(400).json({ error: 'Invalid database name' });
    }

    const dbPath = join(RAVEN_DIR, 'db', `${dbname}.db`);

    if (!fs.existsSync(dbPath)) {
      return res.status(404).json({ error: 'Database not found' });
    }

    // Send the file for download
    res.download(dbPath, `${dbname}_${Date.now()}.db`, (err) => {
      if (err) {
        logger.error('❌ Error sending database file:', err);
        if (!res.headersSent) {
          res.status(500).json({ error: 'Failed to export database' });
        }
      }
    });
  } catch (error) {
    logger.error('❌ Error exporting database:', error);
    res.status(500).json({ error: 'Failed to export database' });
  }
});

// POST /api/storage/vacuum/:dbname - Run VACUUM on a database
app.post('/api/storage/vacuum/:dbname', async (req, res) => {
  try {
    const { dbname } = req.params;

    // Validate database name
    if (!dbname || dbname.includes('..') || dbname.includes('/') || !dbname.match(/^[a-zA-Z0-9_-]+$/)) {
      return res.status(400).json({ error: 'Invalid database name' });
    }

    const dbPath = join(RAVEN_DIR, 'db', `${dbname}.db`);

    if (!fs.existsSync(dbPath)) {
      return res.status(404).json({ error: 'Database not found' });
    }

    // Get size before VACUUM
    const statsBefore = fs.statSync(dbPath);
    const sizeBefore = statsBefore.size;

    // Run VACUUM
    const Database = (await import('better-sqlite3')).default;
    const db = new Database(dbPath);
    db.pragma('wal_checkpoint(TRUNCATE)'); // Checkpoint WAL first
    db.exec('VACUUM');
    db.close();

    // Get size after VACUUM
    const statsAfter = fs.statSync(dbPath);
    const sizeAfter = statsAfter.size;
    const spaceSaved = sizeBefore - sizeAfter;

    res.json({
      success: true,
      message: 'Database optimized successfully',
      sizeBefore,
      sizeAfter,
      spaceSaved,
      percentSaved: sizeBefore > 0 ? ((spaceSaved / sizeBefore) * 100).toFixed(2) : 0
    });
  } catch (error) {
    logger.error('❌ Error running VACUUM:', error);
    res.status(500).json({ error: 'Failed to optimize database: ' + error.message });
  }
});

// POST /api/storage/clean/:dbname - Clean old data from database
app.post('/api/storage/clean/:dbname', async (req, res) => {
  try {
    const { dbname } = req.params;
    const { days } = req.body;

    // Validate database name
    if (!dbname || dbname.includes('..') || dbname.includes('/') || !dbname.match(/^[a-zA-Z0-9_-]+$/)) {
      return res.status(400).json({ error: 'Invalid database name' });
    }

    // Validate days
    const daysNum = parseInt(days);
    if (isNaN(daysNum) || daysNum < 1 || daysNum > 365) {
      return res.status(400).json({ error: 'Days must be between 1 and 365' });
    }

    const dbPath = join(RAVEN_DIR, 'db', `${dbname}.db`);

    if (!fs.existsSync(dbPath)) {
      return res.status(404).json({ error: 'Database not found' });
    }

    // Calculate cutoff timestamp
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysNum);
    const cutoffTimestamp = cutoffDate.toISOString();

    const Database = (await import('better-sqlite3')).default;
    const db = new Database(dbPath);

    let totalDeleted = 0;
    const deletedPerTable = {};

    // Get all tables
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all();

    // Delete old records from each table that has a timestamp column
    for (const table of tables) {
      const tableInfo = db.prepare(`PRAGMA table_info(${table.name})`).all();
      const hasTimestamp = tableInfo.some(col => col.name === 'timestamp' || col.name === 'created_at');

      if (hasTimestamp) {
        const timestampCol = tableInfo.find(col => col.name === 'timestamp' || col.name === 'created_at').name;

        // Count records before deletion
        const countBefore = db.prepare(`SELECT COUNT(*) as count FROM ${table.name}`).get().count;

        // Delete old records
        const deleteStmt = db.prepare(`DELETE FROM ${table.name} WHERE ${timestampCol} < ?`);
        const result = deleteStmt.run(cutoffTimestamp);

        const deleted = result.changes;
        if (deleted > 0) {
          deletedPerTable[table.name] = deleted;
          totalDeleted += deleted;
        }
      }
    }

    db.close();

    res.json({
      success: true,
      message: `Deleted ${totalDeleted} records older than ${daysNum} days`,
      totalDeleted,
      deletedPerTable,
      cutoffDate: cutoffTimestamp
    });
  } catch (error) {
    logger.error('❌ Error cleaning old data:', error);
    res.status(500).json({ error: 'Failed to clean old data: ' + error.message });
  }
});

// GET /api/storage/retention - Get retention policy configuration
app.get('/api/storage/retention', async (req, res) => {
  try {
    const retentionPath = join(RAVEN_DIR, 'retention-policy.json');

    try {
      await fsPromises.access(retentionPath);
    } catch (err) {
      // Return default policy if file doesn't exist
      return res.json({
        enabled: false,
        retentionDays: 30,
        autoCleanup: false,
        cleanupInterval: 'weekly'
      });
    }

    const data = await fsPromises.readFile(retentionPath, 'utf-8');
    const policy = JSON.parse(data);
    res.json(policy);
  } catch (error) {
    logger.error('❌ Error reading retention policy:', error);
    res.status(500).json({ error: 'Failed to read retention policy' });
  }
});

// POST /api/storage/retention - Save retention policy configuration
app.post('/api/storage/retention', async (req, res) => {
  try {
    const policy = req.body;

    // Validate policy
    if (typeof policy.enabled !== 'boolean') {
      return res.status(400).json({ error: 'enabled must be a boolean' });
    }

    const days = parseInt(policy.retentionDays);
    if (isNaN(days) || days < 1 || days > 365) {
      return res.status(400).json({ error: 'retentionDays must be between 1 and 365' });
    }

    const validIntervals = ['daily', 'weekly', 'monthly'];
    if (!validIntervals.includes(policy.cleanupInterval)) {
      return res.status(400).json({ error: 'cleanupInterval must be daily, weekly, or monthly' });
    }

    const retentionPath = join(RAVEN_DIR, 'retention-policy.json');
    await fsPromises.writeFile(retentionPath, JSON.stringify(policy, null, 2));

    res.json({
      success: true,
      message: 'Retention policy saved successfully',
      policy
    });
  } catch (error) {
    logger.error('❌ Error saving retention policy:', error);
    res.status(500).json({ error: 'Failed to save retention policy' });
  }
});

// ==================== Server Sync API ====================

// Get sync configuration
app.get('/api/sync/config', async (req, res) => {
  try {
    const data = await SyncService.loadConfig();
    res.json(data);
  } catch (error) {
    logger.error('❌ Error loading sync config:', error);
    res.status(500).json({ error: 'Failed to load sync configuration' });
  }
});

// Save sync configuration
app.post('/api/sync/config', async (req, res) => {
  try {
    const config = req.body;

    if (!config) {
      return res.status(400).json({ error: 'Configuration is required' });
    }

    const result = await SyncService.saveConfig(config);

    if (result.success) {
      res.json({ success: true, message: 'Configuration saved' });
    } else {
      res.status(500).json({ success: false, error: result.error });
    }
  } catch (error) {
    logger.error('❌ Error saving sync config:', error);
    res.status(500).json({ error: 'Failed to save sync configuration' });
  }
});

// Test SSH connection
app.post('/api/sync/test', async (req, res) => {
  try {
    const config = req.body;

    if (!config || !config.host || !config.user) {
      return res.status(400).json({ success: false, error: 'Host and user are required' });
    }

    const result = await SyncService.testConnection(config);
    res.json(result);
  } catch (error) {
    logger.error('❌ Error testing connection:', error);
    res.status(500).json({ success: false, error: 'Connection test failed' });
  }
});

// Trigger sync
app.post('/api/sync/trigger', async (req, res) => {
  try {
    const config = req.body;

    if (!config || !config.host || !config.user || !config.path) {
      return res.status(400).json({ success: false, error: 'Host, user, and path are required' });
    }

    // Get current project path
    const projectPath = process.cwd();

    const result = await SyncService.performSync(config, projectPath);

    if (result.success) {
      // Emit sync success event via WebSocket
      io.emit('sync-complete', {
        success: true,
        timestamp: new Date().toISOString(),
        size: result.size,
        files: result.files,
        duration: result.duration
      });
    } else {
      // Emit sync failure event via WebSocket
      io.emit('sync-complete', {
        success: false,
        timestamp: new Date().toISOString(),
        error: result.error || 'Unknown error'
      });
    }

    res.json(result);
  } catch (error) {
    logger.error('❌ Error performing sync:', error);

    // Emit sync failure event
    io.emit('sync-complete', {
      success: false,
      timestamp: new Date().toISOString(),
      error: error.message || 'Sync failed'
    });

    res.status(500).json({ success: false, error: 'Sync failed' });
  }
});

// Check SSH setup
app.get('/api/sync/ssh-status', async (req, res) => {
  try {
    const status = await SyncService.checkSSHSetup();
    res.json(status);
  } catch (error) {
    logger.error('❌ Error checking SSH status:', error);
    res.status(500).json({ error: 'Failed to check SSH status' });
  }
});

// Get remote storage statistics
app.post('/api/sync/remote-stats', async (req, res) => {
  try {
    const config = req.body;

    if (!config || !config.host || !config.user || !config.path) {
      return res.status(400).json({ success: false, error: 'Host, user, and path are required' });
    }

    const stats = await SyncService.getRemoteStorageStats(config);
    res.json(stats);
  } catch (error) {
    logger.error('❌ Error getting remote stats:', error);
    res.status(500).json({ success: false, error: 'Failed to get remote storage statistics' });
  }
});

// Cancel ongoing sync
app.post('/api/sync/cancel', async (req, res) => {
  try {
    const result = await SyncService.cancelSync();
    res.json(result);
  } catch (error) {
    logger.error('❌ Error cancelling sync:', error);
    res.status(500).json({ success: false, error: 'Failed to cancel sync' });
  }
});

// Check if rsync is installed
app.get('/api/sync/rsync-status', async (req, res) => {
  try {
    const status = await SyncService.checkRsyncInstalled();
    res.json(status);
  } catch (error) {
    logger.error('❌ Error checking rsync status:', error);
    res.status(500).json({ error: 'Failed to check rsync status' });
  }
});

// ==================== WebSocket Connections ====================

// Apply WebSocket authentication middleware
io.use(authenticateSocket);

io.on('connection', socket => {
  console.log(`🔌 WebSocket client connected: ${socket.id} (user: ${socket.user?.username || 'system'})`);

  socket.on('disconnect', () => {
    console.log('🔌 WebSocket client disconnected:', socket.id);
  });
});

// Export io for use in other modules
export { io };

// ==================== Error Handlers ====================
// Must be last, after all routes

// 404 handler
app.use(notFoundHandler);

// Error logging (Phase 5C)
if (env.ENABLE_TRACING) {
  app.use(errorLogging);
}

// Global error handler
app.use(errorHandler);

// ==================== Startup Diagnostics ====================

/**
 * Run startup diagnostics and attempt self-healing
 * Checks critical services and attempts to restart them if down
 */
async function runStartupDiagnostics() {
  console.log('\n🔍 Running startup diagnostics...\n');

  const diagnostics = {
    bridge: { name: 'Telemetry Bridge', status: 'unknown', fixed: false }
  };

  // Check telemetry bridge status
  try {
    const bridgePidFile = '/tmp/claude-telemetry-bridge.pid';
    let bridgeRunning = false;

    if (fs.existsSync(bridgePidFile)) {
      const bridgePid = parseInt(fs.readFileSync(bridgePidFile, 'utf-8').trim());
      try {
        process.kill(bridgePid, 0);
        bridgeRunning = true;
      } catch (err) {
        bridgeRunning = false;
      }
    }

    if (bridgeRunning) {
      diagnostics.bridge.status = 'healthy';
      console.log('✅ Telemetry Bridge: Running');
    } else {
      diagnostics.bridge.status = 'down';
      console.log('⚠️  Telemetry Bridge: Not running - attempting auto-start...');

      // Attempt to start the bridge
      const maxRetries = 3;
      let retryCount = 0;
      let started = false;

      while (retryCount < maxRetries && !started) {
        retryCount++;
        try {
          const startScript = '../scripts/start-claude-bridge.sh';
          await execAsync(startScript);

          // Wait and verify
          await new Promise(resolve => setTimeout(resolve, 1000));

          if (fs.existsSync(bridgePidFile)) {
            const newPid = parseInt(fs.readFileSync(bridgePidFile, 'utf-8').trim());
            try {
              process.kill(newPid, 0);
              started = true;
              diagnostics.bridge.status = 'healthy';
              diagnostics.bridge.fixed = true;
              console.log(`✅ Telemetry Bridge: Auto-started successfully (PID: ${newPid})`);
            } catch (err) {
              console.log(`⚠️  Attempt ${retryCount}/${maxRetries} failed - process not running`);
            }
          } else {
            console.log(`⚠️  Attempt ${retryCount}/${maxRetries} failed - no PID file`);
          }
        } catch (error) {
          console.log(`⚠️  Attempt ${retryCount}/${maxRetries} failed: ${error.message}`);
          if (retryCount < maxRetries) {
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
        }
      }

      if (!started) {
        diagnostics.bridge.status = 'failed';
        console.log('❌ Telemetry Bridge: Auto-start failed after 3 attempts');
        console.log('   Manual start: ./scripts/start-claude-bridge.sh');
      }
    }
  } catch (error) {
    diagnostics.bridge.status = 'error';
    logger.error('❌ Telemetry Bridge diagnostic error:', error.message);
  }

  // Summary
  console.log('\n📊 Diagnostic Summary:');
  const healthy = Object.values(diagnostics).filter(d => d.status === 'healthy').length;
  const total = Object.keys(diagnostics).length;
  const fixed = Object.values(diagnostics).filter(d => d.fixed).length;

  if (healthy === total) {
    console.log(`✅ All ${total} service(s) healthy`);
  } else {
    console.log(`⚠️  ${healthy}/${total} service(s) healthy`);
  }

  if (fixed > 0) {
    console.log(`🔧 Auto-fixed ${fixed} service(s)`);
  }

  console.log('');
}

// ==================== Server Start ====================

// Start server
httpServer.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════════╗
║           Raven Backend Server                 ║
╠════════════════════════════════════════════════╣
║  Port:       ${PORT}                              ║
║  WebSocket:  ✅ Enabled                         ║
║  Session:    ${SESSION_ID}     ║
║  Status:     ✅ Ready to receive telemetry     ║
╚════════════════════════════════════════════════╝
  `);

  // Check if rsync is installed (required for server sync feature)
  SyncService.checkRsyncInstalled().then(result => {
    if (!result.installed) {
      console.log('⚠️  WARNING: rsync not installed - server sync will not work');
      console.log('   Install with: sudo pacman -S rsync (or apt/yum/brew)');
    }
  });

  // Initialize ALL projects for global monitoring
  initializeAllProjects();

  // Get first project database for trigger engine and metrics collector
  // (They'll work across all projects via events)
  const firstDb = projectDatabases.values().next().value;

  if (firstDb) {
    // Initialize trigger engine with io instance
    triggerEngine = new TriggerEngine(RAVEN_DIR, io, firstDb);

    // Initialize metrics collector with io instance
    metricsCollector = new MetricsCollector(firstDb, SESSION_ID, io);

    // Start real-time metrics collection
    metricsCollector.start();

    // Run startup health checks
    healthCheckSystem = createDefaultHealthChecks(firstDb, io);
    healthCheckSystem.runAllChecks().then(summary => {
      if (!summary.allPassed) {
        logger.error(`\n⚠️  ${summary.failed} health check(s) failed - check notifications panel\n`);
      } else {
        console.log(`\n✅ All ${summary.total} health checks passed!\n`);
      }
    }).catch(error => {
      logger.error(`\n❌ Health check system error: ${error.message}\n`);
    });

    // Run startup diagnostics and self-healing
    setTimeout(() => runStartupDiagnostics(), 2000);
  } else {
    logger.error('❌ No databases available - trigger engine and metrics collector not started');
  }

  // Initialize file watchers for ALL projects
  initializeAllWatchers();

  console.log('\n🎉 Global multi-project monitoring is active!\n');
});

// Graceful shutdown handler
function gracefulShutdown(signal) {
  console.log(`\n🛑 Received ${signal}, shutting down Raven backend gracefully...`);

  // Close HTTP server to stop accepting new connections
  httpServer.close(() => {
    console.log('✅ HTTP server closed');
  });

  // Clear all interval timers
  if (agentCleanupInterval) {
    clearInterval(agentCleanupInterval);
    console.log('✅ Stopped agent cleanup interval');
  }
  if (snapshotCleanupInterval) {
    clearInterval(snapshotCleanupInterval);
    console.log('✅ Stopped snapshot cleanup interval');
  }
  if (performanceMonitorInterval) {
    clearInterval(performanceMonitorInterval);
    console.log('✅ Stopped performance monitor interval');
  }

  // Close all file watchers
  console.log(`\n🔒 Closing ${projectWatchers.size} file watchers...`);
  for (const [projectName, watcher] of projectWatchers.entries()) {
    try {
      watcher.close();
      console.log(`✅ Closed watcher: ${projectName}`);
    } catch (error) {
      logger.error(`Error closing watcher ${projectName}:`, error);
    }
  }

  // Stop all git monitors
  for (const [projectName, gitMonitor] of projectGitMonitors.entries()) {
    try {
      if (gitMonitor && gitMonitor.stop) {
        gitMonitor.stop();
      }
    } catch (error) {
      logger.error(`Error stopping git monitor ${projectName}:`, error);
    }
  }

  // Stop metrics collection
  if (metricsCollector) {
    try {
      metricsCollector.stop();
      console.log('✅ Stopped metrics collector');
    } catch (error) {
      logger.error('Error stopping metrics collector:', error);
    }
  }

  // Close all project databases
  console.log(`\n🔒 Closing ${projectDatabases.size} project databases...`);
  for (const [projectName, db] of projectDatabases.entries()) {
    try {
      db.close();
      console.log(`✅ Closed database: ${projectName}`);
    } catch (error) {
      logger.error(`Error closing database ${projectName}:`, error);
    }
  }

  // Close developer persona database
  if (developerDB) {
    try {
      developerDB.close();
      console.log('✅ Closed developer persona database');
    } catch (error) {
      logger.error('Error closing developer database:', error);
    }
  }

  // Close authentication database
  if (authDB) {
    try {
      authDB.close();
      console.log('✅ Closed authentication database');
    } catch (error) {
      logger.error('Error closing auth database:', error);
    }
  }

  console.log('\n👋 Goodbye!');

  // Give a small delay to ensure all cleanup completes
  setTimeout(() => {
    process.exit(0);
  }, 500);
}

// Handle both SIGINT (Ctrl+C) and SIGTERM (docker stop, systemd, etc)
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
