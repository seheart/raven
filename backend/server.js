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

// Logger
import { logger } from './utils/logger.js';
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
import { createCacheRoutes } from './routes/cache.js';
import { createStorageRoutes } from './routes/storage.js';
import { createSyncRoutes } from './routes/sync.js';
import { createGitRoutes } from './routes/git.js';
import { createSessionRoutes } from './routes/sessions.js';
import { createProjectRoutes } from './routes/projects.js';
import { createSafetyRoutes } from './routes/safety.js';
import { createHealthRoutes } from './routes/health.js';
import { createAnalyticsRoutes } from './routes/analytics.js';
import { createEventsRoutes } from './routes/events.js';
import { createTriggersRoutes } from './routes/triggers.js';
import { createNotificationsRoutes } from './routes/notifications.js';
import { createErrorsRoutes } from './routes/errors.js';
import { createRollbackRoutes } from './routes/rollback.js';
import { createSnapshotsRoutes } from './routes/snapshots.js';
import { createPreferencesRoutes } from './routes/preferences.js';
import { createSearchRoutes } from './routes/search.js';
import { createChangelogRoutes } from './routes/changelog.js';
import { createDocumentationRoutes } from './routes/documentation.js';
import { createUtilityRoutes } from './routes/utility.js';

// Monitoring services
import { agentDetector } from './services/agent-detector.js';
import { createRiskAnalyzer } from './services/risk-analyzer.js';
import { createBehaviorProfiler } from './services/behavior-profiler.js';
import { createPatternMatcher } from './services/pattern-matcher.js';
import { createSessionTracker } from './services/session-tracker.js';
import { createDeveloperRoutes } from './routes/developer.js';

// Utilities (Phase 3)
import {
  fileCache,
  addToFileCache,
  getHealthCache,
  updateHealthCache,
  clearFileCache,
  dashboardCache,
  analyticsCache,
  metricsCache,
  queryCache,
  cacheMiddleware,
  getAllCacheStats,
  clearAllCaches
} from './utils/cache.js';
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
// ==================== Health Endpoint (NOW MODULAR - see routes/health.js) ====================
// Deleted - now using modular route

// ==================== Session ID Endpoint (NOW MODULAR - see routes/health.js) ====================
// Deleted - now using modular route

// ==================== Status Endpoint (NOW MODULAR - see routes/health.js) ====================
// Deleted - now using modular route

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

    logger.info('Auto-discovered projects', { count: projects.length, projectsDir });
    return projects;
  } catch (error) {
    logger.error('Error discovering projects', { error: error.message });
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
logger.info('Developer persona database ready', { path: DEVELOPER_DB_PATH });

// Initialize Authentication Service (global user management)
const AUTH_DB_PATH = join(RAVEN_DIR, 'db', 'auth.db');
const authDB = new Database(AUTH_DB_PATH);
const authService = new AuthService(authDB);
logger.info('Authentication service initialized', { path: AUTH_DB_PATH });

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

// Shared deps object for triggers routes (triggerEngine added after initialization)
const triggersDeps = {};

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
    logger.debug('Skipping file - already processing', { filepath });
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
    logger.info('Initializing monitoring services');

    riskAnalyzer = createRiskAnalyzer(projectDatabases);
    behaviorProfiler = createBehaviorProfiler(projectDatabases);
    patternMatcher = createPatternMatcher(projectDatabases);
    sessionTracker = createSessionTracker(projectDatabases);

    logger.info('Monitoring services initialized', {
      services: ['AgentDetector', 'RiskAnalyzer', 'BehaviorProfiler', 'PatternMatcher', 'SessionTracker']
    });
  } catch (error) {
    logger.error('Failed to initialize monitoring services', { error });
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

    logger.info('Initialized project', {
      projectName,
      watchPath: projectPath,
      database: dbPath,
      snapshots: snapshotsDir
    });

    return true;
  } catch (error) {
    logger.error('Error initializing project', { error, projectName });
    return false;
  }
}

/**
 * Initialize ALL discovered projects for global monitoring
 */
function initializeAllProjects() {
  logger.info('Initializing projects for global monitoring', { projectCount: availableProjects.length });

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

  logger.info('Project initialization complete', {
    successful: successCount,
    failed: failCount,
    total: availableProjects.length
  });

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
      logger.debug('Git status emitted via WebSocket', { projectName });
    }
  } catch (error) {
    logger.error('Error emitting git status', { error, projectName });
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
      logger.info('File watcher ready', { projectName });
    });

  return watcher;
}

/**
 * Initialize watchers for ALL projects
 */
