/**
 * Project Manager Service
 *
 * Manages multi-project file watching, auto-discovery, and database initialization.
 * Each project gets its own FileWatcher instance that tags events with the project name.
 */

import { readFileSync, existsSync, readdirSync } from 'fs';
import { join, basename, resolve } from 'path';
import fs from 'fs/promises';
import os from 'os';
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
import { FileWatcher } from '../modules/watcher.js';

// ==================== Types ====================

interface ProjectConfig {
  id: string;
  name: string;
  path: string;
  enabled: boolean;
  ignorePatterns?: string[];
  maxFileSize?: number;
  retentionDays?: number;
}

interface ProjectsConfig {
  autoDiscover: boolean;
  basePath: string;
  projects: ProjectConfig[];
}

interface ManagedWatcher {
  watcher: FileWatcher;
  projectId: string;
  projectName: string;
}

// ==================== Project Manager ====================

export class ProjectManager {
  private RAVEN_DIR: string;
  private CONFIG_PATH: string;
  private PROJECTS_CONFIG_PATH: string;
  private DB_DIR: string;
  private projectState: Map<ProjectName, ProjectState>;
  private projectDatabases: Map<ProjectName, RavenDB>;
  private projectPaths: Map<ProjectName, string>;
  private availableProjects: ProjectName[];
  private activeProject: ProjectName | null;

  // File watcher management
  private watchers: Map<string, ManagedWatcher> = new Map();

  constructor(options: ProjectManagerOptions & { ravenDir?: string } = {}) {
    this.RAVEN_DIR = options.ravenDir || join(process.cwd(), '.raven');
    this.CONFIG_PATH = options.configPath || join(this.RAVEN_DIR, 'config.toml');
    this.PROJECTS_CONFIG_PATH = join(this.RAVEN_DIR, 'projects.json');
    this.DB_DIR = options.dbDir || join(this.RAVEN_DIR, 'db');

    this.projectState = new Map();
    this.projectDatabases = new Map();
    this.projectPaths = new Map();
    this.availableProjects = [];
    this.activeProject = null;
  }

  // ==================== Auto-Discovery & Initialization ====================

  /**
   * Full initialization: discover projects, register them, start watchers
   */
  async initializeWithWatchers(): Promise<{
    discovered: number;
    watching: number;
    projects: string[];
  }> {
    const config = await this.loadProjectsConfig();

    // Auto-discover if enabled
    let newlyDiscovered = 0;
    if (config.autoDiscover) {
      const discovered = await this.discoverProjectDirs(config.basePath, config.projects);
      if (discovered.length > 0) {
        for (const project of discovered) {
          config.projects.push(project);
        }
        await this.saveProjectsConfig(config);
        newlyDiscovered = discovered.length;
        logger.info(`Auto-discovered ${newlyDiscovered} new project(s)`);
      }
    }

    // Start watchers for all enabled projects
    let watchingCount = 0;
    for (const project of config.projects) {
      if (project.enabled) {
        await this.startWatcher(project);
        watchingCount++;
      }
    }

    const projectNames = config.projects.map(p => p.name);
    logger.info(
      `ProjectManager: ${config.projects.length} projects total, ${watchingCount} watching`
    );

    return {
      discovered: newlyDiscovered,
      watching: watchingCount,
      projects: projectNames
    };
  }

