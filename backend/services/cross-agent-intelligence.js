/**
 * Cross-Agent Intelligence Service
 *
 * Analyzes interactions, coordination, and conflicts between multiple AI agents.
 * Detects collaboration patterns, handoffs, and potential conflicts.
 */

import { logger } from '../utils/logger.js';

export class CrossAgentIntelligence {
  constructor(ravenDb) {
    this.db = ravenDb;
    this.projectName = ravenDb.projectName || 'raven';
  }

  /**
   * Get all active agents in the last N hours
   */
  getActiveAgents(hours = 24) {
    try {
      const stmt = this.db.prepareStatement(`
        SELECT
          agent,
          COUNT(*) as activity_count,
          MIN(timestamp) as first_activity,
          MAX(timestamp) as last_activity
        FROM events
        WHERE project_name = ?
          AND agent IS NOT NULL
          AND timestamp >= datetime('now', '-' || ? || ' hours')
        GROUP BY agent
        ORDER BY activity_count DESC
      `);

      return stmt.all(this.projectName, hours);
    } catch (error) {
      logger.error('Failed to get active agents', {
        service: 'cross-agent-intelligence',
        error: error.message
      });
      return [];
    }
  }

  /**
   * Detect agent handoffs (when one agent stops working on a file and another starts)
   */
  detectAgentHandoffs(hours = 24) {
    try {
      const stmt = this.db.prepareStatement(`
        SELECT
          e1.filepath,
          e1.agent as from_agent,
          e2.agent as to_agent,
          e1.timestamp as last_activity_from,
          e2.timestamp as first_activity_to,
          CAST((julianday(e2.timestamp) - julianday(e1.timestamp)) * 24 * 60 AS INTEGER) as gap_minutes
        FROM events e1
        JOIN events e2 ON e1.filepath = e2.filepath
        WHERE e1.project_name = ?
          AND e1.agent != e2.agent
          AND e1.agent IS NOT NULL
          AND e2.agent IS NOT NULL
          AND e1.timestamp >= datetime('now', '-' || ? || ' hours')
          AND e2.timestamp > e1.timestamp
          AND CAST((julianday(e2.timestamp) - julianday(e1.timestamp)) * 24 * 60 AS INTEGER) <= 60
        ORDER BY e2.timestamp DESC
        LIMIT 20
      `);

      const handoffs = stmt.all(this.projectName, hours);

      return handoffs.map(h => ({
        ...h,
        handoff_type: h.gap_minutes < 5 ? 'immediate' : h.gap_minutes < 15 ? 'quick' : 'delayed'
      }));
    } catch (error) {
      logger.error('Failed to detect agent handoffs', {
        service: 'cross-agent-intelligence',
        error: error.message
      });
      return [];
    }
  }

  /**
   * Detect file conflicts (multiple agents working on same file simultaneously)
   */
  detectFileConflicts(hours = 24) {
    try {
      const stmt = this.db.prepareStatement(`
        SELECT
          filepath,
          GROUP_CONCAT(DISTINCT agent) as agents,
          COUNT(DISTINCT agent) as agent_count,
          COUNT(*) as total_changes,
          MIN(timestamp) as first_change,
          MAX(timestamp) as last_change
        FROM events
        WHERE project_name = ?
          AND agent IS NOT NULL
          AND timestamp >= datetime('now', '-' || ? || ' hours')
        GROUP BY filepath
        HAVING agent_count > 1
        ORDER BY total_changes DESC
        LIMIT 20
      `);

      const conflicts = stmt.all(this.projectName, hours);

      return conflicts.map(c => ({
        ...c,
        agents: c.agents.split(','),
        conflict_severity: c.agent_count > 3 ? 'high' : c.agent_count === 3 ? 'medium' : 'low'
      }));
    } catch (error) {
      logger.error('Failed to detect file conflicts', {
        service: 'cross-agent-intelligence',
        error: error.message
      });
      return [];
    }
  }

