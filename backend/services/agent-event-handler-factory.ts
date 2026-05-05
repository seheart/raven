/**
 * Agent event handler factory — produces the dispatcher used by
 * ClaudeLogWatcher and CodexLogWatcher (and friends). Each watcher emits
 * the same event shape; only the agent identity differs.
 *
 * Lives outside `server.ts` so the routing/wiring file stays small.
 */

import type { Server as SocketIOServer } from 'socket.io';
import type { RavenDB } from '../db.js';
import type { AgentInfo } from '../types/agent-info.js';
import type { ApiLatencyRepository } from '../repositories/api-latency-repository.js';
import { logger } from '../utils/logger.js';
import { getAgentColor } from '../utils/agent-colors.js';
import { calculateCost } from './token-cost-calculator.js';

interface FactoryDeps {
  db: RavenDB;
  io: SocketIOServer;
  sessionId: string;
  agentRegistry: Map<string, AgentInfo>;
  apiLatencyRepo: ApiLatencyRepository;
}

interface HandlerOptions {
  agentName: string;
  agentType: string;
  colorKey: string;
}

interface AgentLogEvent {
  type: string;
  timestamp?: string;
  eventCategory?:
    | 'file_change'
    | 'agent_event'
    | 'conversation'
    | 'token_usage'
    | 'subagent'
    | 'api_latency';
  file?: string;
  path?: string;
  tool?: string;
  content?: string;
  sessionId?: string;
  projectName?: string;
  // token_usage
  inputTokens?: number;
  outputTokens?: number;
  cacheCreationTokens?: number;
  cacheReadTokens?: number;
  model?: string;
  requestId?: string;
  agentId?: string;
  // subagent
  uuid?: string;
  parentUuid?: string;
  subagentType?: string;
  description?: string;
  // api_latency
  latency_ms?: number;
}

