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
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { randomUUID } from 'crypto';
import { join } from 'path';
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
// Session ID
const SESSION_ID = randomUUID();
// ==================== Middleware ====================
app.use(cors());
app.use(express.json({ limit: '50mb' }));
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
        SESSION_ID, event.hash, event.size);
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
        const events = db.getRecentAgentEvents(limit);
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
        const events = db.getRecentFileEvents(limit, includeDiff);
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
        const metrics = db.getRecentSystemMetrics(limit);
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