  /**
   * Analyze agent collaboration patterns
   */
  getCollaborationPatterns(days = 7) {
    try {
      const stmt = this.db.prepareStatement(`
        SELECT
          e1.agent as agent_1,
          e2.agent as agent_2,
          COUNT(DISTINCT e1.filepath) as shared_files,
          COUNT(*) as total_interactions
        FROM events e1
        JOIN events e2 ON e1.filepath = e2.filepath
        WHERE e1.project_name = ?
          AND e1.agent != e2.agent
          AND e1.agent IS NOT NULL
          AND e2.agent IS NOT NULL
          AND e1.timestamp >= datetime('now', '-' || ? || ' days')
        GROUP BY e1.agent, e2.agent
        HAVING shared_files >= 2
        ORDER BY total_interactions DESC
        LIMIT 20
      `);

      return stmt.all(this.projectName, days);
    } catch (error) {
      logger.error('Failed to get collaboration patterns', {
        service: 'cross-agent-intelligence',
        error: error.message
      });
      return [];
    }
  }

  /**
   * Get agent interaction timeline
   */
  getInteractionTimeline(hours = 24) {
    try {
      const stmt = this.db.prepareStatement(`
        SELECT
          timestamp,
          agent,
          filepath,
          event_type,
          change_type,
          lines_added,
          lines_deleted
        FROM events
        WHERE project_name = ?
          AND agent IS NOT NULL
          AND timestamp >= datetime('now', '-' || ? || ' hours')
        ORDER BY timestamp ASC
      `);

      return stmt.all(this.projectName, hours);
    } catch (error) {
      logger.error('Failed to get interaction timeline', {
        service: 'cross-agent-intelligence',
        error: error.message
      });
      return [];
    }
  }

  /**
   * Analyze agent specialization (which agents work on which types of files)
   */
  getAgentSpecialization(days = 30) {
    try {
      const stmt = this.db.prepareStatement(`
        SELECT
          agent,
          CASE
            WHEN filepath LIKE '%.js' THEN 'JavaScript'
            WHEN filepath LIKE '%.ts' THEN 'TypeScript'
            WHEN filepath LIKE '%.py' THEN 'Python'
            WHEN filepath LIKE '%.svelte' THEN 'Svelte'
            WHEN filepath LIKE '%.jsx' OR filepath LIKE '%.tsx' THEN 'React'
            WHEN filepath LIKE '%.css' OR filepath LIKE '%.scss' THEN 'Styles'
            WHEN filepath LIKE '%.json' THEN 'Config'
            WHEN filepath LIKE '%.md' THEN 'Documentation'
            ELSE 'Other'
          END as file_type,
          COUNT(*) as change_count
        FROM events
        WHERE project_name = ?
          AND agent IS NOT NULL
          AND timestamp >= datetime('now', '-' || ? || ' days')
        GROUP BY agent, file_type
        ORDER BY agent, change_count DESC
      `);

      const specializations = stmt.all(this.projectName, days);

      // Group by agent
      const grouped = {};
      for (const spec of specializations) {
        if (!grouped[spec.agent]) {
          grouped[spec.agent] = [];
        }
        grouped[spec.agent].push({
          file_type: spec.file_type,
          change_count: spec.change_count
        });
      }

      return Object.entries(grouped).map(([agent, types]) => ({
        agent,
        specializations: types,
        primary_type: types[0]?.file_type || 'Unknown'
      }));
    } catch (error) {
      logger.error('Failed to get agent specialization', {
        service: 'cross-agent-intelligence',
        error: error.message
      });
      return [];
    }
  }

  /**
   * Get agent productivity comparison
   */
  getAgentProductivityComparison(days = 7) {
    try {
      const stmt = this.db.prepareStatement(`
        SELECT
          agent,
          COUNT(*) as total_changes,
          COUNT(DISTINCT filepath) as files_modified,
          SUM(lines_added) as total_lines_added,
          SUM(lines_deleted) as total_lines_deleted,
          AVG(CASE WHEN confidence_score IS NOT NULL THEN confidence_score ELSE 0 END) as avg_confidence
        FROM events
        WHERE project_name = ?
          AND agent IS NOT NULL
          AND timestamp >= datetime('now', '-' || ? || ' days')
        GROUP BY agent
        ORDER BY total_changes DESC
      `);

      const stats = stmt.all(this.projectName, days);

      // Get rollback counts
      const rollbackStmt = this.db.prepareStatement(`
        SELECT
          agent,
          COUNT(*) as rollback_count
        FROM events
        WHERE project_name = ?
          AND agent IS NOT NULL
          AND event_type = 'rollback'
          AND timestamp >= datetime('now', '-' || ? || ' days')
        GROUP BY agent
      `);

      const rollbacks = rollbackStmt.all(this.projectName, days);
      const rollbackMap = Object.fromEntries(rollbacks.map(r => [r.agent, r.rollback_count]));

      return stats.map(s => ({
        ...s,
        rollback_count: rollbackMap[s.agent] || 0,
        rollback_rate:
          s.total_changes > 0 ? ((rollbackMap[s.agent] || 0) / s.total_changes) * 100 : 0
      }));
    } catch (error) {
      logger.error('Failed to get agent productivity comparison', {
        service: 'cross-agent-intelligence',
        error: error.message
      });
      return [];
    }
  }

