/**
 * Telemetry Routes - Agent telemetry endpoint
 *
 * POST /telemetry - Receive agent telemetry events
 */
import { Router } from 'express';
import type { RavenDB } from '../db.js';
import type { TriggerEngine } from '../trigger-engine.js';
import type { Server as SocketIOServer } from 'socket.io';
export interface TelemetryDependencies {
    db: RavenDB;
    triggerEngine: TriggerEngine;
    io: SocketIOServer;
    sessionId: string;
    agentRegistry: Map<string, any>;
    getAgentColor: (agentName: string) => string;
}
export declare function createTelemetryRouter(deps: TelemetryDependencies): Router;
//# sourceMappingURL=telemetry.d.ts.map