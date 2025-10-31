/**
 * ServerBootstrap - Professional server initialization and lifecycle management
 * 
 * Provides:
 * - Dependency injection
 * - Service initialization
 * - Graceful startup/shutdown
 * - Health checks
 * - Error recovery
 */

import express from 'express';
import { createServer } from 'http';
import { Server as SocketIO } from 'socket.io';
import cors from 'cors';
import compression from 'compression';
import { logger } from '../utils/logger.js';
import { serverConfig, validateConfig } from '../config/server-config.js';
import { setupHelmet, apiLimiter } from '../middleware/security.js';
import { errorHandler, notFoundHandler } from '../middleware/error-handler.js';

/**
 * @typedef {Object} ServerServices
 * @property {import('../db.js').RavenDB} db - Database instance
 * @property {import('../developer-db.js').default} developerDB - Developer database
 * @property {Object} authService - Authentication service
 * @property {Map} projectDatabases - Project databases
 * @property {Map} projectWatchers - File watchers
 * @property {Object} metricsCollector - Metrics collector
 * @property {Object} triggerEngine - Trigger engine
 * @property {Object} healthCheckSystem - Health check system
 */

/**
 * ServerBootstrap - Orchestrates server initialization
 */
export class ServerBootstrap {
  /**
   * Create a new ServerBootstrap instance
   * @param {Object} [options] - Bootstrap options
   * @param {Object} [options.config] - Server configuration override
   * @param {boolean} [options.validateConfig=true] - Validate configuration on start
   */
  constructor(options = {}) {
    this.config = options.config || serverConfig;
    this.validateConfig = options.validateConfig !== false;
    
    // Express app
    this.app = express();
    
    // HTTP server
    this.httpServer = createServer(this.app);
    
    // Socket.IO
    this.io = new SocketIO(this.httpServer, {
      pingTimeout: this.config.websocket.pingTimeout,
      pingInterval: this.config.websocket.pingInterval,
      cors: this.config.websocket.cors,
      transports: this.config.websocket.transports
    });
    
    // Services container
    /** @type {ServerServices} */
    this.services = {};
    
    // Lifecycle state
    this.isStarted = false;
    this.isShuttingDown = false;
    
    logger.info('ServerBootstrap initialized', {
      nodeEnv: this.config.nodeEnv,
      port: this.config.port
    });
  }

  /**
   * Start the server
   * @returns {Promise<void>}
   */
  async start() {
    try {
      logger.info('Starting Raven server...');

      // Step 1: Validate configuration
      if (this.validateConfig) {
        await this.validateConfiguration();
      }

      // Step 2: Setup middleware
      await this.setupMiddleware();

      // Step 3: Initialize services
      await this.initializeServices();

      // Step 4: Setup routes
      await this.setupRoutes();

      // Step 5: Setup error handlers (must be last)
      this.setupErrorHandlers();

      // Step 6: Setup WebSocket handlers
      await this.setupWebSocket();

      // Step 7: Start HTTP server
      await this.startHttpServer();

      // Step 8: Setup graceful shutdown
      this.setupGracefulShutdown();

      this.isStarted = true;
      logger.info('Raven server started successfully', {
        port: this.config.port,
        nodeEnv: this.config.nodeEnv
      });

    } catch (error) {
      logger.error('Failed to start server', { error: error.message, stack: error.stack });
      throw error;
    }
  }

  /**
   * Validate configuration
   * @private
   */
  async validateConfiguration() {
    logger.debug('Validating configuration...');
    validateConfig();
    logger.info('Configuration validated');
  }

  /**
   * Setup Express middleware
   * @private
   */
  async setupMiddleware() {
    logger.debug('Setting up middleware...');

    // Security headers
    this.app.use(setupHelmet());

    // CORS
    this.app.use(cors(this.config.cors));

    // Compression
    this.app.use(compression());

    // Body parsing
    this.app.use(express.json({ limit: this.config.security.maxRequestSize }));
    this.app.use(express.urlencoded({ extended: true, limit: this.config.security.maxRequestSize }));

    // Rate limiting
    if (this.config.nodeEnv === 'production') {
      this.app.use('/api/', apiLimiter);
    }

    logger.info('Middleware configured');
  }

  /**
   * Initialize services (databases, collectors, etc.)
   * @private
   */
  async initializeServices() {
    logger.debug('Initializing services...');
    // Services will be initialized here when refactored
    // For now, this is a placeholder
    logger.info('Services initialized');
  }

