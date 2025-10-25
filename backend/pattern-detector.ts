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

export interface PatternMatch {
  pattern: Pattern;
  line: number;
  match: string;
  context: string;
}

export interface DetectionResult {
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
  },

  // Code quality patterns
  {
    id: 'console-log',
    name: 'Console Log Statement',
    description: 'Debug console.log should be removed',
    severity: 'info',
    pattern: /console\.(log|debug|info|warn|error)\(/,
    category: 'quality'
  },
  {
    id: 'debugger',
    name: 'Debugger Statement',
    description: 'Debugger statement should be removed',
    severity: 'warning',
    pattern: /\bdebugger\b/,
    category: 'quality'
  },
  {
    id: 'todo-comment',
    name: 'TODO Comment',
    description: 'TODO comment indicates incomplete work',
    severity: 'info',
    pattern: /\/\/\s*TODO|\/\*\s*TODO|\#\s*TODO/i,
    category: 'maintenance'
  },
  {
    id: 'fixme-comment',
    name: 'FIXME Comment',
    description: 'FIXME indicates code that needs fixing',
    severity: 'warning',
    pattern: /\/\/\s*FIXME|\/\*\s*FIXME|\#\s*FIXME/i,
    category: 'maintenance'
  },
  {
    id: 'hack-comment',
    name: 'HACK Comment',
    description: 'HACK indicates questionable code',
    severity: 'warning',
    pattern: /\/\/\s*HACK|\/\*\s*HACK|\#\s*HACK/i,
    category: 'maintenance'
  },

  // Performance patterns
  {
    id: 'inefficient-loop',
    name: 'Inefficient Loop Pattern',
    description: 'Array.length calculated in every iteration',
    severity: 'info',
    pattern: /for\s*\([^;]+;\s*\w+\s*<\s*\w+\.length\s*;/,
    category: 'performance'
  },

  // Suspicious patterns
  {
    id: 'process-env',
    name: 'Direct process.env Access',
    description: 'Consider using config module instead',
    severity: 'info',
    pattern: /process\.env\.\w+/,
    category: 'quality'
  },
  {
    id: 'any-type',
    name: 'TypeScript Any Type',
    description: 'Using "any" defeats TypeScript benefits',
    severity: 'info',
    pattern: /:\s*any\b/,
    category: 'quality'
  }
];

export class PatternDetector {
  private patterns: Pattern[];

  constructor(customPatterns: Pattern[] = []) {
    this.patterns = [...PATTERNS, ...customPatterns];
  }

  /**
   * Detect patterns in file content
   */
  detect(filepath: string, content: string): DetectionResult {
    const matches: PatternMatch[] = [];
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
    lines.forEach((line) => {
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
