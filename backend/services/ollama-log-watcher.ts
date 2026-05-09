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
import { findPidsByDestPort, getProcessCwd, cwdToProject } from '../utils/process-attribution.js';

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
  /** Returns the current list of projects, used to map caller cwds to
   *  project names. Optional; without it, attribution still records
   *  pid/cwd, just no project label. */
  getProjects?: () => Array<{ name: string; path: string }>;
  /** TCP port Ollama listens on. Defaults to 11434. */
  ollamaPort?: number;
}

interface OllamaInferenceEvent {
  type: 'inference' | 'tool_call' | 'tool_error';
  tool: string;
  file: string;
  duration_ms: number | null;
  timestamp: string;
  source: 'ollama';
  eventCategory: 'agent_event';
  // Populated when /api/ps returns the resident model. The factory uses these
  // to pulse ActiveModelCard for the right resident-model row.
  model?: string;
  agentNameOverride?: string;
  // Caller attribution (best-effort; null when /proc-scan came up empty).
  // Stored as the agent_events.project_name column so SQL aggregates that
  // group by project_name (consumer queries, dashboard counts) catch it
  // without having to fall back to the json_extract path every time.
  projectName?: string;
  metadata?: Record<string, unknown>;
}

type OllamaEventCallback = (event: OllamaInferenceEvent) => Promise<void> | void;

// Resident-model lookup. Cached because /api/chat lines arrive in bursts
// and re-querying Ollama for each one would amplify load. 5s lines up with
// the proxy/api-cache TTL elsewhere in the codebase.
let psCache: { ts: number; model: string | null; details: Record<string, unknown> | null } | null =
  null;
async function getResidentModel(): Promise<{
  model: string | null;
  details: Record<string, unknown> | null;
}> {
  if (psCache && Date.now() - psCache.ts < 5000) {
    return { model: psCache.model, details: psCache.details };
  }
  const url = `${process.env.OLLAMA_URL || 'http://localhost:11434'}/api/ps`;
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(2000) });
    if (!r.ok) {
      psCache = { ts: Date.now(), model: null, details: null };
      return { model: null, details: null };
    }
    const data = (await r.json()) as { models?: Array<Record<string, unknown>> };
    // When multiple models are resident the journal line doesn't tell us
    // which one was used, so pick the one whose keep-alive was most recently
    // refreshed (largest expires_at). That's the model the request just
    // touched. Falls back to models[0] if no expires_at is present.
    const list = data.models || [];
    let chosen: Record<string, unknown> | undefined;
    if (list.length === 1) {
      chosen = list[0];
    } else if (list.length > 1) {
      let bestTs = -Infinity;
      for (const m of list) {
        const t = Date.parse((m.expires_at as string) || '');
        if (Number.isFinite(t) && t > bestTs) {
          bestTs = t;
          chosen = m;
        }
      }
      if (!chosen) chosen = list[0];
    }
    const model = (chosen?.name as string | undefined) || null;
    psCache = { ts: Date.now(), model, details: (chosen as Record<string, unknown>) || null };
    return { model, details: psCache.details };
  } catch {
    psCache = { ts: Date.now(), model: null, details: null };
    return { model: null, details: null };
  }
}

export class OllamaLogWatcher {
  private eventCallback: OllamaEventCallback;
  private logger: MinimalLogger;
  private unit: string;
  private since: string;
  private proc: ChildProcess | null;
  private rl: ReadlineInterface | null;
  private starting: boolean;
  private stopped: boolean;
  private getProjects: () => Array<{ name: string; path: string }>;
  private ollamaPort: number;

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
    this.getProjects = options.getProjects || (() => []);
    this.ollamaPort = options.ollamaPort || 11434;
  }

  /**
   * Best-effort caller attribution for a logged inference. Scans /proc
   * for any process holding a connection to the Ollama port — picks the
   * one with project attribution if any, otherwise the first. Misses
   * are silent; pid attribution from a journal-based watcher is
   * fundamentally a "guess at the time of observation" since the
   * connection may have already closed when the line is parsed.
   */
  private async attributeCaller(): Promise<{
    pid: number | null;
    cwd: string | null;
    project: string | null;
  }> {
    try {
      const allPids = await findPidsByDestPort(this.ollamaPort);
      // Raven itself constantly polls Ollama (/api/ps, /api/tags, /api/show
      // for the resident-model lookup) so our own PID would otherwise win
      // every attribution. Exclude self before evaluating candidates.
      const selfPid = process.pid;
      const pids = allPids.filter(p => p !== selfPid);
      if (pids.length === 0) return { pid: null, cwd: null, project: null };
      const projects = this.getProjects();
      const candidates = await Promise.all(
        pids.map(async pid => {
          const cwd = await getProcessCwd(pid);
          return { pid, cwd, project: cwdToProject(cwd, projects) };
        })
      );
      // Prefer a candidate with project attribution — if multiple exist,
      // any of them is plausibly "the" caller and the user-visible chip
      // benefits from a real project name. Fall back to the first PID.
      return candidates.find(c => c.project) ?? candidates[0];
    } catch {
      return { pid: null, cwd: null, project: null };
    }
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

    // Resolve the resident model so the event attributes to the right row in
    // ActiveModelCard. The journal line only has endpoint + duration; /api/ps
    // gives us the model that just served the request (cached 5s).
    const { model, details } = isError ? { model: null, details: null } : await getResidentModel();

    // Caller attribution. /proc-scan happens at log-parse time, which
    // is after the request completed — so the connection may already
    // be closed for one-shot clients. Picks up well for keep-alive
    // clients (the common case: aider, atf's worker pool, sightline's
    // diagnostic loop, etc.) and is silent on miss.
    const caller = await this.attributeCaller();

    const metadata: Record<string, unknown> = {
      endpoint: path,
      method,
      status_code: status,
      duration_ms: durationMs,
      source: 'journalctl'
    };
    if (model) metadata.model = model;
    if (details) {
      metadata.parameter_size = details.parameter_size;
      metadata.quantization_level = details.quantization_level;
      metadata.family = details.family;
    }
    if (caller.pid !== null) metadata.caller_pid = caller.pid;
    if (caller.cwd) metadata.caller_cwd = caller.cwd;
    if (caller.project) metadata.project = caller.project;

    await this.eventCallback({
      // Promote successful chat/generate/embed calls to 'inference' so the
      // rest of Raven's reporting (RecentInferencesCard, ActiveModelCard pulse,
      // /api/agent-stats counts) sees them as first-class inference events.
      type: isError ? 'tool_error' : 'inference',
      tool: method,
      file: path,
      duration_ms: durationMs,
      timestamp,
      source: 'ollama',
      eventCategory: 'agent_event',
      model: model ?? undefined,
      agentNameOverride: model ?? undefined,
      projectName: caller.project ?? undefined,
      metadata
    });
  }
}
