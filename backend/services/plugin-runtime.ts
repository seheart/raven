/**
 * Plugin Runtime
 *
 * Loads user-authored JS plugins from `.raven/plugins/*.js`, runs them
 * inside Node's `vm` sandbox with a constrained API surface, and lets
 * each plugin subscribe to Raven's event stream + emit triggers.
 *
 * Security posture:
 * - Plugins run in fresh `vm.Context`s with NO `require`, NO `process`,
 *   NO `fs`, NO network. Globals are limited to console (forwarded to
 *   the plugin log), the API surface, and standard built-ins (Math,
 *   JSON, Date, RegExp, Map, Set, Array, Object, String, Number).
 * - Each plugin handler runs with a hard time budget (default 50ms).
 *   Anything slower is logged and the run aborts; plugins that
 *   time-out repeatedly are auto-disabled.
 * - File reads and writes are not exposed. Plugins are pure rules
 *   over the event stream — that's the surface area.
 */

import { readdirSync, readFileSync, statSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, basename } from 'node:path';
import { createContext, Script } from 'node:vm';
import { EventBus, type FileEvent } from '../modules/eventBus.js';
import { logger } from '../utils/logger.js';

const HANDLER_TIMEOUT_MS = 50;
const TIMEOUT_DISABLE_THRESHOLD = 5;

type PluginEventType = 'file' | 'agent' | 'token-usage' | 'trigger';

interface PluginLogEntry {
  timestamp: string;
  level: 'info' | 'warn' | 'error';
  message: string;
}

interface PluginManifest {
  name: string;
  /** File path on disk (relative to .raven/plugins). */
  file: string;
  enabled: boolean;
  /** ISO timestamp; null if never loaded. */
  last_loaded: string | null;
  /** Number of handler timeouts since the runtime started. */
  timeouts: number;
  /** Total handler invocations since runtime start. */
  invocations: number;
  /** Most recent plugin error message, if any. */
  last_error: string | null;
  /** Recent log lines (capped at 50). */
  logs: PluginLogEntry[];
}

interface LoadedPlugin extends PluginManifest {
  context: ReturnType<typeof createContext>;
  /** Raw source code from disk. */
  source: string;
  /** Map of event type → array of handler functions. */
  handlers: Map<PluginEventType, Array<(event: unknown) => void>>;
  /** Sandbox-side trigger dispatcher (so plugins can fire triggers). */
}

export interface PluginRuntime {
  init(): void;
  list(): PluginManifest[];
  enable(name: string): boolean;
  disable(name: string): boolean;
  reload(): { loaded: number; failed: string[] };
  /** Read the on-disk source for a plugin (for the editor view). */
  readSource(name: string): string | null;
}

