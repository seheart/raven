/**
 * Local Model Watcher Service
 *
 * Monitors local AI model activity by watching their log directories
 * and API endpoints. Supports Ollama, LM Studio, llama.cpp, and any
 * model that writes logs or exposes a local API.
 *
 * Detection strategy:
 * 1. Watch known log directories (e.g., ~/.ollama/logs)
 * 2. Poll local model APIs (e.g., http://localhost:11434 for Ollama)
 * 3. Accept telemetry via POST /telemetry from any tool
 */

import { logger } from '../utils/logger.js';
import fs from 'fs/promises';
import { join } from 'path';
import os from 'os';

interface ModelEndpoint {
  name: string;
  url: string;
  type: 'ollama' | 'lm-studio' | 'llamacpp' | 'generic';
  modelsPath?: string;
}

interface DetectedModel {
  name: string;
  type: string;
  endpoint?: string;
  status: 'running' | 'stopped' | 'unknown';
  models: string[]; // installed library (what's available)
  resident?: string[]; // currently loaded into VRAM (subset of installed)
  lastChecked: string;
}

interface ModelLoadEvent {
  endpoint: string; // 'Ollama' etc. — which service has the new model
  model: string;
  observedAt: string;
}

// Known local model endpoints and their detection methods. URLs are read
// lazily on each poll so the transparent-ollama-proxy fallback (which mutates
// OLLAMA_URL after a port conflict) takes effect on the very next scan.
function getKnownEndpoints(): ModelEndpoint[] {
  return [
    {
      name: 'Ollama',
      url: process.env.OLLAMA_URL || 'http://localhost:11434',
      type: 'ollama',
      modelsPath: join(os.homedir(), '.ollama', 'models')
    },
    {
      name: 'LM Studio',
      url: process.env.LM_STUDIO_URL || 'http://localhost:1234',
      type: 'lm-studio'
    },
    {
      name: 'llama.cpp',
      url: process.env.LLAMA_CPP_URL || 'http://localhost:8080',
      type: 'llamacpp'
    }
  ];
}

export class LocalModelWatcher {
  private pollInterval: ReturnType<typeof setInterval> | null = null;
  private detectedModels: Map<string, DetectedModel> = new Map();
  private onModelDetected: ((model: DetectedModel) => void) | null = null;
  private onModelStatusChanged: ((model: DetectedModel, previousStatus: string) => void) | null =
    null;
  private onModelHeartbeat: ((model: DetectedModel) => void) | null = null;
  private onModelLoaded: ((event: ModelLoadEvent) => void) | null = null;
  // Per-endpoint set of models we observed resident on the previous
  // scan. Diff against the next scan tells us "what just got loaded."
  private prevResidentByEndpoint: Map<string, Set<string>> = new Map();
  private pollMs: number;
  private idlePollMs: number;
  private isIdle: boolean = false;

  constructor(pollMs: number = 30000, idlePollMs: number = 300000) {
    this.pollMs = pollMs;
    this.idlePollMs = idlePollMs; // 5 minutes when idle
  }

