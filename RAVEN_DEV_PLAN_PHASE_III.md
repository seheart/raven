# 🦅 Raven Development Plan — Phase III (Persistent Memory + Git Integration)

**Purpose:**  
Raven now evolves from a local telemetry monitor into a full **project-aware**, **Git-integrated**, and **memory-persistent** development companion.  
This phase ensures that no code changes are ever lost — even if Claude crashes, forgets, or disconnects.

---

## ✅ What’s Already Built

| Component | Description |
|------------|--------------|
| 🔍 **File Watcher** | Detects real-time file changes using the `notify` crate. |
| 🪶 **Logger** | Writes change events, timestamps, and system metrics into SQLite/JSON. |
| 🧩 **System Telemetry** | Monitors CPU, RAM, and disk activity through `sysinfo`. |

---

## 🧩 What’s Next

### 1. 🗂️ **Project Selector**
**Goal:** Let users “open” a folder or repo (like VS Code’s *Open Folder*).

**Implementation:**
- Use Tauri’s file picker dialog to select a directory.
- Store the selected path in `.raven/config.json`.
- Detect `.git` folder automatically.

**Example:**
```json
{
  "current_project": "/home/seth/projects/raven",
  "watch_ignored": ["target", "node_modules"]
}
```

**UI:**
- Sidebar panel: *“Select Project”*, *“Current Project”*, *“Change Folder”*.
- Once selected, start monitoring that directory recursively.

---

### 2. 🧭 **Repo Context**
**Goal:** Load Git repo info to give Raven context about project state.

**Implementation:**
- Use `git2` crate to check for `.git`.
- Load:
  - Current branch name
  - Latest commit hash
  - Remote origin URL (if available)
- Store this info in `raven_meta` table or in memory.

**Example:**
```rust
use git2::Repository;
let repo = Repository::open("/home/seth/projects/raven")?;
let branch = repo.head()?.shorthand().unwrap_or("detached");
let hash = repo.head()?.target().unwrap();
```

**UI:**
- Display current branch + commit short hash in Raven’s top bar.

---

### 3. 🧠 **Git Diff Monitor**
**Goal:** Track what’s changed vs. last commit (HEAD).

**Implementation:**
- On file change events, run incremental `git diff` checks via `git2::Diff`.
- Store diffs and line counts in SQLite:
  ```sql
  CREATE TABLE git_diffs (
    id INTEGER PRIMARY KEY,
    filepath TEXT,
    diff TEXT,
    lines_added INT,
    lines_removed INT,
    timestamp TEXT
  );
  ```
- Render a compact “Git status” summary in the Raven UI:
  ```
  [2 modified] [1 new] [0 deleted]
  ```

**Why:**
- Detects changes Claude made that aren’t committed yet.
- Helps identify potential lost work before it’s staged.

---

### 4. 🪞 **Terminal Mirror**
**Goal:** See Claude’s process output and system logs in real time.

**Implementation:**
- Integrate a pseudo-terminal (PTY) process listener.
- Stream stdout/stderr from Claude’s active process into Raven’s log viewer.
- Display live output with timestamp prefix, similar to VS Code’s terminal.

**Example UI:**
```
[15:04:21] Claude: refactoring utils.rs
[15:04:22] Claude: added new fn normalize_diff()
[15:04:23] git status: 2 modified, 1 staged
```

**Optional:** Allow toggling between Claude’s output and Raven’s system logs.

---

### 5. 🧾 **Commit Intelligence**
**Goal:** Track what needs committing, what’s staged, and what’s been lost.

**Implementation:**
- Run `git status` on each file change or on interval.
- Show:
  - Modified / Untracked / Deleted files
  - Diff summary per file
  - Lines changed
- Add “snapshot” command:
  ```bash
  raven snapshot
  ```
  → Creates a safe hidden branch:  
  `raven-snapshots/YYYY-MM-DD-HHMM/`

**Example:**
```bash
[Snapshot Created]
Branch: raven-snapshots/2025-10-17-1500
Includes: 3 modified, 1 deleted file
```

**Why:**
Even if Claude overwrites code, Raven can restore it instantly from snapshot.

---

## 🧠 Persistent Session Memory

### Goal
Provide a permanent local “working memory” that records every edit, diff, and action — even if Claude forgets or disconnects.

### Implementation

#### 🧩 Session Management
Each session creates a log file:
```
.raven/sessions/2025-10-17T14-33-02.json
```

Stores:
- Project path
- Timestamp
- File changes
- Agent source (Claude, user, system)
- Metrics (CPU, RAM, etc.)

#### 🧩 Change Event Struct
```rust
struct ChangeEvent {
    timestamp: DateTime<Utc>,
    filepath: String,
    diff: String,
    triggered_by: String, // "claude" | "user"
}
```

Each change is logged to SQLite and exported periodically as JSON.

#### 🧩 Memory Index
All changes are indexed by file + timestamp:
```sql
SELECT diff FROM events 
WHERE filepath='src/main.rs'
ORDER BY timestamp DESC LIMIT 10;
```

Claude (or any agent) can query Raven for its recent context.

#### 🧩 Backup Before Overwrite
Before any file is changed:
```
.raven/backup/<timestamp>/<filename>.bak
```
This ensures recovery even after a full deletion.

#### 🧩 Session Resume
When restarted:
- Load last active session’s changes.
- Present a summary in Raven’s UI or CLI:
  ```
  Welcome back.
  Since your last session:
  - Modified src/helpers.rs (12 lines)
  - Deleted src/temp.rs
  - CPU peaked at 82%
  ```

---

## 🧾 Database Schema Additions
```sql
CREATE TABLE sessions (
  id INTEGER PRIMARY KEY,
  start_time TEXT,
  end_time TEXT,
  project_path TEXT
);

CREATE TABLE events (
  id INTEGER PRIMARY KEY,
  session_id INT,
  timestamp TEXT,
  filepath TEXT,
  diff TEXT,
  triggered_by TEXT,
  FOREIGN KEY (session_id) REFERENCES sessions (id)
);
```

---

## 🧱 UI Additions
| Section | Description |
|----------|--------------|
| **Project Info Bar** | Shows project name, Git branch, commit hash |
| **Live Feed Panel** | Terminal-like log of Claude + system events |
| **Git Status Widget** | Displays changed files and line counts |
| **Session Timeline** | Scrubbable view of all edits made in this session |
| **Snapshot Button** | Manual safety commit button |

---

## 🧩 Core Crates & Tools

| Purpose | Crate |
|----------|--------|
| File system watch | `notify` |
| Git integration | `git2` |
| Diff engine | `similar` |
| Database | `rusqlite` |
| System metrics | `sysinfo` |
| Serialization | `serde`, `serde_json` |
| Logging | `tracing`, `chrono` |
| UI | Tauri + Svelte |

---

## 🧠 Summary
Raven now becomes a **developer’s black box** — a persistent memory system that:
- Knows which project it’s in,
- Tracks all Git-aware file changes,
- Streams real-time output,
- And never forgets a single modification.

If Claude forgets, crashes, or overwrites — Raven remembers.

---

**Author:** Seth Eheart  
**Codename:** Raven  
**Version:** Phase III — Persistent Memory & Git Integration  
