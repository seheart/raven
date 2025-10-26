/**
 * Project Manager Service
 *
 * Centralized service for managing multi-project state, discovery, and initialization.
 * Handles project databases, paths, and state management.
 */

import { readFileSync, existsSync, readdirSync } from 'fs';
import { join, basename } from 'path';
import { logger } from '../utils/logger.js';
import Database from '../db.js';

export class ProjectManager {
  constructor(options = {}) {
    this.RAVEN_DIR = options.ravenDir || join(process.cwd(), '.raven');
    this.CONFIG_PATH = options.configPath || join(this.RAVEN_DIR, 'config.toml');
    this.DB_DIR = options.dbDir || join(this.RAVEN_DIR, 'db');

    // Multi-project state
    this.projectState = new Map();
    this.projectDatabases = new Map();
    this.projectPaths = new Map();
    this.availableProjects = [];
    this.activeProject = null;

    // Mutex for thread-safe operations
    this.mutex = {
      locked: false,
      queue: []
    };
  }

  /**
   * Discover projects from config or auto-detect
   */
  discoverProjects() {
    let projects = [];

    // Try loading from config first
    if (existsSync(this.CONFIG_PATH)) {
      try {
        const configContent = readFileSync(this.CONFIG_PATH, 'utf-8');
        const lines = configContent.split('\n');

        for (const line of lines) {
          const match = line.match(/path\s*=\s*["'](.+)["']/);
          if (match) {
            const projectPath = match[1];
            const projectName = basename(projectPath);
            projects.push({ name: projectName, path: projectPath });
          }
        }

        if (projects.length > 0) {
          logger.info(`Loaded ${projects.length} projects from config`, { projects: projects.map(p => p.name) });
        }
      } catch (error) {
        logger.error('Failed to load config:', error);
      }
    }

    // Auto-discover if no projects in config
    if (projects.length === 0) {
      logger.info('Auto-discovering projects from database files');

      if (existsSync(this.DB_DIR)) {
        const dbFiles = readdirSync(this.DB_DIR)
          .filter(file => file.endsWith('.db') && !file.startsWith('.'));

        projects = dbFiles.map(file => {
          const projectName = file.replace('.db', '');
          return {
            name: projectName,
            path: process.cwd(), // Default to current working directory
            auto_discovered: true
          };
        });

        if (projects.length > 0) {
          logger.info(`Auto-discovered ${projects.length} projects`, {
            projects: projects.map(p => p.name)
          });
        }
      }
    }

    // Fallback to default project
    if (projects.length === 0) {
      const defaultName = this.getDefaultProjectName();
      projects.push({
        name: defaultName,
        path: process.cwd(),
        is_default: true
      });
      logger.info(`Using default project: ${defaultName}`);
    }

    return projects;
  }

  /**
   * Initialize a single project
   */
  initializeProject(projectName) {
    try {
      const dbPath = join(this.DB_DIR, `${projectName}.db`);
      const db = new Database(dbPath);

      // Store in maps
      this.projectDatabases.set(projectName, db);

      // Initialize state
      this.projectState.set(projectName, {
        name: projectName,
        database: dbPath,
        initialized: true,
        startTime: Date.now()
      });

      logger.info(`Project initialized: ${projectName}`, { database: dbPath });

      return {
        success: true,
        projectName,
        database: dbPath
      };
    } catch (error) {
      logger.error(`Failed to initialize project ${projectName}:`, error);
      return {
        success: false,
        projectName,
        error: error.message
      };
    }
  }

  /**
   * Initialize all discovered projects
   */
  initializeAllProjects() {
    const projects = this.discoverProjects();

    let successCount = 0;
    let failCount = 0;

    for (const project of projects) {
      this.projectPaths.set(project.name, project.path);
      const result = this.initializeProject(project.name);

      if (result.success) {
        successCount++;
      } else {
        failCount++;
      }
    }

    // Set available projects list
    this.availableProjects = Array.from(this.projectPaths.keys());

    // Set active project (first one or default)
    if (this.availableProjects.length > 0) {
      this.activeProject = this.availableProjects[0];
      logger.info(`Active project set to: ${this.activeProject}`);
    }

    logger.info(`Projects initialized: ${successCount} successful, ${failCount} failed`);

    return {
      success: successCount,
      failed: failCount,
      total: projects.length,
      projects: this.availableProjects
    };
  }

  /**
   * Switch active project
   */
  async switchProject(projectName) {
    return this.withMutex(async () => {
      if (!this.projectPaths.has(projectName)) {
        throw new Error(`Project not found: ${projectName}`);
      }

      this.activeProject = projectName;
      logger.info(`Switched active project to: ${projectName}`);

      return {
        success: true,
        activeProject: projectName
      };
    });
  }

  /**
   * Get database for a specific project
   */
  getProjectDatabase(projectName) {
    return this.projectDatabases.get(projectName || this.activeProject);
  }

  /**
   * Get default project database
   */
  getDefaultProjectDb() {
    if (this.activeProject && this.projectDatabases.has(this.activeProject)) {
      return this.projectDatabases.get(this.activeProject);
    }

    // Fallback to first available database
    const firstProject = Array.from(this.projectDatabases.keys())[0];
    return firstProject ? this.projectDatabases.get(firstProject) : null;
  }

  /**
   * Get default project name
   */
  getDefaultProjectName() {
    // Try current directory name
    const cwd = process.cwd();
    return basename(cwd) || 'default-project';
  }

  /**
   * Get all projects
   */
  getAllProjects() {
    return this.availableProjects.map(name => ({
      name,
      path: this.projectPaths.get(name),
      database: this.projectDatabases.get(name)?.dbPath,
      state: this.projectState.get(name),
      isActive: name === this.activeProject
    }));
  }

  /**
   * Get project state
   */
  getProjectState(projectName) {
    return this.projectState.get(projectName || this.activeProject);
  }

  /**
   * Mutex helper for thread-safe operations
   */
  async withMutex(fn) {
    if (this.mutex.locked) {
      return new Promise((resolve, reject) => {
        this.mutex.queue.push({ fn, resolve, reject });
      });
    }

    this.mutex.locked = true;

    try {
      const result = await fn();
      return result;
    } finally {
      this.mutex.locked = false;

      // Process queue
      if (this.mutex.queue.length > 0) {
        const { fn: nextFn, resolve, reject } = this.mutex.queue.shift();
        this.withMutex(nextFn).then(resolve).catch(reject);
      }
    }
  }

  /**
   * Cleanup resources
   */
  async cleanup() {
    logger.info('Cleaning up project manager resources');

    // Close all database connections
    for (const [projectName, db] of this.projectDatabases.entries()) {
      try {
        db.close();
        logger.info(`Database closed for ${projectName}`);
      } catch (error) {
        logger.error(`Error closing database for ${projectName}:`, error);
      }
    }

    this.projectDatabases.clear();
    this.projectState.clear();
    this.projectPaths.clear();
    this.availableProjects = [];
    this.activeProject = null;
  }
}

export default ProjectManager;
