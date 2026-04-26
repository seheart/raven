import express, { Request, Response, Router } from 'express';
import os from 'os';
import { execFile } from 'child_process';
import { promisify } from 'util';
import type { RavenDB } from '../db.js';

const execFileP = promisify(execFile);

interface SystemDeps {
  db: RavenDB;
  agentRegistry: Map<string, unknown>;
  ollamaUrl?: string;
}

const ROUTE_SUMMARIES: Record<string, string> = {
  '/api/health': 'Server health probe',
  '/api/health-checks': 'Aggregated component health checks',
  '/api/session-id': 'Current Raven session identifier',
  '/api/rate-limit-status': 'Rate-limiter snapshot',
  '/api/network-info': 'LAN-accessible IPv4 addresses',
  '/api/session': 'Live session context (files, diffs, alerts)',
  '/api/git': 'Git repo status, diff, branches, history',
  '/api/insights': 'Session insights and digests',
  '/api/costs': 'Token usage and cost breakdown',
  '/api/subagents': 'Subagent orchestration trees',
  '/api/analysis/code-health': 'Self-analysis (code health) runs',
  '/api/session-activity': 'Conversation timeline',
  '/api/system': 'System introspection (this page)',
  '/ollama': 'Ollama proxy with telemetry'
};

function summaryFor(path: string): string {
  for (const prefix of Object.keys(ROUTE_SUMMARIES).sort((a, b) => b.length - a.length)) {
    if (path === prefix || path.startsWith(prefix + '/')) return ROUTE_SUMMARIES[prefix];
  }
  return '';
}

interface RouteEntry {
  methods: string[];
  path: string;
  summary: string;
}

function collectRoutes(app: any): RouteEntry[] {
  const out: RouteEntry[] = [];
  const seen = new Set<string>();

  // Express 4: app._router.stack ; Express 5: app.router.stack
  const stack = (app as any)._router?.stack || (app as any).router?.stack;
  if (!stack) return out;

  const walk = (layer: any, prefix: string) => {
    if (layer.route) {
      const routePath = layer.route.path;
      // Skip regex routes (e.g., SPA fallback `app.get(/^\/(?!api\/).*/)`).
      if (typeof routePath !== 'string' || routePath.startsWith('/^')) return;
      const path = prefix + routePath;
      const methods = Object.keys(layer.route.methods || {})
        .filter(m => layer.route.methods[m])
        .map(m => m.toUpperCase());
      const key = methods.join(',') + ' ' + path;
      if (!seen.has(key)) {
        seen.add(key);
        out.push({ methods, path, summary: summaryFor(path) });
      }
    } else if (layer.name === 'router' && layer.handle?.stack) {
      const mountPath = layer.regexp?.fast_slash
        ? ''
        : extractMountPath(layer);
      for (const sub of layer.handle.stack) walk(sub, prefix + mountPath);
    }
  };

  for (const layer of stack) walk(layer, '');
  return out.sort((a, b) => a.path.localeCompare(b.path));
}

