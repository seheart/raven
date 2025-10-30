/**
 * Raven Health Check System
 *
 * Runs comprehensive health checks on startup to verify all components are working.
 * Generates notifications/alerts if any checks fail.
 */
import { logger } from './utils/logger.js';

class HealthCheckSystem {
  constructor(db, io) {
    this.db = db;
    this.io = io;
    this.checks = [];
    this.results = [];
    this.startTime = Date.now();
  }

  /**
   * Register a health check
   * @param {string} name - Check name
   * @param {string} category - Component category (database, api, websocket, etc)
   * @param {Function} checkFn - Async function that returns {passed, message}
   */
  registerCheck(name, category, checkFn) {
    this.checks.push({ name, category, checkFn });
  }

  /**
   * Run all health checks
   * @returns {Object} Results summary
   */
  async runAllChecks() {
    logger.info('🏥 Running startup health checks...');
    this.results = [];

    for (const check of this.checks) {
      const startTime = Date.now();
      try {
        const result = await check.checkFn();
        const duration = Date.now() - startTime;

        this.results.push({
          name: check.name,
          category: check.category,
          passed: result.passed,
          message: result.message,
          duration,
          timestamp: new Date().toISOString()
        });

        if (result.passed) {
          logger.info(`  ✅ ${check.name}: ${result.message} (${duration}ms)`);
        } else {
          logger.error(`  ❌ ${check.name}: ${result.message} (${duration}ms)`);

          // Create notification for failed check
          this.createFailureNotification(check.name, result.message, check.category);
        }
      } catch (error) {
        const duration = Date.now() - startTime;
        logger.error(`  ❌ ${check.name}: ERROR - ${error.message} (${duration}ms)`);

        this.results.push({
          name: check.name,
          category: check.category,
          passed: false,
          message: `Error: ${error.message}`,
          duration,
          timestamp: new Date().toISOString()
        });

        this.createFailureNotification(check.name, error.message, check.category);
      }
    }

    const summary = this.getSummary();
    logger.info(`\n🏥 Health Check Summary: ${summary.passed}/${summary.total} passed (${Date.now() - this.startTime}ms)`);

    if (summary.failed > 0) {
      logger.error(`⚠️  ${summary.failed} health check(s) FAILED - check notifications for details`);
    }

    return summary;
  }

  /**
   * Create notification for failed health check
   */
  createFailureNotification(checkName, message, category) {
    if (!this.db) return;

    try {
      const notification = {
        type: 'performance',
        severity: 'error',
        title: `Health Check Failed: ${checkName}`,
        message: `Startup health check "${checkName}" failed: ${message}`,
        metadata: JSON.stringify({
          category,
          checkName,
          error: message,
          timestamp: new Date().toISOString()
        })
      };

      this.db.createNotification(
        notification.type,
        notification.severity,
        notification.title,
        notification.message,
        notification.metadata
      );

      // Emit via WebSocket if available
      if (this.io) {
        this.io.emit('health-check-failed', {
          checkName,
          category,
          message,
          timestamp: new Date().toISOString()
        });
      }
    } catch (error) {
      logger.error(`Failed to create notification for failed health check: ${error.message}`);
    }
  }

  /**
   * Get summary of health check results
   */
  getSummary() {
    const total = this.results.length;
    const passed = this.results.filter(r => r.passed).length;
    const failed = total - passed;

    const byCategory = {};
    for (const result of this.results) {
      if (!byCategory[result.category]) {
        byCategory[result.category] = { passed: 0, failed: 0 };
      }
      if (result.passed) {
        byCategory[result.category].passed++;
      } else {
        byCategory[result.category].failed++;
      }
    }

    return {
      total,
      passed,
      failed,
      byCategory,
      allPassed: failed === 0,
      results: this.results
    };
  }

  /**
   * Get latest health check results
   */
  getResults() {
    return {
      summary: this.getSummary(),
      checks: this.results,
      startTime: this.startTime,
      duration: Date.now() - this.startTime
    };
  }
}

