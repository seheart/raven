/**
 * Ollama Proxy Router
 *
 * Forwards requests to Ollama at OLLAMA_URL while logging telemetry to Raven.
 * Tools point to http://localhost:9100/ollama instead of http://localhost:11434.
 */

import express, { Request, Response, Router } from 'express';
import rateLimit from 'express-rate-limit';
import type { Server as IOServer } from 'socket.io';
import type { RavenDB } from '../db.js';
import type { AgentEventsRepository } from '../repositories/agent-events-repository.js';
import { getAgentColor } from '../utils/agent-colors.js';
import { attributeConnection } from '../utils/process-attribution.js';
import { recordLoadHint } from '../services/recent-load-hints.js';

interface MinimalLogger {
  debug: (msg: string) => void;
  info: (msg: string) => void;
  warn: (msg: string) => void;
  error: (msg: string) => void;
}

interface OllamaProxyDeps {
  db: RavenDB;
  io: IOServer;
  logger: MinimalLogger;
  sessionId: string;
  agentRegistry: Map<string, any>;
  agentEventsRepo: AgentEventsRepository;
  ollamaUrl?: string;
  // Returns the current list of known projects so each inference can be
  // attributed to the project directory of the calling process.
  getProjects?: () => Array<{ name: string; path: string }>;
}

