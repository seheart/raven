/**
 * Diff - Text comparison and diff generation utility
 *
 * Provides functions for generating structured diffs between text content.
 * Uses the 'diff' library for line-based and character-based comparisons.
 */
/**
 * Structured diff result
 */
export interface DiffResult {
    added: boolean | undefined;
    removed: boolean | undefined;
    value: string;
    count?: number;
}
/**
 * Diff statistics
 */
export interface DiffStats {
    linesAdded: number;
    linesRemoved: number;
    linesChanged: number;
    totalChanges: number;
}
/**
 * Generate line-by-line diff between two text strings
 *
 * @param oldText - Original text content
 * @param newText - New text content
 * @returns Array of diff changes
 */
export declare function getDiff(oldText: string, newText: string): DiffResult[];
/**
 * Generate character-level diff (useful for small changes)
 *
 * @param oldText - Original text content
 * @param newText - New text content
 * @returns Array of character-level diff changes
 */
export declare function getCharDiff(oldText: string, newText: string): DiffResult[];
/**
 * Generate unified diff patch (similar to git diff format)
 *
 * @param oldText - Original text content
 * @param newText - New text content
 * @param filename - Optional filename for context
 * @returns Unified diff string
 */
export declare function createPatch(oldText: string, newText: string, filename?: string): Promise<string>;
/**
 * Calculate diff statistics
 *
 * @param oldText - Original text content
 * @param newText - New text content
 * @returns Statistics about the changes
 */
export declare function getDiffStats(oldText: string, newText: string): DiffStats;
/**
 * Check if two texts are identical
 *
 * @param text1 - First text
 * @param text2 - Second text
 * @returns True if texts are identical
 */
export declare function areIdentical(text1: string, text2: string): boolean;
/**
 * Get similarity percentage between two texts
 *
 * @param text1 - First text
 * @param text2 - Second text
 * @returns Similarity percentage (0-100)
 */
export declare function getSimilarity(text1: string, text2: string): number;
//# sourceMappingURL=diff.d.ts.map