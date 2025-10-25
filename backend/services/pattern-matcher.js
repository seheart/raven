/**
 * PatternMatcher - Finds similar changes in history
 *
 * Uses similarity scoring to identify:
 * - Changes similar to past incidents
 * - Recurring patterns
 * - Historical outcomes
 */

import { basename } from 'path';

export class PatternMatcher {
  constructor(projectDatabases) {
    this.projectDatabases = projectDatabases;
  }

  /**
   * Find similar past changes
   * @param {Object} change - Current change to match
   * @param {string} projectName
   * @param {number} limit - Max results to return
   * @returns {Array} Similar changes with similarity scores
   */
  findSimilarChanges(change, projectName, limit = 5) {
    const db = this.projectDatabases.get(projectName);
    if (!db) return [];

    try {
      // Get historical changes from last 90 days (excluding this one)
      const historical = db.db.prepare(`
        SELECT
          e.*,
          r.id as rollback_id,
          r.reason as rollback_reason,
          r.timestamp as rollback_time
        FROM events e
        LEFT JOIN rollbacks r ON e.id = r.event_id
        WHERE e.timestamp > datetime('now', '-90 days')
        AND e.id != ?
        ORDER BY e.timestamp DESC
        LIMIT 200
      `).all(change.id || 0);

      // Calculate similarity scores
      const scored = historical
        .map(past => ({
          ...past,
          similarity: this.calculateSimilarity(change, past),
          outcome: past.rollback_id ? 'rolled_back' : 'kept'
        }))
        .filter(item => item.similarity > 0.5) // Only show matches >50%
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, limit);

      return scored;
    } catch (e) {
      console.error('Error finding similar changes:', e);
      return [];
    }
  }

  /**
   * Calculate similarity between two changes (0-1 score)
   */
  calculateSimilarity(change1, change2) {
    let score = 0;
    let maxScore = 0;

    // Factor 1: Same file (highest weight)
    maxScore += 0.4;
    if (change1.filepath === change2.filepath) {
      score += 0.4;
    } else if (this.isSimilarFile(change1.filepath, change2.filepath)) {
      score += 0.2; // Related file (e.g., auth.js vs auth-service.js)
    }

    // Factor 2: Same change type
    maxScore += 0.15;
    if (change1.change_type === change2.change_type) {
      score += 0.15;
    }

    // Factor 3: Similar change size
    maxScore += 0.15;
    const sizeSimilarity = this.compareSizes(
      change1.diff?.length || 0,
      change2.diff?.length || 0
    );
    score += sizeSimilarity * 0.15;

    // Factor 4: Same agent
    maxScore += 0.1;
    if (change1.agent && change2.agent && change1.agent === change2.agent) {
      score += 0.1;
    }

    // Factor 5: Similar time of day
    maxScore += 0.05;
    const timeSimilarity = this.compareTimeOfDay(change1.timestamp, change2.timestamp);
    score += timeSimilarity * 0.05;

    // Factor 6: Diff content similarity (expensive, so only if needed)
    maxScore += 0.15;
    if (change1.diff && change2.diff) {
      const diffSimilarity = this.compareDiffs(change1.diff, change2.diff);
      score += diffSimilarity * 0.15;
    }

    // Normalize to 0-1
    return score / maxScore;
  }

  isSimilarFile(filepath1, filepath2) {
    const name1 = basename(filepath1, '.js').toLowerCase();
    const name2 = basename(filepath2, '.js').toLowerCase();

    // Check if one contains the other
    if (name1.includes(name2) || name2.includes(name1)) {
      return true;
    }

    // Check for common patterns (auth, payment, user, etc.)
    const patterns = ['auth', 'payment', 'user', 'database', 'api', 'config'];
    for (const pattern of patterns) {
      if (name1.includes(pattern) && name2.includes(pattern)) {
        return true;
      }
    }

    return false;
  }

  compareSizes(size1, size2) {
    if (size1 === 0 || size2 === 0) return 0;

    const ratio = Math.min(size1, size2) / Math.max(size1, size2);
    return ratio; // 1.0 = same size, 0.0 = very different
  }

  compareTimeOfDay(timestamp1, timestamp2) {
    const hour1 = new Date(timestamp1).getHours();
    const hour2 = new Date(timestamp2).getHours();

    const diff = Math.abs(hour1 - hour2);

    // Similar if within 2 hours
    if (diff <= 2) return 1.0;
    if (diff <= 4) return 0.5;
    return 0.0;
  }

  compareDiffs(diff1, diff2) {
    // Simple token-based similarity
    const tokens1 = this.tokenize(diff1);
    const tokens2 = this.tokenize(diff2);

    if (tokens1.size === 0 || tokens2.size === 0) return 0;

    // Jaccard similarity
    const intersection = new Set([...tokens1].filter(t => tokens2.has(t)));
    const union = new Set([...tokens1, ...tokens2]);

    return intersection.size / union.size;
  }

  tokenize(diff) {
    // Extract meaningful tokens from diff
    const tokens = new Set();

    // Remove diff markers
    const cleaned = diff.replace(/^[+\-]/gm, '');

    // Extract words (alphanumeric sequences)
    const words = cleaned.match(/\w+/g) || [];

    // Only keep tokens of reasonable length (3-30 chars)
    words.forEach(word => {
      if (word.length >= 3 && word.length <= 30) {
        tokens.add(word.toLowerCase());
      }
    });

    return tokens;
  }

  /**
   * Find patterns in rollback incidents
   * @param {string} projectName
   * @returns {Array} Common patterns that lead to rollbacks
   */
  analyzeRollbackPatterns(projectName) {
    const db = this.projectDatabases.get(projectName);
    if (!db) return [];

    try {
      // Get all rollback incidents
      const rollbacks = db.db.prepare(`
        SELECT
          e.filepath,
          e.change_type,
          e.agent,
          LENGTH(e.diff) as diff_size,
          r.reason
        FROM events e
        JOIN rollbacks r ON e.id = r.event_id
        WHERE e.timestamp > datetime('now', '-90 days')
      `).all();

      if (rollbacks.length === 0) return [];

      // Group by common factors
      const patterns = {
        byFile: new Map(),
        byAgent: new Map(),
        byChangeType: new Map(),
        byReason: new Map()
      };

      for (const rb of rollbacks) {
        // By file
        const file = rb.filepath;
        patterns.byFile.set(file, (patterns.byFile.get(file) || 0) + 1);

        // By agent
        if (rb.agent) {
          patterns.byAgent.set(rb.agent, (patterns.byAgent.get(rb.agent) || 0) + 1);
        }

        // By change type
        patterns.byChangeType.set(rb.change_type, (patterns.byChangeType.get(rb.change_type) || 0) + 1);

        // By reason keywords
        if (rb.reason) {
          const keywords = this.extractKeywords(rb.reason);
          for (const keyword of keywords) {
            patterns.byReason.set(keyword, (patterns.byReason.get(keyword) || 0) + 1);
          }
        }
      }

      // Find top patterns
      const results = [];

      // Top problematic files
      const topFiles = [...patterns.byFile.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);

      for (const [file, count] of topFiles) {
        if (count >= 3) {
          results.push({
            type: 'file',
            value: file,
            count,
            message: `${file} has been rolled back ${count} times`
          });
        }
      }

      // Top problematic agents
      const topAgents = [...patterns.byAgent.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3);

      for (const [agent, count] of topAgents) {
        if (count >= 3) {
          results.push({
            type: 'agent',
            value: agent,
            count,
            message: `${agent} has ${count} rollbacks (check behavior)`
          });
        }
      }

      // Common rollback reasons
      const topReasons = [...patterns.byReason.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);

      for (const [reason, count] of topReasons) {
        if (count >= 2) {
          results.push({
            type: 'reason',
            value: reason,
            count,
            message: `"${reason}" appears in ${count} rollback reasons`
          });
        }
      }

      return results;
    } catch (e) {
      console.error('Error analyzing rollback patterns:', e);
      return [];
    }
  }

  extractKeywords(text) {
    // Extract meaningful keywords from rollback reasons
    const stopwords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for']);

    const words = text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length >= 4 && !stopwords.has(w));

    return words;
  }

  /**
   * Get historical success rate for similar changes
   */
  predictOutcome(change, projectName) {
    const similar = this.findSimilarChanges(change, projectName, 20);

    if (similar.length === 0) {
      return {
        confidence: 'low',
        successRate: 0.88, // Default assumption
        sampleSize: 0
      };
    }

    const kept = similar.filter(s => s.outcome === 'kept').length;
    const successRate = kept / similar.length;

    return {
      confidence: similar.length > 10 ? 'high' : similar.length > 5 ? 'medium' : 'low',
      successRate,
      sampleSize: similar.length,
      topMatches: similar.slice(0, 3).map(s => ({
        similarity: (s.similarity * 100).toFixed(0) + '%',
        outcome: s.outcome,
        file: s.filepath,
        date: s.timestamp,
        reason: s.rollback_reason
      }))
    };
  }
}

// Export factory
export function createPatternMatcher(projectDatabases) {
  return new PatternMatcher(projectDatabases);
}
