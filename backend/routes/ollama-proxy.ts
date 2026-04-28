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
import { getAgentColor } from '../utils/agent-colors.js';

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
  ollamaUrl?: string;
}

export function createOllamaProxyRouter(deps: OllamaProxyDeps): Router {
  const { db, io, logger, sessionId: SESSION_ID, agentRegistry } = deps;
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

    try {
      const fetchOptions: RequestInit = {
        method: req.method,
        headers: { 'Content-Type': 'application/json' }
      };

      if (req.method !== 'GET' && req.method !== 'HEAD') {
        fetchOptions.body = JSON.stringify(req.body);
      }

      const ollamaResponse = await fetch(targetUrl, fetchOptions);
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
        db.insertAgentEvent(
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
            ...metrics,
            prompt_preview:
              typeof req.body?.prompt === 'string' ? req.body.prompt.substring(0, 100) : undefined
          },
          SESSION_ID,
          null
        );

        registerAgent(modelName, true);

        io.emit('agent-event', {
          type: 'inference',
          agent_name: modelName,
          duration_ms: durationMs,
          ...metrics,
          timestamp: new Date().toISOString()
        });

        logger.info(
          `🤖 Ollama ${modelName}: ${ollamaPath} (${metrics.tokens} tok, gen ${metrics.gen_tps} tps, ${durationMs}ms)`
        );
      } else {
        const data = await ollamaResponse.text();
        res.status(ollamaResponse.status).send(data);

        const durationMs = Date.now() - startTime;
        const modelName = req.body?.model || 'Ollama';

        if (ollamaPath === '/api/generate' || ollamaPath === '/api/chat') {
          let metrics = extractMetrics({});
          try {
            metrics = extractMetrics(JSON.parse(data));
          } catch (parseErr: any) {
            logger.debug(`Ollama response parse skip (${parseErr?.message})`);
          }

          db.insertAgentEvent(
            new Date().toISOString(),
            modelName,
            'inference',
            null,
            null,
            durationMs,
            `${ollamaPath === '/api/chat' ? 'Chat' : 'Generate'} completion (${metrics.tokens} tokens, ${metrics.gen_tps} tps)`,
            { model: modelName, endpoint: ollamaPath, ...metrics },
            SESSION_ID,
            null
          );

          registerAgent(modelName, true);

          io.emit('agent-event', {
            type: 'inference',
            agent_name: modelName,
            duration_ms: durationMs,
            ...metrics,
            timestamp: new Date().toISOString()
          });

          logger.info(
            `🤖 Ollama ${modelName}: ${ollamaPath} (${metrics.tokens} tok, gen ${metrics.gen_tps} tps, ${durationMs}ms)`
          );
        } else if (ollamaPath !== '/api/tags' && ollamaPath !== '/') {
          db.insertAgentEvent(
            new Date().toISOString(),
            modelName,
            'api_call',
            null,
            null,
            durationMs,
            `Ollama API: ${req.method} ${ollamaPath}`,
            { endpoint: ollamaPath, method: req.method },
            SESSION_ID,
            null
          );
        }
      }
    } catch (error: any) {
      logger.error(`Ollama proxy error: ${error.message}`);
      return res.status(502).json({
        error: 'Ollama not reachable',
        message: `Could not connect to ${OLLAMA_URL}. Is Ollama running?`
      });
    }
  });

  return router;
}
