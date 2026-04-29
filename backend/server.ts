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
import type { AgentInfo } from './types/agent-info.js';
import compression from 'compression';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { randomUUID } from 'crypto';
import {
  join,
  basename,
  dirname
} from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';
import os from 'os';

// Import TypeScript modules
import { RavenDB } from './db.js';
import { MetricsCollector } from './metrics-collector.js';
import { TriggerEngine } from './trigger-engine.js';
import { pauseManager } from './pause-manager.js';
import { FileWatcher, GitMonitor } from './modules/index.js';
import { logger } from './utils/logger.js';
import { errorHandler } from './middleware/errorHandler.js';
import { rateLimitStatus, apiLimiter, setupHelmet } from './middleware/security.js';
import { performanceMonitoring } from './middleware/performance.js';
import { createLiveSessionRouter } from './routes/live-session.js';
import { createEventsRouter } from './routes/events.js';
import { createAgentsRouter } from './routes/agents.js';
import { ClaudeLogWatcher } from './services/claude-log-watcher.js';
import { CodexLogWatcher } from './services/codex-log-watcher.js';
import { OllamaLogWatcher } from './services/ollama-log-watcher.js';
import { HealthMonitor } from './services/health-monitor.js';
import { createHealthMonitoringRouter } from './routes/health-monitoring.js';
import { ProjectManager } from './services/project-manager.js';
import { LocalModelWatcher } from './services/local-model-watcher.js';
import { InsightsService } from './services/insights-service.js';
import { createInsightsRouter } from './routes/insights.js';
import { createErrorsRouter } from './routes/errors.js';
import { createErrorsRepository } from './repositories/errors-repository.js';
import { createOllamaDetailRouter } from './routes/ollama.js';
import { createAgentEventsRepository } from './repositories/agent-events-repository.js';
import { createSyntaxErrorsRouter } from './routes/syntax-errors.js';
import { createFilesRouter } from './routes/files.js';
import { createFileEventsRepository } from './repositories/file-events-repository.js';
import { createNotificationsRouter } from './routes/notifications.js';
import { createNotificationsRepository } from './repositories/notifications-repository.js';
import { createLocalModelsRouter } from './routes/local-models.js';
import { createDevRouter } from './routes/dev.js';
import { createSearchRouter } from './routes/search.js';
import { createSearchRepository } from './repositories/search-repository.js';
import { createDashboardRouter } from './routes/dashboard.js';
import { createDashboardRepository } from './repositories/dashboard-repository.js';
import { createModelsRouter } from './routes/models.js';
import { createSessionsRouter } from './routes/sessions.js';
import { createSessionsRepository } from './repositories/sessions-repository.js';
import { createStorageRouter } from './routes/storage.js';
import { createStorageRepository } from './repositories/storage-repository.js';
import { createPatternWarningsRouter } from './routes/pattern-warnings.js';
import { createTrendsRouter } from './routes/trends.js';
import { createPublicHealthRouter, createSystemInfoRouter } from './routes/system-info.js';
import { createAgentEventsRoutesRouter } from './routes/agent-events-routes.js';
import { createProjectsRouter } from './routes/projects.js';
import { createProjectsConfigService } from './services/projects-config.js';
import { createPauseRouter } from './routes/pause.js';
import { createAlertsRouter } from './routes/alerts.js';
import { createConversationsRouter } from './routes/conversations.js';
import { createMetricsOverviewRouter } from './routes/metrics-overview.js';
import { createTelemetryRouter } from './routes/telemetry.js';
import { createHealthProjectsRouter } from './routes/health-projects.js';
import { createCostsRouter } from './routes/costs.js';
import { createSubagentsRouter } from './routes/subagents.js';
import { SelfAnalysisService } from './services/self-analysis.js';
import { createSelfAnalysisRouter } from './routes/self-analysis.js';
import { createSessionActivityRouter } from './routes/session-activity.js';
import { createGitRouter } from './routes/git.js';
import { createMetricsRouter } from './routes/metrics.js';
import { createTriggersRouter } from './routes/triggers.js';
import { createOllamaProxyRouter } from './routes/ollama-proxy.js';
import { createSystemRouter } from './routes/system.js';
import { createAgentEventHandlerFactory } from './services/agent-event-handler-factory.js';
import { bindEventBusListeners } from './services/event-bus-bindings.js';
import { startRetentionCleanup, scheduleDaily } from './services/retention-cleanup.js';
import { installGracefulShutdown } from './services/graceful-shutdown.js';
import { startTransparentOllamaProxy } from './services/transparent-ollama-proxy.js';
import { createLocalModelCallbacks } from './services/local-model-callbacks.js';
import { startIdleDetection } from './services/idle-detection.js';
import { createApiLatencyRepository } from './repositories/api-latency-repository.js';
import { createSyntaxErrorsRepository } from './repositories/syntax-errors-repository.js';
import { createPatternWarningsRepository } from './repositories/pattern-warnings-repository.js';
import { createMetricsRepository } from './repositories/metrics-repository.js';
import { createDiffRiskRepository } from './repositories/diff-risk-repository.js';

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

