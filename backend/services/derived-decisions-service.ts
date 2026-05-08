/**
 * Derived Decisions Service
 *
 * Mines `git log` for commits that look like architectural decisions:
 *
 *   - `feat(scope):` headlines with a substantial body
 *   - explicit `Decision:` / `Decided:` prefixes
 *   - `BREAKING CHANGE:` / `BREAKING:` markers
 *   - `refactor:` headlines whose body has > 3 lines
 *
 * Returns parsed entries the AboutPage can render alongside the
 * hand-curated DECISIONS.md trail, clearly labeled "auto-detected".
 *
 * Quality is intentionally conservative — we'd rather miss a decision
 * than surface a noisy "fix typo" commit. The signal we trust most is
 * an explicit BREAKING/Decision marker; everything else is a hint.
 */

import simpleGit, { type SimpleGit, type DefaultLogFields } from 'simple-git';

type DerivedKind = 'breaking' | 'decision-marker' | 'feat-architecture' | 'refactor';

interface DerivedDecision {
  sha: string;
  /** Short SHA — first 7 chars. */
  short_sha: string;
  date: string;
  author: string;
  kind: DerivedKind;
  /** First line of the message — the conventional-commit headline. */
  headline: string;
  /** Up to a few sentences from the body that look load-bearing. */
  excerpt: string;
  /** Truthy when the message contained an explicit BREAKING marker. */
  breaking: boolean;
}

export interface DerivedDecisionsService {
  list(limit?: number): Promise<DerivedDecision[]>;
}

const HEADLINE_PATTERNS: Array<{ kind: DerivedKind; rx: RegExp }> = [
  { kind: 'feat-architecture', rx: /^feat\((arch|architecture|infra|core|api|db|schema)\)/i },
  { kind: 'refactor', rx: /^refactor(\(|:)/i }
];

const DECISION_MARKER = /^(decision|decided)\s*:\s*/im;
const BREAKING_MARKER = /^breaking(\s+change)?\s*:/im;

export function createDerivedDecisionsService(repoPath: string): DerivedDecisionsService {
  let git: SimpleGit | null = null;
  try {
    git = simpleGit(repoPath);
  } catch {
    git = null;
  }

  function classify(
    headline: string,
    body: string
  ): {
    kind: DerivedKind | null;
    breaking: boolean;
  } {
    const breaking = BREAKING_MARKER.test(body) || /!:/.test(headline);
    if (DECISION_MARKER.test(body)) return { kind: 'decision-marker', breaking };
    if (breaking) return { kind: 'breaking', breaking };
    for (const p of HEADLINE_PATTERNS) {
      if (p.rx.test(headline)) {
        // Refactor commits with a tiny body aren't decisions — they're
        // tidy-ups. Require >= 3 non-empty body lines.
        if (p.kind === 'refactor') {
          const meaningfulLines = body.split('\n').filter(l => l.trim().length > 0).length;
          if (meaningfulLines < 3) continue;
        }
        return { kind: p.kind, breaking };
      }
    }
    return { kind: null, breaking };
  }

  /**
   * Return the most narratable chunk of the body — the first paragraph
   * that's longer than the headline and isn't a Co-Authored-By trailer.
   */
  function excerptOf(body: string): string {
    if (!body) return '';
    const trailerStart = body.search(/\n(Co-Authored-By|Signed-off-by|Reviewed-by):/i);
    const trimmed = trailerStart === -1 ? body : body.slice(0, trailerStart);
    // Take first paragraph (split on blank line).
    const para = trimmed
      .split(/\n\s*\n/)
      .map(p => p.trim())
      .find(p => p.length > 20);
    if (!para) return trimmed.trim().slice(0, 320);
    // Cap to 320 chars so the UI doesn't render a wall of text.
    return para.length > 320 ? `${para.slice(0, 319)}…` : para;
  }

  return {
    async list(limit = 30) {
      if (!git) return [];
      let log;
      try {
        // Pull the last N*10 commits so we have headroom to filter; we
        // typically discard ~80% as not-decision-shaped.
        log = await git.log({
          maxCount: Math.min(limit * 10, 500),
          format: {
            hash: '%H',
            date: '%aI',
            message: '%s',
            body: '%b',
            author_name: '%an'
          } as Record<keyof DefaultLogFields, string>
        });
      } catch {
        return [];
      }

      const out: DerivedDecision[] = [];
      for (const commit of log.all) {
        const headline = (commit.message || '').trim();
        const body = (commit.body || '').trim();
        const { kind, breaking } = classify(headline, body);
        if (!kind) continue;
        out.push({
          sha: commit.hash,
          short_sha: commit.hash.slice(0, 7),
          date: commit.date,
          author: commit.author_name,
          kind,
          headline,
          excerpt: excerptOf(body),
          breaking
        });
        if (out.length >= limit) break;
      }
      return out;
    }
  };
}
