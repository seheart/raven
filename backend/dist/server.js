/**
 * Raven Server - TypeScript implementation with modular architecture
 *
 * Fully typed server integrating all Raven modules:
 * - EventBus for event-driven architecture
 * - FileWatcher for file system monitoring
 * - GitMonitor for repository tracking
 * - TelemetryCollector for system metrics
 * - TriggerEngine for custom alerts
 * - RavenDB for persistence
 */
import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { randomUUID } from 'crypto';
import { join, basename, dirname, resolve } from 'path';
import fs from 'fs/promises';
// Import TypeScript modules
import { RavenDB } from './db.js';
import { MetricsCollector } from './metrics-collector.js';
import { TriggerEngine } from './trigger-engine.js';
import { EventBus, FileWatcher, GitMonitor, getDiff } from './modules/index.js';
// ==================== Configuration ====================
const app = express();
const httpServer = createServer(app);
const io = new SocketIOServer(httpServer, {
    cors: {
        origin: 'http://localhost:5173',
        methods: ['GET', 'POST'],
        credentials: true
    },
    allowEIO3: true,
    transports: ['websocket', 'polling']
});
const PORT = 3030;
// Paths
const RAVEN_DIR = join(process.cwd(), '..', '.raven');
const WATCH_PATH = join(process.cwd(), '..', 'test_workspace');
const SNAPSHOTS_DIR = join(RAVEN_DIR, 'snapshots');
const DB_PATH = join(RAVEN_DIR, 'db', 'raven.db');
// Extract project name from watch path
const PROJECT_NAME = basename(WATCH_PATH);
// Session ID
const SESSION_ID = randomUUID();
// ==================== Middleware ====================
app.use(cors());
app.use(express.json({ limit: '50mb' }));
// Rate limiting configuration
const generalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per windowMs
    message: { error: 'Too many requests, please try again later' },
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});
const strictLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10, // Limit each IP to 10 requests per windowMs for expensive operations
    message: { error: 'Too many requests, please try again later' },
    standardHeaders: true,
    legacyHeaders: false,
});
// Apply general rate limiter to all API routes
app.use('/api/', generalLimiter);
// ==================== Initialize Services ====================
const db = new RavenDB(DB_PATH);
const metricsCollector = new MetricsCollector(db, SESSION_ID, io);
const triggerEngine = new TriggerEngine(RAVEN_DIR, io);
const fileWatcher = new FileWatcher({
    watchPath: WATCH_PATH,
    ignored: [
        '**/node_modules/**',
        '**/.git/**',
        '**/target/**',
        '**/.raven/**',
        '**/*.log',
        '**/dist/**'
    ]
});
const gitMonitor = new GitMonitor({
    repoPath: WATCH_PATH,
    pollIntervalMs: 5000,
    enableAutoPoll: false // Manual polling on file changes
});
const agentRegistry = new Map();
const AGENT_COLORS = {
    claude: '#FF6B35',
    gpt: '#10A37F',
    gemini: '#4285F4',
    ollama: '#F39C12',
    default: '#6b7280'
};
function getAgentColor(agentName) {
    const lowerName = agentName.toLowerCase();
    for (const [key, color] of Object.entries(AGENT_COLORS)) {
        if (lowerName.includes(key))
            return color;
    }
    return AGENT_COLORS.default;
}
// ==================== EventBus Listeners ====================
/**
 * Handle file change events
 */
EventBus.onFileEvent(async (event) => {
    try {
        // Generate diff if this is a change event and we have old content
        let diff = null;
        const oldContent = fileWatcher.getCachedContent(join(WATCH_PATH, event.path));
        if (event.type === 'change' && oldContent && event.content) {
            diff = getDiff(oldContent, event.content)
                .map(d => `${d.added ? '+' : d.removed ? '-' : ' '}${d.value}`)
                .join('');
        }
        // Insert into database
        const eventId = db.insertEvent(new Date(event.ts).toISOString(), event.path, event.type, diff, 0, // CPU will be added later
        0, // Memory will be added later
        SESSION_ID, event.hash, event.size, PROJECT_NAME);
        // Save snapshot
        if (event.content && event.type !== 'unlink') {
            await saveSnapshot(event.path, event.content);
        }
        console.log(`📁 File ${event.type}: ${event.path} (ID: ${eventId})`);
        // Emit to WebSocket
        io.emit('file-changed', {
            id: eventId,
            timestamp: new Date(event.ts).toISOString(),
            filepath: event.path,
            change_type: event.type,
            event_size: event.size,
            file_hash: event.hash
        });
        // Check triggers
        triggerEngine.evaluate({
            file: event.path,
            event_type: event.type,
            lines_changed: diff ? diff.split('\n').length : 0,
            event_size: event.size
        });
        // Check git status if code file changed
        if (event.path.match(/\.(js|ts|jsx|tsx|py|java|go|rs|c|cpp|h|hpp)$/)) {
            await gitMonitor.checkStatus();
        }
    }
    catch (error) {
        console.error('❌ Error handling file event:', error);
    }
});
/**
 * Handle git status events
 */
EventBus.onGitStatus((status) => {
    console.log(`🔀 Git: ${status.branch} (${status.modified.length} modified, ${status.created.length} created, ${status.deleted.length} deleted)`);
    io.emit('git-status', status);
});
/**
 * Handle telemetry events (handled by MetricsCollector)
 */
// Telemetry is automatically handled by MetricsCollector listening to EventBus
/**
 * Handle trigger fired events
 */
EventBus.onTriggerFired((trigger) => {
    console.log(`🔔 Trigger fired: ${trigger.ruleName} - ${trigger.message}`);
});
// ==================== Helper Functions ====================
/**
 * Save file snapshot
 */
