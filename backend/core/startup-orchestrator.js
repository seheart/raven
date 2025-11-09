/**
 * Startup Orchestrator - Professional-grade boot sequence
 * Coordinates all startup phases with verification and retry logic
 */

import { logger } from '../utils/logger.js';
import { runPreflightChecks } from '../utils/preflight.js';
import { withRetry, waitFor, sleep, ProgressReporter } from '../utils/startup.js';

const TOTAL_BOOT_STEPS = 7;

/**
 * Professional startup orchestrator
 * Runs complete boot sequence with verification
 */
export class StartupOrchestrator {
  constructor(config, dependencies) {
    this.config = config;
    this.deps = dependencies;
    this.progress = new ProgressReporter(TOTAL_BOOT_STEPS);
    this.startTime = Date.now();
    this.results = {
      phases: [],
      errors: [],
      warnings: []
    };
  }

  /**
   * Run complete startup sequence
   * @returns {Promise<Object>} Startup results
   */
  async run() {
    try {
      logger.info('🚀 Starting Raven with professional boot sequence');
      logger.info('━'.repeat(60));

      // Phase 1: Pre-flight checks
      await this.phase1_PreflightChecks();

      // Phase 2: Critical services initialization
      await this.phase2_CriticalServices();

      // Phase 3: Data layer initialization
      await this.phase3_DataLayer();

      // Phase 4: Monitoring services
      await this.phase4_MonitoringServices();

      // Phase 5: Non-critical services
      await this.phase5_NonCriticalServices();

      // Phase 6: Health verification
      await this.phase6_HealthVerification();

      // Phase 7: Stabilization and final checks
      await this.phase7_Stabilization();

      this.progress.complete();

      const elapsed = ((Date.now() - this.startTime) / 1000).toFixed(1);

      logger.info('━'.repeat(60));
      logger.info(`🎉 Raven started successfully in ${elapsed}s`);

      return {
        success: true,
        elapsed,
        phases: this.results.phases,
        warnings: this.results.warnings
      };
    } catch (error) {
      this.progress.error('Startup failed', error);

      return {
        success: false,
        error: error.message,
        phase: this.progress.currentStep,
        phases: this.results.phases,
        errors: this.results.errors
      };
    }
  }

  /**
   * Phase 1: Pre-flight checks
   */
  async phase1_PreflightChecks() {
    this.progress.step('Pre-flight checks');

    const preflightResults = await runPreflightChecks(this.config);

    if (!preflightResults.success) {
      throw new Error('Pre-flight checks failed: ' + preflightResults.results.failed.join(', '));
    }

    if (preflightResults.results.warnings.length > 0) {
      this.results.warnings.push(...preflightResults.results.warnings);
    }

    this.results.phases.push({
      name: 'Pre-flight checks',
      status: 'completed',
      checks: preflightResults.summary
    });
  }

  /**
   * Phase 2: Critical services (auth, developer DB)
   */
  async phase2_CriticalServices() {
    this.progress.step('Initializing critical services');

    // Initialize authentication service
    try {
      await withRetry(
        async () => {
          if (this.deps.initializeAuthService) {
            await this.deps.initializeAuthService();
          }
        },
        {
          maxAttempts: 3,
          onRetry: (attempt, max, error) => {
            this.progress.substep(`Auth service retry ${attempt}/${max}: ${error.message}`);
          }
        }
      );
      this.progress.substep('✓ Authentication service ready');
    } catch (error) {
      this.progress.substep('⚠ Authentication service failed (non-critical)');
      this.results.warnings.push('Auth service initialization failed');
    }

    // Initialize developer database
    try {
      await withRetry(
        async () => {
          if (this.deps.initializeDeveloperDB) {
            await this.deps.initializeDeveloperDB();
          }
        },
        {
          maxAttempts: 3,
          onRetry: (attempt, max, error) => {
            this.progress.substep(`Developer DB retry ${attempt}/${max}: ${error.message}`);
          }
        }
      );
      this.progress.substep('✓ Developer database ready');
    } catch (error) {
      this.progress.substep('⚠ Developer database failed (non-critical)');
      this.results.warnings.push('Developer DB initialization failed');
    }

    this.results.phases.push({
      name: 'Critical services',
      status: 'completed'
    });
  }

  /**
   * Phase 3: Data layer (project databases)
   */
  async phase3_DataLayer() {
    this.progress.step('Loading project databases');

    const initResult = await withRetry(
      async () => {
        return await this.deps.initializeAllProjects();
      },
      {
        maxAttempts: 3,
        onRetry: (attempt, max, error) => {
          this.progress.substep(`Database initialization retry ${attempt}/${max}`);
        }
      }
    );

    if (initResult.successCount === 0) {
      throw new Error('No project databases loaded successfully');
    }

    this.progress.substep(`✓ Loaded ${initResult.successCount} projects`);

    if (initResult.failCount > 0) {
      this.progress.substep(`⚠ ${initResult.failCount} projects failed to load`);
      this.results.warnings.push(`${initResult.failCount} projects failed`);
    }

    this.results.phases.push({
      name: 'Data layer',
      status: 'completed',
      projects: {
        loaded: initResult.successCount,
        failed: initResult.failCount
      }
    });
  }

