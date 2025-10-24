import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { RavenDB } from './db.js';
import DeveloperDB from './developer-db.js';
import { MetricsCollector } from './metrics-collector.js';
import { TriggerEngine } from './trigger-engine.js';
import { GitMonitor } from './dist/modules/git.js';
import { randomUUID } from 'crypto';
import * as SyncService from './sync-service.js';
import { createDefaultHealthChecks } from './health-checks.js';
import { join, relative, normalize } from 'path';
import chokidar from 'chokidar';
import fs from 'fs';
import { readFileSync } from 'fs';
import { createHash } from 'crypto';
import * as Diff from 'diff';
import toml from 'toml';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as si from 'systeminformation';
import { gzip, gunzip } from 'zlib';

const execAsync = promisify(exec);
const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);

const app = express();
const httpServer = createServer(app);

// Configuration: Load from environment variables with fallback defaults
const CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:5173';
const PORT = parseInt(process.env.PORT) || 3030;

const io = new Server(httpServer, {
  cors: {
    origin: CORS_ORIGIN,
    methods: ['GET', 'POST'],
    credentials: true
  },
  allowEIO3: true,
  transports: ['websocket', 'polling']
});

// Middleware
app.use(cors());
// Configuration: JSON payload limit (configurable via environment)
const JSON_LIMIT = process.env.JSON_PAYLOAD_LIMIT || '50mb';
app.use(express.json({ limit: JSON_LIMIT }));

// Simple rate limiting middleware (per-IP tracking)
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW_MS = parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 60000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = parseInt(process.env.RATE_LIMIT_MAX) || 100;

function rateLimiter(req, res, next) {
  const ip = req.ip || req.connection.remoteAddress;
  const now = Date.now();

  if (!rateLimitMap.has(ip)) {
    rateLimitMap.set(ip, { count: 1, resetTime: now + RATE_LIMIT_WINDOW_MS });
    return next();
  }

  const record = rateLimitMap.get(ip);

  if (now > record.resetTime) {
    // Window expired, reset
    record.count = 1;
    record.resetTime = now + RATE_LIMIT_WINDOW_MS;
    return next();
  }

  if (record.count >= RATE_LIMIT_MAX_REQUESTS) {
    return res.status(429).json({
      error: 'Too many requests',
      retryAfter: Math.ceil((record.resetTime - now) / 1000)
    });
  }

  record.count++;
  next();
}

// Apply rate limiting to telemetry endpoint
app.use('/telemetry', rateLimiter);

// Cleanup rate limit map periodically (every 5 minutes)
const rateLimitCleanupInterval = setInterval(() => {
  const now = Date.now();
  for (const [ip, record] of rateLimitMap.entries()) {
    if (now > record.resetTime) {
      rateLimitMap.delete(ip);
    }
  }
}, 5 * 60 * 1000);

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
        path: entry.name,
        description: `Project: ${entry.name}`
      }));

    console.log(`📂 Auto-discovered ${projects.length} projects in ${projectsDir}`);
    return projects;
  } catch (error) {
    console.error('❌ Error discovering projects:', error.message);
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

// File cache for tracking previous states (for diff generation)
const fileCache = new Map();

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
    console.log(`🧹 Cleaned up ${removed} inactive agents from registry`);
  }
}, 60 * 60 * 1000); // Run every hour

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
      console.log(`🧹 Cleaned up ${removed} old snapshots (>${process.env.SNAPSHOT_TTL_DAYS || '30'} days)`);
    }
  } catch (error) {
    console.error('❌ Error cleaning snapshots:', error.message);
  }
}, 24 * 60 * 60 * 1000); // Run daily

// Performance monitoring - check every 30 seconds
let lastPerformanceAlert = 0;
const PERFORMANCE_ALERT_COOLDOWN = 5 * 60 * 1000; // 5 minutes between alerts