function initializeAllWatchers() {
  logger.info('Starting file watchers for all projects');

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

  logger.info('Watcher initialization complete', {
    watching: successCount,
    failed: failCount
  });

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

// Simple in-memory storage for user preferences (could be moved to DB later)
const userPreferences = new Map();

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
// ==================== System & Process Metrics (NOW MODULAR - see routes/metrics.js) ====================
// Deleted - now using modular route

// Control routes
app.use('/api/control', createControlRoutes(routeDependencies));

// Cache management routes
app.use('/api/cache', createCacheRoutes());

// Storage management routes
app.use('/api/storage', createStorageRoutes({ RAVEN_DIR, projectState }));

// Sync management routes
app.use('/api/sync', createSyncRoutes({ io }));

// Git management routes
app.use('/api/git', createGitRoutes({ projectState }));

// Session management routes
app.use('/api/sessions', createSessionRoutes({ sessionTracker, projectDatabases }));

// Project management routes
app.use('/api/projects', createProjectRoutes({
  projectDatabases,
  config,
  projectPaths,
  projectState,
  CONFIG_PATH
}));

// Safety routes (errors, syntax checking, tests, pause/resume, pattern warnings)
app.use('/api', createSafetyRoutes({ projectState, io, SESSION_ID }));

// Health & Status routes (system health, session ID, status, health checks, project health)
app.use('/api', createHealthRoutes({ projectState, io, SESSION_ID, RAVEN_DIR, projectDatabases, healthCheckSystem }));

// Analytics routes (anomaly detection, trends, agent monitoring, pattern matching)
app.use('/api', createAnalyticsRoutes({
  projectState,
  projectDatabases,
  cacheMiddleware,
  analyticsCache,
  behaviorProfiler,
  patternMatcher
}));

// Metrics routes (system/process metrics, stats, correlations, dashboard)
app.use('/api', createMetricsRoutes({
  projectDatabases,
  cacheMiddleware,
  metricsCache,
  analyticsCache,
  dashboardCache
}));

// Events routes (tracked files, events by session, file events, activity log)
app.use('/api', createEventsRoutes({
  projectState,
  projectDatabases
}));

// Triggers routes (triggerEngine added to triggersDeps after initialization)
app.use('/api', createTriggersRoutes(triggersDeps));

// Notifications routes (list, stats, mark read, delete)
app.use('/api', createNotificationsRoutes({ projectState }));

// Errors routes (list, stats, clear)
app.use('/api', createErrorsRoutes({ projectState, projectDatabases }));

// Rollback routes (track rollback, rollback patterns)
app.use('/api', createRollbackRoutes({ projectDatabases, riskAnalyzer, patternMatcher, sessionTracker }));

// Snapshots routes (get snapshots, restore file)
app.use('/api', createSnapshotsRoutes({ projectState }));

// Preferences routes (get, save)
app.use('/api', createPreferencesRoutes({ userPreferences }));

// Search routes (global search)
app.use('/api', createSearchRoutes({ projectState }));

// Changelog routes
app.use('/api', createChangelogRoutes({}));

// Documentation routes (list, get doc file)
app.use('/api', createDocumentationRoutes({}));

// Utility routes (database cleanup, endpoints introspection)
app.use('/api', createUtilityRoutes({ projectState, app }));

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

// NOTE: /api/health, /api/session-id, /api/status, and /api/health-checks endpoints
// moved to routes/health.js (before authentication middleware for public access)

// ==================== Dashboard Routes (NOW MODULAR - see routes/dashboard.js) ====================
// Deleted: /api/dashboard-stats, /api/top-modified-files, /api/longest-edits, /api/agents-status

// ==================== Agent Events API (NOW MODULAR - see routes/analytics.js) ====================
// Deleted - now using modular route

// ==================== System Metrics API ====================
// NOTE: /api/system-metrics and /api/process-metrics are defined earlier (lines 1248-1286)
// Duplicate endpoints removed to prevent conflicts

// ==================== Metrics Stats & Correlations (NOW MODULAR - see routes/metrics.js) ====================
// Deleted - now using modular route

// ==================== Custom Metrics Dashboard API (NOW MODULAR - see routes/metrics.js) ====================
// Deleted - now using modular route


// ==================== Multi-Project Health Dashboard API (NOW MODULAR - see routes/health.js) ====================
// Deleted - now using modular route

// ==================== Anomaly Detection API (NOW MODULAR - see routes/analytics.js) ====================
// Deleted - now using modular route

// ==================== Historical Trends API (NOW MODULAR - see routes/analytics.js) ====================
// Deleted - now using modular route

// ==================== Agent Monitoring API (NOW MODULAR - see routes/analytics.js) ====================
// Deleted - now using modular route

// ==================== Pattern Matching (NOW MODULAR - see routes/analytics.js) ====================
// Deleted - now using modular route



// ==================== Session Intelligence API (NOW MODULAR - see routes/sessions.js) ====================
// Deleted - now using modular route

// ==================== File Events API ====================

// ==================== Tracked Files (NOW MODULAR - see routes/events.js) ====================
// Deleted - now using modular route

// ==================== Events by Session (NOW MODULAR - see routes/events.js) ====================
// Deleted - now using modular route



// Get file events (from events table)
// ==================== File Events (NOW MODULAR - see routes/events.js) ====================
// Deleted - now using modular route

// ==================== All File Events (NOW MODULAR - see routes/events.js) ====================
// Deleted - now using modular route

// ==================== Activity Log (NOW MODULAR - see routes/events.js) ====================
// Deleted - now using modular route

// ==================== Custom Triggers API (NOW MODULAR - see routes/triggers.js) ====================
// Deleted - now using modular route


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


// ==================== Cache Management Endpoints (NOW MODULAR - see routes/cache.js) ====================
// Deleted - now using modular route

// ==================== Control Actions (NOW MODULAR - see routes/control.js) ====================
// Deleted: /api/control/clear-cache, /api/control/restart-watcher, /api/control/restart-bridge, /api/control/export-health


// ==================== Project Management API ====================




// ==================== Git Endpoints (NOW MODULAR - see routes/git.js) ====================
// Deleted - now using modular route

// ==================== Documentation API ====================



// ==================== Errors API (NOW MODULAR - see routes/errors.js) ====================
// Deleted - now using modular route

// ==================== Notifications API (NOW MODULAR - see routes/notifications.js) ====================
// Deleted - now using modular route

// ==================== Server Sync API (NOW MODULAR - see routes/sync.js) ====================
// Deleted - now using modular route

// ==================== WebSocket Connections ====================

// Apply WebSocket authentication middleware
io.use(authenticateSocket);

io.on('connection', socket => {
  logger.debug('WebSocket client connected', {
    socketId: socket.id,
    username: socket.user?.username || 'system'
  });

  socket.on('disconnect', () => {
    logger.debug('WebSocket client disconnected', { socketId: socket.id });
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
  logger.info('Running startup diagnostics');

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
      logger.info('Telemetry Bridge: Running');
    } else {
      diagnostics.bridge.status = 'down';
      logger.warn('Telemetry Bridge: Not running - attempting auto-start');

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
              logger.info('Telemetry Bridge: Auto-started successfully', { pid: newPid });
            } catch (err) {
              logger.warn('Telemetry Bridge auto-start attempt failed - process not running', { attempt: retryCount, maxRetries });
            }
          } else {
            logger.warn('Telemetry Bridge auto-start attempt failed - no PID file', { attempt: retryCount, maxRetries });
          }
        } catch (error) {
          logger.warn('Telemetry Bridge auto-start attempt failed', { attempt: retryCount, maxRetries, error: error.message });
          if (retryCount < maxRetries) {
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
        }
      }

      if (!started) {
        diagnostics.bridge.status = 'failed';
        logger.error('Telemetry Bridge: Auto-start failed after 3 attempts. Manual start: ./scripts/start-claude-bridge.sh');
      }
    }
  } catch (error) {
    diagnostics.bridge.status = 'error';
    logger.error('Telemetry Bridge diagnostic error', { error: error.message });
  }

  // Summary
  const healthy = Object.values(diagnostics).filter(d => d.status === 'healthy').length;
  const total = Object.keys(diagnostics).length;
  const fixed = Object.values(diagnostics).filter(d => d.fixed).length;

  if (healthy === total) {
    logger.info('Diagnostic summary: All services healthy', { total });
  } else {
    logger.warn('Diagnostic summary: Some services unhealthy', { healthy, total });
  }

  if (fixed > 0) {
    logger.info('Auto-fixed services', { fixedCount: fixed });
  }
}

// ==================== Server Start ====================

// Start server
httpServer.listen(PORT, () => {
  logger.info('Raven Backend Server started', {
    port: PORT,
    webSocket: 'enabled',
    sessionId: SESSION_ID,
    status: 'ready'
  });

  // Check if rsync is installed (required for server sync feature)
  SyncService.checkRsyncInstalled().then(result => {
    if (!result.installed) {
      logger.warn('rsync not installed - server sync will not work. Install with: sudo pacman -S rsync (or apt/yum/brew)');
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

    // Add triggerEngine to shared deps object so routes can access it
    triggersDeps.triggerEngine = triggerEngine;
    logger.info('✅ Trigger engine initialized and added to routes');

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
