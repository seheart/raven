import { Router } from 'express';

/**
 * Creates dashboard routes (stats and analytics)
 * @param {object} deps - Dependencies
 * @returns {Router} Express router
 */
export function createDashboardRoutes(deps) {
  const router = Router();
  const {
    projectDatabases,
    projectState,
    SESSION_ID,
    agentRegistry,
    getAgentColor
  } = deps;

  // GET /api/dashboard-stats - Aggregate stats from all projects (PARALLELIZED)
  router.get('/dashboard-stats', async (req, res) => {
    try {
      // Aggregate stats from ALL projects
      let aggregatedStats = {
        total_events: 0,
        total_files: 0,
        total_agents: 0,
        session_duration_seconds: 0,
        active_files_today: 0,
        total_changes: 0,
        creates: 0,
        edits: 0,
        deletes: 0,
        unique_files_modified: 0
      };

      // Parallelize database queries for better performance
      const statsPromises = Array.from(projectDatabases.entries()).map(
        ([projectName, db]) => Promise.resolve({
          projectName,
          stats: db.getDashboardStats(SESSION_ID)
        })
      );

      const allStats = await Promise.all(statsPromises);

      // Aggregate results from all projects
      let sessionStartTime = null;
      for (const { stats: projectStats } of allStats) {
        aggregatedStats.total_events += projectStats.total_events || 0;
        aggregatedStats.total_files += projectStats.total_files || 0;
        aggregatedStats.total_agents += projectStats.total_agents || 0;
        aggregatedStats.active_files_today += projectStats.active_files_today || 0;
        aggregatedStats.total_changes += projectStats.total_changes || 0;
        aggregatedStats.creates += projectStats.creates || 0;
        aggregatedStats.edits += projectStats.edits || 0;
        aggregatedStats.deletes += projectStats.deletes || 0;
        aggregatedStats.unique_files_modified += projectStats.unique_files_modified || 0;

        // Use the earliest session start time
        if (projectStats.session_duration_seconds > 0 &&
            (sessionStartTime === null || projectStats.session_duration_seconds > aggregatedStats.session_duration_seconds)) {
          aggregatedStats.session_duration_seconds = projectStats.session_duration_seconds;
        }
      }

      res.json(aggregatedStats);
    } catch (error) {
      console.error('❌ Dashboard stats error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/top-modified-files - Top files by modification count (PARALLELIZED)
  router.get('/top-modified-files', async (req, res) => {
    try {
      const limit = parseInt(req.query.limit) || 10;

      // Parallelize queries across all projects
      const filesPromises = Array.from(projectDatabases.entries()).map(
        ([projectName, db]) => Promise.resolve({
          projectName,
          files: db.getTopModifiedFiles(SESSION_ID, limit)
        })
      );

      const allProjectFiles = await Promise.all(filesPromises);

      // Aggregate and tag files with project names
      const allFiles = [];
      for (const { projectName, files: projectFiles } of allProjectFiles) {
        if (projectFiles && Array.isArray(projectFiles)) {
          projectFiles.forEach(file => {
            file.project = projectName;
          });
          allFiles.push(...projectFiles);
        }
      }

      // Sort by change count (descending) and take top N
      allFiles.sort((a, b) => b.change_count - a.change_count);
      const topFiles = allFiles.slice(0, limit);

      res.json({ files: topFiles });
    } catch (error) {
      console.error('❌ Top files error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/longest-edits - Get longest running edit operations
  router.get('/longest-edits', (req, res) => {
    try {
      const limit = parseInt(req.query.limit) || 10;
      const edits = projectState.db.getLongestEdits(limit);
      res.json(edits);
    } catch (error) {
      console.error('❌ Longest edits error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/agents-status - Get all agent statuses
  router.get('/agents-status', (req, res) => {
    try {
      const now = new Date();

      // Get historical agents from database
      const historicalAgents = projectState.db.getHistoricalAgents();

      // Create a map of agents with their historical data
      const agentsMap = new Map();

      // First, add historical agents from database
      for (const agent of historicalAgents) {
        const lastSeen = new Date(agent.last_seen);
        const secondsSinceLastSeen = (now - lastSeen) / 1000;

        agentsMap.set(agent.agent_name, {
          agent_name: agent.agent_name,
          agent_type: agent.agent_type,
          last_seen: agent.last_seen,
          requests_handled: agent.requests_handled,
          errors: agent.errors,
          is_running: secondsSinceLastSeen < 30,
          models_available: [],
          color: getAgentColor(agent.agent_name)
        });
      }

      // Then, update with any current agents from registry (will be more recent)
      for (const [agentName, agentData] of agentRegistry.entries()) {
        const lastSeen = new Date(agentData.last_seen);
        const secondsSinceLastSeen = (now - lastSeen) / 1000;

        agentsMap.set(agentName, {
          ...agentData,
          is_running: secondsSinceLastSeen < 30
        });
      }

      const agents = Array.from(agentsMap.values());
      res.json(agents);
    } catch (error) {
      console.error('❌ Agents status error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/agent-stats - Get agent statistics
  router.get('/agent-stats', (req, res) => {
    try {
      const stats = projectState.db.getAgentStats();
      res.json(stats);
    } catch (error) {
      console.error('❌ Agent stats error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}
