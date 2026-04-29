/**
 * Ollama Routes — `/api/ollama/*` and `/api/gpu`
 *
 *  - /api/ollama/ps        currently resident models (VRAM, TTL)
 *  - /api/ollama/library   installed model catalog (size, family, quant)
 *  - /api/gpu              nvidia-smi metrics
 *
 * When Ollama is offline these endpoints return `{ ollama_status: 'offline' }`
 * with HTTP 200, not 5xx — Ollama is treated as optional.
 */

import express, { Request, Response, Router } from 'express';
import { spawn } from 'child_process';
import { cacheMiddleware } from '../services/cache-service.js';
import type { AgentEventsRepository } from '../repositories/agent-events-repository.js';

const OLLAMA_INTERNAL_URL = process.env.OLLAMA_URL || 'http://localhost:11434';

interface OllamaPsModel {
  name: string;
  size: number;
  size_vram: number;
  expires_at?: string;
  details?: {
    parameter_size?: string;
    quantization_level?: string;
    family?: string;
  };
}

interface OllamaTagsModel {
  name: string;
  size: number;
  modified_at?: string;
  details?: {
    parameter_size?: string;
    quantization_level?: string;
    family?: string;
  };
}

export function createOllamaDetailRouter(agentEventsRepo: AgentEventsRepository): Router {
  const router = express.Router();

  // GET /api/ollama/ps — resident-in-VRAM models with attribution
  router.get('/ollama/ps', cacheMiddleware(2000), async (_req: Request, res: Response) => {
    try {
      const r = await fetch(`${OLLAMA_INTERNAL_URL}/api/ps`, {
        signal: AbortSignal.timeout(3000)
      });
      if (!r.ok) return res.status(502).json({ error: `Ollama returned ${r.status}` });
      const data = (await r.json()) as { models?: OllamaPsModel[] };

      const models = (data.models || []).map(m => {
        const proj = agentEventsRepo.lastProjectForModel(m.name);
        const load = agentEventsRepo.lastModelLoad(m.name);
        return {
          name: m.name,
          size: m.size,
          size_vram: m.size_vram,
          vram_pct_of_model: m.size > 0 ? +((m.size_vram / m.size) * 100).toFixed(1) : 0,
          expires_at: m.expires_at,
          parameter_size: m.details?.parameter_size,
          quantization: m.details?.quantization_level,
          family: m.details?.family,
          last_project: proj?.project ?? null,
          last_loaded_by: load
            ? { project: load.project, cmd: load.cmd, cwd: load.cwd, at: load.timestamp }
            : null
        };
      });
      return res.json({ models, count: models.length, ollama_status: 'online' });
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      return res.json({ models: [], count: 0, ollama_status: 'offline', detail });
    }
  });

  // GET /api/ollama/library — installed model catalog
  router.get('/ollama/library', cacheMiddleware(30000), async (_req: Request, res: Response) => {
    try {
      const r = await fetch(`${OLLAMA_INTERNAL_URL}/api/tags`, {
        signal: AbortSignal.timeout(3000)
      });
      if (!r.ok) return res.status(502).json({ error: `Ollama returned ${r.status}` });
      const data = (await r.json()) as { models?: OllamaTagsModel[] };
      const models = (data.models || []).map(m => ({
        name: m.name,
        size: m.size,
        modified_at: m.modified_at,
        parameter_size: m.details?.parameter_size,
        quantization: m.details?.quantization_level,
        family: m.details?.family
      }));
      return res.json({ models, count: models.length, ollama_status: 'online' });
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      return res.json({ models: [], count: 0, ollama_status: 'offline', detail });
    }
  });

  // GET /api/gpu — nvidia-smi snapshot
  router.get('/gpu', cacheMiddleware(2000), async (_req: Request, res: Response) => {
    const fields = [
      'name',
      'memory.total',
      'memory.used',
      'memory.free',
      'utilization.gpu',
      'utilization.memory',
      'temperature.gpu',
      'power.draw',
      'power.limit'
    ];
    const proc = spawn('nvidia-smi', [
      `--query-gpu=${fields.join(',')}`,
      '--format=csv,noheader,nounits'
    ]);
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (b: Buffer) => (stdout += b.toString()));
    proc.stderr.on('data', (b: Buffer) => (stderr += b.toString()));
    proc.on('close', (code: number) => {
      if (code !== 0) {
        return res.status(503).json({
          error: 'nvidia-smi failed',
          detail: stderr.trim() || `exit ${code}`,
          gpus: []
        });
      }
      const gpus = stdout
        .trim()
        .split('\n')
        .map(line => {
          const v = line.split(',').map(s => s.trim());
          const total = parseFloat(v[1]) || 0;
          const used = parseFloat(v[2]) || 0;
          return {
            name: v[0],
            vram_total_mib: total,
            vram_used_mib: used,
            vram_free_mib: parseFloat(v[3]) || 0,
            vram_pct: total > 0 ? +((used / total) * 100).toFixed(1) : 0,
            gpu_util_pct: parseFloat(v[4]) || 0,
            mem_util_pct: parseFloat(v[5]) || 0,
            temp_c: parseFloat(v[6]) || 0,
            power_draw_w: parseFloat(v[7]) || 0,
            power_limit_w: parseFloat(v[8]) || 0
          };
        });
      return res.json({ gpus, count: gpus.length });
    });
    proc.on('error', (err: Error) => {
      return res.status(503).json({
        error: 'nvidia-smi unavailable (NVIDIA GPU + drivers required)',
        detail: err.message,
        gpus: []
      });
    });
  });

  return router;
}
