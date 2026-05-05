/**
 * Transparent Ollama proxy bootstrap.
 *
 * When TRANSPARENT_OLLAMA_PORT is set (typically 11434, Ollama's default),
 * Raven listens on Ollama's conventional port and forwards every request to
 * the real Ollama (now on OLLAMA_URL, e.g. http://127.0.0.1:11435). Lets
 * every tool that uses default Ollama settings be observed without per-app
 * config.
 *
 * Setup:  systemd override sets OLLAMA_HOST=127.0.0.1:11435 on Ollama,
 *         start.sh sets TRANSPARENT_OLLAMA_PORT=11434 + OLLAMA_URL to 11435.
 */

import express from 'express';
import type { Server as SocketIOServer } from 'socket.io';
import type { Server as HttpServer } from 'http';
import { logger } from '../utils/logger.js';
import { createOllamaProxyRouter } from '../routes/ollama-proxy.js';
import type { RavenDB } from '../db.js';
import type { AgentInfo } from '../types/agent-info.js';

interface TransparentOllamaDeps {
  port: number;
  bindHost: string;
  db: RavenDB;
  io: SocketIOServer;
  sessionId: string;
  agentRegistry: Map<string, AgentInfo>;
  getProjects: () => Array<{ name: string; path: string }>;
  agentEventsRepo: import('../repositories/agent-events-repository.js').AgentEventsRepository;
}

export function startTransparentOllamaProxy(deps: TransparentOllamaDeps): HttpServer | null {
  const { port, bindHost } = deps;
  if (port <= 0) return null;

  const transparentApp = express();
  transparentApp.use(express.json({ limit: '50mb' }));
  transparentApp.use(
    '/',
    createOllamaProxyRouter({
      db: deps.db,
      io: deps.io,
      logger,
      sessionId: deps.sessionId,
      agentRegistry: deps.agentRegistry,
      getProjects: deps.getProjects,
      agentEventsRepo: deps.agentEventsRepo
    })
  );

  const server = transparentApp.listen(port, bindHost);
  server.on('listening', () => {
    logger.info(
      `🔀 Transparent Ollama proxy: ${bindHost}:${port} → ${process.env.OLLAMA_URL || 'http://localhost:11434'}`
    );
  });
  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      // Ollama is bound to the proxy port already (the user hasn't set
      // OLLAMA_HOST=127.0.0.1:11435 in the systemd override). Without a
      // fallback, Raven would keep polling OLLAMA_URL (11435) where nothing
      // is listening and report Ollama as offline. Re-point OLLAMA_URL at the
      // proxy port so detection still works, just without telemetry interception.
      const fallbackUrl = `http://${bindHost}:${port}`;
      process.env.OLLAMA_URL = fallbackUrl;
      logger.warn(
        `Transparent Ollama proxy: port ${port} already in use — falling back to direct queries against ${fallbackUrl}. ` +
          `For full telemetry interception, set OLLAMA_HOST=127.0.0.1:11435 in /etc/systemd/system/ollama.service.d/override.conf and restart Ollama.`
      );
    } else {
      logger.error(`Transparent Ollama proxy: ${err.message}`);
    }
  });
  return server;
}
