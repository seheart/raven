/**
 * Dev Routes — `/api/dev/*`
 *
 * Synthetic-data injection for visual evaluation of the LLM Lab UI without
 * burning real GPU time. Nothing here writes to the database — events are
 * only emitted over the websocket and disappear on refresh.
 */

import express, { Request, Response, Router } from 'express';
import { z } from 'zod';
import type { Server as SocketIOServer } from 'socket.io';

const SeedInferencesSchema = z.object({
  count: z.coerce.number().int().min(1).max(100).optional(),
  intervalMs: z.coerce.number().int().min(100).max(5000).optional(),
  model: z.string().min(1).max(200).optional()
});

interface ModelProfile {
  model: string;
  genTpsRange: [number, number];
  promptTpsRange: [number, number];
  avgTokens: number;
}

const PROFILES: ModelProfile[] = [
  { model: 'qwen2.5-coder:14b', genTpsRange: [22, 32], promptTpsRange: [180, 240], avgTokens: 80 },
  { model: 'gemma3:12b', genTpsRange: [25, 35], promptTpsRange: [150, 220], avgTokens: 60 },
  { model: 'llama3.1:8b', genTpsRange: [40, 60], promptTpsRange: [300, 450], avgTokens: 100 },
  { model: 'qwen2.5-coder:32b', genTpsRange: [8, 14], promptTpsRange: [60, 110], avgTokens: 120 },
  { model: 'llama3.3:70b', genTpsRange: [4, 8], promptTpsRange: [25, 50], avgTokens: 150 }
];

const rand = (min: number, max: number) => min + Math.random() * (max - min);

export function createDevRouter(io: SocketIOServer): Router {
  const router = express.Router();

  // POST /api/dev/seed-inferences { count?, intervalMs?, model? }
  router.post('/seed-inferences', (req: Request, res: Response) => {
    const parsed = SeedInferencesSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid payload', issues: parsed.error.issues });
    }
    const count = parsed.data.count ?? 15;
    const intervalMs = parsed.data.intervalMs ?? 600;
    const modelFilter = parsed.data.model ?? null;
    const filtered: ModelProfile[] = modelFilter
      ? [
          PROFILES.find(p => p.model === modelFilter) || {
            model: modelFilter,
            genTpsRange: [20, 30],
            promptTpsRange: [150, 220],
            avgTokens: 80
          }
        ]
      : PROFILES;

    let fired = 0;
    const fireOne = () => {
      const p = filtered[Math.floor(Math.random() * filtered.length)];
      const genTps = +rand(p.genTpsRange[0], p.genTpsRange[1]).toFixed(2);
      const promptTps = +rand(p.promptTpsRange[0], p.promptTpsRange[1]).toFixed(2);
      const genTokens = Math.floor(rand(p.avgTokens * 0.5, p.avgTokens * 1.6));
      const promptTokens = Math.floor(rand(20, 150));
      const genMs = Math.round((genTokens / genTps) * 1000);
      const promptMs = Math.round((promptTokens / promptTps) * 1000);
      const totalMs = genMs + promptMs + Math.floor(rand(20, 80));

      io.emit('agent-event', {
        type: 'inference',
        agent_name: p.model,
        duration_ms: totalMs,
        tokens: promptTokens + genTokens,
        prompt_tokens: promptTokens,
        gen_tokens: genTokens,
        prompt_tps: promptTps,
        gen_tps: genTps,
        load_ms: 0,
        prompt_ms: promptMs,
        gen_ms: genMs,
        total_ms: totalMs,
        timestamp: new Date().toISOString()
      });

      fired++;
      if (fired < count) setTimeout(fireOne, intervalMs);
    };

    setTimeout(fireOne, 50);
    return res.json({ seeding: count, interval_ms: intervalMs });
  });

  return router;
}