/**
 * Initialize default health checks
 */
function createDefaultHealthChecks(db, io) {
  const healthCheck = new HealthCheckSystem(db, io);

  // ==================== Database Health Checks ====================

  healthCheck.registerCheck(
    'Database Connection',
    'database',
    async () => {
      try {
        const result = db.db.prepare('SELECT 1 as test').get();
        return {
          passed: result.test === 1,
          message: 'Database connection successful'
        };
      } catch (error) {
        return {
          passed: false,
          message: `Cannot connect to database: ${error.message}`
        };
      }
    }
  );

  healthCheck.registerCheck(
    'Events Table',
    'database',
    async () => {
      try {
        const result = db.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='events'").get();
        if (!result) {
          return { passed: false, message: 'Events table does not exist' };
        }

        const count = db.db.prepare('SELECT COUNT(*) as count FROM events').get();
        return {
          passed: true,
          message: `Events table exists with ${count.count} records`
        };
      } catch (error) {
        return { passed: false, message: `Events table check failed: ${error.message}` };
      }
    }
  );

  healthCheck.registerCheck(
    'Agent Events Table',
    'database',
    async () => {
      try {
        const result = db.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='agent_events'").get();
        if (!result) {
          return { passed: false, message: 'Agent events table does not exist' };
        }

        const count = db.db.prepare('SELECT COUNT(*) as count FROM agent_events').get();
        return {
          passed: true,
          message: `Agent events table exists with ${count.count} records`
        };
      } catch (error) {
        return { passed: false, message: `Agent events table check failed: ${error.message}` };
      }
    }
  );

  healthCheck.registerCheck(
    'Notifications Table',
    'database',
    async () => {
      try {
        const result = db.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='notifications'").get();
        if (!result) {
          return { passed: false, message: 'Notifications table does not exist' };
        }

        return { passed: true, message: 'Notifications table exists' };
      } catch (error) {
        return { passed: false, message: `Notifications table check failed: ${error.message}` };
      }
    }
  );

  // ==================== Data Integrity Checks ====================

  healthCheck.registerCheck(
    'Dashboard Stats Query',
    'data',
    async () => {
      try {
        const stats = db.getDashboardStats();
        const requiredFields = ['total_events', 'total_files', 'total_agents', 'session_duration_seconds'];
        const missing = requiredFields.filter(field => stats[field] === undefined);

        if (missing.length > 0) {
          return {
            passed: false,
            message: `Dashboard stats missing fields: ${missing.join(', ')}`
          };
        }

        return {
          passed: true,
          message: `Dashboard stats query successful (${stats.total_events} events, ${stats.total_agents} agents)`
        };
      } catch (error) {
        return {
          passed: false,
          message: `Dashboard stats query failed: ${error.message}`
        };
      }
    }
  );

  healthCheck.registerCheck(
    'Recent File Events Query',
    'data',
    async () => {
      try {
        const events = db.getRecentFileEvents(10);
        return {
          passed: true,
          message: `Recent file events query successful (${events.length} events returned)`
        };
      } catch (error) {
        return {
          passed: false,
          message: `Recent file events query failed: ${error.message}`
        };
      }
    }
  );

  healthCheck.registerCheck(
    'Agent Stats Query',
    'data',
    async () => {
      try {
        const stats = db.getAgentStats();
        return {
          passed: true,
          message: `Agent stats query successful (${stats.length} agents)`
        };
      } catch (error) {
        return {
          passed: false,
          message: `Agent stats query failed: ${error.message}`
        };
      }
    }
  );

  // ==================== WebSocket Health Checks ====================

  healthCheck.registerCheck(
    'WebSocket Server',
    'websocket',
    async () => {
      try {
        if (!io) {
          return { passed: false, message: 'WebSocket server (Socket.io) not initialized' };
        }

        const clientCount = io.engine.clientsCount;
        return {
          passed: true,
          message: `WebSocket server running (${clientCount} connected clients)`
        };
      } catch (error) {
        return {
          passed: false,
          message: `WebSocket server check failed: ${error.message}`
        };
      }
    }
  );

  // ==================== System Health Checks ====================

  healthCheck.registerCheck(
    'System Metrics Collection',
    'system',
    async () => {
      try {
        const metrics = db.getRecentSystemMetrics(1);
        if (metrics && metrics.length > 0) {
          const latest = metrics[0];
          const age = Date.now() - new Date(latest.timestamp).getTime();
          const ageMinutes = Math.floor(age / 60000);

          if (ageMinutes > 5) {
            return {
              passed: false,
              message: `Latest system metrics are ${ageMinutes} minutes old - metrics collection may be stalled`
            };
          }

          return {
            passed: true,
            message: `System metrics collection active (latest: ${ageMinutes}m ago)`
          };
        } else {
          return {
            passed: false,
            message: 'No system metrics found - metrics collection may not be running'
          };
        }
      } catch (error) {
        return {
          passed: false,
          message: `System metrics check failed: ${error.message}`
        };
      }
    }
  );

  return healthCheck;
}

