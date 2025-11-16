/**
 * Corvus v2.0.1 API Routes
 *
 * New endpoints for:
 * - Feature 1: Anomaly Detection v2
 * - Feature 2: Multi-Agent Monitoring
 * - Feature 3: Risk Correlation
 */

import express from 'express';
import { logger } from '../utils/logger.js';

export function createCorvusV2Routes({ projectDatabases }) {
  const router = express.Router();

  // Helper to get project database
  const getProjectDb = projectName => {
    return (
      projectDatabases.get(projectName) ||
      projectDatabases.get('raven') ||
      projectDatabases.values().next().value
    );
  };

  // ============================================================================
  // Feature 1: Anomaly Detection v2 Endpoints
  // ============================================================================

  // GET /api/anomalies/stats - Get anomaly statistics
  router.get('/anomalies/stats', async (req, res) => {
    try {
      const { project = 'raven' } = req.query;
      const projectDb = getProjectDb(project);

      if (!projectDb) {
        return res.status(404).json({ error: 'Project not found' });
      }

      const stats = await projectDb.anomalyDetector.getAnomalyStats();
      res.json({ ...stats, project });
    } catch (error) {
      logger.error('Failed to get anomaly stats:', error);
      res.status(500).json({ error: 'Failed to fetch anomaly statistics' });
    }
  });

  // GET /api/anomalies/recent - Get recent anomalies
  router.get('/anomalies/recent', async (req, res) => {
    try {
      const { project = 'raven', limit = 20 } = req.query;
      const projectDb = getProjectDb(project);

      if (!projectDb) {
        return res.status(404).json({ error: 'Project not found' });
      }

      const anomalies = await projectDb.anomalyDetector.getRecentAnomalies(parseInt(limit, 10));
      res.json({ anomalies, count: anomalies.length, project });
    } catch (error) {
      logger.error('Failed to get recent anomalies:', error);
      res.status(500).json({ error: 'Failed to fetch recent anomalies' });
    }
  });

  // GET /api/anomalies/by-risk - Get anomalies grouped by risk level
  router.get('/anomalies/by-risk', async (req, res) => {
    // Feature not yet implemented - requires AnomalyDetector.getAnomaliesByRiskLevel()
    res.status(501).json({
      error: 'Not Implemented',
      message: 'Anomaly risk-level grouping is planned for a future release',
      feature: 'anomalies-by-risk'
    });
  });

  // GET /api/anomalies/timeline - Get anomaly timeline
  router.get('/anomalies/timeline', async (req, res) => {
    // Feature not yet implemented - requires AnomalyDetector.getAnomalyTimeline()
    res.status(501).json({
      error: 'Not Implemented',
      message: 'Anomaly timeline visualization is planned for a future release',
      feature: 'anomaly-timeline'
    });
  });

  // ============================================================================
  // Feature 2: Multi-Agent Monitoring Endpoints
  // ============================================================================

  // GET /api/agents/active - Get currently active agents
  router.get('/agents/active', async (req, res) => {
    try {
      const { project = 'raven' } = req.query;
      const projectDb = getProjectDb(project);

      if (!projectDb) {
        return res.status(404).json({ error: 'Project not found' });
      }

      const activeAgents = projectDb.agentDetector.getActiveAgents();
      const currentAgent = projectDb.agentDetector.getCurrentAgent();

      // Build runningAgents list from currentAgent
      const runningAgents =
        currentAgent && currentAgent.active
          ? [
              {
                agent: currentAgent.agent,
                processName: currentAgent.agent,
                confidence: currentAgent.confidence
              }
            ]
          : [];

      res.json({
        activeAgents,
        currentAgent,
        runningAgents,
        project
      });
    } catch (error) {
      logger.error('Failed to get active agents:', error);
      res.status(500).json({ error: 'Failed to fetch active agents' });
    }
  });

  // GET /api/agents/stats - Get agent activity statistics
  router.get('/agents/stats', async (req, res) => {
    try {
      const { project = 'raven', hours = 24 } = req.query;
      const projectDb = getProjectDb(project);

      if (!projectDb) {
        return res.status(404).json({ error: 'Project not found' });
      }

      const stats = projectDb.agentDetector.getAgentStats(parseInt(hours, 10));
      res.json({ stats, hours: parseInt(hours, 10), project });
    } catch (error) {
      logger.error('Failed to get agent stats:', error);
      res.status(500).json({ error: 'Failed to fetch agent statistics' });
    }
  });

  // GET /api/agents/events/:agent - Get events for specific agent
  router.get('/agents/events/:agent', async (req, res) => {
    // Feature not yet implemented - requires AgentDetector.getAgentEvents()
    const { agent } = req.params;
    res.status(501).json({
      error: 'Not Implemented',
      message: `Agent-specific event filtering for "${agent}" is planned for a future release`,
      feature: 'agent-events',
      agent
    });
  });

  // GET /api/agents/timeline - Get agent activity timeline
  router.get('/agents/timeline', async (req, res) => {
    // Feature not yet implemented - requires AgentDetector.getAgentTimeline()
    res.status(501).json({
      error: 'Not Implemented',
      message: 'Agent activity timeline is planned for a future release',
      feature: 'agent-timeline'
    });
  });

  // ============================================================================
  // Feature 3: Risk Correlation Endpoints
  // ============================================================================

  // GET /api/risk/rollback-stats - Get rollback statistics
  router.get('/risk/rollback-stats', async (req, res) => {
    try {
      const { project = 'raven' } = req.query;
      const projectDb = getProjectDb(project);

      if (!projectDb) {
        return res.status(404).json({ error: 'Project not found' });
      }

      const stats = await projectDb.riskCorrelator.getRollbackStats();
      res.json({ ...stats, project });
    } catch (error) {
      logger.error('Failed to get rollback stats:', error);
      res.status(500).json({ error: 'Failed to fetch rollback statistics' });
    }
  });

  // GET /api/risk/high-risk-files - Get high-risk files
  router.get('/risk/high-risk-files', async (req, res) => {
    try {
      const { project = 'raven', limit = 10 } = req.query;
      const projectDb = getProjectDb(project);

      if (!projectDb) {
        return res.status(404).json({ error: 'Project not found' });
      }

      const files = projectDb.riskCorrelator.getHighRiskFiles(parseInt(limit, 10));

      // Enhance with file details
      const enhancedFiles = files.map(f => {
        // Get last rollback timestamp for this file
        const stmt = projectDb.db.prepareStatement(`
          SELECT r.timestamp as last_rollback, COUNT(*) as rollback_count
          FROM rollbacks r
          JOIN events e ON r.event_id = e.id
          WHERE e.filepath = ?
          GROUP BY e.filepath
        `);
        const details = stmt.get(f.file);

        return {
          filepath: f.file,
          risk_score: f.riskScore,
          rollback_count: details?.rollback_count || 0,
          last_rollback: details?.last_rollback || null
        };
      });

      res.json({ files: enhancedFiles, count: enhancedFiles.length, project });
    } catch (error) {
      logger.error('Failed to get high-risk files:', error);
      res.status(500).json({ error: 'Failed to fetch high-risk files' });
    }
  });

  // GET /api/risk/recent-rollbacks - Get recent rollbacks
  router.get('/risk/recent-rollbacks', async (req, res) => {
    try {
      const { project = 'raven', limit = 20 } = req.query;
      const projectDb = getProjectDb(project);

      if (!projectDb) {
        return res.status(404).json({ error: 'Project not found' });
      }

      const rollbacks = await projectDb.riskCorrelator.getRecentRollbacks(parseInt(limit, 10));
      res.json({ rollbacks, count: rollbacks.length, project });
    } catch (error) {
      logger.error('Failed to get recent rollbacks:', error);
      res.status(500).json({ error: 'Failed to fetch recent rollbacks' });
    }
  });

  // POST /api/risk/record-rollback - Record a rollback (for manual rollbacks)
  router.post('/risk/record-rollback', async (req, res) => {
    try {
      const { project = 'raven' } = req.query;
      const {
        eventId,
        reason,
        automatic = false,
        rollbackType = 'manual',
        filesAffected = 1
      } = req.body;

      const projectDb = getProjectDb(project);

      if (!projectDb) {
        return res.status(404).json({ error: 'Project not found' });
      }

      if (!eventId) {
        return res.status(400).json({ error: 'eventId is required' });
      }

      const rollbackId = projectDb.riskCorrelator.recordRollback(eventId, {
        reason,
        automatic,
        rollbackType,
        filesAffected
      });

      res.json({
        success: true,
        rollbackId,
        message: 'Rollback recorded successfully',
        project
      });
    } catch (error) {
      logger.error('Failed to record rollback:', error);
      res.status(500).json({ error: 'Failed to record rollback' });
    }
  });

  return router;
}
