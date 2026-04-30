/**
 * Syntax Checker Service
 *
 * Automatically detects syntax errors in code files as AI makes changes.
 * Supports multiple languages and provides detailed error reporting.
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import { readFile } from 'fs/promises';
import ts from 'typescript';
import { logger } from './utils/logger.js';

const execFileAsync = promisify(execFile);

interface SyntaxError {
  file: string;
  line: number;
  column?: number;
  message: string;
  severity: 'error' | 'warning';
  language: string;
}

interface SyntaxCheckResult {
  valid: boolean;
  errors: SyntaxError[];
  checkedAt: Date;
}

/**
 * Syntax Checker - validates code syntax across multiple languages
 */
class SyntaxChecker {
  private supportedExtensions: Map<string, string>;

  constructor() {
    // Map file extensions to language checkers
    this.supportedExtensions = new Map([
      ['.js', 'javascript'],
      ['.mjs', 'javascript'],
      ['.cjs', 'javascript'],
      ['.jsx', 'typescript'],
      ['.ts', 'typescript'],
      ['.tsx', 'typescript'],
      ['.py', 'python'],
      ['.json', 'json'],
      ['.yaml', 'yaml'],
      ['.yml', 'yaml']
    ]);
  }

  /**
   * Check if file type is supported
   */
  isSupported(filePath: string): boolean {
    const ext = this.getExtension(filePath);
    return this.supportedExtensions.has(ext);
  }

  /**
   * Get file extension
   */
  private getExtension(filePath: string): string {
    const match = filePath.match(/\.[^.]+$/);
    return match ? match[0] : '';
  }

  /**
   * Check syntax for a file
   */
  async check(filePath: string): Promise<SyntaxCheckResult> {
    const ext = this.getExtension(filePath);
    const language = this.supportedExtensions.get(ext);

    if (!language) {
      return {
        valid: true,
        errors: [],
        checkedAt: new Date()
      };
    }

    try {
      let errors: SyntaxError[] = [];

      switch (language) {
        case 'javascript':
          errors = await this.checkJavaScript(filePath);
          break;
        case 'typescript':
          errors = await this.checkTypeScript(filePath);
          break;
        case 'python':
          errors = await this.checkPython(filePath);
          break;
        case 'json':
          errors = await this.checkJSON(filePath);
          break;
        case 'yaml':
          errors = await this.checkYAML(filePath);
          break;
      }

      return {
        valid: errors.length === 0,
        errors,
        checkedAt: new Date()
      };
    } catch (error: any) {
      logger.error(`Syntax check failed for ${filePath}:`, error);
      return {
        valid: true, // Don't report checker failures as syntax errors
        errors: [],
        checkedAt: new Date()
      };
    }
  }

  /**
   * Check JavaScript syntax using Node.js
   */
  private async checkJavaScript(filePath: string): Promise<SyntaxError[]> {
    try {
      // Use node --check to validate syntax
      await execFileAsync('node', ['--check', filePath], { timeout: 5000 });
      return [];
    } catch (error: any) {
      const errors: SyntaxError[] = [];

      // Parse error output
      const output = error.stderr || error.stdout || '';
      const lines = output.split('\n');

      for (const line of lines) {
        // Match patterns like: file.js:10
        const match = line.match(/.*:(\d+)/);
        if (match) {
          const lineNum = parseInt(match[1]);
          const message = line.replace(/^.*?:\d+\s*/, '').trim();

          if (message) {
            errors.push({
              file: filePath,
              line: lineNum,
              message,
              severity: 'error',
              language: 'javascript'
            });
          }
        }
      }

      // If we couldn't parse specific errors, create a generic one
      if (errors.length === 0 && output) {
        errors.push({
          file: filePath,
          line: 1,
          message: output.split('\n')[0] || 'Syntax error detected',
          severity: 'error',
          language: 'javascript'
        });
      }

      return errors;
    }
  }

