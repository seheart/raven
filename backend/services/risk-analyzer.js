/**
 * RiskAnalyzer - Predicts which changes are likely to be problematic
 *
 * Analyzes:
 * - Historical rollback patterns
 * - File criticality
 * - Change characteristics
 * - Recent incidents
 */

import { basename} from 'path';
import { logger } from '../utils/logger.js';

export class RiskAnalyzer {
  constructor(projectDatabases) {
    this.projectDatabases = projectDatabases;
    this.criticalityCache = new Map();
  }

  /**
   * Analyze risk for a specific change
   * @param {Object} change - The file change event
   * @param {string} projectName - The project name
   * @returns {Object} Risk analysis result
   */
  analyzeRisk(change, projectName) {
    const db = this.projectDatabases.get(projectName);
    if (!db) {
      return { riskScore: 0, riskLevel: 'unknown', error: 'Project database not found' };
    }

    const riskFactors = [];

    // Factor 1: File-specific rollback rate
    const rollbackFactor = this.analyzeRollbackHistory(db, change.filepath);
    if (rollbackFactor) riskFactors.push(rollbackFactor);

    // Factor 2: File criticality
    const criticalityFactor = this.analyzeFileCriticality(change.filepath);
    if (criticalityFactor) riskFactors.push(criticalityFactor);

    // Factor 3: Change size
    const sizeFactor = this.analyzeChangeSize(db, change);
    if (sizeFactor) riskFactors.push(sizeFactor);

    // Factor 4: Recent rollbacks
    const recentFactor = this.analyzeRecentRollbacks(db, change.filepath);
    if (recentFactor) riskFactors.push(recentFactor);

    // Factor 5: Change type pattern
    const patternFactor = this.analyzeChangePattern(db, change);
    if (patternFactor) riskFactors.push(patternFactor);

    // Calculate overall risk score
    const riskScore = this.calculateRiskScore(riskFactors);

    // Get recent rollback incidents for context
    const recentRollbacks = this.getRecentRollbacks(db, change.filepath, 5);

    return {
      riskScore: Math.round(riskScore * 100),
      riskLevel: this.getRiskLevel(riskScore),
      riskFactors: riskFactors.map(f => ({
        factor: f.type,
        severity: f.severity,
        message: f.message
      })),
      recentRollbacks,
      recommendation: this.generateRecommendation(riskScore, riskFactors),
      overallRollbackRate: this.getOverallRollbackRate(db, projectName)
    };
  }

  analyzeRollbackHistory(db, filepath) {
    try {
      // Get all changes to this file in the last 90 days
      const history = db.db.prepare(`
        SELECT e.id, r.id as rollback_id, r.reason, r.timestamp as rollback_time
        FROM events e
        LEFT JOIN rollbacks r ON e.id = r.event_id
        WHERE e.filepath = ?
        AND e.timestamp > datetime('now', '-90 days')
        ORDER BY e.timestamp DESC
      `).all(filepath);

      if (history.length === 0) {
        return null; // No history, can't assess
      }

      const totalChanges = history.length;
      const rollbacks = history.filter(h => h.rollback_id !== null);
      const rollbackRate = rollbacks.length / totalChanges;

      // Get overall project rollback rate for comparison
      const overallRate = this.getOverallRollbackRate(db);

      // High risk if this file's rollback rate is significantly higher than average
      if (rollbackRate > overallRate * 2) {
        return {
          type: 'high_rollback_rate',
          severity: Math.min(rollbackRate * 1.5, 0.9),
          message: `This file has ${(rollbackRate * 100).toFixed(0)}% rollback rate (overall: ${(overallRate * 100).toFixed(0)}%)`,
          data: { rollbackRate, overallRate, totalChanges, rollbacks: rollbacks.length }
        };
      }
    } catch (e) {
      logger.error('Error analyzing rollback history', { error: e, filepath });
    }
    return null;
  }

