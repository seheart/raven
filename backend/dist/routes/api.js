/**
 * API Routes - REST endpoints for Raven
 *
 * All GET endpoints for querying data:
 * - Health check
 * - Dashboard stats
 * - File events
 * - Agent events
 * - System metrics
 * - Git status
 * - Triggers
 */
import { Router } from 'express';
export function createApiRouter(deps) {
    const router = Router();
    const { db, gitMonitor, triggerEngine, sessionId, agentRegistry, dbPath } = deps;
    // ==================== Health & Status ====================
    router.get('/health', (req, res) => {
        res.json({
            status: 'healthy',
            session_id: sessionId,
            uptime: process.uptime(),
            active_agents: agentRegistry.size,
            modules: {
                watcher: deps.isWatcherRunning(),
                git: deps.isGitRunning(),
                metrics: deps.isMetricsRunning()
            },
            database: dbPath
        });
    });
    router.get('/api/session-id', (req, res) => {
        res.json({ session_id: sessionId });
    });
    // ==================== Dashboard ====================
    router.get('/api/dashboard-stats', (req, res) => {
        try {
            const stats = db.getDashboardStats(sessionId);
            stats.total_agents = agentRegistry.size;
            res.json(stats);
        }
        catch (error) {
            res.status(500).json({ error: error.message });
        }
    });
    router.get('/api/top-modified-files', (req, res) => {
        try {
            const limit = parseInt(req.query.limit) || 10;
            const files = db.getTopModifiedFiles(sessionId, limit);
            res.json(files);
        }
        catch (error) {
            res.status(500).json({ error: error.message });
        }
    });
    router.get('/api/longest-edits', (req, res) => {
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
    router.get('/api/agents-status', (req, res) => {
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
    router.get('/api/agent-events', (req, res) => {
        try {
            const limit = parseInt(req.query.limit) || 100;
            const events = db.getRecentAgentEvents(limit);
            res.json(events);
        }
        catch (error) {
            res.status(500).json({ error: error.message });
        }
    });
    router.get('/api/events-by-agent/:agent', (req, res) => {
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
    router.get('/api/agent-stats', (req, res) => {
        try {
            const stats = db.getAgentStats();
            res.json(stats);
        }
        catch (error) {
            res.status(500).json({ error: error.message });
        }
    });
    // ==================== File Events ====================
    router.get('/api/file-events', (req, res) => {
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
    router.get('/api/tracked-files', (req, res) => {
        try {
            const files = db.getTrackedFiles();
            res.json(files);
        }
        catch (error) {
            res.status(500).json({ error: error.message });
        }
    });
    router.get('/api/events-by-session/:sessionId', (req, res) => {
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
    router.get('/api/system-metrics', (req, res) => {
        try {
            const limit = parseInt(req.query.limit) || 100;
            const metrics = db.getRecentSystemMetrics(limit);
            res.json(metrics);
        }
        catch (error) {
            res.status(500).json({ error: error.message });
        }
    });
    router.get('/api/process-metrics/:agent', (req, res) => {
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
    router.get('/api/metrics-stats', (req, res) => {
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
    router.get('/api/performance-correlations', (req, res) => {
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
    router.get('/api/git/status', async (req, res) => {
        try {
            const status = await gitMonitor.checkStatus();
            res.json(status || gitMonitor.getLastStatus());
        }
        catch (error) {
            res.status(500).json({ error: error.message });
        }
    });
    router.get('/api/git/diff', async (req, res) => {
        try {
            const diff = await gitMonitor.getUncommittedDiff();
            res.json({ diff });
        }
        catch (error) {
            res.status(500).json({ error: error.message });
        }
    });
    router.get('/api/git/branches', async (req, res) => {
        try {
            const branches = await gitMonitor.getBranches();
            res.json({ branches });
        }
        catch (error) {
            res.status(500).json({ error: error.message });
        }
    });
    router.get('/api/git/history', async (req, res) => {
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
    router.get('/api/triggers-config', (req, res) => {
        try {
            const triggers = triggerEngine.getTriggersConfig();
            res.json({ rules: triggers });
        }
        catch (error) {
            res.status(500).json({ error: error.message });
        }
    });
    router.get('/api/triggered-events', (req, res) => {
        try {
            const limit = parseInt(req.query.limit) || 100;
            const events = triggerEngine.getTriggeredEvents(limit);
            res.json(events);
        }
        catch (error) {
            res.status(500).json({ error: error.message });
        }
    });
    router.get('/api/trigger-stats', (req, res) => {
        try {
            const stats = triggerEngine.getTriggerStats();
            res.json(stats);
        }
        catch (error) {
            res.status(500).json({ error: error.message });
        }
    });
    router.post('/api/triggers-reload', (req, res) => {
        try {
            const message = triggerEngine.reloadConfig();
            res.json({ message });
        }
        catch (error) {
            res.status(500).json({ error: error.message });
        }
    });
    router.post('/api/triggers-clear-cooldowns', (req, res) => {
        try {
            const message = triggerEngine.clearCooldowns();
            res.json({ message });
        }
        catch (error) {
            res.status(500).json({ error: error.message });
        }
    });
    return router;
}
//# sourceMappingURL=api.js.map