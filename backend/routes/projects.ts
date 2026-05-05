/**
 * Projects Routes — `/api/projects/*`
 *
 * CRUD + auto-discover + global config for the watched projects list.
 * Stores to <RAVEN_DIR>/projects.json via the projects-config service.
 */

import express, { Request, Response, Router } from 'express';
import os from 'os';
import fs from 'fs/promises';
import { basename, join, resolve } from 'path';
import { z } from 'zod';
import { cacheMiddleware } from '../services/cache-service.js';
import { logger } from '../utils/logger.js';
import {
  isPathAllowed,
  sanitizeProjectId,
  MAX_PROJECTS,
  MIN_FILE_SIZE,
  MAX_FILE_SIZE,
  MIN_RETENTION_DAYS,
  MAX_RETENTION_DAYS,
  MAX_PROJECT_NAME_LENGTH
} from '../services/projects-config.js';
import type { ProjectConfig, ProjectsConfig } from '../services/projects-config.js';

// Validation: project name allows alphanumeric, spaces, hyphens, underscores.
const ProjectName = z
  .string()
  .min(1)
  .max(MAX_PROJECT_NAME_LENGTH)
  .regex(/^[a-zA-Z0-9\s\-_]+$/, 'name must be alphanumeric / space / - / _');

// displayName is a human label — apostrophes, punctuation OK, just length capped.
const DisplayName = z.string().min(1).max(120);
// mission is a short purpose statement — newlines stripped, length capped.
const Mission = z
  .string()
  .min(1)
  .max(280)
  .transform(s => s.replace(/\s+/g, ' ').trim());

const IgnorePatterns = z.array(z.string().max(199)).max(100);
const FileSize = z.coerce.number().int().min(MIN_FILE_SIZE).max(MAX_FILE_SIZE);
const RetentionDays = z.coerce.number().int().min(MIN_RETENTION_DAYS).max(MAX_RETENTION_DAYS);

const ProjectIdParam = z.object({
  id: z.string().regex(/^[a-z0-9\-_]+$/, 'invalid project id')
});

const CreateProjectSchema = z.object({
  name: ProjectName,
  displayName: DisplayName.optional(),
  mission: Mission.optional(),
  path: z.string().min(1).max(4096),
  enabled: z.boolean().optional(),
  ignorePatterns: IgnorePatterns.optional(),
  maxFileSize: FileSize.optional(),
  retentionDays: RetentionDays.optional()
});

const UpdateProjectSchema = z
  .object({
    name: ProjectName,
    displayName: DisplayName,
    mission: Mission,
    enabled: z.boolean(),
    ignorePatterns: IgnorePatterns,
    maxFileSize: FileSize,
    retentionDays: RetentionDays
  })
  .partial();

const DiscoverSchema = z.object({
  basePath: z.string().min(1).max(4096).optional(),
  autoRegister: z.boolean().optional()
});

const ConfigSchema = z
  .object({
    autoDiscover: z.boolean(),
    basePath: z.string().min(1).max(4096)
  })
  .partial();
import type { RavenDB } from '../db.js';

interface ProjectsRouterDeps {
  db: RavenDB;
  ravenDir: string;
  projectsConfigService: {
    load(): Promise<ProjectsConfig>;
    save(c: ProjectsConfig): Promise<void>;
  };
  projectManager: {
    startWatcher(p: ProjectConfig): Promise<unknown>;
    stopWatcher(id: string): Promise<unknown>;
  };
}

