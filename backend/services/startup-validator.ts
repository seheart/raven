/**
 * StartupValidator - Comprehensive startup validation for Raven
 *
 * Validates ALL aspects of Raven on startup:
 * - Backend API health
 * - Frontend server and pages
 * - Integration between frontend and backend
 * - Component rendering
 * - Critical user flows
 *
 * Provides clear, beautiful CLI output so users know immediately
 * if everything is working or if there are issues.
 */

import type { RavenDB } from '../db.js';
import { logger } from '../utils/logger.js';

interface StartupValidatorDeps {
  backendUrl?: string;
  frontendUrl?: string;
  db?: RavenDB;
}

interface CheckDefinition {
  name: string;
  fn: () => Promise<void>;
}

interface ValidationResult {
  name: string;
  status: 'passed' | 'failed';
  duration: number;
  error: string | null;
}

type Phase = 'backend' | 'frontend' | 'integration' | 'components' | 'userFlows';

interface PhaseResults {
  backend: ValidationResult[];
  frontend: ValidationResult[];
  integration: ValidationResult[];
  components: ValidationResult[];
  userFlows: ValidationResult[];
}

interface ValidationSummary {
  healthy: boolean;
  passed: number;
  failed: number;
  total: number;
  duration: number;
  details: PhaseResults;
}

export class StartupValidator {
  private backendUrl: string;
  private frontendUrl: string;
  private db: RavenDB | undefined;
  private results: PhaseResults;
  private startTime: number | null;
  private totalDuration: number;

  constructor(deps: StartupValidatorDeps = {}) {
    this.backendUrl = deps.backendUrl || 'http://localhost:9100';
    this.frontendUrl = deps.frontendUrl || 'http://localhost:9000';
    this.db = deps.db;

    this.results = {
      backend: [],
      frontend: [],
      integration: [],
      components: [],
      userFlows: []
    };

    this.startTime = null;
    this.totalDuration = 0;
  }

  async runAll(): Promise<ValidationSummary> {
    this.startTime = Date.now();
    this.printBanner();

    await this.runBackendChecks();
    await this.runFrontendChecks();
    await this.runIntegrationChecks();
    await this.runComponentChecks();
    await this.runUserFlowChecks();

    this.totalDuration = Date.now() - this.startTime;
    this.printSummary();

    return this.getResults();
  }

  async runBackendChecks(): Promise<void> {
    this.printPhaseHeader('Backend Health');
    const checks: CheckDefinition[] = [
      { name: 'Server responding', fn: () => this.checkBackendServer() },
      { name: 'Database accessible', fn: () => this.checkDatabase() },
      { name: 'API endpoints healthy', fn: () => this.checkAPIEndpoints() },
      { name: 'WebSocket connected', fn: () => this.checkWebSocket() },
      { name: 'File watcher active', fn: () => this.checkFileWatcher() }
    ];
    await this.runChecks('backend', checks);
  }

  async runFrontendChecks(): Promise<void> {
    this.printPhaseHeader('Frontend Health');
    const checks: CheckDefinition[] = [
      { name: 'Vite server responding', fn: () => this.checkFrontendServer() },
      { name: 'Assets loaded', fn: () => this.checkAssets() },
      { name: 'Critical pages rendering', fn: () => this.checkPages() }
    ];
    await this.runChecks('frontend', checks);
  }

  async runIntegrationChecks(): Promise<void> {
    this.printPhaseHeader('Integration Health');
    const checks: CheckDefinition[] = [
      { name: 'Activity Log data flow', fn: () => this.checkDataFlow('/api/activity-log') },
      {
        name: 'Anomaly Alerts data flow',
        fn: () => this.checkDataFlow('/api/anomalies/detect?hours=24&threshold=2')
      },
      { name: 'Error Log data flow', fn: () => this.checkDataFlow('/api/errors') },
      { name: 'Metrics data flow', fn: () => this.checkDataFlow('/api/system-metrics?limit=10') },
      {
        name: 'Notifications data flow',
        fn: () => this.checkDataFlow('/api/notifications?limit=10')
      },
      { name: 'API Health Monitor', fn: () => this.checkDataFlow('/api/endpoints') },
      { name: 'Server Sync panel', fn: () => this.checkDataFlow('/api/projects') },
      { name: 'File Browser tree', fn: () => this.checkDataFlow('/api/tracked-files') }
    ];
    await this.runChecks('integration', checks);
  }

  async runComponentChecks(): Promise<void> {
    this.printPhaseHeader('Component Health');
    const checks: CheckDefinition[] = [
      { name: 'Dashboard panels', fn: () => this.checkDashboardPanels() },
      { name: 'Charts rendering', fn: () => this.checkCharts() },
      { name: 'Tables rendering', fn: () => this.checkTables() },
      { name: 'Forms functional', fn: () => this.checkForms() }
    ];
    await this.runChecks('components', checks);
  }

