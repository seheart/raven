/**
 * Diff - Text comparison and diff generation utility
 *
 * Provides functions for generating structured diffs between text content.
 * Uses the 'diff' library for line-based and character-based comparisons.
 */

import { diffLines, Change } from 'diff';

/**
 * Structured diff result
 */
interface DiffResult {
  added: boolean | undefined;
  removed: boolean | undefined;
  value: string;
  count?: number;
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