export function createOllamaProxyRouter(deps: OllamaProxyDeps): Router {
  const { io, logger, sessionId: SESSION_ID, agentRegistry, agentEventsRepo } = deps;
  const OLLAMA_URL = deps.ollamaUrl || process.env.OLLAMA_URL || 'http://localhost:11434';

  const router = express.Router();

  // Rate limiter — only limit inference endpoints (generate/chat), not health/tags
  const ollamaInferenceLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 10,
    message: { error: 'Ollama rate limit exceeded — max 10 inference requests per minute' },
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req: Request) => {
      const path = req.path;
      return path !== '/api/generate' && path !== '/api/chat';
    }
  });

  /**
   * Pull rich perf numbers out of Ollama's final response object.
   * Ollama returns durations in nanoseconds, which we convert to ms /
   * tokens-per-second so they're directly usable in the dashboard.
   * Missing fields → 0; tps is 0 if the corresponding duration is 0.
   */
  function extractMetrics(parsed: any) {
    const promptTokens = parsed.prompt_eval_count || 0;
    const genTokens = parsed.eval_count || 0;
    const promptDurNs = parsed.prompt_eval_duration || 0;
    const evalDurNs = parsed.eval_duration || 0;
    return {
      tokens: promptTokens + genTokens,
      prompt_tokens: promptTokens,
      gen_tokens: genTokens,
      prompt_tps: promptDurNs > 0 ? +(promptTokens / (promptDurNs / 1e9)).toFixed(2) : 0,
      gen_tps: evalDurNs > 0 ? +(genTokens / (evalDurNs / 1e9)).toFixed(2) : 0,
      load_ms: Math.round((parsed.load_duration || 0) / 1e6),
      prompt_ms: Math.round(promptDurNs / 1e6),
      gen_ms: Math.round(evalDurNs / 1e6),
      total_ms: Math.round((parsed.total_duration || 0) / 1e6)
    };
  }

  function registerAgent(modelName: string, incrementRequests: boolean) {
    if (!agentRegistry.has(modelName)) {
      agentRegistry.set(modelName, {
        agent_name: modelName,
        agent_type: 'ollama',
        is_running: true,
        last_seen: new Date().toISOString(),
        models_available: [modelName],
        requests_handled: 1,
        errors: 0,
        color: getAgentColor(modelName)
      });
    } else {
      const agent = agentRegistry.get(modelName)!;
      if (incrementRequests) agent.requests_handled++;
      agent.last_seen = new Date().toISOString();
      agent.is_running = true;
    }
  }

  router.all('/*', ollamaInferenceLimiter, async (req: Request, res: Response): Promise<any> => {
    // When mounted at /ollama, req.path here is the portion after /ollama (e.g. /api/chat)
    const ollamaPath = req.path;
    const targetUrl = `${OLLAMA_URL}${ollamaPath}`;
    const startTime = Date.now();

    // Resolve which project triggered this call by walking /proc from
    // the source TCP port. Best-effort, cached, falls back to null on
    // any error. Done for every request so we can attribute model
    // touches via /api/show, /api/embeddings, /api/pull etc — not just
    // inference. Tells us "who is keeping qwen warm" even when the
    // calling app is only polling for model info.
    let project: string | null = null;
    let attrPid: number | null = null;
    let attrCwd: string | null = null;
    if (req.socket.remotePort) {
      try {
        const projects = deps.getProjects?.() || [];
        const attr = await attributeConnection(req.socket.remotePort, projects);
        project = attr.project;
        attrPid = attr.pid;
        attrCwd = attr.cwd;
      } catch {
        project = null;
      }
    }

    // Record a hint so the local-model watcher can find the real loader
    // when Ollama swaps a model into VRAM. Without this, callers routed
    // through the proxy are invisible to /proc-scan attribution.
    const hintModel =
      typeof req.body?.model === 'string'
        ? req.body.model
        : typeof req.body?.name === 'string'
          ? req.body.name
          : null;
    // Only record a hint when we actually resolved a caller pid. A null
    // pid is useless to the watcher (consume-then-fall-through wastes a
    // ring slot) and signals attribution failure that /proc-scan is no
    // worse off recovering from.
    let removeHint: (() => void) | null = null;
    if (
      hintModel &&
      attrPid !== null &&
      (ollamaPath === '/api/chat' ||
        ollamaPath === '/api/generate' ||
        ollamaPath === '/api/embed' ||
        ollamaPath === '/api/embeddings')
    ) {
      removeHint = recordLoadHint({
        model: hintModel,
        pid: attrPid,
        cwd: attrCwd,
        project
      });
    }

    try {
      const fetchOptions: RequestInit = {
        method: req.method,
        headers: { 'Content-Type': 'application/json' }
      };

      if (req.method !== 'GET' && req.method !== 'HEAD') {
        fetchOptions.body = JSON.stringify(req.body);
      }

      const ollamaResponse = await fetch(targetUrl, fetchOptions);

      // 4xx/5xx means Ollama refused the request (model-not-found, OOM,
      // bad params) — no VRAM swap happened, so the hint must not survive
      // to mis-attribute a later real load of the same model. Network
      // errors fall through to the outer catch which also calls remover.
      if (!ollamaResponse.ok) removeHint?.();

      const isStreaming =
        req.body?.stream !== false &&
        (ollamaPath === '/api/generate' || ollamaPath === '/api/chat');

      if (isStreaming && ollamaResponse.body) {
        res.setHeader('Content-Type', 'application/x-ndjson');
        res.setHeader('Transfer-Encoding', 'chunked');

        const reader = ollamaResponse.body.getReader();
        const decoder = new TextDecoder();
        const modelName = req.body?.model || 'unknown';
        // Captured from the final NDJSON line where Ollama emits done:true
        // with all the eval_* and *_duration fields.
        let metrics = extractMetrics({});

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });

            try {
              res.write(chunk);
            } catch (writeErr: any) {
              logger.debug(`Ollama stream: client write failed (${writeErr?.message}), stopping`);
              break;
            }

            for (const line of chunk.split('\n').filter(Boolean)) {
              try {
                const parsed = JSON.parse(line);
                if (parsed.done && parsed.total_duration) {
                  metrics = extractMetrics(parsed);
                }
              } catch (parseErr: any) {
                logger.debug(`Ollama stream: NDJSON parse skip (${parseErr?.message})`);
              }
            }
          }
        } catch (readError: any) {
          logger.warn(`Ollama stream interrupted: ${readError.message}`);
        } finally {
          try {
            reader.cancel();
          } catch (cancelErr: any) {
            logger.debug(`Ollama stream: reader.cancel already closed (${cancelErr?.message})`);
          }
          try {
            res.end();
          } catch (endErr: any) {
            logger.debug(`Ollama stream: res.end already ended (${endErr?.message})`);
          }
        }

        const durationMs = Date.now() - startTime;
        agentEventsRepo.insert(
          new Date().toISOString(),
          modelName,
          'inference',
          null,
          null,
          durationMs,
          `${ollamaPath === '/api/chat' ? 'Chat' : 'Generate'} completion (${metrics.tokens} tokens, ${metrics.gen_tps} tps)`,
          {
            model: modelName,
            endpoint: ollamaPath,
            project,
            ...metrics,
            prompt_preview:
              typeof req.body?.prompt === 'string' ? req.body.prompt.substring(0, 100) : undefined
          },
          SESSION_ID,
          project
        );

        registerAgent(modelName, true);

        io.emit('agent-event', {
          type: 'inference',
          agent_name: modelName,
          duration_ms: durationMs,
          project,
          ...metrics,
          timestamp: new Date().toISOString()
        });

        logger.info(
          `🤖 Ollama ${modelName}${project ? ` [${project}]` : ''}: ${ollamaPath} (${metrics.tokens} tok, gen ${metrics.gen_tps} tps, ${durationMs}ms)`
        );
      } else {
        const data = await ollamaResponse.text();
        // Forward the upstream Content-Type so JSON callers don't see
        // text/html (Express's default when res.send() is given a string).
        // Ollama always returns application/json for non-streaming endpoints;
        // we forward the header verbatim if present, fall back to JSON if not.
        const upstreamContentType =
          ollamaResponse.headers.get('content-type') || 'application/json';
        res.setHeader('Content-Type', upstreamContentType);
        res.status(ollamaResponse.status).send(data);

        const durationMs = Date.now() - startTime;
        // /api/generate, /api/chat, /api/embeddings use `model`; /api/show,
        // /api/pull, /api/delete use `name`. Prefer either so api_call
        // rows carry the real model name (and thus surface in
        // /api/ollama/ps's last_project lookup).
        const modelName = req.body?.model || req.body?.name || 'Ollama';

        if (ollamaPath === '/api/generate' || ollamaPath === '/api/chat') {
          let metrics = extractMetrics({});
          try {
            metrics = extractMetrics(JSON.parse(data));
          } catch (parseErr: any) {
            logger.debug(`Ollama response parse skip (${parseErr?.message})`);
          }

          agentEventsRepo.insert(
            new Date().toISOString(),
            modelName,
            'inference',
            null,
            null,
            durationMs,
            `${ollamaPath === '/api/chat' ? 'Chat' : 'Generate'} completion (${metrics.tokens} tokens, ${metrics.gen_tps} tps)`,
            { model: modelName, endpoint: ollamaPath, project, ...metrics },
            SESSION_ID,
            project
          );

          registerAgent(modelName, true);

          io.emit('agent-event', {
            type: 'inference',
            agent_name: modelName,
            duration_ms: durationMs,
            project,
            ...metrics,
            timestamp: new Date().toISOString()
          });

          logger.info(
            `🤖 Ollama ${modelName}${project ? ` [${project}]` : ''}: ${ollamaPath} (${metrics.tokens} tok, gen ${metrics.gen_tps} tps, ${durationMs}ms)`
          );
        } else if (ollamaPath !== '/api/tags' && ollamaPath !== '/') {
          agentEventsRepo.insert(
            new Date().toISOString(),
            modelName,
            'api_call',
            null,
            null,
            durationMs,
            `Ollama API: ${req.method} ${ollamaPath}`,
            { endpoint: ollamaPath, method: req.method, project },
            SESSION_ID,
            project
          );
        }
      }
    } catch (error: any) {
      logger.error(`Ollama proxy error: ${error.message}`);
      removeHint?.();
      return res.status(502).json({
        error: 'Ollama not reachable',
        message: `Could not connect to ${OLLAMA_URL}. Is Ollama running?`
      });
    }
  });

  return router;
}
