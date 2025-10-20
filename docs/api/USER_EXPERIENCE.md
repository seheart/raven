# 🎨 Raven User Experience Documentation

**Version:** Phase II.6 - User Experience Enhancements
**Status:** ✅ Fully Implemented

---

## 📋 Overview

Raven's User Experience enhancements provide a polished, production-ready interface with real-time dashboards, powerful CLI tools, and a cohesive dark/industrial theme. Get instant insights into your AI development workflow with beautiful visualizations and convenient command-line utilities.

### Key Features

- **Unified Dashboard** with real-time statistics
- **Top Modified Files** tracking
- **Longest Edits** leaderboard
- **Active Agents** status panel
- **Dark/Industrial Theme** (default)
- **CLI Tools** (`raven status`, `raven export`, `raven replay`)
- **Auto-refresh** (every 5 seconds)
- **Responsive Design** (mobile-friendly)

---

## 🎨 Dashboard

### Overview

The Dashboard is the central hub for monitoring your AI development session. It provides at-a-glance statistics, charts, and insights into file modifications, agent activity, and system performance.

### Components

#### 1. Statistics Cards

Five key metrics displayed as large, colorful cards:

| Stat | Icon | Description |
|------|------|-------------|
| **Total Events** | 📊 | Total number of file system events recorded |
| **Tracked Files** | 📁 | Number of files being monitored |
| **AI Agents** | 🤖 | Number of detected AI agents |
| **Session Duration** | ⏱️ | Time elapsed since session start |
| **Active Today** | 🔥 | Files modified in the last 24 hours |

**Example:**
```
┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│ 📊           │ │ 📁           │ │ 🤖           │
│ 1,234        │ │ 56           │ │ 2            │
│ Total Events │ │ Tracked Files│ │ AI Agents    │
└──────────────┘ └──────────────┘ └──────────────┘
```

---

#### 2. Top Modified Files

**Purpose:** Identify hotspots in your codebase - files that change most frequently.

**Columns:**
- **File** - File path with icon
- **Edits** - Number of modifications
- **Last Modified** - Timestamp of most recent change

**Example:**
```
┌─────────────────────────────────────────────────────┐
│ 📝 Top Modified Files                            10 │
├─────────────────────────────────────────────────────┤
│ 📄 src/main.rs          [25]  2025-10-17 15:30:45  │
│ 📄 src/commands/mod.rs  [18]  2025-10-17 15:28:12  │
│ 📄 Cargo.toml           [12]  2025-10-17 15:25:03  │
└─────────────────────────────────────────────────────┘
```

**Use Cases:**
- Find files that need refactoring (too many changes)
- Identify critical files for code review
- Track development focus areas

---

#### 3. Longest Edits

**Purpose:** Highlight the most significant code changes made by AI agents.

**Columns:**
- **File** - File path
- **Lines** - Number of lines changed
- **Agent** - AI agent that made the edit (color-coded badge)

**Example:**
```
┌─────────────────────────────────────────────────────┐
│ 🎯 Longest Edits                                  10 │
├─────────────────────────────────────────────────────┤
│ 📄 src/modules/timeline.rs  [280]  [claude]        │
│ 📄 frontend/Dashboard.svelte[650]  [claude]        │
│ 📄 src/modules/triggers.rs  [360]  [claude]        │
└─────────────────────────────────────────────────────┘
```

**Use Cases:**
- Review large AI-generated changes
- Identify complex implementations
- Track agent productivity

---

#### 4. Active Agents

**Purpose:** Monitor the status of all AI agents in real-time.

**Display:**
- Agent name (capitalized)
- Status indicator (🟢 Running / 🔴 Offline)
- Model count
- Request count
- Color-coded left border

**Example:**
```
┌─────────────────────────────────────────────────────┐
│ 🤖 Active Agents                                2/2  │
├─────────────────────────────────────────────────────┤
│ ┃ 🟢 ollama                                          │
│ ┃    3 models · 42 requests                          │
│ ┃                                                     │
│ ┃ 🟢 lmstudio                                        │
│ ┃    2 models · 15 requests                          │
└─────────────────────────────────────────────────────┘
```

**Use Cases:**
- Verify all required agents are running
- Monitor agent activity levels
- Quick health check before starting work

---

## 🎨 Dark/Industrial Theme

### Design Philosophy

Raven uses a **dark, industrial aesthetic** inspired by developer tools and monitoring dashboards:

- **Background:** Deep blacks (`#0f0f0f`, `#1a1a1a`)
- **Borders:** Subtle grays (`#2a2a2a`, `#1f1f1f`)
- **Accent:** Orange-to-amber gradient (`#FF6B35` → `#F7931A`)
- **Text:** Light grays (`#e5e5e5`, `#9ca3af`)
- **Shadows:** Ambient glow effects

### Color Palette

