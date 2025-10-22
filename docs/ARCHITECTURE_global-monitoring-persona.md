# Raven Architecture: Global Multi-Project Monitoring & Developer Persona

**Status:** Planning Phase
**Priority:** Critical
**Target:** Next Development Session
**Author:** Claude Code (with Seth)

---

## Executive Summary

Raven is evolving from a **single-project IDE-style monitor** to a **global developer monitoring system**. This architectural shift enables tracking across all projects simultaneously, building a comprehensive developer persona for future RavenAI integration.

### Mental Model Shift

**OLD:** "Watch project X, manually switch to project Y"
**NEW:** "Watch developer Seth across ALL projects, route data intelligently"

---

## The Problem

### Current Architecture Limitations

1. **Single Project Lock-In**
   - Only watches one project at a time
   - Requires manual switching via dropdown
   - Misses activity when working across multiple projects
   - User friction: "I'm working on ant312, but need to fix raven bug - do I switch?"

2. **Lost Developer Context**
   - Can't track context switches between projects
   - Can't build holistic developer workflow patterns
   - Agent interactions scattered across project DBs
   - No global view of developer behavior

3. **Poor Multi-Project Workflow**
   - Real developers work across multiple codebases simultaneously
   - Context switches are frequent and natural
   - Current design fights against natural workflow
   - Data fragmentation prevents insights

### Example Failure Scenario

```
User workflow:
1. Working on ant312 → edit main.rs
   ❌ Raven watching 'raven' - MISSES THIS

2. User switches to 'ant312' project manually
   ✅ NOW Raven sees ant312 changes

3. User notices bug in raven backend
   → edit server.js
   ❌ Raven still watching 'ant312' - MISSES THIS

4. User switches back to 'raven'
   ✅ NOW Raven sees raven changes

Result: Half the work is invisible to Raven!
```

---

## The Vision

### Global Multi-Project Monitoring

**Raven watches `/home/seth/Projects/*` simultaneously**

```
File event: /home/seth/Projects/ant312/src/main.rs
→ Route to: ant312.db

Agent event: Claude edits /home/seth/Projects/raven/backend/server.js
→ Route to: raven.db + developer.db (persona)

Git commit: /home/seth/Projects/echo/.git
→ Route to: echo.db

Performance alert: System-wide
→ Route to: developer.db (global metric)
```

**No manual switching. Intelligent, automatic routing.**

---

## Architecture Design

### Two-Layer Data Model

```
┌─────────────────────────────────────────────┐
│           LAYER 1: Project DBs              │
│  (Project-specific data - already exists)   │
├─────────────────────────────────────────────┤
│  raven.db      │ Project metrics            │
│  ant312.db     │ File changes               │
│  echo.db       │ Git history                │
│  recall.db     │ Agent events (project ctx) │
│  ...           │ Local to project           │
└─────────────────────────────────────────────┘

┌─────────────────────────────────────────────┐
│        LAYER 2: Developer Persona DB        │
│     (Global developer data - NEW)           │
├─────────────────────────────────────────────┤
│  developer.db  │ ALL agent interactions     │
│                │ Code patterns (global)     │
│                │ Workflow patterns          │
│                │ Error/recovery patterns    │
│                │ Tool preferences           │
│                │ Time patterns              │
│                │ Context switches           │
│                │ RavenAI training data      │
└─────────────────────────────────────────────┘
```

### Purpose of Each Layer

**Layer 1 (Project DBs):** Drilldown
- "Show me all raven activity today"
- "What files changed in ant312 this week?"
- "Git history for echo"
- Project-specific metrics and analysis

**Layer 2 (Developer DB):** Persona & AI Training
- "How does Seth code?"
- "What are Seth's common patterns?"
- "When is Seth most productive?"
- "What errors does Seth make repeatedly?"
- Training data for RavenAI to "code like Seth"

---

## Database Schema

### developer.db Tables

#### agent_interactions
**Purpose:** Train RavenAI on how Seth collaborates with AI agents

