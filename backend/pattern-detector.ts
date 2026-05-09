/**
 * Pattern Detector
 *
 * Detects problematic patterns in code changes:
 * - Hardcoded credentials
 * - TODO/FIXME comments
 * - Console.log spam
 * - Large commented blocks
 * - Suspicious imports
 */

interface Pattern {
  id: string;
  name: string;
  description: string;
  severity: 'warning' | 'info' | 'critical';
  pattern: RegExp;
  category: 'security' | 'quality' | 'performance' | 'maintenance';
}

interface PatternMatch {
  pattern: Pattern;
  line: number;
  match: string;
  context: string;
}

interface DetectionResult {
  filepath: string;
  matches: PatternMatch[];
  hasIssues: boolean;
}

// Predefined patterns
const PATTERNS: Pattern[] = [
  // Security patterns
  {
    id: 'hardcoded-password',
    name: 'Hardcoded Password',
    description: 'Password appears to be hardcoded in source',
    severity: 'critical',
    pattern: /(password|passwd|pwd)\s*=\s*["'][^"']+["']/i,
    category: 'security'
  },
  {
    id: 'hardcoded-api-key',
    name: 'Hardcoded API Key',
    description: 'API key or token appears hardcoded',
    severity: 'critical',
    pattern: /(api[_-]?key|api[_-]?token|access[_-]?token|secret[_-]?key)\s*=\s*["'][^"']+["']/i,
    category: 'security'
  },
  {
    id: 'hardcoded-secret',
    name: 'Hardcoded Secret',
    description: 'Secret value appears hardcoded',
    severity: 'critical',
    pattern: /(secret|private[_-]?key)\s*=\s*["'][^"']+["']/i,
    category: 'security'
  },
  {
    id: 'eval-usage',
    name: 'Dangerous eval() Usage',
    description: 'Using eval() can be a security risk',
    severity: 'critical',
    pattern: /\beval\s*\(/,
    category: 'security'
  }
];

class PatternDetector {
  private patterns: Pattern[];

  // Filepath skip-list. Each regex matches a category of files where any
  // pattern hit is overwhelmingly a false positive. Order matters only
  // for readability — any match short-circuits the scan.
  static readonly SKIP_PATTERNS: RegExp[] = [
    // Test files (own-project; lowercase __tests__ dir or .test/.spec suffix).
    /\b__tests__\b/,
    /\.(?:test|spec)\.[cm]?[jt]sx?$/,
    // Coverage reports — Puppeteer's `page.$eval` matches the eval pattern.
    /\bcoverage\//,
    // Vendored or minified third-party libs.
    /\b(?:vendor|third_party)\//,
    /\.min\.(?:js|css|mjs)$/,
    // Binary / data files. Scanning a SQLite DB or wasm blob is just luck-of-
    // the-draw byte-string matches against the credential regex.
    /\.(?:sqlite3?|db|wasm|bin|map|lock)$/i,
    // The detector's own source — its pattern definitions ARE the regexes
    // it scans for, so it always matches itself. Skip both the source and
    // any compiled dist copy.
    /\bpattern-detector\.[cm]?[jt]s$/,
    // Raven's own tree, absolute paths only. Relative-path skipping is
    // handled in event-bus-bindings.ts via projectName === 'raven', which
    // is a reliable signal — naming a directory `backend` or `frontend`
    // doesn't make it Raven's code (every other Svelte project does too).
    /\/raven\/(?:backend|frontend)\//
  ];

  static shouldSkip(filepath: string): boolean {
    return PatternDetector.SKIP_PATTERNS.some(rx => rx.test(filepath));
  }

  constructor(customPatterns: Pattern[] = []) {
    this.patterns = [...PATTERNS, ...customPatterns];
  }

  /**
   * Detect patterns in file content
   */
  detect(filepath: string, content: string): DetectionResult {
    const matches: PatternMatch[] = [];

    // Skip files where matches are virtually always false positives.
    // The previous list checked for `raven/backend/` etc. as substrings,
    // which silently failed for relative paths (the watcher emits
    // `backend/services/...` not `raven/backend/services/...`), letting
    // the detector flag its OWN pattern definitions and other safe files.
    if (PatternDetector.shouldSkip(filepath)) {
      return { filepath, matches, hasIssues: false };
    }

    const lines = content.split('\n');

    lines.forEach((line, index) => {
      for (const pattern of this.patterns) {
        if (pattern.pattern.test(line)) {
          const match = line.match(pattern.pattern);
          if (match) {
            matches.push({
              pattern,
              line: index + 1,
              match: match[0],
              context: line.trim()
            });
          }
        }
      }
    });

    return {
      filepath,
      matches,
      hasIssues: matches.length > 0
    };
  }

  /**
   * Detect patterns in a diff (only new/changed lines)
   */
  detectInDiff(filepath: string, diff: string): DetectionResult {
    const matches: PatternMatch[] = [];
    const lines = diff.split('\n');

    let currentLine = 0;
    lines.forEach(line => {
      // Only check added lines (starting with +)
      if (line.startsWith('+') && !line.startsWith('+++')) {
        currentLine++;
        const content = line.substring(1); // Remove + prefix

        for (const pattern of this.patterns) {
          if (pattern.pattern.test(content)) {
            const match = content.match(pattern.pattern);
            if (match) {
              matches.push({
                pattern,
                line: currentLine,
                match: match[0],
                context: content.trim()
              });
            }
          }
        }
      } else if (!line.startsWith('-') && !line.startsWith('---')) {
        currentLine++;
      }
    });

    return {
      filepath,
      matches,
      hasIssues: matches.length > 0
    };
  }

  /**
   * Get patterns by category
   */
  getPatternsByCategory(category: string): Pattern[] {
    return this.patterns.filter(p => p.category === category);
  }

  /**
   * Get patterns by severity
   */
  getPatternsBySeverity(severity: string): Pattern[] {
    return this.patterns.filter(p => p.severity === severity);
  }

  /**
   * Get all patterns
   */
  getAllPatterns(): Pattern[] {
    return this.patterns;
  }

  /**
   * Add custom pattern
   */
  addPattern(pattern: Pattern): void {
    this.patterns.push(pattern);
  }

  /**
   * Remove pattern by ID
   */
  removePattern(id: string): void {
    this.patterns = this.patterns.filter(p => p.id !== id);
  }
}

// Export singleton
export const patternDetector = new PatternDetector();
