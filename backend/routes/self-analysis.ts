/**
 * Self-Analysis API Routes
 * Exposes code health analysis data and triggers on-demand runs
 */

import express, { Request, Response } from 'express';
import { SelfAnalysisService } from '../services/self-analysis.js';

export function createSelfAnalysisRouter(analysisService: SelfAnalysisService) {
  const router = express.Router();

  /**
   * Get latest analysis run with full check details
   * GET /api/analysis/code-health
   */
  router.get('/', (req: Request, res: Response) => {
    try {
      const latest = analysisService.getLatestRun();
      const history = analysisService.getRunHistory(20);

      res.json({
        latest,
        history,
        is_running: analysisService.isRunning()
      });
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to get analysis data', message: error.message });
    }
  });

  /**
   * Check if analysis is currently running
   * GET /api/analysis/code-health/status
   */
  router.get('/status', (req: Request, res: Response) => {
    res.json({ is_running: analysisService.isRunning() });
  });

  /**
   * Trigger an on-demand analysis run
   * POST /api/analysis/code-health/run
   */
  router.post('/run', async (req: Request, res: Response): Promise<void> => {
    try {
      if (analysisService.isRunning()) {
        res.status(409).json({ error: 'Analysis already in progress' });
        return;
      }

      // Start the analysis asynchronously and return immediately
      res.json({
        status: 'started',
        message: 'Analysis started. Poll GET /api/analysis/code-health for results.'
      });

      // Run in background (don't await — response already sent)
      analysisService.runAnalysis().catch(() => {
        // Logged inside the service
      });
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to start analysis', message: error.message });
    }
  });

  /**
   * Get a specific analysis run
   * GET /api/analysis/code-health/:id
   */
  router.get('/:id', (req: Request, res: Response): void => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) {
        res.status(400).json({ error: 'Invalid run ID' });
        return;
      }

      const run = analysisService.getRun(id);
      if (!run) {
        res.status(404).json({ error: 'Run not found' });
        return;
      }

      res.json(run);
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to get analysis run', message: error.message });
    }
  });

  return router;
}