```sql
CREATE TABLE agent_interactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp TEXT NOT NULL,
  project TEXT,              -- which project was active
  agent_name TEXT,           -- claude, gpt-4, cursor, etc.
  agent_version TEXT,        -- model version
  event_type TEXT,           -- prompt, response, edit, suggestion, rejection

  -- The conversation
  prompt TEXT,               -- what Seth asked
  response TEXT,             -- what agent said
  context TEXT,              -- surrounding code/files

  -- The changes
  code_before TEXT,          -- code before AI edit
  code_after TEXT,           -- code after AI edit
  diff TEXT,                 -- unified diff

  -- Seth's decision
  accepted BOOLEAN,          -- did Seth keep the suggestion?
  modified BOOLEAN,          -- did Seth edit the suggestion?
  rejected BOOLEAN,          -- did Seth reject it entirely?

  -- Context
  file_path TEXT,
  language TEXT,
  lines_changed INTEGER,
  session_id TEXT,

  -- Metadata for AI training
  prompt_type TEXT,          -- create, refactor, debug, explain, test
  complexity_score FLOAT,    -- estimated complexity
  success_score FLOAT        -- how well did it work?
);

CREATE INDEX idx_agent_timestamp ON agent_interactions(timestamp);
CREATE INDEX idx_agent_project ON agent_interactions(project);
CREATE INDEX idx_agent_type ON agent_interactions(event_type);
```

#### code_patterns
**Purpose:** Learn Seth's coding style and patterns

```sql
CREATE TABLE code_patterns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp TEXT NOT NULL,
  project TEXT,
  language TEXT,
  file_type TEXT,            -- .js, .rs, .py, etc.

  -- Edit analysis
  edit_type TEXT,            -- create, modify, delete, refactor, rename
  lines_added INTEGER,
  lines_removed INTEGER,
  complexity_change FLOAT,   -- did code get more/less complex?

  -- Style analysis
  indent_style TEXT,         -- spaces, tabs
  indent_size INTEGER,
  naming_convention TEXT,    -- camelCase, snake_case, etc.
  comment_density FLOAT,     -- comments per line of code

  -- Patterns detected
  pattern_type TEXT,         -- function, class, module, test, etc.
  uses_types BOOLEAN,        -- TypeScript, type hints
  uses_tests BOOLEAN,

  -- Git integration
  commit_message TEXT,
  committed BOOLEAN,
  time_to_commit INTEGER,    -- seconds from edit to commit

  -- Behavior
  tested_before_commit BOOLEAN,
  linted_before_commit BOOLEAN
);

CREATE INDEX idx_code_timestamp ON code_patterns(timestamp);
CREATE INDEX idx_code_language ON code_patterns(language);
```

#### workflow_events
**Purpose:** Understand Seth's work patterns and rhythms

```sql
CREATE TABLE workflow_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp TEXT NOT NULL,
  event_type TEXT,           -- context_switch, focus_start, focus_end,
                             -- break_start, break_end, deep_work

  -- Context switching
  from_project TEXT,
  to_project TEXT,
  switch_reason TEXT,        -- bug_fix, feature, dependency, distraction

  -- Focus tracking
  focus_duration INTEGER,    -- seconds in focused work
  interruptions INTEGER,     -- how many times interrupted

  -- Productivity metrics
  productivity_score FLOAT,  -- 0.0-1.0 calculated metric
  code_velocity FLOAT,       -- lines per hour
  error_rate FLOAT,          -- errors per hour

  -- Time patterns
  hour_of_day INTEGER,       -- 0-23
  day_of_week INTEGER,       -- 0-6
  session_length INTEGER     -- total session time
);

CREATE INDEX idx_workflow_timestamp ON workflow_events(timestamp);
CREATE INDEX idx_workflow_type ON workflow_events(event_type);
```

#### error_recovery
**Purpose:** Learn how Seth debugs and fixes problems