  /**
   * Discover project directories under a base path
   */
  async discoverProjectDirs(basePath: string, existing: ProjectConfig[]): Promise<ProjectConfig[]> {
    const discovered: ProjectConfig[] = [];
    const existingIds = new Set(existing.map(p => p.id));

    // Primary search path
    const searchPath = resolve(basePath);

    try {
      const entries = await fs.readdir(searchPath, { withFileTypes: true });

      for (const entry of entries) {
        if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
        if (discovered.length >= 50) break;

        const projectPath = join(searchPath, entry.name);
        const id = this.sanitizeId(entry.name);

        if (existingIds.has(id)) continue;

        const isProject = await this.isProjectDirectory(projectPath);
        if (!isProject) continue;

        // Skip Raven itself
        const ravenRoot = resolve(join(this.RAVEN_DIR, '..'));
        if (resolve(projectPath) === ravenRoot) continue;

        discovered.push({
          id,
          name: entry.name,
          path: projectPath,
          enabled: true,
          ignorePatterns: [
            'node_modules/**',
            'dist/**',
            '.git/**',
            'target/**',
            'venv/**',
            '.venv/**'
          ]
        });

        existingIds.add(id);
        logger.info(`Discovered project: ${entry.name} (${projectPath})`);
      }
    } catch (err) {
      logger.warn(`Could not scan ${searchPath} for project discovery`);
    }

    return discovered;
  }

  /**
   * Check if a directory looks like a project
   */
  private async isProjectDirectory(dirPath: string): Promise<boolean> {
    const indicators = [
      '.git',
      'package.json',
      'Cargo.toml',
      'pyproject.toml',
      'go.mod',
      'Makefile',
      'pom.xml',
      'build.gradle',
      'CMakeLists.txt',
      'setup.py',
      'requirements.txt'
    ];

    for (const indicator of indicators) {
      try {
        await fs.access(join(dirPath, indicator));
        return true;
      } catch {
        // Not found, try next
      }
    }
    return false;
  }

  // ==================== Watcher Management ====================

  /**
   * Start a file watcher for a project
   */
  async startWatcher(project: ProjectConfig): Promise<boolean> {
    if (this.watchers.has(project.id)) {
      logger.warn(`Watcher already running for ${project.name}`);
      return true;
    }

    try {
      await fs.access(project.path);
    } catch {
      logger.warn(`Project path not accessible, skipping watcher: ${project.path}`);
      return false;
    }

    const watcher = new FileWatcher({
      watchPath: project.path,
      projectName: project.name,
      projectPath: project.path,
      maxFileSize: project.maxFileSize,
      ignored: [
        '**/node_modules/**',
        '**/.git/**',
        '**/target/**',
        '**/.raven/**',
        '**/*.log',
        '**/dist/**',
        ...(project.ignorePatterns || [])
      ]
    });

    watcher.start();

    this.watchers.set(project.id, {
      watcher,
      projectId: project.id,
      projectName: project.name
    });

    logger.info(`Started watcher for: ${project.name} (${project.path})`);
    return true;
  }

  /**
   * Stop a project's watcher
   */
  async stopWatcher(projectId: string): Promise<void> {
    const managed = this.watchers.get(projectId);
    if (managed) {
      await managed.watcher.stop();
      this.watchers.delete(projectId);
      logger.info(`Stopped watcher for: ${managed.projectName}`);
    }
  }

  /**
   * Stop all watchers
   */
  async stopAllWatchers(): Promise<void> {
    for (const [_id, managed] of this.watchers) {
      await managed.watcher.stop();
      logger.info(`Stopped watcher for: ${managed.projectName}`);
    }
    this.watchers.clear();
  }

  /**
   * Get cached content from any watcher that has it
   */
  getCachedContentForPath(absolutePath: string): string | undefined {
    for (const [, managed] of this.watchers) {
      const content = managed.watcher.getCachedContent(absolutePath);
      if (content) return content;
    }
    return undefined;
  }

  /**
   * Resolve a relative file path + project name to the watcher that owns it
   */
  getWatcherForProject(projectName: string): FileWatcher | undefined {
    for (const [, managed] of this.watchers) {
      if (managed.projectName === projectName) return managed.watcher;
    }
    return undefined;
  }

  /**
   * Get watcher status for all projects
   */
  getWatcherStatus(): Array<{
    id: string;
    name: string;
    watching: boolean;
  }> {
    const statuses: Array<{ id: string; name: string; watching: boolean }> = [];
    for (const [id, managed] of this.watchers) {
      statuses.push({
        id,
        name: managed.projectName,
        watching: managed.watcher.isRunning()
      });
    }
    return statuses;
  }

