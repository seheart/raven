/**
 * Diff Annotation Service
 *
 * Scans a unified diff for risk-flag rules and persists per-line
 * annotations against an event_id. The result is what the diff viewer
 * surfaces inline (gutter pills, hover tooltips, file-level badges).
 *
 * Distinct from `pattern-detector.ts`: that module is a generic
 * detector applied across snapshots; this service is purpose-built for
 * one diff at a time, persists to `diff_annotations`, and adds a few
 * rules the original detector doesn't carry.
 */

import type {
  DiffAnnotationsRepository,
  NewDiffAnnotation
} from '../repositories/diff-annotations-repository.js';

interface AnnotationRule {
  id: string;
  name: string;
  severity: 'critical' | 'warning' | 'info';
  category: 'security' | 'quality' | 'sensitive-path' | 'risk';
  /** Run on each ADDED line (line that starts with `+` and isn't `+++`). */
  test: (lineContent: string) => boolean;
  /** Free-text rationale rendered in the tooltip. */
  message: string;
}

/** Rules that fire on the file *path* rather than line content. */
interface FileRule {
  id: string;
  name: string;
  severity: 'critical' | 'warning' | 'info';
  category: 'sensitive-path';
  test: (filepath: string) => boolean;
  message: string;
}

const LINE_RULES: AnnotationRule[] = [
  {
    id: 'hardcoded-password',
    name: 'Hardcoded password',
    severity: 'critical',
    category: 'security',
    test: line => /\b(password|passwd|pwd)\s*[:=]\s*["'][^"']{4,}["']/i.test(line),
    message:
      'A password literal appears in source. Move it to an environment variable or secret store.'
  },
  {
    id: 'hardcoded-api-key',
    name: 'Hardcoded API key',
    severity: 'critical',
    category: 'security',
    test: line =>
      /\b(api[_-]?key|api[_-]?token|access[_-]?token|secret[_-]?key)\s*[:=]\s*["'][^"']{10,}["']/i.test(
        line
      ),
    message: 'API token literal in source. Store in env or a secret manager.'
  },
  {
    id: 'hardcoded-secret',
    name: 'Hardcoded secret',
    severity: 'critical',
    category: 'security',
    test: line => /\b(secret|private[_-]?key)\s*[:=]\s*["'][^"']{8,}["']/i.test(line),
    message: 'A secret literal is present. Move it out of source control.'
  },
  {
    id: 'token-prefix',
    name: 'Token-shaped string',
    severity: 'critical',
    category: 'security',
    // Catches AWS, GitHub PAT, Stripe, OpenAI, Anthropic-shaped token prefixes.
    test: line =>
      /["'](sk-[a-zA-Z0-9-]{20,}|ghp_[a-zA-Z0-9]{20,}|AKIA[A-Z0-9]{16}|xoxb-[a-zA-Z0-9-]{20,})["']/.test(
        line
      ),
    message:
      'String matches a known credential format. Treat as a leaked secret until verified otherwise.'
  },
  {
    id: 'eval-usage',
    name: 'eval() / Function() / new Function',
    severity: 'critical',
    category: 'security',
    test: line => /\b(eval|Function)\s*\(/.test(line) || /new\s+Function\s*\(/.test(line),
    message:
      'Dynamic code execution is a common RCE vector. Replace with explicit dispatch where possible.'
  },
  {
    id: 'no-verify-flag',
    name: '--no-verify or --no-gpg-sign',
    severity: 'warning',
    category: 'risk',
    test: line => /(--no-verify|--no-gpg-sign|-c\s+commit\.gpgsign\s*=\s*false)\b/.test(line),
    message:
      'Commit hooks or signing are being bypassed. Investigate the underlying failure rather than skipping.'
  },
  {
    id: 'force-push',
    name: 'force-push',
    severity: 'warning',
    category: 'risk',
    test: line => /git\s+push\s+(--force|-f)\b/.test(line),
    message:
      'Force-push can destroy remote history. Confirm this is intentional and not against a shared branch.'
  },
  {
    id: 'todo-fixme',
    name: 'TODO / FIXME comment',
    severity: 'info',
    category: 'quality',
    test: line => /\/\/\s*(TODO|FIXME|XXX|HACK)\b|#\s*(TODO|FIXME|XXX|HACK)\b/.test(line),
    message: 'Unfinished work marker added in this diff.'
  }
];

const FILE_RULES: FileRule[] = [
  {
    id: 'env-file',
    name: 'Edit to environment file',
    severity: 'warning',
    category: 'sensitive-path',
    test: fp => /(^|\/)\.env(\.|$)/i.test(fp) && !/\.env\.example/i.test(fp),
    message: '.env files commonly contain secrets. Confirm nothing committed leaks credentials.'
  },
  {
    id: 'pem-key',
    name: 'PEM / private key file',
    severity: 'critical',
    category: 'sensitive-path',
    test: fp => /\.(pem|key|p12|pfx|asc)$/i.test(fp),
    message: 'Private-key or certificate file under version control is almost always a mistake.'
  },
  {
    id: 'secrets-dir',
    name: 'File under secrets/ or credentials/',
    severity: 'critical',
    category: 'sensitive-path',
    test: fp => /(^|\/)(secrets|credentials)\//i.test(fp),
    message:
      'Path segment suggests stored secrets. Confirm the file is encrypted or excluded from VCS.'
  },
  {
    id: 'lockfile-touched',
    name: 'Lockfile touched',
    severity: 'info',
    category: 'sensitive-path',
    test: fp =>
      /(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|poetry\.lock|Gemfile\.lock|go\.sum)$/i.test(
        fp
      ),
    message: 'Dependency lockfile changed — review carefully if you did not intend a dep update.'
  }
];

interface AnnotateInput {
  event_id: number;
  filepath: string;
  diff: string;
  timestamp?: string;
}

export interface DiffAnnotationService {
  /**
   * Run all rules over `diff` and persist annotations. Returns the rows
   * inserted (without ids).
   */
  annotate(input: AnnotateInput): NewDiffAnnotation[];
  /** Pure function — return matches without persisting (for tests). */
  scan(filepath: string, diff: string): Array<Omit<NewDiffAnnotation, 'event_id' | 'timestamp'>>;
}

export function createDiffAnnotationService(
  repo: DiffAnnotationsRepository
): DiffAnnotationService {
  function scan(
    filepath: string,
    diff: string
  ): Array<Omit<NewDiffAnnotation, 'event_id' | 'timestamp'>> {
    const out: Array<Omit<NewDiffAnnotation, 'event_id' | 'timestamp'>> = [];

    // File-level rules — emitted at line 0 so the gutter pill attaches to
    // the file header in the viewer.
    for (const rule of FILE_RULES) {
      if (rule.test(filepath)) {
        out.push({
          filepath,
          line_number: 0,
          severity: rule.severity,
          category: rule.category,
          rule_id: rule.id,
          rule_name: rule.name,
          message: rule.message,
          match_text: filepath,
          source: 'file-rule'
        });
      }
    }

    // Per-line rules over added lines in the unified diff. We track the
    // "new file" line number, the same convention pattern-detector.ts
    // uses (only counts +/context, skips - and headers).
    const lines = diff.split('\n');
    let newLineNo = 0;
    for (const raw of lines) {
      if (raw.startsWith('@@')) {
        const m = /\+(\d+)/.exec(raw);
        if (m) newLineNo = parseInt(m[1], 10) - 1;
        continue;
      }
      if (raw.startsWith('+++') || raw.startsWith('---')) continue;
      if (raw.startsWith('-')) continue;
      // Either a context line or an added line — both increment newLineNo.
      newLineNo++;
      if (!raw.startsWith('+')) continue;
      const content = raw.slice(1);
      for (const rule of LINE_RULES) {
        if (rule.test(content)) {
          out.push({
            filepath,
            line_number: newLineNo,
            severity: rule.severity,
            category: rule.category,
            rule_id: rule.id,
            rule_name: rule.name,
            message: rule.message,
            match_text: content.trim().slice(0, 200),
            source: 'pattern'
          });
        }
      }
    }

    return out;
  }

  function annotate(input: AnnotateInput): NewDiffAnnotation[] {
    const matches = scan(input.filepath, input.diff);
    if (!matches.length) return [];
    const ts = input.timestamp ?? new Date().toISOString();
    const rows: NewDiffAnnotation[] = matches.map(m => ({
      ...m,
      event_id: input.event_id,
      timestamp: ts
    }));
    // Replace any prior annotations for this event so re-runs stay tidy.
    repo.deleteByEventId(input.event_id);
    repo.insertMany(rows);
    return rows;
  }

  return { scan, annotate };
}
