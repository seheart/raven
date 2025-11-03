import { Router } from 'express';
import { logger } from '../utils/logger.js';
import { dashboardCache, cacheMiddleware } from '../utils/cache.js';

/**
 * Creates dashboard routes (stats and analytics)
 * @param {object} deps - Dependencies
 * @returns {Router} Express router
 */
export function createDashboardRoutes(deps) {
  const router = Router();
  const { projectDatabases, projectState, SESSION_ID, agentRegistry, getAgentColor } = deps;

  // GET /api/dashboard-stats - Aggregate stats from all projects (PARALLELIZED)
  router.get('/dashboard-stats', async (req, res) => {
    try {
      // Get session filter from query param or default to SESSION_ID
      const sessionFilter = req.query.session || SESSION_ID || null;

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
        unique_files_modified: 0,
        total_lines_changed: 0
      };

      // Track unique agents and files across all projects
      const uniqueAgents = new Set();
      const uniqueFiles = new Set();

      // Parallelize database queries for better performance
      const statsPromises = Array.from(projectDatabases.entries()).map(([projectName, db]) =>
        Promise.resolve({
          projectName,
          stats: db.getDashboardStats(sessionFilter)
        })
      );

      const allStats = await Promise.all(statsPromises);

      // Aggregate results from all projects
      let sessionStartTime = null;
      for (const { projectName, stats: projectStats } of allStats) {
        aggregatedStats.total_events += projectStats.total_events || 0;
        aggregatedStats.total_files += projectStats.total_files || 0; // Sum files from each project
        aggregatedStats.active_files_today += projectStats.active_files_today || 0;
        aggregatedStats.total_changes += projectStats.total_changes || 0;
        aggregatedStats.creates += projectStats.creates || 0;
        aggregatedStats.edits += projectStats.edits || 0;
        aggregatedStats.deletes += projectStats.deletes || 0;
        aggregatedStats.unique_files_modified += projectStats.unique_files_modified || 0;
        aggregatedStats.total_lines_changed += projectStats.total_lines_changed || 0;

        // Collect unique agents globally across all projects
        const db = projectDatabases.get(projectName);
        if (db && db.db) {
          try {
            // Get unique agents (count globally)
            if (sessionFilter) {
              const agentsStmt = db.db.prepare(`
                SELECT DISTINCT agent FROM agent_events WHERE session_id = ?
              `);
              const agents = agentsStmt.all(sessionFilter);
              agents.forEach(row => row.agent && uniqueAgents.add(row.agent));
            } else {
              const agentsStmt = db.db.prepare(`
                SELECT DISTINCT agent FROM agent_events
              `);
              const agents = agentsStmt.all();
              agents.forEach(row => row.agent && uniqueAgents.add(row.agent));
            }
          } catch (dbError) {
            logger.error(`Error querying database for ${projectName}:`, dbError);
          }
        }

        // Use the earliest session start time
        if (
          projectStats.session_duration_seconds > 0 &&
          (sessionStartTime === null ||
            projectStats.session_duration_seconds > aggregatedStats.session_duration_seconds)
        ) {
          aggregatedStats.session_duration_seconds = projectStats.session_duration_seconds;
        }
      }

      // Set unique agent count (globally unique)
      aggregatedStats.total_agents = uniqueAgents.size;

      res.json(aggregatedStats);
    } catch (error) {
      logger.error('Dashboard stats error', { error: error.message, stack: error.stack });
      res.status(500).json({ error: error.message || 'Internal server error' });
    }
  });

  // GET /api/top-modified-files - Top files by modification count (PARALLELIZED)
  router.get('/top-modified-files', async (req, res) => {
    try {
      const limitNum = parseInt(req.query.limit, 10);
      const limit = isNaN(limitNum) || limitNum < 1 || limitNum > 1000 ? 10 : limitNum;

      // Parallelize queries across all projects
      const filesPromises = Array.from(projectDatabases.entries()).map(([projectName, db]) =>
        Promise.resolve({
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
      logger.error('Top files error', { error });
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/longest-edits - Get longest running edit operations
  router.get('/longest-edits', (req, res) => {
    try {
      if (!projectState.db) {
        return res.status(500).json({ error: 'No active project database' });
      }
      const limit = parseInt(req.query.limit, 10) || 10;
      const edits = projectState.db.getLongestEdits(limit);
      res.json(edits);
    } catch (error) {
      logger.error('Longest edits error', { error });
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/agents-status - Get all agent statuses (with caching)
  router.get('/agents-status', cacheMiddleware(dashboardCache), (req, res) => {
    try {
      if (!projectState.db) {
        return res.status(500).json({ error: 'No active project database' });
      }
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
      logger.error('Agents status error', { error });
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/agent-stats - Get agent statistics (with caching)
  router.get('/agent-stats', cacheMiddleware(dashboardCache), (req, res) => {
    try {
      if (!projectState.db) {
        return res.status(500).json({ error: 'No active project database' });
      }
      const stats = projectState.db.getAgentStats();
      res.json(stats);
    } catch (error) {
      logger.error('Agent stats error', { error });
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/top-files - Top files by activity (integration test alias)
  router.get('/top-files', async (req, res) => {
    try {
      const limit = parseInt(req.query.limit, 10) || 10;

      // Aggregate files from all projects
      const filesPromises = Array.from(projectDatabases.entries()).map(([projectName, db]) => {
        try {
          const files = db.getTopModifiedFiles(null, limit);
          return files.map(file => ({
            ...file,
            change_count: file.edit_count,
            project: projectName
          }));
        } catch (err) {
          logger.error(`Error getting top files for ${projectName}:`, err);
          return [];
        }
      });

      const allFiles = (await Promise.all(filesPromises)).flat();

      // Sort by change_count and take top N
      allFiles.sort((a, b) => b.change_count - a.change_count);
      const topFiles = allFiles.slice(0, limit);

      res.json(topFiles);
    } catch (error) {
      logger.error('Top files error', { error });
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/agent-activity - Get agent activity stats
  router.get('/agent-activity', async (req, res) => {
    try {
      // Aggregate agent activity from all projects
      const activityMap = new Map();

      for (const [projectName, db] of projectDatabases.entries()) {
        try {
          const stmt = db.db.prepare(`
            SELECT
              agent,
              COUNT(*) as event_count,
              SUM(COALESCE(lines_changed, 0)) as total_lines_changed,
              MAX(timestamp) as last_activity
            FROM agent_events
            GROUP BY agent
          `);

          const projectActivity = stmt.all();

          for (const activity of projectActivity) {
            if (activityMap.has(activity.agent)) {
              const existing = activityMap.get(activity.agent);
              existing.event_count += activity.event_count;
              existing.total_lines_changed += activity.total_lines_changed;
              if (activity.last_activity > existing.last_activity) {
                existing.last_activity = activity.last_activity;
              }
            } else {
              activityMap.set(activity.agent, { ...activity, project: projectName });
            }
          }
        } catch (err) {
          logger.error(`Error getting agent activity for ${projectName}:`, err);
        }
      }

      const agentActivity = Array.from(activityMap.values());
      res.json(agentActivity);
    } catch (error) {
      logger.error('Agent activity error', { error });
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/timeline - Get event timeline
  router.get('/timeline', async (req, res) => {
    try {
      const timelineMap = new Map();

      for (const [projectName, db] of projectDatabases.entries()) {
        try {
          const stmt = db.db.prepare(`
            SELECT
              DATE(timestamp) as date,
              strftime('%Y-%m-%d %H:00:00', timestamp) as hour,
              COUNT(*) as count
            FROM agent_events
            GROUP BY hour
            ORDER BY hour
          `);

          const projectTimeline = stmt.all();

          for (const entry of projectTimeline) {
            const key = entry.hour;
            if (timelineMap.has(key)) {
              const existing = timelineMap.get(key);
              if (existing) {
                existing.count += entry.count;
              }
            } else {
              timelineMap.set(key, {
                timestamp: entry.hour,
                count: entry.count
              });
            }
          }
        } catch (err) {
          logger.error(`Error getting timeline for ${projectName}:`, err);
        }
      }

      const timeline = Array.from(timelineMap.values());
      res.json(timeline);
    } catch (error) {
      logger.error('Timeline error', { error });
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}
