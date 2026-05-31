/**
 * Route wiring — owns the createXRouter calls and the app.use mounts so
 * server.ts doesn't have to. All 30+ routes mount here in one place.
 *
 * Adding a new route:
 *   1. Add the createXRouter import below (alphabetized).
 *   2. Add any new dep to WireRoutesDeps.
 *   3. Add the app.use(...) call in wireRoutes (grouped by /api prefix).
 */

import type { Express } from 'express';
import type { Server as SocketIOServer } from 'socket.io';
import { join } from 'path';
import type { RateLimitRequestHandler } from 'express-rate-limit';

import type { RavenDB } from '../db.js';
import type { TriggerEngine } from '../trigger-engine.js';
import type { AgentInfo } from '../types/agent-info.js';
import { logger } from '../utils/logger.js';
import { rateLimitStatus } from '../middleware/security.js';

import type { ApiLatencyRepository } from '../repositories/api-latency-repository.js';
import type { TokenUsageRepository } from '../repositories/token-usage-repository.js';
import type { JourneyRepository } from '../repositories/journey-repository.js';
import type { TodayNarrativeRepository } from '../repositories/today-narrative-repository.js';
import type { SubagentsRepository } from '../repositories/subagents-repository.js';
import type { AgentEventsRepository } from '../repositories/agent-events-repository.js';
import type { FileEventsRepository } from '../repositories/file-events-repository.js';
import type { MetricsRepository } from '../repositories/metrics-repository.js';
import type { DashboardRepository } from '../repositories/dashboard-repository.js';
import type { DiffRiskRepository } from '../repositories/diff-risk-repository.js';
import type { DiffAnnotationsRepository } from '../repositories/diff-annotations-repository.js';
import type { DiffAnnotationService } from '../services/diff-annotation-service.js';
import type { DigestService } from '../services/digest-service.js';
import type { PersonaService } from '../services/persona-service.js';
import type { DecisionsService } from '../services/decisions-service.js';
import type { DerivedDecisionsService } from '../services/derived-decisions-service.js';
import type { PluginRuntime } from '../services/plugin-runtime.js';
import type { BaselinesService } from '../services/baselines-service.js';
import type { MilestonesService } from '../services/milestones-service.js';
import type { WrappedService } from '../services/wrapped-service.js';
import type { SyntaxErrorsRepository } from '../repositories/syntax-errors-repository.js';
import type { PatternWarningsRepository } from '../repositories/pattern-warnings-repository.js';
import type { ErrorsRepository } from '../repositories/errors-repository.js';
import type { NotificationsRepository } from '../repositories/notifications-repository.js';
import { createSearchRepository } from '../repositories/search-repository.js';
import { createSessionsRepository } from '../repositories/sessions-repository.js';
import { createStorageRepository } from '../repositories/storage-repository.js';

import type { HealthMonitor } from '../services/health-monitor.js';
import type { InsightsService } from '../services/insights-service.js';
import type { LocalModelWatcher } from '../services/local-model-watcher.js';
import type { ProjectManager } from '../services/project-manager.js';
import type { SelfAnalysisService } from '../services/self-analysis.js';
import type { ProjectsConfigService } from '../services/projects-config.js';
import type { GitMonitor, FileWatcher } from '../modules/index.js';
import type { MetricsCollector } from '../metrics-collector.js';
import type { ClaudeLogWatcher } from '../services/claude-log-watcher.js';
import type { CodexLogWatcher } from '../services/codex-log-watcher.js';
import { pauseManager } from '../pause-manager.js';

import { createAgentEventsRoutesRouter } from './agent-events-routes.js';
import { createAgentsRouter } from './agents.js';
import { createAlertsRouter } from './alerts.js';
import { createConversationsRouter } from './conversations.js';
import { createCostsRouter } from './costs.js';
import { createDashboardRouter } from './dashboard.js';
import { createDevRouter } from './dev.js';
import { createDiffsRouter } from './diffs.js';
import { createDigestsRouter } from './digests.js';
import { createPersonaRouter } from './persona.js';
import { createDecisionsRouter } from './decisions.js';
import { createContextWindowRouter } from './context-window.js';
import { createPluginsRouter } from './plugins.js';
import { createJourneyRouter } from './journey.js';
import { createBaselinesRouter } from './baselines.js';
import { createMilestonesRouter } from './milestones.js';
import { createWrappedRouter } from './wrapped.js';
import { createErrorsRouter } from './errors.js';
import { createEventsRouter } from './events.js';
import { createExportRouter } from './export.js';
import { createFilesRouter } from './files.js';
import { createGitRouter } from './git.js';
import { createHealthMonitoringRouter } from './health-monitoring.js';
import { createHealthProjectsRouter } from './health-projects.js';
import { createInsightsRouter } from './insights.js';
import { createLiveSessionRouter } from './live-session.js';
import { createLocalModelsRouter } from './local-models.js';
import { createMetricsRouter } from './metrics.js';
import { createMetricsOverviewRouter } from './metrics-overview.js';
import { createModelsRouter } from './models.js';
import { createNotificationsRouter } from './notifications.js';
import { createOllamaDetailRouter } from './ollama.js';
import { createOllamaProxyRouter } from './ollama-proxy.js';
import { createPatternWarningsRouter } from './pattern-warnings.js';
import { createPauseRouter } from './pause.js';
import { createProjectsRouter } from './projects.js';
import { createSearchRouter } from './search.js';
import { createSelfAnalysisRouter } from './self-analysis.js';
import { createSessionActivityRouter } from './session-activity.js';
import { createSessionsRouter } from './sessions.js';
import { createStorageRouter } from './storage.js';
import { createSubagentsRouter } from './subagents.js';
import { createSyncRouter } from './sync.js';
import { createSyntaxErrorsRouter } from './syntax-errors.js';
import { createSystemInfoRouter, createPublicHealthRouter } from './system-info.js';
import { createSystemRouter } from './system.js';
import { createTelemetryRouter } from './telemetry.js';
import { createTodayNarrativeRouter } from './today-narrative.js';
import { createTrendsRouter } from './trends.js';
import { createTriggersRouter } from './triggers.js';

