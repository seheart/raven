/**
 * OllamaLogWatcher - Tails the systemd journal for the ollama service and
 * emits an agent_event for each inference request.
 *
 * Ollama writes a single line per HTTP request via the gin logger:
 *
 *   [GIN] 2026/04/25 - 07:25:14 | 200 |  6.65726063s | 127.0.0.1 | POST "/api/generate"
 *
 * We parse those lines, filter to inference endpoints, and emit through
 * the same eventCallback the Claude and Codex watchers use.
 *
 * Caveat: the journal line has the endpoint but not the model name —
 * the model is in the request body. Per-model attribution is a follow-up.
 *
 * Falls back gracefully when journalctl isn't available (non-systemd
 * hosts, macOS, etc.). The watcher just stays inert and logs a warning.
 */

import { spawn, type ChildProcess } from 'child_process';
import readline, { type Interface as ReadlineInterface } from 'readline';

interface MinimalLogger {
  debug: (msg: string, meta?: object) => void;
  info: (msg: string, meta?: object) => void;
  warn: (msg: string, meta?: object) => void;
  error: (msg: string, meta?: object) => void;
}

const GIN_LINE =
  /\[GIN\]\s+\S+\s+-\s+\S+\s+\|\s+(\d+)\s+\|\s+([^|]+)\s+\|\s+(\S+)\s+\|\s+(\S+)\s+"([^"]+)"/;

const INFERENCE_ENDPOINTS = [
  '/api/generate',
  '/api/chat',
  '/api/embeddings',
  '/api/embed',
  '/v1/chat/completions',
  '/v1/completions',
  '/v1/embeddings'
];

const IGNORED_ENDPOINTS = new Set(['/api/tags', '/api/ps', '/api/version', '/api/show', '/']);

function isInferenceEndpoint(path: string): boolean {
  if (IGNORED_ENDPOINTS.has(path)) return false;
  return INFERENCE_ENDPOINTS.some(p => path === p || path.startsWith(`${p}?`));
}

/**
 * Parse a gin duration token like "6.65726063s", "1.214937ms", "750µs".
 * Returns milliseconds (number) or null if unrecognised.
 */
function parseDurationMs(token: string | undefined): number | null {
  if (!token) return null;
  const t = token.trim();
  const m = /^([\d.]+)(ms|µs|us|s|m|h)$/.exec(t);
  if (!m) return null;
  const n = parseFloat(m[1]);
  if (Number.isNaN(n)) return null;
  switch (m[2]) {
    case 'h':
      return n * 3_600_000;
    case 'm':
      return n * 60_000;
    case 's':
      return n * 1000;
    case 'ms':
      return n;
    case 'µs':
    case 'us':
      return n / 1000;
    default:
      return null;
  }
}

interface OllamaWatcherOptions {
  unit?: string;
  since?: string;
}

interface OllamaInferenceEvent {
  type: 'tool_call' | 'tool_error';
  tool: string;
  file: string;
  duration_ms: number | null;
  timestamp: string;
  source: 'ollama';
  eventCategory: 'agent_event';
}

type OllamaEventCallback = (event: OllamaInferenceEvent) => Promise<void> | void;

export class OllamaLogWatcher {
  private eventCallback: OllamaEventCallback;
  private logger: MinimalLogger;
  private unit: string;
  private since: string;
  private proc: ChildProcess | null;
  private rl: ReadlineInterface | null;
  private starting: boolean;
  private stopped: boolean;

  constructor(
    eventCallback: OllamaEventCallback,
    logger: MinimalLogger,
    options: OllamaWatcherOptions = {}
  ) {
    this.eventCallback = eventCallback;
    this.logger = logger;
    this.unit = options.unit || 'ollama';
    this.since = options.since || '5 minutes ago';
    this.proc = null;
    this.rl = null;
    this.starting = false;
    this.stopped = false;
  }

  async start(): Promise<void> {
    if (this.proc) return;
    this.starting = true;
    this.stopped = false;
    this.logger.info('🔍 Starting Ollama Log Watcher (journalctl)...');

    let proc: ChildProcess;
    try {
      proc = spawn(
        'journalctl',
        ['-u', this.unit, '-f', '--no-pager', '--output=short-iso', '--since', this.since],
        { stdio: ['ignore', 'pipe', 'pipe'] }
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`⚠️  Could not spawn journalctl — Ollama activity won't be tracked: ${msg}`);
      this.proc = null;
      this.starting = false;
      return;
    }
    this.proc = proc;

    proc.on('error', err => {
      this.logger.warn(`⚠️  journalctl failed (${err.message}) — Ollama tracking disabled.`);
      this.proc = null;
    });

    let exitedEarly = false;
    proc.on('exit', (code, signal) => {
      // If journalctl exits before we've seen any output, the unit
      // probably doesn't exist on this host. Don't try to restart.
      if (this.starting) {
        exitedEarly = true;
        this.logger.warn(
          `⚠️  journalctl for unit "${this.unit}" exited (code=${code}, signal=${signal}). ` +
            `Ollama tracking disabled — is the service running under systemd?`
        );
      } else if (!this.stopped) {
        this.logger.warn(
          `⚠️  Ollama journal stream ended (code=${code}, signal=${signal}); not restarting`
        );
      }
      this.proc = null;
    });

    proc.stderr?.on('data', chunk => {
      const text = chunk.toString().trim();
      if (text) this.logger.debug(`journalctl stderr: ${text}`);
    });

    if (!proc.stdout) {
      this.logger.warn('journalctl stdout is missing — Ollama tracking disabled');
      this.proc = null;
      return;
    }

    this.rl = readline.createInterface({
      input: proc.stdout,
      crlfDelay: Infinity
    });

    this.rl.on('line', line => {
      this.starting = false;
      this.handleLine(line).catch(err => {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.error(`Error handling Ollama log line: ${msg}`);
      });
    });

    this.rl.on('close', () => {
      this.rl = null;
    });

    // Give the process a beat to either die (bad unit) or start streaming.
    await new Promise(resolve => setTimeout(resolve, 1500));
    if (exitedEarly) {
      return;
    }
    this.logger.info(`✅ Ollama Log Watcher started (unit=${this.unit})`);
  }

  async stop(): Promise<void> {
    this.stopped = true;
    if (this.rl) {
      this.rl.close();
      this.rl = null;
    }
    if (this.proc) {
      this.proc.kill('SIGTERM');
      this.proc = null;
      this.logger.info('🛑 Ollama Log Watcher stopped');
    }
  }

  /**
   * Idle/active modes are no-ops for this watcher — journalctl is push-based,
   * not polling, so there's nothing to throttle.
   */
  async setIdle(_idle: boolean): Promise<void> {
    // intentionally empty
  }

  async handleLine(line: string): Promise<void> {
    const m = GIN_LINE.exec(line);
    if (!m) return;

    const [, statusStr, durationToken, , method, rawPath] = m;
    const status = parseInt(statusStr, 10);
    const path = rawPath.split('?')[0];

    if (!isInferenceEndpoint(path)) return;

    const durationMs = parseDurationMs(durationToken);
    const timestamp = new Date().toISOString();

    const isError = !Number.isFinite(status) || status >= 400;

    await this.eventCallback({
      type: isError ? 'tool_error' : 'tool_call',
      tool: method,
      file: path,
      duration_ms: durationMs,
      timestamp,
      source: 'ollama',
      eventCategory: 'agent_event'
    });
  }
}