export function createAgentEventHandlerFactory({
  db,
  io,
  sessionId,
  agentRegistry,
  apiLatencyRepo
}: FactoryDeps) {
  return function createAgentEventHandler(opts: HandlerOptions) {
    const { agentName, agentType, colorKey } = opts;

    return (event: AgentLogEvent) => {
      const timestamp = event.timestamp || new Date().toISOString();
      const category = event.eventCategory || 'file_change';

      // Register/update agent in registry
      if (!agentRegistry.has(agentName)) {
        if (agentRegistry.size >= 100) {
          const oldestKey = agentRegistry.keys().next().value;
          if (oldestKey) agentRegistry.delete(oldestKey);
        }
        agentRegistry.set(agentName, {
          agent_name: agentName,
          agent_type: agentType,
          is_running: true,
          last_seen: timestamp,
          models_available: [],
          requests_handled: 0,
          errors: 0,
          color: getAgentColor(colorKey)
        });
        logger.info(`✅ ${agentName} registered in agent registry`);
      }

      const status = agentRegistry.get(agentName);
      if (!status) return;
      if (!status.last_seen || new Date(timestamp) > new Date(status.last_seen)) {
        status.last_seen = timestamp;
      }
      status.requests_handled++;
      status.is_running = true;

      // agent_event — tool calls, tool results
      if (category === 'agent_event') {
        try {
          db.db
            .prepare(
              `INSERT INTO agent_events (timestamp, agent, event_type, file, message, session_id, project_name)
               VALUES (?, ?, ?, ?, ?, ?, ?)`
            )
            .run(
              timestamp,
              agentName,
              event.type,
              event.file || event.path || null,
              event.tool ? `${event.tool} call` : event.type,
              event.sessionId || sessionId,
              event.projectName || null
            );
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          logger.debug(`Failed to store agent event: ${msg}`);
        }
      }

      // conversation — user / assistant turns
      if (category === 'conversation') {
        try {
          db.db
            .prepare(
              `INSERT INTO agent_events (timestamp, agent, event_type, message, session_id, project_name)
               VALUES (?, ?, ?, ?, ?, ?)`
            )
            .run(
              timestamp,
              agentName,
              event.type,
              (event.content || '').slice(0, 500),
              event.sessionId || sessionId,
              event.projectName || null
            );
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          logger.debug(`Failed to store conversation: ${msg}`);
        }
      }

      // token_usage — usage and cost (also updates subagent_tree if applicable)
      if (category === 'token_usage') {
        try {
          const usage = {
            input_tokens: event.inputTokens || 0,
            output_tokens: event.outputTokens || 0,
            cache_creation_input_tokens: event.cacheCreationTokens || 0,
            cache_read_input_tokens: event.cacheReadTokens || 0
          };
          const cost = calculateCost(event.model || 'unknown', usage);

          db.db
            .prepare(
              `INSERT INTO token_usage (timestamp, session_id, project_name, model, input_tokens, output_tokens, cache_creation_tokens, cache_read_tokens, estimated_cost_usd, request_id, agent_id)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
            )
            .run(
              timestamp,
              event.sessionId || sessionId,
              event.projectName || null,
              event.model || 'unknown',
              usage.input_tokens,
              usage.output_tokens,
              usage.cache_creation_input_tokens,
              usage.cache_read_input_tokens,
              cost,
              event.requestId || null,
              event.agentId || null
            );

          if (event.agentId) {
            try {
              db.db
                .prepare(
                  `UPDATE subagent_tree SET
                     total_input_tokens = total_input_tokens + ?,
                     total_output_tokens = total_output_tokens + ?,
                     estimated_cost_usd = estimated_cost_usd + ?,
                     model = COALESCE(model, ?)
                   WHERE agent_id = ? AND session_id = ?`
                )
                .run(
                  usage.input_tokens,
                  usage.output_tokens,
                  cost,
                  event.model || null,
                  event.agentId,
                  event.sessionId || sessionId
                );
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err);
              logger.debug(`Failed to update subagent token counts for ${event.agentId}: ${msg}`);
            }
          }

          io.emit('token-usage', {
            timestamp,
            model: event.model,
            input_tokens: usage.input_tokens,
            output_tokens: usage.output_tokens,
            cache_creation_tokens: usage.cache_creation_input_tokens,
            cache_read_tokens: usage.cache_read_input_tokens,
            estimated_cost_usd: cost,
            project_name: event.projectName,
            session_id: event.sessionId
          });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          logger.debug(`Failed to store token usage: ${msg}`);
        }
      }

      // subagent — sub-agent spawn
      if (category === 'subagent') {
        try {
          db.db
            .prepare(
              `INSERT INTO subagent_tree (session_id, agent_id, parent_agent_id, agent_type, description, model, started_at, project_name)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)
               ON CONFLICT(session_id, agent_id) DO UPDATE SET
                 parent_agent_id = COALESCE(excluded.parent_agent_id, parent_agent_id),
                 agent_type = COALESCE(excluded.agent_type, agent_type),
                 description = COALESCE(excluded.description, description),
                 model = COALESCE(excluded.model, model)`
            )
            .run(
              event.sessionId || sessionId,
              event.uuid || `agent_${Date.now()}`,
              event.parentUuid || null,
              event.subagentType || 'general-purpose',
              event.description || null,
              event.model || null,
              timestamp,
              event.projectName || null
            );

          io.emit('subagent-spawn', {
            timestamp,
            agent_id: event.uuid,
            parent_agent_id: event.parentUuid,
            agent_type: event.subagentType,
            description: event.description,
            model: event.model,
            session_id: event.sessionId,
            project_name: event.projectName
          });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          logger.debug(`Failed to store subagent spawn: ${msg}`);
        }
      }

      // api_latency
      if (category === 'api_latency' && typeof event.latency_ms === 'number') {
        try {
          apiLatencyRepo.insert(
            timestamp,
            event.sessionId || sessionId,
            event.projectName || null,
            event.model || null,
            event.latency_ms
          );

          io.emit('api-latency', {
            timestamp,
            latency_ms: event.latency_ms,
            model: event.model,
            session_id: event.sessionId,
            project_name: event.projectName
          });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          logger.debug(`Failed to store API latency: ${msg}`);
        }
      }

      // Realtime fan-out for the AI Pulse UI.
      // tool/message let the UI render readable labels (e.g. "Read · file.ts").
      io.emit('agent-event', {
        type: event.type,
        agent_name: agentName,
        file: event.file || event.path,
        tool: event.tool || null,
        message: event.tool ? `${event.tool} call` : event.type,
        content: event.content ? String(event.content).slice(0, 200) : null,
        timestamp: timestamp,
        event_type: event.type
      });
    };
  };
}
