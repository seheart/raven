import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { RavenDB } from './db.js';
import { MetricsCollector } from './metrics-collector.js';
import { TriggerEngine } from './trigger-engine.js';
import { randomUUID } from 'crypto';
import { join } from 'path';

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "http://localhost:5173",
    methods: ["GET", "POST"],
    credentials: true
  },
  allowEIO3: true,
  transports: ['websocket', 'polling']
});
const PORT = 3030;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' })); // Allow large telemetry payloads

// Initialize database (use parent directory since we're in backend/)
const DB_PATH = join(process.cwd(), '..', '.raven', 'db', 'raven.db');
const RAVEN_DIR = join(process.cwd(), '..', '.raven');
const db = new RavenDB(DB_PATH);

// Session ID (generated once per server start)
const SESSION_ID = randomUUID();

// Initialize metrics collector (io will be set later after it's created)
let metricsCollector;

// Initialize trigger engine (io will be set later)
let triggerEngine;

// In-memory agent registry
const agentRegistry = new Map();

// Agent type color mapping
const AGENT_COLORS = {
  'claude': '#FF6B35',
  'gpt': '#10A37F',
  'gemini': '#4285F4',
  'ollama': '#F39C12',
  'default': '#6b7280'
};

function getAgentColor(agentName) {
  const lowerName = agentName.toLowerCase();
  for (const [key, color] of Object.entries(AGENT_COLORS)) {
    if (lowerName.includes(key)) return color;
  }
  return AGENT_COLORS.default;
}

// ==================== Telemetry Endpoint ====================