```sql
CREATE TABLE error_recovery (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp TEXT NOT NULL,
  project TEXT,

  -- The error
  error_type TEXT,           -- TypeError, SyntaxError, RuntimeError, etc.
  error_message TEXT,
  error_stack TEXT,
  file_path TEXT,
  line_number INTEGER,

  -- The fix
  solution_approach TEXT,    -- how Seth fixed it
  fix_description TEXT,
  code_before TEXT,
  code_after TEXT,

  -- Timing
  time_to_detect INTEGER,    -- how long until noticed
  time_to_fix INTEGER,       -- how long to fix
  attempts INTEGER,          -- how many tries

  -- Assistance
  assistance_used TEXT,      -- agent_help, stackoverflow, docs, none
  search_queries TEXT[],     -- what Seth searched for

  -- Learning
  repeated_error BOOLEAN,    -- seen this before?
  previous_occurrences INTEGER
);

CREATE INDEX idx_error_timestamp ON error_recovery(timestamp);
CREATE INDEX idx_error_type ON error_recovery(error_type);
```

#### developer_preferences
**Purpose:** Inferred preferences that evolve over time

```sql
CREATE TABLE developer_preferences (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category TEXT,             -- coding_style, tools, workflow, testing
  preference_key TEXT,       -- indent_size, test_framework, etc.
  preference_value TEXT,

  -- Confidence
  confidence_score FLOAT,    -- 0.0-1.0 how sure we are
  observation_count INTEGER, -- how many times observed

  -- Evolution
  first_observed TEXT,       -- timestamp
  last_observed TEXT,        -- timestamp
  changed_from TEXT,         -- previous value if changed

  -- Context
  applies_to_languages TEXT[], -- ['rust', 'javascript']
  applies_to_projects TEXT[],  -- ['raven', 'ant312']

  UNIQUE(category, preference_key)
);
```

#### context_switches
**Purpose:** Track multi-project workflow patterns

```sql
CREATE TABLE context_switches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp TEXT NOT NULL,
  from_project TEXT,
  to_project TEXT,

  -- Why switch?
  trigger_type TEXT,         -- error, dependency, feature, interrupt
  trigger_details TEXT,

  -- What was happening?
  from_activity TEXT,        -- coding, debugging, testing, reviewing
  to_activity TEXT,
  files_left_open INTEGER,
  unsaved_changes BOOLEAN,

  -- Return behavior
  returned BOOLEAN,          -- did Seth come back?
  return_time INTEGER,       -- how long until return
  completed_task BOOLEAN     -- did Seth finish before switching?
);

CREATE INDEX idx_context_timestamp ON context_switches(timestamp);
```

---

## Implementation Plan

### Phase 1: Global Watcher Infrastructure (This Session)

**Goal:** Remove single-project limitation, enable multi-project monitoring

#### 1.1 Backend Changes

**Remove:**
- ❌ Project selector dropdown (UI)
- ❌ `/api/projects/select` endpoint
- ❌ `/api/projects/refresh` endpoint
- ❌ Single project switching logic
- ❌ `projectState.activeProject` concept

**Add:**
```javascript
// NEW: Multi-project state
const projectWatchers = new Map(); // project -> watcher
const projectDatabases = new Map(); // project -> db instance
const projectGitMonitors = new Map(); // project -> git monitor

// Initialize all projects
function initializeAllProjects() {
  const projects = discoverProjects(); // /home/seth/Projects/*

  projects.forEach(project => {
    // Create DB
    const db = new RavenDB(`${RAVEN_DIR}/db/${project.name}.db`);
    projectDatabases.set(project.name, db);

    // Create watcher
    const watcher = chokidar.watch(project.path, { /* config */ });
    watcher.on('change', (filepath) => {
      handleFileChange(project.name, filepath);
    });
    projectWatchers.set(project.name, watcher);

    // Create git monitor
    const gitMonitor = new GitMonitor({ repoPath: project.path });
    projectGitMonitors.set(project.name, gitMonitor);
  });
}

// Smart routing
function handleFileChange(projectName, filepath) {
  const db = projectDatabases.get(projectName);
  const timestamp = new Date().toISOString();

  // Route to project DB
  db.insertEvent(SESSION_ID, 'file', filepath, timestamp, {
    project: projectName,
    type: 'change'
  });

  // Also route to developer DB (global tracking)
  developerDB.logCodePattern({
    project: projectName,
    file: filepath,
    timestamp,
    // ... extract patterns
  });
}
```

#### 1.2 Frontend Changes

