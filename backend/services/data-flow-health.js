/**
 * Data Flow Health Monitor
 * Automatically checks if frontend pages have working data flows
 * Prevents "dead pages" by validating API endpoints and WebSocket events
 */

import { logger } from '../utils/logger.js';

export class DataFlowHealthMonitor {
  constructor(app, io) {
    this.app = app;
    this.io = io;

    // Define expected data flows for each page
    this.pageDataFlows = {
      '/about': {
        endpoints: ['/api/session-id'],
        websocket_events: ['connect', 'disconnect'],
        status: 'unknown'
      },
      '/changelog': {
        endpoints: ['/api/changelog'],
        websocket_events: [],
        status: 'unknown'
      },
      '/docs': {
        endpoints: ['/api/docs/list', '/api/docs/:filepath'],
        websocket_events: [],
        status: 'unknown'
      },
      '/analysis/developer-insights': {
        endpoints: [
          '/api/developer/stats',
          '/api/developer/interactions',
          '/api/developer/patterns'
        ],
        websocket_events: [],
        status: 'unknown'
      },
      '/analysis/triggers': {
        endpoints: ['/api/triggers-config', '/api/triggered-events', '/api/trigger-stats'],
        websocket_events: ['trigger-fired', 'trigger-stats'],
        status: 'unknown'
      },
      '/system/status': {
        endpoints: [
          '/api/health',
          '/api/git/status',
          '/api/git/branches',
          '/api/git/history',
          '/api/health-checks'
        ],
        websocket_events: ['connect', 'disconnect'],
        status: 'unknown'
      },
      '/system/notifications': {
        endpoints: ['/api/notifications', '/api/notifications/stats'],
        websocket_events: ['notification', 'error-logged', 'trigger-fired'],
        status: 'unknown'
      },
      '/system/api-health': {
        endpoints: ['/api/endpoints'],
        websocket_events: [
          'file-changed',
          'agent-event',
          'project-switched',
          'system-metrics',
          'trigger-fired'
        ],
        status: 'unknown'
      },
      '/system/server-sync': {
        endpoints: [
          '/api/sync/config',
          '/api/sync/test',
          '/api/sync/trigger',
          '/api/sync/remote-stats'
        ],
        websocket_events: [],
        status: 'unknown'
      },
      '/projects/comparison': {
        endpoints: ['/api/projects', '/api/file-events'],
        websocket_events: [],
        status: 'unknown'
      },
      '/activity/search': {
        endpoints: ['/api/all-agent-events', '/api/tracked-files'],
        websocket_events: [],
        status: 'unknown'
      }
    };

    // Track available endpoints by inspecting Express router
    this.availableEndpoints = new Set();
    this.updateAvailableEndpoints();
  }

  /**
   * Update list of available endpoints from Express app
   */
  updateAvailableEndpoints() {
    this.availableEndpoints.clear();

    // Extract all registered routes from Express
    const routes = [];
    this.app._router.stack.forEach(middleware => {
      if (middleware.route) {
        // Routes registered directly on the app
        routes.push(middleware.route.path);
      } else if (middleware.name === 'router') {
        // Router middleware
        middleware.handle.stack.forEach(handler => {
          if (handler.route) {
            routes.push(handler.route.path);
          }
        });
      }
    });

    routes.forEach(route => this.availableEndpoints.add(route));
    logger.info(`Data Flow Monitor: Found ${routes.length} registered endpoints`);
  }

  /**
   * Check if an endpoint exists (accounting for parameters)
   */
  endpointExists(endpoint) {
    // Direct match
    if (this.availableEndpoints.has(endpoint)) {
      return true;
    }

    // Check for parameterized routes
    // e.g., /api/docs/:filepath matches /api/docs/README.md
    const parts = endpoint.split('/');
    for (const registeredRoute of this.availableEndpoints) {
      const routeParts = registeredRoute.split('/');

      if (parts.length !== routeParts.length) continue;

      const matches = parts.every((part, i) => {
        return part === routeParts[i] || routeParts[i].startsWith(':');
      });

      if (matches) return true;
    }

    return false;
  }

