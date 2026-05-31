/**
 * HealthChecker - Comprehensive health checks for all Raven features
 *
 * This service validates that ALL features are working, not just basic connectivity.
 * Runs during startup to catch broken features before users encounter them.
 */

import type { RavenDB } from '../db.js';
import { logger } from '../utils/logger.js';

interface HealthCheckDefinition {
  name: string;
  fn: () => Promise<unknown>;
  critical: boolean;
}

interface HealthCheckResult {
  name: string;
  status: 'passed' | 'failed';
  critical: boolean;
  duration: number;
  error: string | null;
}

interface HealthCheckSummary {
  total: number;
  passed: number;
  failed: number;
  criticalFailed: number;
  warnings: number;
  results: HealthCheckResult[];
  healthy: boolean;
}

interface ConversationApiRow {
  timestamp?: string;
  last_activity?: string;
}

interface ConversationApiResponse {
  conversations?: ConversationApiRow[];
  error?: string;
  message?: string;
}

interface AgentEventRow {
  timestamp: string;
  event_type: string;
}

export class HealthChecker {
  /** Per-endpoint probe deadline. Keeps one hung route from stalling the sweep. */
  static readonly ENDPOINT_TIMEOUT_MS = 10000;

  private baseUrl: string;
  private db: RavenDB | null;
  private results: HealthCheckResult[];

  constructor(baseUrl = 'http://localhost:9100', db: RavenDB | null = null) {
    this.baseUrl = baseUrl;
    this.db = db;
    this.results = [];
  }

  async runAll(): Promise<HealthCheckSummary> {
    logger.info('🏥 Starting comprehensive health checks...');
    this.results = [];

    // Every /system page's primary GET endpoints have a check here. The
    // `page` field groups them so the diagnostic UI can list checks
    // alongside the page they back — that way a failure has an obvious
    // home, not just an opaque check name.
    const checks: HealthCheckDefinition[] = [
      // Critical infrastructure
      { name: 'Health Endpoint', fn: () => this.checkEndpoint('/api/health'), critical: true },
      { name: 'Session ID', fn: () => this.checkEndpoint('/api/session-id'), critical: true },
      { name: 'Database Connection', fn: () => this.checkEndpoint('/api/health'), critical: true },
      {
        name: 'Agent Events',
        fn: () => this.checkEndpoint('/api/agent-events?limit=1'),
        critical: true
      },

      // /system Overview
      {
        name: 'System Introspection',
        fn: () => this.checkEndpoint('/api/system/introspection'),
        critical: false
      },
      {
        name: 'System Tables',
        fn: () => this.checkEndpoint('/api/system/tables'),
        critical: false
      },
      {
        name: 'System Routes',
        fn: () => this.checkEndpoint('/api/system/routes'),
        critical: false
      },
      {
        name: 'System Hardware',
        fn: () => this.checkEndpoint('/api/system/hardware'),
        critical: false
      },
      {
        // Catches the 'localhost vs 127.0.0.1' IPv6 trap that previously
        // returned 200 with {error:'fetch failed'} silently.
        name: 'System Models (Ollama)',
        fn: () => this.checkEndpoint('/api/system/models'),
        critical: false
      },

      // /system/projects
      { name: 'Projects List', fn: () => this.checkEndpoint('/api/projects'), critical: false },

      // /system/storage
      { name: 'Storage Info', fn: () => this.checkEndpoint('/api/storage'), critical: false },
      {
        name: 'Storage by Project',
        fn: () => this.checkEndpoint('/api/storage/projects'),
        critical: false
      },
      {
        name: 'Storage Retention Config',
        fn: () => this.checkEndpoint('/api/storage/retention'),
        critical: false
      },

      // /system/safety
      {
        name: 'Pattern Warnings',
        fn: () => this.checkEndpoint('/api/pattern-warnings'),
        critical: false
      },
      {
        name: 'Pattern Warning Ignores',
        fn: () => this.checkEndpoint('/api/pattern-warnings/ignores'),
        critical: false
      },

      // /system/errors
      { name: 'Errors Log', fn: () => this.checkEndpoint('/api/errors?limit=1'), critical: false },

      // /system/plugins
      { name: 'Plugins List', fn: () => this.checkEndpoint('/api/plugins'), critical: false },

      // /system/triggers
      {
        name: 'Triggers Config',
        fn: () => this.checkEndpoint('/api/triggers-config'),
        critical: false
      },
      {
        name: 'Triggered Events',
        fn: () => this.checkEndpoint('/api/triggered-events?limit=1'),
        critical: false
      },
      {
        name: 'Trigger Stats',
        fn: () => this.checkEndpoint('/api/trigger-stats'),
        critical: false
      },

      // Dashboard / Today / Activity feeders
      {
        name: 'Dashboard Stats',
        fn: () => this.checkEndpoint('/api/dashboard-stats'),
        critical: false
      },
      {
        name: 'Agents Status',
        fn: () => this.checkEndpoint('/api/agents-status'),
        critical: false
      },
      { name: 'Sessions API', fn: () => this.checkEndpoint('/api/sessions'), critical: false },
      {
        name: 'Syntax Errors',
        fn: () => this.checkEndpoint('/api/syntax-errors'),
        critical: false
      },
      {
        name: 'Conversations',
        fn: () => this.checkEndpoint('/api/conversations?limit=1'),
        critical: false
      },
      {
        name: 'Conversation Data Freshness',
        fn: () => this.checkConversationFreshness(),
        critical: false
      },
      {
        name: 'Notifications',
        fn: () => this.checkEndpoint('/api/notifications?limit=1'),
        critical: false
      },

      // Git
      { name: 'Git Status', fn: () => this.checkEndpoint('/api/git/status'), critical: false }
    ];

    const checkPromises = checks.map(async check => {
      const startTime = Date.now();
      try {
        await check.fn();
        const duration = Date.now() - startTime;
        this.results.push({
          name: check.name,
          status: 'passed',
          critical: check.critical,
          duration,
          error: null
        });
        logger.info(`  ✅ ${check.name} (${duration}ms)`);
      } catch (error) {
        const duration = Date.now() - startTime;
        const message = error instanceof Error ? error.message : String(error);
        this.results.push({
          name: check.name,
          status: 'failed',
          critical: check.critical,
          duration,
          error: message
        });
        if (check.critical) {
          logger.error(`  ❌ ${check.name} - ${message}`);
        } else {
          logger.warn(`  ⚠️  ${check.name} - ${message}`);
        }
      }
    });

    await Promise.all(checkPromises);

    const passed = this.results.filter(r => r.status === 'passed').length;
    const failed = this.results.filter(r => r.status === 'failed').length;
    const criticalFailed = this.results.filter(r => r.status === 'failed' && r.critical).length;
    const warnings = this.results.filter(r => r.status === 'failed' && !r.critical).length;

    const summary: HealthCheckSummary = {
      total: this.results.length,
      passed,
      failed,
      criticalFailed,
      warnings,
      results: this.results,
      healthy: criticalFailed === 0
    };

    logger.info('');
    logger.info('🏥 Health Check Summary:');
    logger.info(`  ✅ Passed: ${passed}/${this.results.length}`);
    if (criticalFailed > 0) {
      logger.error(`  ❌ Critical Failures: ${criticalFailed}`);
    }
    if (warnings > 0) {
      logger.warn(`  ⚠️  Warnings: ${warnings}`);
    }
    logger.info('');

    if (!summary.healthy) {
      logger.error('❌ HEALTH CHECK FAILED - Critical features are broken!');
      logger.error('   Review errors above and fix before deployment.');
    } else if (warnings > 0) {
      logger.warn('⚠️  Health check passed with warnings - Some features may not work.');
    } else {
      logger.info('✅ All health checks passed - System is fully operational!');
    }

    return summary;
  }