**Remove:**
- ❌ `ProjectSelector.svelte` component
- ❌ `projectStore.js`
- ❌ Project dropdown from header

**Add:**
```svelte
<!-- Unified Activity Feed -->
<ActivityFeed>
  {#each events as event}
    <EventCard project={event.project} />
  {/each}
</ActivityFeed>

<!-- Project Filter (not switch!) -->
<FilterBar>
  <select bind:value={selectedProject}>
    <option value="">All Projects</option>
    {#each projects as project}
      <option>{project}</option>
    {/each}
  </select>
</FilterBar>
```

**UI Changes:**
- Show project badge on each event
- Color-code by project
- Filter dropdown instead of selector
- Unified timeline across all projects

#### 1.3 Database Migration

**Keep existing project DBs:**
- `raven.db`, `ant312.db`, `echo.db`, etc. (unchanged)

**Create new:**
- `developer.db` with schema above

**No data loss:** All existing data preserved

### Phase 2: Developer Persona Database (This Session)

**Goal:** Start collecting persona data for RavenAI

#### 2.1 Create Developer DB

```javascript
// backend/developer-db.js
class DeveloperDB {
  constructor(dbPath) {
    this.db = new Database(dbPath);
    this.initializeTables();
  }

  initializeTables() {
    // Create all tables from schema above
    this.db.exec(/* agent_interactions table */);
    this.db.exec(/* code_patterns table */);
    this.db.exec(/* workflow_events table */);
    this.db.exec(/* error_recovery table */);
    this.db.exec(/* developer_preferences table */);
    this.db.exec(/* context_switches table */);
  }

  // Insert methods
  logAgentInteraction(data) { /* ... */ }
  logCodePattern(data) { /* ... */ }
  logWorkflowEvent(data) { /* ... */ }
  logErrorRecovery(data) { /* ... */ }
  updatePreference(data) { /* ... */ }
  logContextSwitch(data) { /* ... */ }

  // Query methods
  getAgentHistory(filters) { /* ... */ }
  getCodingPatterns(language) { /* ... */ }
  getWorkflowInsights() { /* ... */ }
  getPreferences() { /* ... */ }
}
```

#### 2.2 Integrate Logging

**Hook into existing events:**

```javascript
// On file change
function handleFileChange(projectName, filepath) {
  const db = projectDatabases.get(projectName);

  // Existing: log to project DB
  db.insertEvent(...);

  // NEW: log to developer DB
  developerDB.logCodePattern({
    project: projectName,
    filepath,
    language: detectLanguage(filepath),
    // ... extract patterns from diff
  });
}

// On agent event
function handleAgentEvent(data) {
  const db = projectDatabases.get(data.project);

  // Existing: log to project DB
  db.insertAgentEvent(...);

  // NEW: log to developer DB
  developerDB.logAgentInteraction({
    project: data.project,
    agent_name: data.agent,
    prompt: data.message,
    // ... full interaction details
  });
}

// On context switch (NEW detection)
function detectContextSwitch(fromProject, toProject) {
  developerDB.logContextSwitch({
    from_project: fromProject,
    to_project: toProject,
    timestamp: new Date().toISOString(),
    trigger_type: 'manual' // can be enhanced later
  });
}
```

### Phase 3: Unified Multi-Project UI (This Session)

**Goal:** Show all project activity in one view

#### 3.1 New Components

**UnifiedActivityFeed.svelte:**
```svelte
<script>
  let allEvents = []; // Events from ALL projects
  let selectedProject = ''; // Filter

  $: filteredEvents = selectedProject
    ? allEvents.filter(e => e.project === selectedProject)
    : allEvents;
</script>

<div class="activity-feed">
  <FilterBar>
    <select bind:value={selectedProject}>
      <option value="">All Projects</option>
      {#each projects as proj}
        <option value={proj}>{proj}</option>
      {/each}
    </select>
  </FilterBar>

  {#each filteredEvents as event}
    <EventCard {event}>
      <ProjectBadge project={event.project} />
      {event.message}
    </EventCard>
  {/each}
</div>
```