  /**
   * Check health of a specific page
   */
  checkPageHealth(pagePath) {
    const pageData = this.pageDataFlows[pagePath];
    if (!pageData) {
      return {
        page: pagePath,
        status: 'unknown',
        error: 'Page not registered in health monitor'
      };
    }

    const missingEndpoints = [];
    const workingEndpoints = [];

    // Check each endpoint
    pageData.endpoints.forEach(endpoint => {
      if (this.endpointExists(endpoint)) {
        workingEndpoints.push(endpoint);
      } else {
        missingEndpoints.push(endpoint);
      }
    });

    // Determine overall status
    let status = 'healthy';
    if (missingEndpoints.length === pageData.endpoints.length) {
      status = 'dead'; // All endpoints missing
    } else if (missingEndpoints.length > 0) {
      status = 'degraded'; // Some endpoints missing
    }

    // Check WebSocket events (we can't verify they're emitted, just track expected)
    const websocketStatus = pageData.websocket_events.length > 0 ? 'expected' : 'none';

    return {
      page: pagePath,
      status,
      endpoints: {
        total: pageData.endpoints.length,
        working: workingEndpoints.length,
        missing: missingEndpoints.length,
        missing_list: missingEndpoints
      },
      websocket: {
        status: websocketStatus,
        expected_events: pageData.websocket_events
      }
    };
  }

  /**
   * Run comprehensive health check on all pages
   */
  runFullHealthCheck() {
    this.updateAvailableEndpoints();

    const results = {
      timestamp: new Date().toISOString(),
      total_pages: Object.keys(this.pageDataFlows).length,
      healthy: 0,
      degraded: 0,
      dead: 0,
      unknown: 0,
      pages: {}
    };

    // Check each page
    Object.keys(this.pageDataFlows).forEach(pagePath => {
      const health = this.checkPageHealth(pagePath);
      results.pages[pagePath] = health;

      // Update counts
      if (health.status === 'healthy') results.healthy++;
      else if (health.status === 'degraded') results.degraded++;
      else if (health.status === 'dead') results.dead++;
      else results.unknown++;
    });

    // Calculate overall health score
    results.health_score = Math.round((results.healthy / results.total_pages) * 100);

    // Identify critical issues
    results.critical_issues = [];
    Object.entries(results.pages).forEach(([page, health]) => {
      if (health.status === 'dead') {
        results.critical_issues.push({
          page,
          issue: 'All endpoints missing',
          missing_endpoints: health.endpoints.missing_list
        });
      }
    });

    // Emit health check result via WebSocket
    this.io.emit('data-flow-health', {
      health_score: results.health_score,
      healthy: results.healthy,
      degraded: results.degraded,
      dead: results.dead,
      critical_count: results.critical_issues.length
    });

    return results;
  }

  /**
   * Get detailed endpoint analysis
   */
  getEndpointCoverage() {
    const allExpectedEndpoints = new Set();
    const usedEndpoints = new Set();

    // Collect all expected endpoints
    Object.values(this.pageDataFlows).forEach(pageData => {
      pageData.endpoints.forEach(endpoint => {
        allExpectedEndpoints.add(endpoint);
        if (this.endpointExists(endpoint)) {
          usedEndpoints.add(endpoint);
        }
      });
    });

    // Find unused registered endpoints
    const unusedEndpoints = [];
    this.availableEndpoints.forEach(endpoint => {
      if (!usedEndpoints.has(endpoint) && endpoint.startsWith('/api/')) {
        unusedEndpoints.push(endpoint);
      }
    });

    return {
      total_registered: this.availableEndpoints.size,
      total_expected: allExpectedEndpoints.size,
      used: usedEndpoints.size,
      unused: unusedEndpoints.length,
      unused_endpoints: unusedEndpoints.slice(0, 20), // Limit to 20
      coverage_percentage: Math.round((usedEndpoints.size / this.availableEndpoints.size) * 100)
    };
  }

  /**
   * Register a new page for monitoring
   */
  registerPage(pagePath, endpoints, websocketEvents = []) {
    this.pageDataFlows[pagePath] = {
      endpoints,
      websocket_events: websocketEvents,
      status: 'unknown'
    };

    logger.info(`Registered page for health monitoring: ${pagePath}`);
  }

  /**
   * Start periodic health checks (optional)
   */
  startPeriodicChecks(intervalMinutes = 60) {
    setInterval(
      () => {
        logger.info('Running periodic data flow health check...');
        const results = this.runFullHealthCheck();

        if (results.dead > 0 || results.degraded > 0) {
          logger.warn(
            `Data flow health issues detected: ${results.dead} dead, ${results.degraded} degraded pages`
          );
        } else {
          logger.info(
            `Data flow health check passed: ${results.healthy}/${results.total_pages} pages healthy`
          );
        }
      },
      intervalMinutes * 60 * 1000
    );

    logger.info(`Started periodic health checks (every ${intervalMinutes} minutes)`);
  }
}