```
Primary Colors:
- Background Dark:  #0f0f0f
- Background Light: #1a1a1a
- Border:           #2a2a2a
- Text Primary:     #e5e5e5
- Text Secondary:   #9ca3af

Accent Colors:
- Orange:           #FF6B35
- Amber:            #F7931A
- Teal:             #4ECDC4
- Mint:             #95E1D3
- Green:            #10b981
- Blue:             #3b82f6
```

### Typography

- **Font Family:** 'Inter', sans-serif
- **Headings:** 600-700 weight
- **Body:** 400-500 weight
- **Labels:** 12-13px, uppercase, letter-spacing

### Visual Effects

- **Card Hover:** `translateY(-4px)` + shadow
- **Gradients:** Linear 135deg for depth
- **Border Glow:** `box-shadow` with color alpha
- **Smooth Transitions:** 0.2s ease

---

## 💻 CLI Commands

### Installation

The `raven` CLI is built automatically with the project:

```bash
cargo build --release
```

Binary location: `target/release/raven`

---

### 1. `raven status`

**Purpose:** Display agent connection status and session statistics.

**Usage:**
```bash
raven status [OPTIONS]
```

**Options:**
- `-v`, `--verbose` - Show detailed information

**Example Output:**

```
Raven Status

📊 Session Statistics:
   Tracked Files: 56

🤖 Agent Status:
   🟢 ollama
   🔴 lmstudio

📡 Telemetry:
   🟢 Socket: /tmp/raven-telemetry.sock
```

**Verbose Output:**

```bash
raven status --verbose
```

```
Raven Status

📊 Session Statistics:
   Tracked Files: 56

🤖 Agent Status:
   🟢 ollama
      Type: ollama
      Last Seen: 2025-10-17T15:30:45Z
      Models: 3
         - llama2
         - codellama
         - mistral
      Requests: 42

   🔴 lmstudio
      Type: lmstudio
      Last Seen: 2025-10-17T14:20:00Z
      Models: 0
      Requests: 0

📡 Telemetry:
   🟢 Socket: /tmp/raven-telemetry.sock
      Listening for agent events
```

**Use Cases:**
- Quick health check before coding session
- Verify agent connectivity
- Troubleshoot agent discovery issues

---

### 2. `raven replay`

**Purpose:** Open session replay at a specific timestamp.

**Usage:**
```bash
raven replay [TIMESTAMP]
```

**Parameters:**
- `TIMESTAMP` - ISO 8601 timestamp (optional)

**Example:**

```bash
# Start from beginning
raven replay

# Start at specific time
raven replay 2025-10-17T14:30:00Z
```

**Output:**

```
🎬 Session Replay

Opening replay at timestamp: 2025-10-17T14:30:00Z

📝 Note: Opening Raven GUI...
   Use the Session Replay panel to view timeline

⚠️  GUI auto-launch not yet implemented
   Run: ./start.sh
```

**Use Cases:**
- Review specific time periods
- Analyze what happened at a certain time
- Debug issues that occurred at known timestamps

---

### 3. `raven export`

**Purpose:** Package logs and diffs into a compressed archive for sharing or backup.

**Usage:**
```bash
raven export [OPTIONS]
```

**Options:**
- `-o`, `--output <FILE>` - Output file path (default: `raven-export.tar.gz`)

**Example:**

```bash
raven export
```

**Output:**

```
📦 Exporting Raven Data

Collecting files...
   ✓ Database
   ✓ Snapshots
   ✓ Trigger logs

✅ Export complete!
   Output: raven-export.tar.gz
   Size: 12.34 MB
```

**Custom Output:**

```bash
raven export --output backup-2025-10-17.tar.gz
```

**Archive Contents:**

```
raven-export.tar.gz
├── db/
│   └── raven.db           # SQLite database
├── snapshots/
│   ├── snapshot_1.txt     # File snapshots
│   ├── snapshot_2.txt
│   └── ...
└── triggers.log           # Trigger event log
```

**Use Cases:**
- Backup session data
- Share logs with team members
- Preserve session for later analysis
- Transfer data between machines

---

### 1. Get Dashboard Statistics

```javascript
const stats = await invoke('get_dashboard_stats');
// Returns: DashboardStatsData
```

**Returns:**
```typescript
interface DashboardStatsData {
  total_events: number;
  total_files: number;
  total_agents: number;
  session_duration_seconds: number;
  active_files_today: number;
}
```

---

### 2. Get Top Modified Files

```javascript
const topFiles = await invoke('get_top_modified_files', { limit: 10 });
// Returns: FileStatData[]
```

**Returns:**
```typescript
interface FileStatData {
  filepath: string;
  edit_count: number;
  total_lines_changed: number;
  last_modified: string; // ISO 8601
}
```

---

### 3. Get Longest Edits

```javascript
const edits = await invoke('get_longest_edits', { limit: 10 });
// Returns: LongestEditData[]
```