  async checkEndpoint(path: string): Promise<unknown> {
    const url = `${this.baseUrl}${path}`;
    // Bound every probe. runAll() awaits Promise.all over all checks, and the
    // /api/health/comprehensive route is deliberately exempt from the 30s
    // global timeout — so without a per-request deadline a single hung endpoint
    // (e.g. the Ollama proxy blocking) would stall the whole sweep and the
    // route indefinitely. A timeout surfaces the hang as a real failed check
    // instead of masking it.
    let response: Response;
    try {
      response = await fetch(url, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(HealthChecker.ENDPOINT_TIMEOUT_MS)
      });
    } catch (error) {
      if (error instanceof Error && error.name === 'TimeoutError') {
        throw new Error(`Timed out after ${HealthChecker.ENDPOINT_TIMEOUT_MS}ms`);
      }
      throw error;
    }

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = (await response.json()) as { error?: string; message?: string };

    if (data.error || data.message?.includes('not available')) {
      throw new Error(data.error || data.message);
    }

    return data;
  }

  async checkConversationFreshness(): Promise<void> {
    if (!this.db) {
      const data = (await this.checkEndpoint(
        '/api/conversations?limit=1'
      )) as ConversationApiResponse;
      if (data.conversations && data.conversations.length > 0) {
        const mostRecent = data.conversations[0];
        const ts = mostRecent.timestamp || mostRecent.last_activity;
        if (!ts) return;
        const conversationTime = new Date(ts);
        const now = new Date();
        const hoursSinceLastConversation =
          (now.getTime() - conversationTime.getTime()) / (1000 * 60 * 60);
        if (hoursSinceLastConversation > 24) {
          throw new Error(
            `Stale conversation data (last: ${hoursSinceLastConversation.toFixed(1)} hours ago). ` +
              'Conversation sync may not be working.'
          );
        }
      }
      return;
    }

    // Note: previous .js version called this.db.prepareStatement(...) which
    // does not exist on RavenDB — that path threw silently and was logged as
    // a failed warning. Use the actual better-sqlite3 wrapped instance.
    const stmt = this.db.db.prepare<unknown[], AgentEventRow>(`
      SELECT timestamp, event_type
      FROM agent_events
      ORDER BY timestamp DESC
      LIMIT 1
    `);
    const mostRecent = stmt.get();

    if (!mostRecent) {
      logger.info('  ℹ️  No conversations found (new installation)');
      return;
    }

    const conversationTime = new Date(mostRecent.timestamp);
    const now = new Date();
    const hoursSinceLastConversation =
      (now.getTime() - conversationTime.getTime()) / (1000 * 60 * 60);

    if (hoursSinceLastConversation > 24) {
      throw new Error(
        `Stale conversation data (last: ${mostRecent.timestamp}, ` +
          `${hoursSinceLastConversation.toFixed(1)} hours ago). ` +
          'Conversation sync may not be working.'
      );
    }

    logger.info(`  ℹ️  Last conversation: ${hoursSinceLastConversation.toFixed(1)} hours ago`);
  }

  getResults(): HealthCheckResult[] {
    return this.results;
  }

  isHealthy(): boolean {
    const criticalFailed = this.results.filter(r => r.status === 'failed' && r.critical).length;
    return criticalFailed === 0;
  }
}
