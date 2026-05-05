/**
 * SessionTracker - Tracks coding sessions and detects fatigue/quality degradation
 *
 * Monitors:
 * - Session duration and breaks
 * - Code quality trends within sessions
 * - Fatigue indicators (increasing rollbacks, larger changes, etc.)
 * - Peak productivity hours
 *
 * NOTE: this module is currently unwired in server.ts — only its own test
 * file imports it. Kept as a parked feature; remove if the experiment is
 * abandoned.
 */

import type { RavenDB } from '../db.js';
import { logger } from '../utils/logger.js';

interface SessionChange {
  timestamp: number;
  changeType: string | undefined;
  diffSize: number;
  filepath: string | undefined;
  agent: string | undefined;
  riskScore: number;
}

interface ActiveSession {
  id: number | bigint | null;
  projectName: string;
  startTime: number;
  lastActivity: number;
  changesCount: number;
  rollbacksCount: number;
  breaksMinutes: number;
  qualityScore: number;
  recentChanges: SessionChange[];
  hourlyStats: Map<number, number>;
}

interface RecordActivityEvent {
  change_type?: string;
  diff?: string;
  filepath?: string;
  agent?: string;
  risk_score?: number;
}

interface QualityFactor {
  type: 'high_rollback_rate' | 'long_session' | 'increasing_change_size' | 'high_risk_changes';
  severity: number;
  message: string;
}

interface QualityRecommendation {
  level: 'critical' | 'warning';
  message: string;
  actions: string[];
}

interface SessionQuality {
  score: number;
  factors: QualityFactor[];
  recommendation: QualityRecommendation | null;
  sessionDuration?: number;
  rollbackRate?: number;
}

interface SessionRow {
  id: number;
  start_time: string;
  end_time: string | null;
  changes_count: number;
  rollbacks_count: number;
  break_minutes: number;
  quality_score: number;
  duration_hours: number;
}

interface SessionStats {
  totalSessions: number;
  avgDuration: string | number;
  avgQuality: number;
  avgRollbackRate: string | number;
  peakHours: Array<{ hour: number; sessions: number; avgChanges: number }>;
  recentSessions?: SessionRow[];
}

export class SessionTracker {
  private projectDatabases: Map<string, RavenDB>;
  private activeSessions: Map<string, ActiveSession>;
  private sessionTimeout: number;

  constructor(projectDatabases: Map<string, RavenDB>) {
    this.projectDatabases = projectDatabases;
    this.activeSessions = new Map();
    this.sessionTimeout = 30 * 60 * 1000;
  }

  recordActivity(projectName: string, eventData: RecordActivityEvent): ActiveSession {
    const now = Date.now();
    let session = this.activeSessions.get(projectName);

    if (session && now - session.lastActivity > this.sessionTimeout) {
      this.endSession(projectName);
      session = undefined;
    }

    if (!session) {
      session = this.startSession(projectName);
    }

    session.changesCount++;
    session.lastActivity = now;

    session.recentChanges.push({
      timestamp: now,
      changeType: eventData.change_type,
      diffSize: eventData.diff?.length || 0,
      filepath: eventData.filepath,
      agent: eventData.agent,
      riskScore: eventData.risk_score || 0
    });

    if (session.recentChanges.length > 20) {
      session.recentChanges.shift();
    }

    if (session.changesCount % 10 === 0) {
      this.updateSessionInDB(projectName, session);
    }

    this.activeSessions.set(projectName, session);
    return session;
  }

  startSession(projectName: string): ActiveSession {
    const now = Date.now();
    const session: ActiveSession = {
      id: null,
      projectName,
      startTime: now,
      lastActivity: now,
      changesCount: 0,
      rollbacksCount: 0,
      breaksMinutes: 0,
      qualityScore: 100,
      recentChanges: [],
      hourlyStats: new Map()
    };

    const db = this.projectDatabases.get(projectName);
    if (db) {
      try {
        const result = db.db
          .prepare(
            `INSERT INTO sessions (project_name, start_time, changes_count, rollbacks_count, break_minutes, quality_score)
             VALUES (?, datetime('now'), 0, 0, 0, 100.0)`
          )
          .run(projectName);

        session.id = result.lastInsertRowid;
        logger.info('Started session', { sessionId: session.id, projectName });
      } catch (e) {
        logger.error('Error starting session', {
          error: e instanceof Error ? e.message : String(e),
          projectName
        });
      }
    }

    return session;
  }