const performanceMonitorInterval = setInterval(async () => {
  try {
    const os = await import('os');
    const now = Date.now();

    // Skip if we recently sent an alert (avoid spam)
    if (now - lastPerformanceAlert < PERFORMANCE_ALERT_COOLDOWN) {
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
      console.warn(`⚠️ Critical system memory: ${memoryPercent.toFixed(1)}%`);
    } else if (heapPercent > 90) {
      io.emit('performance-alert', {
        type: 'heap',
        severity: 'warning',
        title: 'High Heap Memory',
        message: `Process heap usage is high: ${heapPercent.toFixed(1)}%`,
        value: heapPercent.toFixed(1)
      });
      lastPerformanceAlert = now;
      console.warn(`⚠️ High heap usage: ${heapPercent.toFixed(1)}%`);
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
    console.error('❌ Performance monitoring error:', error.message);
  }
}, 30 * 1000); // Check every 30 seconds

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
      console.error(`❌ Project paths not found for ${projectName}`);
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

    console.log(`💾 Snapshot saved [${projectName}]: ${snapshotName} (${originalSize} → ${compressedSize} bytes, ${ratio}% reduction)`);
    return snapshotPath;
  } catch (error) {
    console.error(`❌ Snapshot save error [${projectName}]:`, error);
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
      console.warn(`⚠️  Could not determine project for file: ${filepath}`);
      return;
    }

    // Get project-specific resources
    const projectPath = projectPaths.get(projectName);
    const db = projectDatabases.get(projectName);
    const gitMonitor = projectGitMonitors.get(projectName);

    if (!db || !projectPath) {
      console.error(`❌ Project resources not found for ${projectName}`);
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

        // Update cache
        fileCache.set(filepath, content);
      } catch (readError) {
        console.error(`❌ Error reading file [${projectName}] ${relPath}:`, readError.message);
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
    let eventId;
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
      console.log(`📁 [${projectName}] File ${eventType}: ${relPath} (${eventSize} bytes)`);

      // ALSO log to global developer persona database
      const language = detectLanguage(filepath);
      const linesAdded = diff ? (diff.match(/^\+/gm) || []).length : 0;
      const linesRemoved = diff ? (diff.match(/^-/gm) || []).length : 0;

      developerDB.logCodePattern({
        project: projectName,
        language,
        file_type: filepath.split('.').pop(),
        edit_type: eventType === 'add' ? 'create' : eventType === 'unlink' ? 'delete' : 'modify',
        lines_added: linesAdded,
        lines_removed: linesRemoved,
        timestamp
      });
    } catch (dbError) {
      console.error(`❌ Database insert failed [${projectName}] (continuing processing):`, dbError.message);
      eventId = null;
    }

    // Emit real-time event via WebSocket (include project name)
    io.emit('file-changed', {
      id: eventId,
      timestamp,
      project: projectName,
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
      event_size: eventSize,
      project: projectName
    };
    triggerEngine.evaluate(triggerEvent);

    // Emit git status update for this project
    if (gitMonitor) {
      await emitGitStatusUpdate(projectName);
    }
  } catch (error) {
    console.error('❌ File change handler error:', error);
  } finally {
    // Always remove file from in-progress set to prevent deadlock
    filesInProgress.delete(filepath);
  }
}

// ==================== Project Management Functions ====================

/**
 * Initialize a single project (database, paths, git monitor)
 * @param {string} projectName - Name of the project to initialize
 * @returns {boolean} - True if successful, false otherwise
 */
