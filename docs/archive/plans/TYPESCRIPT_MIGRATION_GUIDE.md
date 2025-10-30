# TypeScript Migration Guide

## 🎯 Overview

Raven 3 is being incrementally evolved toward a modular TypeScript architecture while keeping the existing Node.js/JavaScript stack operational.

## ✅ What's Been Completed

### Phase 1: Foundation (COMPLETE)

1. **TypeScript Setup**
   - ✅ TypeScript installed and configured (`tsconfig.json`)
   - ✅ Type definitions added (`@types/node`, `@types/express`, `@types/cors`)
   - ✅ Build scripts added to `package.json`

2. **Modular Architecture Created**
   - ✅ `/backend/modules/` directory structure
   - ✅ 5 core TypeScript modules implemented
   - ✅ Full type safety with interfaces and types
   - ✅ Barrel export (`index.ts`) for clean imports

3. **Core Modules Implemented**

| Module | File | Purpose | Status |
|--------|------|---------|--------|
| **EventBus** | `eventBus.ts` | Central event system | ✅ Complete |
| **Diff** | `diff.ts` | Text comparison utilities | ✅ Complete |
| **Telemetry** | `telemetry.ts` | System metrics collection | ✅ Complete |
| **Watcher** | `watcher.ts` | File system monitoring | ✅ Complete |
| **Git** | `git.ts` | Git repository monitoring | ✅ Complete |

4. **Documentation**
   - ✅ Module README with usage examples
   - ✅ Integration example (`server-modular-example.js`)
   - ✅ This migration guide

## 📁 Current File Structure

```
raven/backend/
├── modules/                          # NEW TypeScript modules
│   ├── eventBus.ts                   # Central event system
│   ├── diff.ts                       # Diff utilities
│   ├── telemetry.ts                  # System metrics
│   ├── watcher.ts                    # File watching
│   ├── git.ts                        # Git monitoring
│   ├── index.ts                      # Barrel export
│   └── README.md                     # Module documentation
│
├── dist/                             # Compiled JavaScript (generated)
│   └── modules/                      # Compiled TypeScript modules
│       ├── *.js                      # JavaScript output
│       ├── *.d.ts                    # Type definitions
│       └── *.js.map                  # Source maps
│
├── server.js                         # EXISTING JavaScript server
├── server-modular-example.js         # NEW Integration example
├── db.js                             # EXISTING Database wrapper
├── metrics-collector.js              # EXISTING Metrics (to migrate)
├── trigger-engine.js                 # EXISTING Triggers (to migrate)
├── package.json                      # Updated with TS scripts
└── tsconfig.json                     # NEW TypeScript config
```

## 🔄 How the Systems Coexist

### Current Setup
- **Existing JavaScript** (`server.js`) continues to run unchanged
- **New TypeScript modules** are compiled to `dist/` and can be imported
- **EventBus** acts as the bridge between old and new code

### Import Strategy
```javascript
// Old code can import new TypeScript modules
import { EventBus, FileWatcher, GitMonitor } from './dist/modules/index.js';

// New modules emit events that old code can listen to
EventBus.onFileEvent((event) => {
  // Old JavaScript code handles event
  db.insertEvent(/* ... */);
  io.emit('file-changed', event);
});
```

## 🚀 Using the New Modules

### Build TypeScript
```bash
cd backend

# Compile once
npm run build

# Watch mode (recompile on changes)
npm run build:watch

# Type check only (no output)
npm run type-check
```

### Run the Example Server
```bash
# Run modular example alongside existing server
node server-modular-example.js

# Or run existing server (TypeScript modules available but not used)
node server.js
```

## 🔀 Migration Strategies

### Strategy 1: Gradual Integration (Recommended)

Keep `server.js` running but gradually wire in new modules:

```javascript
// server.js
import { EventBus, FileWatcher } from './dist/modules/index.js';

// Replace inline file watching with new module
const watcher = new FileWatcher({ watchPath: WATCH_PATH });
watcher.start();

// Wire to existing infrastructure
EventBus.onFileEvent((event) => {
  // Use existing database and WebSocket code
  db.insertEvent(/* ... */);
  io.emit('file-changed', event);
});
```

### Strategy 2: Side-by-Side Services

Run both old and new servers simultaneously:

```bash
# Terminal 1: Existing server
cd backend && node server.js    # Port 3030

# Terminal 2: New modular server
cd backend && node server-modular-example.js  # Port 3031 (modify PORT)
```

### Strategy 3: Feature-by-Feature Replacement

Replace one feature at a time:

1. **First:** Replace file watching
   - Use `FileWatcher` instead of inline `chokidar` code
   - Keep database and WebSocket code unchanged

2. **Then:** Add git monitoring
   - Enable `GitMonitor` for new functionality
   - Emit events via existing WebSocket

3. **Finally:** Migrate remaining services
   - Convert `metrics-collector.js` to TypeScript
   - Convert `trigger-engine.js` to TypeScript
   - Convert `db.js` to TypeScript

