import { readFileSync } from 'fs';
import { extname } from 'path';
import { logger } from '../utils/logger.js';

/**
 * Syntax Checker Service
 * Checks files for syntax errors using AST parsing
 */
export class SyntaxChecker {
  constructor(db, sessionId, io, projectName = null) {
    this.db = db;
    this.sessionId = sessionId;
    this.io = io;
    this.projectName = projectName;
  }

  /**
   * Check a file for syntax errors
   * @param {string} filepath - Full path to the file
   * @returns {Array} Array of syntax errors found
   */
  async checkFile(filepath) {
    // Skip node_modules - these are dependencies, not our code
    if (filepath.includes('node_modules')) {
      return [];
    }

    // Skip TypeScript declaration files (.d.ts) - these use TypeScript-only syntax
    if (filepath.endsWith('.d.ts')) {
      return [];
    }

    // Skip dist/build directories
    if (filepath.includes('/dist/') || filepath.includes('/build/')) {
      return [];
    }

    const ext = extname(filepath).toLowerCase();
    const language = this.getLanguageFromExtension(ext);

    if (!language) {
      // Skip unsupported file types
      return [];
    }

    try {
      const content = readFileSync(filepath, 'utf-8');
      const lines = content.split('\n');
      const errors = await this.parseForErrors(content, language, filepath);

      // Clear old errors for this file
      this.db.clearSyntaxErrors(filepath);

      // Insert new errors
      const timestamp = new Date().toISOString();
      for (const error of errors) {
        // Extract code snippet (3 lines: before, error, after)
        const codeSnippet = this.extractCodeSnippet(lines, error.line);

        const errorId = this.db.insertSyntaxError(
          timestamp,
          filepath,
          language,
          error.severity,
          error.message,
          error.line,
          error.column,
          codeSnippet,
          this.projectName,
          this.sessionId
        );

        // Emit WebSocket event
        this.io.emit('syntax-error', {
          id: errorId,
          timestamp,
          filepath,
          language,
          severity: error.severity,
          message: error.message,
          line_number: error.line,
          column_number: error.column,
          code_snippet: codeSnippet,
          project_name: this.projectName,
          errors: [error]
        });
      }

      return errors;
    } catch (error) {
      logger.error(`Error checking syntax for ${filepath}:`, error);
      return [];
    }
  }

  /**
   * Extract code snippet around error line
   */
  extractCodeSnippet(lines, errorLine) {
    const contextLines = 2; // Lines before and after
    const start = Math.max(0, errorLine - contextLines - 1);
    const end = Math.min(lines.length, errorLine + contextLines);

    const snippetLines = [];
    for (let i = start; i < end; i++) {
      const lineNum = i + 1;
      const isErrorLine = lineNum === errorLine;
      const prefix = isErrorLine ? '▶' : ' ';
      snippetLines.push(`${prefix} ${lineNum} | ${lines[i]}`);
    }

    return snippetLines.join('\n');
  }

  /**
   * Get language from file extension
   */
  getLanguageFromExtension(ext) {
    const languageMap = {
      '.js': 'javascript',
      '.mjs': 'javascript',
      '.cjs': 'javascript',
      '.jsx': 'javascript',
      '.ts': 'typescript',
      '.tsx': 'typescript',
      '.json': 'json',
      '.py': 'python'
    };

    return languageMap[ext] || null;
  }

  /**
   * Parse file content for syntax errors
   */
  async parseForErrors(content, language, _filepath) {
    const errors = [];

    try {
      switch (language) {
        case 'javascript':
          await this.checkJavaScript(content, errors);
          break;
        case 'typescript':
          await this.checkTypeScript(content, errors);
          break;
        case 'json':
          this.checkJSON(content, errors);
          break;
        case 'python':
          // Python syntax checking would require python-shell or similar
          // Skipping for now
          break;
        default:
          break;
      }
    } catch (error) {
      logger.error(`Parse error for ${language}:`, error);
    }

    return errors;
  }

  /**
   * Check JavaScript syntax using acorn
   */
  async checkJavaScript(content, errors) {
    try {
      // Dynamic import to avoid loading if not needed
      const acorn = await import('acorn');

      acorn.parse(content, {
        ecmaVersion: 'latest',
        sourceType: 'module',
        locations: true,
        allowAwaitOutsideFunction: true,
        allowReturnOutsideFunction: true
      });
    } catch (error) {
      errors.push({
        severity: 'error',
        message: error.message,
        line: error.loc?.line || 0,
        column: error.loc?.column || 0
      });
    }
  }

  /**
   * Check TypeScript syntax
   */
  async checkTypeScript(content, errors) {
    // Skip TypeScript-specific syntax that would fail in JavaScript parser
    // Common TypeScript-only patterns:
    const tsOnlyPatterns = [
      /import\s+type\s+/, // import type
      /export\s+type\s+/, // export type
      /declare\s+(const|let|var|function|class|interface|type|namespace|module)/, // declare
      /^\s*interface\s+\w+/m, // interface declaration
      /^\s*type\s+\w+\s*=/m, // type alias
      /as\s+(const|any|unknown|never|string|number|boolean)/, // type assertions
      /<\w+>/ // generic syntax (basic check)
    ];

    // If content has TypeScript-only syntax, skip JavaScript parsing
    // as it will always fail with "Unexpected token"
    for (const pattern of tsOnlyPatterns) {
      if (pattern.test(content)) {
        // This is TypeScript-only code, would need proper TS compiler
        // Skip to avoid false positives
        logger.debug('Skipping TypeScript-specific syntax checking - would need TS compiler');
        return;
      }
    }

    // If no TypeScript-specific syntax detected, try parsing as JavaScript
    await this.checkJavaScript(content, errors);
  }

  /**
   * Check JSON syntax
   */
  checkJSON(content, errors) {
    try {
      JSON.parse(content);
    } catch (error) {
      // Try to extract line number from error message
      const lineMatch = error.message.match(/position (\d+)/);
      let line = 0;

      if (lineMatch) {
        const position = parseInt(lineMatch[1]);
        line = content.substring(0, position).split('\n').length;
      }

      errors.push({
        severity: 'error',
        message: error.message,
        line,
        column: 0
      });
    }
  }
}
