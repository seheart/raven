/**
 * Callbacks for the LocalModelWatcher.
 *
 * Four hooks: model-detected, status-change, heartbeat, and load-event.
 * Each updates the agent registry, fans out a websocket event, and (for
 * load-event) attempts process attribution by snapshotting Ollama-bound
 * TCP connections.
 */

import type { Server as SocketIOServer } from 'socket.io';
import type { RavenDB } from '../db.js';
import type { AgentInfo } from '../types/agent-info.js';
import type { AgentEventsRepository } from '../repositories/agent-events-repository.js';
import { logger } from '../utils/logger.js';
import { getAgentColor } from '../utils/agent-colors.js';
import {
  findPidsByDestPort,
  getProcessCwd,
  getProcessCmd,
  cwdToProject
} from '../utils/process-attribution.js';
import { findLoadHint } from './recent-load-hints.js';

interface LocalModel {
  name: string;
  type: string;
  status: 'running' | 'stopped' | 'unknown';
  models: string[];
  lastChecked: string;
}

interface ModelLoadEvent {
  endpoint: string;
  model: string;
  observedAt: string;
}

interface CallbacksDeps {
  db: RavenDB;
  io: SocketIOServer;
  sessionId: string;
  agentRegistry: Map<string, AgentInfo>;
  getProjects: () => Array<{ name: string; path: string }>;
  agentEventsRepo: AgentEventsRepository;
}

interface LocalModelCallbacks {
  onModelDetected: (model: LocalModel) => void;
  onStatusChange: (model: LocalModel, previousStatus: string) => void;
  onHeartbeat: (model: LocalModel) => void;
  onModelLoaded: (loadEvent: ModelLoadEvent) => Promise<void>;
}

export function createLocalModelCallbacks(deps: CallbacksDeps): LocalModelCallbacks {
  const { io, sessionId, agentRegistry, getProjects, agentEventsRepo } = deps;

  const onModelDetected = (model: LocalModel) => {
    logger.info(
      `🤖 Local model detected: ${model.name} (${model.models.join(', ') || 'no models loaded'})`
    );
    if (!agentRegistry.has(model.name)) {
      agentRegistry.set(model.name, {
        agent_name: model.name,
        agent_type: model.type,
        is_running: model.status === 'running',
        last_seen: model.lastChecked,
        models_available: model.models,
        requests_handled: 0,
        errors: 0,
        color: getAgentColor(model.name)
      });
    } else {
      const existing = agentRegistry.get(model.name)!;
      existing.is_running = model.status === 'running';
      existing.last_seen = model.lastChecked;
      existing.models_available = model.models;
    }
    io.emit('agent-event', {
      type: 'model_detected',
      agent_name: model.name,
      models: model.models,
      status: model.status,
      timestamp: model.lastChecked
    });
  };

  const onStatusChange = (model: LocalModel, previousStatus: string) => {
    logger.info(`🤖 Model status change: ${model.name} ${previousStatus} → ${model.status}`);
    const existing = agentRegistry.get(model.name);
    if (existing) {
      existing.is_running = model.status === 'running';
      existing.last_seen = model.lastChecked;
      existing.models_available = model.models;
    }
    io.emit('model-status-changed', {
      name: model.name,
      type: model.type,
      status: model.status,
      previousStatus,
      models: model.models,
      timestamp: model.lastChecked
    });
  };

  /**
   * Heartbeat fires every successful scan while the model is running. Silently
   * refresh registry state so last_seen and models_available stay current
   * without log/notification spam.
   */
  const onHeartbeat = (model: LocalModel) => {
    const existing = agentRegistry.get(model.name);
    if (existing) {
      existing.is_running = model.status === 'running';
      existing.last_seen = model.lastChecked;
      existing.models_available = model.models;
    }
  };

  /**
   * Model just transitioned absent → resident. Snapshot active TCP
   * connections to Ollama (127.0.0.1:11435) and try to find the loading
   * process. Catches direct-Ollama callers (e.g., `ollama run` from a
   * terminal, Aider, Continue) that bypass Raven's proxy and would
   * otherwise be invisible to attribution.
   */
  const onModelLoaded = async (loadEvent: ModelLoadEvent) => {
    try {
      const ollamaPort = parseInt(
        (process.env.OLLAMA_URL || 'http://127.0.0.1:11434').split(':').pop() || '11434',
        10
      );
      // Prefer a fresh proxy-side hint over /proc scanning. The proxy
      // captures pid/cwd from the actual incoming socket, which catches
      // containerized callers and short-lived clients that the /proc
      // scan misses (and avoids picking the wrong long-lived keep-alive
      // connection when several apps talk to Ollama).
      const hint = findLoadHint(loadEvent.model);
      let loader: {
        pid: number;
        cwd: string | null;
        cmd: string | null;
        project: string | null;
      } | null = null;

      if (hint && hint.pid !== null) {
        const cmd = await getProcessCmd(hint.pid);
        loader = { pid: hint.pid, cwd: hint.cwd, cmd, project: hint.project };
      } else {
        const pids = await findPidsByDestPort(ollamaPort);
        const ravenPid = process.pid;
        const candidates: Array<{
          pid: number;
          cwd: string | null;
          cmd: string | null;
          project: string | null;
        }> = [];
        for (const pid of pids) {
          if (pid === ravenPid) continue;
          const cwd = await getProcessCwd(pid);
          const cmd = await getProcessCmd(pid);
          const project = cwdToProject(cwd, getProjects());
          candidates.push({ pid, cwd, cmd, project });
        }
        loader = candidates.find(c => c.project) ?? candidates[0] ?? null;
      }

      agentEventsRepo.insert(
        loadEvent.observedAt,
        loadEvent.model,
        'model_load',
        null,
        null,
        null,
        loader?.cwd
          ? `${loadEvent.model} loaded by ${loader.project ?? `pid ${loader.pid}`} (${loader.cwd})`
          : `${loadEvent.model} loaded (loader not captured)`,
        {
          endpoint: loadEvent.endpoint,
          loader_pid: loader?.pid ?? null,
          loader_cwd: loader?.cwd ?? null,
          loader_cmd: loader?.cmd ?? null,
          project: loader?.project ?? null
        },
        sessionId,
        loader?.project ?? null
      );

      logger.info(
        `📥 Model loaded: ${loadEvent.model}${loader?.project ? ` [${loader.project}]` : loader?.cmd ? ` [${loader.cmd.slice(0, 40)}]` : ' (loader unknown)'}`
      );

      io.emit('model-loaded', {
        model: loadEvent.model,
        endpoint: loadEvent.endpoint,
        project: loader?.project ?? null,
        loader_cwd: loader?.cwd ?? null,
        loader_cmd: loader?.cmd ?? null,
        timestamp: loadEvent.observedAt
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn(`Model load attribution failed: ${msg}`);
    }
  };

  return { onModelDetected, onStatusChange, onHeartbeat, onModelLoaded };
}
