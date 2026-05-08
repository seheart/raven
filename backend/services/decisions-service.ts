/**
 * Decisions Service
 *
 * Reads + parses the repo's `DECISIONS.md` audit trail. Replaces the
 * hand-curated `RESOLVED_DECISIONS` / `STILL_OPEN` arrays in
 * frontend/src/lib/content/about.js so the page is editable without
 * touching Svelte.
 */

import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

interface ResolvedDecision {
  q: string;
  decision: string;
  alternatives: string;
  livesAt: string;
}

interface OpenQuestion {
  q: string;
  note: string;
}

interface DecisionsPayload {
  resolved: ResolvedDecision[];
  open: OpenQuestion[];
  /** Path the parser read from, for debugging. */
  source: string;
  /** ISO timestamp of the file's mtime. */
  mtime: string | null;
}

export interface DecisionsService {
  /** Returns the parsed payload, cached per-mtime so repeated reads are cheap. */
  read(): DecisionsPayload;
  /** Force a re-read (used by /api/decisions/recompute). */
  refresh(): DecisionsPayload;
}

/**
 * Parse a decisions Markdown document. Format:
 *
 *   ## resolved
 *   ### <question>
 *   **Decision:** ...
 *   **Alternatives:** ...
 *   **Lives at:** ...
 *
 *   ## open
 *   ### <question>
 *   <free-form note>
 */
export function parseDecisionsMarkdown(text: string): {
  resolved: ResolvedDecision[];
  open: OpenQuestion[];
} {
  const resolved: ResolvedDecision[] = [];
  const open: OpenQuestion[] = [];

  const lines = text.split(/\r?\n/);
  /** @type {'resolved'|'open'|null} */
  let section: 'resolved' | 'open' | null = null;
  let currentH3: string | null = null;
  let buffer: string[] = [];

  function flush() {
    if (!currentH3) return;
    const body = buffer.join('\n').trim();
    if (section === 'resolved') {
      resolved.push({
        q: currentH3,
        decision: extractField(body, 'Decision'),
        alternatives: extractField(body, 'Alternatives'),
        livesAt: extractField(body, 'Lives at')
      });
    } else if (section === 'open') {
      open.push({ q: currentH3, note: body });
    }
    currentH3 = null;
    buffer = [];
  }

  for (const raw of lines) {
    const line = raw.trimEnd();
    const h2 = /^##\s+(.+?)\s*$/.exec(line);
    if (h2) {
      flush();
      const tag = h2[1].toLowerCase();
      if (tag.startsWith('resolved')) section = 'resolved';
      else if (tag.startsWith('open')) section = 'open';
      else section = null;
      continue;
    }
    const h3 = /^###\s+(.+?)\s*$/.exec(line);
    if (h3) {
      flush();
      currentH3 = h3[1];
      buffer = [];
      continue;
    }
    if (section && currentH3) buffer.push(line);
  }
  flush();

  return { resolved, open };
}

/**
 * Find a `**Label:**` paragraph inside a body and return its content
 * up to the next bold-label or end-of-body. Returns '' when missing.
 */
function extractField(body: string, label: string): string {
  // Match `**Label:** <text...>` allowing flexible spacing in label.
  const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Stop at the next `**SomeLabel:**` or end-of-string.
  const re = new RegExp(
    `\\*\\*${escapedLabel}:?\\*\\*\\s*([\\s\\S]*?)(?=\\n\\s*\\*\\*[A-Za-z][^*]*?:\\*\\*|$)`,
    'i'
  );
  const m = re.exec(body);
  if (!m) return '';
  return m[1].trim().replace(/\s+/g, ' ');
}

export function createDecisionsService(repoRoot: string): DecisionsService {
  const filePath = join(repoRoot, 'DECISIONS.md');
  let cache: { mtimeMs: number; payload: DecisionsPayload } | null = null;

  function readFresh(): DecisionsPayload {
    let text = '';
    let mtime: string | null = null;
    try {
      text = readFileSync(filePath, 'utf-8');
      const st = statSync(filePath);
      mtime = new Date(st.mtimeMs).toISOString();
    } catch {
      // File missing — return an empty payload rather than throwing.
      // The frontend will render its own empty state.
      return { resolved: [], open: [], source: filePath, mtime: null };
    }
    const parsed = parseDecisionsMarkdown(text);
    return { ...parsed, source: filePath, mtime };
  }

  return {
    read() {
      try {
        const st = statSync(filePath);
        if (cache && cache.mtimeMs === st.mtimeMs) return cache.payload;
        const payload = readFresh();
        cache = { mtimeMs: st.mtimeMs, payload };
        return payload;
      } catch {
        // Stat failed (file missing) — clear cache so we re-check next time.
        cache = null;
        return readFresh();
      }
    },

    refresh() {
      cache = null;
      const payload = readFresh();
      try {
        const st = statSync(filePath);
        cache = { mtimeMs: st.mtimeMs, payload };
      } catch {
        /* ignore — file missing */
      }
      return payload;
    }
  };
}