  /**
   * Switch between active and idle polling rates.
   * Call setIdle(true) when no agents are running to reduce GPU wake-ups.
   */
  setIdle(idle: boolean): void {
    if (idle === this.isIdle) return;
    this.isIdle = idle;
    const newInterval = idle ? this.idlePollMs : this.pollMs;
    logger.info(
      `Local model watcher: switching to ${idle ? 'idle' : 'active'} polling (${newInterval / 1000}s)`
    );

    // Restart the interval at the new rate
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = setInterval(() => {
        this.scan().catch(err => logger.error('Model scan failed:', err));
      }, newInterval);
    }
  }

  /**
   * Start watching for local models.
   *
   * - `callback` fires once when a model first transitions to running.
   * - `statusCallback` fires when a model transitions running ↔ stopped.
   * - `heartbeatCallback` fires on every successful scan while a model is
   *   running, so consumers can keep `last_seen` / models list fresh
   *   without triggering log/notification side-effects each tick.
   * - `loadedCallback` fires when a specific model transitions from
   *   absent → resident in `/api/ps`. Lets consumers snapshot active
   *   TCP connections and attribute the loader, even when the load
   *   came from a tool that bypassed Raven's proxy.
   */
  async start(
    callback?: (model: DetectedModel) => void,
    statusCallback?: (model: DetectedModel, previousStatus: string) => void,
    heartbeatCallback?: (model: DetectedModel) => void,
    loadedCallback?: (event: ModelLoadEvent) => void
  ): Promise<void> {
    this.onModelDetected = callback || null;
    this.onModelStatusChanged = statusCallback || null;
    this.onModelHeartbeat = heartbeatCallback || null;
    this.onModelLoaded = loadedCallback || null;

    // Initial scan
    await this.scan();

    // Poll periodically
    this.pollInterval = setInterval(() => {
      this.scan().catch(err => logger.error('Model scan failed:', err));
    }, this.pollMs);

    logger.info(`Local model watcher started (polling every ${this.pollMs / 1000}s)`);
  }

  /**
   * Stop watching
   */
  stop(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
    logger.info('Local model watcher stopped');
  }

  /**
   * Scan all known endpoints for running models
   */
  async scan(): Promise<DetectedModel[]> {
    const results: DetectedModel[] = [];

    for (const endpoint of getKnownEndpoints()) {
      try {
        const model = await this.checkEndpoint(endpoint);
        if (model) {
          const existing = this.detectedModels.get(endpoint.name);
          const wasNew = !existing || existing.status !== 'running';

          this.detectedModels.set(endpoint.name, model);
          results.push(model);

          if (wasNew && model.status === 'running' && this.onModelDetected) {
            this.onModelDetected(model);
          }
          // Heartbeat fires every successful scan so the consumer's
          // registry can refresh last_seen / models without waiting for
          // a status transition.
          if (model.status === 'running' && this.onModelHeartbeat) {
            this.onModelHeartbeat(model);
          }

          // Detect newly-resident models by diffing current vs previous
          // resident set. The FIRST scan for an endpoint just records
          // the baseline — without it every already-loaded model would
          // look "newly loaded" at startup. Subsequent scans fire one
          // onModelLoaded event per net-new model.
          // Detect newly-resident models by diffing the resident set
          // (from /api/ps, NOT /api/tags). First scan establishes the
          // baseline silently; subsequent scans fire onModelLoaded for
          // each net-new model so the consumer can snapshot active
          // connections and attribute the loader.
          if (model.status === 'running' && this.onModelLoaded && model.resident) {
            const prev = this.prevResidentByEndpoint.get(endpoint.name);
            const current = new Set(model.resident);
            if (prev !== undefined) {
              const observedAt = model.lastChecked;
              for (const name of current) {
                if (!prev.has(name)) {
                  this.onModelLoaded({ endpoint: endpoint.name, model: name, observedAt });
                }
              }
            }
            this.prevResidentByEndpoint.set(endpoint.name, current);
          } else if (model.status !== 'running') {
            this.prevResidentByEndpoint.delete(endpoint.name);
          }
        }
      } catch {
        // Endpoint not reachable — model not running
        const existing = this.detectedModels.get(endpoint.name);
        if (existing && existing.status === 'running') {
          existing.status = 'stopped';
          existing.lastChecked = new Date().toISOString();
          this.detectedModels.set(endpoint.name, existing);
          if (this.onModelStatusChanged) {
            this.onModelStatusChanged(existing, 'running');
          }
        }
      }
    }

    // Also check for model files on disk (installed but not running)
    await this.checkInstalledModels();

    return results;
  }

  /**
   * Check a specific endpoint for a running model
   */
  private async checkEndpoint(endpoint: ModelEndpoint): Promise<DetectedModel | null> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);

    try {
      let models: string[] = [];
      let status: 'running' | 'stopped' = 'stopped';

      let resident: string[] | undefined = undefined;
      if (endpoint.type === 'ollama') {
        // /api/tags = installed library; /api/ps = currently resident
        // (a subset of installed that's loaded into VRAM right now).
        // We need both: installed for service-up detection, resident
        // for "what just got loaded?" diff.
        const response = await fetch(`${endpoint.url}/api/tags`, {
          signal: controller.signal
        });
        if (response.ok) {
          const data = (await response.json()) as any;
          models = (data.models || []).map((m: any) => m.name || m.model);
          status = 'running';
          // Resident set is best-effort — failure here doesn't downgrade status.
          try {
            const ps = await fetch(`${endpoint.url}/api/ps`, { signal: controller.signal });
            if (ps.ok) {
              const psData = (await ps.json()) as any;
              resident = (psData.models || []).map((m: any) => m.name || m.model);
            }
          } catch {
            // ignore
          }
        }
      } else if (endpoint.type === 'lm-studio') {
        // LM Studio exposes OpenAI-compatible API
        const response = await fetch(`${endpoint.url}/v1/models`, {
          signal: controller.signal
        });
        if (response.ok) {
          const data = (await response.json()) as any;
          models = (data.data || []).map((m: any) => m.id);
          status = 'running';
        }
      } else if (endpoint.type === 'llamacpp') {
        // llama.cpp server: GET /health
        const response = await fetch(`${endpoint.url}/health`, {
          signal: controller.signal
        });
        if (response.ok) {
          status = 'running';
          models = ['llama.cpp'];
        }
      }

      clearTimeout(timeout);

      if (status === 'running') {
        return {
          name: endpoint.name,
          type: endpoint.type,
          endpoint: endpoint.url,
          status,
          models,
          resident,
          lastChecked: new Date().toISOString()
        };
      }
      return null;
    } catch {
      clearTimeout(timeout);
      return null;
    }
  }

  /**
   * Check for installed model files (Ollama models directory)
   */
  private async checkInstalledModels(): Promise<void> {
    for (const endpoint of getKnownEndpoints()) {
      if (endpoint.modelsPath) {
        try {
          await fs.access(endpoint.modelsPath);
          const existing = this.detectedModels.get(endpoint.name);
          if (!existing) {
            this.detectedModels.set(endpoint.name, {
              name: endpoint.name,
              type: endpoint.type,
              status: 'stopped',
              models: [],
              lastChecked: new Date().toISOString()
            });
          }
        } catch {
          // Models directory doesn't exist
        }
      }
    }
  }

  /**
   * Get all detected models
   */
  getDetectedModels(): DetectedModel[] {
    return Array.from(this.detectedModels.values());
  }

  /**
   * Get only running models
   */
  getRunningModels(): DetectedModel[] {
    return this.getDetectedModels().filter(m => m.status === 'running');
  }

  /**
   * Check if any local model is running
   */
  isAnyModelRunning(): boolean {
    return this.getRunningModels().length > 0;
  }
}
