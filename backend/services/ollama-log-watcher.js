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

import { spawn } from 'child_process';
import readline from 'readline';

const GIN_LINE = /\[GIN\]\s+\S+\s+-\s+\S+\s+\|\s+(\d+)\s+\|\s+([^|]+)\s+\|\s+(\S+)\s+\|\s+(\S+)\s+"([^"]+)"/;

// Endpoints that represent actual inference work — what we want on the
// activity chart. Status/health endpoints are filtered out so polling
// doesn't masquerade as user activity.
const INFERENCE_ENDPOINTS = [
  '/api/generate',
  '/api/chat',
  '/api/embeddings',
  '/api/embed',
  '/v1/chat/completions',
  '/v1/completions',
  '/v1/embeddings'
];

// Anything matching these is a status/health probe — never emit.
const IGNORED_ENDPOINTS = new Set([
  '/api/tags',
  '/api/ps',
  '/api/version',
  '/api/show',
  '/'
]);

function isInferenceEndpoint(path) {
  if (IGNORED_ENDPOINTS.has(path)) return false;
  return INFERENCE_ENDPOINTS.some(p => path === p || path.startsWith(`${p}?`));
}

/**
 * Parse a gin duration token like "6.65726063s", "1.214937ms", "750µs".
 * Returns milliseconds (number) or null if unrecognised.
 */
function parseDurationMs(token) {
  if (!token) return null;
  const t = token.trim();
  const m = /^([\d.]+)(ms|µs|us|s|m|h)$/.exec(t);
  if (!m) return null;
  const n = parseFloat(m[1]);
  if (Number.isNaN(n)) return null;
  switch (m[2]) {
    case 'h': return n * 3_600_000;
    case 'm': return n * 60_000;
    case 's': return n * 1000;
    case 'ms': return n;
    case 'µs':
    case 'us': return n / 1000;
    default: return null;
  }
}

export class OllamaLogWatcher {
  constructor(eventCallback, logger, options = {}) {
    this.eventCallback = eventCallback;
    this.logger = logger;
    this.unit = options.unit || 'ollama';
    this.since = options.since || '5 minutes ago';
    this.proc = null;
    this.rl = null;
    this.starting = false;
    this.stopped = false;
  }

  async start() {
    if (this.proc) return;
    this.starting = true;
    this.stopped = false;
    this.logger.info('🔍 Starting Ollama Log Watcher (journalctl)...');

    try {
      this.proc = spawn(
        'journalctl',
        [
          '-u',
          this.unit,
          '-f',
          '--no-pager',
          '--output=short-iso',
          '--since',
          this.since
        ],
        { stdio: ['ignore', 'pipe', 'pipe'] }
      );
    } catch (err) {
      this.logger.warn(
        `⚠️  Could not spawn journalctl — Ollama activity won't be tracked: ${err.message}`
      );
      this.proc = null;
      this.starting = false;
      return;
    }

    this.proc.on('error', err => {
      this.logger.warn(`⚠️  journalctl failed (${err.message}) — Ollama tracking disabled.`);
      this.proc = null;
    });

    let exitedEarly = false;
    this.proc.on('exit', (code, signal) => {
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

    // stderr lines — don't crash, just log them at debug.
    this.proc.stderr.on('data', chunk => {
      const text = chunk.toString().trim();
      if (text) this.logger.debug(`journalctl stderr: ${text}`);
    });

    this.rl = readline.createInterface({
      input: this.proc.stdout,
      crlfDelay: Infinity
    });

    this.rl.on('line', line => {
      this.starting = false;
      this.handleLine(line).catch(err => {
        this.logger.error(`Error handling Ollama log line: ${err.message}`);
      });
    });

    this.rl.on('close', () => {
      this.rl = null;
    });

    // Give the process a beat to either die (bad unit) or start streaming.
    // 1.5s is enough for journalctl to fail-fast without delaying real startup.
    await new Promise(resolve => setTimeout(resolve, 1500));
    if (exitedEarly) {
      return;
    }
    this.logger.info(`✅ Ollama Log Watcher started (unit=${this.unit})`);
  }

  async stop() {
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
  async setIdle(_idle) {
    // intentionally empty
  }

  async handleLine(line) {
    const m = GIN_LINE.exec(line);
    if (!m) return;

    const [, statusStr, durationToken, _ip, method, rawPath] = m;
    const status = parseInt(statusStr, 10);
    const path = rawPath.split('?')[0]; // drop query string for matching

    if (!isInferenceEndpoint(path)) return;

    const durationMs = parseDurationMs(durationToken);
    const timestamp = new Date().toISOString();

    // Mark non-2xx responses as errors — useful signal but still goes
    // through the same activity stream so they show on the rate chart.
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

export default OllamaLogWatcher;
