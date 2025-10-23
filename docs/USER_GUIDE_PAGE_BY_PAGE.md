# Raven - Complete Page-by-Page User Guide

> **Purpose:** Comprehensive documentation of every page and panel in Raven
> **Audience:** Users wanting to understand what each feature does and how to use it optimally
> **Last Updated:** 2025-10-23

---

## 📋 Table of Contents

1. [Header & Navigation](#header--navigation)
2. [Overview Tab](#overview-tab)
3. [Agents Tab](#agents-tab)
4. [Activity Tab](#activity-tab)
5. [Analysis Tab](#analysis-tab)
6. [System Tab](#system-tab)
7. [About/Changelog/Docs](#aboutchangelogdocs)
8. [Global Features](#global-features)

---

## Header & Navigation

### 🎯 What It Is
The persistent header that appears on every page.

### 📍 Location
Top of every page, stays visible when scrolling.

### 🔧 What It Does
- **Raven Logo + Title:** Branding and visual identity
- **Help Button (?):** Opens keyboard shortcuts reference

### ✅ What To Look For
- Clean, minimal header design
- Quick access to keyboard shortcuts

### 💡 Optimal Use
- **Global Monitoring:** Raven always watches ALL projects simultaneously
- **No Filtering Needed:** All events, metrics, and activity shown with project badges for easy identification

---

## Overview Tab

### 🎯 What It Is
High-level dashboard showing the current state of all monitored projects.

### 📍 Location
Main Tab → **Overview** (default landing page)

### 🔧 What It Does
Consolidates key monitoring views:
1. **Dashboard** - Session info, uptime, project grid
2. **Metrics Panel** - Real-time CPU and memory usage per project

### ✅ What To Look For

#### Dashboard Section:
- **Session ID:** Current monitoring session identifier
- **Uptime:** How long Raven has been running
- **Project Grid:** Visual overview of all monitored projects with activity indicators

#### Metrics Section:
- **CPU Usage:** Per-project CPU consumption (look for spikes)
- **Memory Usage:** Per-project memory consumption (watch for steady increases = memory leaks)
- **Thresholds:** Automatic warnings when CPU > 80% or Memory > 85%

### 💡 Optimal Use
- **Health Check:** Start here every session to see overall system health
- **Quick Scan:** Identify which projects have recent activity
- **Resource Monitoring:** Watch metrics while AI agents work to catch performance issues

### ⚠️ Warning Signs
- 🔴 CPU constantly above 80%
- 🔴 Memory steadily climbing without leveling off
- 🟡 No activity when agents should be working

---

## Agents Tab

### 🎯 What It Is
Dedicated monitoring for AI agents (Claude Code, etc.) working on your projects.

### 📍 Location
Main Tab → **Agents**

### 🔧 Sub-Tabs

#### 1️⃣ Monitor (Default)
**What It Does:**
- Shows which agents are currently active
- Displays agent-specific telemetry and actions
- Real-time agent activity feed

**What To Look For:**
- Active agents and their current tasks
- Agent-initiated file changes
- Agent communication events
- Agent errors or stuck states

**Optimal Use:**
- Monitor AI agent behavior in real-time
- Verify agents are working as expected
- Catch agents going off-track early

#### 2️⃣ Events
**What It Does:**
- Filtered event log showing ONLY agent-generated events
- Excludes manual user edits and system events

**What To Look For:**
- What files the agent touched
- Sequence of agent actions
- Time gaps between agent actions (may indicate blocking)

**Optimal Use:**
- Post-session analysis: "What did the agent actually do?"
- Debugging agent behavior
- Verifying agent completed requested tasks

### 💡 Optimal Use
- **During Development:** Keep Monitor tab open to watch agent in real-time
- **After Session:** Review Events tab to audit what the agent changed
- **Learning:** Study agent patterns to understand how it approaches problems

### ⚠️ Warning Signs
- 🔴 Agent making rapid, repeated changes to same file (thrashing)
- 🔴 Agent modifying unexpected files
- 🟡 Long gaps with no activity (may be stuck waiting)
- 🟡 Agent activity after you thought it stopped

---

## Activity Tab

### 🎯 What It Is
Detailed view of ALL file changes, events, and code modifications across projects.

### 📍 Location
Main Tab → **Activity**

### 🔧 Sub-Tabs

#### 1️⃣ Live Feed (Default)
**What It Does:**
- Real-time stream of code changes with diffs
- Shows actual code that was added/removed
- Updates live as files change

**What To Look For:**
- **Green lines:** Code additions
- **Red lines:** Code deletions
- **File paths:** Which files are being modified
- **Timestamps:** When changes occurred

**Optimal Use:**
- Watch code changes happen in real-time
- Verify AI agent's code looks correct as it's written
- Catch problematic patterns immediately (e.g., adding console.logs everywhere)

**⚠️ Warning Signs:**
- 🔴 Large deletions you didn't expect
- 🔴 API keys or secrets being added
- 🟡 Same line being changed repeatedly
- 🟡 Whitespace-only changes (may indicate formatting issues)

---

#### 2️⃣ Event Log
**What It Does:**
- Chronological log of ALL filesystem events
- Includes file created, modified, deleted, renamed
- Searchable and filterable

**What To Look For:**
- **Event Type:** What kind of change (create/modify/delete/rename)
- **File Path:** Which file was affected
- **Timestamp:** When it happened
- **Project:** Which project it belongs to

**Optimal Use:**
- Search for specific file changes: "When was config.js last modified?"
- Filter by event type: "Show me all deleted files"
- Timeline analysis: "What happened between 2pm and 3pm?"
- Export events to CSV/JSON for external analysis

**Filters Available:**
- Text search (file names, paths)
- Event type (create, modify, delete, rename)
- Project filter (uses global header filter)
- Date range (if implemented)

---

#### 3️⃣ Files
**What It Does:**
- Browse all tracked files across projects
- View file history and snapshots
- Time-travel to previous file states
- Restore files to earlier versions

**What To Look For:**
- **File Tree:** Hierarchical view of monitored files
- **Snapshots Available:** Files with saved historical states
- **Last Modified:** Recency of changes

**Optimal Use:**
- Browse file history: "What did this file look like 2 hours ago?"
- Compare versions: View side-by-side diffs of file history
- Undo agent changes: Restore file to state before agent modified it
- Audit trail: See complete history of who/what changed a file

**Features:**
- 📸 **Snapshots:** Automatic captures of file state on every change
- ⏮️ **Time Travel:** View any previous version
- 🔄 **Restore:** One-click restore to earlier state
- 📊 **Diff Viewer:** Side-by-side comparison

**⚠️ Warning Signs:**
- 🔴 File with unusually high snapshot count (thrashing)
- 🟡 Large files with many versions (storage growth)

---

#### 4️⃣ Activity Log
**What It Does:**
- High-level summary of development activity
- Aggregates events into meaningful sessions
- Shows productivity patterns

**What To Look For:**
- **Activity Bursts:** Periods of intense file changes
- **Idle Periods:** Gaps with no activity
- **File Change Velocity:** How fast files are being modified
- **Project Distribution:** Which projects are most active

**Optimal Use:**
- Session retrospective: "How productive was today's session?"
- Pattern recognition: "When am I most productive?"
- Agent performance: "How long did the agent task take?"
- Time tracking: Approximate time spent on each project

---

## Analysis Tab

### 🎯 What It Is
Advanced analytics and debugging tools for understanding system and agent behavior.

### 📍 Location
Main Tab → **Analysis**

### 🔧 Sub-Tabs

#### 1️⃣ Performance (Default)
**What It Does:**
- Detailed performance metrics over time
- CPU/Memory graphs and charts
- Performance profiling data
- Identifies bottlenecks and slowdowns

**What To Look For:**
- **CPU Spikes:** When and why did CPU usage jump?
- **Memory Trends:** Is memory usage stable or growing?
- **Correlation:** Do file changes correlate with resource usage?
- **Performance Regressions:** Did recent changes slow things down?

**Optimal Use:**
- Baseline: Establish normal performance metrics
- Monitor: Watch during heavy agent workloads
- Debug: Identify what's causing high resource usage
- Optimize: Find inefficient operations

**Key Metrics:**
- CPU % (per project)
- Memory MB (per project)
- Event processing latency
- WebSocket connection health

**⚠️ Warning Signs:**
- 🔴 Memory climbing without plateau (leak)
- 🔴 CPU sustained above 90% (bottleneck)
- 🟡 Latency increasing over time
- 🟡 Frequent WebSocket reconnects

---

#### 2️⃣ Triggers
**What It Does:**
- Alert system for predefined conditions
- Configurable rules for notifications
- Trigger history and statistics

**What To Look For:**
- **Active Triggers:** Which alerts are currently enabled
- **Trigger Events:** When triggers fired
- **Trigger Frequency:** How often each trigger fires
- **Failed Triggers:** Rules that aren't working

**Optimal Use:**
- Configure alerts: "Notify me when CPU > 90% for 30 seconds"
- Pattern detection: "Alert when same file modified 10+ times in 5 minutes"
- Safety nets: "Warning when large file deletions occur"
- Learning: Review trigger history to understand system behavior

**Common Trigger Types:**
- Resource thresholds (CPU, memory, disk)
- File pattern matching (e.g., "*.env file modified")
- Event frequency (e.g., "too many rapid changes")
- Error conditions (e.g., "compile failed")

---

#### 3️⃣ Session Replay
**What It Does:**
- Visual playback of development sessions
- Timeline scrubbing to any point in history
- See exactly what happened and when

**What To Look For:**
- **Timeline:** Visual representation of session duration
- **Key Events:** Markers for significant moments
- **Playback Speed:** Control replay speed
- **Current State:** Position in timeline

**Optimal Use:**
- Debugging: "What happened right before the bug appeared?"
- Review: "Show me everything the agent did in this session"
- Learning: Watch patterns of successful development
- Documentation: Record sessions for training/reference

**Features:**
- ⏯️ Play/pause session replay
- ⏩ Speed control (1x, 2x, 5x, 10x)
- 🎯 Jump to specific event
- 🔍 Filter replay by file/event type

---

## System Tab

### 🎯 What It Is
System administration, health monitoring, and configuration.

### 📍 Location
Main Tab → **System**

### 🔧 Sub-Tabs

#### 1️⃣ Status (Default)
**What It Does:**
- Overall system health dashboard
- Quick-switch between monitored projects
- Active connections and services

**What To Look For:**
- **System Status:** All services running correctly?
- **Project Status:** Which projects are actively monitored?
- **Connection Health:** Backend/Frontend/WebSocket connected?
- **Recent Alerts:** Any system warnings?

**Optimal Use:**
- Health check: First stop when something feels wrong
- Project overview: See all monitored projects at a glance
- Quick switch: Jump between projects efficiently

---

#### 2️⃣ Storage
**What It Does:**
- Database and snapshot storage statistics
- Per-project storage breakdown
- Retention policy status
- Storage growth trends

**What To Look For:**
- **Total Storage:** How much disk space Raven uses
- **Database Size:** SQLite database file size
- **Snapshot Size:** Historical file snapshot storage
- **Growth Rate:** How fast storage is increasing
- **Per-Table Stats:** Which tables are largest

**Optimal Use:**
- Monitor: Check storage isn't growing out of control
- Cleanup: Identify what's consuming space
- Planning: Estimate future storage needs
- Optimization: Find redundant or unnecessary data

**Key Stats:**
- Total `.raven` directory size
- Database size per project
- Snapshot count and total size
- Records per table (events, metrics, logs)

**⚠️ Warning Signs:**
- 🔴 Storage growing > 10MB/day (may need retention cleanup)
- 🔴 Database > 1GB (performance may degrade)
- 🟡 Snapshots > 50% of total storage (consider compression)

---

#### 3️⃣ Server Sync
**What It Does:**
- Remote server backup and sync capabilities
- Push local Raven data to remote server
- Disaster recovery and multi-machine access

**What To Look For:**
- **Sync Status:** Last successful sync time
- **Remote Server:** Connection status
- **Pending Changes:** Data waiting to be synced
- **Sync Errors:** Failed sync attempts

**Optimal Use:**
- Backup: Automatically sync to remote server
- Multi-machine: Access Raven data from different computers
- Team: Share monitoring data with collaborators
- Safety: Ensure data isn't lost if local machine fails

**Features:**
- Manual sync trigger
- Auto-sync configuration
- Sync history and logs
- Conflict resolution

---

#### 4️⃣ Notifications
**What It Does:**
- Centralized notification center
- View all alerts, errors, and system messages
- Mark notifications as read/unread
- Delete or bulk-clear notifications

**What To Look For:**
- **Unread Count:** How many new notifications?
- **Severity:** Critical errors vs informational messages
- **Type:** Error logs, trigger events, system alerts
- **Timestamp:** When notifications occurred

**Optimal Use:**
- Triage: Review critical notifications first
- History: Don't miss important alerts
- Cleanup: Clear old notifications regularly
- Filtering: Show only errors or specific types

**Notification Types:**
- 🔴 **Critical:** Errors requiring immediate attention
- 🟡 **Warning:** Issues that should be reviewed
- 🔵 **Info:** General system messages
- 🟢 **Success:** Confirmations and completions

**Actions:**
- Mark as read/unread
- Delete individual notification
- Clear all notifications
- Filter by type/severity

---

#### 5️⃣ Errors
**What It Does:**
- Dedicated error log viewer
- All errors across all projects
- Stack traces and error details
- Error frequency and patterns

**What To Look For:**
- **Recent Errors:** What failed recently?
- **Error Type:** Syntax error, runtime error, system error?
- **Frequency:** Is same error repeating?
- **Stack Trace:** Where in code did error occur?
- **Component:** Which part of system errored?

**Optimal Use:**
- Debugging: Find root cause of failures
- Monitoring: Catch errors agents introduce
- Patterns: Identify recurring issues
- Alerting: Set up triggers for specific errors

**Error Details Include:**
- Timestamp
- Severity level
- Error message
- Component/file where error occurred
- Full stack trace
- Context (what was happening when error occurred)

**⚠️ When To Check:**
- After agent session completes
- When application behavior seems wrong
- Before committing agent changes
- Daily/weekly error review

---

#### 6️⃣ API Health
**What It Does:**
- Backend API endpoint monitoring
- Request/response health checks
- API latency and uptime tracking
- Endpoint-specific diagnostics

**What To Look For:**
- **Endpoint Status:** Which APIs are healthy?
- **Response Times:** Are endpoints slow?
- **Error Rates:** Are requests failing?
- **Uptime:** How reliable is the backend?

**Optimal Use:**
- Troubleshooting: "Why isn't data loading?"
- Performance: Identify slow API endpoints
- Reliability: Track backend stability
- Optimization: Find bottlenecks in API layer

**Monitored Endpoints:**
- `/api/session-id` - Session identification
- `/api/projects/list` - Project listing
- `/api/events` - Event retrieval
- `/api/metrics` - Metrics data
- `/api/storage` - Storage statistics
- And more...

**Health Indicators:**
- ✅ Green: Response < 100ms, success
- 🟡 Yellow: Response 100-500ms, occasional failures
- 🔴 Red: Response > 500ms or frequent failures

---

#### 7️⃣ Settings
**What It Does:**
- Raven configuration and preferences
- Customize monitoring behavior
- Theme and display options
- Advanced features toggle

**What To Look For:**
- **Monitoring Config:** Watch paths, debounce settings
- **Retention Policies:** How long to keep data
- **Performance Tuning:** Metrics collection frequency
- **UI Preferences:** Theme, notifications, keyboard shortcuts

**Optimal Use:**
- Initial setup: Configure for your workflow
- Tuning: Adjust based on experience
- Troubleshooting: Disable problematic features
- Optimization: Balance detail vs performance

**Common Settings:**
- Watch path (which directory to monitor)
- Debounce delay (how long to wait before logging changes)
- Metrics interval (how often to collect CPU/memory)
- Snapshot retention (how many days to keep snapshots)
- CPU/Memory thresholds (when to trigger alerts)
- Theme selection (Day/Dusk/Night)

---

## About/Changelog/Docs

### About Page
**What It Is:** Version info, credits, system information
**What To Look For:** Current Raven version, license info, links
**Optimal Use:** Quick reference for version when reporting issues

### Changelog Page
**What It Is:** Release history and feature additions
**What To Look For:** What's new in recent versions, breaking changes
**Optimal Use:** Stay informed about new features and improvements

### Docs Page
**What It Is:** Embedded documentation viewer
**What To Look For:** Setup guides, API docs, troubleshooting
**Optimal Use:** In-app help without leaving Raven

---

## Global Features

### Keyboard Shortcuts
Press `?` anywhere to see all shortcuts:

**Navigation:**
- `Escape` - Close modals/help

**Tabs:** (if implemented)
- `1-7` - Jump to specific tabs

**Actions:**
- `r` - Refresh current view
- `/` - Focus search

### Toast Notifications
**Location:** Top-right corner

**Types:**
- Success (green) - Confirmations
- Info (blue) - General messages
- Warning (yellow) - Cautions
- Error (red) - Critical issues

**Behavior:**
- Auto-dismiss after 3-5 seconds
- Click to dismiss immediately
- Stack multiple notifications

### Themes
**Location:** Footer theme selector

**Options:**
1. **Day (Gruvbox)** - Light theme, high contrast
2. **Dusk (Ristretto)** - Medium theme, warm tones
3. **Night (Tokyo Night)** - Dark theme, low eye strain (default)

**Optimal Use:**
- Day: Bright environments, debugging
- Dusk: Transition times, presentations
- Night: Extended use, low-light environments

---

## 📊 Typical Workflows

### 🔹 Morning Startup
1. Open Raven → **Overview** tab
2. Check system health (metrics, git status)
3. Review **System → Notifications** for overnight alerts
4. Check **System → Errors** for any issues
5. Ready to develop!

### 🔹 During AI Agent Session
1. **Agents → Monitor** - Watch agent work in real-time
2. **Activity → Live Feed** - See code changes as they happen
3. **Overview → Metrics** - Ensure agent isn't consuming too many resources
4. **Analysis → Performance** - Watch for performance degradation

### 🔹 After AI Agent Session
1. **Agents → Events** - Review what agent did
2. **Activity → Event Log** - Check all file changes
3. **System → Errors** - Verify no errors introduced
4. **Activity → Files** - Review critical files, restore if needed
5. **Overview → Git** - See changes ready to commit

### 🔹 Weekly Maintenance
1. **System → Storage** - Check storage growth
2. **System → Notifications** - Clear old notifications
3. **System → Errors** - Review error patterns
4. **Analysis → Triggers** - Tune alert thresholds
5. **Activity → Activity Log** - Productivity review

### 🔹 Troubleshooting
1. **System → Status** - Verify all services healthy
2. **System → API Health** - Check backend connectivity
3. **System → Errors** - Find recent errors
4. **Analysis → Performance** - Identify resource issues
5. **Activity → Event Log** - Timeline of what happened

---

## 🎯 What Each Tab Is Best For

| Tab | Best For | Check When |
|-----|----------|------------|
| **Overview** | Quick health check, starting point | Beginning of session |
| **Agents** | Monitoring AI agent behavior | During agent work, after session |
| **Activity** | Understanding what changed | After any changes, debugging |
| **Analysis** | Performance tuning, deep debugging | Performance issues, optimization |
| **System** | Configuration, administration | Setup, maintenance, troubleshooting |

---

## ⚠️ Critical Warning Signs

**Immediate Action Required:**
- 🚨 Memory continuously climbing (memory leak)
- 🚨 Repeated error messages flooding error log
- 🚨 Agent modifying unexpected/critical files
- 🚨 Large file deletions

**Review Soon:**
- ⚠️ CPU sustained above 80%
- ⚠️ Storage growing > 10MB/day
- ⚠️ Many uncommitted changes piling up
- ⚠️ Notifications going unread for days

**Monitor:**
- 💡 Same file being modified repeatedly
- 💡 Long gaps in agent activity
- 💡 Unfamiliar files appearing in monitored directories

---

## 📝 Tips for Optimal Use

1. **Set Your Baseline:**
   Run Raven during normal development (without agents) to establish baseline CPU/memory usage.

2. **Use Project Filtering:**
   Filter to specific project when debugging—reduces noise significantly.

3. **Review Errors Daily:**
   Check System → Errors at end of each session. Catch issues early.

4. **Configure Triggers:**
   Set up alerts for your most common issues (e.g., "same file modified 10+ times").

5. **Monitor Storage Weekly:**
   Storage can grow fast. Check System → Storage weekly and clean if needed.

6. **Learn Keyboard Shortcuts:**
   Press `?` and memorize 3-4 shortcuts. Dramatically speeds up navigation.

7. **Use Time Travel Carefully:**
   Activity → Files → Restore is powerful but can overwrite work. Double-check before restoring.

8. **Export Event Logs:**
   For deep analysis, export Activity → Event Log to CSV and analyze in spreadsheet.

---

## 🤔 Common Questions

**Q: Which tab should I keep open while coding?**
A: Keep **Agents → Monitor** or **Activity → Live Feed** open. Gives real-time feedback.

**Q: How do I find when a specific file was changed?**
A: **Activity → Event Log** → Search for filename → Sort by timestamp

**Q: Raven is using too much storage, what do I do?**
A: **System → Storage** → Review what's large → Adjust retention policy in Settings

**Q: Where do I see agent errors?**
A: **System → Errors** for all errors, or **Agents → Events** filtered by error type

**Q: Can I undo what the agent did?**
A: Yes! **Activity → Files** → Select file → View history → Restore to previous version

**Q: How do I know if my agent is stuck?**
A: **Agents → Monitor** - Look for long gaps with no activity. Check metrics for resource usage.

---

## 📚 Next Steps

After reading this guide:

1. ✅ Open Raven and explore each tab
2. ✅ Practice filtering to specific project
3. ✅ Learn 3-4 keyboard shortcuts
4. ✅ Watch agent work in real-time
5. ✅ Review errors after your next session

**Questions or issues?** Check the **Docs** tab for troubleshooting guides.

---

**Document Status:** Complete comprehensive reference
**Feedback:** This is a living document - user feedback will improve it!