  endSession(projectName: string): void {
    const session = this.activeSessions.get(projectName);
    if (!session) return;

    const db = this.projectDatabases.get(projectName);
    if (db && session.id) {
      try {
        db.db
          .prepare(
            `UPDATE sessions SET
               end_time = datetime('now'),
               changes_count = ?,
               rollbacks_count = ?,
               quality_score = ?
             WHERE id = ?`
          )
          .run(session.changesCount, session.rollbacksCount, session.qualityScore, session.id);

        logger.info('Ended session', {
          sessionId: session.id,
          projectName,
          changesCount: session.changesCount,
          qualityScore: session.qualityScore.toFixed(0)
        });
      } catch (e) {
        logger.error('Error ending session', {
          error: e instanceof Error ? e.message : String(e),
          projectName
        });
      }
    }

    this.activeSessions.delete(projectName);
  }

  updateSessionInDB(projectName: string, session: ActiveSession): void {
    if (!session.id) return;

    const db = this.projectDatabases.get(projectName);
    if (!db) return;

    try {
      db.db
        .prepare(
          `UPDATE sessions SET
             changes_count = ?,
             rollbacks_count = ?,
             quality_score = ?
           WHERE id = ?`
        )
        .run(session.changesCount, session.rollbacksCount, session.qualityScore, session.id);
    } catch (e) {
      logger.error('Error updating session', {
        error: e instanceof Error ? e.message : String(e),
        projectName,
        sessionId: session.id
      });
    }
  }

  trackRollback(projectName: string): void {
    const session = this.activeSessions.get(projectName);
    if (session) {
      session.rollbacksCount++;
      session.qualityScore = Math.max(0, session.qualityScore - 5);
      this.updateSessionInDB(projectName, session);
    }
  }

  getActiveSession(projectName: string): ActiveSession | null {
    return this.activeSessions.get(projectName) || null;
  }

  calculateSessionQuality(projectName: string): SessionQuality {
    const session = this.activeSessions.get(projectName);
    if (!session || session.recentChanges.length < 5) {
      return {
        score: 100,
        factors: [],
        recommendation: null
      };
    }

    const factors: QualityFactor[] = [];
    let qualityScore = 100;

    const rollbackRate =
      session.changesCount > 0 ? session.rollbacksCount / session.changesCount : 0;

    if (rollbackRate > 0.15) {
      const penalty = Math.min((rollbackRate - 0.15) * 100, 30);
      qualityScore -= penalty;
      factors.push({
        type: 'high_rollback_rate',
        severity: rollbackRate,
        message: `High rollback rate: ${(rollbackRate * 100).toFixed(0)}% (normal: <15%)`
      });
    }

    const durationHours = (Date.now() - session.startTime) / (1000 * 60 * 60);

    if (durationHours > 4) {
      const penalty = Math.min((durationHours - 4) * 5, 25);
      qualityScore -= penalty;
      factors.push({
        type: 'long_session',
        severity: durationHours / 6,
        message: `Long session: ${durationHours.toFixed(1)} hours (recommend breaks after 2-3 hours)`
      });
    }

    const recent5 = session.recentChanges.slice(-5);
    const older5 = session.recentChanges.slice(-10, -5);

    if (recent5.length === 5 && older5.length === 5) {
      const avgRecentSize = recent5.reduce((sum, c) => sum + c.diffSize, 0) / 5;
      const avgOlderSize = older5.reduce((sum, c) => sum + c.diffSize, 0) / 5;

      if (avgRecentSize > avgOlderSize * 1.5) {
        const penalty = 15;
        qualityScore -= penalty;
        factors.push({
          type: 'increasing_change_size',
          severity: avgRecentSize / avgOlderSize / 2,
          message: `Change sizes increasing: ${avgRecentSize.toFixed(0)} bytes (was ${avgOlderSize.toFixed(0)} bytes)`
        });
      }
    }

    const recentHighRisk = recent5.filter(c => c.riskScore > 70).length;
    if (recentHighRisk >= 2) {
      const penalty = 10;
      qualityScore -= penalty;
      factors.push({
        type: 'high_risk_changes',
        severity: recentHighRisk / 5,
        message: `Recent high-risk changes: ${recentHighRisk} in last 5 changes`
      });
    }

    let recommendation: QualityRecommendation | null = null;
    if (qualityScore < 50) {
      recommendation = {
        level: 'critical',
        message: 'Take a break now! Quality indicators suggest fatigue.',
        actions: [
          'Take a 15-minute break',
          'Set a checkpoint for safe rollback',
          'Review recent changes'
        ]
      };
    } else if (qualityScore < 70) {
      recommendation = {
        level: 'warning',
        message: 'Consider taking a short break soon.',
        actions: ['Take a 5-10 minute break', 'Verify recent changes', 'Save checkpoint']
      };
    }

    session.qualityScore = qualityScore;

    return {
      score: Math.round(qualityScore),
      factors,
      recommendation,
      sessionDuration: durationHours,
      rollbackRate
    };
  }

