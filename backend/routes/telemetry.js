import { Router } from 'express';
import { logger } from '../utils/logger.js';

/**
 * Creates telemetry routes
 * @param {object} deps - Dependencies
 * @returns {Router} Express router
 */
export function createTelemetryRoutes(deps) {
  const router = Router();
  const {
    projectDatabases,
    developerDB,
    availableProjects,
    SESSION_ID,
    agentRegistry,
    getAgentColor,
    triggerEngine,
    io
  } = deps;

  // POST /telemetry - Receive telemetry data from agents
  router.post('/', (req, res) => {
    try {
      // Support both 'event' and 'event_type' for backwards compatibility
      const { agent, event, event_type, file, lines_changed, duration_ms, message, metadata, project } = req.body;
      const eventName = event || event_type;

      // Validate required fields
      if (!agent || !eventName || !message) {
        return res.status(400).json({ error: 'Missing required fields: agent, event/event_type, message' });
      }

      // Validate field types and sanitize
      if (typeof agent !== 'string' || agent.length > 100) {
        return res.status(400).json({ error: 'Invalid agent: must be string ≤100 chars' });
      }
      if (typeof eventName !== 'string' || eventName.length > 100) {
        return res.status(400).json({ error: 'Invalid event: must be string ≤100 chars' });
      }
      if (typeof message !== 'string' || message.length > 1000) {
        return res.status(400).json({ error: 'Invalid message: must be string ≤1000 chars' });
      }
      if (file !== undefined && typeof file !== 'string') {
        return res.status(400).json({ error: 'Invalid file: must be string' });
      }
      if (lines_changed !== undefined && (typeof lines_changed !== 'number' || lines_changed < 0 || lines_changed > 1000000)) {
        return res.status(400).json({ error: 'Invalid lines_changed: must be number 0-1000000' });
      }
      if (duration_ms !== undefined && (typeof duration_ms !== 'number' || duration_ms < 0 || duration_ms > 3600000)) {
        return res.status(400).json({ error: 'Invalid duration_ms: must be number 0-3600000 (1 hour max)' });
      }

      const timestamp = new Date().toISOString();

      // Determine which project this telemetry is for
      let projectName = project; // Use explicit project if provided
      if (!projectName && availableProjects.length > 0) {
        // Default to 'raven' if it exists, otherwise first project
        const ravenProject = availableProjects.find(p => p.name === 'raven');
        projectName = ravenProject ? ravenProject.name : availableProjects[0].name;
      }

      // Get project database (or use first available)
      const db = projectName ? projectDatabases.get(projectName) : projectDatabases.values().next().value;

      if (!db) {
        return res.status(500).json({ error: 'No project database available' });
      }

      // Insert into project-specific database
      const eventId = db.insertAgentEvent(
        timestamp,
        agent,
        eventName,
        file,
        lines_changed,
        duration_ms,
        message,
        metadata,
        SESSION_ID
      );

      // ALSO log to global developer persona database
      try {
        developerDB.logAgentInteraction({
          timestamp,
          project: projectName,
          agent_name: agent,
          event_type: eventName,
          file_path: file,
          lines_changed,
          message,
          session_id: SESSION_ID,
          prompt_type: metadata?.prompt_type,
          metadata: JSON.stringify(metadata)
        });
      } catch (devDbError) {
        console.error('❌ Failed to log to developer DB:', devDbError.message);
      }

      // Update agent registry
      if (!agentRegistry.has(agent)) {
        agentRegistry.set(agent, {
          agent_name: agent,
          agent_type: agent,
          is_running: true,
          last_seen: timestamp,
          models_available: [],
          requests_handled: 0,
          errors: 0,
          color: getAgentColor(agent)
        });
      }

      const agentStatus = agentRegistry.get(agent);
      agentStatus.last_seen = timestamp;
      agentStatus.requests_handled++;
      agentStatus.is_running = true;

      // Evaluate triggers (only if trigger engine is initialized)
      if (triggerEngine) {
        const triggerEvent = {
          file: file,
          agent: agent,
          event_type: eventName,
          lines_changed: lines_changed,
          duration_ms: duration_ms,
          project: projectName
        };
        triggerEngine.evaluate(triggerEvent);
      }

      logger.debug(`📡 [${projectName}] Telemetry: ${agent} - ${eventName} - ${message}`);

      // Emit real-time event via WebSocket (include project)
      io.emit('agent-event', {
        id: eventId,
        timestamp,
        project: projectName,
        agent,
        event_type: eventName,
        file,
        lines_changed,
        duration_ms,
        message,
        metadata
      });

      // Emit file-changed event for Live Activity Stream
      if (file && eventName !== 'session-start' && eventName !== 'session-end') {
        io.emit('file-changed', {
          filepath: file,
          change_type: eventName,
          timestamp,
          project: projectName,
          agent
        });
      }

      // Emit updated agent stats
      io.emit('agent-stats', db.getAgentStats());

      res.json({
        success: true,
        event_id: eventId,
        session_id: SESSION_ID,
        project: projectName
      });
    } catch (error) {
      console.error('❌ Telemetry error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/system-metrics - Get system-wide metrics
  router.get('/system-metrics', (req, res) => {
    try {
      const { limit = 100, offset = 0 } = req.query;

      // Get the raven database
      const ravenDb = projectDatabases.get('raven');
      if (!ravenDb) {
        return res.status(500).json({ error: 'Raven database not found' });
      }

      const stmt = ravenDb.db.prepare(`
        SELECT * FROM raven_metrics
        ORDER BY timestamp DESC
        LIMIT ? OFFSET ?
      `);

      const metrics = stmt.all(parseInt(limit), parseInt(offset));
      res.json(metrics);
    } catch (error) {
      console.error('❌ Get system metrics error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/process-metrics - Get process metrics (all agents)
  router.get('/process-metrics', (req, res) => {
    try {
      const { limit = 100, offset = 0, agent = null } = req.query;

      // Get the raven database
      const ravenDb = projectDatabases.get('raven');
      if (!ravenDb) {
        return res.status(500).json({ error: 'Raven database not found' });
      }

      let query = 'SELECT * FROM process_metrics';
      const params = [];

      if (agent) {
        query += ' WHERE agent_name = ?';
        params.push(agent);
      }

      query += ' ORDER BY timestamp DESC LIMIT ? OFFSET ?';
      params.push(parseInt(limit), parseInt(offset));

      const stmt = ravenDb.db.prepare(query);
      const metrics = stmt.all(...params);

      res.json(metrics);
    } catch (error) {
      console.error('❌ Get process metrics error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/process-metrics/:agent - Get process metrics for specific agent
  router.get('/process-metrics/:agent', (req, res) => {
    try {
      const { agent } = req.params;
      const { limit = 100 } = req.query;

      // Get the raven database
      const ravenDb = projectDatabases.get('raven');
      if (!ravenDb) {
        return res.status(500).json({ error: 'Raven database not found' });
      }

      const metrics = ravenDb.getProcessMetricsByAgent(agent, parseInt(limit));
      res.json(metrics);
    } catch (error) {
      console.error('❌ Get process metrics by agent error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}
