/**
 * RiskAnalyzer - Predicts which changes are likely to be problematic
 *
 * Analyzes:
 * - Historical rollback patterns
 * - File criticality
 * - Change characteristics
 * - Recent incidents
 */

import { basename, extname } from 'path';

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
      console.error('Error analyzing rollback history:', e);
    }
    return null;
  }

  analyzeFileCriticality(filepath) {
    // Check cache first
    const cached = this.criticalityCache.get(filepath);
    if (cached) return cached;

    const filename = basename(filepath).toLowerCase();
    const ext = extname(filepath).toLowerCase();

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
        SELECT AVG(LENGTH(diff)) as avg_diff_size
        FROM events
        WHERE filepath = ?
        AND diff IS NOT NULL
        AND timestamp > datetime('now', '-30 days')
      `).get(change.filepath);

      const avgDiffSize = avgSize?.avg_diff_size || 1000;
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
      console.error('Error analyzing change size:', e);
    }
    return null;
  }

  analyzeRecentRollbacks(db, filepath) {
    try {
      const recentRollback = db.db.prepare(`
        SELECT e.id, r.timestamp, r.reason
        FROM events e
        JOIN rollbacks r ON e.id = r.event_id
        WHERE e.filepath = ?
        ORDER BY r.timestamp DESC
        LIMIT 1
      `).get(filepath);

      if (!recentRollback) return null;

      const rollbackDate = new Date(recentRollback.timestamp);
      const daysSince = (Date.now() - rollbackDate.getTime()) / (1000 * 60 * 60 * 24);

      if (daysSince < 7) {
        return {
          type: 'recent_rollback',
          severity: Math.max(0.7 - (daysSince / 14), 0.3),
          message: `Last rollback was ${Math.floor(daysSince)} days ago: "${recentRollback.reason || 'No reason given'}"`,
          data: { daysSince, reason: recentRollback.reason }
        };
      }
    } catch (e) {
      console.error('Error analyzing recent rollbacks:', e);
    }
    return null;
  }

  analyzeChangePattern(db, change) {
    try {
      // Get typical change types for this file
      const patterns = db.db.prepare(`
        SELECT change_type, COUNT(*) as count
        FROM events
        WHERE filepath = ?
        AND timestamp > datetime('now', '-90 days')
        GROUP BY change_type
        ORDER BY count DESC
      `).all(change.filepath);

      if (patterns.length === 0) return null;

      const dominant = patterns[0];
      const total = patterns.reduce((sum, p) => sum + p.count, 0);
      const dominantRate = dominant.count / total;

      // If this change type is unusual for this file (dominant pattern is different)
      if (dominantRate > 0.7 && dominant.change_type !== change.change_type) {
        return {
          type: 'unusual_change_type',
          severity: 0.6,
          message: `You typically ${dominant.change_type} this file (${(dominantRate * 100).toFixed(0)}% of the time), not ${change.change_type}`,
          data: { dominant: dominant.change_type, current: change.change_type, dominantRate }
        };
      }
    } catch (e) {
      console.error('Error analyzing change pattern:', e);
    }
    return null;
  }

  calculateRiskScore(riskFactors) {
    if (riskFactors.length === 0) return 0.1; // Low baseline risk

    // Weighted average of risk factors
    const totalSeverity = riskFactors.reduce((sum, f) => sum + f.severity, 0);
    const avgSeverity = totalSeverity / riskFactors.length;

    // Adjust based on number of factors (more factors = higher confidence in risk)
    const factorBonus = Math.min(riskFactors.length * 0.05, 0.15);

    return Math.min(avgSeverity + factorBonus, 1.0);
  }

  getRiskLevel(score) {
    if (score > 0.7) return 'high';
    if (score > 0.4) return 'medium';
    return 'low';
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

    return recommendations;
  }

  getRecentRollbacks(db, filepath, limit = 5) {
    try {
      return db.db.prepare(`
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
    } catch (e) {
      console.error('Error getting recent rollbacks:', e);
      return [];
    }
  }

  getOverallRollbackRate(db, projectName) {
    try {
      const stats = db.db.prepare(`
        SELECT
          COUNT(DISTINCT e.id) as total_events,
          COUNT(DISTINCT r.id) as rollback_count
        FROM events e
        LEFT JOIN rollbacks r ON e.id = r.event_id
        WHERE e.timestamp > datetime('now', '-90 days')
      `).get();

      if (stats.total_events === 0) return 0.12; // Default 12% assumption

      return stats.rollback_count / stats.total_events;
    } catch (e) {
      console.error('Error calculating overall rollback rate:', e);
      return 0.12;
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

      console.log(`✅ Rollback tracked for event ${eventId}`);
      return true;
    } catch (e) {
      console.error('Error tracking rollback:', e);
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
