# 🔍 Raven UX/UI Comprehensive Audit Report

**Audit Date:** October 18, 2025
**Perspective:** User monitoring Claude Code in real-time
**Version:** 0.6.0

---

## 📋 Table of Contents

1. [Executive Summary](#executive-summary)
2. [Current State Inventory](#current-state-inventory)
3. [Critical Issues](#critical-issues)
4. [User Journey Analysis](#user-journey-analysis)
5. [Proposed Reorganization](#proposed-reorganization)
6. [Detailed Page Designs](#detailed-page-designs)
7. [Implementation Plan](#implementation-plan)
8. [Expected Improvements](#expected-improvements)
9. [Success Criteria](#success-criteria)

---

## 🎯 Executive Summary

### Current State
- **10 navigation tabs** (too many)
- **Significant feature duplication** (Git in 2 places, monitoring in 4 places)
- **Unclear information architecture** (which page for real-time monitoring?)
- **Feature sprawl** (pages trying to do too much)

### Critical Finding
> Raven has excellent features but poor organization. Users face navigation overload and can't quickly find what they need.

### Recommendation
**Consolidate to 5 core pages** with clear, focused purposes:

```
Current:  10 tabs → overwhelming
Proposed:  5 tabs → clear and focused

🔴 LIVE  |  📜 HISTORY  |  🤖 AGENTS  |  ⚙️ SYSTEM  |  🌳 REPOSITORY
```

---

## 📊 Current State Inventory

### Existing Pages (10 Total)

| # | Current Tab | Primary Features | Real-time? | Issues |
|---|-------------|------------------|------------|--------|
| 1 | Dashboard | Stats, top files, longest edits, active agents | ✅ Yes | Not actually "live" feed |
| 2 | Live Feed | File tree, code changes, recent activity (20 items) | ✅ Yes | Limited to 20 items |
| 3 | Git | Status, branches, commits, file diffs | ❌ No | Duplicated in Status |
| 4 | Session Replay | Event timeline by session | ❌ No | Disconnected from Activity Log |
| 5 | Performance | System metrics, CPU, memory, correlations | ✅ Yes | Should be in System |
| 6 | Triggers | Alert rules, triggered events, stats | ✅ Yes | Should be in System |
| 7 | Agents | Agent status, activity, performance (3 sub-tabs!) | ✅ Yes | Too many sub-tabs |
| 8 | Status | Health, git status, commits, diffs | ❌ Partial | Git duplication! |
| 9 | API Health | Endpoint health checks, response times | ❌ No | Should merge with Status |
| 10 | Activity Log | Comprehensive event log, search, filters | ❌ No | NOT real-time! |

### Component Inventory

**Total Svelte Components:** 24

**Core Pages:**
- Dashboard.svelte
- LiveCodeFeed.svelte
- GitPanel.svelte
- SessionReplay.svelte
- PerformancePanel.svelte
- TriggersPanel.svelte
- AgentsPanel.svelte
- StatusPanel.svelte
- APIHealthMonitor.svelte
- ActivityLog.svelte

**Shared Components:**
- DiffViewer.svelte
- EventFeed.svelte
- FileBrowser.svelte
- FileHistory.svelte
- MetricsPanel.svelte
- TimelineSlider.svelte
- ProjectSelector.svelte
- KeyboardShortcuts.svelte

---

## 🚨 Critical Issues

### Issue #1: Major Feature Duplication

#### Git Features Appear in 2 Places

**Git Panel:**
- ✅ Full git status
- ✅ Branch list
- ✅ Commit history
- ✅ Inline diffs

**Status Panel:**
- ❌ Git status (duplicate!)
- ❌ Commits (duplicate!)
- ❌ File diffs (duplicate!)

**Problem:** Users don't know which one to use. Status panel should be about system health, not git operations.

#### Monitoring Features Scattered Across 4 Locations

**Dashboard:**
- Agent status cards
- File statistics
- Top modified files

**Live Feed:**
- File changes (real-time)
- Recent activity (limited to 20)
- File tree

**Agents Panel:**
- Agent monitoring
- Agent activity
- Agent performance

**Activity Log:**
- Comprehensive event log
- Full search/filter
- **BUT NO REAL-TIME UPDATES!**

**Problem:** Massive overlap. Live Feed and Activity Log serve nearly identical purposes but one is real-time and one isn't.

#### System Health Split Across 2 Locations

**Status Panel:**
- Backend health
- Uptime
- Memory usage

**API Health:**
- Endpoint checks
- Response times

**Problem:** Both are "health monitoring" but in separate tabs. Users check both to get full picture.

### Issue #2: Unclear Primary Use Case

**User's Goal:** "I want to watch Claude Code work in real-time"

**Current Confusion:**

```
User thinks: "Where do I watch Claude Code?"

Option 1: Dashboard?
  → Has stats but not a live feed

Option 2: Live Feed?
  → Has file tree but activity limited to 20 items

Option 3: Activity Log?
  → Comprehensive but NO real-time updates!

Option 4: Agents?
  → Focused on agents, not files

Result: User clicks through multiple tabs, gets frustrated
```

### Issue #3: Navigation Overload

**Research shows:** Optimal navigation has 5-7 main items

**Raven currently has:** 10 tabs (plus 2 in footer)

**Problem:** Users can't remember what's where

```
Current Navigation Bar:
┌─────────────────────────────────────────────────────────────────────┐
│ 📊Dashboard | 🔴Live Feed | 🌳Git | 🎬Replay | ⚡Performance |      │
│ 🔔Triggers | 🤖Agents | 🏥Status | 🔌API Health | 📜Activity Log    │
└─────────────────────────────────────────────────────────────────────┘
Too many options = decision paralysis
```

### Issue #4: Feature Sprawl

**Agents Panel has 3 internal tabs:**
1. Overview
2. Activity
3. Performance

**Problem:** This creates a 2-level navigation hierarchy that's confusing.
- Performance metrics belong in Performance panel
- Activity belongs in Activity feed
- Only agent status should be here

### Issue #5: Inconsistent Real-time Updates

Some pages have WebSocket integration, some don't:

| Page | Real-time? | Why Inconsistent? |
|------|-----------|-------------------|
| Dashboard | ✅ Yes | Good |
| Live Feed | ✅ Yes | Good |
| Performance | ✅ Yes | Good |
| Triggers | ✅ Yes | Good |
| Agents | ✅ Yes | Good |
| **Git** | ❌ No | Should refresh on git events |
| **Session Replay** | ❌ No | Historical view, OK |
| **Status** | ❌ No | Should be real-time! |
| **API Health** | ❌ No | Should be real-time! |
| **Activity Log** | ❌ No | **SHOULD BE REAL-TIME!** |

**Problem:** Users expect real-time monitoring across the board.

### Issue #6: Session Replay is Orphaned

**Session Replay** feels disconnected:
- Timeline viewer with no connection to Activity Log
- Only shows agent events, not file events
- Limited session selector
- Feels like an afterthought

**Should be:** Part of a larger "History" view that includes all events

---

## 🎯 User Journey Analysis

### Primary Use Case: Monitoring Claude Code

**User Mental Model:**

```
┌─────────────────────────────────────────────────────────────┐
│ 1. "Show me what's happening NOW"    → Live monitoring      │
│ 2. "Show me what happened"           → History/replay       │
│ 3. "How is the system performing?"   → System health        │
│ 4. "Let me manage the repository"    → Git operations       │
└─────────────────────────────────────────────────────────────┘
```

### Current Experience (Broken)

```
User opens Raven
    ↓
Lands on Dashboard (sees stats, not live activity)
    ↓
Clicks "Live Feed" (finds file tree, but activity limited)
    ↓
Clicks "Activity Log" (comprehensive but NOT real-time!)
    ↓
Confused about Git vs Status (which one to use?)
    ↓
Overwhelmed by 10 tabs
    ↓
❌ Frustrated, closes Raven
```

### Desired Experience (Fixed)

```
User opens Raven
    ↓
Lands on LIVE page (real-time everything, auto-scrolling feed)
    ↓
Sees Claude Code editing files in real-time
    ↓
Clicks file to see diff inline
    ↓
Switches to HISTORY to review past session
    ↓
Checks SYSTEM to see performance metrics
    ↓
✅ Happy, productive user
```

---

## 💡 Proposed Reorganization

### New Navigation Structure

**Consolidate from 10 tabs → 5 pages**

```
┌─────────────────────────────────────────────────────────────┐
│  🔴 LIVE  |  📜 HISTORY  |  🤖 AGENTS  |  ⚙️ SYSTEM  |  🌳 REPO  │
└─────────────────────────────────────────────────────────────┘
   Primary    Archive      Agent-specific  Health/Config  Git
```

### Page Mapping

| New Page | What Goes Here | Combines From |
|----------|---------------|---------------|
| **🔴 LIVE** | Real-time monitoring, primary view | Dashboard + Live Feed + Activity Log (recent) |
| **📜 HISTORY** | Archive, session replay, deep dives | Session Replay + Activity Log (archive) + Git history |
| **🤖 AGENTS** | Agent-specific monitoring | Agents Panel (simplified, single view) |
| **⚙️ SYSTEM** | Health, performance, triggers, API | Status + API Health + Performance + Triggers |
| **🌳 REPO** | Git operations, file management | Git Panel only (remove from Status) |

### Features Eliminated (Duplication)

✅ **Removed from Status Panel:** Git status, commits, diffs (only in REPO)
✅ **Removed from Agents Panel:** Sub-tabs (Overview/Activity/Performance)
✅ **Merged:** Live Feed + Dashboard + Activity Log → LIVE
✅ **Merged:** Status + API Health + Performance + Triggers → SYSTEM
✅ **Merged:** Session Replay + Activity Log archive → HISTORY

---

## 📐 Detailed Page Designs

### PAGE 1: 🔴 LIVE (Primary Landing Page)

**Purpose:** Watch what's happening RIGHT NOW

**User Goal:** "Show me Claude Code working in real-time"

**Layout: 3-Column Dashboard**

```
┌──────────────────────────────────────────────────────────────────────┐
│  🔴 LIVE MONITORING                              Session: xxx         │
│                                              ⏸️ Pause  🔄 Refresh     │
├──────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  ┌────────────────┐  ┌──────────────────────┐  ┌─────────────────┐  │
│  │   LEFT         │  │   CENTER (MAIN)      │  │   RIGHT         │  │
│  │   STATS        │  │   LIVE EVENT FEED    │  │   CONTEXT       │  │
│  └────────────────┘  └──────────────────────┘  └─────────────────┘  │
│                                                                       │
│  ┌────────────────┐  ┌──────────────────────┐  ┌─────────────────┐  │
│  │ 📊 QUICK STATS │  │ 🔴 LIVE EVENTS       │  │ 🤖 ACTIVE AGENTS│  │
│  │                │  │                      │  │                 │  │
│  │ Total: 342     │  │ [Auto-scrolling feed]│  │ ● Claude  ON    │  │
│  │ Creates: 45    │  │                      │  │ ○ GPT-4   OFF   │  │
│  │ Edits: 280     │  │ 14:32:15  FILE       │  │                 │  │
│  │ Deletes: 17    │  │ server.js edited     │  │ ⚙️ SYSTEM       │  │
│  │                │  │ +45 lines            │  │ CPU: 45%        │  │
│  │ 📁 FILES       │  │ [expand for diff]    │  │ MEM: 2.3GB      │  │
│  │ Tracked: 142   │  │                      │  │ Uptime: 2h 34m  │  │
│  │ Active: 23     │  │ 14:31:02  AGENT      │  │                 │  │
│  │                │  │ Claude started task  │  │ 🌳 CHANGED      │  │
│  │ 🔥 TOP 5       │  │                      │  │ Files (12)      │  │
│  │ 1. server.js   │  │ 14:30:45  GIT        │  │                 │  │
│  │    45 edits    │  │ Committed "fix bug"  │  │ 📂 backend/     │  │
│  │ 2. db.js       │  │                      │  │  ├─ server.js ● │  │
│  │    32 edits    │  │ 14:29:12  FILE       │  │  └─ db.js     ● │  │
│  │ 3. api.js      │  │ db.js created        │  │ 📂 frontend/    │  │
│  │    28 edits    │  │                      │  │  └─ App.svelte ●│  │
│  │ 4. config.toml │  │ [Search/Filter]      │  │                 │  │
│  │    12 edits    │  │ [Export CSV/JSON]    │  │ (click to view) │  │
│  │ 5. README.md   │  │                      │  │                 │  │
│  │    8 edits     │  │ Last 100 events      │  │                 │  │
│  │                │  │ ↓ Load More          │  │                 │  │
│  └────────────────┘  └──────────────────────┘  └─────────────────┘  │
│                                                                       │
└──────────────────────────────────────────────────────────────────────┘
```

**Key Features:**

✅ **Real-time WebSocket updates** (auto-scrolling event feed)
✅ **Pause button** to stop auto-scroll and examine events
✅ **Inline expansion** - click event to see diff/details
✅ **Quick stats** - at-a-glance metrics
✅ **File tree** - shows changed files with indicators
✅ **Agent status** - see what agents are active
✅ **System metrics** - mini CPU/memory view
✅ **Search/filter** - find specific events
✅ **Export** - CSV/JSON download

**What This Combines:**
- Dashboard stats cards
- Live Feed's file tree and changes
- Activity Log's comprehensive event feed
- Agent status overview
- System health mini-view

**What's Different:**
- **Real-time by default** (WebSocket)
- **No pagination** (continuous scroll with load more)
- **Expandable inline** (no navigation to see details)
- **Pause/resume** for examination
- **Everything in one view**

---

### PAGE 2: 📜 HISTORY

**Purpose:** Review what happened in past sessions

**User Goal:** "Show me what happened yesterday/last week"

**Layout: Timeline + Session Selector**

```
┌──────────────────────────────────────────────────────────────────────┐
│  📜 HISTORY & REPLAY                                                  │
├──────────────────────────────────────────────────────────────────────┤
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │ Filters & Search                                               │  │
│  │                                                                 │  │
│  │ Session: [All Sessions ▼]  Date: [Last 7 days ▼]              │  │
│  │ Type: [All ▼]  Agent: [All ▼]  Search: [________] 🔍         │  │
│  └────────────────────────────────────────────────────────────────┘  │
│                                                                       │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │ 📊 Session Stats                                               │  │
│  │ Total Events: 1,234  |  Files Modified: 45  |  Duration: 3h   │  │
│  └────────────────────────────────────────────────────────────────┘  │
│                                                                       │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │ 🕐 EVENT TIMELINE (Unified)                                    │  │
│  │                                                                 │  │
│  │ ├─ Oct 18, 14:32:15  FILE      server.js edited (45 lines)    │  │
│  │ │  Agent: Claude  Session: xxx  [View Diff] [Restore]         │  │
│  │ │                                                              │  │
│  │ ├─ Oct 18, 14:31:02  AGENT     Claude started task            │  │
│  │ │  Task: Fix authentication bug  Duration: 120s               │  │
│  │ │                                                              │  │
│  │ ├─ Oct 18, 14:30:45  GIT       Committed "fix bug"            │  │
│  │ │  Branch: master  Files: 3  [View Commit]                    │  │
│  │ │                                                              │  │
│  │ ├─ Oct 18, 14:29:12  FILE      db.js created                  │  │
│  │ │  Agent: Claude  Lines: 123  [View Content]                  │  │
│  │ │                                                              │  │
│  │ ├─ Oct 18, 14:28:45  SYSTEM    Trigger fired: "Large edit"    │  │
│  │ │  Rule: lines_changed > 100  File: server.js                 │  │
│  │ │                                                              │  │
│  │ └─ Oct 18, 14:28:00  AGENT     Claude completed task          │  │
│  │    Result: Success  Files modified: 2                          │  │
│  │                                                                 │  │
│  │ [Load More (100)] [Export Session] [Export CSV] [Export JSON] │  │
│  └────────────────────────────────────────────────────────────────┘  │
│                                                                       │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │ 📄 DETAILS PANEL (Expands when clicking event)                │  │
│  │                                                                 │  │
│  │ server.js - Oct 18, 14:32:15                                   │  │
│  │ Agent: Claude  |  Lines changed: +45, -12  |  Session: xxx    │  │
│  │                                                                 │  │
│  │ [Tabs: Diff | Full Content | Snapshot | Git Blame]            │  │
│  │                                                                 │  │
│  │ ┌────────────────────────────────────────────────────────────┐ │  │
│  │ │ + const newFeature = () => {                                │ │  │
│  │ │ +   return true;                                            │ │  │
│  │ │ + };                                                        │ │  │
│  │ │ - const oldCode = false;                                    │ │  │
│  │ └────────────────────────────────────────────────────────────┘ │  │
│  │                                                                 │  │
│  │ [Restore to This Version] [Download Snapshot]                 │  │
│  └────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────┘
```

**Key Features:**

✅ **Unified timeline** - ALL events (files + agents + git + system)
✅ **Session filtering** - view specific sessions
✅ **Date range** - last 24h, 7 days, 30 days, custom
✅ **Event type filter** - file, agent, git, system
✅ **Agent filter** - see only Claude events, etc.
✅ **Full-text search** - find specific changes
✅ **Expandable details** - click to see diff/snapshot
✅ **Export** - session, CSV, JSON formats
✅ **Restore** - time-travel file restoration
✅ **Pagination** - load 100 events at a time

**What This Combines:**
- Session Replay (session selector, timeline)
- Activity Log (full archive, search, filters)
- Git commit history (integrated into timeline)
- File history viewer
- Diff viewer

**What's Different:**
- **No real-time updates** (this is historical archive)
- **All event types** in one timeline (not just agent events)
- **More powerful filtering** (session + date + type + agent)
- **Export entire sessions** (not just individual events)

---

### PAGE 3: 🤖 AGENTS

**Purpose:** Monitor AI agent behavior and performance

**User Goal:** "How is Claude performing? What is it doing?"

**Layout: Agent Grid + Selected Agent Details**

```
┌──────────────────────────────────────────────────────────────────────┐
│  🤖 AI AGENTS                                         🔄 Refresh      │
├──────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │ 🎯 AGENT OVERVIEW                                              │  │
│  │                                                                 │  │
│  │ ┌─────────────┐  ┌─────────────┐  ┌─────────────┐            │  │
│  │ │ ● Claude    │  │ ○ GPT-4     │  │ ○ Gemini    │            │  │
│  │ │ Sonnet 4.5  │  │ Turbo       │  │ Pro         │            │  │
│  │ │             │  │             │  │             │            │  │
│  │ │ ✅ Running  │  │ ⏸️ Idle     │  │ ❌ Offline  │            │  │
│  │ │             │  │             │  │             │            │  │
│  │ │ 127 edits   │  │ 45 edits    │  │ 0 edits     │            │  │
│  │ │ 2.3s avg    │  │ 1.8s avg    │  │ -           │            │  │
│  │ │ Last: 30s   │  │ Last: 5m    │  │ Never       │            │  │
│  │ │             │  │             │  │             │            │  │
│  │ │ [Selected]  │  │ [Click]     │  │ [Click]     │            │  │
│  │ └─────────────┘  └─────────────┘  └─────────────┘            │  │
│  └────────────────────────────────────────────────────────────────┘  │
│                                                                       │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │ 📊 CLAUDE - DETAILED VIEW                                      │  │
│  │                                                                 │  │
│  │ Status: ● Running  |  Model: Sonnet 4.5  |  Session: xxx      │  │
│  │                                                                 │  │
│  │ ┌──────────────┐  ┌──────────────┐  ┌──────────────┐         │  │
│  │ │ Total Edits  │  │ Avg Time     │  │ Success Rate │         │  │
│  │ │ 127          │  │ 2.3s         │  │ 98.4%        │         │  │
│  │ └──────────────┘  └──────────────┘  └──────────────┘         │  │
│  │                                                                 │  │
│  │ ──────────────────────────────────────────────────────────────  │  │
│  │                                                                 │  │
│  │ 📝 Recent Activity (Last 20 Events)                            │  │
│  │                                                                 │  │
│  │ 14:32:15  Edited server.js (+45 lines, -12 lines)             │  │
│  │          Duration: 2.1s  ✅ Success                            │  │
│  │                                                                 │  │
│  │ 14:30:45  Edited db.js (+12 lines)                             │  │
│  │          Duration: 1.8s  ✅ Success                            │  │
│  │                                                                 │  │
│  │ 14:28:30  Created api.js (123 lines)                           │  │
│  │          Duration: 3.5s  ✅ Success                            │  │
│  │                                                                 │  │
│  │ [View All Activity in History →]                               │  │
│  │                                                                 │  │
│  │ ──────────────────────────────────────────────────────────────  │  │
│  │                                                                 │  │
│  │ ⚡ Performance Metrics                                          │  │
│  │                                                                 │  │
│  │ ┌─────────────────────────────────────────────────────────┐   │  │
│  │ │ Response Time (last hour)                               │   │  │
│  │ │ [Graph showing response times over time]                │   │  │
│  │ │ Min: 0.8s  Max: 5.2s  Avg: 2.3s                         │   │  │
│  │ └─────────────────────────────────────────────────────────┘   │  │
│  │                                                                 │  │
│  │ CPU Usage: 12%  |  Memory: 450MB  |  Requests: 127            │  │
│  │                                                                 │  │
│  │ [View Detailed Metrics in System →]                            │  │
│  └────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────┘
```

**Key Features:**

✅ **Agent cards** - at-a-glance status for all agents
✅ **Click to select** - see details for one agent
✅ **Real-time status** - running/idle/offline indicators
✅ **Quick stats** - edits, avg time, success rate
✅ **Recent activity** - last 20 events for selected agent
✅ **Performance mini-graph** - response times
✅ **Links to details** - "View all in History", "View metrics in System"

**What This Combines:**
- Agent Panel Overview (agent cards)
- Agent Panel Activity (recent 20 events only)
- Agent Panel Performance (simplified metrics)

**What's Different:**
- **Single view** (no sub-tabs!)
- **Click agent to see details** (not tabs)
- **Recent activity only** (full history in History page)
- **Mini performance view** (detailed metrics in System page)
- **Clear links** to other pages for more detail

**What This REMOVES:**
- ❌ 3 sub-tabs (Overview/Activity/Performance)
- ❌ Full activity log (moved to History)
- ❌ Detailed performance metrics (moved to System)

---

### PAGE 4: ⚙️ SYSTEM

**Purpose:** Monitor system health, performance, and configuration

**User Goal:** "Is Raven healthy? Is the system performing well?"

**Layout: Tabbed Interface (4 Sections)**

**Navigation:**
```
┌──────────────────────────────────────────────────────────────┐
│  ⚙️ SYSTEM                                                    │
│                                                               │
│  [🏥 Health] [⚡ Performance] [🔔 Triggers] [🔌 API]         │
└──────────────────────────────────────────────────────────────┘
```

#### Tab 1: 🏥 Health

```
┌──────────────────────────────────────────────────────────────────────┐
│  🏥 SYSTEM HEALTH                                     ✅ All Systems OK│
├──────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │ 📊 CORE SERVICES                                               │  │
│  │                                                                 │  │
│  │ ┌──────────────┐  ┌──────────────┐  ┌──────────────┐         │  │
│  │ │ ● Backend    │  │ ● WebSocket  │  │ ● Database   │         │  │
│  │ │ Online       │  │ Connected    │  │ Healthy      │         │  │
│  │ │ Port: 3030   │  │ Clients: 1   │  │ Size: 45MB   │         │  │
│  │ │ Uptime: 2h   │  │              │  │ Lock: None   │         │  │
│  │ └──────────────┘  └──────────────┘  └──────────────┘         │  │
│  └────────────────────────────────────────────────────────────────┘  │
│                                                                       │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │ 💻 SYSTEM RESOURCES                                            │  │
│  │                                                                 │  │
│  │ CPU:    [████████░░] 45%       Memory: [██████░░░░] 2.3GB/16GB │  │
│  │ Disk:   [████░░░░░░] 85GB/500GB  Network: ↓ 1.2MB/s ↑ 0.3MB/s │  │
│  │                                                                 │  │
│  │ Process Memory: Backend 85MB | Frontend 45MB                   │  │
│  └────────────────────────────────────────────────────────────────┘  │
│                                                                       │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │ 🔌 API ENDPOINTS (Auto-checked every 30s)                      │  │
│  │                                                                 │  │
│  │ Category: Core                                                  │  │
│  │ ✅ /health                    45ms    Last: 5s ago             │  │
│  │ ✅ /api/session-id            23ms    Last: 5s ago             │  │
│  │                                                                 │  │
│  │ Category: Dashboard                                             │  │
│  │ ✅ /api/dashboard-stats      120ms    Last: 10s ago            │  │
│  │ ✅ /api/top-modified-files    85ms    Last: 10s ago            │  │
│  │                                                                 │  │
│  │ Category: Agents                                                │  │
│  │ ✅ /api/agents-status         95ms    Last: 8s ago             │  │
│  │ ✅ /api/agent-events          67ms    Last: 8s ago             │  │
│  │                                                                 │  │
│  │ Category: Git                                                   │  │
│  │ ✅ /api/git/status           156ms    Last: 12s ago            │  │
│  │ ⚠️ /api/git/history          520ms    Slow!                    │  │
│  │                                                                 │  │
│  │ ❌ Failed Endpoints: 0  |  ⚠️ Slow Endpoints: 1                │  │
│  │                                                                 │  │
│  │ [Test All Endpoints Now] [Export Health Report]                │  │
│  └────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────┘
```

#### Tab 2: ⚡ Performance

```
┌──────────────────────────────────────────────────────────────────────┐
│  ⚡ PERFORMANCE PROFILING                                             │
├──────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │ 📈 SYSTEM METRICS (Last Hour)                                  │  │
│  │                                                                 │  │
│  │ [Graph: CPU Usage over time]                                   │  │
│  │ [Graph: Memory Usage over time]                                │  │
│  │ [Graph: Network I/O over time]                                 │  │
│  │                                                                 │  │
│  │ Stats: Min/Max/Avg shown on graphs                             │  │
│  └────────────────────────────────────────────────────────────────┘  │
│                                                                       │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │ 🤖 PROCESS METRICS (Per Agent)                                 │  │
│  │                                                                 │  │
│  │ Agent: [Claude ▼]                                              │  │
│  │                                                                 │  │
│  │ ┌──────────────┐  ┌──────────────┐  ┌──────────────┐         │  │
│  │ │ CPU Usage    │  │ Memory       │  │ Disk I/O     │         │  │
│  │ │ 12%          │  │ 450MB        │  │ 2.3MB/s      │         │  │
│  │ └──────────────┘  └──────────────┘  └──────────────┘         │  │
│  │                                                                 │  │
│  │ [Graph: Agent CPU over time]                                   │  │
│  │ [Graph: Agent Memory over time]                                │  │
│  └────────────────────────────────────────────────────────────────┘  │
│                                                                       │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │ 🔗 PERFORMANCE CORRELATIONS                                    │  │
│  │                                                                 │  │
│  │ When agent edits exceed 50 lines:                              │  │
│  │ - CPU spikes to 85% (correlation: 0.92)                        │  │
│  │ - Memory increases by avg 120MB (correlation: 0.78)            │  │
│  │ - Response time increases by 2.3s (correlation: 0.81)          │  │
│  └────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────┘
```

#### Tab 3: 🔔 Triggers

```
┌──────────────────────────────────────────────────────────────────────┐
│  🔔 ALERT TRIGGERS                                                    │
├──────────────────────────────────────────────────────────────────────┤
│  [📋 Rules] [🔔 Events] [📊 Stats]                                   │
│                                                                       │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │ 📋 TRIGGER RULES                                               │  │
│  │                                                                 │  │
│  │ ┌────────────────────────────────────────────────────────────┐ │  │
│  │ │ ✅ large_edit                                              │ │  │
│  │ │ Trigger when: lines_changed > 100                          │ │  │
│  │ │ File pattern: *.js                                         │ │  │
│  │ │ Action: log                                                │ │  │
│  │ │ Cooldown: 60s                                              │ │  │
│  │ │ Times fired: 23                                            │ │  │
│  │ └────────────────────────────────────────────────────────────┘ │  │
│  │                                                                 │  │
│  │ ┌────────────────────────────────────────────────────────────┐ │  │
│  │ │ ✅ slow_operation                                          │ │  │
│  │ │ Trigger when: duration_ms > 5000                           │ │  │
│  │ │ Agent: claude                                              │ │  │
│  │ │ Action: log                                                │ │  │
│  │ │ Cooldown: 120s                                             │ │  │
│  │ │ Times fired: 7                                             │ │  │
│  │ └────────────────────────────────────────────────────────────┘ │  │
│  │                                                                 │  │
│  │ [Reload Config] [Clear Cooldowns] [Edit Config File]          │  │
│  └────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────┘
```

#### Tab 4: 🔌 API

*(Same as Health tab's API endpoints section, but with more detail)*

**What This Combines:**
- Status Panel (health section)
- API Health Monitor (full endpoint checks)
- Performance Panel (all metrics and graphs)
- Triggers Panel (configuration and events)

**What's Different:**
- **Unified health view** (system + API)
- **Tabs are OK here** (technical configuration makes sense in tabs)
- **No git status** (removed duplication - only in REPO page)
- **Real-time updates** (WebSocket for metrics)

---

### PAGE 5: 🌳 REPOSITORY

**Purpose:** Git operations and file management

**User Goal:** "I need to check git status, see diffs, manage repository"

**Layout: Git Status + File Changes + Commit History**

```
┌──────────────────────────────────────────────────────────────────────┐
│  🌳 REPOSITORY › raven                               🔄 Refresh       │
├──────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │ 📊 GIT STATUS                                                  │  │
│  │                                                                 │  │
│  │ Branch: master  ↑2 ahead  ↓0 behind                           │  │
│  │ Modified: 12  |  Staged: 0  |  Untracked: 3  |  Deleted: 1    │  │
│  │                                                                 │  │
│  │ Last commit: "Fix authentication bug" (2h ago) - Seth Eheart  │  │
│  └────────────────────────────────────────────────────────────────┘  │
│                                                                       │
│  ┌──────────────────────────┐  ┌────────────────────────────────┐   │
│  │ 📝 FILE CHANGES          │  │ 📜 COMMIT HISTORY              │   │
│  │                          │  │                                 │   │
│  │ Modified (12)            │  │ [abc123] Fix auth bug          │   │
│  │ ├─ backend/              │  │ Seth Eheart - 2h ago           │   │
│  │ │  ├─ server.js    [Diff]│  │ Files: 3  +45 -12              │   │
│  │ │  ├─ db.js        [Diff]│  │ [View Commit]                  │   │
│  │ │  └─ auth.js      [Diff]│  │                                 │   │
│  │ ├─ frontend/             │  │ [def456] Add feature           │   │
│  │ │  └─ App.svelte   [Diff]│  │ Seth Eheart - 4h ago           │   │
│  │ └─ ...                   │  │ Files: 2  +123 -0              │   │
│  │                          │  │ [View Commit]                  │   │
│  │ Created (3)              │  │                                 │   │
│  │ ├─ new-feature.js        │  │ [ghi789] Update docs           │   │
│  │ ├─ test.spec.js          │  │ Seth Eheart - 1d ago           │   │
│  │ └─ README.md             │  │ Files: 1  +50 -10              │   │
│  │                          │  │ [View Commit]                  │   │
│  │ Deleted (1)              │  │                                 │   │
│  │ └─ old-file.js           │  │ [Load More]                    │   │
│  │                          │  │                                 │   │
│  │ Untracked (3)            │  │                                 │   │
│  │ ├─ temp.log              │  │                                 │   │
│  │ ├─ .env.local            │  │                                 │   │
│  │ └─ cache/                │  │                                 │   │
│  └──────────────────────────┘  └────────────────────────────────┘   │
│                                                                       │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │ 📄 DIFF VIEWER (Inline, expandable when clicking [Diff])      │  │
│  │                                                                 │  │
│  │ backend/server.js                                              │  │
│  │ ┌────────────────────────────────────────────────────────────┐ │  │
│  │ │  15  │   const express = require('express');               │ │  │
│  │ │  16  │ + const newFeature = require('./new-feature');      │ │  │
│  │ │  17  │   const db = require('./db');                       │ │  │
│  │ │  18  │                                                      │ │  │
│  │ │  45  │ - app.use(oldMiddleware);                           │ │  │
│  │ │  46  │ + app.use(newMiddleware);                           │ │  │
│  │ └────────────────────────────────────────────────────────────┘ │  │
│  │                                                                 │  │
│  │ [Collapse] [Stage File] [Discard Changes]                     │  │
│  └────────────────────────────────────────────────────────────────┘  │
│                                                                       │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │ 🌿 BRANCHES                                                    │  │
│  │                                                                 │  │
│  │ ● master (current)  ↑2 ↓0                                      │  │
│  │ ○ feature/new-auth  ↑5 ↓2                                      │  │
│  │ ○ fix/bug-123       ↑0 ↓1                                      │  │
│  │                                                                 │  │
│  │ [Switch Branch] [Create Branch]                                │  │
│  └────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────┘
```

**Key Features:**

✅ **Git status bar** - quick overview (branch, ahead/behind, changes)
✅ **File changes** - categorized (modified, created, deleted, untracked)
✅ **Inline diffs** - click [Diff] to expand diff inline
✅ **Commit history** - recent commits with details
✅ **Branch list** - see all branches, switch branches
✅ **Actions** - stage, discard, view commit

**What This Combines:**
- Git Panel (full functionality)

**What This REMOVES:**
- ❌ Git status from Status Panel (duplication)
- ❌ System health (moved to System page)

**What's Different:**
- **Single source of truth** for git operations
- **No mixing** of git and health (clear separation)
- **Focus on repository** management only

---

## 🚀 Implementation Plan

### Phase 1: Critical Consolidation (Week 1)

**Goal:** Eliminate duplication, reduce navigation

**Priority: HIGH**

#### Task 1.1: Remove Git from Status Panel
- [ ] Delete git-related code from StatusPanel.svelte
- [ ] Keep only health metrics (backend, WebSocket, database)
- [ ] Test that Status panel shows health only

#### Task 1.2: Merge Live Feed + Dashboard → LIVE
- [ ] Create new `Live.svelte` component
- [ ] Combine Dashboard stats cards (left column)
- [ ] Integrate Live Feed's file tree (right sidebar)
- [ ] Add Activity Log's real-time event feed (center)
- [ ] Add agent status cards (right sidebar)
- [ ] Add system mini-metrics (right sidebar)
- [ ] Implement pause/resume for auto-scroll
- [ ] Test real-time WebSocket updates

#### Task 1.3: Update Navigation
- [ ] Update App.svelte navigation from 10 tabs → 5 tabs
- [ ] Change tab names and icons
- [ ] Update keyboard shortcuts (1-5)
- [ ] Update routing logic
- [ ] Test all navigation paths

**Estimated Time:** 3-4 days

### Phase 2: Feature Enhancement (Week 2)

**Goal:** Improve merged pages, build new views

**Priority: MEDIUM**

#### Task 2.1: Enhance LIVE Page
- [ ] Add auto-scroll with pause button
- [ ] Add inline event expansion (click to see details)
- [ ] Add search/filter UI
- [ ] Add export buttons (CSV, JSON)
- [ ] Optimize real-time performance
- [ ] Add file tree with change indicators
- [ ] Test with high event volume

#### Task 2.2: Build HISTORY Page
- [ ] Create new `History.svelte` component
- [ ] Merge Session Replay + Activity Log
- [ ] Build unified timeline (all event types)
- [ ] Add session selector
- [ ] Add date range filter
- [ ] Add event type filter
- [ ] Add agent filter
- [ ] Add search functionality
- [ ] Add pagination (load 100 at a time)
- [ ] Add export functionality
- [ ] Integrate diff viewer
- [ ] Add restore functionality
- [ ] Test with large datasets

#### Task 2.3: Simplify Agents Page
- [ ] Remove 3 sub-tabs (Overview/Activity/Performance)
- [ ] Create single-view layout with agent cards
- [ ] Add click-to-select agent details
- [ ] Show recent 20 events only
- [ ] Add mini performance graph
- [ ] Add links to "View all in History"
- [ ] Add links to "View metrics in System"
- [ ] Test agent switching

**Estimated Time:** 5-6 days

### Phase 3: System Consolidation (Week 3)

**Goal:** Unify health, performance, triggers

**Priority: MEDIUM**

#### Task 3.1: Build System Page
- [ ] Create new `System.svelte` component
- [ ] Create 4 tabs: Health, Performance, Triggers, API
- [ ] Merge Status Panel health section → Health tab
- [ ] Merge API Health Monitor → Health tab / API tab
- [ ] Move Performance Panel → Performance tab
- [ ] Move Triggers Panel → Triggers tab
- [ ] Add real-time WebSocket updates
- [ ] Test tab switching
- [ ] Test all features work in new location

#### Task 3.2: Clean Up Repository Page
- [ ] Remove git status code from Status Panel (if not done)
- [ ] Ensure Git Panel has all functionality
- [ ] Test inline diffs
- [ ] Test commit history
- [ ] Test branch switching

**Estimated Time:** 4-5 days

### Phase 4: Polish & Testing (Week 4)

**Goal:** Refinement, bug fixes, user testing

**Priority: HIGH**

#### Task 4.1: User Testing
- [ ] Test with real Claude Code sessions
- [ ] Monitor for bugs/issues
- [ ] Collect user feedback
- [ ] Measure navigation time
- [ ] Measure feature discoverability

#### Task 4.2: Bug Fixes
- [ ] Fix any issues found in testing
- [ ] Optimize performance
- [ ] Improve UI polish
- [ ] Update keyboard shortcuts help

#### Task 4.3: Documentation
- [ ] Update README.md with new navigation
- [ ] Update screenshots
- [ ] Create user guide
- [ ] Document new page structure

**Estimated Time:** 5-6 days

---

### Quick Wins (Can Do Immediately)

These changes require minimal code and can be done right away:

#### Week 0: Immediate Improvements

1. **Rename tabs for clarity** (15 min)
   - Dashboard → "Dashboard (stats only)"
   - Live Feed → "Live Monitor"
   - Activity Log → "Activity Archive"

2. **Add page descriptions** (30 min)
   - Add subtitle under each page title
   - Example: "LIVE: Watch Claude Code in real-time"

3. **Hide redundant tabs** (1 hour)
   - Temporarily hide duplicate tabs
   - Add "under construction" notice

4. **Update keyboard shortcut help** (30 min)
   - Update KeyboardShortcuts.svelte
   - Document new layout

**Total Time:** 2-3 hours

---

## 📊 Expected Improvements

### Quantitative Metrics

| Metric | Before | After | Improvement |
|--------|--------|-------|-------------|
| **Navigation Tabs** | 10 | 5 | **-50%** |
| **Feature Duplication** | High | None | **-100%** |
| **Click Depth to Feature** | 2-3 clicks | 1-2 clicks | **-33%** |
| **Time to Find Feature** | ~15s | ~3s | **-80%** |
| **Avg Page Load Time** | N/A | Faster | Better |
| **WebSocket Pages** | 5/10 | 5/5 | **100%** |

### Qualitative Improvements

#### User Experience

**Before:**
- ❌ "I don't know which page to use for real-time monitoring"
- ❌ "Why is git in two different places?"
- ❌ "Too many tabs to remember"
- ❌ "Activity Log doesn't update in real-time"
- ❌ "Agents page has too many sub-tabs"

**After:**
- ✅ "LIVE page shows everything I need in real-time"
- ✅ "Clear purpose for each page"
- ✅ "Easy to navigate with just 5 options"
- ✅ "Everything updates in real-time"
- ✅ "Simple, focused pages"

#### Developer Experience

**Before:**
- Maintaining 10 separate page components
- Duplicated code (git, health)
- Inconsistent WebSocket integration
- Hard to add features (where does it go?)

**After:**
- Maintaining 5 focused page components
- No code duplication
- Consistent real-time architecture
- Clear home for new features

---

## 🎯 Success Criteria

### Measurable Goals

1. **Navigation Efficiency**
   - ✅ User can find any feature in < 5 seconds
   - ✅ No more than 2 clicks to reach any feature
   - ✅ Zero confusion about which page to use

2. **Feature Consolidation**
   - ✅ Zero duplicate features across pages
   - ✅ All real-time features use WebSocket
   - ✅ Clear separation of concerns

3. **User Satisfaction**
   - ✅ Primary use case (monitoring) is page 1
   - ✅ Navigation ≤ 7 items
   - ✅ Positive user feedback on clarity

4. **Performance**
   - ✅ LIVE page handles high event volume (100+ events/min)
   - ✅ No lag in real-time updates
   - ✅ Fast page switching

### Validation Methods

1. **User Testing**
   - Test with 3-5 users
   - Ask: "Where would you look for real-time monitoring?"
   - Measure time to find features
   - Collect feedback

2. **Analytics**
   - Track most-visited pages
   - Track time spent on each page
   - Track navigation patterns

3. **Code Review**
   - Verify no code duplication
   - Verify consistent patterns
   - Verify all pages have real-time when appropriate

---

## 📝 Final Recommendations

### TL;DR - What to Do

**✅ IMMEDIATE (Do This Week):**
1. Remove Git from Status Panel (eliminate duplication)
2. Rename tabs for clarity
3. Add page descriptions

**✅ SHORT-TERM (Do This Month):**
1. Merge Live Feed + Dashboard → LIVE page
2. Update navigation to 5 tabs
3. Build HISTORY page
4. Simplify Agents page (remove sub-tabs)

**✅ LONG-TERM (Do Next Quarter):**
1. Consolidate System page (Health + Performance + Triggers + API)
2. User testing and iteration
3. Documentation and guides

### Priority Ranking

**P0 - Critical:**
- Remove git duplication from Status Panel
- Merge Live Feed + Dashboard → LIVE

**P1 - High:**
- Update navigation to 5 tabs
- Build HISTORY page
- Simplify Agents page

**P2 - Medium:**
- Consolidate System page
- Polish and testing

**P3 - Low:**
- Documentation
- Advanced features

---

## 🎨 Visual Summary

### Before vs After

**Before: 10 Tabs (Overwhelming)**
```
┌─────────────────────────────────────────────────────────────┐
│ Dashboard | Live Feed | Git | Replay | Performance |        │
│ Triggers | Agents | Status | API Health | Activity Log      │
└─────────────────────────────────────────────────────────────┘
User: "Too many options! Where do I go?"
```

**After: 5 Tabs (Clear)**
```
┌─────────────────────────────────────────────────────────────┐
│ 🔴 LIVE  |  📜 HISTORY  |  🤖 AGENTS  |  ⚙️ SYSTEM  |  🌳 REPO │
└─────────────────────────────────────────────────────────────┘
User: "Clear and obvious!"
```

### User Journey

**Before (Broken):**
```
Open Raven → Dashboard (confused, no live feed)
           → Click Live Feed (limited to 20 items)
           → Click Activity Log (not real-time!)
           → Click between Git and Status (which one?)
           → Give up (too confusing)
```

**After (Fixed):**
```
Open Raven → LIVE page (see everything happening now)
           → Click event to see details (inline)
           → Check HISTORY for yesterday's session
           → Check SYSTEM to verify health
           → Happy user!
```

---

## 📖 Conclusion

Raven has **excellent features** but **poor organization**. The current 10-tab structure with significant duplication creates confusion and decision paralysis.

**The solution is simple:** Consolidate to 5 focused pages with clear purposes:

1. **LIVE** - Real-time monitoring (primary use case)
2. **HISTORY** - Archive and session replay
3. **AGENTS** - Agent-specific monitoring
4. **SYSTEM** - Health, performance, configuration
5. **REPOSITORY** - Git operations

This reorganization will:
- ✅ Reduce navigation by 50%
- ✅ Eliminate all feature duplication
- ✅ Make Raven intuitive and productive
- ✅ Improve user satisfaction

**Recommendation:** Start with Phase 1 (Critical Consolidation) this week.

---

**Report Generated:** October 18, 2025
**Next Steps:** Review with team, prioritize tasks, begin implementation
**Contact:** For questions about this report or implementation assistance