interface WireRoutesDeps {
  // Core
  db: RavenDB;
  io: SocketIOServer;
  sessionId: string;
  // Config / paths
  ravenDir: string;
  dbPath: string;
  port: number;
  projectName: string;
  snapshotsDir: string;
  // Services
  metricsCollector: MetricsCollector;
  triggerEngine: TriggerEngine;
  healthMonitor: HealthMonitor;
  insightsService: InsightsService;
  selfAnalysisService: SelfAnalysisService;
  localModelWatcher: LocalModelWatcher;
  projectManager: ProjectManager;
  projectsConfigService: ProjectsConfigService;
  fileWatcher: FileWatcher;
  gitMonitor: GitMonitor;
  // Registries
  agentRegistry: Map<string, AgentInfo>;
  // Middleware
  expensiveOpLimiter: RateLimitRequestHandler;
  // Schedulers
  scheduleAgentStatsBroadcast: () => void;
  // Repositories
  apiLatencyRepository: ApiLatencyRepository;
  tokenUsageRepository: TokenUsageRepository;
  journeyRepository: JourneyRepository;
  todayNarrativeRepository: TodayNarrativeRepository;
  subagentsRepository: SubagentsRepository;
  agentEventsRepository: AgentEventsRepository;
  fileEventsRepository: FileEventsRepository;
  metricsRepository: MetricsRepository;
  dashboardRepository: DashboardRepository;
  diffRiskRepository: DiffRiskRepository;
  diffAnnotationsRepository: DiffAnnotationsRepository;
  diffAnnotationService: DiffAnnotationService;
  digestService: DigestService;
  personaService: PersonaService;
  decisionsService: DecisionsService;
  derivedDecisionsService: DerivedDecisionsService;
  pluginRuntime: PluginRuntime;
  baselinesService: BaselinesService;
  milestonesService: MilestonesService;
  wrappedService: WrappedService;
  syntaxErrorsRepository: SyntaxErrorsRepository;
  patternWarningsRepository: PatternWarningsRepository;
  errorsRepository: ErrorsRepository;
  notificationsRepository: NotificationsRepository;
  hostIdentity?: { host_id: string; host_name: string };
  // Log watchers — surfaced to /api/health so the endpoint can report each
  // watcher's auto-restart state + lastSuccessfulTail timestamp.
  claudeLogWatcher?: ClaudeLogWatcher;
  codexLogWatcher?: CodexLogWatcher;
}

/**
 * Mount all REST routes onto the Express app.
 *
 * Order is meaningful where two routers share a prefix; otherwise it just
 * mirrors the historical mount order from server.ts so behavior is preserved.
 */