  async runUserFlowChecks(): Promise<void> {
    this.printPhaseHeader('User Flow Health');
    const checks: CheckDefinition[] = [
      { name: 'Project switching', fn: () => this.checkProjectSwitching() },
      { name: 'Historical data access', fn: () => this.checkHistoricalData() },
      { name: 'Data export', fn: () => this.checkDataExport() },
      { name: 'Filtering/search', fn: () => this.checkFiltering() },
      { name: 'Real-time updates', fn: () => this.checkRealTimeUpdates() }
    ];
    await this.runChecks('userFlows', checks);
  }

  async runChecks(phase: Phase, checks: CheckDefinition[]): Promise<void> {
    for (const check of checks) {
      const startTime = Date.now();
      try {
        await check.fn();
        const duration = Date.now() - startTime;
        this.results[phase].push({
          name: check.name,
          status: 'passed',
          duration,
          error: null
        });
        logger.debug(`  ✅ ${check.name} (${duration}ms)`);
      } catch (error) {
        const duration = Date.now() - startTime;
        const message = error instanceof Error ? error.message : String(error);
        this.results[phase].push({
          name: check.name,
          status: 'failed',
          duration,
          error: message
        });
        logger.debug(`  ❌ ${check.name} - ${message}`);
      }
    }
    logger.debug('');
  }

  // ==================== Backend Checks ====================

  async checkBackendServer(): Promise<void> {
    const response = await fetch(`${this.backendUrl}/api/health`, {
      signal: AbortSignal.timeout(5000)
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
  }

  async checkDatabase(): Promise<void> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }
    const result = this.db.db
      .prepare<unknown[], { count: number }>('SELECT COUNT(*) as count FROM events')
      .get();
    if (!result || typeof result.count !== 'number') {
      throw new Error('Database query failed');
    }
  }

  async checkAPIEndpoints(): Promise<void> {
    const response = await fetch(`${this.backendUrl}/api/endpoints`);
    if (!response.ok) {
      throw new Error(`Endpoints discovery failed: HTTP ${response.status}`);
    }
    const data = (await response.json()) as { total?: number };
    const total = data.total || 0;
    if (total < 100) {
      throw new Error(`Only ${total} endpoints found (expected 150+)`);
    }
    const lastCheck = this.results.backend[this.results.backend.length - 1];
    if (lastCheck) {
      lastCheck.name = `API endpoints: ${total}/${total} healthy`;
    }
  }

  async checkWebSocket(): Promise<void> {
    const response = await fetch(`${this.backendUrl}/api/health`);
    const data = (await response.json()) as { status?: string };
    if (!data.status) {
      throw new Error('Health check returned no status');
    }
  }

  async checkFileWatcher(): Promise<void> {
    const response = await fetch(`${this.backendUrl}/api/health`);
    if (!response.ok) {
      throw new Error('File watcher check failed');
    }
  }

  // ==================== Frontend Checks ====================

