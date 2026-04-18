/**
 * Raven Server - TypeScript implementation with modular architecture
 *
 * Fully typed server integrating all Raven modules:
 * - EventBus for event-driven architecture
 * - FileWatcher for file system monitoring
 * - GitMonitor for repository tracking
 * - TelemetryCollector for system metrics
 * - TriggerEngine for custom alerts
 * - RavenDB for persistence
 */

import express, { Request, Response } from 'express';
import compression from 'compression';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { randomUUID } from 'crypto';
import { join, basename, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';
import fs from 'fs/promises';
import os from 'os';
import { execFile } from 'child_process';

// Import TypeScript modules
import { RavenDB } from './db.js';
import { MetricsCollector } from './metrics-collector.js';
import { TriggerEngine } from './trigger-engine.js';
import { syntaxChecker } from './syntax-checker.js';
import { patternDetector } from './pattern-detector.js';
import { pauseManager } from './pause-manager.js';
import { EventBus, FileWatcher, GitMonitor, getDiff, createPatch } from './modules/index.js';
import type { FileEvent, GitStatusEvent } from './modules/index.js';
import { logger } from './utils/logger.js';
import { errorHandler } from './middleware/errorHandler.js';
import { rateLimitStatus, apiLimiter } from './middleware/security.js';
import { cacheMiddleware, stopCacheCleanup } from './services/cache-service.js';
import { performanceMonitoring } from './middleware/performance.js';
import { createLiveSessionRouter } from './routes/live-session.js';
import { createEventsRouter } from './routes/events.js';
import { createAgentsRouter } from './routes/agents.js';
import { ClaudeLogWatcher } from './services/claude-log-watcher.js';
import { HealthMonitor } from './services/health-monitor.js';
import { createHealthMonitoringRouter } from './routes/health-monitoring.js';
import { ProjectManager } from './services/project-manager.js';
import { LocalModelWatcher } from './services/local-model-watcher.js';
import { InsightsService } from './services/insights-service.js';
import { createInsightsRouter } from './routes/insights.js';
import { calculateCost } from './services/token-cost-calculator.js';
import { createCostsRouter } from './routes/costs.js';
import { createSubagentsRouter } from './routes/subagents.js';
import { SelfAnalysisService } from './services/self-analysis.js';
import { createSelfAnalysisRouter } from './routes/self-analysis.js';
import { createSessionActivityRouter } from './routes/session-activity.js';
import { createGitRouter } from './routes/git.js';
import { createMetricsRouter } from './routes/metrics.js';
import { createTriggersRouter } from './routes/triggers.js';
import { createOllamaProxyRouter } from './routes/ollama-proxy.js';
import { safeInt } from './utils/request-helpers.js';
import { getAgentColor } from './utils/agent-colors.js';

// ==================== Configuration ====================

const app = express();
const PORT = parseInt(process.env.PORT || '9100', 10);
const rawCorsOrigin = process.env.CORS_ORIGIN || 'http://localhost:9000';

// Validate CORS origin is a proper URL
let CORS_ORIGIN: string;
try {
  const parsed = new URL(rawCorsOrigin);
  CORS_ORIGIN = parsed.origin;
} catch {
  logger.warn(`⚠️  Invalid CORS_ORIGIN "${rawCorsOrigin}", falling back to http://localhost:9000`);
  CORS_ORIGIN = 'http://localhost:9000';
}

const httpServer = createServer(app);
const io = new SocketIOServer(httpServer, {
  cors: {
    origin: CORS_ORIGIN,
    methods: ['GET', 'POST'],
    credentials: true
  },
  allowEIO3: true,
  transports: ['websocket', 'polling']
});

// Paths
const RAVEN_DIR = process.env.RAVEN_DIR || join(process.cwd(), '..', '.raven');
const WATCH_PATH = process.env.WATCH_PATH || join(process.cwd(), '..', '..');
const SNAPSHOTS_DIR = join(RAVEN_DIR, 'snapshots');

// ==================== Security Utilities ====================

/**
 * Validates a SQL table name to prevent SQL injection
 * Allows only alphanumeric characters and underscores
 */
function isValidTableName(tableName: string): boolean {
  // SQLite table names must match this pattern
  const validPattern = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
  return validPattern.test(tableName) && tableName.length <= 64;
}

/**
 * Safely parse an integer from a query param with a default value.
 * Unlike `parseInt(v) || default`, this correctly handles 0 as a valid value.
 */
const DB_PATH = join(RAVEN_DIR, 'db', 'raven.db');

// Extract project name - use parent of backend dir (the actual project root)
const PROJECT_NAME = basename(join(process.cwd(), '..'));

// Session ID
const SESSION_ID = randomUUID();

// ==================== Middleware ====================

app.use(compression());
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(performanceMonitoring);

// Server-side request timeout — kill requests that take too long (30s default)
app.use((req: Request, res: Response, next: Function) => {
  const timeout = 30000;
  const timer = setTimeout(() => {
    if (!res.headersSent) {
      res.status(503).json({ error: 'Request timed out on server' });
    }
  }, timeout);
  res.on('finish', () => clearTimeout(timer));
  res.on('close', () => clearTimeout(timer));
  next();
});

// Rate limiting for expensive operations (database export, VACUUM)
// Protects against resource exhaustion from concurrent expensive operations
// Even though Raven is local-only, we need to prevent DoS from concurrent operations

const expensiveOpLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5, // Limit to 5 expensive operations per hour
  message: { error: 'Too many expensive operations, please try again later' },
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  skipSuccessfulRequests: false // Count all requests, even successful ones
});

// Apply general rate limiter to all API routes
app.use('/api/', apiLimiter);

// ==================== Initialize Services ====================

const db = new RavenDB(DB_PATH);
const metricsCollector = new MetricsCollector(db, SESSION_ID, io);
const triggerEngine = new TriggerEngine(RAVEN_DIR, io);
// Initialize health monitoring system
const healthMonitor = new HealthMonitor(db);
const insightsService = new InsightsService(db);

// Wire up diff risk result callback for DB storage and WebSocket emission
insightsService.onDiffRiskResult((eventId, filepath, score, reason) => {
  db.insertDiffRiskScore(
    eventId,
    filepath,
    score,
    reason,
    new Date().toISOString(),
    'auto',
    SESSION_ID
  );
  io.emit('diff-risk-score', {
    eventId,
    filepath,
    score,
    reason,
    timestamp: new Date().toISOString()
  });
});
const selfAnalysisService = new SelfAnalysisService(db, SESSION_ID);

// Emit analysis progress via WebSocket for live terminal output on Code Health page
selfAnalysisService.onProgress(progress => {
  io.emit('analysis-progress', progress);
});

// Database retention: clean old data on startup and nightly at 3 AM
const RETENTION_EVENT_DAYS = parseInt(process.env.RETENTION_EVENT_DAYS || '7', 10);
const RETENTION_METRICS_DAYS = parseInt(process.env.RETENTION_METRICS_DAYS || '30', 10);

function runRetentionCleanup() {
  const results = db.runRetentionCleanup(RETENTION_EVENT_DAYS, RETENTION_METRICS_DAYS);
  const total = Object.values(results).reduce((s, n) => s + n, 0);
  if (total > 0) {
    logger.info(`🧹 Retention cleanup: deleted ${total} old rows`, results);
  }
}

// Run immediately on startup
runRetentionCleanup();

// Schedule nightly at 3 AM
const retentionInterval = setInterval(() => {
  const hour = new Date().getHours();
  if (hour === 3) runRetentionCleanup();
}, 3600000); // check hourly
retentionInterval.unref();

// Set up health alert handler to emit via WebSocket
healthMonitor.onAlert(report => {
  logger.warn(`🚨 Health alert: System status is ${report.overallStatus}`, {
    critical: report.summary.critical,
    warnings: report.summary.warnings
  });

  const criticalIssues = report.checks.filter(c => c.status === 'critical');

  // Emit health alert via Socket.IO for real-time notifications
  io.emit('health-alert', {
    status: report.overallStatus,
    summary: report.summary,
    criticalIssues
  });

  // Fire-and-forget: generate LLM explanation for the anomaly
  if (report.summary.critical > 0 || report.summary.warnings > 0) {
    insightsService
      .generateAnomalyExplanation({
        overallStatus: report.overallStatus,
        criticalIssues,
        summary: report.summary
      })
      .then(insight => {
        if (insight) {
          io.emit('anomaly-insight', {
            alertTimestamp: new Date().toISOString(),
            explanation: insight.content,
            insightId: insight.id
          });
        }
      })
      .catch(() => {
        /* Ollama offline — silently ignore */
      });
  }
});

// Daily digest scheduler — checks hourly, generates at 6PM if no digest exists today
setInterval(async () => {
  const hour = new Date().getHours();
  if (hour >= 18 && hour < 19) {
    const today = new Date().toISOString().split('T')[0];
    const existing = insightsService.getInsights('daily_digest', 1);
    if (existing.length > 0 && existing[0].timestamp.startsWith(today)) {
      return; // Already generated today
    }
    insightsService
      .generateDailyDigest()
      .then(insight => {
        if (insight) {
          io.emit('daily-digest', {
            id: insight.id,
            title: insight.title,
            timestamp: insight.timestamp
          });
        }
      })
      .catch(() => {});
  }
}, 3600000); // Every hour