// Debounced broadcaster for agent-stats. Telemetry events arrive faster than
// dashboards need refreshes; coalescing to ~2s cuts duplicate aggregate queries
// without making the UI feel stale. The repository memoizes its `totals()` for
// 2s, so the route and broadcast share results.
let agentStatsBroadcastTimer: NodeJS.Timeout | null = null;
const AGENT_STATS_BROADCAST_MS = 2000;
function scheduleAgentStatsBroadcast(): void {
  if (agentStatsBroadcastTimer) return;
  agentStatsBroadcastTimer = setTimeout(() => {
    agentStatsBroadcastTimer = null;
    io.emit('agent-stats', agentEventsRepository.totals());
  }, AGENT_STATS_BROADCAST_MS);
  agentStatsBroadcastTimer.unref();
}

// Paths
const RAVEN_DIR = process.env.RAVEN_DIR || join(process.cwd(), '..', '.raven');
const WATCH_PATH = process.env.WATCH_PATH || join(process.cwd(), '..', '..');
const SNAPSHOTS_DIR = join(RAVEN_DIR, 'snapshots');

// ==================== Security Utilities ====================

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
app.use(setupHelmet());
app.use(
  cors({
    origin: CORS_ORIGIN,
    credentials: true
  })
);
app.use(express.json({ limit: '50mb' }));
app.use(performanceMonitoring);

// Server-side request timeout — kill requests that take too long.
// Some operations (VACUUM, full-DB export, comprehensive health probes) can
// legitimately take more than 30s, so they get a longer ceiling. Routes
// matching one of these prefixes skip the short timeout entirely; the long
// timeout still applies as a backstop. The previous version sent 503 after
// 30s while VACUUM kept running — clients retried, doubling load.
const LONG_RUNNING_PREFIXES = [
  '/api/storage/vacuum/',
  '/api/storage/export/',
  '/api/storage/clean/',
  '/api/health/comprehensive'
];
const SHORT_TIMEOUT_MS = 30000;
const LONG_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

