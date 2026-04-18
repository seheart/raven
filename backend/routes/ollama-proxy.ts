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

export interface OllamaProxyDeps {
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
        let totalTokens = 0;

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
                  totalTokens = (parsed.prompt_eval_count || 0) + (parsed.eval_count || 0);
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
          `${ollamaPath === '/api/chat' ? 'Chat' : 'Generate'} completion (${totalTokens} tokens)`,
          {
            model: modelName,
            tokens: totalTokens,
            endpoint: ollamaPath,
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
          tokens: totalTokens,
          timestamp: new Date().toISOString()
        });

        logger.info(
          `🤖 Ollama ${modelName}: ${ollamaPath} (${totalTokens} tokens, ${durationMs}ms)`
        );
      } else {
        const data = await ollamaResponse.text();
        res.status(ollamaResponse.status).send(data);

        const durationMs = Date.now() - startTime;
        const modelName = req.body?.model || 'Ollama';

        if (ollamaPath === '/api/generate' || ollamaPath === '/api/chat') {
          let tokens = 0;
          try {
            const parsed = JSON.parse(data);
            tokens = (parsed.prompt_eval_count || 0) + (parsed.eval_count || 0);
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
            `${ollamaPath === '/api/chat' ? 'Chat' : 'Generate'} completion (${tokens} tokens)`,
            { model: modelName, tokens, endpoint: ollamaPath },
            SESSION_ID,
            null
          );

          registerAgent(modelName, true);

          io.emit('agent-event', {
            type: 'inference',
            agent_name: modelName,
            duration_ms: durationMs,
            tokens,
            timestamp: new Date().toISOString()
          });

          logger.info(`🤖 Ollama ${modelName}: ${ollamaPath} (${tokens} tokens, ${durationMs}ms)`);
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
