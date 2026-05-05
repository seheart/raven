/**
 * Costs Routes
 * Token usage and cost tracking for Claude API sessions
 */

import express, { Request, Response, Router } from 'express';
import type { RavenDB } from '../db.js';
import { asyncHandler } from '../middleware/async-handler.js';
import { cacheMiddleware } from '../services/cache-service.js';
import { getModelFamily } from '../services/token-cost-calculator.js';

export function createCostsRouter(db: RavenDB): Router {
  const router = express.Router();

  /**
   * GET /api/costs/summary
   * Total cost summary with optional time range
   */
  router.get(
    '/summary',
    cacheMiddleware(5000),
    asyncHandler(async (req: Request, res: Response) => {
      const { start, end, project } = req.query;
      let query = `
        SELECT
          COUNT(*) as total_requests,
          COALESCE(SUM(input_tokens), 0) as total_input_tokens,
          COALESCE(SUM(output_tokens), 0) as total_output_tokens,
          COALESCE(SUM(cache_creation_tokens), 0) as total_cache_creation_tokens,
          COALESCE(SUM(cache_read_tokens), 0) as total_cache_read_tokens,
          COALESCE(SUM(estimated_cost_usd), 0) as total_cost_usd
        FROM token_usage WHERE 1=1
      `;
      const params: any[] = [];

      if (start) {
        query += ' AND timestamp >= ?';
        params.push(start);
      }
      if (end) {
        query += ' AND timestamp <= ?';
        params.push(end);
      }
      if (project) {
        query += ' AND project_name = ?';
        params.push(project);
      }

      const row = db.db.prepare(query).get(...params) as any;
      res.json({
        total_requests: row?.total_requests ?? 0,
        total_input_tokens: row?.total_input_tokens ?? 0,
        total_output_tokens: row?.total_output_tokens ?? 0,
        total_cache_creation_tokens: row?.total_cache_creation_tokens ?? 0,
        total_cache_read_tokens: row?.total_cache_read_tokens ?? 0,
        total_cost_usd: row?.total_cost_usd ?? 0
      });
    })
  );

  /**
   * GET /api/costs/by-project
   * Cost breakdown by project
   */
  router.get(
    '/by-project',
    cacheMiddleware(5000),
    asyncHandler(async (req: Request, res: Response) => {
      const { start, end } = req.query;
      let query = `
        SELECT
          project_name,
          COUNT(*) as requests,
          COALESCE(SUM(input_tokens), 0) as input_tokens,
          COALESCE(SUM(output_tokens), 0) as output_tokens,
          COALESCE(SUM(cache_read_tokens), 0) as cache_read_tokens,
          COALESCE(SUM(estimated_cost_usd), 0) as cost_usd
        FROM token_usage WHERE 1=1
      `;
      const params: any[] = [];

      if (start) {
        query += ' AND timestamp >= ?';
        params.push(start);
      }
      if (end) {
        query += ' AND timestamp <= ?';
        params.push(end);
      }

      query += ' GROUP BY project_name ORDER BY cost_usd DESC';

      const rows = db.db.prepare(query).all(...params);
      res.json(rows);
    })
  );

  /**
   * GET /api/costs/by-model
   * Cost breakdown by model
   */
  router.get(
    '/by-model',
    cacheMiddleware(5000),
    asyncHandler(async (req: Request, res: Response) => {
      const { start, end } = req.query;
      let query = `
        SELECT
          model,
          COUNT(*) as requests,
          COALESCE(SUM(input_tokens), 0) as input_tokens,
          COALESCE(SUM(output_tokens), 0) as output_tokens,
          COALESCE(SUM(estimated_cost_usd), 0) as cost_usd
        FROM token_usage WHERE 1=1
      `;
      const params: any[] = [];

      if (start) {
        query += ' AND timestamp >= ?';
        params.push(start);
      }
      if (end) {
        query += ' AND timestamp <= ?';
        params.push(end);
      }

      query += ' GROUP BY model ORDER BY cost_usd DESC';

      const rows = db.db.prepare(query).all(...params) as any[];
      res.json(
        rows.map(r => ({
          ...r,
          model_family: getModelFamily(r.model)
        }))
      );
    })
  );

  /**
   * GET /api/costs/by-session
   * Cost breakdown by session
   */
  router.get(
    '/by-session',
    cacheMiddleware(5000),
    asyncHandler(async (req: Request, res: Response) => {
      const { start, end, project, limit } = req.query;
      let query = `
        SELECT
          session_id,
          project_name,
          MIN(timestamp) as first_seen,
          MAX(timestamp) as last_seen,
          COUNT(*) as requests,
          COALESCE(SUM(input_tokens), 0) as input_tokens,
          COALESCE(SUM(output_tokens), 0) as output_tokens,
          COALESCE(SUM(estimated_cost_usd), 0) as cost_usd
        FROM token_usage WHERE 1=1
      `;
      const params: any[] = [];

      if (start) {
        query += ' AND timestamp >= ?';
        params.push(start);
      }
      if (end) {
        query += ' AND timestamp <= ?';
        params.push(end);
      }
      if (project) {
        query += ' AND project_name = ?';
        params.push(project);
      }

      query += ` GROUP BY session_id ORDER BY last_seen DESC LIMIT ?`;
      params.push(Number(limit) || 50);

      const rows = db.db.prepare(query).all(...params);
      res.json(rows);
    })
  );

  /**
   * GET /api/costs/timeline
   * Time series of cost data for charts
   */
  router.get(
    '/timeline',
    cacheMiddleware(10000),
    asyncHandler(async (req: Request, res: Response) => {
      const { start, end, project, bucket } = req.query;
      // Whitelist bucket formats to prevent SQL injection
      const bucketFormats: Record<string, string> = {
        hour: '%Y-%m-%dT%H',
        week: '%Y-%W',
        day: '%Y-%m-%d'
      };
      const bucketSize = bucketFormats[String(bucket)] || bucketFormats['day'];

      let query = `
        SELECT
          strftime('${bucketSize}', timestamp) as bucket,
          COUNT(*) as requests,
          COALESCE(SUM(input_tokens), 0) as input_tokens,
          COALESCE(SUM(output_tokens), 0) as output_tokens,
          COALESCE(SUM(cache_read_tokens), 0) as cache_read_tokens,
          COALESCE(SUM(estimated_cost_usd), 0) as cost_usd
        FROM token_usage WHERE 1=1
      `;
      const params: any[] = [];

      if (start) {
        query += ' AND timestamp >= ?';
        params.push(start);
      }
      if (end) {
        query += ' AND timestamp <= ?';
        params.push(end);
      }
      if (project) {
        query += ' AND project_name = ?';
        params.push(project);
      }

      query += ` GROUP BY bucket ORDER BY bucket ASC`;

      const rows = db.db.prepare(query).all(...params);
      res.json(rows);
    })
  );

  return router;
}
