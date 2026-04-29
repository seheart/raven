/**
 * Raven Modules - Barrel Export
 *
 * Central export point for the modules used outside this directory.
 * Items only used internally are deliberately not re-exported here.
 *
 * @example
 * import { EventBus, FileWatcher, GitMonitor, getDiff } from './modules/index.js';
 */

// EventBus + the event payload types consumers actually use
export { EventBus } from './eventBus.js';
export type { FileEvent, GitStatusEvent } from './eventBus.js';

// Diff utilities used by callers outside this folder
export { getDiff } from './diff.js';

// File watcher
export { FileWatcher } from './watcher.js';

// Git monitor
export { GitMonitor } from './git.js';
