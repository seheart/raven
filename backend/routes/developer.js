import { Router } from 'express';

/**
 * Creates developer persona routes
 * @param {object} deps - Dependencies
 * @returns {Router} Express router
 */
export function createDeveloperRoutes(deps) {
  const router = Router();
  const { developerDB } = deps;

  // GET /api/developer/interactions - Get recent agent interactions
  router.get('/interactions', (req, res) => {
    try {
      const {
        limit = 50,
        project = null
      } = req.query;

      const interactions = developerDB.getRecentInteractions(
        parseInt(limit),
        project === 'null' || project === 'all' ? null : project
      );

      res.json({ interactions, total: interactions.length });
    } catch (error) {
      console.error('❌ Get interactions error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/developer/patterns - Get coding patterns
  router.get('/patterns', (req, res) => {
    try {
      const {
        language = null,
        limit = 100
      } = req.query;

      const patterns = developerDB.getCodingPatterns(
        language === 'null' || language === 'all' ? null : language,
        parseInt(limit)
      );

      res.json({ patterns, total: patterns.length });
    } catch (error) {
      console.error('❌ Get patterns error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/developer/workflow - Get workflow statistics
  router.get('/workflow', (req, res) => {
    try {
      const { days = 30 } = req.query;

      const stats = developerDB.getWorkflowStats(parseInt(days));
      res.json(stats);
    } catch (error) {
      console.error('❌ Get workflow stats error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/developer/preferences - Get all developer preferences
  router.get('/preferences', (req, res) => {
    try {
      const preferences = developerDB.getAllPreferences();
      res.json({ preferences, total: preferences.length });
    } catch (error) {
      console.error('❌ Get preferences error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/developer/context-switches - Get context switch statistics
  router.get('/context-switches', (req, res) => {
    try {
      const { days = 30 } = req.query;

      const stats = developerDB.getContextSwitchStats(parseInt(days));
      res.json(stats);
    } catch (error) {
      console.error('❌ Get context switches error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/developer/stats - Get overall developer persona statistics
  router.get('/stats', (req, res) => {
    try {
      // Query all tables for counts
      const stats = {
        agent_interactions: developerDB.db.prepare('SELECT COUNT(*) as count FROM agent_interactions').get().count,
        code_patterns: developerDB.db.prepare('SELECT COUNT(*) as count FROM code_patterns').get().count,
        workflow_events: developerDB.db.prepare('SELECT COUNT(*) as count FROM workflow_events').get().count,
        error_recovery: developerDB.db.prepare('SELECT COUNT(*) as count FROM error_recovery').get().count,
        context_switches: developerDB.db.prepare('SELECT COUNT(*) as count FROM context_switches').get().count,
        preferences: developerDB.db.prepare('SELECT COUNT(*) as count FROM developer_preferences').get().count
      };

      // Get language breakdown
      const languages = developerDB.db.prepare(`
        SELECT language, COUNT(*) as count
        FROM code_patterns
        WHERE language IS NOT NULL
        GROUP BY language
        ORDER BY count DESC
        LIMIT 10
      `).all();

      // Get project activity breakdown
      const projects = developerDB.db.prepare(`
        SELECT project, COUNT(*) as count
        FROM agent_interactions
        WHERE project IS NOT NULL
        GROUP BY project
        ORDER BY count DESC
        LIMIT 10
      `).all();

      // Get hourly activity pattern
      const hourlyActivity = developerDB.db.prepare(`
        SELECT hour_of_day, COUNT(*) as count
        FROM workflow_events
        WHERE hour_of_day IS NOT NULL
        GROUP BY hour_of_day
        ORDER BY hour_of_day
      `).all();

      res.json({
        counts: stats,
        languages,
        projects,
        hourly_activity: hourlyActivity
      });
    } catch (error) {
      console.error('❌ Get developer stats error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/developer/interactions - Log agent interaction
  router.post('/interactions', (req, res) => {
    try {
      const data = req.body;
      const id = developerDB.logAgentInteraction(data);

      res.json({ success: true, id });
    } catch (error) {
      console.error('❌ Log interaction error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/developer/patterns - Log code pattern
  router.post('/patterns', (req, res) => {
    try {
      const data = req.body;
      const id = developerDB.logCodePattern(data);

      res.json({ success: true, id });
    } catch (error) {
      console.error('❌ Log pattern error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/developer/workflow - Log workflow event
  router.post('/workflow', (req, res) => {
    try {
      const data = req.body;
      const id = developerDB.logWorkflowEvent(data);

      res.json({ success: true, id });
    } catch (error) {
      console.error('❌ Log workflow error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}
