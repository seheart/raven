/**
 * Corvus v2.0.1 Tier 2 API Routes
 *
 * New endpoints for:
 * - Feature 5: Agent Behavior Profiling
 * - Feature 6: Contextual Observations
 * - Feature 7: Session Intelligence & Stories
 * - Feature 8: Pattern Recognition
 */

import express from 'express';
import { logger } from '../utils/logger.js';

export function createCorvusV2Tier2Routes({ projectDatabases }) {
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
  // Feature 5: Agent Behavior Profiling Endpoints
  // ============================================================================

  // GET /api/agent-profiles - Get all agent behavior profiles
  router.get('/agent-profiles', async (req, res) => {
    try {
      const { project = 'raven' } = req.query;
      const projectDb = getProjectDb(project);

      if (!projectDb) {
        return res.status(404).json({ error: 'Project not found' });
      }

      const profiles = projectDb.agentBehaviorProfiler.getAllAgentProfiles();
      res.json({ profiles, project });
    } catch (error) {
      logger.error('Failed to get agent profiles:', error);
      res.status(500).json({ error: 'Failed to fetch agent profiles' });
    }
  });

  // GET /api/agent-profiles/:agent - Get specific agent profile
  router.get('/agent-profiles/:agent', async (req, res) => {
    try {
      const { project = 'raven' } = req.query;
      const { agent } = req.params;
      const projectDb = getProjectDb(project);

      if (!projectDb) {
        return res.status(404).json({ error: 'Project not found' });
      }

      const profile = projectDb.agentBehaviorProfiler.getAgentProfile(agent);
      res.json({ profile, project });
    } catch (error) {
      logger.error('Failed to get agent profile:', error);
      res.status(500).json({ error: 'Failed to fetch agent profile' });
    }
  });

  // ============================================================================
  // Feature 6: Contextual Observations Endpoints
  // ============================================================================

  // GET /api/observations - Get current contextual observations
  router.get('/observations', async (req, res) => {
    try {
      const { project = 'raven', filepath } = req.query;
      const projectDb = getProjectDb(project);

      if (!projectDb) {
        return res.status(404).json({ error: 'Project not found' });
      }

      const observations = projectDb.contextualObserver.getObservations(filepath);
      res.json({ observations, project });
    } catch (error) {
      logger.error('Failed to get observations:', error);
      res.status(500).json({ error: 'Failed to fetch observations' });
    }
  });

  // GET /api/motivational - Get motivational message
  router.get('/motivational', async (req, res) => {
    try {
      const { project = 'raven' } = req.query;
      const projectDb = getProjectDb(project);

      if (!projectDb) {
        return res.status(404).json({ error: 'Project not found' });
      }

      const message = projectDb.contextualObserver.getMotivationalMessage();
      res.json({ message, project });
    } catch (error) {
      logger.error('Failed to get motivational message:', error);
      res.status(500).json({ error: 'Failed to fetch motivational message' });
    }
  });

  // ============================================================================
  // Feature 7: Session Intelligence Endpoints
  // ============================================================================

  // GET /api/session/metrics/:sessionId - Get session metrics
  router.get('/session/metrics/:sessionId', async (req, res) => {
    try {
      const { project = 'raven' } = req.query;
      const { sessionId } = req.params;
      const projectDb = getProjectDb(project);

      if (!projectDb) {
        return res.status(404).json({ error: 'Project not found' });
      }

      const metrics = projectDb.sessionIntelligence.getSessionMetrics(sessionId);
      res.json({ metrics, project });
    } catch (error) {
      logger.error('Failed to get session metrics:', error);
      res.status(500).json({ error: 'Failed to fetch session metrics' });
    }
  });

  // GET /api/session/story/:sessionId - Get session story
  router.get('/session/story/:sessionId', async (req, res) => {
    try {
      const { project = 'raven' } = req.query;
      const { sessionId } = req.params;
      const projectDb = getProjectDb(project);

      if (!projectDb) {
        return res.status(404).json({ error: 'Project not found' });
      }

      const story = projectDb.sessionIntelligence.generateSessionStory(sessionId);
      res.json({ story, project });
    } catch (error) {
      logger.error('Failed to get session story:', error);
      res.status(500).json({ error: 'Failed to fetch session story' });
    }
  });

  // GET /api/session/stories - Get recent session stories
  router.get('/session/stories', async (req, res) => {
    try {
      const { project = 'raven', limit = 10 } = req.query;
      const projectDb = getProjectDb(project);

      if (!projectDb) {
        return res.status(404).json({ error: 'Project not found' });
      }

      const stories = projectDb.sessionIntelligence.getRecentStories(parseInt(limit, 10));
      res.json({ stories, count: stories.length, project });
    } catch (error) {
      logger.error('Failed to get session stories:', error);
      res.status(500).json({ error: 'Failed to fetch session stories' });
    }
  });

  // GET /api/session/context/:sessionId - Get session context
  router.get('/session/context/:sessionId', async (req, res) => {
    try {
      const { project = 'raven' } = req.query;
      const { sessionId } = req.params;
      const projectDb = getProjectDb(project);

      if (!projectDb) {
        return res.status(404).json({ error: 'Project not found' });
      }

      const context = projectDb.sessionIntelligence.getSessionContext(sessionId);
      res.json({ context, project });
    } catch (error) {
      logger.error('Failed to get session context:', error);
      res.status(500).json({ error: 'Failed to fetch session context' });
    }
  });

  // ============================================================================
  // Feature 8: Pattern Recognition Endpoints
  // ============================================================================

  // GET /api/patterns/similar - Find similar events
  router.get('/patterns/similar', async (req, res) => {
    try {
      const { project = 'raven', eventId } = req.query;
      const projectDb = getProjectDb(project);

      if (!projectDb) {
        return res.status(404).json({ error: 'Project not found' });
      }

      if (!eventId) {
        return res.status(400).json({ error: 'eventId is required' });
      }

      // Get the event
      const event = projectDb.db.prepare('SELECT * FROM events WHERE id = ?').get(eventId);
      if (!event) {
        return res.status(404).json({ error: 'Event not found' });
      }

      const matches = projectDb.patternMatcher.findSimilarChanges(event, project, 5);
      res.json({ matches, count: matches.length, project });
    } catch (error) {
      logger.error('Failed to find similar patterns:', error);
      res.status(500).json({ error: 'Failed to find similar patterns' });
    }
  });

  // GET /api/patterns/matches - Get recent pattern matches
  router.get('/patterns/matches', async (req, res) => {
    try {
      const { project = 'raven', limit = 10 } = req.query;
      const projectDb = getProjectDb(project);

      if (!projectDb) {
        return res.status(404).json({ error: 'Project not found' });
      }

      const stmt = projectDb.prepareStatement(`
        SELECT pm.*,
               e1.filepath as current_filepath,
               e1.timestamp as current_timestamp,
               e2.filepath as matched_filepath,
               e2.timestamp as matched_timestamp
        FROM pattern_matches pm
        JOIN events e1 ON pm.current_event_id = e1.id
        JOIN events e2 ON pm.matched_event_id = e2.id
        ORDER BY pm.created_at DESC
        LIMIT ?
      `);

      const matches = stmt.all(parseInt(limit, 10));
      res.json({ matches, count: matches.length, project });
    } catch (error) {
      logger.error('Failed to get pattern matches:', error);
      res.status(500).json({ error: 'Failed to fetch pattern matches' });
    }
  });

  return router;
}
