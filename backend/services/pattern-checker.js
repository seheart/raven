import { readFileSync } from 'fs';
import { extname, basename } from 'path';
import { logger } from '../utils/logger.js';

/**
 * Pattern Warnings Checker
 * Detects common anti-patterns and code quality issues
 */
export class PatternChecker {
  constructor(db, sessionId, io, projectName = null) {
    this.db = db;
    this.sessionId = sessionId;
    this.io = io;
    this.projectName = projectName;

    // Define patterns to check
    this.patterns = [
      // Security patterns
      {
        category: 'security',
        name: 'hardcoded-credential',
        regex: /(password|passwd|pwd|secret|token|api[_-]?key)\s*=\s*['"][^'"]+['"]/gi,
        message: 'Potential hardcoded credential detected',
        suggestion: 'Use environment variables or a secrets management system',
        severity: 'error'
      },
      {
        category: 'security',
        name: 'eval-usage',
        regex: /\beval\s*\(/g,
        message: 'Use of eval() detected - potential security risk',
        suggestion: 'Avoid eval() and use safer alternatives',
        severity: 'warning'
      },

      // Quality patterns
      {
        category: 'quality',
        name: 'console-log',
        regex: /console\.(log|debug|info|warn|error)\(/g,
        message: 'Console statement detected',
        suggestion: 'Use a proper logging library',
        severity: 'warning'
      },
      {
        category: 'quality',
        name: 'debugger',
        regex: /\bdebugger\b/g,
        message: 'Debugger statement detected',
        suggestion: 'Remove debugger statements before committing',
        severity: 'warning'
      },
      {
        category: 'quality',
        name: 'todo-comment',
        regex: /(\/\/|\/\*|#)\s*(TODO|FIXME|HACK|XXX)/gi,
        message: 'TODO/FIXME comment detected',
        suggestion: 'Create a proper issue/task for this',
        severity: 'info'
      },

      // Maintenance patterns
      {
        category: 'maintenance',
        name: 'long-line',
        regex: /.{200,}/g,
        message: 'Line exceeds 200 characters',
        suggestion: 'Break long lines for better readability',
        severity: 'info'
      }
    ];
  }

  /**
   * Check a file for pattern warnings
   */
  async checkFile(filepath) {
    const ext = extname(filepath).toLowerCase();

    // Skip binary files and certain extensions
    const skipExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.woff', '.woff2', '.ttf', '.eot', '.mp4', '.mp3'];
    if (skipExtensions.includes(ext)) {
      return [];
    }

    // Skip node_modules and other common ignore patterns
    if (filepath.includes('node_modules') || filepath.includes('.git') || filepath.includes('dist') || filepath.includes('build')) {
      return [];
    }

    try {
      const content = readFileSync(filepath, 'utf-8');
      const lines = content.split('\n');
      const warnings = [];

      // Check each pattern
      for (const pattern of this.patterns) {
        const matches = this.findPatternMatches(content, lines, pattern);
        warnings.push(...matches);
      }

      // Clear old warnings for this file
      this.db.clearPatternWarnings(filepath);

      // Insert new warnings
      const timestamp = new Date().toISOString();
      for (const warning of warnings) {
        const warningId = this.db.insertPatternWarning(
          timestamp,
          filepath,
          warning.category,
          warning.severity,
          warning.name,
          warning.message,
          warning.line,
          warning.suggestion,
          this.sessionId
        );

        // Emit WebSocket event for critical patterns
        if (warning.severity === 'error') {
          this.io.emit('pattern-warning', {
            id: warningId,
            timestamp,
            filepath,
            category: warning.category,
            severity: warning.severity,
            pattern_name: warning.name,
            message: warning.message,
            line_number: warning.line
          });
        }
      }

      return warnings;
    } catch (error) {
      logger.error(`Error checking patterns for ${filepath}:`, error);
      return [];
    }
  }

  /**
   * Find all matches for a pattern in content
   */
  findPatternMatches(content, lines, pattern) {
    const matches = [];
    const regex = new RegExp(pattern.regex.source, pattern.regex.flags);
    let match;

    // For line-based patterns, check each line
    if (pattern.name === 'long-line') {
      lines.forEach((line, index) => {
        if (line.length > 200) {
          matches.push({
            ...pattern,
            line: index + 1
          });
        }
      });
    } else {
      // For regex patterns, find all matches
      while ((match = regex.exec(content)) !== null) {
        const position = match.index;
        const line = content.substring(0, position).split('\n').length;

        matches.push({
          ...pattern,
          line
        });
      }
    }

    return matches;
  }
}
