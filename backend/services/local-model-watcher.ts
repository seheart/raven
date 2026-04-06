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
  models: string[];
  lastChecked: string;
}

// Known local model endpoints and their detection methods
const KNOWN_ENDPOINTS: ModelEndpoint[] = [
  {
    name: 'Ollama',
    url: 'http://localhost:11434',
    type: 'ollama',
    modelsPath: join(os.homedir(), '.ollama', 'models')
  },
  {
    name: 'LM Studio',
    url: 'http://localhost:1234',
    type: 'lm-studio'
  },
  {
    name: 'llama.cpp',
    url: 'http://localhost:8080',
    type: 'llamacpp'
  }
];

export class LocalModelWatcher {
  private pollInterval: ReturnType<typeof setInterval> | null = null;
  private detectedModels: Map<string, DetectedModel> = new Map();
  private onModelDetected: ((model: DetectedModel) => void) | null = null;
  private onModelStatusChanged: ((model: DetectedModel, previousStatus: string) => void) | null =
    null;
  private pollMs: number;

  constructor(pollMs: number = 30000) {
    this.pollMs = pollMs;
  }

  /**
   * Start watching for local models
   */
  async start(
    callback?: (model: DetectedModel) => void,
    statusCallback?: (model: DetectedModel, previousStatus: string) => void
  ): Promise<void> {
    this.onModelDetected = callback || null;
    this.onModelStatusChanged = statusCallback || null;

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

    for (const endpoint of KNOWN_ENDPOINTS) {
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

      if (endpoint.type === 'ollama') {
        // Ollama API: GET /api/tags returns running models
        const response = await fetch(`${endpoint.url}/api/tags`, {
          signal: controller.signal
        });
        if (response.ok) {
          const data = (await response.json()) as any;
          models = (data.models || []).map((m: any) => m.name || m.model);
          status = 'running';
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
    for (const endpoint of KNOWN_ENDPOINTS) {
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
