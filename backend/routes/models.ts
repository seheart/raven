/**
 * Models Route — `/api/models`
 *
 * Per-agent activity rollup: combines agent_events stats, file-change
 * attribution, and registry metadata. Includes detected-but-no-events
 * agents (e.g. Ollama before first inference) so the UI sees them.
 */

import express, { Request, Response, Router } from 'express';
import { cacheMiddleware } from '../services/cache-service.js';
import { logger } from '../utils/logger.js';
import { getAgentColor } from '../utils/helpers.js';
import type { AgentEventsRepository } from '../repositories/agent-events-repository.js';
import type { AgentInfo } from '../types/agent-info.js';

interface ModelsRouterDeps {
  agentEventsRepo: AgentEventsRepository;
  agentRegistry: Map<string, AgentInfo>;
}

export function createModelsRouter({ agentEventsRepo, agentRegistry }: ModelsRouterDeps): Router {
  const router = express.Router();

  router.get('/', cacheMiddleware(5000), (_req: Request, res: Response) => {
    try {
      const agentStats = agentEventsRepo.agentStats();
      const attributionStats = agentEventsRepo.agentAttribution();
      const attrMap = new Map(attributionStats.map(a => [a.agent_source, a]));

      const models = agentStats.map(agent => {
        const registry =
          agentRegistry.get(agent.agent) || agentRegistry.get(agent.agent.replace(/ /g, '-'));
        const attr = attrMap.get(agent.agent);
        return {
          name: agent.agent,
          type: registry?.agent_type || 'unknown',
          color: registry?.color || getAgentColor(agent.agent),
          is_running: registry?.is_running || false,
          models_available: registry?.models_available || [],
          total_events: agent.total_events,
          inferences: agent.inferences,
          tool_calls: agent.tool_calls,
          responses: agent.responses,
          prompts: agent.prompts,
          avg_duration_ms: Math.round(agent.avg_duration_ms || 0),
          total_lines_changed: agent.total_lines_changed || 0,
          files_touched: agent.files_touched,
          file_changes: attr?.file_changes || 0,
          unique_files_changed: attr?.unique_files || 0,
          first_seen: agent.first_seen,
          last_active: agent.last_active
        };
      });

      // Detected-but-no-events agents (like Ollama before first use)
      const existingNames = new Set(models.map(m => m.name));
      for (const [, agent] of agentRegistry) {
        if (!existingNames.has(agent.agent_name)) {
          models.push({
            name: agent.agent_name,
            type: agent.agent_type,
            color: agent.color,
            is_running: agent.is_running,
            models_available: agent.models_available || [],
            total_events: 0,
            inferences: 0,
            tool_calls: 0,
            responses: 0,
            prompts: 0,
            avg_duration_ms: 0,
            total_lines_changed: 0,
            files_touched: 0,
            file_changes: 0,
            unique_files_changed: 0,
            first_seen: null,
            last_active: agent.last_seen
          });
        }
      }

      return res.json(models);
    } catch (error) {
      logger.error('Error getting model stats:', error as Error);
      return res.status(500).json({ error: 'Failed to get model stats' });
    }
  });

  return router;
}
