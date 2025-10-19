/**
 * Raven Modules - Barrel Export
 *
 * Central export point for all Raven TypeScript modules.
 * Import from this file to access all modular functionality.
 *
 * @example
 * import { EventBus, FileWatcher, GitMonitor, telemetryCollector } from './modules/index.js';
 */
export { EventBus } from './eventBus.js';
export type { FileEvent, GitStatusEvent, TelemetryEvent, TriggerFiredEvent, AgentEvent } from './eventBus.js';
export { getDiff, getCharDiff, createPatch, getDiffStats, areIdentical, getSimilarity } from './diff.js';
export type { DiffResult, DiffStats } from './diff.js';
export { TelemetryCollector, telemetryCollector } from './telemetry.js';
export type { TelemetryConfig } from './telemetry.js';
export { FileWatcher } from './watcher.js';
export type { WatcherConfig } from './watcher.js';
export { GitMonitor } from './git.js';
export type { GitMonitorConfig } from './git.js';
//# sourceMappingURL=index.d.ts.map