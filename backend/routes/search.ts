/**
 * Search Routes — `/api/search/*`
 */

import express, { Request, Response, Router } from 'express';
import { logger } from '../utils/logger.js';
import { safeInt } from '../utils/request-helpers.js';
import type { SearchRepository, SearchResultItem } from '../repositories/search-repository.js';

export function createSearchRouter(repo: SearchRepository): Router {
  const router = express.Router();

  // GET /api/search/global?q=...&limit=...
  router.get('/global', (req: Request, res: Response) => {
    try {
      const query = (req.query.q as string) || '';
      const limit = safeInt(req.query.limit, 100);

      if (query.length < 2) {
        return res.json({ results: [], total: 0, categories: {} });
      }

      const results = repo.globalSearch(query, limit);
      const limited = results.slice(0, limit);

      const categories = {
        events: count(results, 'event'),
        agents: count(results, 'agent'),
        conversations: count(results, 'conversation'),
        errors: count(results, 'error'),
        notifications: count(results, 'notification')
      };

      return res.json({ results: limited, total: results.length, categories });
    } catch (error) {
      logger.error('❌ Global search error:', error as Error);
      const message = error instanceof Error ? error.message : String(error);
      return res.status(500).json({ error: message });
    }
  });

  return router;
}

function count(results: SearchResultItem[], type: SearchResultItem['type']): number {
  let n = 0;
  for (const r of results) if (r.type === type) n++;
  return n;
}
