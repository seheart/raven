# 🦅 RAVEN_CONTINUITY_AND_EVOLUTION_GUIDE.md

## 💡 INTRO FOR CLAUDE CODE

You are continuing the development of **Raven 3**, a local-first, lighting-fast observability platform that monitors, logs, and recalls developer activity in real-time. Raven acts as a “black box flight recorder” for coding — tracking file changes, Git diffs, system telemetry, and session memory for AI-assisted coding tools.

**Your task:** Expand Raven’s capabilities using the existing architecture (Node.js backend + Svelte frontend + SQLite). Integrate the capabilities of *Old Raven* (monitoring, diffing, timelines, telemetry) without reintroducing any of its technical debt. Focus on modularity, clarity, and event-driven design.

When writing code:
- Preserve **speed, modularity, and clarity** over feature volume.
- Keep the **architecture clean**: no mixing of concerns or tightly coupled services.
- Write self-documenting code with clear, typed APIs.
- Assume Claude will later expose Raven’s APIs as MCPs (`raven.timeline`, `raven.git`, `raven.snapshot`, `raven.telemetry`).

---

## 🧠 BLUF (Bottom Line Up Front)

> Raven 3 = Local-first, modular event engine that observes, logs, and visualizes code activity in real time.

The system should:
1. Watch selected local project folders and detect file changes instantly.
2. Detect Git diffs and uncommitted changes.
3. Log all activity in a local SQLite database.
4. Expose a WebSocket event stream to the Svelte frontend.
5. Render those events as a clean, responsive UI (Feed, Timeline, Telemetry).
6. Support future MCP interfaces for cross-agent usage.

---

## ⚙️ ARCHITECTURE OVERVIEW

### Backend (Node.js)
- Express-based REST + WebSocket server
- SQLite local database for persistence
- Modular services in `/server/modules` for watchers, telemetry, and Git
- Shared EventBus for broadcasting system events

### Frontend (Svelte)
- `/components` for Feed, RepoStatus, Telemetry, Timeline
- `/lib/wsStore.ts` handles WebSocket connections and reactive data
- Theming via Day / Dusk / Night palettes

### Data Flow
```
File System → Watcher → EventBus → SQLite → WebSocket → Svelte UI
                                ↘ Git Monitor ↗
```

---

## 🧩 SUBSYSTEM ROADMAP

| Subsystem | Status | Action | Notes |
|------------|---------|--------|-------|
| File Watcher | 🚧 | Rebuild as modular service | Core engine; emit structured JSON events |
| Git Monitor | 🔄 | Implement diff + branch tracking | Use `simple-git`; output minimal payloads |
| Timeline DB | 🧱 | Extend schema | Use SQLite, log all events |
| Diff Engine | 🧠 | Add as utility | Use `diffLines` and store JSON deltas |
| Telemetry | ⚙️ | Port CPU/RAM polling | Emit via EventBus every few seconds |
| UI | 🎨 | Expand Svelte components | Focus on clarity and speed |
| MCP Hooks | 🌐 | Future | Scaffold API endpoints for integration |

---

## 🧱 FILE STRUCTURE (SCAFFOLDING)

```
raven/
│
├── server/
│   ├── index.ts               # Entry point (Express + WS setup)
│   ├── db/
│   │   ├── schema.sql         # Tables for events, diffs, telemetry
│   │   └── client.ts          # SQLite connection & helpers
│   ├── modules/
│   │   ├── watcher.ts         # File system watcher (chokidar)
│   │   ├── git.ts             # Git diff monitor
│   │   ├── telemetry.ts       # System metrics (CPU, RAM)
│   │   ├── diff.ts            # Diff utility (text comparison)
│   │   └── eventBus.ts        # Centralized event emitter
│   └── routes/
│       ├── api.ts             # REST endpoints for logs/timeline
│       └── ws.ts              # WebSocket message hub
│
├── frontend/
│   ├── src/
│   │   ├── lib/wsStore.ts     # WebSocket store (Svelte reactive)
│   │   ├── components/
│   │   │   ├── Feed.svelte
│   │   │   ├── RepoStatus.svelte
│   │   │   ├── Telemetry.svelte
│   │   │   └── Timeline.svelte
│   │   └── routes/+layout.svelte
│   ├── static/
│   └── vite.config.ts
│
└── README.md
```

---

## 🧩 MODULE SCAFFOLD EXAMPLES

### 🪶 `/server/modules/watcher.ts`
```ts
import chokidar from 'chokidar';
import { EventBus } from './eventBus.js';

export function startWatcher(projectPath: string) {
  const watcher = chokidar.watch(projectPath, { ignored: /node_modules|dist/, persistent: true });
  watcher
    .on('add', path => EventBus.emit('file_event', { type: 'add', path, ts: Date.now() }))
    .on('change', path => EventBus.emit('file_event', { type: 'change', path, ts: Date.now() }))
    .on('unlink', path => EventBus.emit('file_event', { type: 'remove', path, ts: Date.now() }));
}
```

### ⚙️ `/server/modules/git.ts`
```ts
import simpleGit from 'simple-git';
import { EventBus } from './eventBus.js';

export async function checkGitStatus(repoPath: string) {
  const git = simpleGit(repoPath);
  const status = await git.status();
  EventBus.emit('git_status', { branch: status.current, modified: status.modified, created: status.created });
}
```

### 🧠 `/server/modules/diff.ts`
```ts
import { diffLines } from 'diff';
export function getDiff(oldText: string, newText: string) {
  return diffLines(oldText, newText).map(h => ({ added: h.added, removed: h.removed, value: h.value }));
}
```

### 🔋 `/server/modules/telemetry.ts`
```ts
import os from 'os';
import { EventBus } from './eventBus.js';

export function startTelemetry() {
  setInterval(() => {
    const cpu = os.loadavg()[0] * 10;
    const mem = Math.round((1 - os.freemem() / os.totalmem()) * 100);
    EventBus.emit('telemetry', { cpu, mem, ts: Date.now() });
  }, 3000);
}
```

### 🧩 `/server/modules/eventBus.ts`
```ts
import { EventEmitter } from 'events';
export const EventBus = new EventEmitter();
```

---

## 🪞 UI COMPONENT GUIDELINES

- **Feed.svelte:** Stream live updates from WebSocket (`file_event`, `git_status`, `telemetry`).
- **RepoStatus.svelte:** Summarize active repo’s pending changes and diffs.
- **Telemetry.svelte:** Display system health bars (CPU/Mem).
- **Timeline.svelte:** Query `/api/timeline` and render sortable logs.
- **ThemeSwitch.svelte:** Apply your Day / Dusk / Night palettes dynamically.

---

## 🚀 NEXT STEPS

1. Implement all modules under `/server/modules`.
2. Extend database schema with `events`, `diffs`, and `telemetry` tables.
3. Wire WebSocket broadcast to the EventBus.
4. Implement Svelte components for live visualization.
5. Prepare manifest.json for MCP integration once core functionality is stable.

---

## 🔒 DEVELOPMENT RULES

- Keep all operations **local-only** (no external API calls).  
- Maintain **non-blocking** event loops; use async patterns only where necessary.  
- Enforce **single responsibility per module**.  
- Include JSDoc-style docstrings for Claude’s code reasoning.  
- Optimize for **speed and resilience**, not completeness.  

---

## ✅ OUTCOME

When complete, Raven 3 will:  
- Monitor code and system state in real-time.  
- Log every meaningful event to a local DB.  
- Visualize changes with elegance and speed.  
- Be MCP-ready for future AI integrations.  
- Maintain its identity: **lightweight, local, lightning fast.**
