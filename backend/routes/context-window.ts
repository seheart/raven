/**
 * Context Window Routes
 *
 * Surfaces the current conversation context size for each active
 * Claude/Codex session — what powers the "context window vessel"
 * visualization on Today. Per-row context size is approximated as the
 * most recent inference's `input_tokens + cache_read_tokens`, which
 * for Claude API requests reflects the full conversation up to and
 * including the latest turn.
 */

import express, { Request, Response, Router } from 'express';
import type { TokenUsageRepository } from '../repositories/token-usage-repository.js';
import { asyncHandler } from '../middleware/async-handler.js';
import { cacheMiddleware } from '../services/cache-service.js';

interface ContextWindow {
  session_id: string;
  model: string;
  model_family: string;
  project_name: string | null;
  last_seen: string;
  /** Approximate current context = input_tokens + cache_read_tokens of last turn. */
  context_tokens: number;
  /** Configured context limit for the model family (in tokens). */
  context_limit: number;
  /** 0..1 fraction of the limit used. */
  fraction: number;
  /** Bucket for visual cue: ok|warm|tight|overflow. */
  band: 'ok' | 'warm' | 'tight' | 'overflow';
}

/**
 * Hardcoded context limits per model family. We don't want to make
 * a network call to fetch this on every render, and limits change
 * rarely enough that this lookup table is a fine source of truth.
 * Falls back to 200k (Claude default) for unknown families.
 */
const LIMITS_BY_FAMILY: Record<string, number> = {
  'claude-opus': 200_000,
  'claude-sonnet': 200_000,
  'claude-haiku': 200_000,
  'gpt-4': 128_000,
  'gpt-4o': 128_000,
  'gpt-5': 200_000,
  'gpt-codex': 200_000,
  'qwen2.5-coder': 32_768,
  qwen3: 32_768,
  'llama3.1': 128_000,
  'llama3.3': 128_000,
  gemma3: 8_192,
  'nomic-embed-text': 2_048
};

/** Fall back to a generous default rather than mis-coloring an unknown model. */
const DEFAULT_LIMIT = 200_000;

function familyOf(model: string): string {
  if (!model) return 'unknown';
  // Claude 4.x: claude-opus-4-7 / claude-sonnet-4-6 / claude-haiku-4-5-...
  // Older: claude-3-opus / claude-3-5-sonnet
  const lower = model.toLowerCase();
  if (lower.startsWith('claude-')) {
    if (lower.includes('opus')) return 'claude-opus';
    if (lower.includes('sonnet')) return 'claude-sonnet';
    if (lower.includes('haiku')) return 'claude-haiku';
    return 'claude-opus'; // generic Claude defaults to 200k
  }
  if (lower.startsWith('gpt-')) {
    if (lower.includes('codex')) return 'gpt-codex';
    if (lower.startsWith('gpt-5')) return 'gpt-5';
    if (lower.startsWith('gpt-4o')) return 'gpt-4o';
    return 'gpt-4';
  }
  // Ollama models — strip the tag suffix (':14b', ':7b-instruct-q5_K_M').
  const head = lower.split(':')[0];
  if (head in LIMITS_BY_FAMILY) return head;
  // Match prefixes: 'qwen2.5-coder-14b' → 'qwen2.5-coder'
  for (const fam of Object.keys(LIMITS_BY_FAMILY)) {
    if (head.startsWith(fam)) return fam;
  }
  return 'unknown';
}

function limitFor(family: string): number {
  return LIMITS_BY_FAMILY[family] ?? DEFAULT_LIMIT;
}

function bandFor(fraction: number): ContextWindow['band'] {
  if (fraction >= 1) return 'overflow';
  if (fraction >= 0.85) return 'tight';
  if (fraction >= 0.5) return 'warm';
  return 'ok';
}

export function createContextWindowRouter(tokenUsageRepo: TokenUsageRepository): Router {
  const router = express.Router();

  /**
   * GET /api/context/current?limit=N
   *
   * Returns the most recent N sessions that have token_usage rows in
   * the last 30 minutes. For each: the latest inference's input +
   * cache-read tokens (≈ current context size) and the model's
   * configured limit.
   */
  router.get(
    '/current',
    cacheMiddleware(3000),
    asyncHandler(async (req: Request, res: Response) => {
      const limit = Math.min(parseInt(req.query.limit as string, 10) || 5, 20);
      const sinceIso = new Date(Date.now() - 30 * 60 * 1000).toISOString();

      const rows = tokenUsageRepo.recentSessionContexts(sinceIso, limit);

      const windows: ContextWindow[] = rows.map(r => {
        const family = familyOf(r.model || '');
        const ctxLimit = limitFor(family);
        const ctxTokens = (r.input_tokens || 0) + (r.cache_read_tokens || 0);
        const fraction = ctxLimit > 0 ? Math.min(1.5, ctxTokens / ctxLimit) : 0;
        return {
          session_id: r.session_id,
          model: r.model || 'unknown',
          model_family: family,
          project_name: r.project_name,
          last_seen: r.last_seen,
          context_tokens: ctxTokens,
          context_limit: ctxLimit,
          fraction,
          band: bandFor(fraction)
        };
      });

      res.json(windows);
    })
  );

  return router;
}