  /**
   * Number of active watchers
   */
  activeWatcherCount(): number {
    let count = 0;
    for (const [, managed] of this.watchers) {
      if (managed.watcher.isRunning()) count++;
    }
    return count;
  }

  /**
   * Check if any watcher is running
   */
  isWatching(): boolean {
    return this.activeWatcherCount() > 0;
  }

  // ==================== Projects Config (projects.json) ====================

  async loadProjectsConfig(): Promise<ProjectsConfig> {
    try {
      const data = await fs.readFile(this.PROJECTS_CONFIG_PATH, 'utf-8');
      return JSON.parse(data);
    } catch {
      return {
        autoDiscover: true,
        basePath: join(os.homedir(), 'Projects'),
        projects: []
      };
    }
  }

  async saveProjectsConfig(config: ProjectsConfig): Promise<void> {
    await fs.writeFile(this.PROJECTS_CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');
  }

  // ==================== Database Management (preserved from original) ====================

  /**
   * Discover projects from config or auto-detect
   */
  discoverProjects(): DiscoveredProject[] {
    let projects: DiscoveredProject[] = [];

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
            path: process.cwd(),
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

  initializeProject(projectName: ProjectName): ProjectInitResult {
    try {
      const dbPath = join(this.DB_DIR, `${projectName}.db`);
      const db = new RavenDB(dbPath);

      this.projectDatabases.set(projectName, db);
      this.projectState.set(projectName, {
        name: projectName,
        database: dbPath,
        initialized: true,
        startTime: Date.now()
      });

      logger.info(`Project initialized: ${projectName}`, { database: dbPath });

      return { success: true, projectName, database: dbPath };
    } catch (error) {
      const err = error as Error;
      logger.error(`Failed to initialize project ${projectName}:`, err as any);
      return { success: false, projectName, error: err.message };
    }
  }

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

    this.availableProjects = Array.from(this.projectPaths.keys());

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

  async switchProject(
    projectName: ProjectName
  ): Promise<{ success: boolean; activeProject: ProjectName }> {
    if (!this.projectPaths.has(projectName)) {
      throw new Error(`Project not found: ${projectName}`);
    }

    this.activeProject = projectName;
    logger.info(`Switched active project to: ${projectName}`);

    return { success: true, activeProject: projectName };
  }

  getProjectDatabase(projectName?: ProjectName): RavenDB | undefined {
    const name = projectName || this.activeProject;
    if (!name) return undefined;
    return this.projectDatabases.get(name);
  }

  getDefaultProjectDb(): RavenDB | null {
    if (this.activeProject && this.projectDatabases.has(this.activeProject)) {
      return this.projectDatabases.get(this.activeProject) || null;
    }

    const firstProject = Array.from(this.projectDatabases.keys())[0];
    return firstProject ? this.projectDatabases.get(firstProject) || null : null;
  }

  getDefaultProjectName(): string {
    const cwd = process.cwd();
    return basename(cwd) || 'default-project';
  }

  getAllProjects(): ProjectInfo[] {
    return this.availableProjects.map(name => ({
      name,
      path: this.projectPaths.get(name),
      database: this.projectState.get(name)?.database,
      state: this.projectState.get(name),
      isActive: name === this.activeProject
    }));
  }

  getProjectState(projectName?: ProjectName): ProjectState | undefined {
    const name = projectName || this.activeProject;
    if (!name) return undefined;
    return this.projectState.get(name);
  }

  // ==================== Full Cleanup ====================

  async cleanup(): Promise<void> {
    logger.info('Cleaning up ProjectManager resources');

    // Stop all watchers
    await this.stopAllWatchers();

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

  // ==================== Helpers ====================

  private sanitizeId(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9\-_]/g, '-')
      .substring(0, 50);
  }
}