  getSessionStats(projectName: string, days = 30): SessionStats | null {
    const db = this.projectDatabases.get(projectName);
    if (!db) return null;

    try {
      const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

      const sessions = db.db
        .prepare<unknown[], SessionRow>(
          `SELECT
            id,
            start_time,
            end_time,
            changes_count,
            rollbacks_count,
            break_minutes,
            quality_score,
            (JULIANDAY(COALESCE(end_time, datetime('now'))) - JULIANDAY(start_time)) * 24 as duration_hours
           FROM sessions
           WHERE project_name = ?
           AND start_time >= ?
           ORDER BY start_time DESC`
        )
        .all(projectName, cutoffDate);

      if (sessions.length === 0) {
        return {
          totalSessions: 0,
          avgDuration: 0,
          avgQuality: 100,
          avgRollbackRate: 0,
          peakHours: []
        };
      }

      const avgDuration = sessions.reduce((sum, s) => sum + s.duration_hours, 0) / sessions.length;
      const avgQuality = sessions.reduce((sum, s) => sum + s.quality_score, 0) / sessions.length;
      const avgRollbackRate =
        sessions.reduce((sum, s) => {
          return sum + (s.changes_count > 0 ? s.rollbacks_count / s.changes_count : 0);
        }, 0) / sessions.length;

      const hourlyActivity = new Map<number, { count: number; totalChanges: number }>();
      for (const session of sessions) {
        const hour = new Date(session.start_time).getHours();
        const current = hourlyActivity.get(hour) || { count: 0, totalChanges: 0 };
        current.count++;
        current.totalChanges += session.changes_count;
        hourlyActivity.set(hour, current);
      }

      const peakHours = Array.from(hourlyActivity.entries())
        .map(([hour, data]) => ({
          hour,
          sessions: data.count,
          avgChanges: data.totalChanges / data.count
        }))
        .sort((a, b) => b.avgChanges - a.avgChanges)
        .slice(0, 3);

      return {
        totalSessions: sessions.length,
        avgDuration: avgDuration.toFixed(1),
        avgQuality: Math.round(avgQuality),
        avgRollbackRate: (avgRollbackRate * 100).toFixed(1) + '%',
        peakHours,
        recentSessions: sessions.slice(0, 10)
      };
    } catch (e) {
      logger.error('Error getting session stats', {
        error: e instanceof Error ? e.message : String(e),
        projectName
      });
      return null;
    }
  }

  endAllSessions(): void {
    for (const projectName of this.activeSessions.keys()) {
      this.endSession(projectName);
    }
  }
}

export function createSessionTracker(projectDatabases: Map<string, RavenDB>): SessionTracker {
  return new SessionTracker(projectDatabases);
}
