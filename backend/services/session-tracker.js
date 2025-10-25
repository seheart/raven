/**
 * SessionTracker - Tracks coding sessions and detects fatigue/quality degradation
 *
 * Monitors:
 * - Session duration and breaks
 * - Code quality trends within sessions
 * - Fatigue indicators (increasing rollbacks, larger changes, etc.)
 * - Peak productivity hours
 */

export class SessionTracker {
  constructor(projectDatabases) {
    this.projectDatabases = projectDatabases;
    this.activeSessions = new Map(); // projectName -> session object
    this.sessionTimeout = 30 * 60 * 1000; // 30 minutes of inactivity = session end
  }

  /**
   * Record a file change event (called on every file change)
   * Automatically starts/continues/ends sessions
   */
  recordActivity(projectName, eventData) {
    const now = Date.now();
    let session = this.activeSessions.get(projectName);

    // Check if we need to end previous session (30min inactivity)
    if (session && (now - session.lastActivity) > this.sessionTimeout) {
      this.endSession(projectName);
      session = null;
    }

    // Start new session if needed
    if (!session) {
      session = this.startSession(projectName);
    }

    // Update session metrics
    session.changesCount++;
    session.lastActivity = now;

    // Track change details for quality analysis
    session.recentChanges.push({
      timestamp: now,
      changeType: eventData.change_type,
      diffSize: eventData.diff?.length || 0,
      filepath: eventData.filepath,
      agent: eventData.agent,
      riskScore: eventData.risk_score || 0
    });

    // Keep only last 20 changes for quality analysis
    if (session.recentChanges.length > 20) {
      session.recentChanges.shift();
    }

    // Update session in database every 10 changes
    if (session.changesCount % 10 === 0) {
      this.updateSessionInDB(projectName, session);
    }

    this.activeSessions.set(projectName, session);
    return session;
  }

  /**
   * Start a new coding session
   */
  startSession(projectName) {
    const now = Date.now();
    const session = {
      id: null, // Will be set after DB insert
      projectName,
      startTime: now,
      lastActivity: now,
      changesCount: 0,
      rollbacksCount: 0,
      breaksMinutes: 0,
      qualityScore: 100, // Starts at 100
      recentChanges: [],
      hourlyStats: new Map() // hour -> change count
    };

    // Insert into database
    const db = this.projectDatabases.get(projectName);
    if (db) {
      try {
        const result = db.db.prepare(`
          INSERT INTO sessions (project_name, start_time, changes_count, rollbacks_count, break_minutes, quality_score)
          VALUES (?, datetime('now'), 0, 0, 0, 100.0)
        `).run(projectName);

        session.id = result.lastInsertRowid;
        console.log(`🟢 Started session ${session.id} for ${projectName}`);
      } catch (e) {
        console.error('Error starting session:', e);
      }
    }

    return session;
  }

  /**
   * End a coding session
   */
  endSession(projectName) {
    const session = this.activeSessions.get(projectName);
    if (!session) return;

    const db = this.projectDatabases.get(projectName);
    if (db && session.id) {
      try {
        db.db.prepare(`
          UPDATE sessions SET
            end_time = datetime('now'),
            changes_count = ?,
            rollbacks_count = ?,
            quality_score = ?
          WHERE id = ?
        `).run(
          session.changesCount,
          session.rollbacksCount,
          session.qualityScore,
          session.id
        );

        console.log(`🔴 Ended session ${session.id} for ${projectName} (${session.changesCount} changes, quality: ${session.qualityScore.toFixed(0)})`);
      } catch (e) {
        console.error('Error ending session:', e);
      }
    }

    this.activeSessions.delete(projectName);
  }

  /**
   * Update session in database
   */
  updateSessionInDB(projectName, session) {
    if (!session.id) return;

    const db = this.projectDatabases.get(projectName);
    if (!db) return;

    try {
      db.db.prepare(`
        UPDATE sessions SET
          changes_count = ?,
          rollbacks_count = ?,
          quality_score = ?
        WHERE id = ?
      `).run(
        session.changesCount,
        session.rollbacksCount,
        session.qualityScore,
        session.id
      );
    } catch (e) {
      console.error('Error updating session:', e);
    }
  }

  /**
   * Track a rollback in the current session
   */
  trackRollback(projectName) {
    const session = this.activeSessions.get(projectName);
    if (session) {
      session.rollbacksCount++;

      // Rollbacks decrease quality score
      session.qualityScore = Math.max(0, session.qualityScore - 5);

      this.updateSessionInDB(projectName, session);
    }
  }

  /**
   * Get current active session for a project
   */
  getActiveSession(projectName) {
    return this.activeSessions.get(projectName) || null;
  }

