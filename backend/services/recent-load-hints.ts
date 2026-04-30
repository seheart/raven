/**
 * In-memory ring of recent Ollama-proxy requests, keyed by model.
 *
 * When a model load fires on real Ollama (port 11435), the watcher's
 * /proc-scan attribution is blind to anything that hit Raven's transparent
 * proxy on 11434 — the only socket on 11435 belongs to the Raven process
 * itself, so any caller routed through the proxy gets misattributed to
 * whoever happens to hold an idle keep-alive on direct Ollama (typically
 * a long-running app like Octopus). Containerized callers are also
 * invisible because their cwd resolves to the container's namespaced root
 * (e.g. `/app`), not a host project path.
 *
 * The proxy already resolves the source PID/cwd per request via
 * attributeConnection. Recording those into this ring lets the load
 * watcher recover the real loader by matching the freshly-loaded model
 * against the most recent proxy request for it. Falls back to /proc
 * scanning when no hint is available.
 */

interface LoadHint {
  model: string;
  pid: number | null;
  cwd: string | null;
  project: string | null;
  at: number;
}

const MAX_HINTS = 64;
const hints: LoadHint[] = [];

/**
 * Ollama's /api/ps reports tagged names ("nomic-embed-text:latest"); clients
 * often send untagged ("nomic-embed-text"), which Ollama treats as :latest.
 * Also defensively handles a trailing colon ("model:") and whitespace.
 */
function canonical(model: string): string {
  const [name, ...rest] = model.trim().split(':');
  const tag = rest.join(':').trim();
  return `${name}:${tag || 'latest'}`;
}

export function recordLoadHint(hint: Omit<LoadHint, 'at'>): void {
  if (!hint.model) return;
  hints.push({ ...hint, model: canonical(hint.model), at: Date.now() });
  if (hints.length > MAX_HINTS) hints.splice(0, hints.length - MAX_HINTS);
}

/**
 * Most recent hint for `model` within `withinMs`. Hints are appended in
 * time order, so we walk from newest backwards and stop as soon as we
 * cross the cutoff.
 */
export function findLoadHint(model: string, withinMs = 30_000): LoadHint | null {
  const target = canonical(model);
  const cutoff = Date.now() - withinMs;
  for (let i = hints.length - 1; i >= 0; i--) {
    const h = hints[i];
    if (h.at < cutoff) break;
    if (h.model === target) return h;
  }
  return null;
}

export function _resetForTests(): void {
  hints.length = 0;
}