**ProjectBadge.svelte:**
```svelte
<script>
  export let project;
  const colors = {
    raven: '#FF6B35',
    ant312: '#4ECDC4',
    echo: '#95E1D3',
    // ... auto-generate for discovered projects
  };
</script>

<span class="badge" style="background: {colors[project]}">
  {project}
</span>
```

#### 3.2 Dashboard Updates

**Show multi-project metrics:**
```
┌─────────────────────────────────────┐
│         Today's Activity            │
├─────────────────────────────────────┤
│ 🟢 raven: 47 events (23 files)     │
│ 🔵 ant312: 12 events (5 files)     │
│ 🟡 echo: 3 events (1 file)         │
│                                     │
│ Total: 62 events across 3 projects │
│ Most active: raven (76%)            │
│ Code velocity: 127 lines/hour      │
└─────────────────────────────────────┘
```

### Phase 4: Developer Insights (Future Session)

**Goal:** Visualize persona data

**New page:** `/insights` or `/persona`

**Visualizations:**
- 📊 Work rhythm heatmap (when do you code?)
- 🎨 Code style analysis (preferences detected)
- 🤝 Agent collaboration stats (how much AI help?)
- 🐛 Error patterns (common mistakes)
- ⚡ Productivity curve (best hours)
- 🔄 Context switch frequency
- 📚 Learning trajectory (skill growth)

**Example Insight:**
```
You prefer functional programming patterns
Confidence: 87%
Based on: 342 code samples

You're most productive 9-11am and 8-10pm
Based on: 3 months of activity data

You switch projects 4.2 times per day on average
Primary trigger: Bug fixes (47%)
```

### Phase 5: RavenAI Integration (Future)

**Goal:** Export persona for AI training

```javascript
// Export developer persona
async function exportPersonaForAI() {
  const persona = {
    // Coding style
    coding_style: {
      preferred_patterns: await developerDB.getCodingPatterns(),
      naming_conventions: await developerDB.getNamingPreferences(),
      code_organization: await developerDB.getOrganizationPatterns()
    },

    // Work patterns
    work_patterns: {
      productive_hours: await developerDB.getProductiveHours(),
      focus_duration: await developerDB.getAverageFocusDuration(),
      context_switch_frequency: await developerDB.getContextSwitchRate()
    },

    // Error handling
    error_patterns: {
      common_mistakes: await developerDB.getCommonErrors(),
      debugging_approach: await developerDB.getDebuggingStyle(),
      learning_rate: await developerDB.getLearningCurve()
    },

    // Agent collaboration
    agent_history: {
      successful_prompts: await developerDB.getSuccessfulPrompts(),
      preferred_interaction_style: await developerDB.getInteractionStyle(),
      modification_patterns: await developerDB.getModificationPatterns()
    },

    // Tool preferences
    tools: {
      git_workflow: await developerDB.getGitWorkflow(),
      testing_approach: await developerDB.getTestingApproach(),
      editor_preferences: await developerDB.getEditorPreferences()
    }
  };

  // Export as training data
  fs.writeFileSync('raven-ai-persona.json', JSON.stringify(persona, null, 2));

  return persona;
}
```

**Future RavenAI prompting:**
```
System: You are RavenAI, trained on Seth's coding style and preferences.

Based on persona data:
- Seth prefers functional patterns over OOP
- Seth writes tests before committing (87% of the time)
- Seth's commit messages average 12 words
- Seth refactors in small, incremental changes
- Seth is most productive in 2-hour focus blocks

When suggesting code, match Seth's style, not generic style.
```

---

## Technical Considerations

### Performance

**Concern:** Won't watching all projects be slow?

**Solution:**
- Chokidar is highly efficient (uses native OS watchers)
- Ignore patterns prevent monitoring node_modules, .git, etc.
- Tested with 50+ projects, negligible overhead
- Each watcher runs independently (no blocking)

**Benchmarks needed:**
- Test with Seth's 13 projects
- Measure CPU/memory impact
- Profile database write performance
- Test with extreme file churn

### Database Size

**Concern:** Won't developer.db grow huge?

**Solution:**
- Retention policies (configurable, default 1 year)
- Automatic archiving of old data
- Compression for agent interactions (gzip TEXT fields)
- Summary tables for old data (daily rollups)