app.use((req: Request, res: Response, next: Function) => {
  const isLong = LONG_RUNNING_PREFIXES.some(p => req.path.startsWith(p));
  const timeout = isLong ? LONG_TIMEOUT_MS : SHORT_TIMEOUT_MS;
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
  diffRiskRepository.insert(
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
startRetentionCleanup(db, {
  eventDays: parseInt(process.env.RETENTION_EVENT_DAYS || '7', 10),
  metricsDays: parseInt(process.env.RETENTION_METRICS_DAYS || '30', 10)
});

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

// Daily digest — generate at 6 PM if today's hasn't been made yet
scheduleDaily(18, () => {
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
});

const agentRegistry = new Map<string, AgentInfo>();

const apiLatencyRepository = createApiLatencyRepository(db);
const agentEventsRepository = createAgentEventsRepository(db);
const fileEventsRepository = createFileEventsRepository(db);
const metricsRepository = createMetricsRepository(db);
const dashboardRepository = createDashboardRepository(db);
const diffRiskRepository = createDiffRiskRepository(db);
const createAgentEventHandler = createAgentEventHandlerFactory({
  db,
  io,
  sessionId: SESSION_ID,
  agentRegistry,
  apiLatencyRepo: apiLatencyRepository
});

// Initialize log watchers — one per agent CLI we monitor.
// Persisted-position files let watchers resume mid-file across restarts so
// we don't have to wipe the agent_events table for idempotency.
const claudeLogWatcher = new ClaudeLogWatcher(
  createAgentEventHandler({
    agentName: 'Claude Code',
    agentType: 'claude-code',
    colorKey: 'claude'
  }),
  logger,
  { positionsFile: join(RAVEN_DIR, 'log-positions-claude.json') }
);
const codexLogWatcher = new CodexLogWatcher(
  createAgentEventHandler({ agentName: 'Codex', agentType: 'codex', colorKey: 'codex' }),
  logger,
  { positionsFile: join(RAVEN_DIR, 'log-positions-codex.json') }
);
const ollamaLogWatcher = new OllamaLogWatcher(
  createAgentEventHandler({ agentName: 'Ollama', agentType: 'ollama', colorKey: 'ollama' }),
  logger
);

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

let processCheckTimer: ReturnType<typeof setInterval> | null = null;

// ==================== EventBus Listeners ====================

const syntaxErrorsRepository = createSyntaxErrorsRepository(db);
const patternWarningsRepository = createPatternWarningsRepository(db);

bindEventBusListeners({
  db,
  io,
  sessionId: SESSION_ID,
  projectName: PROJECT_NAME,
  watchPath: WATCH_PATH,
  snapshotsDir: SNAPSHOTS_DIR,
  fileWatcher,
  projectManager,
  gitMonitor,
  triggerEngine,
  insightsService,
  syntaxErrorsRepo: syntaxErrorsRepository,
  patternWarningsRepo: patternWarningsRepository,
  fileEventsRepo: fileEventsRepository
});


// ==================== REST API Endpoints ====================

// ==================== Mount Modular Routes ====================
const systemInfoDeps = {
  db,
  sessionId: SESSION_ID,
  dbPath: DB_PATH,
  port: PORT,
  agentRegistry,
  fileWatcher,
  gitMonitor,
  metricsCollector,
  projectManager,
  localModelWatcher,
  rateLimitStatus
};
app.use('/health', createPublicHealthRouter(systemInfoDeps));
app.use('/api', createSystemInfoRouter(systemInfoDeps));
app.use('/api', createAgentEventsRoutesRouter(agentEventsRepository, fileEventsRepository));
const projectsConfigService = createProjectsConfigService(RAVEN_DIR);
app.use(
  '/api/projects',
  createProjectsRouter({ db, ravenDir: RAVEN_DIR, projectsConfigService, projectManager })
);
app.use('/api', createPauseRouter(pauseManager, io));
app.use(
  '/api/alerts',
  createAlertsRouter({ templatesPath: join(process.cwd(), 'alert-templates.json') })
);

// Mount live session routes
app.use('/api/session', createLiveSessionRouter(db));

// Mount events routes
app.use('/api', createEventsRouter(db, fileEventsRepository, dashboardRepository));

// Mount agents routes
app.use('/api', createAgentsRouter(db, agentRegistry, agentEventsRepository));

// Mount health monitoring routes
app.use('/api/health', createHealthMonitoringRouter(healthMonitor));

// Mount insights routes (LLM-powered analysis)
app.use('/api/insights', createInsightsRouter(insightsService, db, diffRiskRepository));
const errorsRepository = createErrorsRepository(db);
app.use('/api/errors', createErrorsRouter(errorsRepository, io));
app.use('/api', createOllamaDetailRouter(agentEventsRepository));
app.use('/api/conversations', createConversationsRouter(agentEventsRepository));
app.use('/api/syntax-errors', createSyntaxErrorsRouter(syntaxErrorsRepository));
app.use(
  '/api',
  createFilesRouter({ db, fileEventsRepo: fileEventsRepository, snapshotsDir: SNAPSHOTS_DIR })
);
const notificationsRepository = createNotificationsRepository(db);
app.use('/api/notifications', createNotificationsRouter(notificationsRepository));
app.use('/api/local-models', createLocalModelsRouter(localModelWatcher));
app.use('/api/dev', createDevRouter(io));
app.use('/api/search', createSearchRouter(createSearchRepository(db)));
app.use(
  '/api/models',
  createModelsRouter({ agentEventsRepo: agentEventsRepository, agentRegistry })
);
app.use(
  '/api/sessions',
  createSessionsRouter({ repo: createSessionsRepository(db), snapshotsDir: SNAPSHOTS_DIR })
);
app.use(
  '/api/storage',
  createStorageRouter({
    repo: createStorageRepository({ db, ravenDir: RAVEN_DIR, snapshotsDir: SNAPSHOTS_DIR }),
    expensiveOpLimiter
  })
);
app.use('/api/pattern-warnings', createPatternWarningsRouter(patternWarningsRepository));
app.use('/api/trends', createTrendsRouter(dashboardRepository));
app.use('/api/metrics', createMetricsOverviewRouter(dashboardRepository));
app.use(
  '/telemetry',
  createTelemetryRouter({
    db,
    io,
    sessionId: SESSION_ID,
    agentRegistry,
    triggerEngine,
    scheduleAgentStatsBroadcast,
    agentEventsRepo: agentEventsRepository
  })
);
app.use('/api/health', createHealthProjectsRouter({ db, projectName: PROJECT_NAME }));
app.use(
  '/api',
  createDashboardRouter({
    errorsRepo: errorsRepository,
    dashboardRepo: dashboardRepository,
    apiLatencyRepo: apiLatencyRepository,
    metricsRepo: metricsRepository,
    agentRegistry,
    sessionId: SESSION_ID
  })
);

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
app.use('/api', createMetricsRouter(apiLatencyRepository, metricsRepository, dashboardRepository));
app.use('/api', createTriggersRouter(triggerEngine));
app.use(
  '/ollama',
  createOllamaProxyRouter({
    db,
    io,
    logger,
    sessionId: SESSION_ID,
    agentRegistry,
    getProjects: () => projectsConfigService.getKnownProjects(),
    agentEventsRepo: agentEventsRepository
  })
);
app.use('/api/system', createSystemRouter({ db, agentRegistry }));

// Let the self-analysis service introspect mounted routes for the contract-drift check.
selfAnalysisService.setExpressApp(app);

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

// Bind localhost-only by default. Set RAVEN_BIND=0.0.0.0 (or any LAN IP)
// to expose the server to other machines on the network. The LAN address is
// reported either way so users can verify which interface is in use.
const BIND_HOST = process.env.RAVEN_BIND || '127.0.0.1';

startTransparentOllamaProxy({
  port: parseInt(process.env.TRANSPARENT_OLLAMA_PORT || '0', 10),
  bindHost: BIND_HOST,
  db,
  io,
  sessionId: SESSION_ID,
  agentRegistry,
  getProjects: () => projectsConfigService.getKnownProjects(),
  agentEventsRepo: agentEventsRepository
});

httpServer.listen(PORT, BIND_HOST, async () => {
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
  const isExposed = BIND_HOST !== '127.0.0.1' && BIND_HOST !== 'localhost';
  const lanAddr = isExposed && lanIps.length > 0 ? `http://${lanIps[0]}:${PORT}` : 'localhost-only';

  logger.info(`
╔════════════════════════════════════════════════╗
║     Raven Backend (TypeScript)                 ║
╠════════════════════════════════════════════════╣
║  Port:       ${PORT}                              ║
║  Bind:       ${BIND_HOST.padEnd(34)} ║
║  LAN:        ${lanAddr.padEnd(34)} ║
║  Session:    ${SESSION_ID}     ║
║  Watch Path: ${WATCH_PATH.slice(-30).padEnd(30)} ║
║  Database:   ${DB_PATH.slice(-30).padEnd(30)} ║
╚════════════════════════════════════════════════╝
  `);

  // Resolve stale warnings/errors for Raven's own files
  patternWarningsRepository.resolveForRaven();
  syntaxErrorsRepository.resolveForRaven();

  // Note: we used to DELETE FROM agent_events on every start to keep things
  // idempotent, which silently destroyed cross-session history. Watchers now
  // persist their byte-position offsets and resume mid-file, so re-imports
  // are naturally idempotent and the wipe is gone.

  // Start Claude Code log watcher
  logger.info('🤖 Starting Claude Code log watcher...');
  await claudeLogWatcher.start();

  // Start Codex log watcher
  logger.info('🤖 Starting Codex log watcher...');
  await codexLogWatcher.start();

  // Start Ollama log watcher (tails systemd journal for the ollama unit)
  logger.info('🤖 Starting Ollama log watcher...');
  await ollamaLogWatcher.start();

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
  const lmCallbacks = createLocalModelCallbacks({
    db,
    io,
    sessionId: SESSION_ID,
    agentRegistry,
    getProjects: () => projectsConfigService.getKnownProjects(),
    agentEventsRepo: agentEventsRepository
  });
  await localModelWatcher.start(
    lmCallbacks.onModelDetected,
    lmCallbacks.onStatusChange,
    lmCallbacks.onHeartbeat,
    lmCallbacks.onModelLoaded
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

  // Periodic process check for Claude Code + central idle-mode switching.
  processCheckTimer = startIdleDetection({
    agentRegistry,
    localModelWatcher,
    claudeLogWatcher,
    codexLogWatcher,
    healthMonitor,
    metricsCollector
  });

  // Seed + periodically refresh the project cache used for inference
  // attribution. 30s is plenty: project additions/removals are rare.
  await projectsConfigService.refreshKnownProjects();
  setInterval(() => {
    projectsConfigService.refreshKnownProjects().catch(() => {});
  }, 30_000).unref();

  logger.info('✅ All services started successfully');
});

// ==================== Graceful Shutdown ====================

installGracefulShutdown({
  httpServer,
  db,
  claudeLogWatcher,
  codexLogWatcher,
  ollamaLogWatcher,
  projectManager,
  fileWatcher,
  gitMonitor,
  localModelWatcher,
  metricsCollector,
  healthMonitor,
  getProcessCheckTimer: () => processCheckTimer
});
