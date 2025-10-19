/**
 * Diff - Text comparison and diff generation utility
 *
 * Provides functions for generating structured diffs between text content.
 * Uses the 'diff' library for line-based and character-based comparisons.
 */

import { diffLines, diffChars, Change } from 'diff';

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
export function getDiff(oldText: string, newText: string): DiffResult[] {
  const changes = diffLines(oldText, newText);
  return changes.map((change: Change) => ({
    added: change.added,
    removed: change.removed,
    value: change.value,
    count: change.count
  }));
}

/**
 * Generate character-level diff (useful for small changes)
 *
 * @param oldText - Original text content
 * @param newText - New text content
 * @returns Array of character-level diff changes
 */
export function getCharDiff(oldText: string, newText: string): DiffResult[] {
  const changes = diffChars(oldText, newText);
  return changes.map((change: Change) => ({
    added: change.added,
    removed: change.removed,
    value: change.value,
    count: change.count
  }));
}

/**
 * Generate unified diff patch (similar to git diff format)
 *
 * @param oldText - Original text content
 * @param newText - New text content
 * @param filename - Optional filename for context
 * @returns Unified diff string
 */
export async function createPatch(
  oldText: string,
  newText: string,
  filename: string = 'file'
): Promise<string> {
  const { createPatch: diffCreatePatch } = await import('diff');
  return diffCreatePatch(filename, oldText, newText, '', '');
}

/**
 * Calculate diff statistics
 *
 * @param oldText - Original text content
 * @param newText - New text content
 * @returns Statistics about the changes
 */
export function getDiffStats(oldText: string, newText: string): DiffStats {
  const changes = diffLines(oldText, newText);

  let linesAdded = 0;
  let linesRemoved = 0;

  changes.forEach((change: Change) => {
    if (change.added) {
      linesAdded += change.count || 0;
    } else if (change.removed) {
      linesRemoved += change.count || 0;
    }
  });

  return {
    linesAdded,
    linesRemoved,
    linesChanged: linesAdded + linesRemoved,
    totalChanges: changes.length
  };
}

/**
 * Check if two texts are identical
 *
 * @param text1 - First text
 * @param text2 - Second text
 * @returns True if texts are identical
 */
export function areIdentical(text1: string, text2: string): boolean {
  return text1 === text2;
}

/**
 * Get similarity percentage between two texts
 *
 * @param text1 - First text
 * @param text2 - Second text
 * @returns Similarity percentage (0-100)
 */
export function getSimilarity(text1: string, text2: string): number {
  if (text1 === text2) return 100;
  if (text1.length === 0 && text2.length === 0) return 100;
  if (text1.length === 0 || text2.length === 0) return 0;

  const changes = diffChars(text1, text2);
  let unchanged = 0;
  let total = 0;

  changes.forEach((change: Change) => {
    const len = change.value.length;
    total += len;
    if (!change.added && !change.removed) {
      unchanged += len;
    }
  });

  return total > 0 ? (unchanged / total) * 100 : 0;
}