async function saveSnapshot(filepath, content) {
    try {
        const timestamp = Date.now();
        const snapshotName = `${filepath.replace(/\//g, '_')}_${timestamp}`;
        const snapshotPath = join(SNAPSHOTS_DIR, snapshotName);
        await fs.mkdir(SNAPSHOTS_DIR, { recursive: true });
        await fs.writeFile(snapshotPath, content, 'utf8');
        console.log(`💾 Snapshot saved: ${snapshotName}`);
    }
    catch (error) {
        console.error('❌ Snapshot save error:', error);
    }
}
// ==================== REST API Endpoints ====================
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        session_id: SESSION_ID,
        uptime: process.uptime(),
        active_agents: agentRegistry.size,
        modules: {
            watcher: fileWatcher.isRunning(),
            git: gitMonitor.isRunning(),
            metrics: metricsCollector.isCollectorRunning()
        },
        database: DB_PATH
    });
});
app.get('/api/session-id', (req, res) => {
    res.json({ session_id: SESSION_ID });
});
app.get('/api/dashboard-stats', (req, res) => {
    try {
        const stats = db.getDashboardStats(SESSION_ID);
        stats.total_agents = agentRegistry.size;
        res.json(stats);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
app.get('/api/top-modified-files', (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 10;
        const files = db.getTopModifiedFiles(SESSION_ID, limit);
        res.json(files);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
app.get('/api/longest-edits', (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 10;
        const edits = db.getLongestEdits(limit);
        res.json(edits);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// ==================== Agents ====================
app.get('/api/agents-status', (req, res) => {
    try {
        const now = new Date();
        const agents = Array.from(agentRegistry.values()).map(agent => {
            const lastSeen = new Date(agent.last_seen);
            const secondsSinceLastSeen = (now.getTime() - lastSeen.getTime()) / 1000;
            return {
                ...agent,
                is_running: secondsSinceLastSeen < 30
            };
        });
        res.json(agents);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
app.get('/api/agent-events', (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 100;
        const startTime = req.query.start_time;
        const endTime = req.query.end_time;
        // Build query with optional time filtering
        let query = `
      SELECT id, timestamp, agent, event_type, file, lines_changed, duration_ms, message, metadata
      FROM agent_events
    `;
        const params = [];
        if (startTime && endTime) {
            query += ' WHERE timestamp BETWEEN ? AND ?';
            params.push(startTime, endTime);
        }
        else if (startTime) {
            query += ' WHERE timestamp >= ?';
            params.push(startTime);
        }
        else if (endTime) {
            query += ' WHERE timestamp <= ?';
            params.push(endTime);
        }
        query += ' ORDER BY timestamp DESC LIMIT ?';
        params.push(limit);
        const events = db.db.prepare(query).all(...params);
        res.json(events);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
app.get('/api/events-by-agent/:agent', (req, res) => {
    try {
        const { agent } = req.params;
        const limit = parseInt(req.query.limit) || 100;
        const events = db.getEventsByAgent(agent, limit);
        res.json(events);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
app.get('/api/agent-stats', (req, res) => {
    try {
        const stats = db.getAgentStats();
        res.json(stats);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// ==================== File Events ====================
app.get('/api/file-events', (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 100;
        const includeDiff = req.query.diff === 'true';
        const startTime = req.query.start_time;
        const endTime = req.query.end_time;
        // Build query with optional time filtering
        const fields = includeDiff
            ? 'id, timestamp, filepath, change_type, event_size, file_hash, cpu, mem, diff, project_name'
            : 'id, timestamp, filepath, change_type, event_size, file_hash, cpu, mem, project_name';
        let query = `SELECT ${fields} FROM events`;
        const params = [];
        if (startTime && endTime) {
            query += ' WHERE timestamp BETWEEN ? AND ?';
            params.push(startTime, endTime);
        }
        else if (startTime) {
            query += ' WHERE timestamp >= ?';
            params.push(startTime);
        }
        else if (endTime) {
            query += ' WHERE timestamp <= ?';
            params.push(endTime);
        }
        query += ' ORDER BY timestamp DESC LIMIT ?';
        params.push(limit);
        const events = db.db.prepare(query).all(...params);
        res.json(events);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
app.get('/api/tracked-files', (req, res) => {
    try {
        const files = db.getTrackedFiles();
        res.json(files);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
app.get('/api/events-by-session/:sessionId', (req, res) => {
    try {
        const { sessionId: sid } = req.params;
        const events = db.getEventsBySession(sid);
        res.json(events);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// ==================== System Metrics ====================
app.get('/api/system-metrics', (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 100;
        const startTime = req.query.start_time;
        const endTime = req.query.end_time;
        // Build query with optional time filtering
        let query = `
      SELECT id, timestamp, cpu_percent, memory_percent, memory_used_mb, memory_total_mb, network_rx_bytes, network_tx_bytes
      FROM raven_metrics
    `;
        const params = [];
        if (startTime && endTime) {
            query += ' WHERE timestamp BETWEEN ? AND ?';
            params.push(startTime, endTime);
        }
        else if (startTime) {
            query += ' WHERE timestamp >= ?';
            params.push(startTime);
        }
        else if (endTime) {
            query += ' WHERE timestamp <= ?';
            params.push(endTime);
        }
        query += ' ORDER BY timestamp DESC LIMIT ?';
        params.push(limit);
        const metrics = db.db.prepare(query).all(...params);
        res.json(metrics);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
app.get('/api/process-metrics/:agent', (req, res) => {
    try {
        const { agent } = req.params;
        const limit = parseInt(req.query.limit) || 100;
        const metrics = db.getProcessMetricsByAgent(agent, limit);
        res.json(metrics);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
app.get('/api/metrics-stats', (req, res) => {
    try {
        const now = Date.now();
        const dayAgo = now - 24 * 60 * 60 * 1000;
        const start_time = req.query.start_time || new Date(dayAgo).toISOString();
        const end_time = req.query.end_time || new Date(now).toISOString();
        const stats = db.getMetricsStats(start_time, end_time);
        res.json(stats);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
app.get('/api/performance-correlations', (req, res) => {
    try {
        const time_window_seconds = parseInt(req.query.time_window_seconds) || 5;
        const correlations = db.correlateEventsWithMetrics(time_window_seconds);
        res.json(correlations);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// ==================== Git ====================
app.get('/api/git/status', async (req, res) => {
    try {
        const status = await gitMonitor.checkStatus();
        res.json(status || gitMonitor.getLastStatus());
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
app.get('/api/git/diff', async (req, res) => {
    try {
        const diff = await gitMonitor.getUncommittedDiff();
        res.json({ diff });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
app.get('/api/git/branches', async (req, res) => {
    try {
        const branches = await gitMonitor.getBranches();
        res.json({ branches });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
app.get('/api/git/history', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 10;
        const commits = await gitMonitor.getCommitHistory(limit);
        res.json({ commits });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// ==================== Triggers ====================
app.get('/api/triggers-config', (req, res) => {
    try {
        const triggers = triggerEngine.getTriggersConfig();
        res.json({ rules: triggers });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
app.get('/api/triggered-events', (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 100;
        const events = triggerEngine.getTriggeredEvents(limit);
        res.json(events);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
app.post('/api/triggers-reload', (req, res) => {
    try {
        const message = triggerEngine.reloadConfig();
        res.json({ message });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
app.get('/api/trigger-stats', (req, res) => {
    try {
        const stats = triggerEngine.getTriggerStats();
        res.json(stats);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
app.post('/api/triggers-clear-cooldowns', (req, res) => {
    try {
        const message = triggerEngine.clearCooldowns();
        res.json({ message });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// ==================== Telemetry ====================
app.post('/telemetry', (req, res) => {
    try {
        const { agent, event, file, lines_changed, duration_ms, message, metadata } = req.body;
        if (!agent || !event || !message) {
            return res.status(400).json({ error: 'Missing required fields: agent, event, message' });
        }
        const timestamp = new Date().toISOString();
        const eventId = db.insertAgentEvent(timestamp, agent, event, file, lines_changed, duration_ms, message, metadata, SESSION_ID);
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
        // Evaluate triggers
        triggerEngine.evaluate({
            file,
            agent,
            event_type: event,
            lines_changed,
            duration_ms
        });
        // Emit via WebSocket
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
        io.emit('agent-stats', db.getAgentStats());
        res.json({ success: true, event_id: eventId, session_id: SESSION_ID });
    }
    catch (error) {
        console.error('❌ Telemetry error:', error);
        res.status(500).json({ error: error.message });
    }
});
// ==================== Multi-Project Health API ====================
app.get('/api/health/projects', (req, res) => {
    try {
        // Query all distinct projects from events table
        const projectsData = db.db.prepare(`
      SELECT
        project_name,
        COUNT(*) as total_events,
        COUNT(CASE WHEN timestamp >= datetime('now', '-24 hours') THEN 1 END) as recent_events,
        MAX(timestamp) as last_activity
      FROM events
      WHERE project_name IS NOT NULL
      GROUP BY project_name
    `).all();
        // Get error counts by project
        const errorsByProject = db.db.prepare(`
      SELECT
        project_name,
        COUNT(*) as error_count
      FROM error_logs
      GROUP BY project_name
    `).all();
        const errorMap = new Map(errorsByProject.map((e) => [e.project_name, e.error_count]));
        // Build health data for each project
        const projects = projectsData.map((proj) => {
            const recentEvents = proj.recent_events || 0;
            const errorCount = errorMap.get(proj.project_name) || 0;
            // Calculate health score (0-100)
            const activityScore = Math.min(recentEvents, 100);
            const errorPenalty = Math.min(errorCount * 5, 50);
            const healthScore = Math.max(activityScore - errorPenalty, 0);
            // Determine status based on last activity
            let status = 'inactive';
            if (proj.last_activity) {
                const lastActivityHours = (Date.now() - new Date(proj.last_activity).getTime()) / (1000 * 60 * 60);
                if (lastActivityHours < 1)
                    status = 'active';
                else if (lastActivityHours < 24)
                    status = 'recent';
                else if (lastActivityHours < 168)
                    status = 'idle';
            }
            return {
                name: proj.project_name,
                status,
                health_score: healthScore,
                recent_events: recentEvents,
                error_count: errorCount,
                last_activity: proj.last_activity
            };
        });
        // If no projects found, add current project
        if (projects.length === 0) {
            projects.push({
                name: PROJECT_NAME,
                status: 'inactive',
                health_score: 0,
                recent_events: 0,
                error_count: 0,
                last_activity: null
            });
        }
        res.json({
            projects,
            total_projects: projects.length,
            active_projects: projects.filter((p) => p.status === 'active').length,
            recent_projects: projects.filter((p) => p.status === 'recent').length
        });
    }
    catch (error) {
        console.error('❌ Multi-project health error:', error);
        res.status(500).json({ error: error.message });
    }
});
// ==================== Anomaly Detection API ====================
app.get('/api/anomalies/detect', (req, res) => {
    try {
        const lookbackHours = parseInt(req.query.hours) || 24;
        const threshold = parseFloat(req.query.threshold) || 2.0;
        const now = Date.now();
        const lookbackTime = new Date(now - (lookbackHours * 60 * 60 * 1000)).toISOString();
        // Calculate baseline metrics
        const baseline = db.db.prepare(`
      SELECT
        COUNT(*) as total_events,
        COUNT(*) / ? as avg_per_hour
      FROM events
      WHERE timestamp >= ?
    `).get(lookbackHours, lookbackTime);
        // Detect spikes - hourly event counts
        const hourlyEvents = db.db.prepare(`
      SELECT
        strftime('%Y-%m-%d %H:00:00', timestamp) as hour,
        COUNT(*) as count
      FROM events
      WHERE timestamp >= ?
      GROUP BY hour
      ORDER BY hour DESC
    `).all(lookbackTime);
        const counts = hourlyEvents.map((h) => h.count);
        const avgCount = counts.reduce((a, b) => a + b, 0) / counts.length || 1;
        const stdDev = Math.sqrt(counts.reduce((sum, c) => sum + Math.pow(c - avgCount, 2), 0) / counts.length);
        const anomalies = [];
        // Detect event spikes
        hourlyEvents.forEach((hour) => {
            if (hour.count > avgCount + (threshold * stdDev)) {
                anomalies.push({
                    timestamp: hour.hour,
                    type: 'event_spike',
                    severity: 'warning',
                    message: `Unusually high activity: ${hour.count} events (${Math.round((hour.count - avgCount) / stdDev * 100) / 100}σ above normal)`,
                    details: {
                        event_count: hour.count,
                        baseline: Math.round(avgCount),
                        std_deviations: Math.round((hour.count - avgCount) / stdDev * 100) / 100
                    },
                    icon: '📈'
                });
            }
        });
        // Detect excessive deletions
        const deletions = db.db.prepare(`
      SELECT
        COUNT(*) as count,
        strftime('%Y-%m-%d %H:00:00', timestamp) as hour
      FROM events
      WHERE change_type = 'unlink' AND timestamp >= ?
      GROUP BY hour
      HAVING count > 5
      ORDER BY hour DESC
    `).all(lookbackTime);
        deletions.forEach((del) => {
            anomalies.push({
                timestamp: del.hour,
                type: 'excessive_deletions',
                severity: 'critical',
                message: `High number of file deletions: ${del.count} files removed`,
                details: { deletion_count: del.count },
                icon: '🗑️'
            });
        });
        // Detect hot files (many rapid changes)
        const hotFiles = db.db.prepare(`
      SELECT
        filepath,
        COUNT(*) as count,
        MAX(timestamp) as last_change
      FROM events
      WHERE timestamp >= datetime('now', '-1 hour')
      GROUP BY filepath
      HAVING count > 10
      ORDER BY count DESC
      LIMIT 5
    `).all();
        hotFiles.forEach((file) => {
            anomalies.push({
                timestamp: file.last_change,
                type: 'hot_file',
                severity: 'info',
                message: `Rapidly changing file: ${file.filepath}`,
                details: {
                    filepath: file.filepath,
                    change_count: file.count,
                    period: '1 hour'
                },
                icon: '🔥'
            });
        });
        // Sort by timestamp descending
        anomalies.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        res.json({
            anomalies,
            baseline,
            lookback_hours: lookbackHours,
            threshold
        });
    }
    catch (error) {
        console.error('❌ Anomaly detection error:', error);
        res.status(500).json({ error: error.message });
    }
});
// ==================== Custom Metrics Dashboard API ====================
app.get('/api/metrics/dashboard', (req, res) => {
    try {
        // Total events
        const totalEvents = db.db.prepare(`SELECT COUNT(*) as count FROM events`).get();
        // Events by type
        const eventsByType = db.db.prepare(`
      SELECT change_type, COUNT(*) as count
      FROM events
      GROUP BY change_type
    `).all();
        // Events in last 24h
        const events24h = db.db.prepare(`
      SELECT COUNT(*) as count
      FROM events
      WHERE timestamp >= datetime('now', '-24 hours')
    `).get();
        // Active projects (check if project_name column exists)
        let activeProjects = { count: 1 };
        try {
            activeProjects = db.db.prepare(`
        SELECT COUNT(DISTINCT project_name) as count
        FROM events
        WHERE project_name IS NOT NULL
      `).get();
            if (activeProjects.count === 0)
                activeProjects.count = 1; // Default to 1 if no projects found
        }
        catch (err) {
            // Column doesn't exist in old databases, default to 1
            console.log('⚠️  project_name column not found, using default value');
            activeProjects = { count: 1 };
        }
        // Total files tracked
        const totalFiles = db.db.prepare(`
      SELECT COUNT(DISTINCT filepath) as count
      FROM events
    `).get();
        // Most active file
        const mostActiveFile = db.db.prepare(`
      SELECT filepath, COUNT(*) as count
      FROM events
      GROUP BY filepath
      ORDER BY count DESC
      LIMIT 1
    `).get();
        // Error count (table may not exist)
        let errorCount = { count: 0 };
        try {
            errorCount = db.db.prepare(`
        SELECT COUNT(*) as count
        FROM error_logs
      `).get();
        }
        catch (err) {
            // Table doesn't exist, use default
            errorCount = { count: 0 };
        }
        // Conversation count (table may not exist)
        let conversationCount = { count: 0 };
        try {
            conversationCount = db.db.prepare(`
        SELECT COUNT(*) as count
        FROM conversations
      `).get();
        }
        catch (err) {
            // Table doesn't exist, use default
            conversationCount = { count: 0 };
        }
        // Average events per day (last 7 days)
        const avgPerDay = db.db.prepare(`
      SELECT COUNT(*) / 7.0 as avg
      FROM events
      WHERE timestamp >= datetime('now', '-7 days')
    `).get();
        // Busiest hour of day
        const busiestHour = db.db.prepare(`
      SELECT
        CAST(strftime('%H', timestamp) AS INTEGER) as hour,
        COUNT(*) as count
      FROM events
      GROUP BY hour
      ORDER BY count DESC
      LIMIT 1
    `).get();
        res.json({
            total_events: totalEvents.count || 0,
            events_by_type: eventsByType,
            events_24h: events24h.count || 0,
            active_projects: activeProjects.count || 0,
            total_files: totalFiles.count || 0,
            most_active_file: mostActiveFile || null,
            error_count: errorCount.count || 0,
            conversation_count: conversationCount.count || 0,
            avg_events_per_day: Math.round(avgPerDay.avg || 0),
            busiest_hour: busiestHour ? `${busiestHour.hour}:00` : 'N/A'
        });
    }
    catch (error) {
        console.error('❌ Custom metrics error:', error);
        res.status(500).json({ error: error.message });
    }
});
// ==================== Multi-Project Configuration API ====================
const PROJECTS_CONFIG_PATH = join(RAVEN_DIR, 'projects.json');
const MAX_PROJECTS = 50;
const MAX_PROJECT_NAME_LENGTH = 100;
const MIN_RETENTION_DAYS = 1;
const MAX_RETENTION_DAYS = 365;
const MIN_FILE_SIZE = 0;
const MAX_FILE_SIZE = 100_000_000; // 100MB
// Security: Validate path is within allowed base directory
function isPathAllowed(userPath, basePath) {
    try {
        const resolved = resolve(userPath);
        const base = resolve(basePath);
        return resolved.startsWith(base);
    }
    catch (e) {
        console.error('[isPathAllowed] Error:', e);
        return false;
    }
}
// Security: Validate project name
function validateProjectName(name) {
    if (!name || typeof name !== 'string')
        return false;
    if (name.length > MAX_PROJECT_NAME_LENGTH)
        return false;
    // Allow alphanumeric, spaces, hyphens, underscores
    return /^[a-zA-Z0-9\s\-_]+$/.test(name);
}
// Security: Validate retention days
function validateRetentionDays(days) {
    if (days === null || days === undefined)
        return true; // Optional field
    const num = Number(days);
    return !isNaN(num) && num >= MIN_RETENTION_DAYS && num <= MAX_RETENTION_DAYS;
}
// Security: Validate max file size
function validateMaxFileSize(size) {
    if (size === null || size === undefined)
        return true; // Optional field
    const num = Number(size);
    return !isNaN(num) && num >= MIN_FILE_SIZE && num <= MAX_FILE_SIZE;
}
// Security: Validate ignore patterns
function validateIgnorePatterns(patterns) {
    if (!Array.isArray(patterns))
        return false;
    if (patterns.length > 100)
        return false; // Reasonable limit
    return patterns.every(p => typeof p === 'string' && p.length < 200);
}
// Security: Sanitize project ID
function sanitizeProjectId(id) {
    return id.toLowerCase().replace(/[^a-z0-9\-_]/g, '-').substring(0, 50);
}
// Load projects configuration
async function loadProjectsConfig() {
    try {
        const data = await fs.readFile(PROJECTS_CONFIG_PATH, 'utf-8');
        return JSON.parse(data);
    }
    catch (error) {
        // Return default config if file doesn't exist
        return {
            autoDiscover: true,
            basePath: dirname(RAVEN_DIR),
            projects: []
        };
    }
}
// Save projects configuration
async function saveProjectsConfig(config) {
    await fs.writeFile(PROJECTS_CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');
}
// GET /api/projects - List all configured projects
app.get('/api/projects', async (req, res) => {
    try {
        const config = await loadProjectsConfig();
        // Get database stats for each project
        const projectsWithStats = await Promise.all(config.projects.map(async (project) => {
            const dbPath = join(RAVEN_DIR, 'db', `${project.id}.db`);
            let dbSize = 0;
            let eventCount = 0;
            try {
                const stats = await fs.stat(dbPath);
                dbSize = stats.size;
                // Get event count from database
                const Database = (await import('better-sqlite3')).default;
                const dbConn = new Database(dbPath, { readonly: true });
                const result = dbConn.prepare('SELECT COUNT(*) as count FROM events').get();
                eventCount = result.count;
                dbConn.close();
            }
            catch (err) {
                // Database doesn't exist yet
            }
            return {
                ...project,
                dbSize,
                eventCount
            };
        }));
        res.json({
            ...config,
            projects: projectsWithStats
        });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// POST /api/projects - Add new project
app.post('/api/projects', async (req, res) => {
    try {
        const { name, path, enabled = true, ignorePatterns = [], maxFileSize, retentionDays } = req.body;
        // Validate required fields
        if (!name || !path) {
            return res.status(400).json({ error: 'Name and path are required' });
        }
        // Validate project name
        if (!validateProjectName(name)) {
            return res.status(400).json({ error: 'Invalid project name. Use only alphanumeric characters, spaces, hyphens, and underscores (max 100 chars)' });
        }
        // Validate optional fields
        if (!validateIgnorePatterns(ignorePatterns)) {
            return res.status(400).json({ error: 'Invalid ignore patterns' });
        }
        if (!validateMaxFileSize(maxFileSize)) {
            return res.status(400).json({ error: `Max file size must be between ${MIN_FILE_SIZE} and ${MAX_FILE_SIZE} bytes` });
        }
        if (!validateRetentionDays(retentionDays)) {
            return res.status(400).json({ error: `Retention days must be between ${MIN_RETENTION_DAYS} and ${MAX_RETENTION_DAYS}` });
        }
        const config = await loadProjectsConfig();
        // Check project limit
        if (config.projects.length >= MAX_PROJECTS) {
            return res.status(400).json({ error: `Maximum of ${MAX_PROJECTS} projects allowed` });
        }
        // Security: Validate path is within allowed base directory
        if (!isPathAllowed(path, config.basePath)) {
            return res.status(403).json({ error: 'Path outside allowed directory' });
        }
        // Validate path exists
        try {
            await fs.access(path);
        }
        catch {
            return res.status(400).json({ error: 'Invalid path' });
        }
        // Generate secure ID from path basename
        const id = sanitizeProjectId(basename(path));
        // Check if project already exists
        if (config.projects.some(p => p.id === id)) {
            return res.status(409).json({ error: 'Project already exists' });
        }
        const newProject = {
            id,
            name: name.trim(),
            path,
            enabled: Boolean(enabled),
            ignorePatterns: ignorePatterns || [],
            maxFileSize: maxFileSize ? Number(maxFileSize) : undefined,
            retentionDays: retentionDays ? Number(retentionDays) : undefined
        };
        config.projects.push(newProject);
        await saveProjectsConfig(config);
        res.json({ success: true, project: newProject });
    }
    catch (error) {
        console.error('[POST /api/projects] Error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// PUT /api/projects/:id - Update project settings
app.put('/api/projects/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;
        // Security: Validate ID format
        if (!/^[a-z0-9\-_]+$/.test(id)) {
            return res.status(400).json({ error: 'Invalid project ID' });
        }
        const config = await loadProjectsConfig();
        const projectIndex = config.projects.findIndex(p => p.id === id);
        if (projectIndex === -1) {
            return res.status(404).json({ error: 'Project not found' });
        }
        // Security: Whitelist allowed update fields
        const allowedFields = ['name', 'enabled', 'ignorePatterns', 'maxFileSize', 'retentionDays'];
        const sanitizedUpdates = {};
        for (const field of allowedFields) {
            if (updates[field] !== undefined) {
                // Validate each field
                if (field === 'name') {
                    if (!validateProjectName(updates[field])) {
                        return res.status(400).json({ error: 'Invalid project name' });
                    }
                    sanitizedUpdates[field] = updates[field].trim();
                }
                else if (field === 'enabled') {
                    sanitizedUpdates[field] = Boolean(updates[field]);
                }
                else if (field === 'ignorePatterns') {
                    if (!validateIgnorePatterns(updates[field])) {
                        return res.status(400).json({ error: 'Invalid ignore patterns' });
                    }
                    sanitizedUpdates[field] = updates[field];
                }
                else if (field === 'maxFileSize') {
                    if (!validateMaxFileSize(updates[field])) {
                        return res.status(400).json({ error: `Max file size must be between ${MIN_FILE_SIZE} and ${MAX_FILE_SIZE} bytes` });
                    }
                    sanitizedUpdates[field] = Number(updates[field]);
                }
                else if (field === 'retentionDays') {
                    if (!validateRetentionDays(updates[field])) {
                        return res.status(400).json({ error: `Retention days must be between ${MIN_RETENTION_DAYS} and ${MAX_RETENTION_DAYS}` });
                    }
                    sanitizedUpdates[field] = Number(updates[field]);
                }
            }
        }
        // Update project with sanitized fields only
        config.projects[projectIndex] = {
            ...config.projects[projectIndex],
            ...sanitizedUpdates,
            id // Preserve ID (immutable)
        };
        await saveProjectsConfig(config);
        res.json({ success: true, project: config.projects[projectIndex] });
    }
    catch (error) {
        console.error('[PUT /api/projects/:id] Error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// DELETE /api/projects/:id - Remove project
app.delete('/api/projects/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const deleteDatabase = req.query.deleteDb === 'true';
        // Security: Validate ID format to prevent path traversal
        if (!/^[a-z0-9\-_]+$/.test(id)) {
            return res.status(400).json({ error: 'Invalid project ID' });
        }
        const config = await loadProjectsConfig();
        const projectIndex = config.projects.findIndex(p => p.id === id);
        if (projectIndex === -1) {
            return res.status(404).json({ error: 'Project not found' });
        }
        // Remove from config
        config.projects.splice(projectIndex, 1);
        await saveProjectsConfig(config);
        // Optionally delete database
        if (deleteDatabase) {
            // Security: Sanitize ID and construct safe path
            const safeId = sanitizeProjectId(id);
            const dbPath = join(RAVEN_DIR, 'db', `${safeId}.db`);
            // Security: Verify path is within database directory
            const dbDir = join(RAVEN_DIR, 'db');
            if (!dbPath.startsWith(dbDir)) {
                console.error('[DELETE /api/projects/:id] Path traversal attempt:', dbPath);
                return res.status(403).json({ error: 'Forbidden' });
            }
            try {
                await fs.unlink(dbPath);
                await fs.unlink(`${dbPath}-shm`).catch(() => { });
                await fs.unlink(`${dbPath}-wal`).catch(() => { });
            }
            catch (err) {
                // Database file doesn't exist, that's fine
                console.log('[DELETE /api/projects/:id] Database file not found:', dbPath);
            }
        }
        res.json({ success: true });
    }
    catch (error) {
        console.error('[DELETE /api/projects/:id] Error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// POST /api/projects/discover - Discover projects in base path
// Apply strict rate limiter for expensive operations
app.post('/api/projects/discover', strictLimiter, async (req, res) => {
    try {
        const config = await loadProjectsConfig();
        const requestedBasePath = req.body.basePath;
        // Use config basePath if not provided
        let basePath = config.basePath;
        // If user provides basePath, validate it
        if (requestedBasePath) {
            // Security: Validate requested path is within or equals config basePath
            if (!isPathAllowed(requestedBasePath, config.basePath) && requestedBasePath !== config.basePath) {
                return res.status(403).json({ error: 'Base path outside allowed directory' });
            }
            basePath = requestedBasePath;
        }
        // Security: Limit discovery depth to prevent filesystem enumeration
        let entries;
        try {
            entries = await fs.readdir(basePath, { withFileTypes: true });
        }
        catch (err) {
            return res.status(400).json({ error: 'Invalid base path' });
        }
        const discovered = [];
        const MAX_DISCOVERIES = 100; // Prevent excessive results
        for (const entry of entries) {
            if (discovered.length >= MAX_DISCOVERIES)
                break;
            if (entry.isDirectory() && !entry.name.startsWith('.')) {
                const projectPath = join(basePath, entry.name);
                // Security: Verify path is safe
                if (!isPathAllowed(projectPath, config.basePath)) {
                    continue;
                }
                const hasGit = await fs.access(join(projectPath, '.git')).then(() => true).catch(() => false);
                const hasPackageJson = await fs.access(join(projectPath, 'package.json')).then(() => true).catch(() => false);
                if (hasGit || hasPackageJson) {
                    const id = sanitizeProjectId(entry.name);
                    // Only add if not already in config
                    if (!config.projects.some(p => p.id === id)) {
                        discovered.push({
                            id,
                            name: entry.name,
                            path: projectPath,
                            enabled: false,
                            ignorePatterns: ['node_modules/**', 'dist/**', '.git/**']
                        });
                    }
                }
            }
        }
        res.json({ discovered, basePath });
    }
    catch (error) {
        console.error('[POST /api/projects/discover] Error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// PUT /api/projects/config - Update global config (autoDiscover, basePath)
app.put('/api/projects/config', async (req, res) => {
    try {
        const { autoDiscover, basePath } = req.body;
        const config = await loadProjectsConfig();
        if (typeof autoDiscover !== 'undefined') {
            config.autoDiscover = autoDiscover;
        }
        if (basePath) {
            config.basePath = basePath;
        }
        await saveProjectsConfig(config);
        res.json({ success: true, config });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// ==================== Global Search API ====================
app.get('/api/search/global', (req, res) => {
    try {
        const query = req.query.q || '';
        const limit = parseInt(req.query.limit) || 100;
        if (query.length < 2) {
            return res.json({ results: [], total: 0, categories: {} });
        }
        const results = [];
        const searchPattern = `%${query}%`;
        // Search file events
        const fileEvents = db.db.prepare(`
      SELECT id, timestamp, filepath as title, change_type as description, project_name
      FROM events
      WHERE filepath LIKE ?
      ORDER BY timestamp DESC
      LIMIT ?
    `).all(searchPattern, limit);
        fileEvents.forEach((e) => {
            results.push({
                type: 'event',
                id: e.id,
                title: e.title,
                description: `${e.description}`,
                timestamp: e.timestamp,
                project_name: e.project_name,
                icon: '📄'
            });
        });
        // Search conversations
        const conversations = db.db.prepare(`
      SELECT id, timestamp, context as title, query as description
      FROM conversations
      WHERE context LIKE ? OR query LIKE ?
      ORDER BY timestamp DESC
      LIMIT ?
    `).all(searchPattern, searchPattern, limit);
        conversations.forEach((c) => {
            results.push({
                type: 'conversation',
                id: c.id,
                title: c.title || 'Conversation',
                description: c.description,
                timestamp: c.timestamp,
                icon: '💬'
            });
        });
        // Search errors
        const errors = db.db.prepare(`
      SELECT id, timestamp, message as title, severity as description, project_name
      FROM error_logs
      WHERE message LIKE ?
      ORDER BY timestamp DESC
      LIMIT ?
    `).all(searchPattern, limit);
        errors.forEach((e) => {
            results.push({
                type: 'error',
                id: e.id,
                title: e.title,
                description: e.description,
                timestamp: e.timestamp,
                project_name: e.project_name,
                icon: '❌'
            });
        });
        // Search notifications
        const notifications = db.db.prepare(`
      SELECT id, timestamp, message as title, severity as description, project_name
      FROM notifications
      WHERE message LIKE ?
      ORDER BY timestamp DESC
      LIMIT ?
    `).all(searchPattern, limit);
        notifications.forEach((n) => {
            results.push({
                type: 'notification',
                id: n.id,
                title: n.title,
                description: n.description,
                timestamp: n.timestamp,
                project_name: n.project_name,
                icon: '🔔'
            });
        });
        // Sort all results by timestamp
        results.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        // Limit total results
        const limitedResults = results.slice(0, limit);
        // Count categories
        const categories = {
            events: results.filter(r => r.type === 'event').length,
            conversations: results.filter(r => r.type === 'conversation').length,
            errors: results.filter(r => r.type === 'error').length,
            notifications: results.filter(r => r.type === 'notification').length
        };
        res.json({
            results: limitedResults,
            total: results.length,
            categories
        });
    }
    catch (error) {
        console.error('❌ Global search error:', error);
        res.status(500).json({ error: error.message });
    }
});
// ==================== Historical Trends API ====================
app.get('/api/trends/historical', (req, res) => {
    try {
        const period = req.query.period || 'hourly';
        const days = parseInt(req.query.days) || 7;
        const startTime = new Date(Date.now() - (days * 24 * 60 * 60 * 1000)).toISOString();
        let groupBy = '';
        switch (period) {
            case 'hourly':
                groupBy = "strftime('%Y-%m-%d %H:00:00', timestamp)";
                break;
            case 'daily':
                groupBy = "strftime('%Y-%m-%d', timestamp)";
                break;
            case 'weekly':
                groupBy = "strftime('%Y-W%W', timestamp)";
                break;
            default:
                groupBy = "strftime('%Y-%m-%d %H:00:00', timestamp)";
        }
        const trends = db.db.prepare(`
      SELECT
        ${groupBy} as period,
        COUNT(*) as event_count,
        SUM(CASE WHEN change_type = 'modified' THEN 1 ELSE 0 END) as modifications,
        SUM(CASE WHEN change_type = 'add' THEN 1 ELSE 0 END) as creations,
        SUM(CASE WHEN change_type = 'unlink' THEN 1 ELSE 0 END) as deletions,
        COUNT(DISTINCT filepath) as unique_files,
        COUNT(DISTINCT project_name) as active_projects
      FROM events
      WHERE timestamp >= ?
      GROUP BY period
      ORDER BY period ASC
    `).all(startTime);
        res.json({
            trends,
            period,
            days,
            start_time: startTime
        });
    }
    catch (error) {
        console.error('❌ Historical trends error:', error);
        res.status(500).json({ error: error.message });
    }
});
// ==================== Performance Metrics API ====================
app.get('/api/metrics/performance', async (req, res) => {
    try {
        const range = req.query.range || '1h';
        // Calculate time range
        let hours = 1;
        if (range === '6h')
            hours = 6;
        else if (range === '24h')
            hours = 24;
        else if (range === '7d')
            hours = 168;
        const startTime = new Date(Date.now() - (hours * 60 * 60 * 1000)).toISOString();
        // Get metrics from database
        const metrics = db.db.prepare(`
      SELECT
        timestamp,
        cpu_percent,
        memory_percent,
        memory_used_mb,
        memory_total_mb
      FROM raven_metrics
      WHERE timestamp >= ?
      ORDER BY timestamp ASC
    `).all(startTime);
        res.json({
            metrics,
            range,
            start_time: startTime
        });
    }
    catch (error) {
        console.error('❌ Performance metrics error:', error);
        res.status(500).json({ error: error.message });
    }
});
// ==================== Storage APIs ====================
app.get('/api/storage', async (req, res) => {
    try {
        const dbDir = join(RAVEN_DIR, 'db');
        const snapshotsDir = join(SNAPSHOTS_DIR);
        // Get all database files
        const databases = [];
        const dbFiles = await fs.readdir(dbDir);
        const dbFilesFiltered = dbFiles.filter(f => f.endsWith('.db'));
        for (const dbFile of dbFilesFiltered) {
            const dbPath = join(dbDir, dbFile);
            const stats = await fs.stat(dbPath);
            const dbName = dbFile.replace('.db', '');
            // Try to get record counts
            let recordCounts = {};
            let tableStats = [];
            try {
                const Database = (await import('better-sqlite3')).default;
                const dbConn = new Database(dbPath, { readonly: true });
                // Get record counts for each table
                const tables = dbConn.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all();
                let totalRecords = 0;
                for (const table of tables) {
                    const count = dbConn.prepare(`SELECT COUNT(*) as count FROM ${table.name}`).get();
                    recordCounts[table.name] = count.count;
                    totalRecords += count.count;
                    // Get table size
                    const sizeQuery = dbConn.prepare('SELECT SUM(pgsize) as size FROM dbstat WHERE name = ?').get(table.name);
                    tableStats.push({
                        name: table.name,
                        records: count.count,
                        size: sizeQuery?.size || 0
                    });
                }
                dbConn.close();
                databases.push({
                    name: dbName,
                    filename: dbFile,
                    size: stats.size,
                    totalRecords,
                    recordCounts,
                    tableStats: tableStats.sort((a, b) => b.size - a.size),
                    modified: stats.mtime,
                    isActive: dbName === 'raven'
                });
            }
            catch (err) {
                databases.push({
                    name: dbName,
                    filename: dbFile,
                    size: stats.size,
                    totalRecords: 0,
                    recordCounts: {},
                    tableStats: [],
                    modified: stats.mtime,
                    isActive: dbName === 'raven',
                    error: 'Failed to read database'
                });
            }
        }
        // Get snapshot directory stats
        const snapshots = [];
        try {
            await fs.access(snapshotsDir);
            const snapshotProjects = await fs.readdir(snapshotsDir);
            for (const project of snapshotProjects) {
                const projectSnapshotPath = join(snapshotsDir, project);
                const stat = await fs.stat(projectSnapshotPath);
                if (stat.isDirectory()) {
                    const files = await fs.readdir(projectSnapshotPath);
                    let totalSize = 0;
                    let oldestFile = null;
                    let newestFile = null;
                    for (const file of files) {
                        const filePath = join(projectSnapshotPath, file);
                        const fileStat = await fs.stat(filePath);
                        totalSize += fileStat.size;
                        if (!oldestFile || fileStat.mtime < oldestFile) {
                            oldestFile = fileStat.mtime;
                        }
                        if (!newestFile || fileStat.mtime > newestFile) {
                            newestFile = fileStat.mtime;
                        }
                    }
                    snapshots.push({
                        project,
                        files: files.length,
                        size: totalSize,
                        oldest: oldestFile,
                        newest: newestFile
                    });
                }
            }
        }
        catch (err) {
            // Snapshots directory doesn't exist, ignore
        }
        // Get total .raven directory size
        const getRavenDirSize = async (dirPath) => {
            let totalSize = 0;
            const items = await fs.readdir(dirPath);
            for (const item of items) {
                const itemPath = join(dirPath, item);
                const stat = await fs.stat(itemPath);
                if (stat.isDirectory()) {
                    totalSize += await getRavenDirSize(itemPath);
                }
                else {
                    totalSize += stat.size;
                }
            }
            return totalSize;
        };
        const totalSize = await getRavenDirSize(RAVEN_DIR);
        // Get other files
        let configSize = 0;
        let triggersLogSize = 0;
        try {
            const configStat = await fs.stat(join(RAVEN_DIR, 'config.toml'));
            configSize = configStat.size;
        }
        catch (err) {
            // File doesn't exist
        }
        try {
            const triggersStat = await fs.stat(join(RAVEN_DIR, 'triggers.log'));
            triggersLogSize = triggersStat.size;
        }
        catch (err) {
            // File doesn't exist
        }
        res.json({
            totalSize,
            databases: databases.sort((a, b) => b.size - a.size),
            snapshots: snapshots.sort((a, b) => b.size - a.size),
            otherFiles: {
                config: configSize,
                triggersLog: triggersLogSize
            },
            ravenDir: RAVEN_DIR,
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        console.error('❌ Error getting storage stats:', error);
        res.status(500).json({ error: 'Failed to get storage statistics' });
    }
});
app.get('/api/storage/export/:dbname', async (req, res) => {
    try {
        const { dbname } = req.params;
        // Validate database name to prevent path traversal
        if (!dbname || dbname.includes('..') || dbname.includes('/') || !dbname.match(/^[a-zA-Z0-9_-]+$/)) {
            return res.status(400).json({ error: 'Invalid database name' });
        }
        const dbPath = join(RAVEN_DIR, 'db', `${dbname}.db`);
        try {
            await fs.access(dbPath);
        }
        catch (err) {
            return res.status(404).json({ error: 'Database not found' });
        }
        // Send the file for download
        res.download(dbPath, `${dbname}_${Date.now()}.db`, (err) => {
            if (err) {
                console.error('❌ Error sending database file:', err);
                if (!res.headersSent) {
                    res.status(500).json({ error: 'Failed to export database' });
                }
            }
        });
    }
    catch (error) {
        console.error('❌ Error exporting database:', error);
        res.status(500).json({ error: 'Failed to export database' });
    }
});
app.post('/api/storage/vacuum/:dbname', async (req, res) => {
    try {
        const { dbname } = req.params;
        // Validate database name
        if (!dbname || dbname.includes('..') || dbname.includes('/') || !dbname.match(/^[a-zA-Z0-9_-]+$/)) {
            return res.status(400).json({ error: 'Invalid database name' });
        }
        const dbPath = join(RAVEN_DIR, 'db', `${dbname}.db`);
        try {
            await fs.access(dbPath);
        }
        catch (err) {
            return res.status(404).json({ error: 'Database not found' });
        }
        // Get size before VACUUM
        const statsBefore = await fs.stat(dbPath);
        const sizeBefore = statsBefore.size;
        // Run VACUUM
        const Database = (await import('better-sqlite3')).default;
        const dbConn = new Database(dbPath);
        dbConn.pragma('wal_checkpoint(TRUNCATE)'); // Checkpoint WAL first
        dbConn.exec('VACUUM');
        dbConn.close();
        // Get size after VACUUM
        const statsAfter = await fs.stat(dbPath);
        const sizeAfter = statsAfter.size;
        const spaceSaved = sizeBefore - sizeAfter;
        res.json({
            success: true,
            message: 'Database optimized successfully',
            sizeBefore,
            sizeAfter,
            spaceSaved,
            percentSaved: sizeBefore > 0 ? ((spaceSaved / sizeBefore) * 100).toFixed(2) : 0
        });
    }
    catch (error) {
        console.error('❌ Error running VACUUM:', error);
        res.status(500).json({ error: 'Failed to optimize database: ' + error.message });
    }
});
app.post('/api/storage/clean/:dbname', async (req, res) => {
    try {
        const { dbname } = req.params;
        const { days } = req.body;
        // Validate database name
        if (!dbname || dbname.includes('..') || dbname.includes('/') || !dbname.match(/^[a-zA-Z0-9_-]+$/)) {
            return res.status(400).json({ error: 'Invalid database name' });
        }
        // Validate days
        const daysNum = parseInt(days);
        if (isNaN(daysNum) || daysNum < 1 || daysNum > 365) {
            return res.status(400).json({ error: 'Days must be between 1 and 365' });
        }
        const dbPath = join(RAVEN_DIR, 'db', `${dbname}.db`);
        try {
            await fs.access(dbPath);
        }
        catch (err) {
            return res.status(404).json({ error: 'Database not found' });
        }
        // Calculate cutoff timestamp
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - daysNum);
        const cutoffTimestamp = cutoffDate.toISOString();
        const Database = (await import('better-sqlite3')).default;
        const dbConn = new Database(dbPath);
        let totalDeleted = 0;
        const deletedPerTable = {};
        // Get all tables
        const tables = dbConn.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all();
        // Delete old records from each table that has a timestamp column
        for (const table of tables) {
            const tableInfo = dbConn.prepare(`PRAGMA table_info(${table.name})`).all();
            const hasTimestamp = tableInfo.some(col => col.name === 'timestamp' || col.name === 'created_at');
            if (hasTimestamp) {
                const timestampCol = tableInfo.find(col => col.name === 'timestamp' || col.name === 'created_at').name;
                // Delete old records
                const deleteStmt = dbConn.prepare(`DELETE FROM ${table.name} WHERE ${timestampCol} < ?`);
                const result = deleteStmt.run(cutoffTimestamp);
                const deleted = result.changes;
                if (deleted > 0) {
                    deletedPerTable[table.name] = deleted;
                    totalDeleted += deleted;
                }
            }
        }
        dbConn.close();
        res.json({
            success: true,
            message: `Deleted ${totalDeleted} records older than ${daysNum} days`,
            totalDeleted,
            deletedPerTable,
            cutoffDate: cutoffTimestamp
        });
    }
    catch (error) {
        console.error('❌ Error cleaning old data:', error);
        res.status(500).json({ error: 'Failed to clean old data: ' + error.message });
    }
});
app.get('/api/storage/retention', async (req, res) => {
    try {
        const retentionPath = join(RAVEN_DIR, 'retention-policy.json');
        try {
            await fs.access(retentionPath);
            const data = await fs.readFile(retentionPath, 'utf-8');
            const policy = JSON.parse(data);
            res.json(policy);
        }
        catch (err) {
            // Return default policy if file doesn't exist
            res.json({
                enabled: false,
                retentionDays: 30,
                autoCleanup: false,
                cleanupInterval: 'weekly'
            });
        }
    }
    catch (error) {
        console.error('❌ Error reading retention policy:', error);
        res.status(500).json({ error: 'Failed to read retention policy' });
    }
});
app.post('/api/storage/retention', async (req, res) => {
    try {
        const policy = req.body;
        // Validate policy
        if (typeof policy.enabled !== 'boolean') {
            return res.status(400).json({ error: 'enabled must be a boolean' });
        }
        const days = parseInt(policy.retentionDays);
        if (isNaN(days) || days < 1 || days > 365) {
            return res.status(400).json({ error: 'retentionDays must be between 1 and 365' });
        }
        const validIntervals = ['daily', 'weekly', 'monthly'];
        if (!validIntervals.includes(policy.cleanupInterval)) {
            return res.status(400).json({ error: 'cleanupInterval must be daily, weekly, or monthly' });
        }
        const retentionPath = join(RAVEN_DIR, 'retention-policy.json');
        await fs.writeFile(retentionPath, JSON.stringify(policy, null, 2), 'utf-8');
        res.json({
            success: true,
            message: 'Retention policy saved successfully'
        });
    }
    catch (error) {
        console.error('❌ Error saving retention policy:', error);
        res.status(500).json({ error: 'Failed to save retention policy' });
    }
});
// ==================== WebSocket ====================
io.on('connection', (socket) => {
    console.log('🔌 WebSocket client connected:', socket.id);
    socket.on('disconnect', () => {
        console.log('🔌 WebSocket client disconnected:', socket.id);
    });
});
// ==================== Server Startup ====================
httpServer.listen(PORT, async () => {
    console.log(`
╔════════════════════════════════════════════════╗
║     Raven Backend (TypeScript)                 ║
╠════════════════════════════════════════════════╣
║  Port:       ${PORT}                              ║
║  Session:    ${SESSION_ID}     ║
║  Watch Path: ${WATCH_PATH.slice(-30).padEnd(30)} ║
║  Database:   ${DB_PATH.slice(-30).padEnd(30)} ║
╚════════════════════════════════════════════════╝
  `);
    // Start file watcher
    console.log('📁 Starting file watcher...');
    fileWatcher.start();
    // Start git monitor (if git repo)
    const isRepo = await gitMonitor.isGitRepo();
    if (isRepo) {
        console.log('🔀 Starting git monitor...');
        await gitMonitor.start();
    }
    else {
        console.log('⚠️  Not a git repository, skipping git monitor');
    }
    // Start metrics collector
    console.log('📊 Starting metrics collector...');
    metricsCollector.start();
    console.log('✅ All services started successfully');
});
// ==================== Graceful Shutdown ====================
process.on('SIGINT', async () => {
    console.log('\n🛑 Shutting down Raven backend...');
    await fileWatcher.stop();
    gitMonitor.stop();
    metricsCollector.stop();
    db.close();
    process.exit(0);
});
//# sourceMappingURL=server.js.map