/**
 * Insights Routes — LLM-powered activity analysis
 */

import express, { Request, Response, Router } from 'express';
import { asyncHandler } from '../middleware/async-handler.js';
import type { InsightsService } from '../services/insights-service.js';

export function createInsightsRouter(insightsService: InsightsService): Router {
  const router = express.Router();

  /**
   * GET /api/insights — List recent insights
   */
  router.get(
    '/',
    asyncHandler(async (req: Request, res: Response) => {
      const type = req.query.type as string | undefined;
      const limit = Math.min(parseInt(req.query.limit as string, 10) || 20, 100);
      const insights = insightsService.getInsights(type, limit);
      res.json(insights);
    })
  );

  /**
   * GET /api/insights/latest — Get the latest insight of a type
   */
  router.get(
    '/latest',
    asyncHandler(async (req: Request, res: Response) => {
      const type = (req.query.type as string) || 'session_summary';
      const insight = insightsService.getLatest(type);
      res.json(insight || {});
    })
  );

  /**
   * GET /api/insights/status — Check Ollama availability and generation state
   */
  router.get(
    '/status',
    asyncHandler(async (req: Request, res: Response) => {
      const available = await insightsService.isAvailable();
      const models = available ? await insightsService.getModels() : [];
      res.json({
        available,
        generating: insightsService.isGenerating(),
        models
      });
    })
  );

  /**
   * POST /api/insights/generate/summary — Generate a session summary
   */
  router.post(
    '/generate/summary',
    asyncHandler(async (req: Request, res: Response) => {
      const windowMinutes = Math.min(parseInt(req.body?.windowMinutes, 10) || 60, 1440);
      const insight = await insightsService.generateSummary(windowMinutes);
      if (!insight) {
        res.status(202).json({ message: 'No activity to summarize or generation in progress' });
        return;
      }
      res.json(insight);
    })
  );

  /**
   * POST /api/insights/generate/review — Generate a code review
   */
  router.post(
    '/generate/review',
    asyncHandler(async (req: Request, res: Response) => {
      const insight = await insightsService.generateCodeReview();
      if (!insight) {
        res.status(202).json({ message: 'No recent diffs to review or generation in progress' });
        return;
      }
      res.json(insight);
    })
  );

  /**
   * PUT /api/insights/model — Change the Ollama model
   */
  router.put(
    '/model',
    asyncHandler(async (req: Request, res: Response) => {
      const { model } = req.body;
      if (!model) {
        res.status(400).json({ error: 'model is required' });
        return;
      }
      const available = await insightsService.getModels();
      if (!available.includes(model)) {
        res.status(400).json({ error: 'model not found in Ollama', available });
        return;
      }
      insightsService.setModel(model);
      res.json({ model });
    })
  );

  return router;
}
