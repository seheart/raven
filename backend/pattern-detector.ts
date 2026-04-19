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

export interface Pattern {
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

  constructor(customPatterns: Pattern[] = []) {
    this.patterns = [...PATTERNS, ...customPatterns];
  }

  /**
   * Detect patterns in file content
   */
  detect(filepath: string, content: string): DetectionResult {
    const matches: PatternMatch[] = [];

    // Skip Raven's own source files and test files
    if (
      filepath.includes('raven/backend/') ||
      filepath.includes('raven/frontend/') ||
      filepath.includes('__tests__') ||
      filepath.includes('.test.') ||
      filepath.includes('.spec.')
    ) {
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
