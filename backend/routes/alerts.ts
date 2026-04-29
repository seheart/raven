/**
 * Alerts Routes — `/api/alerts/*`
 *
 * Lists alert templates from disk and applies a chosen template.
 * Status endpoint currently returns a stub; real wiring to the trigger
 * engine is pending.
 */

import express, { Request, Response, Router } from 'express';
import { z } from 'zod';
import fs from 'fs/promises';
import { join } from 'path';
import { logger } from '../utils/logger.js';

const TemplateIdParam = z.object({
  templateId: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-zA-Z0-9_-]+$/, 'templateId must be alphanumeric / - / _')
});

interface AlertTemplate {
  name: string;
  description: string;
  icon: string;
  triggers: unknown[];
}

interface AlertTemplates {
  templates: Record<string, AlertTemplate>;
  metadata: {
    version: string;
    recommended: string;
    description: string;
  };
}

interface AlertsRouterDeps {
  templatesPath: string;
}

async function loadAlertTemplates(path: string): Promise<AlertTemplates> {
  try {
    const data = await fs.readFile(path, 'utf-8');
    try {
      return JSON.parse(data);
    } catch (parseError) {
      logger.error('Invalid JSON in alert templates file:', parseError as Error);
      throw new Error('Alert templates file contains invalid JSON');
    }
  } catch (error) {
    logger.error('Failed to load alert templates:', error as Error);
    throw new Error('Alert templates file not found or invalid');
  }
}

export function createAlertsRouter({ templatesPath }: AlertsRouterDeps): Router {
  const router = express.Router();

  router.get('/templates', async (_req: Request, res: Response) => {
    try {
      const templates = await loadAlertTemplates(templatesPath);
      return res.json(templates);
    } catch (error) {
      logger.error('[GET /api/alerts/templates] Error:', error as Error);
      return res.status(500).json({ error: 'Failed to load alert templates' });
    }
  });

  router.post('/templates/:templateId/apply', async (req: Request, res: Response) => {
    const parsed = TemplateIdParam.safeParse(req.params);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid templateId', issues: parsed.error.issues });
    }
    try {
      const { templateId } = parsed.data;
      const templates = await loadAlertTemplates(templatesPath);
      const template = templates.templates[templateId];
      if (!template) {
        return res.status(404).json({ error: 'Template not found' });
      }
      // Real wiring to trigger engine pending — return success-with-count for now.
      return res.json({
        success: true,
        template: templateId,
        triggersApplied: template.triggers.length
      });
    } catch (error) {
      logger.error('[POST /api/alerts/templates/:templateId/apply] Error:', error as Error);
      return res.status(500).json({ error: 'Failed to apply template' });
    }
  });

  router.get('/status', async (_req: Request, res: Response) => {
    try {
      // Stub — full implementation will query trigger engine.
      return res.json({
        enabled: true,
        activeTemplate: 'ai-safety-basic',
        triggersActive: 5,
        recentAlerts: []
      });
    } catch (error) {
      logger.error('[GET /api/alerts/status] Error:', error as Error);
      return res.status(500).json({ error: 'Failed to get alert status' });
    }
  });

  // expose path for tests / introspection
  router.get('/_meta', (_req, res) => res.json({ templatesPath: join(templatesPath) }));

  return router;
}