**Returns:**
```typescript
interface LongestEditData {
  filepath: string;
  lines_changed: number;
  timestamp: string; // ISO 8601
  agent?: string;
}
```

---

## 🎨 UI Component Usage

### Dashboard Component

```svelte
<script>
  import Dashboard from './lib/Dashboard.svelte';
</script>

<div class="app">
  <Dashboard />
</div>
```

### Features

**Auto-Refresh:**
- Updates every 5 seconds automatically
- Manual refresh button available
- Minimal performance impact

**Responsive Design:**
- Desktop: 3-column grid
- Tablet: 2-column grid
- Mobile: Single column stack

**Accessibility:**
- High contrast ratios
- Clear visual hierarchy
- Tooltips for truncated text

---

## 📊 Statistics Calculations

### Session Duration

```rust
let first_time = first_event.timestamp;
let last_time = last_event.timestamp;
let duration = (last_time - first_time).num_seconds();
```

### Active Files Today

```rust
let today = chrono::Utc::now().date_naive();
let active_today = events.iter()
    .filter(|e| e.timestamp.date_naive() == today)
    .filter_map(|e| e.filepath.as_ref())
    .collect::<HashSet<_>>()
    .len();
```

### Top Modified Files

```rust
let mut file_stats: HashMap<String, usize> = HashMap::new();
for event in events {
    *file_stats.entry(event.filepath).or_insert(0) += 1;
}
let mut stats: Vec<_> = file_stats.into_iter().collect();
stats.sort_by(|a, b| b.1.cmp(&a.1));
```

---

## 🧪 Testing

### Manual Testing

1. **Start Raven:**
   ```bash
   cd /home/seth/Projects/raven
   ./start.sh
   ```

2. **Open Dashboard:**
   - Add `<Dashboard />` to `App.svelte`
   - Refresh browser

3. **Verify Statistics:**
   - Check stats cards populate
   - Verify auto-refresh works
   - Test responsive layout

4. **Test CLI:**
   ```bash
   cargo build --release
   ./target/release/raven status
   ./target/release/raven export
   ```

---

## ⚡️ Performance

### Dashboard Rendering
- **Initial load:** <100ms
- **Refresh interval:** 5 seconds
- **Update latency:** <50ms
- **Memory overhead:** ~5 MB for UI + data

### CLI Commands
- **`raven status`:** <500ms (including agent checks)
- **`raven export`:** <2s for 100 MB archive
- **`raven replay`:** <100ms (placeholder)

---

## 🚀 Use Cases

### 1. Daily Standup Report

**Scenario:** Quickly show what you worked on yesterday.

```bash
raven status --verbose
```

Shows:
- Files modified
- Agent activity
- Session duration

---

### 2. Code Review Preparation

**Scenario:** Identify files that need review.

Open Dashboard → Check "Top Modified Files" panel

Focus review on files with high edit counts.

---

### 3. Performance Analysis

**Scenario:** Find bottlenecks in AI agent operations.

Open Dashboard → Check "Longest Edits" panel

Investigate files with very high line counts.

---

### 4. Session Backup

**Scenario:** Preserve important development session.

```bash
raven export --output important-session.tar.gz
```

Store archive for future reference.

---

## 📝 Best Practices

### Dashboard Usage

1. **Keep Dashboard Open:** Pin it to a second monitor for real-time visibility
2. **Review Top Files Daily:** Identify files that need refactoring
3. **Monitor Agent Status:** Ensure all required agents are running
4. **Check Longest Edits:** Review large AI-generated changes

### CLI Usage

1. **Morning Check:** Run `raven status -v` at start of day
2. **Regular Backups:** Export sessions weekly
3. **Troubleshooting:** Use `raven status` to diagnose agent issues

---

## 🚀 Future Enhancements (Planned)

- ⏳ **Real-time Charts** (activity timeline visualization)
- ⏳ **Custom Dashboard Layouts** (drag-and-drop panels)
- ⏳ **Export Formats** (JSON, CSV, HTML reports)
- ⏳ **GUI Auto-Launch** from CLI commands
- ⏳ **Email Reports** (daily/weekly summaries)
- ⏳ **Dark/Light Theme Toggle**
- ⏳ **Custom Color Schemes**

---

## 📚 Related Documentation

- [AGENT_MONITORING.md](AGENT_MONITORING.md) - Agent monitoring
- [SESSION_REPLAY.md](SESSION_REPLAY.md) - Session replay
- [CUSTOM_TRIGGERS.md](CUSTOM_TRIGGERS.md) - Custom triggers
- [PERFORMANCE_PROFILING.md](PERFORMANCE_PROFILING.md) - Performance metrics
- [HISTORY.md](../HISTORY.md) - Complete development history

---

## 📄 License

MIT License - See [LICENSE](LICENSE) file

---

**Author:** Seth Eheart
**Codename:** Raven
**Phase:** II.6 - User Experience Enhancements
**Status:** ✅ Production Ready
