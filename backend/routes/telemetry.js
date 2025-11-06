import { Router } from 'express';
import { logger } from '../utils/logger.js';
import { LIMITS } from '../config/constants.js';

// In-memory buffer for telemetry events when database is unavailable
const telemetryBuffer = [];
const MAX_BUFFER_SIZE = LIMITS.TELEMETRY.MAX_BUFFER_SIZE;

/**
 * Drain buffered telemetry events to database
 * @param {object} db - Database instance
 * @param {string} projectName - Project name
 * @param {string} SESSION_ID - Session ID
 */
function drainTelemetryBuffer(db, projectName, SESSION_ID) {
  if (telemetryBuffer.length === 0) return;

  logger.info(`Draining ${telemetryBuffer.length} buffered telemetry events to database`);
  let drained = 0;
  let failed = 0;

  while (telemetryBuffer.length > 0) {
    const event = telemetryBuffer.shift();
    try {
      db.insertAgentEvent(
        event.timestamp,
        event.agent,
        event.eventName,
        event.file,
        event.lines_changed,
        event.duration_ms,
        event.message,
        event.metadata,
        SESSION_ID,
        projectName
      );
      drained++;
    } catch (error) {
      logger.error('Failed to drain buffered event:', error);
      failed++;
      // Stop draining if database is still having issues
      if (failed > 5) {
        logger.warn('Too many failures draining buffer, stopping');
        break;
      }
    }
  }

  if (drained > 0) {
    logger.info(`Successfully drained ${drained} buffered events, ${failed} failed`);
  }
}

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
    availableProjects = [],
    SESSION_ID = null,
    activeProject = null,
    agentRegistry = new Map(),
    enforceAgentRegistryLimit = () => {},
    getAgentColor = () => '#3498db',
    triggerEngine = null,
    io = { emit: () => {} }
  } = deps;

  // POST /telemetry - Receive telemetry data from agents
  router.post('/', (req, res) => {
    try {
      // Support both 'event' and 'event_type' for backwards compatibility
      const {
        agent,
        event,
        event_type,
        file,
        lines_changed,
        duration_ms,
        message,
        metadata,
        project
      } = req.body;
      const eventName = event || event_type;

      // Validate required fields
      if (!agent || !eventName || !message) {
        return res
          .status(400)
          .json({ error: 'Missing required fields: agent, event/event_type, message' });
      }

      // Validate field types and sanitize
      if (typeof agent !== 'string' || agent.length > LIMITS.TELEMETRY.AGENT_NAME_MAX_LENGTH) {
        return res
          .status(400)
          .json({
            error: `Invalid agent: must be string ≤${LIMITS.TELEMETRY.AGENT_NAME_MAX_LENGTH} chars`
          });
      }
      if (
        typeof eventName !== 'string' ||
        eventName.length > LIMITS.TELEMETRY.EVENT_NAME_MAX_LENGTH
      ) {
        return res
          .status(400)
          .json({
            error: `Invalid event: must be string ≤${LIMITS.TELEMETRY.EVENT_NAME_MAX_LENGTH} chars`
          });
      }
      if (typeof message !== 'string' || message.length > LIMITS.TELEMETRY.MESSAGE_MAX_LENGTH) {
        return res
          .status(400)
          .json({
            error: `Invalid message: must be string ≤${LIMITS.TELEMETRY.MESSAGE_MAX_LENGTH} chars`
          });
      }
      if (file !== undefined && typeof file !== 'string') {
        return res.status(400).json({ error: 'Invalid file: must be string' });
      }
      if (
        lines_changed !== undefined &&
        (typeof lines_changed !== 'number' ||
          lines_changed < 0 ||
          lines_changed > LIMITS.TELEMETRY.LINES_CHANGED_MAX)
      ) {
        return res
          .status(400)
          .json({
            error: `Invalid lines_changed: must be number 0-${LIMITS.TELEMETRY.LINES_CHANGED_MAX}`
          });
      }
      if (
        duration_ms !== undefined &&
        (typeof duration_ms !== 'number' ||
          duration_ms < 0 ||
          duration_ms > LIMITS.TELEMETRY.DURATION_MAX_MS)
      ) {
        return res
          .status(400)
          .json({
            error: `Invalid duration_ms: must be number 0-${LIMITS.TELEMETRY.DURATION_MAX_MS} (1 hour max)`
          });
      }

      const timestamp = new Date().toISOString();

      // Determine which project this telemetry is for
      let projectName = project; // Use explicit project if provided
      if (!projectName) {
        if (activeProject) {
          // Use activeProject from dependencies
          projectName = activeProject;
        } else if (availableProjects && availableProjects.length > 0) {
          // Default to 'raven' if it exists, otherwise first project
          const ravenProject = availableProjects.find(p => p.name === 'raven' || p === 'raven');
          projectName = ravenProject
            ? ravenProject.name || ravenProject
            : availableProjects[0].name || availableProjects[0];
        }
      }

      // Get project database (or use first available)
      const db = projectName
        ? projectDatabases.get(projectName)
        : projectDatabases.values().next().value;

      // Validate we have both database and project name
      if (!db || !projectName) {
        // Buffer the event if database is unavailable
        if (telemetryBuffer.length < MAX_BUFFER_SIZE) {
          telemetryBuffer.push({
            timestamp,
            agent,
            eventName,
            file,
            lines_changed,
            duration_ms,
            message,
            metadata
          });
          logger.warn(
            `Database unavailable, buffering telemetry event (${telemetryBuffer.length}/${MAX_BUFFER_SIZE})`
          );
          return res.json({
            success: true,
            buffered: true,
            message: 'Event buffered - will be persisted when database recovers'
          });
        } else {
          logger.error('Database unavailable and telemetry buffer is full');
          return res.status(503).json({
            error: 'Database unavailable and buffer full',
            hint: 'Ensure at least one project is initialized',
            retryAfter: 5000
          });
        }
      }

      // Try to drain any buffered events now that database is available
      if (telemetryBuffer.length > 0) {
        setImmediate(() => drainTelemetryBuffer(db, projectName, SESSION_ID));
      }

      // Insert into project-specific database
      let eventId;
      try {
        eventId = db.insertAgentEvent(
          timestamp,
          agent,
          eventName,
          file,
          lines_changed,
          duration_ms,
          message,
          metadata,
          SESSION_ID,
          projectName
        );
      } catch (dbError) {
        logger.error('Failed to insert agent event:', dbError);

        // Buffer the event on database error
        if (telemetryBuffer.length < MAX_BUFFER_SIZE) {
          telemetryBuffer.push({
            timestamp,
            agent,
            eventName,
            file,
            lines_changed,
            duration_ms,
            message,
            metadata
          });
          return res.json({
            success: true,
            buffered: true,
            message: 'Event buffered due to database error'
          });
        }

        return res.status(503).json({
          error: 'Database temporarily unavailable',
          retryAfter: 5000
        });
      }

      // ALSO log to global developer persona database (if available)
      if (developerDB && developerDB.logAgentInteraction) {
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
          logger.error('Failed to log to developer DB', { error: devDbError });
        }
      }

      // Update agent registry (if available and is a Map)
      if (agentRegistry && typeof agentRegistry.has === 'function') {
        // Enforce size limit before adding new agents
        if (!agentRegistry.has(agent)) {
          if (typeof enforceAgentRegistryLimit === 'function') {
            enforceAgentRegistryLimit();
          }

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
        if (agentStatus) {
          agentStatus.last_seen = timestamp;
          agentStatus.requests_handled = (agentStatus.requests_handled || 0) + 1;
          agentStatus.is_running = true;
        }
      } else if (agentRegistry && typeof agentRegistry.registerAgent === 'function') {
        // Support test mock style with registerAgent function
        agentRegistry.registerAgent(agent, {
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

      // Evaluate triggers (only if trigger engine is initialized)
      if (triggerEngine && triggerEngine.evaluateTriggers) {
        try {
          const triggerEvent = {
            file: file,
            agent: agent,
            event_type: eventName,
            lines_changed: lines_changed,
            duration_ms: duration_ms,
            project: projectName
          };
          triggerEngine.evaluateTriggers(triggerEvent);
        } catch (triggerError) {
          logger.error('Failed to evaluate triggers', { error: triggerError });
        }
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
      logger.error('Telemetry error', { error: error.message || error, stack: error.stack });
      res
        .status(500)
        .json({ error: error.message || 'Internal server error', details: String(error) });
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
      logger.error('Get system metrics error', { error });
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
      logger.error('Get process metrics error', { error });
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
      logger.error('Get process metrics by agent error', { error });
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}
