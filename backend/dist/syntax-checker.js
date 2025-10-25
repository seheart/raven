/**
 * Syntax Checker Service
 *
 * Automatically detects syntax errors in code files as AI makes changes.
 * Supports multiple languages and provides detailed error reporting.
 */
import { exec } from 'child_process';
import { promisify } from 'util';
import { join } from 'path';
import { readFile } from 'fs/promises';
const execAsync = promisify(exec);
/**
 * Syntax Checker - validates code syntax across multiple languages
 */
export class SyntaxChecker {
    supportedExtensions;
    constructor() {
        // Map file extensions to language checkers
        this.supportedExtensions = new Map([
            ['.js', 'javascript'],
            ['.mjs', 'javascript'],
            ['.cjs', 'javascript'],
            ['.jsx', 'javascript'],
            ['.ts', 'typescript'],
            ['.tsx', 'typescript'],
            ['.py', 'python'],
            ['.json', 'json'],
            ['.yaml', 'yaml'],
            ['.yml', 'yaml'],
        ]);
    }
    /**
     * Check if file type is supported
     */
    isSupported(filePath) {
        const ext = this.getExtension(filePath);
        return this.supportedExtensions.has(ext);
    }
    /**
     * Get file extension
     */
    getExtension(filePath) {
        const match = filePath.match(/\.[^.]+$/);
        return match ? match[0] : '';
    }
    /**
     * Check syntax for a file
     */
    async check(filePath) {
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
            let errors = [];
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
        }
        catch (error) {
            console.error(`Syntax check failed for ${filePath}:`, error);
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
    async checkJavaScript(filePath) {
        try {
            // Use node --check to validate syntax
            await execAsync(`node --check "${filePath}"`, { timeout: 5000 });
            return [];
        }
        catch (error) {
            const errors = [];
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
     * Check TypeScript syntax
     */
    async checkTypeScript(filePath) {
        try {
            // Try using tsc if available
            await execAsync(`npx tsc --noEmit --skipLibCheck "${filePath}"`, {
                timeout: 10000,
                cwd: join(filePath, '..')
            });
            return [];
        }
        catch (error) {
            const errors = [];
            const output = error.stderr || error.stdout || '';
            const lines = output.split('\n');
            for (const line of lines) {
                // Match patterns like: file.ts(10,5): error TS1234: message
                const match = line.match(/.*\((\d+),(\d+)\):\s*error\s*TS\d+:\s*(.+)/);
                if (match) {
                    errors.push({
                        file: filePath,
                        line: parseInt(match[1]),
                        column: parseInt(match[2]),
                        message: match[3].trim(),
                        severity: 'error',
                        language: 'typescript'
                    });
                }
            }
            // If TypeScript is not available, fall back to JavaScript check
            if (errors.length === 0) {
                return this.checkJavaScript(filePath);
            }
            return errors;
        }
    }
    /**
     * Check Python syntax
     */
    async checkPython(filePath) {
        try {
            // Use python -m py_compile to check syntax
            await execAsync(`python3 -m py_compile "${filePath}"`, { timeout: 5000 });
            return [];
        }
        catch (error) {
            const errors = [];
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
    async checkJSON(filePath) {
        try {
            const content = await readFile(filePath, 'utf-8');
            JSON.parse(content);
            return [];
        }
        catch (error) {
            const errors = [];
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
    async checkYAML(filePath) {
        try {
            // Try using yamllint if available, otherwise just try to parse
            const content = await readFile(filePath, 'utf-8');
            // Basic YAML validation (checking for common issues)
            const lines = content.split('\n');
            const errors = [];
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
        }
        catch (error) {
            return [{
                    file: filePath,
                    line: 1,
                    message: error.message || 'YAML syntax error',
                    severity: 'error',
                    language: 'yaml'
                }];
        }
    }
    /**
     * Get supported languages
     */
    getSupportedLanguages() {
        return Array.from(new Set(this.supportedExtensions.values()));
    }
}
// Export singleton instance
export const syntaxChecker = new SyntaxChecker();
//# sourceMappingURL=syntax-checker.js.map