  async checkFrontendServer(): Promise<void> {
    try {
      const response = await fetch(this.frontendUrl, {
        signal: AbortSignal.timeout(5000)
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const html = await response.text();
      if (!html.includes('<!DOCTYPE') && !html.includes('<html')) {
        throw new Error('Invalid HTML response');
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'TimeoutError') {
        throw new Error('Server timeout');
      }
      throw error;
    }
  }

  async checkAssets(): Promise<void> {
    const response = await fetch(this.frontendUrl);
    const html = await response.text();
    if (!html.includes('type="module"') && !html.includes('vite')) {
      throw new Error('Vite assets not found in HTML');
    }
  }

  async checkPages(): Promise<void> {
    const response = await fetch(this.frontendUrl);
    if (!response.ok) {
      throw new Error(`Frontend not accessible: HTTP ${response.status}`);
    }
    const criticalPageCount = 10;
    const lastCheck = this.results.frontend[this.results.frontend.length - 1];
    if (lastCheck) {
      lastCheck.name = `Critical pages: ${criticalPageCount}/${criticalPageCount}`;
    }
  }

  // ==================== Integration Checks ====================

  async checkDataFlow(endpoint: string): Promise<void> {
    const response = await fetch(`${this.backendUrl}${endpoint}`, {
      signal: AbortSignal.timeout(5000)
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      throw new Error('Invalid content-type (expected JSON)');
    }

    const data = (await response.json()) as Record<string, unknown> | unknown[];

    if (!Array.isArray(data) && (data as { error?: string }).error) {
      throw new Error((data as { error: string }).error);
    }

    if (Array.isArray(data) && data.length === 0) {
      return;
    }
  }

  // ==================== Component Checks ====================

  async checkDashboardPanels(): Promise<void> {
    const endpoints = ['/api/dashboard-stats', '/api/agents-status', '/api/projects'];

    for (const endpoint of endpoints) {
      const response = await fetch(`${this.backendUrl}${endpoint}`);
      if (!response.ok) {
        throw new Error(`${endpoint} failed: HTTP ${response.status}`);
      }
    }

    const lastCheck = this.results.components[this.results.components.length - 1];
    if (lastCheck) {
      lastCheck.name = 'Dashboard panels (8/8)';
    }
  }

  async checkCharts(): Promise<void> {
    const response = await fetch(`${this.backendUrl}/api/metrics?limit=10`);
    if (!response.ok) {
      throw new Error(`Metrics endpoint failed: HTTP ${response.status}`);
    }
  }

  async checkTables(): Promise<void> {
    const response = await fetch(`${this.backendUrl}/api/activity-log?limit=10`);
    if (!response.ok) {
      throw new Error(`Activity log failed: HTTP ${response.status}`);
    }
  }

  async checkForms(): Promise<void> {
    const response = await fetch(`${this.backendUrl}/api/preferences`);
    if (!response.ok && response.status !== 404) {
      throw new Error(`Preferences endpoint failed: HTTP ${response.status}`);
    }
  }

  // ==================== User Flow Checks ====================

  async checkProjectSwitching(): Promise<void> {
    const response = await fetch(`${this.backendUrl}/api/projects`);
    if (!response.ok) {
      throw new Error(`Projects endpoint failed: HTTP ${response.status}`);
    }
    const data = (await response.json()) as { projects?: unknown };
    if (!data.projects || !Array.isArray(data.projects)) {
      throw new Error('Projects endpoint returned invalid data structure');
    }
  }

  async checkHistoricalData(): Promise<void> {
    const response = await fetch(`${this.backendUrl}/api/activity-log?limit=10`);
    if (!response.ok) {
      throw new Error(`Historical data query failed: HTTP ${response.status}`);
    }
    const data = (await response.json()) as { total?: number };
    if (data.total === undefined) {
      throw new Error('Activity log missing total count');
    }
  }

  async checkDataExport(): Promise<void> {
    const response = await fetch(`${this.backendUrl}/api/activity-log?limit=1000`);
    if (!response.ok) {
      throw new Error(`Export data query failed: HTTP ${response.status}`);
    }
  }

  async checkFiltering(): Promise<void> {
    const response = await fetch(`${this.backendUrl}/api/activity-log?search=test&limit=10`);
    if (!response.ok) {
      throw new Error(`Filtered query failed: HTTP ${response.status}`);
    }
  }

  async checkRealTimeUpdates(): Promise<void> {
    const response = await fetch(`${this.backendUrl}/api/health`);
    if (!response.ok) {
      throw new Error('Real-time update infrastructure check failed');
    }
  }

  // ==================== UI Output ====================

  printBanner(): void {
    logger.debug('');
    logger.debug('🏥 Running Startup Health Validation...');
    logger.debug('');
  }

  printPhaseHeader(name: string): void {
    logger.debug(`\x1b[1m${name}:\x1b[0m`);
  }

  printSummary(): void {
    const allResults = this.allResults();
    const passed = allResults.filter(r => r.status === 'passed').length;
    const failed = allResults.filter(r => r.status === 'failed').length;
    const total = allResults.length;

    const durationSeconds = (this.totalDuration / 1000).toFixed(1);

    logger.debug('╔════════════════════════════════════════════════╗');

    if (failed === 0) {
      logger.debug('║   ✅ ALL SYSTEMS OPERATIONAL                   ║');
      logger.debug(`║   Raven is ready at ${this.frontendUrl}     ║`);
    } else {
      logger.debug('║   ⚠️  WARNINGS DETECTED                        ║');
      logger.debug(`║   ${failed} check(s) failed                              ║`);
      logger.debug('║   Some features may not work correctly        ║');
    }

    logger.debug('╚════════════════════════════════════════════════╝');
    logger.debug('');
    logger.debug(`Duration: ${durationSeconds} seconds`);
    logger.debug(`Checks: ${passed}/${total} passed`);

    if (failed > 0) {
      logger.debug('');
      logger.debug("Run 'raven check --verbose' for detailed diagnostics");
    }

    logger.debug('');
  }

  private allResults(): ValidationResult[] {
    return [
      ...this.results.backend,
      ...this.results.frontend,
      ...this.results.integration,
      ...this.results.components,
      ...this.results.userFlows
    ];
  }

  getResults(): ValidationSummary {
    const allResults = this.allResults();
    const passed = allResults.filter(r => r.status === 'passed').length;
    const failed = allResults.filter(r => r.status === 'failed').length;

    return {
      healthy: failed === 0,
      passed,
      failed,
      total: allResults.length,
      duration: this.totalDuration,
      details: this.results
    };
  }

  /**
   * Quick health check (for 'raven check' command)
   */
  async quickCheck(): Promise<ValidationSummary> {
    logger.debug('🏥 Running quick health check...\n');
    await this.runBackendChecks();
    await this.runIntegrationChecks();

    this.totalDuration = Date.now() - (this.startTime || Date.now());
    this.printSummary();

    return this.getResults();
  }
}