  /**
   * Setup API routes
   * @private
   */
  async setupRoutes() {
    logger.debug('Setting up routes...');
    
    // Health check (no auth required)
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        version: process.env.npm_package_version || '1.6.5'
      });
    });

    // API routes will be added here when refactored
    logger.info('Routes configured');
  }

  /**
   * Setup error handlers (must be after all routes)
   * @private
   */
  setupErrorHandlers() {
    logger.debug('Setting up error handlers...');
    this.app.use(notFoundHandler);
    this.app.use(errorHandler);
    logger.info('Error handlers configured');
  }

  /**
   * Setup WebSocket handlers
   * @private
   */
  async setupWebSocket() {
    logger.debug('Setting up WebSocket...');
    
    this.io.on('connection', (socket) => {
      logger.debug('Client connected', { socketId: socket.id });
      
      socket.on('disconnect', () => {
        logger.debug('Client disconnected', { socketId: socket.id });
      });
    });

    logger.info('WebSocket configured');
  }

  /**
   * Start HTTP server
   * @private
   */
  async startHttpServer() {
    return new Promise((resolve, reject) => {
      this.httpServer.listen(this.config.port, this.config.host, (err) => {
        if (err) {
          reject(err);
        } else {
          logger.info('HTTP server listening', {
            port: this.config.port,
            host: this.config.host
          });
          resolve();
        }
      });
    });
  }

  /**
   * Setup graceful shutdown handlers
   * @private
   */
  setupGracefulShutdown() {
    const signals = ['SIGINT', 'SIGTERM', 'SIGQUIT'];
    
    signals.forEach((signal) => {
      process.on(signal, async () => {
        if (this.isShuttingDown) return;
        
        logger.info('Shutdown signal received', { signal });
        await this.shutdown();
      });
    });

    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught exception', { error: error.message, stack: error.stack });
      this.shutdown().then(() => process.exit(1));
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled promise rejection', { reason, promise });
    });
  }

  /**
   * Gracefully shutdown the server
   * @returns {Promise<void>}
   */
  async shutdown() {
    if (this.isShuttingDown) {
      logger.warn('Shutdown already in progress');
      return;
    }

    this.isShuttingDown = true;
    logger.info('Beginning graceful shutdown...');

    try {
      // Step 1: Stop accepting new connections
      logger.debug('Closing HTTP server...');
      await this.closeHttpServer();

      // Step 2: Close WebSocket connections
      logger.debug('Closing WebSocket connections...');
      await this.closeWebSocket();

      // Step 3: Shutdown services
      logger.debug('Shutting down services...');
      await this.shutdownServices();

      logger.info('Graceful shutdown completed');
      process.exit(0);

    } catch (error) {
      logger.error('Error during shutdown', { error: error.message });
      process.exit(1);
    }
  }

  /**
   * Close HTTP server
   * @private
   */
  async closeHttpServer() {
    return new Promise((resolve) => {
      this.httpServer.close(() => {
        logger.info('HTTP server closed');
        resolve();
      });

      // Force close after 10 seconds
      setTimeout(() => {
        logger.warn('Forcefully closing HTTP server');
        resolve();
      }, 10000);
    });
  }

  /**
   * Close WebSocket connections
   * @private
   */
  async closeWebSocket() {
    return new Promise((resolve) => {
      this.io.close(() => {
        logger.info('WebSocket server closed');
        resolve();
      });
    });
  }

  /**
   * Shutdown services
   * @private
   */
  async shutdownServices() {
    // Close databases, stop watchers, etc.
    // Will be implemented when services are refactored
    logger.info('Services shut down');
  }

  /**
   * Get Express app instance
   * @returns {import('express').Application}
   */
  getApp() {
    return this.app;
  }

  /**
   * Get HTTP server instance
   * @returns {import('http').Server}
   */
  getHttpServer() {
    return this.httpServer;
  }

  /**
   * Get Socket.IO instance
   * @returns {import('socket.io').Server}
   */
  getIO() {
    return this.io;
  }

  /**
   * Get services container
   * @returns {ServerServices}
   */
  getServices() {
    return this.services;
  }

  /**
   * Check if server is running
   * @returns {boolean}
   */
  isRunning() {
    return this.isStarted && !this.isShuttingDown;
  }
}

export default ServerBootstrap;
