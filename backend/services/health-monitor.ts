/**
 * Health Monitoring Service
 * Validates all API endpoints, database schema, and system health
 * Provides automated alerts when issues are detected
 */

import { RavenDB } from '../db.js';
import { logger } from '../utils/logger.js';

export interface HealthCheckResult {
  category: string;
  name: string;
  status: 'healthy' | 'warning' | 'critical';
  message: string;
  timestamp: string;
  details?: any;
}

export interface HealthReport {
  overallStatus: 'healthy' | 'degraded' | 'critical';
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

  constructor(db: RavenDB) {
    this.db = db;
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

    // Calculate summary
    const summary = {
      total: checks.length,
      healthy: checks.filter(c => c.status === 'healthy').length,
      warnings: checks.filter(c => c.status === 'warning').length,
      critical: checks.filter(c => c.status === 'critical').length
    };

    // Determine overall status
    let overallStatus: 'healthy' | 'degraded' | 'critical' = 'healthy';
    if (summary.critical > 0) {
      overallStatus = 'critical';
    } else if (summary.warnings > 0) {
      overallStatus = 'degraded';
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
          table: 'metrics',
          requiredColumns: ['id', 'timestamp', 'cpu_percent', 'memory_percent']
        },
        {
          table: 'sessions',
          requiredColumns: ['id', 'session_id', 'start_time']
        }
      ];

      for (const schema of expectedSchemas) {
        try {
          // Get actual columns
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
         FROM metrics
         WHERE timestamp > datetime('now', '-5 minutes')`
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

      if (recentMetrics.avg_memory !== null && recentMetrics.avg_memory > 90) {
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
}