/**
 * Register conversation-specific health checks
 * This is called AFTER conversation syncs are started
 */
function registerConversationHealthChecks(healthCheckSystem, db, conversationSyncs) {
  // Check conversation data freshness
  healthCheckSystem.registerCheck(
    'Conversation Data Freshness',
    'conversations',
    async () => {
      try {
        // Query most recent conversation
        const stmt = db.db.prepare(`
          SELECT timestamp, event_type
          FROM conversations
          ORDER BY timestamp DESC
          LIMIT 1
        `);
        const mostRecent = stmt.get();

        if (!mostRecent) {
          // No conversations yet - this is OK for new installations
          return {
            passed: true,
            message: 'No conversations found (new installation)'
          };
        }

        // Check if most recent conversation is within acceptable timeframe
        const conversationTime = new Date(mostRecent.timestamp);
        const now = new Date();
        const hoursSinceLastConversation = (now - conversationTime) / (1000 * 60 * 60);

        // If no conversation in last 24 hours, warn (may indicate sync issue)
        if (hoursSinceLastConversation > 24) {
          return {
            passed: false,
            message: `Stale conversation data (last: ${hoursSinceLastConversation.toFixed(1)}h ago). Sync may not be working.`
          };
        }

        return {
          passed: true,
          message: `Last conversation: ${hoursSinceLastConversation.toFixed(1)}h ago`
        };
      } catch (error) {
        return {
          passed: false,
          message: `Conversation freshness check failed: ${error.message}`
        };
      }
    }
  );

  // Check conversation sync services
  healthCheckSystem.registerCheck(
    'Conversation Sync Services',
    'conversations',
    async () => {
      try {
        const activeCount = conversationSyncs.size;

        if (activeCount === 0) {
          return {
            passed: true,
            message: 'No conversation syncs active (no projects started yet)'
          };
        }

        // Verify syncs are actually running
        let runningCount = 0;
        const statusList = [];
        for (const [projectName, sync] of conversationSyncs.entries()) {
          const status = sync.getStatus();
          if (status.running) {
            runningCount++;
            statusList.push(`${projectName}: running`);
          } else {
            statusList.push(`${projectName}: NOT running`);
          }
        }

        if (runningCount === 0 && activeCount > 0) {
          return {
            passed: false,
            message: `${activeCount} sync(s) registered but none running`
          };
        }

        return {
          passed: true,
          message: `${runningCount}/${activeCount} conversation sync(s) active`
        };
      } catch (error) {
        return {
          passed: false,
          message: `Conversation sync check failed: ${error.message}`
        };
      }
    }
  );
}

export { HealthCheckSystem, createDefaultHealthChecks, registerConversationHealthChecks };