  /**
   * Calculate session quality metrics (0-100)
   * Lower score = fatigue/quality degradation
   */
  calculateSessionQuality(projectName) {
    const session = this.activeSessions.get(projectName);
    if (!session || session.recentChanges.length < 5) {
      return {
        score: 100,
        factors: [],
        recommendation: null
      };
    }

    const factors = [];
    let qualityScore = 100;

    // Factor 1: Rollback rate in this session
    const rollbackRate = session.changesCount > 0
      ? session.rollbacksCount / session.changesCount
      : 0;

    if (rollbackRate > 0.15) {
      const penalty = Math.min((rollbackRate - 0.15) * 100, 30);
      qualityScore -= penalty;
      factors.push({
        type: 'high_rollback_rate',
        severity: rollbackRate,
        message: `High rollback rate: ${(rollbackRate * 100).toFixed(0)}% (normal: <15%)`
      });
    }

    // Factor 2: Session duration (long sessions = fatigue)
    const durationHours = (Date.now() - session.startTime) / (1000 * 60 * 60);

    if (durationHours > 4) {
      const penalty = Math.min((durationHours - 4) * 5, 25);
      qualityScore -= penalty;
      factors.push({
        type: 'long_session',
        severity: durationHours / 6, // Normalize to 0-1
        message: `Long session: ${durationHours.toFixed(1)} hours (recommend breaks after 2-3 hours)`
      });
    }

    // Factor 3: Change size trending up (cognitive load indicator)
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

    // Factor 4: High-risk changes recently
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

    // Determine recommendation
    let recommendation = null;
    if (qualityScore < 50) {
      recommendation = {
        level: 'critical',
        message: 'Take a break now! Quality indicators suggest fatigue.',
        actions: ['Take a 15-minute break', 'Set a checkpoint for safe rollback', 'Review recent changes']
      };
    } else if (qualityScore < 70) {
      recommendation = {
        level: 'warning',
        message: 'Consider taking a short break soon.',
        actions: ['Take a 5-10 minute break', 'Verify recent changes', 'Save checkpoint']
      };
    }

    // Update session quality score
    session.qualityScore = qualityScore;

    return {
      score: Math.round(qualityScore),
      factors,
      recommendation,
      sessionDuration: durationHours,
      rollbackRate
    };
  }

  /**
   * Get session statistics for a project
   */
  getSessionStats(projectName, days = 30) {
    const db = this.projectDatabases.get(projectName);
    if (!db) return null;

    try {
      const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

      // Get all sessions in time period
      const sessions = db.db.prepare(`
        SELECT
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
        ORDER BY start_time DESC
      `).all(projectName, cutoffDate);

      if (sessions.length === 0) {
        return {
          totalSessions: 0,
          avgDuration: 0,
          avgQuality: 100,
          avgRollbackRate: 0,
          peakHours: []
        };
      }

      // Calculate averages
      const avgDuration = sessions.reduce((sum, s) => sum + s.duration_hours, 0) / sessions.length;
      const avgQuality = sessions.reduce((sum, s) => sum + s.quality_score, 0) / sessions.length;
      const avgRollbackRate = sessions.reduce((sum, s) => {
        return sum + (s.changes_count > 0 ? s.rollbacks_count / s.changes_count : 0);
      }, 0) / sessions.length;

      // Find peak productivity hours
      const hourlyActivity = new Map();
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
      console.error('Error getting session stats:', e);
      return null;
    }
  }

  /**
   * Get recommendation for taking a break
   */
  getBreakRecommendation(projectName) {
    const session = this.activeSessions.get(projectName);
    if (!session) {
      return {
        shouldTakeBreak: false,
        message: 'No active session'
      };
    }

    const durationMinutes = (Date.now() - session.startTime) / (1000 * 60);
    const quality = this.calculateSessionQuality(projectName);

    // Critical: Quality very low OR >4 hours
    if (quality.score < 50 || durationMinutes > 240) {
      return {
        shouldTakeBreak: true,
        urgency: 'critical',
        message: `Take a break NOW! You've been coding for ${(durationMinutes / 60).toFixed(1)} hours and quality is ${quality.score}/100.`,
        breakDuration: 15,
        reasons: quality.factors.map(f => f.message)
      };
    }

    // Warning: Quality low OR >2 hours
    if (quality.score < 70 || durationMinutes > 120) {
      return {
        shouldTakeBreak: true,
        urgency: 'warning',
        message: `Consider a short break. Session: ${(durationMinutes / 60).toFixed(1)} hours, quality: ${quality.score}/100.`,
        breakDuration: 10,
        reasons: quality.factors.map(f => f.message)
      };
    }

    // Info: >90 minutes (recommended)
    if (durationMinutes > 90) {
      return {
        shouldTakeBreak: true,
        urgency: 'info',
        message: `Good time for a break. You've been in flow for ${(durationMinutes / 60).toFixed(1)} hours.`,
        breakDuration: 5,
        reasons: ['Research shows productivity peaks at 90-minute intervals']
      };
    }

    return {
      shouldTakeBreak: false,
      message: `You're in good shape. Keep going! Quality: ${quality.score}/100`
    };
  }

  /**
   * End all active sessions (called on server shutdown)
   */
  endAllSessions() {
    for (const projectName of this.activeSessions.keys()) {
      this.endSession(projectName);
    }
  }
}

// Export factory
export function createSessionTracker(projectDatabases) {
  return new SessionTracker(projectDatabases);
}
