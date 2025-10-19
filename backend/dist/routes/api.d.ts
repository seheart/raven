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
import type { RavenDB } from '../db.js';
import type { GitMonitor } from '../modules/git.js';
import type { TriggerEngine } from '../trigger-engine.js';
export interface ApiDependencies {
    db: RavenDB;
    gitMonitor: GitMonitor;
    triggerEngine: TriggerEngine;
    sessionId: string;
    agentRegistry: Map<string, any>;
    dbPath: string;
    isWatcherRunning: () => boolean;
    isGitRunning: () => boolean;
    isMetricsRunning: () => boolean;
}
export declare function createApiRouter(deps: ApiDependencies): Router;
//# sourceMappingURL=api.d.ts.map