app.post('/telemetry', (req, res) => {
  try {
    const {
      agent,
      event,
      file,
      lines_changed,
      duration_ms,
      message,
      metadata,
      auth_token
    } = req.body;

    // Validate required fields
    if (!agent || !event || !message) {
      return res.status(400).json({ error: 'Missing required fields: agent, event, message' });
    }

    const timestamp = new Date().toISOString();

    // Insert into database
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

    // Update agent registry
    if (!agentRegistry.has(agent)) {
      agentRegistry.set(agent, {
        agent_name: agent,
        agent_type: agent, // Simplified - could parse this better
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

    // Evaluate triggers
    const triggerEvent = {
      file: file,
      agent: agent,
      event_type: event,
      lines_changed: lines_changed,
      duration_ms: duration_ms
    };
    triggerEngine.evaluate(triggerEvent);

    console.log(`📡 Telemetry: ${agent} - ${event} - ${message}`);

    // Emit real-time event via WebSocket
    io.emit('agent-event', {
      id: eventId,
      timestamp,
      agent,
      event_type: event,
      file,
      lines_changed,
      duration_ms,
      message,
      metadata
    });

    // Emit updated agent stats
    io.emit('agent-stats', db.getAgentStats());

    res.json({
      success: true,
      event_id: eventId,
      session_id: SESSION_ID
    });
  } catch (error) {
    console.error('❌ Telemetry error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ==================== Dashboard API ====================

app.get('/api/session-id', (req, res) => {
  res.json(SESSION_ID);
});

app.get('/api/dashboard-stats', (req, res) => {
  try {
    const stats = db.getDashboardStats(SESSION_ID);
    stats.total_agents = agentRegistry.size;
    res.json(stats);
  } catch (error) {
    console.error('❌ Dashboard stats error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/top-modified-files', (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const files = db.getTopModifiedFiles(SESSION_ID, limit);
    res.json(files);
  } catch (error) {
    console.error('❌ Top files error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/longest-edits', (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const edits = db.getLongestEdits(limit);
    res.json(edits);
  } catch (error) {
    console.error('❌ Longest edits error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/agents-status', (req, res) => {
  try {
    const now = new Date();
    const agents = Array.from(agentRegistry.values()).map(agent => {
      // Mark agent as not running if last seen > 30 seconds ago
      const lastSeen = new Date(agent.last_seen);
      const secondsSinceLastSeen = (now - lastSeen) / 1000;

      return {
        ...agent,
        is_running: secondsSinceLastSeen < 30
      };
    });

    res.json(agents);
  } catch (error) {
    console.error('❌ Agents status error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ==================== Agent Events API ====================

app.get('/api/agent-events', (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;
    const events = db.getRecentAgentEvents(limit);
    res.json(events);
  } catch (error) {
    console.error('❌ Agent events error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/events-by-agent/:agent', (req, res) => {
  try {
    const { agent } = req.params;
    const limit = parseInt(req.query.limit) || 100;
    const events = db.getEventsByAgent(agent, limit);
    res.json(events);
  } catch (error) {
    console.error('❌ Events by agent error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/agent-stats', (req, res) => {
  try {
    const stats = db.getAgentStats();
    res.json(stats);
  } catch (error) {
    console.error('❌ Agent stats error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ==================== System Metrics API ====================

app.get('/api/system-metrics', (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;
    const metrics = db.getRecentSystemMetrics(limit);
    res.json(metrics);
  } catch (error) {
    console.error('❌ System metrics error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/process-metrics/:agent', (req, res) => {
  try {
    const { agent } = req.params;
    const limit = parseInt(req.query.limit) || 100;
    const metrics = db.getProcessMetricsByAgent(agent, limit);
    res.json(metrics);
  } catch (error) {
    console.error('❌ Process metrics error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/metrics-stats', (req, res) => {
  try {
    const { start_time, end_time } = req.query;

    if (!start_time || !end_time) {
      return res.status(400).json({ error: 'start_time and end_time are required' });
    }

    const stats = db.getMetricsStats(start_time, end_time);
    res.json(stats);
  } catch (error) {
    console.error('❌ Metrics stats error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/performance-correlations', (req, res) => {
  try {
    const time_window_seconds = parseInt(req.query.time_window_seconds) || 5;
    const correlations = db.correlateEventsWithMetrics(time_window_seconds);
    res.json(correlations);
  } catch (error) {
    console.error('❌ Performance correlations error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ==================== File Events API ====================

app.get('/api/tracked-files', (req, res) => {
  try {
    const files = db.getTrackedFiles();
    res.json(files);
  } catch (error) {
    console.error('❌ Tracked files error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/events-by-session/:sessionId', (req, res) => {
  try {
    const { sessionId } = req.params;
    const events = db.getEventsBySession(sessionId);
    res.json(events);
  } catch (error) {
    console.error('❌ Events by session error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ==================== Custom Triggers API ====================

app.get('/api/triggers-config', (req, res) => {
  try {
    const triggers = triggerEngine.getTriggersConfig();
    res.json(triggers);
  } catch (error) {
    console.error('❌ Triggers config error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/triggered-events', (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;
    const events = triggerEngine.getTriggeredEvents(limit);
    res.json(events);
  } catch (error) {
    console.error('❌ Triggered events error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/trigger-stats', (req, res) => {
  try {
    const stats = triggerEngine.getTriggerStats();
    res.json(stats);
  } catch (error) {
    console.error('❌ Trigger stats error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/triggers-reload', (req, res) => {
  try {
    const message = triggerEngine.reloadConfig();
    res.json({ message });
  } catch (error) {
    console.error('❌ Triggers reload error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/triggers-clear-cooldowns', (req, res) => {
  try {
    const message = triggerEngine.clearCooldowns();
    res.json({ message });
  } catch (error) {
    console.error('❌ Clear cooldowns error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ==================== Health Check ====================

app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    session_id: SESSION_ID,
    uptime: process.uptime(),
    active_agents: agentRegistry.size,
    database: DB_PATH
  });
});

// ==================== WebSocket Connections ====================

io.on('connection', (socket) => {
  console.log('🔌 WebSocket client connected:', socket.id);

  socket.on('disconnect', () => {
    console.log('🔌 WebSocket client disconnected:', socket.id);
  });
});

// Export io for use in other modules
export { io };

// Start server
httpServer.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════════╗
║           🐦‍⬛ Raven Backend Server              ║
╠════════════════════════════════════════════════╣
║  Port:       ${PORT}                              ║
║  WebSocket:  ✅ Enabled                         ║
║  Session:    ${SESSION_ID}     ║
║  Database:   ${DB_PATH.slice(-30).padEnd(30)} ║
║  Status:     ✅ Ready to receive telemetry     ║
╚════════════════════════════════════════════════╝
  `);

  // Initialize trigger engine with io instance
  triggerEngine = new TriggerEngine(RAVEN_DIR, io);

  // Initialize metrics collector with io instance
  metricsCollector = new MetricsCollector(db, SESSION_ID, io);

  // Start real-time metrics collection
  metricsCollector.start();
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down Raven backend...');
  metricsCollector.stop();
  db.close();
  process.exit(0);
});