function extractMountPath(layer: any): string {
  // Express stores the mount path in layer.regexp; rebuild from source if possible.
  if (typeof layer.path === 'string') return layer.path;
  const src = layer.regexp?.toString() || '';
  // Match "/^\/api\/git\/?(?=\/|$)/i" → "/api/git"
  const m = src.match(/^\/\^([^?]+?)\\\/\?\(\?=/);
  if (m) return m[1].replace(/\\\//g, '/');
  return '';
}

async function probeNvidia(): Promise<{
  gpu: string | null;
  vram_total_mib: number | null;
  vram_free_mib: number | null;
}> {
  try {
    const { stdout } = await execFileP(
      'nvidia-smi',
      ['--query-gpu=name,memory.total,memory.free', '--format=csv,noheader,nounits'],
      { timeout: 2000 }
    );
    const line = stdout.trim().split('\n')[0];
    if (!line) return { gpu: null, vram_total_mib: null, vram_free_mib: null };
    const [name, total, free] = line.split(',').map(s => s.trim());
    return {
      gpu: name || null,
      vram_total_mib: Number(total) || null,
      vram_free_mib: Number(free) || null
    };
  } catch {
    return { gpu: null, vram_total_mib: null, vram_free_mib: null };
  }
}

async function probeDisk(): Promise<{ total_gib: number | null; free_gib: number | null }> {
  try {
    // Node 18.15+ has fs.statfs
    const fsMod: any = await import('fs/promises');
    if (typeof fsMod.statfs === 'function') {
      const s = await fsMod.statfs('/');
      const total = (s.blocks * s.bsize) / 1024 ** 3;
      const free = (s.bavail * s.bsize) / 1024 ** 3;
      return { total_gib: total, free_gib: free };
    }
  } catch {
    // fall through
  }
  return { total_gib: null, free_gib: null };
}

export function createSystemRouter(deps: SystemDeps): Router {
  const router = express.Router();
  const ollamaUrl = deps.ollamaUrl || process.env.OLLAMA_URL || 'http://localhost:11434';

  router.get('/tables', (_req: Request, res: Response) => {
    try {
      const tables = deps.db.db
        .prepare(
          `SELECT name FROM sqlite_master
             WHERE type='table' AND name NOT LIKE 'sqlite_%'
             ORDER BY name`
        )
        .all() as Array<{ name: string }>;

      const result = tables.map(({ name }) => {
        const cols = deps.db.db
          .prepare(`PRAGMA table_info("${name}")`)
          .all() as Array<{ name: string; type: string }>;
        const countRow = deps.db.db
          .prepare(`SELECT COUNT(*) AS c FROM "${name}"`)
          .get() as { c: number };
        return {
          name,
          row_count: countRow.c,
          columns: cols.map(c => c.name)
        };
      });

      return res.json({ tables: result });
    } catch (error: any) {
      return res.status(500).json({ error: error.message });
    }
  });

  router.get('/routes', (req: Request, res: Response) => {
    try {
      const routes = collectRoutes(req.app);
      return res.json({ routes });
    } catch (error: any) {
      return res.status(500).json({ error: error.message });
    }
  });

  router.get('/hardware', async (_req: Request, res: Response) => {
    try {
      const cpus = os.cpus();
      const cpu = cpus[0]?.model || 'unknown';
      const cores = cpus.length;
      const ram_gib = os.totalmem() / 1024 ** 3;
      const ram_free_gib = os.freemem() / 1024 ** 3;
      const platform = os.platform();
      const kernel = os.release();
      const arch = os.arch();
      const hostname = os.hostname();

      const [{ gpu, vram_total_mib, vram_free_mib }, disk] = await Promise.all([
        probeNvidia(),
        probeDisk()
      ]);

      const vram_total_gib = vram_total_mib != null ? vram_total_mib / 1024 : null;
      const vram_free_gib = vram_free_mib != null ? vram_free_mib / 1024 : null;
      // ~85% of free VRAM is realistically usable for a model load (Ollama overhead).
      const vram_usable_gib = vram_free_gib != null ? vram_free_gib * 0.85 : null;

      return res.json({
        cpu,
        cores,
        ram_gib,
        ram_free_gib,
        gpu,
        vram_total_gib,
        vram_free_gib,
        vram_usable_gib,
        disk_total_gib: disk.total_gib,
        disk_free_gib: disk.free_gib,
        os: platform,
        kernel,
        arch,
        hostname
      });
    } catch (error: any) {
      return res.status(500).json({ error: error.message });
    }
  });

  router.get('/models', async (_req: Request, res: Response) => {
    try {
      const tagsRes = await fetch(`${ollamaUrl}/api/tags`, {
        signal: AbortSignal.timeout(3000)
      });
      if (!tagsRes.ok) {
        return res.json({ models: [], usable_vram_gib: null, error: `ollama: ${tagsRes.status}` });
      }
      const data = (await tagsRes.json()) as {
        models?: Array<{
          name: string;
          size?: number;
          details?: { parameter_size?: string; quantization_level?: string; family?: string };
        }>;
      };

      // Probe VRAM once to compute fit.
      const { vram_free_mib, vram_total_mib } = await probeNvidia();
      const usable_vram_gib =
        vram_free_mib != null ? (vram_free_mib / 1024) * 0.85 : null;
      const vram_total_gib = vram_total_mib != null ? vram_total_mib / 1024 : null;

      const models = (data.models || []).map(m => {
        const size_gb = m.size != null ? m.size / 1024 ** 3 : null;
        let fit: 'fits' | 'tight' | 'overflow' | 'unknown' = 'unknown';
        if (size_gb != null && usable_vram_gib != null && vram_total_gib != null) {
          if (size_gb <= usable_vram_gib) fit = 'fits';
          else if (size_gb <= vram_total_gib) fit = 'tight';
          else fit = 'overflow';
        }
        return {
          name: m.name,
          size_gb,
          params: m.details?.parameter_size || null,
          quantization: m.details?.quantization_level || null,
          family: m.details?.family || null,
          fit
        };
      });

      return res.json({ models, usable_vram_gib, vram_total_gib });
    } catch (error: any) {
      return res.json({ models: [], error: error.message });
    }
  });

  router.get('/introspection', (req: Request, res: Response) => {
    try {
      const tables = deps.db.db
        .prepare(
          `SELECT COUNT(*) AS c FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`
        )
        .get() as { c: number };
      const routeCount = collectRoutes(req.app).length;

      return res.json({
        platform_label: `${os.platform()} ${os.arch()} · Node ${process.versions.node}`,
        agent_count: deps.agentRegistry.size,
        table_count: tables.c,
        endpoint_count: routeCount,
        node_version: process.versions.node,
        uptime_seconds: process.uptime(),
        pid: process.pid
      });
    } catch (error: any) {
      return res.status(500).json({ error: error.message });
    }
  });

  return router;
}
