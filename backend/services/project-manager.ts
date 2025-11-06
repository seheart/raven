/**
 * Project Manager Service
 *
 * Centralized service for managing multi-project state, discovery, and initialization.
 * Handles project databases, paths, and state management.
 */

import { readFileSync, existsSync, readdirSync } from 'fs';
import { join, basename } from 'path';
import type {
  ProjectName,
  ProjectManagerOptions,
  DiscoveredProject,
  ProjectInitResult,
  ProjectState,
  ProjectInfo
} from '../types/index.js';
import { logger } from '../utils/logger.js';
import { RavenDB } from '../db.js';

/**
 * Mutex for thread-safe operations
 */
interface Mutex {
  locked: boolean;
  queue: Array<{
    fn: () => Promise<unknown>;
    resolve: (value: unknown) => void;
    reject: (reason?: unknown) => void;
  }>;
}

export class ProjectManager {
  private RAVEN_DIR: string;
  private CONFIG_PATH: string;
  private DB_DIR: string;
  private projectState: Map<ProjectName, ProjectState>;
  private projectDatabases: Map<ProjectName, RavenDB>;
  private projectPaths: Map<ProjectName, string>;
  private availableProjects: ProjectName[];
  private activeProject: ProjectName | null;
  private mutex: Mutex;

  constructor(options: ProjectManagerOptions = {}) {
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
  discoverProjects(): DiscoveredProject[] {
    let projects: DiscoveredProject[] = [];

    // Try loading from config first
    if (existsSync(this.CONFIG_PATH)) {
      try {
        const configContent = readFileSync(this.CONFIG_PATH, 'utf-8');
        const lines = configContent.split('\n');

        for (const line of lines) {
          const match = line.match(/path\s*=\s*["'](.+)["']/);
          if (match && match[1]) {
            const projectPath = match[1];
            const projectName = basename(projectPath);
            projects.push({ name: projectName, path: projectPath });
          }
        }

        if (projects.length > 0) {
          logger.info(`Loaded ${projects.length} projects from config`, {
            projects: projects.map(p => p.name)
          });
        }
      } catch (error) {
        logger.error('Failed to load config:', error as any);
      }
    }

    // Auto-discover if no projects in config
    if (projects.length === 0) {
      logger.info('Auto-discovering projects from database files');

      if (existsSync(this.DB_DIR)) {
        const dbFiles = readdirSync(this.DB_DIR).filter(
          file => file.endsWith('.db') && !file.startsWith('.')
        );

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
  initializeProject(projectName: ProjectName): ProjectInitResult {
    try {
      const dbPath = join(this.DB_DIR, `${projectName}.db`);
      const db = new RavenDB(dbPath);

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
      const err = error as Error;
      logger.error(`Failed to initialize project ${projectName}:`, err as any);
      return {
        success: false,
        projectName,
        error: err.message
      };
    }
  }

  /**
   * Initialize all discovered projects
   */
  initializeAllProjects(): {
    success: number;
    failed: number;
    total: number;
    projects: ProjectName[];
  } {
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
      this.activeProject = this.availableProjects[0] || null;
      if (this.activeProject) {
        logger.info(`Active project set to: ${this.activeProject}`);
      }
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
  async switchProject(
    projectName: ProjectName
  ): Promise<{ success: boolean; activeProject: ProjectName }> {
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
  getProjectDatabase(projectName?: ProjectName): RavenDB | undefined {
    const name = projectName || this.activeProject;
    if (!name) return undefined;
    return this.projectDatabases.get(name);
  }

  /**
   * Get default project database
   */
  getDefaultProjectDb(): RavenDB | null {
    if (this.activeProject && this.projectDatabases.has(this.activeProject)) {
      return this.projectDatabases.get(this.activeProject) || null;
    }

    // Fallback to first available database
    const firstProject = Array.from(this.projectDatabases.keys())[0];
    return firstProject ? this.projectDatabases.get(firstProject) || null : null;
  }

  /**
   * Get default project name
   */
  getDefaultProjectName(): string {
    // Try current directory name
    const cwd = process.cwd();
    return basename(cwd) || 'default-project';
  }

  /**
   * Get all projects
   */
  getAllProjects(): ProjectInfo[] {
    return this.availableProjects.map(name => ({
      name,
      path: this.projectPaths.get(name),
      database: (this.projectDatabases.get(name) as any)?.dbPath,
      state: this.projectState.get(name),
      isActive: name === this.activeProject
    }));
  }

  /**
   * Get project state
   */
  getProjectState(projectName?: ProjectName): ProjectState | undefined {
    const name = projectName || this.activeProject;
    if (!name) return undefined;
    return this.projectState.get(name);
  }

  /**
   * Mutex helper for thread-safe operations
   * Ensures proper unlocking even when fn() throws errors
   */
  async withMutex<T>(fn: () => Promise<T>): Promise<T> {
    if (this.mutex.locked) {
      return new Promise((resolve, reject) => {
        this.mutex.queue.push({
          fn: fn as () => Promise<unknown>,
          resolve: resolve as (value: unknown) => void,
          reject
        });
      }) as Promise<T>;
    }

    this.mutex.locked = true;
    let error: unknown = null;
    let result: T | null = null;

    try {
      result = await fn();
    } catch (err) {
      error = err;
      logger.error('Error in mutex-protected operation:', err as any);
    } finally {
      this.mutex.locked = false;

      // Process next item in queue
      if (this.mutex.queue.length > 0) {
        const { fn: nextFn, resolve, reject } = this.mutex.queue.shift()!;

        // Run next function and handle its result/error
        this.withMutex(nextFn as () => Promise<unknown>)
          .then(resolve)
          .catch(reject);
      }
    }

    // Throw error after unlocking and processing queue
    if (error) {
      throw error;
    }

    return result as T;
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    logger.info('Cleaning up project manager resources');

    // Close all database connections
    for (const [projectName, db] of this.projectDatabases.entries()) {
      try {
        db.close();
        logger.info(`Database closed for ${projectName}`);
      } catch (error) {
        logger.error(`Error closing database for ${projectName}:`, error as any);
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
