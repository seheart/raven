/**
 * Raven Modules - Barrel Export
 *
 * Central export point for all Raven TypeScript modules.
 * Import from this file to access all modular functionality.
 *
 * @example
 * import { EventBus, FileWatcher, GitMonitor, telemetryCollector } from './modules/index.js';
 */

// EventBus - Central event system
export { EventBus } from './eventBus.js';
export type {
  FileEvent,
  GitStatusEvent,
  TelemetryEvent,
  TriggerFiredEvent,
  AgentEvent
} from './eventBus.js';

// Diff utilities
export {
  getDiff,
  getCharDiff,
  createPatch,
  getDiffStats,
  areIdentical,
  getSimilarity
} from './diff.js';
export type { DiffResult, DiffStats } from './diff.js';

// Telemetry collector
export { TelemetryCollector, telemetryCollector } from './telemetry.js';
export type { TelemetryConfig } from './telemetry.js';

// File watcher
export { FileWatcher } from './watcher.js';
export type { WatcherConfig } from './watcher.js';

// Git monitor
export { GitMonitor } from './git.js';
export type { GitMonitorConfig } from './git.js';