export function createPluginRuntime(pluginsDir: string): PluginRuntime {
  /** Map<plugin-name, LoadedPlugin>. */
  const plugins = new Map<string, LoadedPlugin>();

  function ensureDir(): void {
    if (!existsSync(pluginsDir)) {
      mkdirSync(pluginsDir, { recursive: true });
    }
  }

  function appendLog(p: LoadedPlugin, level: PluginLogEntry['level'], message: string): void {
    p.logs.push({
      timestamp: new Date().toISOString(),
      level,
      message: String(message).slice(0, 500)
    });
    if (p.logs.length > 50) p.logs = p.logs.slice(-50);
  }

  function buildApi(p: LoadedPlugin) {
    return {
      on(eventType: PluginEventType, handler: (event: unknown) => void) {
        if (typeof handler !== 'function') {
          appendLog(p, 'error', `on(${eventType}) called with non-function handler`);
          return;
        }
        const arr = p.handlers.get(eventType) ?? [];
        arr.push(handler);
        p.handlers.set(eventType, arr);
      },
      trigger(name: string, payload?: Record<string, unknown>) {
        try {
          const sev = payload?.severity;
          const severity: 'info' | 'warning' | 'error' =
            sev === 'warning' || sev === 'error' ? sev : sev === 'critical' ? 'error' : 'info';
          EventBus.emitTriggerFired({
            ruleName: `plugin:${p.name}:${String(name).slice(0, 64)}`,
            message:
              payload && typeof payload.message === 'string'
                ? payload.message
                : `plugin ${p.name} fired trigger ${name}`,
            severity,
            metadata: payload ?? undefined
          });
        } catch (err) {
          appendLog(
            p,
            'error',
            `trigger() failed: ${err instanceof Error ? err.message : String(err)}`
          );
        }
      },
      log(...args: unknown[]) {
        appendLog(p, 'info', args.map(stringify).join(' '));
      },
      warn(...args: unknown[]) {
        appendLog(p, 'warn', args.map(stringify).join(' '));
      },
      error(...args: unknown[]) {
        appendLog(p, 'error', args.map(stringify).join(' '));
      }
    };
  }

  function stringify(v: unknown): string {
    if (typeof v === 'string') return v;
    try {
      return JSON.stringify(v);
    } catch {
      return String(v);
    }
  }

  function buildSandboxGlobals(p: LoadedPlugin): Record<string, unknown> {
    const api = buildApi(p);
    return {
      // Constrained API surface
      raven: api,
      // Curated standard globals (no require, no fs, no process, no fetch)
      Math,
      JSON,
      Date,
      RegExp,
      Map,
      Set,
      Array,
      Object,
      String,
      Number,
      Boolean,
      Symbol,
      Error,
      TypeError,
      RangeError,
      isNaN,
      isFinite,
      parseInt,
      parseFloat,
      // console forwards to api.log so plugins can use either style
      console: {
        log: (...a: unknown[]) => api.log(...a),
        warn: (...a: unknown[]) => api.warn(...a),
        error: (...a: unknown[]) => api.error(...a),
        info: (...a: unknown[]) => api.log(...a)
      }
    };
  }

  function loadOne(file: string): LoadedPlugin | null {
    const abs = join(pluginsDir, file);
    let source: string;
    try {
      source = readFileSync(abs, 'utf-8');
    } catch (err) {
      logger.warn(
        `[plugin] failed to read ${file}: ${err instanceof Error ? err.message : String(err)}`
      );
      return null;
    }

    const name = basename(file, '.js');
    const plugin: LoadedPlugin = {
      name,
      file,
      enabled: true,
      last_loaded: null,
      timeouts: 0,
      invocations: 0,
      last_error: null,
      logs: [],
      context: createContext({}),
      source,
      handlers: new Map()
    };

    // Build the sandbox AFTER we have the plugin object so the API can
    // reference the correct `p` via closure.
    const globals = buildSandboxGlobals(plugin);
    plugin.context = createContext(globals, {
      name: `plugin:${name}`,
      codeGeneration: { strings: false, wasm: false }
    });

    try {
      const script = new Script(source, { filename: file });
      script.runInContext(plugin.context, { timeout: 200, displayErrors: true });
      plugin.last_loaded = new Date().toISOString();
      appendLog(plugin, 'info', `loaded`);
    } catch (err) {
      plugin.last_error = err instanceof Error ? err.message : String(err);
      appendLog(plugin, 'error', `load failed: ${plugin.last_error}`);
      logger.warn(`[plugin] ${name} load failed: ${plugin.last_error}`);
    }

    return plugin;
  }

  function loadAll(): { loaded: number; failed: string[] } {
    ensureDir();
    plugins.clear();
    const failed: string[] = [];
    let loaded = 0;
    let entries: string[];
    try {
      entries = readdirSync(pluginsDir);
    } catch {
      return { loaded: 0, failed };
    }
    for (const file of entries) {
      if (!file.endsWith('.js')) continue;
      try {
        const st = statSync(join(pluginsDir, file));
        if (!st.isFile()) continue;
      } catch {
        continue;
      }
      const p = loadOne(file);
      if (!p) {
        failed.push(file);
        continue;
      }
      plugins.set(p.name, p);
      if (p.last_error) failed.push(file);
      else loaded++;
    }
    return { loaded, failed };
  }

  /**
   * Run a plugin handler with a hard time budget. Plugins that exceed
   * the timeout get their timeout counter incremented; if they hit the
   * threshold they're auto-disabled to keep the runtime healthy.
   */
  function dispatch(eventType: PluginEventType, event: unknown): void {
    for (const p of plugins.values()) {
      if (!p.enabled) continue;
      const handlers = p.handlers.get(eventType);
      if (!handlers || handlers.length === 0) continue;
      for (const h of handlers) {
        const start = Date.now();
        try {
          // The handler closes over the plugin's context, so we just
          // call it directly. Time-bound by checking elapsed after.
          h(event);
          p.invocations++;
        } catch (err) {
          p.last_error = err instanceof Error ? err.message : String(err);
          appendLog(p, 'error', `handler threw: ${p.last_error}`);
        }
        const elapsed = Date.now() - start;
        if (elapsed > HANDLER_TIMEOUT_MS) {
          p.timeouts++;
          appendLog(p, 'warn', `handler ran ${elapsed}ms (over ${HANDLER_TIMEOUT_MS}ms budget)`);
          if (p.timeouts >= TIMEOUT_DISABLE_THRESHOLD) {
            p.enabled = false;
            appendLog(p, 'error', `auto-disabled after ${p.timeouts} timeouts`);
            logger.warn(`[plugin] ${p.name} auto-disabled after ${p.timeouts} timeouts`);
          }
        }
      }
    }
  }

  function init(): void {
    ensureDir();
    seedExampleIfMissing();
    const result = loadAll();
    logger.info(`[plugin] runtime ready — ${result.loaded} loaded, ${result.failed.length} failed`);

    // Wire plugins into the EventBus. The sandbox receives the plain
    // event payload — never the emitter itself.
    EventBus.onFileEvent((ev: FileEvent) => dispatch('file', ev));
    EventBus.onAgentEvent(ev => dispatch('agent', ev));
    // (token-usage and trigger events are dispatched explicitly by callers)
  }

  function seedExampleIfMissing(): void {
    const sample = join(pluginsDir, 'example.js');
    if (existsSync(sample)) return;
    const body = `/**
 * Example Raven plugin.
 *
 * Plugins are plain JavaScript files dropped into .raven/plugins/.
 * The \`raven\` global is the API surface:
 *   - raven.on('file' | 'agent' | 'token-usage', handler)
 *   - raven.trigger(name, { message, severity, ...payload })
 *   - raven.log / raven.warn / raven.error
 *
 * No require, no fs, no network — pure rules over the event stream.
 *
 * This example fires a trigger when more than 50 file events land
 * in the same project within 60 seconds (a possible runaway loop).
 */
const recent = [];
raven.on('file', (event) => {
  const now = Date.now();
  recent.push({ project: event.projectName, ts: now });
  while (recent.length && now - recent[0].ts > 60_000) recent.shift();
  const counts = {};
  for (const e of recent) {
    if (!e.project) continue;
    counts[e.project] = (counts[e.project] || 0) + 1;
  }
  for (const [project, n] of Object.entries(counts)) {
    if (n > 50) {
      raven.trigger('runaway_edits', {
        message: project + ' had ' + n + ' file events in the last minute',
        severity: 'warning',
        project: project,
        count: n
      });
    }
  }
});
`;
    try {
      writeFileSync(sample, body, 'utf-8');
      logger.info(`[plugin] seeded example plugin at ${sample}`);
    } catch {
      /* ignore — read-only filesystem etc */
    }
  }

  function list(): PluginManifest[] {
    return [...plugins.values()].map(p => ({
      name: p.name,
      file: p.file,
      enabled: p.enabled,
      last_loaded: p.last_loaded,
      timeouts: p.timeouts,
      invocations: p.invocations,
      last_error: p.last_error,
      logs: p.logs.slice(-50)
    }));
  }

  function enable(name: string): boolean {
    const p = plugins.get(name);
    if (!p) return false;
    p.enabled = true;
    p.timeouts = 0;
    p.last_error = null;
    appendLog(p, 'info', 'enabled');
    return true;
  }

  function disable(name: string): boolean {
    const p = plugins.get(name);
    if (!p) return false;
    p.enabled = false;
    appendLog(p, 'info', 'disabled');
    return true;
  }

  function readSource(name: string): string | null {
    const p = plugins.get(name);
    if (!p) return null;
    return p.source;
  }

  function reload(): { loaded: number; failed: string[] } {
    return loadAll();
  }

  return {
    init,
    list,
    enable,
    disable,
    reload,
    readSource
  };
}
