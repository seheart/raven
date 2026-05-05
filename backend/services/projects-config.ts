/**
 * Projects config service — single source of truth for the projects.json file.
 *
 * Owns:
 *   - Type definitions (ProjectConfig, ProjectsConfig)
 *   - Load/save of `<RAVEN_DIR>/projects.json`
 *   - All validation helpers used by routes
 *   - The in-memory `knownProjects` cache used by the Ollama proxy for
 *     attributing inferences without hitting disk per-request.
 */

import fs from 'fs/promises';
import os from 'os';
import { join, resolve, relative as pathRelative, isAbsolute as pathIsAbsolute } from 'path';
import { logger } from '../utils/logger.js';

export interface ProjectConfig {
  id: string;
  name: string;
  path: string;
  enabled: boolean;
  ignorePatterns?: string[];
  maxFileSize?: number;
  retentionDays?: number;
}

export interface ProjectsConfig {
  autoDiscover: boolean;
  basePath: string;
  projects: ProjectConfig[];
}

export const MAX_PROJECTS = 50;
export const MAX_PROJECT_NAME_LENGTH = 100;
export const MIN_RETENTION_DAYS = 1;
export const MAX_RETENTION_DAYS = 365;
export const MIN_FILE_SIZE = 0;
export const MAX_FILE_SIZE = 100_000_000; // 100MB

/**
 * `startsWith` alone is unsafe — `/home/user/project-evil` starts with
 * `/home/user/project`. Use `path.relative()` and reject any rel path that
 * escapes the base.
 */
export function isPathAllowed(userPath: string, basePath: string): boolean {
  try {
    const resolved = resolve(userPath);
    const base = resolve(basePath);
    if (resolved === base) return true;
    const rel = pathRelative(base, resolved);
    return !!rel && !rel.startsWith('..') && !pathIsAbsolute(rel);
  } catch (e) {
    logger.error('[isPathAllowed] Error:', e as Error);
    return false;
  }
}

export function sanitizeProjectId(id: string): string {
  return id
    .toLowerCase()
    .replace(/[^a-z0-9\-_]/g, '-')
    .substring(0, 50);
}

export interface ProjectsConfigService {
  load(): Promise<ProjectsConfig>;
  save(config: ProjectsConfig): Promise<void>;
  /** Returns the cached `[{ name, path }]` projects for fast lookups. */
  getKnownProjects(): Array<{ name: string; path: string }>;
  /** Refresh the in-memory cache from disk. Safe to call repeatedly. */
  refreshKnownProjects(): Promise<void>;
}

export function createProjectsConfigService(ravenDir: string): ProjectsConfigService {
  const configPath = join(ravenDir, 'projects.json');
  let knownProjects: Array<{ name: string; path: string }> = [];

  async function load(): Promise<ProjectsConfig> {
    try {
      const data = await fs.readFile(configPath, 'utf-8');
      try {
        return JSON.parse(data);
      } catch (parseError) {
        logger.error('Invalid JSON in projects config file:', parseError as Error);
        throw new Error('Projects configuration file contains invalid JSON');
      }
    } catch {
      // Default if file doesn't exist
      logger.warn('Using default projects config');
      return {
        autoDiscover: true,
        basePath: os.homedir(),
        projects: []
      };
    }
  }

  async function save(config: ProjectsConfig): Promise<void> {
    await fs.writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8');
  }

  return {
    load,
    save,
    getKnownProjects: () => knownProjects,
    async refreshKnownProjects() {
      try {
        const config = await load();
        knownProjects = config.projects
          .filter(p => typeof p.path === 'string' && p.path.length > 0)
          .map(p => ({ name: p.name, path: p.path }));
      } catch {
        // Keep last good cache on read failure
      }
    }
  };
}