  analyzeFileCriticality(filepath) {
    // Handle undefined/null filepath
    if (!filepath) return null;

    // Check cache first
    const cached = this.criticalityCache.get(filepath);
    if (cached) return cached;

    const filename = basename(filepath).toLowerCase();
    // const ext = extname(filepath).toLowerCase();

    // Critical patterns (security, auth, payments, database)
    const criticalPatterns = [
      { pattern: /auth|login|session|jwt|token|oauth/i, score: 0.9, category: 'Authentication' },
      { pattern: /payment|billing|stripe|charge|invoice|checkout/i, score: 0.95, category: 'Payments' },
      { pattern: /database|sql|query|migration|schema/i, score: 0.85, category: 'Database' },
      { pattern: /security|crypto|encrypt|decrypt|password|hash/i, score: 0.9, category: 'Security' },
      { pattern: /config|env|secret|key|credential/i, score: 0.8, category: 'Configuration' },
      { pattern: /api|endpoint|route|controller/i, score: 0.75, category: 'API' },
      { pattern: /middleware|guard|interceptor/i, score: 0.75, category: 'Middleware' }
    ];

    for (const { pattern, score, category } of criticalPatterns) {
      if (pattern.test(filepath)) {
        const result = {
          type: 'critical_file',
          severity: score,
          message: `This is a critical ${category} file`,
          data: { category, criticality: score }
        };
        this.criticalityCache.set(filepath, result);
        return result;
      }
    }

    // Core infrastructure files
    if (filename.match(/^(server|app|main|index)\.(js|ts|py)$/)) {
      const result = {
        type: 'critical_file',
        severity: 0.8,
        message: 'This is a core application file',
        data: { category: 'Core', criticality: 0.8 }
      };
      this.criticalityCache.set(filepath, result);
      return result;
    }

    return null;
  }

  analyzeChangeSize(db, change) {
    try {
      if (!change.diff) return null;

      const lines = change.diff.split('\n');
      const additions = lines.filter(l => l.startsWith('+')).length;
      const deletions = lines.filter(l => l.startsWith('-')).length;
      const total = additions + deletions;

      // Get average change size for this file
      const avgSize = db.db.prepare(`
        SELECT AVG(LENGTH(diff)) as avg_size
        FROM events
        WHERE filepath = ?
        AND diff IS NOT NULL
        AND timestamp > datetime('now', '-30 days')
      `).get(change.filepath);

      const avgDiffSize = avgSize?.avg_size || 1000;
      const currentSize = change.diff.length;

      // Large change if >3x average
      if (currentSize > avgDiffSize * 3) {
        return {
          type: 'large_change',
          severity: Math.min(currentSize / avgDiffSize / 10, 0.7),
          message: `Change is ${(currentSize / avgDiffSize).toFixed(1)}x larger than typical (${total} lines)`,
          data: { currentSize, avgDiffSize, linesChanged: total }
        };
      }

      // Excessive deletions
      if (deletions > 100) {
        return {
          type: 'excessive_deletions',
          severity: Math.min(deletions / 200, 0.8),
          message: `Large number of deletions (${deletions} lines)`,
          data: { deletions, additions, total }
        };
      }
    } catch (e) {
      logger.error('Error analyzing change size', { error: e, filepath: change.filepath });
    }
    return null;
  }

  analyzeRecentRollbacks(db, filepath) {
    try {
      const stats = db.db.prepare(`
        SELECT
          COUNT(CASE WHEN r.id IS NOT NULL THEN 1 END) as recent_rollbacks,
          COUNT(*) as recent_changes
        FROM events e
        LEFT JOIN rollbacks r ON e.id = r.event_id
        WHERE e.filepath = ?
        AND e.timestamp > datetime('now', '-14 days')
      `).get(filepath);

      if (!stats || stats.recent_changes === 0) return null;

      const rollbackRate = stats.recent_rollbacks / stats.recent_changes;

      // High risk if >30% of recent changes were rolled back
      if (rollbackRate > 0.3) {
        return {
          type: 'recent_rollbacks',
          severity: Math.min(rollbackRate * 1.5, 0.9),
          message: `${stats.recent_rollbacks} of ${stats.recent_changes} recent changes were rolled back (${(rollbackRate * 100).toFixed(0)}%)`,
          data: { recentRollbacks: stats.recent_rollbacks, recentChanges: stats.recent_changes, rollbackRate }
        };
      }
    } catch (e) {
      logger.error('Error analyzing recent rollbacks', { error: e, filepath });
    }
    return null;
  }

