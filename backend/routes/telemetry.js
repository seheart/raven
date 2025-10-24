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
      const { agent, event, file, lines_changed, duration_ms, message, metadata, project } = req.body;

      // Validate required fields
      if (!agent || !event || !message) {
        return res.status(400).json({ error: 'Missing required fields: agent, event, message' });
      }

      // Validate field types and sanitize
      if (typeof agent !== 'string' || agent.length > 100) {
        return res.status(400).json({ error: 'Invalid agent: must be string ≤100 chars' });
      }
      if (typeof event !== 'string' || event.length > 100) {
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
        event,
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
          event_type: event,
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
          event_type: event,
          lines_changed: lines_changed,
          duration_ms: duration_ms,
          project: projectName
        };
        triggerEngine.evaluate(triggerEvent);
      }

      logger.debug(`📡 [${projectName}] Telemetry: ${agent} - ${event} - ${message}`);

      // Emit real-time event via WebSocket (include project)
      io.emit('agent-event', {
        id: eventId,
        timestamp,
        project: projectName,
        agent,
        event_type: event,
        file,
        lines_changed,
        duration_ms,
        message,
        metadata
      });

      // Emit file-changed event for Live Activity Stream
      if (file && event !== 'session-start' && event !== 'session-end') {
        io.emit('file-changed', {
          filepath: file,
          change_type: event,
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

  return router;
}