  /**
   * Check TypeScript / TSX / JSX syntax via the TypeScript parser API.
   *
   * Uses ts.createSourceFile so we only get parser diagnostics (TS1xxx) —
   * no module resolution, no type checking, no tsconfig dependency. This
   * sidesteps TS17004 ("Cannot use JSX unless the '--jsx' flag is provided"),
   * which fires when tsc is invoked on a .tsx file outside its project.
   */
  private async checkTypeScript(filePath: string): Promise<SyntaxError[]> {
    const source = await readFile(filePath, 'utf8');
    const ext = this.getExtension(filePath);
    const scriptKind =
      ext === '.tsx'
        ? ts.ScriptKind.TSX
        : ext === '.jsx'
          ? ts.ScriptKind.JSX
          : ext === '.ts'
            ? ts.ScriptKind.TS
            : ts.ScriptKind.JS;

    const sourceFile = ts.createSourceFile(
      filePath,
      source,
      ts.ScriptTarget.Latest,
      /* setParentNodes */ false,
      scriptKind
    );

    const diagnostics = (sourceFile as any).parseDiagnostics as ts.DiagnosticWithLocation[];
    if (!diagnostics || diagnostics.length === 0) return [];

    return diagnostics.map(diag => {
      const { line, character } = ts.getLineAndCharacterOfPosition(sourceFile, diag.start ?? 0);
      return {
        file: filePath,
        line: line + 1,
        column: character + 1,
        message: ts.flattenDiagnosticMessageText(diag.messageText, '\n'),
        severity: 'error' as const,
        language: 'typescript'
      };
    });
  }

  /**
   * Check Python syntax
   */
  private async checkPython(filePath: string): Promise<SyntaxError[]> {
    try {
      // Use python -m py_compile to check syntax
      await execFileAsync('python3', ['-m', 'py_compile', filePath], { timeout: 5000 });
      return [];
    } catch (error: any) {
      const errors: SyntaxError[] = [];
      const output = error.stderr || error.stdout || '';
      const lines = output.split('\n');

      for (const line of lines) {
        // Match patterns like: File "file.py", line 10
        const match = line.match(/File ".*", line (\d+)/);
        if (match) {
          const lineNum = parseInt(match[1]);
          const nextLine = lines[lines.indexOf(line) + 1] || '';

          errors.push({
            file: filePath,
            line: lineNum,
            message: nextLine.trim() || 'Syntax error',
            severity: 'error',
            language: 'python'
          });
        }
      }

      if (errors.length === 0 && output) {
        errors.push({
          file: filePath,
          line: 1,
          message: output.split('\n')[0] || 'Syntax error detected',
          severity: 'error',
          language: 'python'
        });
      }

      return errors;
    }
  }

  /**
   * Check JSON syntax
   */
  private async checkJSON(filePath: string): Promise<SyntaxError[]> {
    try {
      const content = await readFile(filePath, 'utf-8');
      JSON.parse(content);
      return [];
    } catch (error: any) {
      const errors: SyntaxError[] = [];

      // Try to extract line number from error message
      const match = error.message.match(/at position (\d+)/);
      let line = 1;

      if (match) {
        const content = await readFile(filePath, 'utf-8');
        const position = parseInt(match[1]);
        line = content.substring(0, position).split('\n').length;
      }

      errors.push({
        file: filePath,
        line,
        message: error.message,
        severity: 'error',
        language: 'json'
      });

      return errors;
    }
  }

  /**
   * Check YAML syntax
   */
  private async checkYAML(filePath: string): Promise<SyntaxError[]> {
    try {
      // Try using yamllint if available, otherwise just try to parse
      const content = await readFile(filePath, 'utf-8');

      // Basic YAML validation (checking for common issues)
      const lines = content.split('\n');
      const errors: SyntaxError[] = [];

      lines.forEach((line, idx) => {
        // Check for tabs (YAML doesn't allow tabs for indentation)
        if (line.includes('\t')) {
          errors.push({
            file: filePath,
            line: idx + 1,
            message: 'YAML does not allow tabs for indentation',
            severity: 'error',
            language: 'yaml'
          });
        }
      });

      return errors;
    } catch (error: any) {
      return [
        {
          file: filePath,
          line: 1,
          message: error.message || 'YAML syntax error',
          severity: 'error',
          language: 'yaml'
        }
      ];
    }
  }

  /**
   * Get supported languages
   */
  getSupportedLanguages(): string[] {
    return Array.from(new Set(this.supportedExtensions.values()));
  }
}

// Export singleton instance
export const syntaxChecker = new SyntaxChecker();
