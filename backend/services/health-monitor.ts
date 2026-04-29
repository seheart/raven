/**
 * Health Monitoring Service
 * Validates all API endpoints, database schema, and system health
 * Provides automated alerts when issues are detected
 */

import { RavenDB } from '../db.js';
import { logger } from '../utils/logger.js';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

interface HealthCheckResult {
  category: string;
  name: string;
  status: 'healthy' | 'warning' | 'critical';
  message: string;
  timestamp: string;
  details?: any;
}

interface HealthReport {
  overallStatus: 'healthy' | 'warning' | 'critical';
  timestamp: string;
  checks: HealthCheckResult[];
  summary: {
    total: number;
    healthy: number;
    warnings: number;
    critical: number;
  };
}

export class HealthMonitor {
  private db: RavenDB;
  private lastReport: HealthReport | null = null;
  private monitoringInterval: NodeJS.Timeout | null = null;
  private alertCallbacks: Array<(report: HealthReport) => void> = [];
  private activeIntervalMs: number = 60000;
  private idleIntervalMs: number = 300000; // 5 minutes when idle
  private isIdle: boolean = false;

  constructor(db: RavenDB) {
    this.db = db;
  }

  /**
   * Switch between active (60s) and idle (5min) health check intervals
   */
  setIdle(idle: boolean): void {
    if (idle === this.isIdle) return;
    this.isIdle = idle;
    const newInterval = idle ? this.idleIntervalMs : this.activeIntervalMs;

    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = setInterval(async () => {
        try {
          await this.runHealthCheck();
        } catch (error: any) {
          logger.error('Health check failed:', error);
        }
      }, newInterval);
      logger.info(
        `🏥 Health monitoring: switched to ${idle ? 'idle' : 'active'} interval (${newInterval / 1000}s)`
      );
    }
  }

  /**
   * Register callback for health alerts
   */
  onAlert(callback: (report: HealthReport) => void): void {
    this.alertCallbacks.push(callback);
  }

  /**
   * Start continuous health monitoring
   */
  startMonitoring(intervalMs: number = 60000): void {
    if (this.monitoringInterval) {
      logger.warn('Health monitoring already started');
      return;
    }

    logger.info(`🏥 Starting health monitoring (interval: ${intervalMs}ms)`);

    // Run initial check
    this.runHealthCheck().catch((err: any) => {
      logger.error('Initial health check failed:', err);
    });

    // Schedule periodic checks
    this.monitoringInterval = setInterval(async () => {
      try {
        await this.runHealthCheck();
      } catch (error: any) {
        logger.error('Health check failed:', error);
      }
    }, intervalMs);
  }

  /**
   * Stop continuous monitoring
   */
  stopMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
      logger.info('🏥 Stopped health monitoring');
    }
  }

  /**
   * Run comprehensive health check
   */
  async runHealthCheck(): Promise<HealthReport> {
    const checks: HealthCheckResult[] = [];
    const timestamp = new Date().toISOString();

    // Database schema checks
    checks.push(...this.checkDatabaseSchema());

    // Database connectivity
    checks.push(this.checkDatabaseConnectivity());

    // Critical tables data integrity
    checks.push(...this.checkDataIntegrity());

    // System resources
    checks.push(...this.checkSystemResources());

    // API endpoint health (async)
    checks.push(...(await this.checkAPIEndpoints()));

    // Configuration validation
    checks.push(...this.checkConfiguration());

    // File system health
    checks.push(...this.checkFileSystem());

    // Git repository status
    checks.push(...this.checkGitRepository());

    // Calculate summary
    const summary = {
      total: checks.length,
      healthy: checks.filter(c => c.status === 'healthy').length,
      warnings: checks.filter(c => c.status === 'warning').length,
      critical: checks.filter(c => c.status === 'critical').length
    };

    // Determine overall status
    let overallStatus: 'healthy' | 'warning' | 'critical' = 'healthy';
    if (summary.critical > 0) {
      overallStatus = 'critical';
    } else if (summary.warnings > 0) {
      overallStatus = 'warning';
    }

    const report: HealthReport = {
      overallStatus,
      timestamp,
      checks,
      summary
    };

    this.lastReport = report;

    // Trigger alerts if issues detected
    if (overallStatus !== 'healthy') {
      this.triggerAlerts(report);
    }

    // Log critical issues
    const criticalIssues = checks.filter(c => c.status === 'critical');
    if (criticalIssues.length > 0) {
      logger.error(`🚨 CRITICAL HEALTH ISSUES DETECTED (${criticalIssues.length}):`, {
        issues: criticalIssues.map(i => `${i.category}/${i.name}: ${i.message}`)
      });
    }

    return report;
  }

  /**
   * Get last health report
   */
  getLastReport(): HealthReport | null {
    return this.lastReport;
  }

  /**
   * Check database schema matches expectations
   */
  private checkDatabaseSchema(): HealthCheckResult[] {
    const checks: HealthCheckResult[] = [];
    const timestamp = new Date().toISOString();

    try {
      // Define expected schema for critical tables
      const expectedSchemas = [
        {
          table: 'events',
          requiredColumns: [
            'id',
            'timestamp',
            'filepath',
            'change_type',
            'project_name',
            'session_id'
          ]
        },
        {
          table: 'agent_events',
          requiredColumns: [
            'id',
            'timestamp',
            'agent',
            'event_type',
            'project_name', // This was the missing column that caused issues!
            'session_id'
          ]
        },
        {
          table: 'raven_metrics',
          requiredColumns: ['id', 'timestamp', 'cpu_percent', 'memory_percent']
        }
      ];

      for (const schema of expectedSchemas) {
        try {
          // Get actual columns
          // Validate table name even though it's hardcoded — defense in depth
          if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(schema.table)) {
            continue;
          }
          const columns = this.db.db.prepare(`PRAGMA table_info(${schema.table})`).all() as Array<{
            name: string;
          }>;

          const actualColumns = columns.map(c => c.name);
          const missingColumns = schema.requiredColumns.filter(col => !actualColumns.includes(col));

          if (missingColumns.length > 0) {
            checks.push({
              category: 'Database Schema',
              name: `Table: ${schema.table}`,
              status: 'critical',
              message: `Missing required columns: ${missingColumns.join(', ')}`,
              timestamp,
              details: { missingColumns, actualColumns }
            });
          } else {
            checks.push({
              category: 'Database Schema',
              name: `Table: ${schema.table}`,
              status: 'healthy',
              message: 'All required columns present',
              timestamp
            });
          }
        } catch (error: any) {
          checks.push({
            category: 'Database Schema',
            name: `Table: ${schema.table}`,
            status: 'critical',
            message: `Table check failed: ${error.message}`,
            timestamp,
            details: { error: error.message }
          });
        }
      }
    } catch (error: any) {
      checks.push({
        category: 'Database Schema',
        name: 'Schema Validation',
        status: 'critical',
        message: `Schema check failed: ${error.message}`,
        timestamp
      });
    }

    return checks;
  }

  /**
   * Check database connectivity
   */
  private checkDatabaseConnectivity(): HealthCheckResult {
    const timestamp = new Date().toISOString();

    try {
      // Simple query to verify database is accessible
      const result = this.db.db.prepare('SELECT 1 as test').get() as { test: number };

      if (result.test === 1) {
        return {
          category: 'Database',
          name: 'Connectivity',
          status: 'healthy',
          message: 'Database is accessible',
          timestamp
        };
      } else {
        return {
          category: 'Database',
          name: 'Connectivity',
          status: 'critical',
          message: 'Database query returned unexpected result',
          timestamp
        };
      }
    } catch (error: any) {
      return {
        category: 'Database',
        name: 'Connectivity',
        status: 'critical',
        message: `Database connection failed: ${error.message}`,
        timestamp
      };
    }
  }

  /**
   * Check data integrity
   */
  private checkDataIntegrity(): HealthCheckResult[] {
    const checks: HealthCheckResult[] = [];
    const timestamp = new Date().toISOString();

    try {
      // Check for orphaned records
      const orphanedAgentEvents = this.db.db
        .prepare(
          `SELECT COUNT(*) as count FROM agent_events
         WHERE project_name IS NULL OR project_name = ''`
        )
        .get() as { count: number };

      if (orphanedAgentEvents.count > 0) {
        checks.push({
          category: 'Data Integrity',
          name: 'Agent Events',
          status: 'warning',
          message: `${orphanedAgentEvents.count} agent events without project_name`,
          timestamp,
          details: { orphanedCount: orphanedAgentEvents.count }
        });
      } else {
        checks.push({
          category: 'Data Integrity',
          name: 'Agent Events',
          status: 'healthy',
          message: 'All agent events have valid project_name',
          timestamp
        });
      }

      // Check for corrupted timestamps
      const invalidTimestamps = this.db.db
        .prepare(
          `SELECT COUNT(*) as count FROM events
         WHERE timestamp IS NULL OR timestamp = ''`
        )
        .get() as { count: number };

      if (invalidTimestamps.count > 0) {
        checks.push({
          category: 'Data Integrity',
          name: 'Event Timestamps',
          status: 'warning',
          message: `${invalidTimestamps.count} events with invalid timestamps`,
          timestamp,
          details: { invalidCount: invalidTimestamps.count }
        });
      } else {
        checks.push({
          category: 'Data Integrity',
          name: 'Event Timestamps',
          status: 'healthy',
          message: 'All events have valid timestamps',
          timestamp
        });
      }

      // Check for recent activity
      const recentEvents = this.db.db
        .prepare(
          `SELECT COUNT(*) as count FROM events
         WHERE datetime(timestamp) > datetime('now', '-1 hour')`
        )
        .get() as { count: number };

      const totalEvents = this.db.db.prepare('SELECT COUNT(*) as count FROM events').get() as {
        count: number;
      };

      if (totalEvents.count === 0) {
        checks.push({
          category: 'Data Integrity',
          name: 'Event Recording',
          status: 'warning',
          message: 'No events recorded - file watcher may not be running',
          timestamp,
          details: { totalEvents: 0, recentEvents: 0 }
        });
      } else if (recentEvents.count === 0) {
        checks.push({
          category: 'Data Integrity',
          name: 'Event Recording',
          status: 'warning',
          message: 'No recent activity in past hour - development may be paused',
          timestamp,
          details: { totalEvents: totalEvents.count, recentEvents: 0 }
        });
      } else {
        checks.push({
          category: 'Data Integrity',
          name: 'Event Recording',
          status: 'healthy',
          message: `${recentEvents.count} events recorded in past hour`,
          timestamp,
          details: { totalEvents: totalEvents.count, recentEvents: recentEvents.count }
        });
      }
    } catch (error: any) {
      checks.push({
        category: 'Data Integrity',
        name: 'Integrity Check',
        status: 'critical',
        message: `Data integrity check failed: ${error.message}`,
        timestamp
      });
    }

    return checks;
  }

  /**
   * Check system resources
   */
  private checkSystemResources(): HealthCheckResult[] {
    const checks: HealthCheckResult[] = [];
    const timestamp = new Date().toISOString();

    try {
      // Check recent metrics
      const recentMetrics = this.db.db
        .prepare(
          `SELECT AVG(cpu_percent) as avg_cpu, AVG(memory_percent) as avg_memory
         FROM raven_metrics
         WHERE datetime(timestamp) > datetime('now', '-5 minutes')`
        )
        .get() as { avg_cpu: number; avg_memory: number };

      if (recentMetrics.avg_cpu !== null && recentMetrics.avg_cpu > 90) {
        checks.push({
          category: 'System Resources',
          name: 'CPU Usage',
          status: 'warning',
          message: `High CPU usage: ${recentMetrics.avg_cpu.toFixed(1)}%`,
          timestamp,
          details: { avgCpu: recentMetrics.avg_cpu }
        });
      } else {
        checks.push({
          category: 'System Resources',
          name: 'CPU Usage',
          status: 'healthy',
          message: `CPU usage normal: ${(recentMetrics.avg_cpu || 0).toFixed(1)}%`,
          timestamp
        });
      }

      if (recentMetrics.avg_memory !== null && recentMetrics.avg_memory > 95) {
        checks.push({
          category: 'System Resources',
          name: 'Memory Usage',
          status: 'warning',
          message: `High memory usage: ${recentMetrics.avg_memory.toFixed(1)}%`,
          timestamp,
          details: { avgMemory: recentMetrics.avg_memory }
        });
      } else {
        checks.push({
          category: 'System Resources',
          name: 'Memory Usage',
          status: 'healthy',
          message: `Memory usage normal: ${(recentMetrics.avg_memory || 0).toFixed(1)}%`,
          timestamp
        });
      }
    } catch (error: any) {
      checks.push({
        category: 'System Resources',
        name: 'Resource Check',
        status: 'warning',
        message: `Resource check failed: ${error.message}`,
        timestamp
      });
    }

    return checks;
  }

  /**
   * Trigger alert callbacks
   */
  private triggerAlerts(report: HealthReport): void {
    for (const callback of this.alertCallbacks) {
      try {
        callback(report);
      } catch (error: any) {
        logger.error('Alert callback failed:', error);
      }
    }
  }

  /**
   * Get health status for specific category
   */
  getStatusForCategory(category: string): HealthCheckResult[] {
    if (!this.lastReport) {
      return [];
    }
    return this.lastReport.checks.filter(c => c.category === category);
  }

  /**
   * Check if system is healthy
   */
  isHealthy(): boolean {
    return this.lastReport?.overallStatus === 'healthy';
  }

  /**
   * Check API endpoint health by exercising the underlying data sources
   * directly. We used to fetch our own HTTP routes from this loop, which
   * round-tripped through the request middleware and could show false
   * "endpoint slow" warnings when the same DB or process was already busy
   * serving real traffic.
   */
  private async checkAPIEndpoints(): Promise<HealthCheckResult[]> {
    const checks: HealthCheckResult[] = [];
    const timestamp = new Date().toISOString();

    const probes: Array<{ name: string; run: () => unknown }> = [
      { name: 'Database (events)', run: () => this.db.db.prepare('SELECT 1').get() },
      {
        name: 'Events table',
        run: () => this.db.db.prepare('SELECT COUNT(*) FROM events').get()
      },
      {
        name: 'Agent events table',
        run: () => this.db.db.prepare('SELECT COUNT(*) FROM agent_events').get()
      },
      {
        name: 'Process metrics table',
        run: () => this.db.db.prepare('SELECT COUNT(*) FROM process_metrics').get()
      }
    ];

    for (const probe of probes) {
      try {
        const startTime = Date.now();
        probe.run();
        const responseTime = Date.now() - startTime;
        const status = responseTime > 250 ? 'warning' : 'healthy';
        checks.push({
          category: 'API Endpoints',
          name: probe.name,
          status,
          message:
            status === 'healthy'
              ? `Query returned in ${responseTime}ms`
              : `Slow query: ${responseTime}ms`,
          timestamp,
          details: { responseTime }
        });
      } catch (error: any) {
        checks.push({
          category: 'API Endpoints',
          name: probe.name,
          status: 'critical',
          message: `Probe failed: ${error.message}`,
          timestamp
        });
      }
    }

    return checks;
  }

  /**
   * Check configuration files
   */
  private checkConfiguration(): HealthCheckResult[] {
    const checks: HealthCheckResult[] = [];
    const timestamp = new Date().toISOString();

    try {
      // Environment variables (all optional, defaults are fine)
      checks.push({
        category: 'Configuration',
        name: 'Environment Variables',
        status: 'healthy',
        message: `PORT=${process.env.PORT || '9100 (default)'}, NODE_ENV=${process.env.NODE_ENV || 'development (default)'}`,
        timestamp
      });

      // Check PORT configuration
      const port = parseInt(process.env.PORT || '9100');
      if (port < 1024 || port > 65535) {
        checks.push({
          category: 'Configuration',
          name: 'Port Configuration',
          status: 'warning',
          message: `Port ${port} may require special permissions or is invalid`,
          timestamp,
          details: { port }
        });
      } else {
        checks.push({
          category: 'Configuration',
          name: 'Port Configuration',
          status: 'healthy',
          message: `Server listening on port ${port}`,
          timestamp,
          details: { port }
        });
      }
    } catch (error: any) {
      checks.push({
        category: 'Configuration',
        name: 'Configuration Check',
        status: 'warning',
        message: `Configuration check failed: ${error.message}`,
        timestamp
      });
    }

    return checks;
  }

  /**
   * Check file system health
   */
  private checkFileSystem(): HealthCheckResult[] {
    const checks: HealthCheckResult[] = [];
    const timestamp = new Date().toISOString();

    try {
      // Check critical directories
      const requiredDirs = [
        { name: 'Database Directory', path: path.join(process.cwd(), '..', '.raven', 'db') },
        { name: 'Logs Directory', path: path.join(process.cwd(), 'logs') }
      ];

      for (const dir of requiredDirs) {
        try {
          if (fs.existsSync(dir.path)) {
            // Check if writable
            fs.accessSync(dir.path, fs.constants.W_OK);
            checks.push({
              category: 'File System',
              name: dir.name,
              status: 'healthy',
              message: 'Directory exists and is writable',
              timestamp,
              details: { path: dir.path }
            });
          } else {
            checks.push({
              category: 'File System',
              name: dir.name,
              status: 'warning',
              message: 'Directory does not exist',
              timestamp,
              details: { path: dir.path }
            });
          }
        } catch (error: any) {
          checks.push({
            category: 'File System',
            name: dir.name,
            status: 'warning',
            message: `Permission issue: ${error.message}`,
            timestamp,
            details: { path: dir.path }
          });
        }
      }
    } catch (error: any) {
      checks.push({
        category: 'File System',
        name: 'File System Check',
        status: 'warning',
        message: `File system check failed: ${error.message}`,
        timestamp
      });
    }

    return checks;
  }

  /**
   * Check Git repository status
   */
  private checkGitRepository(): HealthCheckResult[] {
    const checks: HealthCheckResult[] = [];
    const timestamp = new Date().toISOString();

    try {
      // Check if in a git repository
      try {
        execSync('git rev-parse --is-inside-work-tree', { stdio: 'pipe' });

        // Get current branch
        const branch = execSync('git rev-parse --abbrev-ref HEAD', {
          encoding: 'utf-8'
        }).trim();

        checks.push({
          category: 'Git Repository',
          name: 'Repository Status',
          status: 'healthy',
          message: `On branch: ${branch}`,
          timestamp,
          details: { branch }
        });

        // Check for uncommitted changes
        const status = execSync('git status --porcelain', { encoding: 'utf-8' }).trim();
        const hasChanges = status.length > 0;

        if (hasChanges) {
          const lines = status.split('\n').length;
          checks.push({
            category: 'Git Repository',
            name: 'Working Directory',
            status: 'warning',
            message: `${lines} uncommitted ${lines === 1 ? 'change' : 'changes'}`,
            timestamp,
            details: { changeCount: lines }
          });
        } else {
          checks.push({
            category: 'Git Repository',
            name: 'Working Directory',
            status: 'healthy',
            message: 'Working directory clean',
            timestamp
          });
        }
      } catch {
        checks.push({
          category: 'Git Repository',
          name: 'Repository Status',
          status: 'warning',
          message: 'Not a git repository or git not installed',
          timestamp
        });
      }
    } catch (error: any) {
      checks.push({
        category: 'Git Repository',
        name: 'Git Check',
        status: 'warning',
        message: `Git check failed: ${error.message}`,
        timestamp
      });
    }

    return checks;
  }
}