  /**
   * Phase 4: Monitoring services (metrics, health checks)
   */
  async phase4_MonitoringServices() {
    this.progress.step('Starting monitoring services');

    // Start metrics collection
    const metricsStarted = await withRetry(
      async () => {
        return await this.deps.startMetricsCollection();
      },
      {
        maxAttempts: 3,
        onRetry: (attempt, max, error) => {
          this.progress.substep(`Metrics collection retry ${attempt}/${max}`);
        }
      }
    );

    if (!metricsStarted) {
      throw new Error('Failed to start metrics collection');
    }

    this.progress.substep('✓ Metrics collection started');

    // Wait for first metrics to be collected (verify it's actually working)
    this.progress.substep('Waiting for first metrics...');

    const metricsWorking = await waitFor(async () => await this.deps.verifyMetricsCollecting(), {
      timeout: 5000,
      interval: 200,
      timeoutMessage: 'Metrics collection verification timeout'
    });

    if (metricsWorking) {
      this.progress.substep('✓ Metrics collection verified');
    }

    // Initialize health check system
    await this.deps.initializeHealthChecks();
    this.progress.substep('✓ Health check system initialized');

    this.results.phases.push({
      name: 'Monitoring services',
      status: 'completed'
    });
  }

  /**
   * Phase 5: Non-critical services (file watchers, triggers, bridge)
   */
  async phase5_NonCriticalServices() {
    this.progress.step('Initializing non-critical services');

    // File watchers
    try {
      const watcherResult = await this.deps.initializeAllWatchers();
      this.progress.substep(`✓ File watchers: ${watcherResult.successCount} active`);

      if (watcherResult.failCount > 0) {
        this.results.warnings.push(`${watcherResult.failCount} watchers failed`);
      }
    } catch (error) {
      this.progress.substep('⚠ File watchers failed (non-critical)');
      this.results.warnings.push('File watchers initialization failed');
    }

    // Trigger engine
    try {
      await this.deps.initializeTriggerEngine();
      this.progress.substep('✓ Trigger engine initialized');
    } catch (error) {
      this.progress.substep('⚠ Trigger engine failed (non-critical)');
      this.results.warnings.push('Trigger engine initialization failed');
    }

    // Telemetry bridge (with retry)
    try {
      const bridgeStarted = await withRetry(async () => await this.deps.startTelemetryBridge(), {
        maxAttempts: 3,
        initialDelay: 500,
        onRetry: (attempt, max) => {
          this.progress.substep(`Telemetry bridge retry ${attempt}/${max}`);
        }
      });

      if (bridgeStarted) {
        this.progress.substep('✓ Telemetry bridge active');
      }
    } catch (error) {
      this.progress.substep('⚠ Telemetry bridge failed (non-critical)');
      this.results.warnings.push('Telemetry bridge start failed');
    }

    this.results.phases.push({
      name: 'Non-critical services',
      status: 'completed'
    });
  }

  /**
   * Phase 6: Health verification
   */
  async phase6_HealthVerification() {
    this.progress.step('Running health verification');

    // Run all health checks and wait for completion
    const healthResult = await this.deps.runHealthChecks();

    if (!healthResult.allPassed) {
      const failedChecks = healthResult.checks.filter(c => !c.passed);
      this.progress.substep(`⚠ ${failedChecks.length} health checks failed:`);

      for (const check of failedChecks) {
        this.progress.substep(`  ✗ ${check.name}: ${check.message}`);
        this.results.warnings.push(`Health check failed: ${check.name}`);
      }
    } else {
      this.progress.substep(`✓ All ${healthResult.total} health checks passed`);
    }

    // Verify WebSocket
    const wsWorking = await this.deps.verifyWebSocket();
    if (wsWorking) {
      this.progress.substep('✓ WebSocket server verified');
    } else {
      this.progress.substep('⚠ WebSocket verification failed');
      this.results.warnings.push('WebSocket verification failed');
    }

    this.results.phases.push({
      name: 'Health verification',
      status: 'completed',
      healthChecks: {
        total: healthResult.total,
        passed: healthResult.passed,
        failed: healthResult.failed
      }
    });
  }

  /**
   * Phase 7: Stabilization period
   */
  async phase7_Stabilization() {
    this.progress.step('System stabilization');

    // Brief wait for everything to settle (reduced for faster startup)
    await sleep(500);

    // Re-run quick health check
    const finalHealth = await this.deps.runHealthChecks();

    this.progress.substep('✓ Final health check complete');
    this.progress.substep(`  ${finalHealth.passed}/${finalHealth.total} checks passing`);

    // Get final system stats
    const stats = await this.deps.getSystemStats();

    this.progress.substep(`  ${stats.projects} projects monitored`);
    this.progress.substep(`  ${stats.watchers} file watchers active`);
    this.progress.substep(`  ${stats.wsClients} WebSocket clients connected`);

    this.results.phases.push({
      name: 'Stabilization',
      status: 'completed',
      finalStats: stats
    });
  }
}
