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
export declare class PatternDetector {
    private patterns;
    constructor(customPatterns?: Pattern[]);
    /**
     * Detect patterns in file content
     */
    detect(filepath: string, content: string): DetectionResult;
    /**
     * Detect patterns in a diff (only new/changed lines)
     */
    detectInDiff(filepath: string, diff: string): DetectionResult;
    /**
     * Get patterns by category
     */
    getPatternsByCategory(category: string): Pattern[];
    /**
     * Get patterns by severity
     */
    getPatternsBySeverity(severity: string): Pattern[];
    /**
     * Get all patterns
     */
    getAllPatterns(): Pattern[];
    /**
     * Add custom pattern
     */
    addPattern(pattern: Pattern): void;
    /**
     * Remove pattern by ID
     */
    removePattern(id: string): void;
}
export declare const patternDetector: PatternDetector;
//# sourceMappingURL=pattern-detector.d.ts.map