export function createProjectsRouter({
  db,
  ravenDir,
  projectsConfigService,
  projectManager
}: ProjectsRouterDeps): Router {
  const router = express.Router();

  // GET /api/projects — list with per-project event counts
  router.get('/', cacheMiddleware(5000), async (_req: Request, res: Response) => {
    try {
      const config = await projectsConfigService.load();
      const projects = await Promise.all(
        config.projects.map(async project => {
          let eventCount = 0;
          try {
            const result = db.db
              .prepare('SELECT COUNT(*) as count FROM events WHERE project_name = ?')
              .get(project.name) as { count: number };
            eventCount = result.count;
          } catch {
            /* table missing or query failed — leave as 0 */
          }
          return { ...project, eventCount };
        })
      );
      return res.json({ ...config, projects });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return res.status(500).json({ error: message });
    }
  });

  // POST /api/projects — add new project
  router.post('/', async (req: Request, res: Response) => {
    const parsed = CreateProjectSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid project payload', issues: parsed.error.issues });
    }
    try {
      const body = parsed.data;
      const config = await projectsConfigService.load();
      if (config.projects.length >= MAX_PROJECTS) {
        return res.status(400).json({ error: `Maximum of ${MAX_PROJECTS} projects allowed` });
      }
      if (!isPathAllowed(body.path, config.basePath)) {
        return res.status(403).json({ error: 'Path outside allowed directory' });
      }
      try {
        await fs.access(body.path);
      } catch {
        return res.status(400).json({ error: 'Invalid path' });
      }

      const id = sanitizeProjectId(basename(body.path));
      if (config.projects.some(p => p.id === id)) {
        return res.status(409).json({ error: 'Project already exists' });
      }

      const newProject: ProjectConfig = {
        id,
        name: body.name.trim(),
        displayName: body.displayName?.trim(),
        mission: body.mission,
        path: body.path,
        enabled: body.enabled ?? true,
        ignorePatterns: body.ignorePatterns ?? [],
        maxFileSize: body.maxFileSize,
        retentionDays: body.retentionDays
      };

      config.projects.push(newProject);
      await projectsConfigService.save(config);

      if (newProject.enabled) {
        await projectManager.startWatcher(newProject);
      }

      return res.json({ success: true, project: newProject });
    } catch (error) {
      logger.error('[POST /api/projects] Error:', error as Error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  });

  // PUT /api/projects/:id — update settings
  router.put('/:id', async (req: Request, res: Response) => {
    const idParse = ProjectIdParam.safeParse(req.params);
    if (!idParse.success) {
      return res.status(400).json({ error: 'Invalid project ID' });
    }
    const bodyParse = UpdateProjectSchema.safeParse(req.body);
    if (!bodyParse.success) {
      return res.status(400).json({ error: 'Invalid update', issues: bodyParse.error.issues });
    }
    try {
      const { id } = idParse.data;
      const updates = bodyParse.data;
      const config = await projectsConfigService.load();
      const idx = config.projects.findIndex(p => p.id === id);
      if (idx === -1) {
        return res.status(404).json({ error: 'Project not found' });
      }

      const sanitized: Partial<ProjectConfig> = { ...updates };
      if (sanitized.name) sanitized.name = sanitized.name.trim();
      if (sanitized.displayName) sanitized.displayName = sanitized.displayName.trim();

      const previousEnabled = config.projects[idx].enabled;
      config.projects[idx] = {
        ...config.projects[idx],
        ...sanitized,
        id // preserve immutable id
      };
      await projectsConfigService.save(config);

      const updated = config.projects[idx];
      if (sanitized.enabled !== undefined && sanitized.enabled !== previousEnabled) {
        if (updated.enabled) {
          await projectManager.startWatcher(updated);
        } else {
          await projectManager.stopWatcher(updated.id);
        }
      }

      return res.json({ success: true, project: updated });
    } catch (error) {
      logger.error('[PUT /api/projects/:id] Error:', error as Error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  });

  // DELETE /api/projects/:id — remove (and optionally delete db)
  router.delete('/:id', async (req: Request, res: Response) => {
    const idParse = ProjectIdParam.safeParse(req.params);
    if (!idParse.success) {
      return res.status(400).json({ error: 'Invalid project ID' });
    }
    try {
      const { id } = idParse.data;
      const deleteDatabase = req.query.deleteDb === 'true';

      const config = await projectsConfigService.load();
      const idx = config.projects.findIndex(p => p.id === id);
      if (idx === -1) {
        return res.status(404).json({ error: 'Project not found' });
      }

      await projectManager.stopWatcher(id);
      config.projects.splice(idx, 1);
      await projectsConfigService.save(config);

      if (deleteDatabase) {
        const safeId = sanitizeProjectId(id);
        const dbPath = join(ravenDir, 'db', `${safeId}.db`);
        const dbDir = resolve(ravenDir, 'db');
        const resolvedDbPath = resolve(dbPath);
        if (!resolvedDbPath.startsWith(dbDir + '/')) {
          logger.warn('[Security] [DELETE /api/projects/:id] Path traversal attempt:', dbPath);
          return res.status(403).json({ error: 'Forbidden' });
        }
        try {
          await fs.unlink(dbPath);
          await fs.unlink(`${dbPath}-shm`).catch(() => {});
          await fs.unlink(`${dbPath}-wal`).catch(() => {});
        } catch {
          logger.info('[DELETE /api/projects/:id] Database file not found:', dbPath);
        }
      }

      return res.json({ success: true });
    } catch (error) {
      logger.error('[DELETE /api/projects/:id] Error:', error as Error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  });

  // POST /api/projects/discover — auto-discover dirs under basePath
  router.post('/discover', async (req: Request, res: Response) => {
    const parsed = DiscoverSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid discover payload', issues: parsed.error.issues });
    }
    try {
      const config = await projectsConfigService.load();
      const requestedBasePath = parsed.data.basePath;
      let basePath = config.basePath;

      if (requestedBasePath) {
        if (
          !isPathAllowed(requestedBasePath, config.basePath) &&
          requestedBasePath !== config.basePath
        ) {
          return res.status(403).json({ error: 'Base path outside allowed directory' });
        }
        basePath = requestedBasePath;
      }

      let entries;
      try {
        entries = await fs.readdir(basePath, { withFileTypes: true });
      } catch {
        return res.status(400).json({ error: 'Invalid base path' });
      }

      const discovered: ProjectConfig[] = [];
      const MAX_DISCOVERIES = 100;

      for (const entry of entries) {
        if (discovered.length >= MAX_DISCOVERIES) break;
        if (entry.isDirectory() && !entry.name.startsWith('.')) {
          const projectPath = join(basePath, entry.name);
          if (!isPathAllowed(projectPath, config.basePath)) continue;
          const hasGit = await fs
            .access(join(projectPath, '.git'))
            .then(() => true)
            .catch(() => false);
          const hasPackageJson = await fs
            .access(join(projectPath, 'package.json'))
            .then(() => true)
            .catch(() => false);
          if (hasGit || hasPackageJson) {
            const id = sanitizeProjectId(entry.name);
            if (!config.projects.some(p => p.id === id)) {
              discovered.push({
                id,
                name: entry.name,
                path: projectPath,
                enabled: false,
                ignorePatterns: ['node_modules/**', 'dist/**', '.git/**']
              });
            }
          }
        }
      }

      const autoRegister = parsed.data.autoRegister === true;
      if (autoRegister && discovered.length > 0) {
        for (const project of discovered) {
          project.enabled = true;
          config.projects.push(project);
          await projectManager.startWatcher(project);
        }
        await projectsConfigService.save(config);
        logger.info(`Auto-registered ${discovered.length} discovered projects`);
      }

      return res.json({
        discovered,
        basePath,
        autoRegistered: autoRegister ? discovered.length : 0
      });
    } catch (error) {
      logger.error('[POST /api/projects/discover] Error:', error as Error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  });

  // PUT /api/projects/config — update global config (autoDiscover, basePath)
  router.put('/config', async (req: Request, res: Response) => {
    const parsed = ConfigSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid config payload', issues: parsed.error.issues });
    }
    try {
      const { autoDiscover, basePath } = parsed.data;
      const config = await projectsConfigService.load();

      if (autoDiscover !== undefined) {
        config.autoDiscover = autoDiscover;
      }
      if (basePath !== undefined) {
        const resolvedBase = resolve(basePath);
        if (!isPathAllowed(resolvedBase, os.homedir())) {
          return res
            .status(400)
            .json({ error: 'basePath must be under the user home directory' });
        }
        try {
          const stat = await fs.stat(resolvedBase);
          if (!stat.isDirectory()) {
            return res
              .status(400)
              .json({ error: 'basePath must point to an existing directory' });
          }
        } catch {
          return res.status(400).json({ error: 'basePath must point to an existing directory' });
        }
        config.basePath = resolvedBase;
      }

      await projectsConfigService.save(config);
      return res.json({ success: true, config });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return res.status(500).json({ error: message });
    }
  });

  return router;
}
