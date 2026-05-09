/**
 * Projects Routes — `/api/projects/*`
 *
 * CRUD + auto-discover + global config for the watched projects list.
 * Stores to <RAVEN_DIR>/projects.json via the projects-config service.
 */

import express, { Request, Response, Router } from 'express';
import os from 'os';
import fs from 'fs/promises';
import { execFile as execFileCb } from 'child_process';
import { promisify } from 'util';
import { basename, join, resolve } from 'path';

const execFile = promisify(execFileCb);
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

const IgnorePatterns = z.array(z.string().max(199)).max(100);
const FileSize = z.coerce.number().int().min(MIN_FILE_SIZE).max(MAX_FILE_SIZE);
const RetentionDays = z.coerce.number().int().min(MIN_RETENTION_DAYS).max(MAX_RETENTION_DAYS);

const ProjectIdParam = z.object({
  id: z.string().regex(/^[a-z0-9\-_]+$/, 'invalid project id')
});

const CreateProjectSchema = z.object({
  name: ProjectName,
  path: z.string().min(1).max(4096),
  enabled: z.boolean().optional(),
  ignorePatterns: IgnorePatterns.optional(),
  maxFileSize: FileSize.optional(),
  retentionDays: RetentionDays.optional()
});

const UpdateProjectSchema = z
  .object({
    name: ProjectName,
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
import type { FileEventsRepository } from '../repositories/file-events-repository.js';

interface ProjectsRouterDeps {
  fileEventsRepo: FileEventsRepository;
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
  fileEventsRepo,
  ravenDir,
  projectsConfigService,
  projectManager
}: ProjectsRouterDeps): Router {
  const router = express.Router();

  // GET /api/projects — list with per-project event counts
  router.get('/', cacheMiddleware(5000), async (_req: Request, res: Response) => {
    try {
      const config = await projectsConfigService.load();

      // Two views of activity:
      //  - `eventCount` (recent): live rows in the events table — capped to
      //    the 7-day retention window. Falls to 0 for projects untouched
      //    recently, which surprised users.
      //  - `lifetimeEventCount` / `lifetimeAgentEventCount`: pulled from
      //    project_stats (trigger-maintained) so totals survive purge.
      const counts = fileEventsRepo.eventCountsByProject();
      const lifetime = fileEventsRepo.lifetimeStatsByProject();

      const projects = config.projects.map(project => {
        const stat = lifetime.get(project.name);
        return {
          ...project,
          eventCount: counts.get(project.name) ?? 0,
          lifetimeEventCount: stat?.total_events ?? 0,
          lifetimeAgentEventCount: stat?.total_agent_events ?? 0,
          firstSeenAt: stat?.first_seen_at ?? null,
          lastSeenAt: stat?.last_seen_at ?? null
        };
      });

      return res.json({ ...config, projects });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return res.status(500).json({ error: message });
    }
  });

  // GET /api/projects/:name/profile — rich metadata for a single project:
  // language mix, framework detection, git first/last commit, filesystem
  // dates, top-edited files, raven counters. Powers the meta panel that
  // sits next to the AI Summary on /system/projects. Cached 60s — the
  // git/du calls aren't free.
  router.get('/:name/profile', cacheMiddleware(60_000), async (req: Request, res: Response) => {
    try {
      const config = await projectsConfigService.load();
      const project = config.projects.find(p => p.name === req.params.name);
      if (!project) return res.status(404).json({ error: 'Project not found' });
      const profile = await buildProjectProfile(project, fileEventsRepo);
      return res.json(profile);
    } catch (error) {
      logger.error('[GET /api/projects/:name/profile] Error:', error as Error);
      const message = error instanceof Error ? error.message : String(error);
      return res.status(500).json({ error: message });
    }
  });

  // POST /api/projects — add new project
  router.post('/', async (req: Request, res: Response) => {
    const parsed = CreateProjectSchema.safeParse(req.body);
    if (!parsed.success) {
      return res
        .status(400)
        .json({ error: 'Invalid project payload', issues: parsed.error.issues });
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
      return res
        .status(400)
        .json({ error: 'Invalid discover payload', issues: parsed.error.issues });
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

      const MAX_DISCOVERIES = 100;
      const candidates = entries
        .filter(e => e.isDirectory() && !e.name.startsWith('.'))
        .map(e => ({ name: e.name, projectPath: join(basePath, e.name) }))
        .filter(c => isPathAllowed(c.projectPath, config.basePath))
        .slice(0, MAX_DISCOVERIES * 2); // headroom; final cap below

      const probed = await Promise.all(
        candidates.map(async ({ name, projectPath }) => {
          const [hasGit, hasPackageJson] = await Promise.all([
            fs
              .access(join(projectPath, '.git'))
              .then(() => true)
              .catch(() => false),
            fs
              .access(join(projectPath, 'package.json'))
              .then(() => true)
              .catch(() => false)
          ]);
          return { name, projectPath, isProject: hasGit || hasPackageJson };
        })
      );

      const discovered: ProjectConfig[] = [];
      for (const { name, projectPath, isProject } of probed) {
        if (discovered.length >= MAX_DISCOVERIES) break;
        if (!isProject) continue;
        const id = sanitizeProjectId(name);
        if (!config.projects.some(p => p.id === id)) {
          discovered.push({
            id,
            name,
            path: projectPath,
            enabled: false,
            ignorePatterns: ['node_modules/**', 'dist/**', '.git/**']
          });
        }
      }

      const autoRegister = parsed.data.autoRegister === true;
      if (autoRegister && discovered.length > 0) {
        for (const project of discovered) {
          project.enabled = true;
          config.projects.push(project);
        }
        await Promise.all(discovered.map(p => projectManager.startWatcher(p)));
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
          return res.status(400).json({ error: 'basePath must be under the user home directory' });
        }
        try {
          const stat = await fs.stat(resolvedBase);
          if (!stat.isDirectory()) {
            return res.status(400).json({ error: 'basePath must point to an existing directory' });
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

// ==================== Project profile helpers ====================

const EXT_TO_LANG: Record<string, string> = {
  ts: 'TypeScript',
  tsx: 'TypeScript',
  js: 'JavaScript',
  jsx: 'JavaScript',
  mjs: 'JavaScript',
  cjs: 'JavaScript',
  svelte: 'Svelte',
  vue: 'Vue',
  py: 'Python',
  rb: 'Ruby',
  go: 'Go',
  rs: 'Rust',
  java: 'Java',
  kt: 'Kotlin',
  scala: 'Scala',
  c: 'C',
  h: 'C',
  cpp: 'C++',
  cc: 'C++',
  hpp: 'C++',
  cs: 'C#',
  swift: 'Swift',
  php: 'PHP',
  lua: 'Lua',
  ex: 'Elixir',
  exs: 'Elixir',
  erl: 'Erlang',
  hs: 'Haskell',
  ml: 'OCaml',
  zig: 'Zig',
  dart: 'Dart',
  r: 'R',
  m: 'Objective-C',
  sh: 'Shell',
  bash: 'Shell',
  zsh: 'Shell',
  fish: 'Shell',
  ps1: 'PowerShell',
  sql: 'SQL',
  html: 'HTML',
  css: 'CSS',
  scss: 'SCSS',
  sass: 'Sass',
  less: 'Less',
  md: 'Markdown',
  json: 'JSON',
  yaml: 'YAML',
  yml: 'YAML',
  toml: 'TOML'
};

const STACK_IGNORES = [
  'node_modules',
  '.git',
  'dist',
  'build',
  'target',
  'venv',
  '.venv',
  '.next',
  '.cache',
  'coverage',
  '__pycache__'
];

interface ProjectProfile {
  name: string;
  path: string;
  exists: boolean;
  languages: Array<{ name: string; files: number; percent: number }>;
  frameworks: string[];
  package_manager: string | null;
  runtime: string | null;
  git: {
    branch: string | null;
    first_commit_at: string | null;
    last_commit_at: string | null;
    last_commit_subject: string | null;
    remote: string | null;
    commits_total: number | null;
  } | null;
  filesystem: {
    created_at: string | null;
    modified_at: string | null;
  };
  raven: {
    first_seen_at: string | null;
    last_seen_at: string | null;
    last_agent_seen_at: string | null;
    lifetime_events: number;
    lifetime_agent_events: number;
  };
  top_edited_files: Array<{ filepath: string; edits: number }>;
  key_files: Array<{ name: string; present: boolean }>;
}

interface ProjectLike {
  name: string;
  path: string;
  ignorePatterns?: string[];
}

interface FileEventsRepoLike {
  lifetimeStatsByProject(): Map<
    string,
    {
      total_events: number;
      total_agent_events: number;
      first_seen_at: string | null;
      last_seen_at: string | null;
      last_agent_seen_at: string | null;
    }
  >;
  topEditedByProject(
    projectName: string,
    limit?: number
  ): Array<{ filepath: string; edits: number }>;
}

async function buildProjectProfile(
  project: ProjectLike,
  fileEventsRepo: FileEventsRepoLike
): Promise<ProjectProfile> {
  const { name, path } = project;

  let exists = false;
  let createdAt: string | null = null;
  let modifiedAt: string | null = null;
  try {
    const stat = await fs.stat(path);
    exists = stat.isDirectory();
    // birthtime isn't reliable on every FS — fall back to ctime if it's
    // epoch (the kernel's "I don't know" answer on ext4 without birthtime).
    const birth = stat.birthtime?.getTime?.() ?? 0;
    createdAt = new Date(birth > 0 ? birth : stat.ctimeMs).toISOString();
    modifiedAt = new Date(stat.mtimeMs).toISOString();
  } catch {
    /* path missing */
  }

  const ignores = Array.from(new Set([...STACK_IGNORES, ...(project.ignorePatterns ?? [])])).map(
    p => p.replace(/\/.*$/, '').replace(/\/$/, '')
  );

  const languages = exists ? await detectLanguages(path, ignores) : [];
  const { frameworks, packageManager, runtime } = exists
    ? await detectFrameworks(path)
    : { frameworks: [], packageManager: null, runtime: null };
  const git = exists ? await detectGit(path) : null;
  const keyFiles = exists ? await checkKeyFiles(path) : [];
  const stats = fileEventsRepo.lifetimeStatsByProject().get(name);
  const topEdited = fileEventsRepo.topEditedByProject(name, 5);

  return {
    name,
    path,
    exists,
    languages,
    frameworks,
    package_manager: packageManager,
    runtime,
    git,
    filesystem: { created_at: createdAt, modified_at: modifiedAt },
    raven: {
      first_seen_at: stats?.first_seen_at ?? null,
      last_seen_at: stats?.last_seen_at ?? null,
      last_agent_seen_at: stats?.last_agent_seen_at ?? null,
      lifetime_events: stats?.total_events ?? 0,
      lifetime_agent_events: stats?.total_agent_events ?? 0
    },
    top_edited_files: topEdited,
    key_files: keyFiles
  };
}

async function detectLanguages(
  path: string,
  ignores: string[]
): Promise<Array<{ name: string; files: number; percent: number }>> {
  // find -type f, build extension counts. Bounded so a giant tree doesn't
  // hang the request. Each ignore becomes a top-level prune.
  const args: string[] = [path];
  for (const ig of ignores) {
    if (ig) args.push('-name', ig, '-prune', '-o');
  }
  args.push('-type', 'f', '-print');
  let stdout = '';
  try {
    const result = await execFile('find', args, {
      timeout: 10_000,
      maxBuffer: 32 * 1024 * 1024
    });
    stdout = result.stdout;
  } catch {
    return [];
  }
  const counts = new Map<string, number>();
  for (const line of stdout.split('\n')) {
    if (!line) continue;
    const dot = line.lastIndexOf('.');
    const slash = line.lastIndexOf('/');
    if (dot < 0 || dot < slash) continue;
    const ext = line.slice(dot + 1).toLowerCase();
    const lang = EXT_TO_LANG[ext];
    if (!lang) continue;
    counts.set(lang, (counts.get(lang) ?? 0) + 1);
  }
  // Filter out the noise: if a project is overwhelmingly TypeScript, the
  // single .yaml file is irrelevant. Keep top languages and lump the rest
  // into 'Other' if there are many tail entries. Markdown/JSON/YAML are
  // demoted because they're ubiquitous and not really "the stack".
  const total = Array.from(counts.values()).reduce((s, n) => s + n, 0);
  if (total === 0) return [];
  const ranked = Array.from(counts.entries())
    .map(([n, c]) => ({ name: n, files: c, percent: Math.round((c / total) * 100) }))
    .sort((a, b) => b.files - a.files);
  return ranked.slice(0, 8);
}

async function detectFrameworks(
  path: string
): Promise<{ frameworks: string[]; packageManager: string | null; runtime: string | null }> {
  const frameworks: string[] = [];
  let packageManager: string | null = null;
  let runtime: string | null = null;

  // package.json — Node ecosystem.
  try {
    const pkgRaw = await fs.readFile(join(path, 'package.json'), 'utf-8');
    const pkg = JSON.parse(pkgRaw) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
      packageManager?: string;
    };
    runtime = 'Node.js';
    const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
    const has = (s: string) => Object.prototype.hasOwnProperty.call(deps, s);
    if (has('svelte') || has('@sveltejs/kit')) frameworks.push('Svelte');
    if (has('react')) frameworks.push('React');
    if (has('next')) frameworks.push('Next.js');
    if (has('vue')) frameworks.push('Vue');
    if (has('nuxt')) frameworks.push('Nuxt');
    if (has('astro')) frameworks.push('Astro');
    if (has('vite')) frameworks.push('Vite');
    if (has('webpack')) frameworks.push('Webpack');
    if (has('express')) frameworks.push('Express');
    if (has('fastify')) frameworks.push('Fastify');
    if (has('@nestjs/core')) frameworks.push('NestJS');
    if (has('hono')) frameworks.push('Hono');
    if (has('typescript')) frameworks.push('TypeScript');
    if (has('tailwindcss')) frameworks.push('Tailwind');
    if (has('vitest')) frameworks.push('Vitest');
    if (has('playwright') || has('@playwright/test')) frameworks.push('Playwright');
    if (pkg.packageManager) {
      packageManager = pkg.packageManager.split('@')[0];
    } else {
      try {
        await fs.access(join(path, 'pnpm-lock.yaml'));
        packageManager = 'pnpm';
      } catch {
        try {
          await fs.access(join(path, 'yarn.lock'));
          packageManager = 'yarn';
        } catch {
          packageManager = 'npm';
        }
      }
    }
  } catch {
    /* not a Node project */
  }

  // Other ecosystems: presence of marker files.
  const checks: Array<[string, string, string | null]> = [
    ['Cargo.toml', 'Rust', 'cargo'],
    ['go.mod', 'Go module', 'go mod'],
    ['pyproject.toml', 'Python', 'pip/poetry'],
    ['requirements.txt', 'Python', 'pip'],
    ['Pipfile', 'Python', 'pipenv'],
    ['Gemfile', 'Ruby', 'bundler'],
    ['composer.json', 'PHP', 'composer'],
    ['pom.xml', 'Maven', 'maven'],
    ['build.gradle', 'Gradle', 'gradle'],
    ['build.gradle.kts', 'Gradle (Kotlin DSL)', 'gradle'],
    ['mix.exs', 'Elixir/Phoenix', 'mix'],
    ['Dockerfile', 'Docker', null]
  ];
  for (const [file, label, pm] of checks) {
    try {
      await fs.access(join(path, file));
      if (!frameworks.includes(label)) frameworks.push(label);
      if (pm && !packageManager) packageManager = pm;
      if (!runtime) {
        if (label === 'Rust') runtime = 'Rust';
        else if (label.startsWith('Go')) runtime = 'Go';
        else if (label.startsWith('Python')) runtime = 'Python';
        else if (label.startsWith('Ruby')) runtime = 'Ruby';
        else if (label === 'PHP') runtime = 'PHP';
        else if (label.startsWith('Maven') || label.startsWith('Gradle')) runtime = 'JVM';
        else if (label.startsWith('Elixir')) runtime = 'Elixir';
      }
    } catch {
      /* missing */
    }
  }

  return { frameworks, packageManager, runtime };
}

async function detectGit(path: string): Promise<ProjectProfile['git']> {
  try {
    await fs.access(join(path, '.git'));
  } catch {
    return null;
  }
  const out: ProjectProfile['git'] = {
    branch: null,
    first_commit_at: null,
    last_commit_at: null,
    last_commit_subject: null,
    remote: null,
    commits_total: null
  };
  try {
    const r = await execFile('git', ['-C', path, 'branch', '--show-current'], { timeout: 5_000 });
    out.branch = r.stdout.trim() || null;
  } catch {
    /* ignore */
  }
  try {
    const r = await execFile('git', ['-C', path, 'log', '--reverse', '-1', '--format=%cI'], {
      timeout: 5_000
    });
    out.first_commit_at = r.stdout.trim() || null;
  } catch {
    /* ignore */
  }
  try {
    const r = await execFile('git', ['-C', path, 'log', '-1', '--format=%cI%n%s'], {
      timeout: 5_000
    });
    const [iso, subject] = r.stdout.split('\n');
    out.last_commit_at = iso?.trim() || null;
    out.last_commit_subject = subject?.trim() || null;
  } catch {
    /* ignore */
  }
  try {
    const r = await execFile('git', ['-C', path, 'config', '--get', 'remote.origin.url'], {
      timeout: 5_000
    });
    out.remote = r.stdout.trim() || null;
  } catch {
    /* ignore */
  }
  try {
    const r = await execFile('git', ['-C', path, 'rev-list', '--count', 'HEAD'], {
      timeout: 5_000
    });
    out.commits_total = parseInt(r.stdout.trim(), 10) || null;
  } catch {
    /* ignore */
  }
  return out;
}

async function checkKeyFiles(path: string): Promise<Array<{ name: string; present: boolean }>> {
  const candidates = [
    'README.md',
    'README',
    'LICENSE',
    'package.json',
    'tsconfig.json',
    'Cargo.toml',
    'go.mod',
    'pyproject.toml',
    'Dockerfile',
    'docker-compose.yml',
    '.env.example',
    'Makefile'
  ];
  const out: Array<{ name: string; present: boolean }> = [];
  for (const f of candidates) {
    try {
      await fs.access(join(path, f));
      out.push({ name: f, present: true });
    } catch {
      /* skip absent ones to keep the list signal-rich */
    }
  }
  return out;
}