// Initialize Claude Code log watcher for automatic agent detection
const claudeLogWatcher = new ClaudeLogWatcher((event: any) => {
  const agentName = 'Claude Code';
  const timestamp = event.timestamp || new Date().toISOString();
  const category = event.eventCategory || 'file_change';

  // Register/update Claude Code in agent registry
  if (!agentRegistry.has(agentName)) {
    // Cap agentRegistry at 100 entries
    if (agentRegistry.size >= 100) {
      const oldestKey = agentRegistry.keys().next().value;
      if (oldestKey) agentRegistry.delete(oldestKey);
    }
    agentRegistry.set(agentName, {
      agent_name: agentName,
      agent_type: 'claude-code',
      is_running: true,
      last_seen: timestamp,
      models_available: [],
      requests_handled: 0,
      errors: 0,
      color: getAgentColor('claude')
    });
    logger.info('✅ Claude Code registered in agent registry');
  }

  const agentStatus = agentRegistry.get(agentName);
  if (!agentStatus) return;
  if (!agentStatus.last_seen || new Date(timestamp) > new Date(agentStatus.last_seen)) {
    agentStatus.last_seen = timestamp;
  }
  (agentStatus as any).requests_handled++;
  agentStatus.is_running = true;

  // Store agent events (tool calls, tool results)
  if (category === 'agent_event') {
    try {
      const stmt = db.db.prepare(`
        INSERT INTO agent_events (timestamp, agent, event_type, file, message, session_id, project_name)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      stmt.run(
        timestamp,
        agentName,
        event.type,
        event.file || event.path || null,
        event.tool ? `${event.tool} call` : event.type,
        event.sessionId || SESSION_ID,
        event.projectName || null
      );
    } catch (err: any) {
      logger.debug(`Failed to store agent event: ${err.message}`);
    }
  }

  // Store conversation entries (user messages, assistant text)
  if (category === 'conversation') {
    try {
      const stmt = db.db.prepare(`
        INSERT INTO agent_events (timestamp, agent, event_type, message, session_id, project_name)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      stmt.run(
        timestamp,
        agentName,
        event.type,
        (event.content || '').slice(0, 500),
        event.sessionId || SESSION_ID,
        event.projectName || null
      );
    } catch (err: any) {
      logger.debug(`Failed to store conversation: ${err.message}`);
    }
  }

  // Store token usage data
  if (category === 'token_usage') {
    try {
      const usage = {
        input_tokens: event.inputTokens || 0,
        output_tokens: event.outputTokens || 0,
        cache_creation_input_tokens: event.cacheCreationTokens || 0,
        cache_read_input_tokens: event.cacheReadTokens || 0
      };
      const cost = calculateCost(event.model || 'unknown', usage);

      const stmt = db.db.prepare(`
        INSERT INTO token_usage (timestamp, session_id, project_name, model, input_tokens, output_tokens, cache_creation_tokens, cache_read_tokens, estimated_cost_usd, request_id, agent_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      stmt.run(
        timestamp,
        event.sessionId || SESSION_ID,
        event.projectName || null,
        event.model || 'unknown',
        usage.input_tokens,
        usage.output_tokens,
        usage.cache_creation_input_tokens,
        usage.cache_read_input_tokens,
        cost,
        event.requestId || null,
        event.agentId || null
      );

      // Update subagent_tree running totals if this is a sub-agent request
      if (event.agentId) {
        try {
          db.db
            .prepare(
              `
            UPDATE subagent_tree SET
              total_input_tokens = total_input_tokens + ?,
              total_output_tokens = total_output_tokens + ?,
              estimated_cost_usd = estimated_cost_usd + ?,
              model = COALESCE(model, ?)
            WHERE agent_id = ? AND session_id = ?
          `
            )
            .run(
              usage.input_tokens,
              usage.output_tokens,
              cost,
              event.model || null,
              event.agentId,
              event.sessionId || SESSION_ID
            );
        } catch (err: any) {
          logger.debug(
            `Failed to update subagent token counts for ${event.agentId}: ${err.message}`
          );
        }
      }

      io.emit('token-usage', {
        timestamp,
        model: event.model,
        input_tokens: usage.input_tokens,
        output_tokens: usage.output_tokens,
        cache_creation_tokens: usage.cache_creation_input_tokens,
        cache_read_tokens: usage.cache_read_input_tokens,
        estimated_cost_usd: cost,
        project_name: event.projectName,
        session_id: event.sessionId
      });
    } catch (err: any) {
      logger.debug(`Failed to store token usage: ${err.message}`);
    }
  }

  // Store sub-agent spawn events
  if (category === 'subagent') {
    try {
      const stmt = db.db.prepare(`
        INSERT INTO subagent_tree (session_id, agent_id, parent_agent_id, agent_type, description, model, started_at, project_name)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(session_id, agent_id) DO UPDATE SET
          parent_agent_id = COALESCE(excluded.parent_agent_id, parent_agent_id),
          agent_type = COALESCE(excluded.agent_type, agent_type),
          description = COALESCE(excluded.description, description),
          model = COALESCE(excluded.model, model)
      `);
      stmt.run(
        event.sessionId || SESSION_ID,
        event.uuid || `agent_${Date.now()}`,
        event.parentUuid || null,
        event.subagentType || 'general-purpose',
        event.description || null,
        event.model || null,
        timestamp,
        event.projectName || null
      );

      io.emit('subagent-spawn', {
        timestamp,
        agent_id: event.uuid,
        parent_agent_id: event.parentUuid,
        agent_type: event.subagentType,
        description: event.description,
        model: event.model,
        session_id: event.sessionId,
        project_name: event.projectName
      });
    } catch (err: any) {
      logger.debug(`Failed to store subagent spawn: ${err.message}`);
    }
  }

  // Store and emit API latency measurements
  if (category === 'api_latency') {
    try {
      db.insertApiLatency(
        timestamp,
        event.sessionId || SESSION_ID,
        event.projectName || null,
        event.model || null,
        event.latency_ms
      );

      io.emit('api-latency', {
        timestamp,
        latency_ms: event.latency_ms,
        model: event.model,
        session_id: event.sessionId,
        project_name: event.projectName
      });
    } catch (err: any) {
      logger.debug(`Failed to store API latency: ${err.message}`);
    }
  }

  // Emit via Socket.IO for real-time UI updates
  io.emit('agent-event', {
    type: event.type,
    agent_name: agentName,
    file: event.file || event.path,
    timestamp: timestamp,
    event_type: event.type
  });
}, logger);

// Single-project fallback watcher (used if ProjectManager hasn't started yet)
const fileWatcher = new FileWatcher({
  watchPath: WATCH_PATH,
  projectName: PROJECT_NAME,
  projectPath: WATCH_PATH,
  ignored: [
    '**/node_modules/**',
    '**/.git/**',
    '**/target/**',
    '**/.raven/**',
    '**/*.log',
    '**/dist/**'
  ]
});

// Multi-project manager
const projectManager = new ProjectManager({ ravenDir: RAVEN_DIR });

// Local model watcher — detects Ollama, LM Studio, llama.cpp, etc.
const localModelWatcher = new LocalModelWatcher(30000);

// Git monitor uses the Raven project root (one level up from backend/)
const gitMonitor = new GitMonitor({
  repoPath: join(process.cwd(), '..'),
  pollIntervalMs: 5000,
  enableAutoPoll: false // Manual polling on file changes
});

// ==================== Agent Registry ====================

interface AgentInfo {
  agent_name: string;
  agent_type: string;
  is_running: boolean;
  last_seen: string;
  models_available: string[];
  requests_handled: number;
  errors: number;
  color: string;
}

const agentRegistry = new Map<string, AgentInfo>();
let processCheckTimer: ReturnType<typeof setInterval> | null = null;

// ==================== EventBus Listeners ====================

/**
 * Handle file change events
 */
EventBus.onFileEvent(async (event: FileEvent) => {
  try {
    // Check if monitoring is paused
    if (!pauseManager.shouldProcessEvent()) {
      return; // Skip event processing when paused
    }

    // Resolve project name from event (multi-project) or fallback to default
    const eventProjectName = event.projectName || PROJECT_NAME;
    const eventProjectPath = event.projectPath || WATCH_PATH;

    // Generate diff if this is a change event and we have old content
    let diff: string | null = null;
    const absolutePath = join(eventProjectPath, event.path);
    const oldContent =
      projectManager.getCachedContentForPath(absolutePath) ||
      fileWatcher.getCachedContent(absolutePath);

    if (event.type === 'change' && oldContent && event.content) {
      diff = getDiff(oldContent, event.content)
        .map(d => {
          const prefix = d.added ? '+' : d.removed ? '-' : ' ';
          // Apply prefix to each line within the chunk
          return d.value
            .split('\n')
            .map(line => `${prefix}${line}`)
            .join('\n');
        })
        .join('');
    }

    // Prefix filepath with project name so it's identifiable across projects
    const storedPath = eventProjectName ? `${eventProjectName}/${event.path}` : event.path;

    // Agent attribution: check if a recent agent event references this file
    let agentSource: string | null = null;
    try {
      const recentAgent = db.db
        .prepare(
          `
        SELECT agent FROM agent_events
        WHERE file LIKE ? AND datetime(timestamp) > datetime('now', '-10 seconds')
        ORDER BY timestamp DESC LIMIT 1
      `
        )
        .get(`%${event.path}%`) as { agent: string } | undefined;

      if (recentAgent) {
        agentSource = recentAgent.agent;
      } else {
        // Fallback: check if any agent had activity in the last 5 seconds
        const activeAgent = db.db
          .prepare(
            `
          SELECT agent FROM agent_events
          WHERE datetime(timestamp) > datetime('now', '-5 seconds')
          AND event_type IN ('tool_call', 'inference')
          ORDER BY timestamp DESC LIMIT 1
        `
          )
          .get() as { agent: string } | undefined;
        if (activeAgent) {
          agentSource = activeAgent.agent;
        }
      }
    } catch {
      // Attribution is best-effort
    }

    // Insert into database
    const eventId = db.insertEvent(
      new Date(event.ts).toISOString(),
      storedPath,
      event.type,
      diff,
      0, // CPU will be added later
      0, // Memory will be added later
      SESSION_ID,
      event.hash,
      event.size,
      eventProjectName,
      agentSource
    );

    // Save snapshot
    if (event.content && event.type !== 'unlink') {
      await saveSnapshot(event.path, event.content);
    }

    logger.info(`📁 File ${event.type}: ${storedPath} (ID: ${eventId})`);

    // Emit to WebSocket
    io.emit('file-changed', {
      id: eventId,
      timestamp: new Date(event.ts).toISOString(),
      filepath: storedPath,
      change_type: event.type,
      event_size: event.size,
      file_hash: event.hash,
      project_name: eventProjectName,
      agent_source: agentSource
    });

    // Check triggers
    triggerEngine.evaluate({
      file: event.path,
      event_type: event.type,
      lines_changed: diff ? diff.split('\n').length : 0,
      event_size: event.size
    });

    // Diff risk scoring for significant changes (>50 lines) — debounced to prevent VRAM pressure
    if (diff && diff.split('\n').length > 50) {
      insightsService.queueDiffRisk(eventId, storedPath, diff, event.type);
    }

    // Check syntax if file type is supported (skip Raven's own files)
    const filePath = join(eventProjectPath, event.path);
    const isRavenFile =
      event.path.includes('raven/backend/') || event.path.includes('raven/frontend/');
    if (
      !isRavenFile &&
      syntaxChecker.isSupported(filePath) &&
      (event.type === 'change' || event.type === 'add')
    ) {
      const result = await syntaxChecker.check(filePath);

      if (!result.valid && result.errors.length > 0) {
        // First, resolve any old errors for this file
        db.resolveSyntaxErrorsByFile(event.path);

        // Insert new syntax errors
        for (const error of result.errors) {
          db.insertSyntaxError(
            new Date().toISOString(),
            event.path,
            error.line,
            error.column,
            error.message,
            error.severity,
            error.language,
            SESSION_ID
          );

          logger.warn(`⚠️  Syntax error in ${event.path}:${error.line}: ${error.message}`);
        }

        // Emit to WebSocket for real-time updates
        io.emit('syntax-error', {
          filepath: event.path,
          errors: result.errors,
          count: result.errors.length
        });
      } else if (result.valid) {
        // File is now valid, resolve any old errors
        db.resolveSyntaxErrorsByFile(event.path);
      }
    }

    // Check for problematic patterns in code
    if (event.content && (event.type === 'change' || event.type === 'add')) {
      const patternResult = patternDetector.detect(event.path, event.content);

      if (patternResult.hasIssues) {
        // Resolve old warnings for this file
        db.resolvePatternWarningsByFile(event.path);

        // Insert new warnings
        for (const match of patternResult.matches) {
          db.insertPatternWarning(
            new Date().toISOString(),
            event.path,
            match.line,
            match.pattern.id,
            match.pattern.name,
            match.pattern.severity,
            match.pattern.category,
            match.match,
            match.context,
            SESSION_ID
          );

          if (match.pattern.severity === 'critical') {
            logger.warn(
              `🚨 Critical pattern in ${event.path}:${match.line}: ${match.pattern.name}`
            );
          }
        }

        // Emit to WebSocket
        io.emit('pattern-warning', {
          filepath: event.path,
          warnings: patternResult.matches.map(m => ({
            pattern: m.pattern.name,
            severity: m.pattern.severity,
            line: m.line
          })),
          count: patternResult.matches.length
        });
      } else {
        // No issues, resolve old warnings
        db.resolvePatternWarningsByFile(event.path);
      }
    }

    // Check git status if code file changed
    if (event.path.match(/\.(js|ts|jsx|tsx|py|java|go|rs|c|cpp|h|hpp)$/)) {
      await gitMonitor.checkStatus();
    }
  } catch (error: any) {
    logger.error('❌ Error handling file event:', error);
  }
});

/**
 * Handle git status events
 */
EventBus.onGitStatus((status: GitStatusEvent) => {
  logger.info(
    `🔀 Git: ${status.branch} (${status.modified.length} modified, ${status.created.length} created, ${status.deleted.length} deleted)`
  );

  io.emit('git-status', status);
});

/**
 * Handle telemetry events (handled by MetricsCollector)
 */
// Telemetry is automatically handled by MetricsCollector listening to EventBus

/**
 * Handle trigger fired events
 */
EventBus.onTriggerFired(trigger => {
  logger.info(`🔔 Trigger fired: ${trigger.ruleName} - ${trigger.message}`);
});

// ==================== Helper Functions ====================

/**
 * Save file snapshot
 */
async function saveSnapshot(filepath: string, content: string): Promise<void> {
  try {
    const timestamp = Date.now();
    const snapshotName = `${filepath.replace(/\//g, '_')}_${timestamp}`;
    const snapshotPath = join(SNAPSHOTS_DIR, snapshotName);

    await fs.mkdir(SNAPSHOTS_DIR, { recursive: true });
    await fs.writeFile(snapshotPath, content, 'utf8');

    logger.info(`💾 Snapshot saved: ${snapshotName}`);
  } catch (error: any) {
    logger.error('❌ Snapshot save error:', error);
  }
}

// ==================== REST API Endpoints ====================

app.get('/health', (req: Request, res: Response) => {
  return res.json({
    status: 'healthy',
    session_id: SESSION_ID,
    uptime: process.uptime(),
    active_agents: agentRegistry.size,
    modules: {
      watcher: fileWatcher.isRunning(),
      git: gitMonitor.isRunning(),
      metrics: metricsCollector.isCollectorRunning()
    },
    database: DB_PATH
  });
});

// Alias for frontend compatibility
app.get('/api/health', (req: Request, res: Response) => {
  let dbHealthy = true;
  try {
    db.db.prepare('SELECT 1').get();
  } catch {
    dbHealthy = false;
  }
  return res.json({
    status: 'healthy',
    version: '2.2.0',
    session_id: SESSION_ID,
    uptime: process.uptime(),
    active_agents: agentRegistry.size,
    modules: {
      watcher: projectManager.isWatching() || fileWatcher.isRunning(),
      git: gitMonitor.isRunning(),
      metrics: metricsCollector.isCollectorRunning()
    },
    project_watchers: {
      active: projectManager.activeWatcherCount(),
      projects: projectManager.getWatcherStatus()
    },
    local_models: {
      detected: localModelWatcher.getDetectedModels().length,
      running: localModelWatcher.getRunningModels().length,
      models: localModelWatcher.getRunningModels().map(m => ({
        name: m.name,
        type: m.type,
        models: m.models
      }))
    },
    database: DB_PATH,
    database_health: { status: dbHealthy ? 'healthy' : 'error', accessible: dbHealthy }
  });
});

app.get('/api/health-checks', (req: Request, res: Response) => {
  return res.json({ status: 'healthy', checks: [], summary: { total: 0, passed: 0, failed: 0 } });
});

app.get('/api/session-id', (req: Request, res: Response) => {
  return res.json({ session_id: SESSION_ID });
});

// Rate limit status endpoint (for monitoring)
app.get('/api/rate-limit-status', (req: Request, res: Response) => {
  try {
    const now = Date.now();
    const status = Object.entries(rateLimitStatus).reduce(
      (acc, [key, value]) => {
        const secondsUntilReset = Math.max(0, Math.floor((value.resetTime - now) / 1000));
        const percentUsed = value.max > 0 ? Math.round((value.current / value.max) * 100) : 0;

        acc[key] = {
          current: value.current,
          max: value.max,
          percentUsed,
          secondsUntilReset,
          status: percentUsed >= 95 ? 'critical' : percentUsed >= 80 ? 'warning' : 'ok'
        };
        return acc;
      },
      {} as Record<string, any>
    );

    return res.json(status);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// ==================== Mount Modular Routes ====================

// Mount live session routes
app.use('/api/session', createLiveSessionRouter(db));

// Mount events routes
app.use('/api', createEventsRouter(db));

// Mount agents routes
app.use('/api', createAgentsRouter(db, agentRegistry));

// Mount health monitoring routes
app.use('/api/health', createHealthMonitoringRouter(healthMonitor));

// Mount insights routes (LLM-powered analysis)
app.use('/api/insights', createInsightsRouter(insightsService, db));

// Mount costs routes (token usage & cost tracking)
app.use('/api/costs', createCostsRouter(db));

// Mount sub-agent routes (agent tree visualization)
app.use('/api/subagents', createSubagentsRouter(db));

// Mount self-analysis routes (code health)
app.use('/api/analysis/code-health', createSelfAnalysisRouter(selfAnalysisService));

// Mount session activity routes (conversation timeline)
app.use('/api/session-activity', createSessionActivityRouter());

// Extracted route modules
app.use('/api/git', createGitRouter(gitMonitor));
app.use('/api', createMetricsRouter(db));
app.use('/api', createTriggersRouter(triggerEngine));
app.use(
  '/ollama',
  createOllamaProxyRouter({ db, io, logger, sessionId: SESSION_ID, agentRegistry })
);

// Network info endpoint for mobile access QR code
app.get('/api/network-info', (_req: Request, res: Response) => {
  const nets = os.networkInterfaces();
  const addresses: { name: string; address: string; family: string }[] = [];
  for (const [name, ifaces] of Object.entries(nets)) {
    for (const iface of ifaces || []) {
      if (iface.family === 'IPv4' && !iface.internal) {
        addresses.push({ name, address: iface.address, family: 'IPv4' });
      }
    }
  }
  const frontendPort = parseInt(process.env.FRONTEND_PORT || '9000', 10);
  res.json({
    addresses,
    backend_port: PORT,
    frontend_port: frontendPort,
    lan_url: addresses.length > 0 ? `http://${addresses[0].address}:${frontendPort}` : null,
    backend_url: addresses.length > 0 ? `http://${addresses[0].address}:${PORT}` : null
  });
});

// Serve built frontend in production/npx mode (when frontend/dist exists)
const frontendDistPath = join(dirname(fileURLToPath(import.meta.url)), '../../frontend/dist');
if (existsSync(frontendDistPath)) {
  app.use(express.static(frontendDistPath));
  // SPA fallback — serve index.html for non-API routes
  app.get(/^\/(?!api\/).*/, (_req: Request, res: Response) => {
    res.sendFile(join(frontendDistPath, 'index.html'));
  });
  logger.info(`📦 Serving frontend from ${frontendDistPath}`);
}

// ==================== Legacy Individual Route Handlers ====================

app.get('/api/dashboard-stats', cacheMiddleware(3000), (req: Request, res: Response) => {
  try {
    const project = req.query.project as string | undefined;
    const stats = db.getDashboardStats(SESSION_ID, project);
    stats.total_agents = agentRegistry.size;
    stats.app_errors =
      (db.db.prepare('SELECT COUNT(*) as count FROM app_errors WHERE resolved = 0').get() as any)
        ?.count || 0;
    return res.json(stats);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

app.get('/api/top-modified-files', cacheMiddleware(5000), (req: Request, res: Response) => {
  try {
    const limit = safeInt(req.query.limit, 10);
    const project = req.query.project as string | undefined;
    const projectFilter = project && project !== 'all' ? project : null;

    const whereClause = projectFilter
      ? 'WHERE filepath IS NOT NULL AND project_name = ?'
      : 'WHERE filepath IS NOT NULL';
    const params = projectFilter ? [projectFilter, limit] : [limit];

    const files = db.db
      .prepare(
        `SELECT filepath, COUNT(*) as edit_count, MAX(timestamp) as last_modified
        FROM events
        ${whereClause}
        GROUP BY filepath
        ORDER BY edit_count DESC
        LIMIT ?`
      )
      .all(...params);
    return res.json(files);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

app.get('/api/longest-edits', cacheMiddleware(10000), (req: Request, res: Response) => {
  try {
    const limit = safeInt(req.query.limit, 10);
    const edits = db.getLongestEdits(limit);
    return res.json(edits);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// ==================== Agents ====================
// All agent routes (agents-status, agent-events, events-by-agent, agent-stats, agent-profiles)
// are handled by the agents router (routes/agents.ts)

// ==================== Local Models ====================

app.get('/api/local-models', (req: Request, res: Response) => {
  const detected = localModelWatcher.getDetectedModels();
  const running = localModelWatcher.getRunningModels();
  return res.json({
    detected,
    running: running.length,
    total: detected.length
  });
});

// GET /api/models — Per-model stats across all agents
app.get('/api/models', cacheMiddleware(5000), (req: Request, res: Response) => {
  try {
    // Get per-agent stats from agent_events
    const agentStats = db.db
      .prepare(
        `
      SELECT
        agent,
        COUNT(*) as total_events,
        SUM(CASE WHEN event_type = 'inference' THEN 1 ELSE 0 END) as inferences,
        SUM(CASE WHEN event_type = 'tool_call' THEN 1 ELSE 0 END) as tool_calls,
        SUM(CASE WHEN event_type = 'assistant_text' THEN 1 ELSE 0 END) as responses,
        SUM(CASE WHEN event_type = 'user_message' THEN 1 ELSE 0 END) as prompts,
        AVG(CASE WHEN duration_ms > 0 THEN duration_ms ELSE NULL END) as avg_duration_ms,
        SUM(lines_changed) as total_lines_changed,
        MIN(timestamp) as first_seen,
        MAX(timestamp) as last_active,
        COUNT(DISTINCT file) as files_touched
      FROM agent_events
      GROUP BY agent
      ORDER BY total_events DESC
      LIMIT 100
    `
      )
      .all() as any[];

    // Get file change attribution stats
    const attributionStats = db.db
      .prepare(
        `
      SELECT
        agent_source,
        COUNT(*) as file_changes,
        COUNT(DISTINCT filepath) as unique_files
      FROM events
      WHERE agent_source IS NOT NULL
      GROUP BY agent_source
      LIMIT 100
    `
      )
      .all() as any[];
    const attrMap = new Map(attributionStats.map((a: any) => [a.agent_source, a]));

    // Merge with agent registry for status and model info
    const models = agentStats.map((agent: any) => {
      const registry =
        agentRegistry.get(agent.agent) || agentRegistry.get(agent.agent.replace(/ /g, '-'));
      const attr = attrMap.get(agent.agent);
      return {
        name: agent.agent,
        type: registry?.agent_type || 'unknown',
        color: registry?.color || getAgentColor(agent.agent),
        is_running: registry?.is_running || false,
        models_available: registry?.models_available || [],
        total_events: agent.total_events,
        inferences: agent.inferences,
        tool_calls: agent.tool_calls,
        responses: agent.responses,
        prompts: agent.prompts,
        avg_duration_ms: Math.round(agent.avg_duration_ms || 0),
        total_lines_changed: agent.total_lines_changed || 0,
        files_touched: agent.files_touched,
        file_changes: attr?.file_changes || 0,
        unique_files_changed: attr?.unique_files || 0,
        first_seen: agent.first_seen,
        last_active: agent.last_active
      };
    });

    // Add detected-but-no-events agents (like Ollama before first use)
    const existingNames = new Set(models.map((m: any) => m.name));
    for (const [, agent] of agentRegistry) {
      if (!existingNames.has(agent.agent_name)) {
        models.push({
          name: agent.agent_name,
          type: agent.agent_type,
          color: agent.color,
          is_running: agent.is_running,
          models_available: agent.models_available || [],
          total_events: 0,
          inferences: 0,
          tool_calls: 0,
          responses: 0,
          prompts: 0,
          avg_duration_ms: 0,
          total_lines_changed: 0,
          files_touched: 0,
          file_changes: 0,
          unique_files_changed: 0,
          first_seen: null,
          last_active: agent.last_seen
        });
      }
    }

    return res.json(models);
  } catch (error: any) {
    logger.error('Error getting model stats:', error);
    return res.status(500).json({ error: 'Failed to get model stats' });
  }
});

// ==================== File Events ====================

app.get('/api/file-events', cacheMiddleware(5000), (req: Request, res: Response) => {
  try {
    const limit = safeInt(req.query.limit, 100);
    const includeDiff = req.query.diff === 'true';
    const startTime = req.query.start_time as string;
    const endTime = req.query.end_time as string;
    const filepath = req.query.filepath as string;

    // Build query with optional filtering
    const fields = includeDiff
      ? 'id, timestamp, filepath, change_type, event_size, file_hash, cpu, mem, diff, project_name, agent_source'
      : 'id, timestamp, filepath, change_type, event_size, file_hash, cpu, mem, project_name, agent_source';

    let query = `SELECT ${fields} FROM events`;
    const params: any[] = [];
    const conditions: string[] = [];

    const project = req.query.project as string | undefined;
    if (project && project !== 'all') {
      conditions.push('project_name = ?');
      params.push(project);
    }
    if (filepath) {
      conditions.push('filepath = ?');
      params.push(filepath);
    }
    if (startTime) {
      conditions.push('timestamp >= ?');
      params.push(startTime);
    }
    if (endTime) {
      conditions.push('timestamp <= ?');
      params.push(endTime);
    }
    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ' ORDER BY timestamp DESC LIMIT ?';
    params.push(limit);

    const events = db.db.prepare(query).all(...params);
    return res.json(events);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// Get a computed unified diff between two consecutive snapshots of a file
app.get('/api/file-diff/:filepath(*)', async (req: Request, res: Response) => {
  try {
    const filepath = req.params.filepath;

    // Get the two most recent snapshots with different content
    const snapshots = db.db
      .prepare(
        `
      SELECT id, diff as content, file_hash, timestamp
      FROM events
      WHERE filepath = ? AND diff IS NOT NULL AND diff != ''
      ORDER BY id DESC LIMIT 10
    `
      )
      .all(filepath) as Array<{
      id: number;
      content: string;
      file_hash: string;
      timestamp: string;
    }>;

    if (snapshots.length < 2) {
      // Only one snapshot — show as all additions
      const content = snapshots[0]?.content || '';
      const lines = content.split('\n');
      const unifiedDiff = [
        `--- /dev/null`,
        `+++ ${filepath}`,
        `@@ -0,0 +1,${lines.length} @@`,
        ...lines.map(l => `+${l}`)
      ].join('\n');
      return res.json({ filepath, diff: unifiedDiff, type: 'new' });
    }

    // Find the first pair with different hashes
    let current = snapshots[0];
    let previous = null;
    for (let i = 1; i < snapshots.length; i++) {
      if (snapshots[i].file_hash !== current.file_hash) {
        previous = snapshots[i];
        break;
      }
    }

    if (!previous) {
      // All snapshots are identical — no changes
      return res.json({ filepath, diff: '', type: 'unchanged' });
    }

    // Compute unified diff
    const diff = await createPatch(previous.content, current.content, filepath);
    return res.json({
      filepath,
      diff,
      type: 'modified',
      from: previous.timestamp,
      to: current.timestamp
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

app.get('/api/tracked-files', cacheMiddleware(5000), (req: Request, res: Response) => {
  try {
    const files = db.getTrackedFiles();
    return res.json(files);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

app.get(
  '/api/events-by-session/:sessionId',
  cacheMiddleware(3000),
  (req: Request, res: Response) => {
    try {
      const { sessionId: sid } = req.params;
      const events = db.getEventsBySession(sid);
      return res.json(events);
    } catch (error: any) {
      return res.status(500).json({ error: error.message });
    }
  }
);

// ==================== System Metrics ====================

// Metrics, Git, and Triggers routes are now in their own modules
// (see app.use calls further up)

// ==================== Telemetry ====================

app.post('/telemetry', (req: Request, res: Response) => {
  try {
    const { agent, event, file, lines_changed, duration_ms, message, metadata } = req.body;

    if (!agent || !event || !message) {
      return res.status(400).json({ error: 'Missing required fields: agent, event, message' });
    }

    // Input length validation to prevent abuse
    const MAX_FIELD_LEN = 10000;
    if (
      (typeof agent === 'string' && agent.length > 200) ||
      (typeof event === 'string' && event.length > 200) ||
      (typeof message === 'string' && message.length > MAX_FIELD_LEN) ||
      (typeof file === 'string' && file.length > 1000)
    ) {
      return res.status(400).json({ error: 'Field exceeds maximum allowed length' });
    }

    const timestamp = new Date().toISOString();

    const eventId = db.insertAgentEvent(
      timestamp,
      agent,
      event,
      file,
      lines_changed,
      duration_ms,
      message,
      metadata,
      SESSION_ID,
      null // project_name (multi-project support not yet implemented)
    );

    // Update agent registry
    if (!agentRegistry.has(agent)) {
      // Cap agentRegistry at 100 entries
      if (agentRegistry.size >= 100) {
        const oldestKey = agentRegistry.keys().next().value;
        if (oldestKey) agentRegistry.delete(oldestKey);
      }
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

    const agentStatus = agentRegistry.get(agent)!;
    agentStatus.last_seen = timestamp;
    agentStatus.requests_handled++;
    agentStatus.is_running = true;

    // Evaluate triggers
    triggerEngine.evaluate({
      file,
      agent,
      event_type: event,
      lines_changed,
      duration_ms
    });

    // Emit via WebSocket
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

    io.emit('agent-stats', db.getAgentStats());

    return res.json({ success: true, event_id: eventId, session_id: SESSION_ID });
  } catch (error: any) {
    logger.error('❌ Telemetry error:', error);
    return res.status(500).json({ error: error.message });
  }
});

// ==================== Multi-Project Health API ====================

app.get('/api/health/projects', cacheMiddleware(5000), (req: Request, res: Response) => {
  try {
    // Database doesn't track projects separately, so get aggregate stats
    const totalEvents = db.db.prepare('SELECT COUNT(*) as count FROM events').get() as any;
    const recentEvents = db.db
      .prepare(
        "SELECT COUNT(*) as count FROM events WHERE datetime(timestamp) >= datetime('now', '-24 hours')"
      )
      .get() as any;
    const lastActivity = db.db
      .prepare('SELECT MAX(timestamp) as timestamp FROM events')
      .get() as any;
    const syntaxErrors = db.db.prepare('SELECT COUNT(*) as count FROM syntax_errors').get() as any;

    // Create a single project entry with aggregate data
    const projectsData = [
      {
        project_name: PROJECT_NAME,
        total_events: totalEvents.count,
        recent_events: recentEvents.count,
        last_activity: lastActivity.timestamp
      }
    ];

    const errorsByProject = [
      {
        project_name: PROJECT_NAME,
        error_count: syntaxErrors.count
      }
    ];

    const errorMap = new Map(errorsByProject.map((e: any) => [e.project_name, e.error_count]));

    // Build health data for each project
    const projects = projectsData.map((proj: any) => {
      const recentEvents = proj.recent_events || 0;
      const errorCount = errorMap.get(proj.project_name) || 0;

      // Calculate health score (0-100)
      const activityScore = Math.min(recentEvents, 100);
      const errorPenalty = Math.min(errorCount * 5, 50);
      const healthScore = Math.max(activityScore - errorPenalty, 0);

      // Determine status based on last activity
      let status = 'inactive';
      if (proj.last_activity) {
        const lastActivityHours =
          (Date.now() - new Date(proj.last_activity).getTime()) / (1000 * 60 * 60);
        if (lastActivityHours < 1) status = 'active';
        else if (lastActivityHours < 24) status = 'recent';
        else if (lastActivityHours < 168) status = 'idle';
      }

      return {
        name: proj.project_name,
        status,
        health_score: healthScore,
        recent_events: recentEvents,
        error_count: errorCount,
        last_activity: proj.last_activity
      };
    });

    // If no projects found, add current project
    if (projects.length === 0) {
      projects.push({
        name: PROJECT_NAME,
        status: 'inactive',
        health_score: 0,
        recent_events: 0,
        error_count: 0,
        last_activity: null
      });
    }

    return res.json({
      projects,
      total_projects: projects.length,
      active_projects: projects.filter((p: any) => p.status === 'active').length,
      recent_projects: projects.filter((p: any) => p.status === 'recent').length
    });
  } catch (error: any) {
    logger.error('❌ Multi-project health error:', error);
    return res.status(500).json({ error: error.message });
  }
});

// ==================== Custom Metrics Dashboard API ====================

app.get('/api/metrics/dashboard', cacheMiddleware(5000), (req: Request, res: Response) => {
  try {
    // Total events
    const totalEvents = db.db.prepare(`SELECT COUNT(*) as count FROM events`).get() as any;

    // Events by type
    const eventsByType = db.db
      .prepare(
        `
      SELECT change_type, COUNT(*) as count
      FROM events
      GROUP BY change_type
    `
      )
      .all() as any[];

    // Events in last 24h
    const events24h = db.db
      .prepare(
        `
      SELECT COUNT(*) as count
      FROM events
      WHERE datetime(timestamp) >= datetime('now', '-24 hours')
    `
      )
      .get() as any;

    // Active projects (check if project_name column exists)
    let activeProjects = { count: 1 };
    try {
      activeProjects = db.db
        .prepare(
          `
        SELECT COUNT(DISTINCT project_name) as count
        FROM events
        WHERE project_name IS NOT NULL
      `
        )
        .get() as any;
      if (activeProjects.count === 0) activeProjects.count = 1; // Default to 1 if no projects found
    } catch (err) {
      // Column doesn't exist in old databases, default to 1
      logger.warn('⚠️  project_name column not found, using default value');
      activeProjects = { count: 1 };
    }

    // Total files tracked
    const totalFiles = db.db
      .prepare(
        `
      SELECT COUNT(DISTINCT filepath) as count
      FROM events
    `
      )
      .get() as any;

    // Most active file
    const mostActiveFile = db.db
      .prepare(
        `
      SELECT filepath, COUNT(*) as count
      FROM events
      GROUP BY filepath
      ORDER BY count DESC
      LIMIT 1
    `
      )
      .get() as any;

    // Error count (table may not exist)
    let errorCount = { count: 0 };
    try {
      errorCount = db.db
        .prepare(
          `
        SELECT COUNT(*) as count
        FROM error_logs
      `
        )
        .get() as any;
    } catch (err) {
      // Table doesn't exist, use default
      errorCount = { count: 0 };
    }

    // Conversation count (table may not exist)
    let conversationCount = { count: 0 };
    try {
      conversationCount = db.db
        .prepare(
          `
        SELECT COUNT(*) as count
        FROM conversations
      `
        )
        .get() as any;
    } catch (err) {
      // Table doesn't exist, use default
      conversationCount = { count: 0 };
    }

    // Average events per day (last 7 days)
    const avgPerDay = db.db
      .prepare(
        `
      SELECT COUNT(*) / 7.0 as avg
      FROM events
      WHERE datetime(timestamp) >= datetime('now', '-7 days')
    `
      )
      .get() as any;

    // Busiest hour of day
    const busiestHour = db.db
      .prepare(
        `
      SELECT
        CAST(strftime('%H', timestamp) AS INTEGER) as hour,
        COUNT(*) as count
      FROM events
      GROUP BY hour
      ORDER BY count DESC
      LIMIT 1
    `
      )
      .get() as any;

    return res.json({
      total_events: totalEvents.count || 0,
      events_by_type: eventsByType,
      events_24h: events24h.count || 0,
      active_projects: activeProjects.count || 0,
      total_files: totalFiles.count || 0,
      most_active_file: mostActiveFile || null,
      error_count: errorCount.count || 0,
      conversation_count: conversationCount.count || 0,
      avg_events_per_day: Math.round(avgPerDay.avg || 0),
      busiest_hour: busiestHour ? `${busiestHour.hour}:00` : 'N/A'
    });
  } catch (error: any) {
    logger.error('❌ Custom metrics error:', error);
    return res.status(500).json({ error: error.message });
  }
});

// ==================== Multi-Project Configuration API ====================

const PROJECTS_CONFIG_PATH = join(RAVEN_DIR, 'projects.json');
const MAX_PROJECTS = 50;
const MAX_PROJECT_NAME_LENGTH = 100;
const MIN_RETENTION_DAYS = 1;
const MAX_RETENTION_DAYS = 365;
const MIN_FILE_SIZE = 0;
const MAX_FILE_SIZE = 100_000_000; // 100MB

interface ProjectConfig {
  id: string;
  name: string;
  path: string;
  enabled: boolean;
  ignorePatterns?: string[];
  maxFileSize?: number;
  retentionDays?: number;
}

interface ProjectsConfig {
  autoDiscover: boolean;
  basePath: string;
  projects: ProjectConfig[];
}

// Security: Validate path is within allowed base directory
function isPathAllowed(userPath: string, basePath: string): boolean {
  try {
    const resolved = resolve(userPath);
    const base = resolve(basePath);
    return resolved.startsWith(base);
  } catch (e: any) {
    logger.error('[isPathAllowed] Error:', e);
    return false;
  }
}

// Security: Validate project name
function validateProjectName(name: string): boolean {
  if (!name || typeof name !== 'string') return false;
  if (name.length > MAX_PROJECT_NAME_LENGTH) return false;
  // Allow alphanumeric, spaces, hyphens, underscores
  return /^[a-zA-Z0-9\s\-_]+$/.test(name);
}

// Security: Validate retention days
function validateRetentionDays(days: any): boolean {
  if (days === null || days === undefined) return true; // Optional field
  const num = Number(days);
  return !isNaN(num) && num >= MIN_RETENTION_DAYS && num <= MAX_RETENTION_DAYS;
}

// Security: Validate max file size
function validateMaxFileSize(size: any): boolean {
  if (size === null || size === undefined) return true; // Optional field
  const num = Number(size);
  return !isNaN(num) && num >= MIN_FILE_SIZE && num <= MAX_FILE_SIZE;
}

// Security: Validate ignore patterns
function validateIgnorePatterns(patterns: any): boolean {
  if (!Array.isArray(patterns)) return false;
  if (patterns.length > 100) return false; // Reasonable limit
  return patterns.every(p => typeof p === 'string' && p.length < 200);
}

// Security: Sanitize project ID
function sanitizeProjectId(id: string): string {
  return id
    .toLowerCase()
    .replace(/[^a-z0-9\-_]/g, '-')
    .substring(0, 50);
}

// Load projects configuration
async function loadProjectsConfig(): Promise<ProjectsConfig> {
  try {
    const data = await fs.readFile(PROJECTS_CONFIG_PATH, 'utf-8');
    try {
      return JSON.parse(data);
    } catch (parseError: any) {
      logger.error('Invalid JSON in projects config file:', parseError);
      throw new Error('Projects configuration file contains invalid JSON');
    }
  } catch (error) {
    // Return default config if file doesn't exist or has invalid JSON
    // Use home directory as basePath for more flexibility
    const homedir = os.homedir();
    logger.warn('Using default projects config');
    return {
      autoDiscover: true,
      basePath: homedir,
      projects: []
    };
  }
}

// Save projects configuration
async function saveProjectsConfig(config: ProjectsConfig): Promise<void> {
  await fs.writeFile(PROJECTS_CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');
}

// GET /api/projects - List all configured projects
app.get('/api/projects', cacheMiddleware(5000), async (req: Request, res: Response) => {
  try {
    const config = await loadProjectsConfig();

    // Get stats for each project from the shared database
    const projectsWithStats = await Promise.all(
      config.projects.map(async project => {
        let eventCount = 0;

        try {
          const result = db.db
            .prepare('SELECT COUNT(*) as count FROM events WHERE project_name = ?')
            .get(project.name) as { count: number };
          eventCount = result.count;
        } catch (err) {
          // Query failed
        }

        return {
          ...project,
          eventCount
        };
      })
    );

    return res.json({
      ...config,
      projects: projectsWithStats
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// POST /api/projects - Add new project
app.post('/api/projects', async (req: Request, res: Response) => {
  try {
    const {
      name,
      path,
      enabled = true,
      ignorePatterns = [],
      maxFileSize,
      retentionDays
    } = req.body;

    // Validate required fields
    if (!name || !path) {
      return res.status(400).json({ error: 'Name and path are required' });
    }

    // Validate project name
    if (!validateProjectName(name)) {
      return res.status(400).json({
        error:
          'Invalid project name. Use only alphanumeric characters, spaces, hyphens, and underscores (max 100 chars)'
      });
    }

    // Validate optional fields
    if (!validateIgnorePatterns(ignorePatterns)) {
      return res.status(400).json({ error: 'Invalid ignore patterns' });
    }

    if (!validateMaxFileSize(maxFileSize)) {
      return res.status(400).json({
        error: `Max file size must be between ${MIN_FILE_SIZE} and ${MAX_FILE_SIZE} bytes`
      });
    }

    if (!validateRetentionDays(retentionDays)) {
      return res.status(400).json({
        error: `Retention days must be between ${MIN_RETENTION_DAYS} and ${MAX_RETENTION_DAYS}`
      });
    }

    const config = await loadProjectsConfig();

    // Check project limit
    if (config.projects.length >= MAX_PROJECTS) {
      return res.status(400).json({ error: `Maximum of ${MAX_PROJECTS} projects allowed` });
    }

    // Security: Validate path is within allowed base directory
    if (!isPathAllowed(path, config.basePath)) {
      return res.status(403).json({ error: 'Path outside allowed directory' });
    }

    // Validate path exists
    try {
      await fs.access(path);
    } catch {
      return res.status(400).json({ error: 'Invalid path' });
    }

    // Generate secure ID from path basename
    const id = sanitizeProjectId(basename(path));

    // Check if project already exists
    if (config.projects.some(p => p.id === id)) {
      return res.status(409).json({ error: 'Project already exists' });
    }

    const newProject: ProjectConfig = {
      id,
      name: name.trim(),
      path,
      enabled: Boolean(enabled),
      ignorePatterns: ignorePatterns || [],
      maxFileSize: maxFileSize ? Number(maxFileSize) : undefined,
      retentionDays: retentionDays ? Number(retentionDays) : undefined
    };

    config.projects.push(newProject);
    await saveProjectsConfig(config);

    // Auto-start watcher if project is enabled
    if (newProject.enabled) {
      await projectManager.startWatcher(newProject);
    }

    return res.json({ success: true, project: newProject });
  } catch (error: any) {
    logger.error('[POST /api/projects] Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/projects/:id - Update project settings
app.put('/api/projects/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    // Security: Validate ID format
    if (!/^[a-z0-9\-_]+$/.test(id)) {
      return res.status(400).json({ error: 'Invalid project ID' });
    }

    const config = await loadProjectsConfig();
    const projectIndex = config.projects.findIndex(p => p.id === id);

    if (projectIndex === -1) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Security: Whitelist allowed update fields
    const allowedFields = ['name', 'enabled', 'ignorePatterns', 'maxFileSize', 'retentionDays'];
    const sanitizedUpdates: Partial<ProjectConfig> = {};

    for (const field of allowedFields) {
      if (updates[field] !== undefined) {
        // Validate each field
        if (field === 'name') {
          if (!validateProjectName(updates[field])) {
            return res.status(400).json({ error: 'Invalid project name' });
          }
          sanitizedUpdates[field] = updates[field].trim();
        } else if (field === 'enabled') {
          sanitizedUpdates[field] = Boolean(updates[field]);
        } else if (field === 'ignorePatterns') {
          if (!validateIgnorePatterns(updates[field])) {
            return res.status(400).json({ error: 'Invalid ignore patterns' });
          }
          sanitizedUpdates[field] = updates[field];
        } else if (field === 'maxFileSize') {
          if (!validateMaxFileSize(updates[field])) {
            return res.status(400).json({
              error: `Max file size must be between ${MIN_FILE_SIZE} and ${MAX_FILE_SIZE} bytes`
            });
          }
          sanitizedUpdates[field] = Number(updates[field]);
        } else if (field === 'retentionDays') {
          if (!validateRetentionDays(updates[field])) {
            return res.status(400).json({
              error: `Retention days must be between ${MIN_RETENTION_DAYS} and ${MAX_RETENTION_DAYS}`
            });
          }
          sanitizedUpdates[field] = Number(updates[field]);
        }
      }
    }

    const previousEnabled = config.projects[projectIndex].enabled;

    // Update project with sanitized fields only
    config.projects[projectIndex] = {
      ...config.projects[projectIndex],
      ...sanitizedUpdates,
      id // Preserve ID (immutable)
    };

    await saveProjectsConfig(config);

    // Toggle watcher based on enabled state change
    const updatedProject = config.projects[projectIndex];
    if (sanitizedUpdates.enabled !== undefined && sanitizedUpdates.enabled !== previousEnabled) {
      if (updatedProject.enabled) {
        await projectManager.startWatcher(updatedProject);
      } else {
        await projectManager.stopWatcher(updatedProject.id);
      }
    }

    return res.json({ success: true, project: updatedProject });
  } catch (error: any) {
    logger.error('[PUT /api/projects/:id] Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/projects/:id - Remove project
app.delete('/api/projects/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const deleteDatabase = req.query.deleteDb === 'true';

    // Security: Validate ID format to prevent path traversal
    if (!/^[a-z0-9\-_]+$/.test(id)) {
      return res.status(400).json({ error: 'Invalid project ID' });
    }

    const config = await loadProjectsConfig();
    const projectIndex = config.projects.findIndex(p => p.id === id);

    if (projectIndex === -1) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Stop watcher before removing
    await projectManager.stopWatcher(id);

    // Remove from config
    config.projects.splice(projectIndex, 1);
    await saveProjectsConfig(config);

    // Optionally delete database
    if (deleteDatabase) {
      // Security: Sanitize ID and construct safe path
      const safeId = sanitizeProjectId(id);
      const dbPath = join(RAVEN_DIR, 'db', `${safeId}.db`);

      // Security: Verify path is within database directory using resolve + relative check
      const dbDir = resolve(RAVEN_DIR, 'db');
      const resolvedDbPath = resolve(dbPath);
      if (!resolvedDbPath.startsWith(dbDir + '/')) {
        logger.warn('[Security] [DELETE /api/projects/:id] Path traversal attempt:', dbPath);
        return res.status(403).json({ error: 'Forbidden' });
      }

      try {
        await fs.unlink(dbPath);
        await fs.unlink(`${dbPath}-shm`).catch(() => {});
        await fs.unlink(`${dbPath}-wal`).catch(() => {});
      } catch (err) {
        // Database file doesn't exist, that's fine
        logger.info('[DELETE /api/projects/:id] Database file not found:', dbPath);
      }
    }

    return res.json({ success: true });
  } catch (error: any) {
    logger.error('[DELETE /api/projects/:id] Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/projects/discover - Discover projects in base path
app.post('/api/projects/discover', async (req: Request, res: Response) => {
  try {
    const config = await loadProjectsConfig();
    const requestedBasePath = req.body.basePath;

    // Use config basePath if not provided
    let basePath = config.basePath;

    // If user provides basePath, validate it
    if (requestedBasePath) {
      // Security: Validate requested path is within or equals config basePath
      if (
        !isPathAllowed(requestedBasePath, config.basePath) &&
        requestedBasePath !== config.basePath
      ) {
        return res.status(403).json({ error: 'Base path outside allowed directory' });
      }
      basePath = requestedBasePath;
    }

    // Security: Limit discovery depth to prevent filesystem enumeration
    let entries;
    try {
      entries = await fs.readdir(basePath, { withFileTypes: true });
    } catch (err) {
      return res.status(400).json({ error: 'Invalid base path' });
    }

    const discovered: ProjectConfig[] = [];
    const MAX_DISCOVERIES = 100; // Prevent excessive results

    for (const entry of entries) {
      if (discovered.length >= MAX_DISCOVERIES) break;

      if (entry.isDirectory() && !entry.name.startsWith('.')) {
        const projectPath = join(basePath, entry.name);

        // Security: Verify path is safe
        if (!isPathAllowed(projectPath, config.basePath)) {
          continue;
        }

        const hasGit = await fs
          .access(join(projectPath, '.git'))
          .then(() => true)
          .catch(() => false);
        const hasPackageJson = await fs
          .access(join(projectPath, 'package.json'))
          .then(() => true)
          .catch(() => false);

        if (hasGit || hasPackageJson) {
          const id = sanitizeProjectId(entry.name);

          // Only add if not already in config
          if (!config.projects.some(p => p.id === id)) {
            discovered.push({
              id,
              name: entry.name,
              path: projectPath,
              enabled: false,
              ignorePatterns: ['node_modules/**', 'dist/**', '.git/**']
            });
          }
        }
      }
    }

    // Auto-register: if autoRegister flag is set, add all discovered and start watchers
    const autoRegister = req.body.autoRegister === true;
    if (autoRegister && discovered.length > 0) {
      for (const project of discovered) {
        project.enabled = true;
        config.projects.push(project);
        await projectManager.startWatcher(project);
      }
      await saveProjectsConfig(config);
      logger.info(`Auto-registered ${discovered.length} discovered projects`);
    }

    return res.json({ discovered, basePath, autoRegistered: autoRegister ? discovered.length : 0 });
  } catch (error: any) {
    logger.error('[POST /api/projects/discover] Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/projects/config - Update global config (autoDiscover, basePath)
app.put('/api/projects/config', async (req: Request, res: Response) => {
  try {
    const { autoDiscover, basePath } = req.body;

    const config = await loadProjectsConfig();

    if (typeof autoDiscover !== 'undefined') {
      config.autoDiscover = autoDiscover;
    }

    if (basePath) {
      config.basePath = basePath;
    }

    await saveProjectsConfig(config);

    return res.json({ success: true, config });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// ==================== Global Search API ====================

app.get('/api/search/global', (req: Request, res: Response) => {
  try {
    const query = (req.query.q as string) || '';
    const limit = safeInt(req.query.limit, 100);

    if (query.length < 2) {
      return res.json({ results: [], total: 0, categories: {} });
    }

    const results: any[] = [];
    const searchPattern = `%${query}%`;

    // Search file events
    const fileEvents = db.db
      .prepare(
        `
      SELECT id, timestamp, filepath as title, change_type as description, project_name
      FROM events
      WHERE filepath LIKE ?
      ORDER BY timestamp DESC
      LIMIT ?
    `
      )
      .all(searchPattern, limit) as any[];

    fileEvents.forEach((e: any) => {
      results.push({
        type: 'event',
        id: e.id,
        title: e.title,
        description: `${e.description}`,
        timestamp: e.timestamp,
        project_name: e.project_name,
        icon: '📄'
      });
    });

    // Search conversations
    const conversations = db.db
      .prepare(
        `
      SELECT id, timestamp, context as title, query as description
      FROM conversations
      WHERE context LIKE ? OR query LIKE ?
      ORDER BY timestamp DESC
      LIMIT ?
    `
      )
      .all(searchPattern, searchPattern, limit) as any[];

    conversations.forEach((c: any) => {
      results.push({
        type: 'conversation',
        id: c.id,
        title: c.title || 'Conversation',
        description: c.description,
        timestamp: c.timestamp,
        icon: '💬'
      });
    });

    // Search errors
    const errors = db.db
      .prepare(
        `
      SELECT id, timestamp, message as title, severity as description, project_name
      FROM error_logs
      WHERE message LIKE ?
      ORDER BY timestamp DESC
      LIMIT ?
    `
      )
      .all(searchPattern, limit) as any[];

    errors.forEach((e: any) => {
      results.push({
        type: 'error',
        id: e.id,
        title: e.title,
        description: e.description,
        timestamp: e.timestamp,
        project_name: e.project_name,
        icon: '❌'
      });
    });

    // Search notifications
    const notifications = db.db
      .prepare(
        `
      SELECT id, timestamp, message as title, severity as description, project_name
      FROM notifications
      WHERE message LIKE ?
      ORDER BY timestamp DESC
      LIMIT ?
    `
      )
      .all(searchPattern, limit) as any[];

    notifications.forEach((n: any) => {
      results.push({
        type: 'notification',
        id: n.id,
        title: n.title,
        description: n.description,
        timestamp: n.timestamp,
        project_name: n.project_name,
        icon: '🔔'
      });
    });

    // Sort all results by timestamp
    results.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    // Limit total results
    const limitedResults = results.slice(0, limit);

    // Count categories
    const categories = {
      events: results.filter(r => r.type === 'event').length,
      conversations: results.filter(r => r.type === 'conversation').length,
      errors: results.filter(r => r.type === 'error').length,
      notifications: results.filter(r => r.type === 'notification').length
    };

    return res.json({
      results: limitedResults,
      total: results.length,
      categories
    });
  } catch (error: any) {
    logger.error('❌ Global search error:', error);
    return res.status(500).json({ error: error.message });
  }
});

// ==================== Historical Trends API ====================

app.get('/api/trends/historical', cacheMiddleware(5000), (req: Request, res: Response) => {
  try {
    const period = (req.query.period as string) || 'hourly';
    const days = safeInt(req.query.days, 7);
    const startTime = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    let groupBy = '';
    switch (period) {
      case 'hourly':
        groupBy = "strftime('%Y-%m-%d %H:00:00', timestamp)";
        break;
      case 'daily':
        groupBy = "strftime('%Y-%m-%d', timestamp)";
        break;
      case 'weekly':
        groupBy = "strftime('%Y-W%W', timestamp)";
        break;
      default:
        groupBy = "strftime('%Y-%m-%d %H:00:00', timestamp)";
    }

    const trends = db.db
      .prepare(
        `
      SELECT
        ${groupBy} as period,
        COUNT(*) as event_count,
        SUM(CASE WHEN change_type IN ('change', 'modified') THEN 1 ELSE 0 END) as modifications,
        SUM(CASE WHEN change_type = 'add' THEN 1 ELSE 0 END) as creations,
        SUM(CASE WHEN change_type = 'unlink' THEN 1 ELSE 0 END) as deletions,
        COUNT(DISTINCT filepath) as unique_files,
        COUNT(DISTINCT project_name) as active_projects
      FROM events
      WHERE timestamp >= ?
      GROUP BY period
      ORDER BY period ASC
    `
      )
      .all(startTime) as any[];

    return res.json({
      trends,
      period,
      days,
      start_time: startTime
    });
  } catch (error: any) {
    logger.error('❌ Historical trends error:', error);
    return res.status(500).json({ error: error.message });
  }
});

// ==================== Performance Metrics API ====================

app.get('/api/metrics/performance', cacheMiddleware(5000), async (req: Request, res: Response) => {
  try {
    const range = (req.query.range as string) || '1h';

    // Calculate time range
    let hours = 1;
    if (range === '6h') hours = 6;
    else if (range === '24h') hours = 24;
    else if (range === '7d') hours = 168;

    const startTime = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

    // Get metrics from database (limit to 500 points max, downsample if needed)
    const metrics = db.db
      .prepare(
        `
      SELECT
        timestamp,
        cpu_percent,
        memory_percent,
        memory_used_mb,
        memory_total_mb
      FROM raven_metrics
      WHERE timestamp >= ?
      ORDER BY timestamp ASC
      LIMIT 500
    `
      )
      .all(startTime) as any[];

    return res.json({
      metrics,
      range,
      start_time: startTime
    });
  } catch (error: any) {
    logger.error('❌ Performance metrics error:', error);
    return res.status(500).json({ error: error.message });
  }
});

// ==================== Alert Templates API ====================

const ALERT_TEMPLATES_PATH = join(process.cwd(), 'alert-templates.json');

interface AlertTemplate {
  name: string;
  description: string;
  icon: string;
  triggers: any[];
}

interface AlertTemplates {
  templates: {
    [key: string]: AlertTemplate;
  };
  metadata: {
    version: string;
    recommended: string;
    description: string;
  };
}

// Load alert templates from file
async function loadAlertTemplates(): Promise<AlertTemplates> {
  try {
    const data = await fs.readFile(ALERT_TEMPLATES_PATH, 'utf-8');
    try {
      return JSON.parse(data);
    } catch (parseError: any) {
      logger.error('Invalid JSON in alert templates file:', parseError);
      throw new Error('Alert templates file contains invalid JSON');
    }
  } catch (error: any) {
    logger.error('Failed to load alert templates:', error);
    throw new Error('Alert templates file not found or invalid');
  }
}

// GET /api/alerts/templates - List all available alert templates
app.get('/api/alerts/templates', async (req: Request, res: Response) => {
  try {
    const templates = await loadAlertTemplates();
    return res.json(templates);
  } catch (error: any) {
    logger.error('[GET /api/alerts/templates] Error:', error);
    return res.status(500).json({ error: 'Failed to load alert templates' });
  }
});

// POST /api/alerts/templates/:templateId/apply - Apply template to project
app.post('/api/alerts/templates/:templateId/apply', async (req: Request, res: Response) => {
  try {
    const { templateId } = req.params;

    const templates = await loadAlertTemplates();
    const template = templates.templates[templateId];

    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }

    // Apply template triggers to trigger engine
    // For now, just return success - full implementation will integrate with trigger-engine.js
    return res.json({
      success: true,
      template: templateId,
      triggersApplied: template.triggers.length
    });
  } catch (error: any) {
    logger.error('[POST /api/alerts/templates/:templateId/apply] Error:', error);
    return res.status(500).json({ error: 'Failed to apply template' });
  }
});

// GET /api/alerts/status - Get current alert status for project
app.get('/api/alerts/status', async (req: Request, res: Response) => {
  try {
    // Return current alert status
    // For now, return mock data - full implementation will query trigger engine
    return res.json({
      enabled: true,
      activeTemplate: 'ai-safety-basic',
      triggersActive: 5,
      recentAlerts: []
    });
  } catch (error: any) {
    logger.error('[GET /api/alerts/status] Error:', error);
    return res.status(500).json({ error: 'Failed to get alert status' });
  }
});

// ==================== Syntax Errors API ====================

// GET /api/syntax-errors - Get all unresolved syntax errors
app.get('/api/syntax-errors', async (req: Request, res: Response) => {
  try {
    const limit = safeInt(req.query.limit, 100);
    const errors = db.getSyntaxErrors(limit);
    return res.json({ errors, count: errors.length });
  } catch (error: any) {
    logger.error('[GET /api/syntax-errors] Error:', error);
    return res.status(500).json({ error: 'Failed to get syntax errors' });
  }
});

// GET /api/syntax-errors/count - Get count of unresolved errors
app.get('/api/syntax-errors/count', async (req: Request, res: Response) => {
  try {
    const count = db.getUnresolvedSyntaxErrorCount();
    return res.json({ count });
  } catch (error: any) {
    logger.error('[GET /api/syntax-errors/count] Error:', error);
    return res.status(500).json({ error: 'Failed to get syntax error count' });
  }
});

// POST /api/syntax-errors/:id/resolve - Mark syntax error as resolved
app.post('/api/syntax-errors/:id/resolve', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const errorId = parseInt(id);

    if (isNaN(errorId)) {
      return res.status(400).json({ error: 'Invalid error ID' });
    }

    db.resolveSyntaxError(errorId);
    return res.json({ success: true, message: 'Syntax error marked as resolved' });
  } catch (error: any) {
    logger.error('[POST /api/syntax-errors/:id/resolve] Error:', error);
    return res.status(500).json({ error: 'Failed to resolve syntax error' });
  }
});

// ==================== Session Rollback API ====================

// GET /api/sessions - Get list of sessions with file changes
app.get('/api/sessions', async (req: Request, res: Response) => {
  try {
    // Get all sessions with their events
    const sessions = db.db
      .prepare(
        `
      SELECT
        session_id,
        MIN(timestamp) as start_time,
        MAX(timestamp) as end_time,
        COUNT(*) as event_count,
        COUNT(DISTINCT filepath) as file_count
      FROM events
      WHERE session_id IS NOT NULL
      GROUP BY session_id
      ORDER BY MAX(timestamp) DESC
      LIMIT 20
    `
      )
      .all() as any[];

    return res.json({ sessions, count: sessions.length });
  } catch (error: any) {
    logger.error('[GET /api/sessions] Error:', error);
    return res.status(500).json({ error: 'Failed to get sessions' });
  }
});

// GET /api/sessions/:sessionId/preview - Preview rollback changes
app.get('/api/sessions/:sessionId/preview', async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;

    // Get all files modified in this session
    const files = db.db
      .prepare(
        `
      SELECT DISTINCT filepath
      FROM events
      WHERE session_id = ?
      ORDER BY filepath
    `
      )
      .all(sessionId) as any[];

    // Read snapshots directory and session start time once (not per file)
    let snapshots: string[] = [];
    try {
      snapshots = await fs.readdir(SNAPSHOTS_DIR);
    } catch {
      // Snapshots dir may not exist
    }

    const sessionStart = db.db
      .prepare(`SELECT MIN(timestamp) as start_time FROM events WHERE session_id = ?`)
      .get(sessionId) as any;
    const sessionStartMs = sessionStart?.start_time
      ? new Date(sessionStart.start_time).getTime()
      : 0;

    const changes = [];

    for (const fileRecord of files) {
      const filepath = fileRecord.filepath;
      const prefix = filepath.replace(/\//g, '_');

      const fileSnapshots = snapshots
        .filter(s => s.startsWith(prefix))
        .map(s => ({
          name: s,
          timestamp: parseInt(s.split('_').pop() || '0')
        }))
        .sort((a, b) => b.timestamp - a.timestamp);

      const beforeSnapshot = fileSnapshots.find(s => s.timestamp < sessionStartMs);

      changes.push({
        filepath,
        hasBackup: !!beforeSnapshot,
        snapshotName: beforeSnapshot?.name,
        currentExists: true
      });
    }

    return res.json({
      sessionId,
      fileCount: files.length,
      changes,
      canRollback: changes.some((c: any) => c.hasBackup)
    });
  } catch (error: any) {
    logger.error('[GET /api/sessions/:sessionId/preview] Error:', error);
    return res.status(500).json({ error: 'Failed to preview rollback' });
  }
});

// ==================== Pattern Warnings API ====================

// GET /api/pattern-warnings - Get all unresolved pattern warnings
app.get('/api/pattern-warnings', async (req: Request, res: Response) => {
  try {
    const limit = safeInt(req.query.limit, 100);
    const warnings = db.getPatternWarnings(limit);
    return res.json({ warnings, count: warnings.length });
  } catch (error: any) {
    logger.error('[GET /api/pattern-warnings] Error:', error);
    return res.status(500).json({ error: 'Failed to get pattern warnings' });
  }
});

// GET /api/pattern-warnings/count - Get count of unresolved warnings
app.get('/api/pattern-warnings/count', async (req: Request, res: Response) => {
  try {
    const count = db.getUnresolvedPatternWarningCount();
    return res.json({ count });
  } catch (error: any) {
    logger.error('[GET /api/pattern-warnings/count] Error:', error);
    return res.status(500).json({ error: 'Failed to get pattern warning count' });
  }
});

// GET /api/pattern-warnings/category/:category - Get warnings by category
app.get('/api/pattern-warnings/category/:category', async (req: Request, res: Response) => {
  try {
    const { category } = req.params;
    const warnings = db.getPatternWarningsByCategory(category);
    return res.json({ warnings, count: warnings.length });
  } catch (error: any) {
    logger.error('[GET /api/pattern-warnings/category/:category] Error:', error);
    return res.status(500).json({ error: 'Failed to get pattern warnings by category' });
  }
});

// POST /api/pattern-warnings/:id/resolve - Mark pattern warning as resolved
app.post('/api/pattern-warnings/:id/resolve', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const warningId = parseInt(id);

    if (isNaN(warningId)) {
      return res.status(400).json({ error: 'Invalid warning ID' });
    }

    db.resolvePatternWarning(warningId);
    return res.json({ success: true, message: 'Pattern warning marked as resolved' });
  } catch (error: any) {
    logger.error('[POST /api/pattern-warnings/:id/resolve] Error:', error);
    return res.status(500).json({ error: 'Failed to resolve pattern warning' });
  }
});

// GET /api/pattern-warnings/patterns - Get all available patterns
app.get('/api/pattern-warnings/patterns', async (req: Request, res: Response) => {
  try {
    const patterns = patternDetector.getAllPatterns();
    return res.json({ patterns, count: patterns.length });
  } catch (error: any) {
    logger.error('[GET /api/pattern-warnings/patterns] Error:', error);
    return res.status(500).json({ error: 'Failed to get patterns' });
  }
});

// ==================== Pause/Resume APIs ====================

// GET /api/pause/status - Get pause status
app.get('/api/pause/status', async (req: Request, res: Response) => {
  try {
    const status = pauseManager.getStatus();
    return res.json(status);
  } catch (error: any) {
    logger.error('[GET /api/pause/status] Error:', error);
    return res.status(500).json({ error: 'Failed to get pause status' });
  }
});

// POST /api/pause - Pause monitoring
app.post('/api/pause', async (req: Request, res: Response) => {
  try {
    const { reason } = req.body;
    pauseManager.pause(reason || 'User requested via API');

    const status = pauseManager.getStatus();

    // Emit WebSocket event
    io.emit('monitoring-paused', status);

    return res.json({
      success: true,
      message: 'Monitoring paused',
      status
    });
  } catch (error: any) {
    logger.error('[POST /api/pause] Error:', error);
    return res.status(500).json({ error: 'Failed to pause monitoring' });
  }
});

// POST /api/resume - Resume monitoring
app.post('/api/resume', async (req: Request, res: Response) => {
  try {
    pauseManager.resume();

    const status = pauseManager.getStatus();

    // Emit WebSocket event
    io.emit('monitoring-resumed', status);

    return res.json({
      success: true,
      message: 'Monitoring resumed',
      status
    });
  } catch (error: any) {
    logger.error('[POST /api/resume] Error:', error);
    return res.status(500).json({ error: 'Failed to resume monitoring' });
  }
});

// ==================== Storage APIs ====================

app.get('/api/storage', cacheMiddleware(30000), async (req: Request, res: Response) => {
  try {
    const startTime = Date.now();
    const dbDir = join(RAVEN_DIR, 'db');
    const snapshotsDir = join(SNAPSHOTS_DIR);

    // Get all database files (lightweight - no table queries for storage overview)
    const t1 = Date.now();
    const databases: any[] = [];
    const dbFiles = await fs.readdir(dbDir);
    const dbFilesFiltered = dbFiles.filter(f => f.endsWith('.db'));

    for (const dbFile of dbFilesFiltered) {
      const dbPath = join(dbDir, dbFile);
      const stats = await fs.stat(dbPath);
      const dbName = dbFile.replace('.db', '');

      // For storage overview, just get file sizes - no detailed table queries
      databases.push({
        name: dbName,
        filename: dbFile,
        size: stats.size,
        modified: stats.mtime,
        isActive: dbName === 'raven'
      });
    }
    logger.debug(`Storage: DB files took ${Date.now() - t1}ms`);

    // Get snapshot directory stats (ultra-lightweight - no size calculations)
    const t2 = Date.now();
    const snapshots: any[] = [];
    const totalSnapshotSize = 0; // Skip size calculation for performance
    try {
      await fs.access(snapshotsDir);
      const snapshotProjects = await fs.readdir(snapshotsDir);

      // Get basic info only
      for (const project of snapshotProjects) {
        const projectSnapshotPath = join(snapshotsDir, project);
        const stat = await fs.stat(projectSnapshotPath);

        if (stat.isDirectory()) {
          const files = await fs.readdir(projectSnapshotPath);

          snapshots.push({
            project,
            files: files.length,
            size: 0, // Not calculated for performance
            oldest: stat.mtime,
            newest: stat.mtime
          });
        }
      }
    } catch (err) {
      // Snapshots directory doesn't exist, ignore
    }
    logger.debug(`Storage: Snapshots took ${Date.now() - t2}ms`);

    // Calculate total size from components we already have
    const dbTotalSize = databases.reduce((sum, db) => sum + db.size, 0);
    const totalSize = dbTotalSize + totalSnapshotSize;

    // Get other files
    let configSize = 0;
    let triggersLogSize = 0;

    try {
      const configStat = await fs.stat(join(RAVEN_DIR, 'config.toml'));
      configSize = configStat.size;
    } catch (err) {
      // File doesn't exist
    }

    try {
      const triggersStat = await fs.stat(join(RAVEN_DIR, 'triggers.log'));
      triggersLogSize = triggersStat.size;
    } catch (err) {
      // File doesn't exist
    }

    logger.debug(`Storage: Total request took ${Date.now() - startTime}ms`);
    return res.json({
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
  } catch (error: any) {
    logger.error('❌ Error getting storage stats:', error);
    return res.status(500).json({ error: 'Failed to get storage statistics' });
  }
});

// GET /api/storage/projects - Per-project storage breakdown
app.get('/api/storage/projects', cacheMiddleware(10000), (req: Request, res: Response) => {
  try {
    const projects = db.db
      .prepare(
        `
      SELECT
        project_name,
        COUNT(*) as event_count,
        COUNT(DISTINCT filepath) as file_count,
        MIN(timestamp) as first_event,
        MAX(timestamp) as last_event,
        SUM(COALESCE(event_size, 0)) as total_size
      FROM events
      WHERE project_name IS NOT NULL
      GROUP BY project_name
      ORDER BY event_count DESC
    `
      )
      .all() as any[];

    const agentEvents = db.db
      .prepare(
        `
      SELECT
        project_name,
        COUNT(*) as agent_event_count
      FROM agent_events
      WHERE project_name IS NOT NULL
      GROUP BY project_name
    `
      )
      .all() as any[];

    const agentMap = new Map(agentEvents.map((a: any) => [a.project_name, a.agent_event_count]));

    const result = projects.map((p: any) => ({
      project_name: p.project_name,
      event_count: p.event_count,
      file_count: p.file_count,
      agent_event_count: agentMap.get(p.project_name) || 0,
      first_event: p.first_event,
      last_event: p.last_event,
      estimated_size: p.total_size
    }));

    return res.json(result);
  } catch (error: any) {
    logger.error('Error getting per-project storage:', error);
    return res.status(500).json({ error: 'Failed to get project storage stats' });
  }
});

app.get('/api/storage/export/:dbname', expensiveOpLimiter, async (req: Request, res: Response) => {
  try {
    const { dbname } = req.params;

    // Validate database name to prevent path traversal
    if (
      !dbname ||
      dbname.includes('..') ||
      dbname.includes('/') ||
      !dbname.match(/^[a-zA-Z0-9_-]+$/)
    ) {
      return res.status(400).json({ error: 'Invalid database name' });
    }

    const dbPath = join(RAVEN_DIR, 'db', `${dbname}.db`);

    try {
      await fs.access(dbPath);
    } catch (err) {
      return res.status(404).json({ error: 'Database not found' });
    }

    // Send the file for download
    return res.download(dbPath, `${dbname}_${Date.now()}.db`, (err): void => {
      if (err) {
        logger.error('❌ Error sending database file:', err);
        if (!res.headersSent) {
          res.status(500).json({ error: 'Failed to export database' });
        }
      }
    });
  } catch (error: any) {
    logger.error('❌ Error exporting database:', error);
    return res.status(500).json({ error: 'Failed to export database' });
  }
});

app.post('/api/storage/vacuum/:dbname', expensiveOpLimiter, async (req: Request, res: Response) => {
  try {
    const { dbname } = req.params;

    // Validate database name
    if (
      !dbname ||
      dbname.includes('..') ||
      dbname.includes('/') ||
      !dbname.match(/^[a-zA-Z0-9_-]+$/)
    ) {
      return res.status(400).json({ error: 'Invalid database name' });
    }

    const dbPath = join(RAVEN_DIR, 'db', `${dbname}.db`);

    try {
      await fs.access(dbPath);
    } catch (err) {
      return res.status(404).json({ error: 'Database not found' });
    }

    // Get size before VACUUM
    const statsBefore = await fs.stat(dbPath);
    const sizeBefore = statsBefore.size;

    // Run VACUUM
    const Database = (await import('better-sqlite3')).default;
    const dbConn = new Database(dbPath);
    dbConn.pragma('wal_checkpoint(TRUNCATE)'); // Checkpoint WAL first
    dbConn.exec('VACUUM');
    dbConn.close();

    // Get size after VACUUM
    const statsAfter = await fs.stat(dbPath);
    const sizeAfter = statsAfter.size;
    const spaceSaved = sizeBefore - sizeAfter;

    return res.json({
      success: true,
      message: 'Database optimized successfully',
      sizeBefore,
      sizeAfter,
      spaceSaved,
      percentSaved: sizeBefore > 0 ? ((spaceSaved / sizeBefore) * 100).toFixed(2) : 0
    });
  } catch (error: any) {
    logger.error('❌ Error running VACUUM:', error);
    return res.status(500).json({ error: 'Failed to optimize database: ' + error.message });
  }
});

app.post('/api/storage/clean/:dbname', async (req: Request, res: Response) => {
  try {
    const { dbname } = req.params;
    const { days } = req.body;

    // Validate database name
    if (
      !dbname ||
      dbname.includes('..') ||
      dbname.includes('/') ||
      !dbname.match(/^[a-zA-Z0-9_-]+$/)
    ) {
      return res.status(400).json({ error: 'Invalid database name' });
    }

    // Validate days
    const daysNum = parseInt(days);
    if (isNaN(daysNum) || daysNum < 1 || daysNum > 365) {
      return res.status(400).json({ error: 'Days must be between 1 and 365' });
    }

    const dbPath = join(RAVEN_DIR, 'db', `${dbname}.db`);

    try {
      await fs.access(dbPath);
    } catch (err) {
      return res.status(404).json({ error: 'Database not found' });
    }

    // Calculate cutoff timestamp
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysNum);
    const cutoffTimestamp = cutoffDate.toISOString();

    const Database = (await import('better-sqlite3')).default;
    const dbConn = new Database(dbPath);

    let totalDeleted = 0;
    const deletedPerTable: Record<string, number> = {};

    // Get all tables
    const tables = dbConn
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
      .all() as { name: string }[];

    // Delete old records from each table that has a timestamp column
    for (const table of tables) {
      // Validate table name to prevent SQL injection
      if (!isValidTableName(table.name)) {
        logger.warn(`[Security] Skipping invalid table name: ${table.name}`);
        continue;
      }

      const tableInfo = dbConn.prepare(`PRAGMA table_info(${table.name})`).all() as any[];
      const hasTimestamp = tableInfo.some(
        col => col.name === 'timestamp' || col.name === 'created_at'
      );

      if (hasTimestamp) {
        const timestampCol = tableInfo.find(
          col => col.name === 'timestamp' || col.name === 'created_at'
        )!.name;

        // Validate column name to prevent SQL injection
        if (!isValidTableName(timestampCol)) {
          logger.warn(`[Security] Skipping invalid column name: ${timestampCol}`);
          continue;
        }

        // Delete old records
        const deleteStmt = dbConn.prepare(`DELETE FROM ${table.name} WHERE ${timestampCol} < ?`);
        const result = deleteStmt.run(cutoffTimestamp);

        const deleted = result.changes;
        if (deleted > 0) {
          deletedPerTable[table.name] = deleted;
          totalDeleted += deleted;
        }
      }
    }

    dbConn.close();

    return res.json({
      success: true,
      message: `Deleted ${totalDeleted} records older than ${daysNum} days`,
      totalDeleted,
      deletedPerTable,
      cutoffDate: cutoffTimestamp
    });
  } catch (error: any) {
    logger.error('❌ Error cleaning old data:', error);
    return res.status(500).json({ error: 'Failed to clean old data: ' + error.message });
  }
});

app.get('/api/storage/retention', async (req: Request, res: Response) => {
  try {
    const retentionPath = join(RAVEN_DIR, 'retention-policy.json');

    try {
      await fs.access(retentionPath);
      const data = await fs.readFile(retentionPath, 'utf-8');
      try {
        const policy = JSON.parse(data);
        return res.json(policy);
      } catch (parseError: any) {
        logger.error('Invalid JSON in retention policy file:', parseError);
        return res.status(500).json({ error: 'Retention policy file contains invalid JSON' });
      }
    } catch (err) {
      // Return default policy if file doesn't exist
      return res.json({
        enabled: false,
        retentionDays: 30,
        autoCleanup: false,
        cleanupInterval: 'weekly'
      });
    }
  } catch (error: any) {
    logger.error('❌ Error reading retention policy:', error);
    return res.status(500).json({ error: 'Failed to read retention policy' });
  }
});

app.post('/api/storage/retention', async (req: Request, res: Response) => {
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
    await fs.writeFile(retentionPath, JSON.stringify(policy, null, 2), 'utf-8');

    return res.json({
      success: true,
      message: 'Retention policy saved successfully'
    });
  } catch (error: any) {
    logger.error('❌ Error saving retention policy:', error);
    return res.status(500).json({ error: 'Failed to save retention policy' });
  }
});

// ==================== Conversations ====================

app.get('/api/conversations', cacheMiddleware(5000), (req: Request, res: Response) => {
  const limit = Math.min(safeInt(req.query.limit, 50), 500);
  const offset = safeInt(req.query.offset, 0);
  const eventType = req.query.event_type as string;

  let query = `SELECT * FROM agent_events WHERE event_type IN ('user_message', 'assistant_text', 'tool_call', 'tool_result')`;
  const params: any[] = [];

  if (eventType && eventType !== 'all') {
    query = `SELECT * FROM agent_events WHERE event_type = ?`;
    params.push(eventType);
  }

  query += ' ORDER BY timestamp DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);

  const conversations = db.db.prepare(query).all(...params);
  const totalResult = db.db
    .prepare(
      "SELECT COUNT(*) as total FROM agent_events WHERE event_type IN ('user_message', 'assistant_text', 'tool_call', 'tool_result')"
    )
    .get() as any;

  return res.json({ conversations, total: totalResult?.total || 0 });
});

app.get('/api/conversations/stats', cacheMiddleware(5000), (req: Request, res: Response) => {
  const total =
    (
      db.db
        .prepare(
          "SELECT COUNT(*) as total FROM agent_events WHERE event_type IN ('conversation', 'user_message', 'assistant_text', 'tool_call', 'tool_result')"
        )
        .get() as any
    )?.total || 0;

  const typeRows = db.db
    .prepare(
      `
      SELECT event_type, COUNT(*) as count FROM agent_events
      WHERE event_type IN ('user_message', 'assistant_text', 'tool_call', 'tool_result')
      GROUP BY event_type
    `
    )
    .all() as any[];

  const projectRows = db.db
    .prepare(
      `
      SELECT project_name, COUNT(*) as count FROM agent_events
      WHERE project_name IS NOT NULL
      GROUP BY project_name
    `
    )
    .all() as any[];

  const by_type: Record<string, number> = {};
  typeRows.forEach((r: any) => {
    by_type[r.event_type] = r.count;
  });

  const by_project: Record<string, number> = {};
  projectRows.forEach((r: any) => {
    by_project[r.project_name] = r.count;
  });

  return res.json({ total, by_type, by_project });
});

// ==================== Errors ====================

app.get('/api/errors', cacheMiddleware(5000), (req: Request, res: Response) => {
  const limit = Math.min(safeInt(req.query.limit, 50), 500);
  const offset = Math.max(0, safeInt(req.query.offset, 0));
  const search = req.query.search as string | undefined;
  const severity = req.query.severity as string | undefined;

  let whereClause = 'WHERE 1=1';
  const params: any[] = [];

  if (search) {
    whereClause += ' AND (message LIKE ? OR component LIKE ?)';
    params.push(`%${search}%`, `%${search}%`);
  }
  if (severity && severity !== 'all') {
    whereClause += ' AND severity = ?';
    params.push(severity);
  }

  const totalResult = db.db
    .prepare(`SELECT COUNT(*) as total FROM app_errors ${whereClause}`)
    .get(...params) as { total: number };

  const errors = db.db
    .prepare(`SELECT * FROM app_errors ${whereClause} ORDER BY timestamp DESC LIMIT ? OFFSET ?`)
    .all(...params, limit, offset);

  return res.json({ errors, total: totalResult.total });
});

// App error tracking
app.post('/api/errors', (req: Request, res: Response) => {
  const { error_type, message, stack, component, severity, url, user_agent, metadata } = req.body;
  db.db
    .prepare(
      `INSERT INTO app_errors (timestamp, error_type, message, stack, component, severity, url, user_agent, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      new Date().toISOString(),
      error_type || 'Error',
      message || 'Unknown error',
      stack || null,
      component || 'unknown',
      severity || 'error',
      url || null,
      user_agent || null,
      metadata ? JSON.stringify(metadata) : null
    );
  io.emit('app-error', {
    error_type,
    message,
    component,
    severity,
    timestamp: new Date().toISOString()
  });
  return res.json({ success: true });
});

app.get('/api/errors/stats', cacheMiddleware(5000), (req: Request, res: Response) => {
  const total =
    (db.db.prepare('SELECT COUNT(*) as total FROM app_errors WHERE resolved = 0').get() as any)
      ?.total || 0;
  const bySeverity = db.db
    .prepare(
      'SELECT severity, COUNT(*) as count FROM app_errors WHERE resolved = 0 GROUP BY severity'
    )
    .all();
  const byComponent = db.db
    .prepare(
      'SELECT component, COUNT(*) as count FROM app_errors WHERE resolved = 0 GROUP BY component ORDER BY count DESC LIMIT 10'
    )
    .all();
  const recent = db.db
    .prepare('SELECT * FROM app_errors WHERE resolved = 0 ORDER BY timestamp DESC LIMIT 5')
    .all();
  return res.json({ total, bySeverity, byComponent, recent });
});

app.delete('/api/errors/clear', (req: Request, res: Response) => {
  db.db.prepare('DELETE FROM app_errors').run();
  return res.json({ success: true, message: 'All errors cleared' });
});

// ==================== Notifications ====================

app.get('/api/notifications', (req: Request, res: Response) => {
  const limit = Math.min(safeInt(req.query.limit, 50), 500);
  const notifications = db.db
    .prepare('SELECT * FROM health_issues ORDER BY created_at DESC LIMIT ?')
    .all(limit);
  return res.json({ notifications, total: notifications.length });
});

app.get('/api/notifications/stats', (req: Request, res: Response) => {
  const result = db.db.prepare('SELECT COUNT(*) as total FROM health_issues').get() as any;
  return res.json({ total: result?.total || 0, unread: 0 });
});

// File history endpoint
app.get('/api/files/:filepath/history', (req: Request, res: Response) => {
  try {
    const filepath = decodeURIComponent(req.params.filepath);
    const limit = Math.min(safeInt(req.query.limit, 50), 500);

    const events = db.db
      .prepare(
        `
      SELECT id, timestamp, filepath, change_type, event_size, file_hash, cpu, mem, project_name
      FROM events
      WHERE filepath = ?
      ORDER BY timestamp DESC
      LIMIT ?
    `
      )
      .all(filepath, limit);

    return res.json(events);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

app.post('/api/notifications/:id/read', (req: Request, res: Response) => {
  return res.json({ success: true });
});

app.post('/api/notifications/mark-all-read', (req: Request, res: Response) => {
  return res.json({ success: true });
});

app.delete('/api/notifications/:id', (req: Request, res: Response) => {
  return res.json({ success: true });
});

// ==================== All Agent Events ====================

app.get('/api/all-agent-events', cacheMiddleware(5000), (req: Request, res: Response) => {
  const limit = Math.min(safeInt(req.query.limit, 100), 1000);
  const events = db.getRecentAgentEvents(limit);
  return res.json(events);
});

// ==================== WebSocket ====================

io.on('connection', socket => {
  logger.info('🔌 WebSocket client connected:', socket.id);

  socket.on('disconnect', () => {
    logger.info('🔌 WebSocket client disconnected:', socket.id);
  });
});

// ==================== Error Handling Middleware ====================

// 404 handler - must be after all routes
app.use((req, res) => {
  return res.status(404).json({
    error: 'Not Found',
    path: req.path,
    method: req.method
  });
});

// Global error handler - must be last
app.use(errorHandler);

// ==================== Server Startup ====================

httpServer.listen(PORT, async () => {
  // Detect LAN IP for mobile access
  const nets = os.networkInterfaces();
  const lanIps: string[] = [];
  for (const ifaces of Object.values(nets)) {
    for (const iface of ifaces || []) {
      if (iface.family === 'IPv4' && !iface.internal) {
        lanIps.push(iface.address);
      }
    }
  }
  const lanAddr = lanIps.length > 0 ? `http://${lanIps[0]}:${PORT}` : 'N/A';

  logger.info(`
╔════════════════════════════════════════════════╗
║     Raven Backend (TypeScript)                 ║
╠════════════════════════════════════════════════╣
║  Port:       ${PORT}                              ║
║  LAN:        ${lanAddr.padEnd(34)} ║
║  Session:    ${SESSION_ID}     ║
║  Watch Path: ${WATCH_PATH.slice(-30).padEnd(30)} ║
║  Database:   ${DB_PATH.slice(-30).padEnd(30)} ║
╚════════════════════════════════════════════════╝
  `);

  // Resolve stale warnings/errors for Raven's own files
  db.resolvePatternWarningsForRaven();
  db.resolveSyntaxErrorsForRaven();

  // Clear agent_events from previous sessions (will be repopulated from log history)
  db.db.prepare('DELETE FROM agent_events').run();
  logger.info('Cleared agent_events for fresh log import');

  // Start Claude Code log watcher
  logger.info('🤖 Starting Claude Code log watcher...');
  await claudeLogWatcher.start();

  // Start multi-project file watchers
  logger.info('📁 Starting multi-project file watchers...');
  try {
    const result = await projectManager.initializeWithWatchers();
    logger.info(
      `📁 Project watchers: ${result.watching} active, ${result.discovered} newly discovered`
    );
    if (result.projects.length > 0) {
      logger.info(`📁 Monitored projects: ${result.projects.join(', ')}`);
    }
  } catch (err: any) {
    logger.error('Failed to initialize project watchers, falling back to single watcher:', err);
    fileWatcher.start();
  }

  // Start git monitor (if git repo)
  const isRepo = await gitMonitor.isGitRepo();
  if (isRepo) {
    logger.info('🔀 Starting git monitor...');
    await gitMonitor.start();
  } else {
    logger.warn('⚠️  Not a git repository, skipping git monitor');
  }

  // Start local model watcher
  logger.info('🤖 Starting local model watcher...');
  await localModelWatcher.start(
    model => {
      logger.info(
        `🤖 Local model detected: ${model.name} (${model.models.join(', ') || 'no models loaded'})`
      );
      // Register detected model in agent registry
      if (!agentRegistry.has(model.name)) {
        agentRegistry.set(model.name, {
          agent_name: model.name,
          agent_type: model.type,
          is_running: model.status === 'running',
          last_seen: model.lastChecked,
          models_available: model.models,
          requests_handled: 0,
          errors: 0,
          color: getAgentColor(model.name)
        });
      } else {
        const existing = agentRegistry.get(model.name)!;
        existing.is_running = model.status === 'running';
        existing.last_seen = model.lastChecked;
        existing.models_available = model.models;
      }
      // Emit to WebSocket
      io.emit('agent-event', {
        type: 'model_detected',
        agent_name: model.name,
        models: model.models,
        status: model.status,
        timestamp: model.lastChecked
      });
    },
    (model, previousStatus) => {
      // Model status changed (e.g., running → stopped or stopped → running)
      logger.info(`🤖 Model status change: ${model.name} ${previousStatus} → ${model.status}`);

      // Update agent registry
      const existing = agentRegistry.get(model.name);
      if (existing) {
        existing.is_running = model.status === 'running';
        existing.last_seen = model.lastChecked;
      }

      // Emit notification via WebSocket
      io.emit('model-status-changed', {
        name: model.name,
        type: model.type,
        status: model.status,
        previousStatus,
        models: model.models,
        timestamp: model.lastChecked
      });
    }
  );

  // Start metrics collector
  logger.info('📊 Starting metrics collector...');
  metricsCollector.start();

  // Start comprehensive health monitoring
  logger.info('🏥 Starting comprehensive health monitoring...');
  healthMonitor.startMonitoring(60000); // Check every 60 seconds

  // Run initial comprehensive health check
  const comprehensiveHealth = await healthMonitor.runHealthCheck();
  logger.info(
    `Comprehensive health: ${comprehensiveHealth.overallStatus} - ${comprehensiveHealth.summary.healthy}/${comprehensiveHealth.summary.total} checks passed`
  );

  if (comprehensiveHealth.summary.critical > 0) {
    logger.error(
      `⚠️  ${comprehensiveHealth.summary.critical} critical issues detected on startup!`
    );
    comprehensiveHealth.checks
      .filter(c => c.status === 'critical')
      .forEach(check => {
        logger.error(`  - ${check.category}/${check.name}: ${check.message}`);
      });
  }

  // Self-analysis is on-demand only — triggered via Code Health page "Run Now" button

  // Periodic process check for Claude Code — keeps agent status accurate
  // even when no new log events are flowing (e.g., user is reading output)
  const PROCESS_CHECK_INTERVAL = 30_000; // 30 seconds
  let systemIsIdle = false;
  processCheckTimer = setInterval(() => {
    execFile('pgrep', ['-x', 'claude'], (err, stdout) => {
      const agentName = 'Claude Code';
      const agent = agentRegistry.get(agentName);
      if (!agent) return;

      const hasRunningProcess = !err && stdout.trim().length > 0;
      if (hasRunningProcess) {
        agent.last_seen = new Date().toISOString();
        agent.is_running = true;
      }

      // Central idle detection — switch ALL services when no agents are active
      const anyAgentActive = Array.from(agentRegistry.values()).some(a => a.is_running);
      const shouldBeIdle = !anyAgentActive;
      if (shouldBeIdle !== systemIsIdle) {
        systemIsIdle = shouldBeIdle;
        logger.info(
          `🌙 System ${shouldBeIdle ? 'entering idle mode' : 'resuming active mode'} — adjusting all polling intervals`
        );
        localModelWatcher.setIdle(shouldBeIdle);
        claudeLogWatcher.setIdle(shouldBeIdle);
        healthMonitor.setIdle(shouldBeIdle);
        metricsCollector.setIdle(shouldBeIdle);
      }
    });
  }, PROCESS_CHECK_INTERVAL);
  processCheckTimer.unref(); // Don't prevent Node from exiting

  logger.info('✅ All services started successfully');
});

// ==================== Graceful Shutdown ====================

let isShuttingDown = false;

async function gracefulShutdown(signal: string) {
  if (isShuttingDown) {
    logger.warn(`⚠️  Already shutting down, ignoring ${signal}`);
    return;
  }

  isShuttingDown = true;
  logger.info(`\n🛑 Received ${signal}, shutting down Raven backend gracefully...`);

  try {
    // Stop accepting new connections
    httpServer.close(() => {
      logger.info('✅ HTTP server closed');
    });

    // Stop Claude Code log watcher
    logger.info('🛑 Stopping Claude Code log watcher...');
    await claudeLogWatcher.stop();

    // Stop all project watchers
    logger.info('🛑 Stopping project watchers...');
    await projectManager.stopAllWatchers();
    await fileWatcher.stop();

    // Stop git monitor
    logger.info('🛑 Stopping git monitor...');
    gitMonitor.stop();

    // Stop process check timer
    if (processCheckTimer) clearInterval(processCheckTimer);

    // Stop local model watcher
    logger.info('🛑 Stopping local model watcher...');
    localModelWatcher.stop();

    // Stop cache cleanup
    stopCacheCleanup();

    // Stop metrics collector
    logger.info('🛑 Stopping metrics collector...');
    metricsCollector.stop();

    // Stop health monitor
    logger.info('🛑 Stopping health monitor...');
    healthMonitor.stopMonitoring();

    // Close database connection
    logger.info('🛑 Closing database...');
    db.close();

    logger.info('✅ Graceful shutdown complete');
    process.exit(0);
  } catch (error: any) {
    logger.error('❌ Error during shutdown:', error);
    process.exit(1);
  }
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

process.on('unhandledRejection', (reason: unknown) => {
  logger.error(
    'Unhandled promise rejection:',
    reason instanceof Error ? reason : new Error(String(reason))
  );
});

process.on('uncaughtException', (error: Error) => {
  logger.error('Uncaught exception:', error);
  gracefulShutdown('uncaughtException');
});