  /**
   * Detect potential agent conflicts (agents undoing each other's work)
   */
  detectAgentConflicts(hours = 24) {
    try {
      // Look for patterns where agent A changes a file, then agent B changes it back
      const stmt = this.db.prepareStatement(`
        SELECT
          e1.agent as agent_1,
          e2.agent as agent_2,
          e1.filepath,
          e1.timestamp as first_change,
          e2.timestamp as second_change,
          e1.event_type as first_event,
          e2.event_type as second_event
        FROM events e1
        JOIN events e2 ON e1.filepath = e2.filepath
        WHERE e1.project_name = ?
          AND e1.agent != e2.agent
          AND e1.agent IS NOT NULL
          AND e2.agent IS NOT NULL
          AND e1.timestamp >= datetime('now', '-' || ? || ' hours')
          AND e2.timestamp > e1.timestamp
          AND CAST((julianday(e2.timestamp) - julianday(e1.timestamp)) * 24 AS INTEGER) <= 1
          AND (
            (e1.event_type = 'change' AND e2.event_type = 'rollback')
            OR (e1.change_type != e2.change_type)
          )
        ORDER BY e2.timestamp DESC
        LIMIT 20
      `);

      const conflicts = stmt.all(this.projectName, hours);

      return conflicts.map(c => ({
        ...c,
        conflict_type: c.second_event === 'rollback' ? 'rollback_conflict' : 'change_conflict',
        severity: c.second_event === 'rollback' ? 'high' : 'medium'
      }));
    } catch (error) {
      logger.error('Failed to detect agent conflicts', {
        service: 'cross-agent-intelligence',
        error: error.message
      });
      return [];
    }
  }

  /**
   * Get cross-agent intelligence summary
   */
  getSummary(hours = 24) {
    try {
      const activeAgents = this.getActiveAgents(hours);
      const handoffs = this.detectAgentHandoffs(hours);
      const fileConflicts = this.detectFileConflicts(hours);
      const agentConflicts = this.detectAgentConflicts(hours);

      return {
        active_agents_count: activeAgents.length,
        active_agents: activeAgents,
        handoffs_count: handoffs.length,
        recent_handoffs: handoffs.slice(0, 5),
        file_conflicts_count: fileConflicts.length,
        critical_files: fileConflicts.slice(0, 5),
        agent_conflicts_count: agentConflicts.length,
        recent_conflicts: agentConflicts.slice(0, 5),
        collaboration_health: this.calculateCollaborationHealth(
          activeAgents,
          handoffs,
          agentConflicts
        )
      };
    } catch (error) {
      logger.error('Failed to get cross-agent summary', {
        service: 'cross-agent-intelligence',
        error: error.message
      });
      return null;
    }
  }

  /**
   * Calculate collaboration health score (0-100)
   */
  calculateCollaborationHealth(activeAgents, handoffs, conflicts) {
    let score = 50; // Start at neutral

    // More active agents = better (up to a point)
    if (activeAgents.length >= 2 && activeAgents.length <= 5) {
      score += 20;
    } else if (activeAgents.length > 5) {
      score += 10; // Too many agents can cause confusion
    }

    // Smooth handoffs are good
    const smoothHandoffs = handoffs.filter(
      h => h.handoff_type === 'quick' || h.handoff_type === 'delayed'
    );
    if (smoothHandoffs.length > 0) {
      score += Math.min(15, smoothHandoffs.length * 3);
    }

    // Conflicts are bad
    if (conflicts.length > 0) {
      score -= Math.min(30, conflicts.length * 5);
    }

    // Ensure score is in valid range
    return Math.max(0, Math.min(100, score));
  }
}