function initializeProject(projectName) {
  try {
    const project = availableProjects.find(p => p.name === projectName);
    if (!project) {
      console.error(`❌ Project "${projectName}" not found`);
      return false;
    }

    // Set project paths
    // Backend is in raven/backend, so go up two levels to get to Projects/, then add project path
    const projectPath = join(process.cwd(), '..', '..', project.path);
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
    console.error(`❌ Error initializing project ${projectName}:`, error);
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

  console.log(`\n✅ Project initialization complete:`);
  console.log(`   Successful: ${successCount}`);
  console.log(`   Failed: ${failCount}`);
  console.log(`   Total: ${availableProjects.length}\n`);

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
    console.error(`❌ Error emitting git status [${projectName}]:`, error);
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
    console.error(`❌ Cannot create watcher for ${projectName}: path not found`);
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
    join(projectPath, '*.sh'),              // Shell scripts
  ] : projectPath;

  const watcher = chokidar.watch(watchPaths, {
    ignored: [...defaultIgnored, ...customIgnored],
    persistent: true,
    ignoreInitial: true,
    awaitWriteFinish: {
      stabilityThreshold: 100,
      pollInterval: 50
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
      console.error(`❌ Watcher error [${projectName}]:`, error);

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
  console.log(`\n👀 Starting file watchers for all projects...\n`);

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

  console.log(`\n✅ Watcher initialization complete:`);
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

// ==================== Telemetry Endpoint ====================

app.post('/telemetry', (req, res) => {
  try {
    const { agent, event, file, lines_changed, duration_ms, message, metadata, project } = req.body;

    // Validate required fields
    if (!agent || !event || !message) {
      return res.status(400).json({ error: 'Missing required fields: agent, event, message' });
    }

    // Validate field types and sanitize
    if (typeof agent !== 'string' || agent.length > 100) {
      return res.status(400).json({ error: 'Invalid agent: must be string ≤100 chars' });
    }
    if (typeof event !== 'string' || event.length > 100) {
      return res.status(400).json({ error: 'Invalid event: must be string ≤100 chars' });
    }
    if (typeof message !== 'string' || message.length > 1000) {
      return res.status(400).json({ error: 'Invalid message: must be string ≤1000 chars' });
    }
    if (file !== undefined && typeof file !== 'string') {
      return res.status(400).json({ error: 'Invalid file: must be string' });
    }
    if (lines_changed !== undefined && (typeof lines_changed !== 'number' || lines_changed < 0 || lines_changed > 1000000)) {
      return res.status(400).json({ error: 'Invalid lines_changed: must be number 0-1000000' });
    }
    if (duration_ms !== undefined && (typeof duration_ms !== 'number' || duration_ms < 0 || duration_ms > 3600000)) {
      return res.status(400).json({ error: 'Invalid duration_ms: must be number 0-3600000 (1 hour max)' });
    }

    const timestamp = new Date().toISOString();

    // Determine which project this telemetry is for
    let projectName = project; // Use explicit project if provided
    if (!projectName && availableProjects.length > 0) {
      // Default to 'raven' if it exists, otherwise first project
      const ravenProject = availableProjects.find(p => p.name === 'raven');
      projectName = ravenProject ? ravenProject.name : availableProjects[0].name;
    }

    // Get project database (or use first available)
    const db = projectName ? projectDatabases.get(projectName) : projectDatabases.values().next().value;

    if (!db) {
      return res.status(500).json({ error: 'No project database available' });
    }

    // Insert into project-specific database
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

    // ALSO log to global developer persona database
    try {
      developerDB.logAgentInteraction({
        timestamp,
        project: projectName,
        agent_name: agent,
        event_type: event,
        file_path: file,
        lines_changed,
        message,
        session_id: SESSION_ID,
        prompt_type: metadata?.prompt_type,
        metadata: JSON.stringify(metadata)
      });
    } catch (devDbError) {
      console.error('❌ Failed to log to developer DB:', devDbError.message);
    }

    // Update agent registry
    if (!agentRegistry.has(agent)) {
      agentRegistry.set(agent, {
        agent_name: agent,
        agent_type: agent,
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
      duration_ms: duration_ms,
      project: projectName
    };
    triggerEngine.evaluate(triggerEvent);

    console.log(`📡 [${projectName}] Telemetry: ${agent} - ${event} - ${message}`);

    // Emit real-time event via WebSocket (include project)
    io.emit('agent-event', {
      id: eventId,
      timestamp,
      project: projectName,
      agent,
      event_type: event,
      file,
      lines_changed,
      duration_ms,
      message,
      metadata
    });

    // Emit file-changed event for Live Activity Stream
    if (file && event !== 'session-start' && event !== 'session-end') {
      io.emit('file-changed', {
        filepath: file,
        change_type: event,
        timestamp,
        project: projectName,
        agent
      });
    }

    // Emit updated agent stats
    io.emit('agent-stats', db.getAgentStats());

    res.json({
      success: true,
      event_id: eventId,
      session_id: SESSION_ID,
      project: projectName
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

/**
 * GET /api/health
 * Health check endpoint with system metrics and storage monitoring
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
        console.error('Error calculating directory size:', err);
      }
      return totalSize;
    };

    const ravenSize = getRavenDirSize(RAVEN_DIR);

    // Estimate disk usage (assume 100GB available for now)
    // In production, you'd use a library like 'diskusage' for accurate stats
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

      // Emit storage warning
      io.emit('storage-warning', {
        percentage: diskUsePercent.toFixed(1),
        size: ravenSize,
        critical: true
      });
    } else if (diskUsePercent > 85) {
      status = 'warning';
      issues.push('High storage usage');

      // Emit storage warning
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
    console.error('❌ Health check error:', error);
    res.status(500).json({
      status: 'error',
      error: error.message
    });
  }
});

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
    console.error('❌ Health checks API error:', error);
    res.status(500).json({
      status: 'error',
      error: error.message
    });
  }
});

app.get('/api/dashboard-stats', (req, res) => {
  try {
    // Aggregate stats from ALL projects
    let aggregatedStats = {
      total_events: 0,
      total_files: 0,
      total_agents: 0,
      session_duration_seconds: 0,
      active_files_today: 0,
      total_changes: 0,
      creates: 0,
      edits: 0,
      deletes: 0,
      unique_files_modified: 0
    };

    // Get session start time from the first project that has it
    let sessionStartTime = null;

    for (const [projectName, db] of projectDatabases.entries()) {
      const projectStats = db.getDashboardStats(SESSION_ID);

      aggregatedStats.total_events += projectStats.total_events || 0;
      aggregatedStats.total_files += projectStats.total_files || 0;
      aggregatedStats.total_agents += projectStats.total_agents || 0;
      aggregatedStats.active_files_today += projectStats.active_files_today || 0;
      aggregatedStats.total_changes += projectStats.total_changes || 0;
      aggregatedStats.creates += projectStats.creates || 0;
      aggregatedStats.edits += projectStats.edits || 0;
      aggregatedStats.deletes += projectStats.deletes || 0;
      aggregatedStats.unique_files_modified += projectStats.unique_files_modified || 0;

      // Use the earliest session start time
      if (projectStats.session_duration_seconds > 0 &&
          (sessionStartTime === null || projectStats.session_duration_seconds > aggregatedStats.session_duration_seconds)) {
        aggregatedStats.session_duration_seconds = projectStats.session_duration_seconds;
      }
    }

    res.json(aggregatedStats);
  } catch (error) {
    console.error('❌ Dashboard stats error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/top-modified-files', (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;

    // Aggregate top files from ALL projects
    const allFiles = [];

    for (const [projectName, db] of projectDatabases.entries()) {
      const projectFiles = db.getTopModifiedFiles(SESSION_ID, limit);
      // Add project name to each file
      if (projectFiles && Array.isArray(projectFiles)) {
        projectFiles.forEach(file => {
          file.project = projectName;
        });
        allFiles.push(...projectFiles);
      }
    }

    // Sort by change count (descending) and take top N
    allFiles.sort((a, b) => b.change_count - a.change_count);
    const topFiles = allFiles.slice(0, limit);

    res.json({ files: topFiles });
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

    // Get historical agents from database
    const historicalAgents = projectState.db.getHistoricalAgents();

    // Create a map of agents with their historical data
    const agentsMap = new Map();

    // First, add historical agents from database
    for (const agent of historicalAgents) {
      const lastSeen = new Date(agent.last_seen);
      const secondsSinceLastSeen = (now - lastSeen) / 1000;

      agentsMap.set(agent.agent_name, {
        agent_name: agent.agent_name,
        agent_type: agent.agent_type,
        last_seen: agent.last_seen,
        requests_handled: agent.requests_handled,
        errors: agent.errors,
        is_running: secondsSinceLastSeen < 30,
        models_available: [],
        color: getAgentColor(agent.agent_name)
      });
    }

    // Then, update with any current agents from registry (will be more recent)
    for (const [agentName, agentData] of agentRegistry.entries()) {
      const lastSeen = new Date(agentData.last_seen);
      const secondsSinceLastSeen = (now - lastSeen) / 1000;

      agentsMap.set(agentName, {
        ...agentData,
        is_running: secondsSinceLastSeen < 30
      });
    }

    const agents = Array.from(agentsMap.values());
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

    // Read snapshot (may be compressed or uncompressed for backwards compatibility)
    const data = await fs.promises.readFile(snapshotPath);

    // Decompress if it's a .gz file, otherwise treat as plain text
    let content;
    if (snapshot.endsWith('.gz')) {
      const decompressed = await gunzipAsync(data);
      content = decompressed.toString('utf8');
    } else {
      content = data.toString('utf8');
    }

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

// Get file events from ALL projects (multi-project aggregation)
app.get('/api/all-file-events', (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;
    const includeDiff = req.query.diff === 'true';

    // Collect events from all projects
    const allEvents = [];
    for (const [projectName, db] of projectDatabases.entries()) {
      const events = db.getRecentFileEvents(limit, includeDiff);
      // Add project name to each event
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
    console.error('❌ All file events error:', error);
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

// ==================== Changelog ====================

app.get('/api/changelog', async (req, res) => {
  try {
    // Read CHANGELOG.md file
    const changelogPath = join(process.cwd(), '..', 'docs', 'CHANGELOG.md');

    if (!fs.existsSync(changelogPath)) {
      return res.status(404).json({ error: 'CHANGELOG.md not found', changelog: [] });
    }

    const changelogContent = fs.readFileSync(changelogPath, 'utf8');

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
    console.error('❌ Changelog error:', error);
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
    console.error('❌ Failed to get preferences:', error);
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

    console.log(`💾 Saved preferences for user: ${userId}`);
    res.json({ success: true, message: 'Preferences saved successfully' });
  } catch (error) {
    console.error('❌ Failed to save preferences:', error);
    res.status(500).json({ error: error.message });
  }
});

// ==================== Health Check ====================

app.get('/health', async (req, res) => {
  try {
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

    // Read version from package.json
    let version = '0.8.0';
    try {
      const packageJson = JSON.parse(readFileSync('./package.json', 'utf-8'));
      version = packageJson.version;
    } catch (err) {
      console.error('Failed to read version:', err);
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

    res.json({
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
    console.error('❌ Error discovering endpoints:', error);
    res.status(500).json({ error: 'Failed to discover endpoints' });
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
    // Security: Whitelist of allowed tables to prevent SQL injection
    const ALLOWED_TABLES = ['events', 'agent_events', 'raven_metrics', 'process_metrics', 'error_logs', 'notifications'];
    const tables = ['events', 'agent_events', 'raven_metrics', 'process_metrics'];
    let totalDeleted = 0;

    for (const table of tables) {
      // Security: Validate table name is in whitelist
      if (!ALLOWED_TABLES.includes(table)) {
        console.error(`❌ Security: Attempted to delete from non-whitelisted table: ${table}`);
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
    console.error('Error clearing old database entries:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/control/restart-watcher', async (req, res) => {
  try {
    // Protected by mutex to prevent race conditions with project switching
    await projectStateMutex.runExclusive(async () => {
      console.log('🔄 Restarting file watcher...');

      // Close existing watcher
      if (projectState.watcher) {
        await projectState.watcher.close();
        console.log('✅ Closed watcher');
      }

      // Reinitialize watcher
      projectState.watcher = initializeWatcher();
    });

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
    console.error('❌ Projects refresh error:', error);
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
      const configContent = fs.readFileSync(CONFIG_PATH, 'utf8');
      const updatedConfig = configContent.replace(
        /^active\s*=\s*".*"$/m,
        `active = "${project}"`
      );
      fs.writeFileSync(CONFIG_PATH, updatedConfig, 'utf8');
      console.log(`💾 Persisted active project: ${project}`);
    } catch (configError) {
      console.error('⚠️  Failed to persist project selection:', configError.message);
      // Don't fail the request if we can't persist - the switch still worked
    }

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
    console.error('❌ Documentation list error:', error);
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
    if (!fs.existsSync(docsPath)) {
      return res.status(404).json({ error: 'Documentation file not found' });
    }

    // Read markdown file
    const markdown = fs.readFileSync(docsPath, 'utf8');

    res.json({
      filepath,
      markdown,
      title: filepath.replace(/\.md$/, '').replace(/\//g, ' / ')
    });
  } catch (error) {
    console.error('❌ Documentation error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ==================== Error Logging API ====================

/**
 * POST /api/errors
 * Log an error from the frontend
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

    console.log(`❌ Error logged: ${error_type} - ${message}`);

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
    console.error('❌ Error logging endpoint error:', error);
    res.status(500).json({ error: error.message });
  }
});

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
    console.error('❌ Get errors endpoint error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/errors/stats
 * Get error statistics
 */
app.get('/api/errors/stats', (req, res) => {
  try {
    const stats = projectState.db.getErrorStats();
    res.json(stats);
  } catch (error) {
    console.error('❌ Error stats endpoint error:', error);
    res.status(500).json({ error: error.message });
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
    console.error('❌ Clear errors endpoint error:', error);
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
    console.error('❌ Error fetching notifications:', error);
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
});

app.get('/api/notifications/stats', (req, res) => {
  try {
    const stats = projectState.db.getNotificationStats();
    res.json(stats);
  } catch (error) {
    console.error('❌ Error fetching notification stats:', error);
    res.status(500).json({ error: 'Failed to fetch notification stats' });
  }
});

app.post('/api/notifications/:id/read', (req, res) => {
  try {
    const id = parseInt(req.params.id);
    projectState.db.markNotificationAsRead(id);
    res.json({ success: true });
  } catch (error) {
    console.error('❌ Error marking notification as read:', error);
    res.status(500).json({ error: 'Failed to mark notification as read' });
  }
});

app.post('/api/notifications/mark-all-read', (req, res) => {
  try {
    projectState.db.markAllNotificationsAsRead();
    res.json({ success: true });
  } catch (error) {
    console.error('❌ Error marking all notifications as read:', error);
    res.status(500).json({ error: 'Failed to mark all notifications as read' });
  }
});

app.delete('/api/notifications/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id);
    projectState.db.deleteNotification(id);
    res.json({ success: true });
  } catch (error) {
    console.error('❌ Error deleting notification:', error);
    res.status(500).json({ error: 'Failed to delete notification' });
  }
});

app.delete('/api/notifications', (req, res) => {
  try {
    const olderThanDays = req.query.olderThanDays ? parseInt(req.query.olderThanDays) : null;
    const result = projectState.db.clearNotifications(olderThanDays);
    res.json(result);
  } catch (error) {
    console.error('❌ Error clearing notifications:', error);
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
          const sizeQuery = db.prepare(`SELECT SUM(pgsize) as size FROM dbstat WHERE name = ?`).get(table.name);
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
    console.error('❌ Error getting storage stats:', error);
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
        console.error('❌ Error sending database file:', err);
        if (!res.headersSent) {
          res.status(500).json({ error: 'Failed to export database' });
        }
      }
    });
  } catch (error) {
    console.error('❌ Error exporting database:', error);
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
    console.error('❌ Error running VACUUM:', error);
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
    console.error('❌ Error cleaning old data:', error);
    res.status(500).json({ error: 'Failed to clean old data: ' + error.message });
  }
});

// GET /api/storage/retention - Get retention policy configuration
app.get('/api/storage/retention', async (req, res) => {
  try {
    const retentionPath = join(RAVEN_DIR, 'retention-policy.json');

    if (!fs.existsSync(retentionPath)) {
      // Return default policy
      return res.json({
        enabled: false,
        retentionDays: 30,
        autoCleanup: false,
        cleanupInterval: 'weekly'
      });
    }

    const data = fs.readFileSync(retentionPath, 'utf-8');
    const policy = JSON.parse(data);
    res.json(policy);
  } catch (error) {
    console.error('❌ Error reading retention policy:', error);
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
    fs.writeFileSync(retentionPath, JSON.stringify(policy, null, 2));

    res.json({
      success: true,
      message: 'Retention policy saved successfully',
      policy
    });
  } catch (error) {
    console.error('❌ Error saving retention policy:', error);
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
    console.error('❌ Error loading sync config:', error);
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
    console.error('❌ Error saving sync config:', error);
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
    console.error('❌ Error testing connection:', error);
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
    console.error('❌ Error performing sync:', error);

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
    console.error('❌ Error checking SSH status:', error);
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
    console.error('❌ Error getting remote stats:', error);
    res.status(500).json({ success: false, error: 'Failed to get remote storage statistics' });
  }
});

// Cancel ongoing sync
app.post('/api/sync/cancel', async (req, res) => {
  try {
    const result = await SyncService.cancelSync();
    res.json(result);
  } catch (error) {
    console.error('❌ Error cancelling sync:', error);
    res.status(500).json({ success: false, error: 'Failed to cancel sync' });
  }
});

// Check if rsync is installed
app.get('/api/sync/rsync-status', async (req, res) => {
  try {
    const status = await SyncService.checkRsyncInstalled();
    res.json(status);
  } catch (error) {
    console.error('❌ Error checking rsync status:', error);
    res.status(500).json({ error: 'Failed to check rsync status' });
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
        console.error(`\n⚠️  ${summary.failed} health check(s) failed - check notifications panel\n`);
      } else {
        console.log(`\n✅ All ${summary.total} health checks passed!\n`);
      }
    }).catch(error => {
      console.error(`\n❌ Health check system error: ${error.message}\n`);
    });
  } else {
    console.error('❌ No databases available - trigger engine and metrics collector not started');
  }

  // Initialize file watchers for ALL projects
  initializeAllWatchers();

  console.log('\n🎉 Global multi-project monitoring is active!\n');
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down Raven backend...');

  // Clear all interval timers
  if (rateLimitCleanupInterval) {
    clearInterval(rateLimitCleanupInterval);
    console.log('✅ Stopped rate limit cleanup');
  }
  if (agentCleanupInterval) {
    clearInterval(agentCleanupInterval);
    console.log('✅ Stopped agent cleanup');
  }
  if (snapshotCleanupInterval) {
    clearInterval(snapshotCleanupInterval);
    console.log('✅ Stopped snapshot cleanup');
  }
  if (performanceMonitorInterval) {
    clearInterval(performanceMonitorInterval);
    console.log('✅ Stopped performance monitor');
  }

  // Close all file watchers
  console.log(`\n🔒 Closing ${projectWatchers.size} file watchers...`);
  for (const [projectName, watcher] of projectWatchers.entries()) {
    watcher.close();
    console.log(`✅ Closed watcher: ${projectName}`);
  }

  // Stop all git monitors
  for (const [projectName, gitMonitor] of projectGitMonitors.entries()) {
    gitMonitor.stop();
  }

  // Stop metrics collection
  if (metricsCollector) {
    metricsCollector.stop();
    console.log('✅ Stopped metrics collector');
  }

  // Close all project databases
  console.log(`\n🔒 Closing ${projectDatabases.size} project databases...`);
  for (const [projectName, db] of projectDatabases.entries()) {
    db.close();
    console.log(`✅ Closed database: ${projectName}`);
  }

  // Close developer persona database
  if (developerDB) {
    developerDB.close();
    console.log('✅ Closed developer persona database');
  }

  console.log('\n👋 Goodbye!');
  process.exit(0);
});