## 📊 Module Architecture

### Event Flow

```
┌─────────────────────────────────────────────────┐
│               EventBus (Central Hub)            │
│  - file_event                                   │
│  - git_status                                   │
│  - telemetry                                    │
│  - trigger_fired                                │
│  - agent_event                                  │
└─────────────────────────────────────────────────┘
         ↑                 ↑              ↑
         │                 │              │
    ┌────────┐       ┌──────────┐   ┌───────────┐
    │Watcher │       │   Git    │   │Telemetry  │
    │        │       │ Monitor  │   │ Collector │
    └────────┘       └──────────┘   └───────────┘
         ↓                 ↓              ↓
    ┌─────────────────────────────────────────────┐
    │      Listeners (server.js)                  │
    │  - Database writes                          │
    │  - WebSocket broadcasts                     │
    │  - Trigger evaluation                       │
    └─────────────────────────────────────────────┘
```

### Key Principles

1. **Single Responsibility**: Each module has one clear purpose
2. **Event-Driven**: All communication via EventBus
3. **Non-Blocking**: Async/await throughout
4. **Type-Safe**: Full TypeScript with interfaces
5. **Modular**: Can be used independently or together

## 📝 Next Steps

### Phase 2: Migrate Existing Modules

1. **Convert `db.js` to TypeScript** (`db.ts`)
   - Add proper types for all methods
   - Create interfaces for query results
   - Export typed class

2. **Convert `metrics-collector.js`** (`metrics-collector.ts`)
   - Replace with `TelemetryCollector` from modules
   - Remove duplicate code
   - Wire to EventBus

3. **Convert `trigger-engine.js`** (`trigger-engine.ts`)
   - Create typed config interface
   - Emit events via EventBus
   - Add tests

### Phase 3: Server Migration

1. **Create `server.ts`**
   - Port `server.js` to TypeScript
   - Use all new modules
   - Add proper types for Express routes
   - Remove inline implementations

2. **Update Build Process**
   - Add build step before server start
   - Consider using `tsx` or `ts-node` for development
   - Update start scripts in package.json

### Phase 4: Testing

1. **Add Unit Tests**
   - Test each module independently
   - Mock EventBus for isolation
   - Use Vitest or Jest

2. **Add Integration Tests**
   - Test EventBus wiring
   - Test file watching end-to-end
   - Test git monitoring

### Phase 5: MCP Integration

1. **Create MCP Adapters**
   - Expose modules as MCP tools
   - Add to Claude Code via manifest
   - Document MCP interfaces

## 🔧 Development Workflow

### Adding a New Module

1. Create TypeScript file in `/backend/modules/`
2. Define interfaces and types
3. Implement class with EventBus integration
4. Export from `index.ts`
5. Build: `npm run build`
6. Test import: `import { NewModule } from './dist/modules/index.js'`
7. Document in module README

### Modifying Existing Module

1. Edit TypeScript file
2. Rebuild: `npm run build` (or use `npm run build:watch`)
3. Restart server (no code changes in server.js needed)

### Debugging

```bash
# Type check without building
npm run type-check

# Build with verbose output
npm run build -- --listEmittedFiles

# Run with source maps (errors show TypeScript line numbers)
node --enable-source-maps server-modular-example.js
```

## 📚 Resources

- **TypeScript Docs**: https://www.typescriptlang.org/docs/
- **Node.js ESM**: https://nodejs.org/api/esm.html
- **EventEmitter**: https://nodejs.org/api/events.html
- **Chokidar**: https://github.com/paulmillr/chokidar
- **simple-git**: https://github.com/steveukx/git-js

## 🎯 Success Criteria

Migration is complete when:

- [ ] All JavaScript modules converted to TypeScript
- [ ] `server.ts` replaces `server.js`
- [ ] All inline code moved to modules
- [ ] Tests cover all modules
- [ ] Documentation is complete
- [ ] MCP adapters implemented
- [ ] Zero TypeScript errors
- [ ] Existing functionality preserved

## 🐛 Troubleshooting

### "Cannot find module" errors
```bash
# Rebuild TypeScript
npm run build

# Check dist/ directory exists
ls -la dist/modules/
```

### "Unexpected token" errors
```bash
# Ensure package.json has "type": "module"
# Use .js imports (not .ts) in JavaScript files
import { EventBus } from './dist/modules/index.js';  // ✅ Correct
import { EventBus } from './modules/index.ts';       // ❌ Wrong
```

### Type errors during build
```bash
# See detailed errors
npm run build

# Fix errors in TypeScript files
# Common issues: missing types, wrong imports, async/await
```

## 📞 Questions?

See the guide document: `RAVEN_CONTINUITY_AND_EVOLUTION_GUIDE.md`

---

**Last Updated**: 2025-10-18
**Phase**: 1 Complete ✅
**Next Phase**: 2 - Migrate Existing Modules
