/**
 * Corvus v2.0.1 Tier 3 API Routes
 *
 * New endpoints for:
 * - Feature 10: Project Memory & Context
 * - Feature 11: Cross-Agent Intelligence
 */

import express from 'express';
import { logger } from '../utils/logger.js';

export function createCorvusV2Tier3Routes({ projectDatabases }) {
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
  // Feature 10: Project Memory & Context Endpoints
  // ============================================================================

  // GET /api/memory - Get all project memories
  router.get('/memory', async (req, res) => {
    try {
      const { project = 'raven', limit = 100 } = req.query;
      const projectDb = getProjectDb(project);

      if (!projectDb) {
        return res.status(404).json({ error: 'Project not found' });
      }

      const memories = projectDb.projectMemory.getAllMemories(parseInt(limit, 10));
      res.json({ memories, count: memories.length, project });
    } catch (error) {
      logger.error('Failed to get memories:', error);
      res.status(500).json({ error: 'Failed to fetch memories' });
    }
  });

  // GET /api/memory/type/:type - Get memories by type
  router.get('/memory/type/:type', async (req, res) => {
    try {
      const { project = 'raven', limit = 50 } = req.query;
      const { type } = req.params;
      const projectDb = getProjectDb(project);

      if (!projectDb) {
        return res.status(404).json({ error: 'Project not found' });
      }

      const memories = projectDb.projectMemory.getMemoriesByType(type, parseInt(limit, 10));
      res.json({ memories, count: memories.length, type, project });
    } catch (error) {
      logger.error('Failed to get memories by type:', error);
      res.status(500).json({ error: 'Failed to fetch memories by type' });
    }
  });

  // GET /api/memory/important - Get important memories
  router.get('/memory/important', async (req, res) => {
    try {
      const { project = 'raven', limit = 20 } = req.query;
      const projectDb = getProjectDb(project);

      if (!projectDb) {
        return res.status(404).json({ error: 'Project not found' });
      }

      const memories = projectDb.projectMemory.getImportantMemories(parseInt(limit, 10));
      res.json({ memories, count: memories.length, project });
    } catch (error) {
      logger.error('Failed to get important memories:', error);
      res.status(500).json({ error: 'Failed to fetch important memories' });
    }
  });

  // POST /api/memory - Add a new memory
  router.post('/memory', async (req, res) => {
    try {
      const { project = 'raven' } = req.query;
      const { type, title, description, context, importance, tags, eventId, sessionId } = req.body;
      const projectDb = getProjectDb(project);

      if (!projectDb) {
        return res.status(404).json({ error: 'Project not found' });
      }

      if (!type || !title) {
        return res.status(400).json({ error: 'type and title are required' });
      }

      const memory = projectDb.projectMemory.addMemory({
        type,
        title,
        description,
        context,
        importance,
        tags,
        eventId,
        sessionId
      });

      res.json({ memory, project });
    } catch (error) {
      logger.error('Failed to add memory:', error);
      res.status(500).json({ error: 'Failed to add memory' });
    }
  });

  // DELETE /api/memory/:id - Delete a memory
  router.delete('/memory/:id', async (req, res) => {
    try {
      const { project = 'raven' } = req.query;
      const { id } = req.params;
      const projectDb = getProjectDb(project);

      if (!projectDb) {
        return res.status(404).json({ error: 'Project not found' });
      }

      projectDb.projectMemory.deleteMemory(parseInt(id, 10));
      res.json({ success: true, project });
    } catch (error) {
      logger.error('Failed to delete memory:', error);
      res.status(500).json({ error: 'Failed to delete memory' });
    }
  });

  // GET /api/context/snapshot - Get context snapshot
  router.get('/context/snapshot', async (req, res) => {
    try {
      const { project = 'raven', date } = req.query;
      const projectDb = getProjectDb(project);

      if (!projectDb) {
        return res.status(404).json({ error: 'Project not found' });
      }

      const snapshot = projectDb.projectMemory.getContextSnapshot(date);
      res.json({ snapshot, project });
    } catch (error) {
      logger.error('Failed to get context snapshot:', error);
      res.status(500).json({ error: 'Failed to fetch context snapshot' });
    }
  });

  // GET /api/context/snapshots - Get recent snapshots
  router.get('/context/snapshots', async (req, res) => {
    try {
      const { project = 'raven', limit = 7 } = req.query;
      const projectDb = getProjectDb(project);

      if (!projectDb) {
        return res.status(404).json({ error: 'Project not found' });
      }

      const snapshots = projectDb.projectMemory.getRecentSnapshots(parseInt(limit, 10));
      res.json({ snapshots, count: snapshots.length, project });
    } catch (error) {
      logger.error('Failed to get recent snapshots:', error);
      res.status(500).json({ error: 'Failed to fetch recent snapshots' });
    }
  });

  // POST /api/context/snapshot - Create context snapshot
  router.post('/context/snapshot', async (req, res) => {
    try {
      const { project = 'raven' } = req.query;
      const { activeFiles, keyAgents, mainFocus, challenges, achievements, nextSteps, metadata } =
        req.body;
      const projectDb = getProjectDb(project);

      if (!projectDb) {
        return res.status(404).json({ error: 'Project not found' });
      }

      const result = projectDb.projectMemory.createContextSnapshot({
        activeFiles,
        keyAgents,
        mainFocus,
        challenges,
        achievements,
        nextSteps,
        metadata
      });

      res.json({ result, project });
    } catch (error) {
      logger.error('Failed to create context snapshot:', error);
      res.status(500).json({ error: 'Failed to create context snapshot' });
    }
  });

  // POST /api/context/snapshot/auto - Auto-generate context snapshot
  router.post('/context/snapshot/auto', async (req, res) => {
    try {
      const { project = 'raven' } = req.query;
      const projectDb = getProjectDb(project);

      if (!projectDb) {
        return res.status(404).json({ error: 'Project not found' });
      }

      const result = projectDb.projectMemory.autoGenerateSnapshot();
      res.json({ result, project });
    } catch (error) {
      logger.error('Failed to auto-generate snapshot:', error);
      res.status(500).json({ error: 'Failed to auto-generate snapshot' });
    }
  });

  // ============================================================================
  // Feature 11: Cross-Agent Intelligence Endpoints
  // ============================================================================

  // GET /api/agents/active - Get active agents
  router.get('/agents/active', async (req, res) => {
    try {
      const { project = 'raven', hours = 24 } = req.query;
      const projectDb = getProjectDb(project);

      if (!projectDb) {
        return res.status(404).json({ error: 'Project not found' });
      }

      const agents = projectDb.crossAgentIntelligence.getActiveAgents(parseInt(hours, 10));
      res.json({ agents, count: agents.length, project });
    } catch (error) {
      logger.error('Failed to get active agents:', error);
      res.status(500).json({ error: 'Failed to fetch active agents' });
    }
  });

  // GET /api/agents/handoffs - Get agent handoffs
  router.get('/agents/handoffs', async (req, res) => {
    try {
      const { project = 'raven', hours = 24 } = req.query;
      const projectDb = getProjectDb(project);

      if (!projectDb) {
        return res.status(404).json({ error: 'Project not found' });
      }

      const handoffs = projectDb.crossAgentIntelligence.detectAgentHandoffs(parseInt(hours, 10));
      res.json({ handoffs, count: handoffs.length, project });
    } catch (error) {
      logger.error('Failed to get agent handoffs:', error);
      res.status(500).json({ error: 'Failed to fetch agent handoffs' });
    }
  });

  // GET /api/agents/conflicts - Get file conflicts
  router.get('/agents/conflicts', async (req, res) => {
    try {
      const { project = 'raven', hours = 24 } = req.query;
      const projectDb = getProjectDb(project);

      if (!projectDb) {
        return res.status(404).json({ error: 'Project not found' });
      }

      const conflicts = projectDb.crossAgentIntelligence.detectFileConflicts(parseInt(hours, 10));
      res.json({ conflicts, count: conflicts.length, project });
    } catch (error) {
      logger.error('Failed to get file conflicts:', error);
      res.status(500).json({ error: 'Failed to fetch file conflicts' });
    }
  });

  // GET /api/agents/agent-conflicts - Get agent-to-agent conflicts
  router.get('/agents/agent-conflicts', async (req, res) => {
    try {
      const { project = 'raven', hours = 24 } = req.query;
      const projectDb = getProjectDb(project);

      if (!projectDb) {
        return res.status(404).json({ error: 'Project not found' });
      }

      const conflicts = projectDb.crossAgentIntelligence.detectAgentConflicts(parseInt(hours, 10));
      res.json({ conflicts, count: conflicts.length, project });
    } catch (error) {
      logger.error('Failed to get agent conflicts:', error);
      res.status(500).json({ error: 'Failed to fetch agent conflicts' });
    }
  });

  // GET /api/agents/collaboration - Get collaboration patterns
  router.get('/agents/collaboration', async (req, res) => {
    try {
      const { project = 'raven', days = 7 } = req.query;
      const projectDb = getProjectDb(project);

      if (!projectDb) {
        return res.status(404).json({ error: 'Project not found' });
      }

      const patterns = projectDb.crossAgentIntelligence.getCollaborationPatterns(
        parseInt(days, 10)
      );
      res.json({ patterns, count: patterns.length, project });
    } catch (error) {
      logger.error('Failed to get collaboration patterns:', error);
      res.status(500).json({ error: 'Failed to fetch collaboration patterns' });
    }
  });

  // GET /api/agents/specialization - Get agent specialization
  router.get('/agents/specialization', async (req, res) => {
    try {
      const { project = 'raven', days = 30 } = req.query;
      const projectDb = getProjectDb(project);

      if (!projectDb) {
        return res.status(404).json({ error: 'Project not found' });
      }

      const specializations = projectDb.crossAgentIntelligence.getAgentSpecialization(
        parseInt(days, 10)
      );
      res.json({ specializations, count: specializations.length, project });
    } catch (error) {
      logger.error('Failed to get agent specialization:', error);
      res.status(500).json({ error: 'Failed to fetch agent specialization' });
    }
  });

  // GET /api/agents/productivity - Get agent productivity comparison
  router.get('/agents/productivity', async (req, res) => {
    try {
      const { project = 'raven', days = 7 } = req.query;
      const projectDb = getProjectDb(project);

      if (!projectDb) {
        return res.status(404).json({ error: 'Project not found' });
      }

      const productivity = projectDb.crossAgentIntelligence.getAgentProductivityComparison(
        parseInt(days, 10)
      );
      res.json({ productivity, count: productivity.length, project });
    } catch (error) {
      logger.error('Failed to get agent productivity:', error);
      res.status(500).json({ error: 'Failed to fetch agent productivity' });
    }
  });

  // GET /api/agents/summary - Get cross-agent intelligence summary
  router.get('/agents/summary', async (req, res) => {
    try {
      const { project = 'raven', hours = 24 } = req.query;
      const projectDb = getProjectDb(project);

      if (!projectDb) {
        return res.status(404).json({ error: 'Project not found' });
      }

      const summary = projectDb.crossAgentIntelligence.getSummary(parseInt(hours, 10));
      res.json({ summary, project });
    } catch (error) {
      logger.error('Failed to get cross-agent summary:', error);
      res.status(500).json({ error: 'Failed to fetch cross-agent summary' });
    }
  });

  return router;
}