  analyzeChangePattern(db, change) {
    try {
      // Get rollback statistics for this change type
      const stats = db.db.prepare(`
        SELECT
          COUNT(*) as total_changes,
          COUNT(CASE WHEN r.id IS NOT NULL THEN 1 END) as rollbacks
        FROM events e
        LEFT JOIN rollbacks r ON e.id = r.event_id
        WHERE e.change_type = ?
        AND e.timestamp > datetime('now', '-90 days')
      `).get(change.change_type);

      if (!stats || stats.total_changes === 0) return null;

      const rollbackRate = stats.rollbacks / stats.total_changes;

      // High risk if >40% of this change type gets rolled back
      if (rollbackRate > 0.4) {
        return {
          type: 'risky_change_pattern',
          severity: Math.min(rollbackRate * 1.2, 0.9),
          message: `${change.change_type} changes have a ${(rollbackRate * 100).toFixed(0)}% rollback rate`,
          data: { changeType: change.change_type, totalChanges: stats.total_changes, rollbacks: stats.rollbacks, rollbackRate }
        };
      }
    } catch (e) {
      logger.error('Error analyzing change pattern', { error: e, filepath: change.filepath });
    }
    return null;
  }

  calculateRiskScore(riskFactors) {
    if (riskFactors.length === 0) return 0; // No risk factors = no risk

    // Weighted average of risk factors
    const totalSeverity = riskFactors.reduce((sum, f) => sum + f.severity, 0);
    const avgSeverity = totalSeverity / riskFactors.length;

    // Adjust based on number of factors (more factors = higher confidence in risk)
    const factorBonus = Math.min(riskFactors.length * 0.05, 0.15);

    return Math.min(avgSeverity + factorBonus, 1.0);
  }

  getRiskLevel(score) {
    if (score > 0.8) return 'critical';
    if (score > 0.6) return 'high';
    if (score > 0.4) return 'medium';
    if (score > 0.2) return 'low';
    return 'minimal';
  }

  generateRecommendation(score, riskFactors) {
    const recommendations = [];

    if (score > 0.7) {
      recommendations.push('Set a checkpoint before proceeding');
      recommendations.push('Review the change carefully');
    }

    // Specific recommendations based on risk factors
    for (const factor of riskFactors) {
      if (factor.type === 'high_rollback_rate') {
        recommendations.push('Review past rollback reasons carefully');
      } else if (factor.type === 'critical_file') {
        recommendations.push('Extra caution - this is a critical system file');
      } else if (factor.type === 'excessive_deletions') {
        recommendations.push('Verify that deletions are intentional');
      } else if (factor.type === 'recent_rollback') {
        recommendations.push('Consider why the last change was rolled back');
      }
    }

    if (score > 0.5) {
      recommendations.push('Test thoroughly before committing');
    }

    if (recommendations.length === 0) {
      recommendations.push('Change looks safe based on historical patterns');
    }

    return recommendations.join('. ') + '.';
  }

  getRecentRollbacks(db, filepath, limit = 5) {
    try {
      const results = db.db.prepare(`
        SELECT
          e.id,
          e.timestamp as change_timestamp,
          e.change_type,
          r.timestamp as rollback_timestamp,
          r.reason,
          r.automatic
        FROM events e
        JOIN rollbacks r ON e.id = r.event_id
        WHERE e.filepath = ?
        ORDER BY r.timestamp DESC
        LIMIT ?
      `).all(filepath, limit);

      // Ensure limit is respected (defensive coding for mocked databases)
      return results.slice(0, limit);
    } catch (e) {
      logger.error('Error getting recent rollbacks', { error: e, filepath });
      return [];
    }
  }

  getOverallRollbackRate(db, projectName) {
    try {
      const stats = db.db.prepare(`
        SELECT
          (CAST(COUNT(DISTINCT r.id) AS FLOAT) / NULLIF(COUNT(DISTINCT e.id), 0)) as rate
        FROM events e
        LEFT JOIN rollbacks r ON e.id = r.event_id
        WHERE e.timestamp > datetime('now', '-90 days')
      `).get();

      if (!stats || stats.rate === null || stats.rate === undefined) {
        return 0;
      }

      return stats.rate;
    } catch (e) {
      logger.error('Error calculating overall rollback rate', { error: e });
      return 0;
    }
  }

  /**
   * Track a rollback action
   */
  trackRollback(db, eventId, reason, automatic = false) {
    try {
      db.db.prepare(`
        INSERT INTO rollbacks (event_id, timestamp, reason, automatic)
        VALUES (?, datetime('now'), ?, ?)
      `).run(eventId, reason, automatic ? 1 : 0);

      logger.info('Rollback tracked', { eventId, automatic });
      return true;
    } catch (e) {
      logger.error('Error tracking rollback', { error: e, eventId });
      return false;
    }
  }

  /**
   * Clear the criticality cache (call periodically)
   */
  clearCache() {
    this.criticalityCache.clear();
  }
}

// Export singleton factory
export function createRiskAnalyzer(projectDatabases) {
  return new RiskAnalyzer(projectDatabases);
}
