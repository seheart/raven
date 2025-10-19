# Raven TypeScript Modules

Modular, event-driven architecture for Raven backend services.

## 📁 Structure

```
modules/
├── eventBus.ts      # Central event system
├── diff.ts          # Text comparison utilities
├── telemetry.ts     # System metrics collection
├── watcher.ts       # File system monitoring
├── git.ts           # Git repository monitoring
└── index.ts         # Barrel export
```

## 🚀 Quick Start

### Import modules

```typescript
import { EventBus, FileWatcher, GitMonitor, telemetryCollector } from './modules/index.js';
```

### Using EventBus

The EventBus is the central nervous system for all Raven events.

```typescript
import { EventBus } from './modules/index.js';

// Listen for file events
EventBus.onFileEvent((event) => {
  console.log(`File ${event.type}: ${event.path}`);
  // Save to database, emit via WebSocket, etc.
});

// Listen for git status
EventBus.onGitStatus((status) => {
  console.log(`Branch: ${status.branch}, Modified: ${status.modified.length}`);
});

// Listen for telemetry
EventBus.onTelemetry((telemetry) => {
  console.log(`CPU: ${telemetry.cpu}%, Memory: ${telemetry.mem}%`);
});
```

### Using FileWatcher

```typescript
import { FileWatcher } from './modules/index.js';

const watcher = new FileWatcher({
  watchPath: '/path/to/project',
  ignored: ['**/node_modules/**', '**/.git/**'],
  debounceMs: 50
});

// Start watching
watcher.start();

// Events are automatically emitted to EventBus
// Listen via: EventBus.onFileEvent(...)

// Stop watching
await watcher.stop();
```

### Using GitMonitor

```typescript
import { GitMonitor } from './modules/index.js';

const gitMonitor = new GitMonitor({
  repoPath: '/path/to/repo',
  pollIntervalMs: 5000,
  enableAutoPoll: true
});

// Start monitoring
await gitMonitor.start();

// Check status manually
const status = await gitMonitor.checkStatus();

// Get uncommitted diff
const diff = await gitMonitor.getUncommittedDiff();

// Stop monitoring
gitMonitor.stop();
```

### Using TelemetryCollector

```typescript
import { telemetryCollector } from './modules/index.js';

// Start collecting metrics every 3 seconds
telemetryCollector.start();

// Events are automatically emitted to EventBus
// Listen via: EventBus.onTelemetry(...)

// Get immediate snapshot (less accurate)
const snapshot = telemetryCollector.getSnapshot();

// Stop collecting
telemetryCollector.stop();
```

### Using Diff utilities

```typescript
import { getDiff, getDiffStats, getSimilarity } from './modules/index.js';

const oldCode = 'const x = 1;';
const newCode = 'const x = 2;';

// Get structured diff
const diff = getDiff(oldCode, newCode);
console.log(diff);
// [{ added: false, removed: true, value: 'const x = 1;' },
//  { added: true, removed: false, value: 'const x = 2;' }]

// Get statistics
const stats = getDiffStats(oldCode, newCode);
console.log(stats);
// { linesAdded: 1, linesRemoved: 1, linesChanged: 2, totalChanges: 2 }

// Get similarity percentage
const similarity = getSimilarity(oldCode, newCode);
console.log(similarity); // 90.9
```

## 🔌 Integration with Existing Server

The TypeScript modules are designed to work alongside the existing JavaScript codebase.

### Incremental Migration Example

```javascript
// server.js (existing)
import express from 'express';
import { EventBus, FileWatcher, GitMonitor, telemetryCollector } from './modules/index.js';

const app = express();

// Initialize new modular services
const watcher = new FileWatcher({
  watchPath: WATCH_PATH,
  ignored: ['**/node_modules/**']
});

const gitMonitor = new GitMonitor({
  repoPath: WATCH_PATH,
  enableAutoPoll: false
});

// Wire EventBus to existing systems
EventBus.onFileEvent(async (event) => {
  // Save to database
  db.insertEvent(/* ... */);

  // Emit via WebSocket
  io.emit('file-changed', event);

  // Check git status if this is a code file
  if (event.path.endsWith('.js') || event.path.endsWith('.ts')) {
    await gitMonitor.checkStatus();
  }
});

EventBus.onGitStatus((status) => {
  io.emit('git-status', status);
});

EventBus.onTelemetry((telemetry) => {
  db.insertMetrics(/* ... */);
  io.emit('metrics-update', telemetry);
});

// Start services
watcher.start();
await gitMonitor.start();
telemetryCollector.start();

// Start server
app.listen(PORT, () => {
  console.log('Raven backend running');
});
```

## 🏗️ Architecture

### Event Flow

```
File System → FileWatcher → EventBus → [Database, WebSocket, Git Check]
                                    ↘ GitMonitor ↗
                                    ↘ Telemetry ↗
```

### Principles

1. **Single Responsibility**: Each module has one clear purpose
2. **Event-Driven**: All communication via EventBus
3. **Modular**: Can be used independently or together
4. **Type-Safe**: Full TypeScript support with exports
5. **Non-Blocking**: Async patterns throughout

## 📦 Building

```bash
# Compile TypeScript
npm run build

# Watch mode
npm run build:watch

# Type check only
npm run type-check
```

## 📝 Development Notes

- All modules emit events via EventBus (don't use direct callbacks)
- Keep operations **local-only** (no external API calls)
- Use **async/await** for I/O operations
- Include JSDoc comments for IDE autocomplete
- Optimize for **speed and resilience** over completeness

## 🔮 Future Enhancements

- [ ] Add MCP (Model Context Protocol) adapters
- [ ] Create REST API wrappers for each module
- [ ] Add structured logging (Winston/Pino)
- [ ] Create Docker container with TypeScript runtime
- [ ] Add Prometheus metrics exporter

## 📄 License

MIT - Same as parent Raven project