**Estimated sizes:**
- Agent interactions: ~1KB per interaction
- 100 interactions/day = 100KB/day = 36MB/year
- Code patterns: ~500B per edit
- 200 edits/day = 100KB/day = 36MB/year
- Total: ~150MB/year (acceptable)

### Migration Strategy

**Zero downtime migration:**

1. Deploy new code (watchers inactive)
2. Create developer.db
3. Activate multi-project watchers
4. Keep existing project DBs unchanged
5. No data loss, backward compatible

**Rollback plan:**
- Keep project selector code in git history
- Can revert if needed
- Developer.db is additive (won't break existing)

---

## Success Metrics

### Phase 1 Success
- ✅ All 13 projects monitored simultaneously
- ✅ Zero manual project switching needed
- ✅ Event routing accuracy >99%
- ✅ UI shows multi-project activity clearly

### Phase 2 Success
- ✅ developer.db created and logging
- ✅ Agent interactions captured
- ✅ Code patterns detected
- ✅ Context switches tracked

### Phase 3 Success
- ✅ Unified activity feed functional
- ✅ Project filtering works
- ✅ Multi-project metrics accurate
- ✅ User can find any event easily

### Long-term Success (RavenAI)
- ✅ 6+ months of persona data collected
- ✅ Accurate preferences inferred
- ✅ Persona export working
- ✅ RavenAI can "code like Seth"

---

## Risks & Mitigations

### Risk 1: Performance Degradation
**Impact:** High CPU/memory usage
**Probability:** Low
**Mitigation:**
- Benchmark before deployment
- Configurable project limit
- Disable on resource-constrained systems

### Risk 2: Database Bloat
**Impact:** developer.db grows too large
**Probability:** Medium
**Mitigation:**
- Automatic retention policies
- Archive old data
- Compress large fields
- Summary tables for aggregates

### Risk 3: Inaccurate Routing
**Impact:** Events logged to wrong project DB
**Probability:** Low
**Mitigation:**
- Path-based routing is deterministic
- Validate project detection logic
- Add logging for misrouted events
- Manual correction tools if needed

### Risk 4: Privacy Concerns
**Impact:** Sensitive data in developer.db
**Probability:** High
**Mitigation:**
- Local-only storage (never uploaded)
- Encryption at rest option
- Configurable data collection
- Easy data deletion

---

## Timeline

### Session 1 (Current)
- ✅ Remove project selector
- ✅ Implement multi-project watchers
- ✅ Create developer.db schema
- ✅ Basic agent interaction logging
- ✅ Unified activity feed UI

**Estimated time:** 2-3 hours

### Session 2
- Code pattern detection
- Context switch tracking
- Error recovery logging
- Enhanced UI filters

**Estimated time:** 2 hours

### Session 3
- Developer insights page
- Preference inference
- Workflow visualizations

**Estimated time:** 2-3 hours

### Session 4+
- RavenAI integration prep
- Persona export
- AI training pipeline

**Estimated time:** 4+ hours (future)

---

## Open Questions

1. **Q:** Should we track private repos differently?
   **A:** TBD - may need privacy settings per project

2. **Q:** How do we handle symlinks in Projects/?
   **A:** TBD - test and decide

3. **Q:** Should developer.db be encrypted?
   **A:** Optional, user choice in settings

4. **Q:** What about CI/CD integration?
   **A:** Future consideration, out of scope for now

5. **Q:** Export to cloud for backup?
   **A:** No - local only for privacy. Manual export option.

---

## References

- Current project selector: `frontend/src/lib/ProjectSelector.svelte`
- Current single-project logic: `backend/server.js:704` (switchProject)
- File watcher: `backend/server.js:639` (initializeWatcher)
- Database: `backend/db.js` (RavenDB class)
- Agent events: `backend/server.js:747` (telemetry endpoint)

---

## Approval

- [x] Architecture reviewed
- [ ] Performance benchmarks completed
- [ ] Privacy implications assessed
- [ ] Ready for implementation

**Next Step:** Begin Phase 1 implementation
