/**
 * Server Initialization
 *
 * Handles initialization of all services and resources needed for server startup.
 */

import { join } from 'path';
import { logger } from '../utils/logger.js';
import Database from '../db.js';
import HealthCheckSystem from '../health-checks.js';
import TriggerEngine from '../trigger-engine.js';
import MetricsCollector from '../metrics-collector.js';
import DeveloperPersona from '../developer-persona.js';
import SessionTracker from '../services/session-tracker.js';
import { FileWatcherService } from '../services/file-watcher-service.js';
import { ProjectManager } from '../services/project-manager.js';
import { PerformanceMonitor } from '../services/performance-monitor.js';
import { authService } from '../services/auth-service.js';

export class ServerInitializer {
  constructor(options = {}) {
    this.RAVEN_DIR = options.ravenDir || join(process.cwd(), '.raven');
    this.DB_DIR = options.dbDir || join(this.RAVEN_DIR, 'db');
    this.config = options.config || {};

    // Services
    this.projectManager = null;
    this.fileWatcherService = null;
    this.performanceMonitor = null;
    this.metricsCollector = null;
    this.triggerEngine = null;
    this.healthCheckSystem = null;
    this.developerDB = null;
    this.sessionTracker = null;
  }

  /**
   * Initialize all core services
   */
  async initializeServices(io) {
    logger.info('Initializing core services');

    // 1. Initialize Project Manager
    this.projectManager = new ProjectManager({
      ravenDir: this.RAVEN_DIR,
      dbDir: this.DB_DIR
    });

    const projectInitResult = this.projectManager.initializeAllProjects();
    logger.info('Projects initialized', projectInitResult);

    // 2. Initialize Developer Persona DB (global)
    const developerDbPath = join(this.DB_DIR, 'developer-persona.db');
    this.developerDB = new DeveloperPersona(developerDbPath);
    logger.info('Developer persona DB initialized');

    // 3. Initialize Session Tracker
    const sessionDbPath = join(this.DB_DIR, 'sessions.db');
    const sessionDb = new Database(sessionDbPath);
    this.sessionTracker = new SessionTracker(sessionDb);
    logger.info('Session tracker initialized');

    // 4. Initialize Metrics Collector
    this.metricsCollector = new MetricsCollector();
    this.metricsCollector.setIO(io);
    logger.info('Metrics collector initialized');

    // 5. Initialize Trigger Engine
    this.triggerEngine = new TriggerEngine({
      configPath: join(this.RAVEN_DIR, 'config.toml')
    });
    this.triggerEngine.setIO(io);
    logger.info('Trigger engine initialized');

    // 6. Initialize Health Check System
    this.healthCheckSystem = new HealthCheckSystem({
      ravenDir: this.RAVEN_DIR,
      io
    });
    logger.info('Health check system initialized');

    // 7. Initialize Performance Monitor
    this.performanceMonitor = new PerformanceMonitor({ io });
    this.performanceMonitor.start();
    logger.info('Performance monitor started');

    // 8. Initialize File Watcher Service (but don't start watchers yet)
    this.fileWatcherService = new FileWatcherService({
      io,
      projectPaths: this.projectManager.projectPaths,
      debounceMs: this.config.FILE_WATCH_DEBOUNCE_MS || 150
    });
    logger.info('File watcher service initialized');

    return {
      projectManager: this.projectManager,
      fileWatcherService: this.fileWatcherService,
      performanceMonitor: this.performanceMonitor,
      metricsCollector: this.metricsCollector,
      triggerEngine: this.triggerEngine,
      healthCheckSystem: this.healthCheckSystem,
      developerDB: this.developerDB,
      sessionTracker: this.sessionTracker
    };
  }

  /**
   * Start file watchers for all projects
   */
  startFileWatchers(handleFileChange) {
    if (!this.fileWatcherService) {
      throw new Error('File watcher service not initialized');
    }

    this.fileWatcherService.setFileChangeHandler(handleFileChange);
    const result = this.fileWatcherService.initializeAllWatchers();

    logger.info('File watchers started', result);
    return result;
  }

  /**
   * Get all services for dependency injection
   */
  getServices() {
    return {
      projectManager: this.projectManager,
      fileWatcherService: this.fileWatcherService,
      performanceMonitor: this.performanceMonitor,
      metricsCollector: this.metricsCollector,
      triggerEngine: this.triggerEngine,
      healthCheckSystem: this.healthCheckSystem,
      developerDB: this.developerDB,
      sessionTracker: this.sessionTracker,
      authService
    };
  }

  /**
   * Shutdown all services gracefully
   */
  async shutdown() {
    logger.info('Shutting down services');

    const shutdownPromises = [];

    // Stop performance monitor
    if (this.performanceMonitor) {
      this.performanceMonitor.stop();
    }

    // Stop metrics collector
    if (this.metricsCollector) {
      this.metricsCollector.stop();
    }

    // Stop file watchers
    if (this.fileWatcherService) {
      shutdownPromises.push(this.fileWatcherService.stopAllWatchers());
    }

    // Cleanup project manager
    if (this.projectManager) {
      shutdownPromises.push(this.projectManager.cleanup());
    }

    // Close developer DB
    if (this.developerDB) {
      this.developerDB.close();
    }

    await Promise.all(shutdownPromises);
    logger.info('All services shut down');
  }
}

export default ServerInitializer;
