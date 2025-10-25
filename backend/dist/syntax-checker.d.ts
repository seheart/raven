/**
 * Syntax Checker Service
 *
 * Automatically detects syntax errors in code files as AI makes changes.
 * Supports multiple languages and provides detailed error reporting.
 */
export interface SyntaxError {
    file: string;
    line: number;
    column?: number;
    message: string;
    severity: 'error' | 'warning';
    language: string;
}
export interface SyntaxCheckResult {
    valid: boolean;
    errors: SyntaxError[];
    checkedAt: Date;
}
/**
 * Syntax Checker - validates code syntax across multiple languages
 */
export declare class SyntaxChecker {
    private supportedExtensions;
    constructor();
    /**
     * Check if file type is supported
     */
    isSupported(filePath: string): boolean;
    /**
     * Get file extension
     */
    private getExtension;
    /**
     * Check syntax for a file
     */
    check(filePath: string): Promise<SyntaxCheckResult>;
    /**
     * Check JavaScript syntax using Node.js
     */
    private checkJavaScript;
    /**
     * Check TypeScript syntax
     */
    private checkTypeScript;
    /**
     * Check Python syntax
     */
    private checkPython;
    /**
     * Check JSON syntax
     */
    private checkJSON;
    /**
     * Check YAML syntax
     */
    private checkYAML;
    /**
     * Get supported languages
     */
    getSupportedLanguages(): string[];
}
export declare const syntaxChecker: SyntaxChecker;
//# sourceMappingURL=syntax-checker.d.ts.map