/**
 * Telemetry Routes - Agent telemetry endpoint
 *
 * POST /telemetry - Receive agent telemetry events
 */
import { Router } from 'express';
export function createTelemetryRouter(deps) {
    const router = Router();
    const { db, triggerEngine, io, sessionId, agentRegistry, getAgentColor } = deps;
    /**
     * POST /telemetry
     * Receive telemetry events from AI agents
     */
    router.post('/telemetry', (req, res) => {
        try {
            const { agent, event, file, lines_changed, duration_ms, message, metadata } = req.body;
            // Validate required fields
            if (!agent || !event || !message) {
                return res.status(400).json({
                    error: 'Missing required fields: agent, event, message'
                });
            }
            const timestamp = new Date().toISOString();
            // Insert into database
            const eventId = db.insertAgentEvent(timestamp, agent, event, file, lines_changed, duration_ms, message, metadata, sessionId);
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
                session_id: sessionId
            });
        }
        catch (error) {
            console.error('❌ Telemetry error:', error);
            res.status(500).json({ error: error.message });
        }
    });
    return router;
}
//# sourceMappingURL=telemetry.js.map