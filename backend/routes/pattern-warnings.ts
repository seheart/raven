/**
 * Pattern Warnings Routes — `/api/pattern-warnings/*`
 *
 * Reads/resolves the persisted pattern-detection warnings, plus exposes the
 * loaded pattern catalog from the in-memory detector.
 */

import express, { Request, Response, Router } from 'express';
import { logger } from '../utils/logger.js';
import { safeInt } from '../utils/request-helpers.js';
import type { PatternWarningsRepository } from '../repositories/pattern-warnings-repository.js';
import { patternDetector } from '../pattern-detector.js';

export function createPatternWarningsRouter(repo: PatternWarningsRepository): Router {
  const router = express.Router();

  // GET / — unresolved warnings
  router.get('/', async (req: Request, res: Response) => {
    try {
      const limit = safeInt(req.query.limit, 100);
      const warnings = repo.list(limit);
      return res.json({ warnings, count: (warnings as unknown[]).length });
    } catch (error) {
      logger.error('[GET /api/pattern-warnings] Error:', error as Error);
      return res.status(500).json({ error: 'Failed to get pattern warnings' });
    }
  });

  // GET /count
  router.get('/count', async (_req: Request, res: Response) => {
    try {
      return res.json({ count: repo.countUnresolved() });
    } catch (error) {
      logger.error('[GET /api/pattern-warnings/count] Error:', error as Error);
      return res.status(500).json({ error: 'Failed to get pattern warning count' });
    }
  });

  // GET /category/:category
  router.get('/category/:category', async (req: Request, res: Response) => {
    try {
      const warnings = repo.byCategory(req.params.category);
      return res.json({ warnings, count: (warnings as unknown[]).length });
    } catch (error) {
      logger.error('[GET /api/pattern-warnings/category/:category] Error:', error as Error);
      return res.status(500).json({ error: 'Failed to get pattern warnings by category' });
    }
  });

  // POST /:id/resolve
  router.post('/:id/resolve', async (req: Request, res: Response) => {
    try {
      const warningId = parseInt(req.params.id, 10);
      if (isNaN(warningId)) {
        return res.status(400).json({ error: 'Invalid warning ID' });
      }
      repo.resolveById(warningId);
      return res.json({ success: true, message: 'Pattern warning marked as resolved' });
    } catch (error) {
      logger.error('[POST /api/pattern-warnings/:id/resolve] Error:', error as Error);
      return res.status(500).json({ error: 'Failed to resolve pattern warning' });
    }
  });

  // GET /ignores — list active false-positive suppressions
  router.get('/ignores', async (_req: Request, res: Response) => {
    try {
      const ignores = repo.listIgnores();
      return res.json({ ignores, count: ignores.length });
    } catch (error) {
      logger.error('[GET /api/pattern-warnings/ignores] Error:', error as Error);
      return res.status(500).json({ error: 'Failed to list ignores' });
    }
  });

  // DELETE /ignores/:id — un-ignore. The next file change re-detects.
  router.delete('/ignores/:id', async (req: Request, res: Response) => {
    try {
      const ignoreId = parseInt(req.params.id, 10);
      if (isNaN(ignoreId)) {
        return res.status(400).json({ error: 'Invalid ignore ID' });
      }
      repo.removeIgnore(ignoreId);
      return res.json({ success: true });
    } catch (error) {
      logger.error('[DELETE /api/pattern-warnings/ignores/:id] Error:', error as Error);
      return res.status(500).json({ error: 'Failed to remove ignore' });
    }
  });

  // POST /:id/ignore — durable suppression. Records the warning's
  // (filepath, pattern_id, match_text) so detection won't re-raise it,
  // then resolves any current rows that match.
  router.post('/:id/ignore', async (req: Request, res: Response) => {
    try {
      const warningId = parseInt(req.params.id, 10);
      if (isNaN(warningId)) {
        return res.status(400).json({ error: 'Invalid warning ID' });
      }
      const warning = repo.getById(warningId);
      if (!warning) {
        return res.status(404).json({ error: 'Warning not found' });
      }
      const reason = typeof req.body?.reason === 'string' ? req.body.reason : undefined;
      repo.addIgnore(warning.filepath, warning.pattern_id, warning.match_text, reason);
      const resolved = repo.resolveByKey(warning.filepath, warning.pattern_id, warning.match_text);
      return res.json({ success: true, resolved });
    } catch (error) {
      logger.error('[POST /api/pattern-warnings/:id/ignore] Error:', error as Error);
      return res.status(500).json({ error: 'Failed to ignore pattern warning' });
    }
  });

  // POST /resolve-all — bulk-resolve every unresolved warning. Powers the
  // SafetyPage's "Resolve All" button (which previously hit a non-existent
  // route and silently no-op'd).
  router.post('/resolve-all', async (_req: Request, res: Response) => {
    try {
      const resolved = repo.resolveAll();
      return res.json({ success: true, resolved });
    } catch (error) {
      logger.error('[POST /api/pattern-warnings/resolve-all] Error:', error as Error);
      return res.status(500).json({ error: 'Failed to resolve pattern warnings' });
    }
  });

  // GET /patterns — pattern catalog
  router.get('/patterns', async (_req: Request, res: Response) => {
    try {
      const patterns = patternDetector.getAllPatterns();
      return res.json({ patterns, count: patterns.length });
    } catch (error) {
      logger.error('[GET /api/pattern-warnings/patterns] Error:', error as Error);
      return res.status(500).json({ error: 'Failed to get patterns' });
    }
  });

  return router;
}
