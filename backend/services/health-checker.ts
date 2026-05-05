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

export interface HealthCheckResult {
  name: string;
  status: 'passed' | 'failed';
  critical: boolean;
  duration: number;
  error: string | null;
}

export interface HealthCheckSummary {
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

    const checks: HealthCheckDefinition[] = [
      // Critical
      { name: 'Health Endpoint', fn: () => this.checkEndpoint('/api/health'), critical: true },
      { name: 'Session ID', fn: () => this.checkEndpoint('/api/session-id'), critical: true },
      { name: 'Database Connection', fn: () => this.checkEndpoint('/api/health'), critical: true },
      {
        name: 'Agent Events',
        fn: () => this.checkEndpoint('/api/agent-events?limit=1'),
        critical: true
      },

      // Dashboard & Overview
      {
        name: 'Dashboard Stats',
        fn: () => this.checkEndpoint('/api/dashboard-stats'),
        critical: false
      },
      { name: 'Projects List', fn: () => this.checkEndpoint('/api/projects'), critical: false },
      {
        name: 'Agents Status',
        fn: () => this.checkEndpoint('/api/agents-status'),
        critical: false
      },

      // Safety
      { name: 'Sessions API', fn: () => this.checkEndpoint('/api/sessions'), critical: false },
      {
        name: 'Syntax Errors',
        fn: () => this.checkEndpoint('/api/syntax-errors'),
        critical: false
      },
      {
        name: 'Pattern Warnings',
        fn: () => this.checkEndpoint('/api/pattern-warnings'),
        critical: false
      },

      // History & Conversations
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

      // System
      { name: 'Storage Info', fn: () => this.checkEndpoint('/api/storage'), critical: false },
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
    const response = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' }
    });

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
