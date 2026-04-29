/**
 * Insights Routes — LLM-powered activity analysis
 */

import express, { Request, Response, Router } from 'express';
import { asyncHandler } from '../middleware/async-handler.js';
import type { InsightsService } from '../services/insights-service.js';
import type { RavenDB } from '../db.js';
import type { DiffRiskRepository } from '../repositories/diff-risk-repository.js';

export function createInsightsRouter(
  insightsService: InsightsService,
  db: RavenDB,
  diffRiskRepo: DiffRiskRepository
): Router {
  const router = express.Router();

  // GET /api/insights — List recent insights
  router.get(
    '/',
    asyncHandler(async (req: Request, res: Response) => {
      const type = req.query.type as string | undefined;
      const limit = Math.min(parseInt(req.query.limit as string, 10) || 20, 100);
      const insights = insightsService.getInsights(type, limit);
      res.json(insights);
    })
  );

  // GET /api/insights/latest
  router.get(
    '/latest',
    asyncHandler(async (req: Request, res: Response) => {
      const type = (req.query.type as string) || 'session_summary';
      const insight = insightsService.getLatest(type);
      res.json(insight || {});
    })
  );

  // GET /api/insights/status
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

  // POST /api/insights/generate/summary
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

  // POST /api/insights/generate/review
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

  // POST /api/insights/generate/digest — Generate daily digest
  router.post(
    '/generate/digest',
    asyncHandler(async (req: Request, res: Response) => {
      const insight = await insightsService.generateDailyDigest();
      if (!insight) {
        res.status(202).json({ message: 'No activity to digest or generation in progress' });
        return;
      }
      res.json(insight);
    })
  );

  // POST /api/insights/generate/agent-comparison
  router.post(
    '/generate/agent-comparison',
    asyncHandler(async (req: Request, res: Response) => {
      const insight = await insightsService.generateAgentComparison();
      if (!insight) {
        res.status(202).json({ message: 'No agent data or generation in progress' });
        return;
      }
      res.json(insight);
    })
  );

  // POST /api/insights/generate/project-health
  router.post(
    '/generate/project-health',
    asyncHandler(async (req: Request, res: Response) => {
      const { projectName } = req.body;
      if (!projectName) {
        res.status(400).json({ error: 'projectName is required' });
        return;
      }
      const insight = await insightsService.generateProjectHealth(projectName);
      if (!insight) {
        res.status(202).json({ message: 'No project data or generation in progress' });
        return;
      }
      res.json(insight);
    })
  );

  // GET /api/insights/diff-risk-scores
  router.get(
    '/diff-risk-scores',
    asyncHandler(async (req: Request, res: Response) => {
      const limit = Math.min(parseInt(req.query.limit as string, 10) || 20, 50);
      const scores = diffRiskRepo.recent(limit);
      res.json(scores);
    })
  );

  // PUT /api/insights/model
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