export function wireRoutes(app: Express, deps: WireRoutesDeps): void {
  const {
    db,
    io,
    sessionId,
    ravenDir,
    dbPath,
    port,
    snapshotsDir,
    metricsCollector,
    triggerEngine,
    healthMonitor,
    insightsService,
    selfAnalysisService,
    localModelWatcher,
    projectManager,
    projectsConfigService,
    fileWatcher,
    gitMonitor,
    agentRegistry,
    expensiveOpLimiter,
    scheduleAgentStatsBroadcast,
    apiLatencyRepository,
    tokenUsageRepository,
    journeyRepository,
    todayNarrativeRepository,
    subagentsRepository,
    agentEventsRepository,
    fileEventsRepository,
    metricsRepository,
    dashboardRepository,
    diffRiskRepository,
    diffAnnotationsRepository,
    diffAnnotationService,
    digestService,
    personaService,
    decisionsService,
    derivedDecisionsService,
    pluginRuntime,
    baselinesService,
    milestonesService,
    wrappedService,
    syntaxErrorsRepository,
    patternWarningsRepository,
    errorsRepository,
    notificationsRepository
  } = deps;

  const systemInfoDeps = {
    db,
    sessionId,
    dbPath,
    port,
    agentRegistry,
    fileWatcher,
    gitMonitor,
    metricsCollector,
    projectManager,
    localModelWatcher,
    rateLimitStatus,
    hostIdentity: deps.hostIdentity,
    claudeLogWatcher: deps.claudeLogWatcher,
    codexLogWatcher: deps.codexLogWatcher,
    insightsService
  };

  app.use('/health', createPublicHealthRouter(systemInfoDeps));
  app.use('/api', createSystemInfoRouter(systemInfoDeps));
  app.use('/api', createAgentEventsRoutesRouter(agentEventsRepository, fileEventsRepository));
  app.use(
    '/api/projects',
    createProjectsRouter({
      fileEventsRepo: fileEventsRepository,
      ravenDir,
      projectsConfigService,
      projectManager
    })
  );
  app.use('/api', createPauseRouter(pauseManager, io));
  app.use(
    '/api/alerts',
    createAlertsRouter({ templatesPath: join(process.cwd(), 'alert-templates.json') })
  );

  app.use('/api/session', createLiveSessionRouter(db));

  app.use('/api', createEventsRouter(fileEventsRepository, dashboardRepository));

  app.use('/api', createAgentsRouter(fileEventsRepository, agentRegistry, agentEventsRepository));

  app.use('/api/health', createHealthMonitoringRouter(healthMonitor, db));

  app.use('/api/insights', createInsightsRouter(insightsService, db, diffRiskRepository));
  app.use('/api/errors', createErrorsRouter(errorsRepository, io));
  app.use('/api', createOllamaDetailRouter(agentEventsRepository, metricsRepository));
  app.use('/api/conversations', createConversationsRouter(agentEventsRepository));
  app.use('/api/syntax-errors', createSyntaxErrorsRouter(syntaxErrorsRepository));
  app.use('/api', createFilesRouter({ fileEventsRepo: fileEventsRepository, snapshotsDir }));
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
    createSessionsRouter({ repo: createSessionsRepository(db), snapshotsDir })
  );
  app.use(
    '/api/storage',
    createStorageRouter({
      repo: createStorageRepository({ db, ravenDir, snapshotsDir }),
      expensiveOpLimiter,
      db,
      projectsConfigService
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
      sessionId,
      agentRegistry,
      triggerEngine,
      scheduleAgentStatsBroadcast,
      agentEventsRepo: agentEventsRepository
    })
  );
  app.use('/api/health', createHealthProjectsRouter({ dashboardRepo: dashboardRepository }));
  app.use(
    '/api',
    createDashboardRouter({
      errorsRepo: errorsRepository,
      dashboardRepo: dashboardRepository,
      apiLatencyRepo: apiLatencyRepository,
      metricsRepo: metricsRepository,
      agentRegistry,
      sessionId
    })
  );

  app.use('/api/costs', createCostsRouter(tokenUsageRepository));
  app.use('/api/today', createTodayNarrativeRouter(todayNarrativeRepository));
  app.use(
    '/api/diffs',
    createDiffsRouter(fileEventsRepository, diffAnnotationsRepository, diffAnnotationService)
  );
  app.use('/api/digests', createDigestsRouter(digestService));
  app.use('/api/persona', createPersonaRouter(personaService));
  app.use('/api/decisions', createDecisionsRouter(decisionsService, derivedDecisionsService));
  app.use('/api/context', createContextWindowRouter(tokenUsageRepository));
  app.use('/api/plugins', createPluginsRouter(pluginRuntime));
  app.use('/api/journey', createJourneyRouter(journeyRepository));
  app.use('/api/agents', createBaselinesRouter(baselinesService));
  app.use('/api/milestones', createMilestonesRouter(milestonesService));
  app.use('/api/sync', createSyncRouter(db, ravenDir));
  app.use('/api/wrapped', createWrappedRouter(wrappedService));
  app.use('/api/subagents', createSubagentsRouter(subagentsRepository, tokenUsageRepository));
  app.use('/api/analysis/code-health', createSelfAnalysisRouter(selfAnalysisService));
  app.use('/api/session-activity', createSessionActivityRouter());

  app.use('/api/git', createGitRouter(gitMonitor));
  app.use(
    '/api',
    createMetricsRouter(
      apiLatencyRepository,
      metricsRepository,
      dashboardRepository,
      agentEventsRepository
    )
  );
  app.use('/api', createTriggersRouter(triggerEngine));
  app.use(
    '/ollama',
    createOllamaProxyRouter({
      db,
      io,
      logger,
      sessionId,
      agentRegistry,
      getProjects: () => projectsConfigService.getKnownProjects(),
      agentEventsRepo: agentEventsRepository
    })
  );
  app.use('/api/system', createSystemRouter({ db, agentRegistry }));
  app.use('/api/export', createExportRouter({ db, dbPath }));

  // Let the self-analysis service introspect mounted routes for the
  // contract-drift check. Must run after all routes are mounted.
  selfAnalysisService.setExpressApp(app);
}
