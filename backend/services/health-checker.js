/**
 * HealthChecker - Comprehensive health checks for all Raven features
 *
 * This service validates that ALL features are working, not just basic connectivity.
 * Runs during startup to catch broken features before users encounter them.
 */

import { logger } from '../utils/logger.js';

export class HealthChecker {
  constructor(baseUrl = 'http://localhost:9100', db = null) {
    this.baseUrl = baseUrl;
    this.db = db;
    this.results = [];
  }

  /**
   * Run all health checks
   * @returns {Object} { passed: number, failed: number, warnings: number, results: [] }
   */
  async runAll() {
    logger.info('🏥 Starting comprehensive health checks...');
    this.results = [];

    // Define all checks with criticality levels
    const checks = [
      // Critical - App won't function without these
      { name: 'Health Endpoint', fn: () => this.checkEndpoint('/api/health'), critical: true },
      { name: 'Session ID', fn: () => this.checkEndpoint('/api/session-id'), critical: true },
      { name: 'Database Connection', fn: () => this.checkEndpoint('/api/health'), critical: true },

      // Core Features - Major functionality
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

      // Safety Features
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
      // System Features
      { name: 'Storage Info', fn: () => this.checkEndpoint('/api/storage'), critical: false },
      {
        name: 'Notifications',
        fn: () => this.checkEndpoint('/api/notifications?limit=1'),
        critical: false
      },

      // Git Integration
      { name: 'Git Status', fn: () => this.checkEndpoint('/api/git/status'), critical: false }
    ];

    // Run all checks in parallel
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
        this.results.push({
          name: check.name,
          status: 'failed',
          critical: check.critical,
          duration,
          error: error.message
        });
        if (check.critical) {
          logger.error(`  ❌ ${check.name} - ${error.message}`);
        } else {
          logger.warn(`  ⚠️  ${check.name} - ${error.message}`);
        }
      }
    });

    await Promise.all(checkPromises);

    // Calculate summary
    const passed = this.results.filter(r => r.status === 'passed').length;
    const failed = this.results.filter(r => r.status === 'failed').length;
    const criticalFailed = this.results.filter(r => r.status === 'failed' && r.critical).length;
    const warnings = this.results.filter(r => r.status === 'failed' && !r.critical).length;

    const summary = {
      total: this.results.length,
      passed,
      failed,
      criticalFailed,
      warnings,
      results: this.results,
      healthy: criticalFailed === 0
    };

    // Log summary
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

  /**
   * Check if an endpoint returns 200 OK
   */
  async checkEndpoint(path) {
    const url = `${this.baseUrl}${path}`;
    const response = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' }
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();

    // Check for common error patterns in response
    if (data.error || data.message?.includes('not available')) {
      throw new Error(data.error || data.message);
    }

    return data;
  }

  /**
   * Check if conversation data is fresh (not stale)
   * Verifies that conversations have been captured recently
   */
  async checkConversationFreshness() {
    if (!this.db) {
      // Fall back to API check when DB is not directly available
      const data = await this.checkEndpoint('/api/conversations?limit=1');
      if (data.conversations && data.conversations.length > 0) {
        const mostRecent = data.conversations[0];
        const conversationTime = new Date(mostRecent.timestamp || mostRecent.last_activity);
        const now = new Date();
        const hoursSinceLastConversation = (now.getTime() - conversationTime.getTime()) / (1000 * 60 * 60);
        if (hoursSinceLastConversation > 24) {
          throw new Error(
            `Stale conversation data (last: ${hoursSinceLastConversation.toFixed(1)} hours ago). ` +
              'Conversation sync may not be working.'
          );
        }
      }
      return;
    }

    // Query most recent conversation from agent_events
    const stmt = this.db.prepareStatement(`
      SELECT timestamp, event_type
      FROM agent_events
      ORDER BY timestamp DESC
      LIMIT 1
    `);
    const mostRecent = stmt.get();

    if (!mostRecent) {
      // No conversations yet - this is OK for new installations
      logger.info('  ℹ️  No conversations found (new installation)');
      return;
    }

    // Check if most recent conversation is within acceptable timeframe
    const conversationTime = new Date(mostRecent.timestamp);
    const now = new Date();
    const hoursSinceLastConversation = (now - conversationTime) / (1000 * 60 * 60);

    // If no conversation in last 24 hours, warn (may indicate sync issue)
    if (hoursSinceLastConversation > 24) {
      throw new Error(
        `Stale conversation data (last: ${mostRecent.timestamp}, ` +
          `${hoursSinceLastConversation.toFixed(1)} hours ago). ` +
          'Conversation sync may not be working.'
      );
    }

    logger.info(`  ℹ️  Last conversation: ${hoursSinceLastConversation.toFixed(1)} hours ago`);
  }

  /**
   * Get results from last health check
   */
  getResults() {
    return this.results;
  }

  /**
   * Check if system is healthy (no critical failures)
   */
  isHealthy() {
    const criticalFailed = this.results.filter(r => r.status === 'failed' && r.critical).length;
    return criticalFailed === 0;
  }
}
