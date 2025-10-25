# FEATURE GAP ANALYSIS
## What Exists vs What the Vision Needs

**Date:** October 25, 2025
**Purpose:** Identify what's already built vs what PRODUCT_VISION_v2.md requires

---

## EXECUTIVE SUMMARY

**Good News:** You already have 40% of the core monitoring features!
**Key Gap:** Existing features are single-project focused, need multi-project updates
**Strategy:** Enhance existing code, don't rebuild from scratch

---

## 1. ANOMALY DETECTION

### ✅ What You Already Have

**Frontend:**
- `AnomalyAlertsPanel.svelte` - Full UI component
  - Real-time alerts display
  - Severity filtering (critical/warning/info)
  - Export to CSV/JSON
  - Auto-refresh every 60 seconds
  - Configurable lookback hours and threshold

**Backend:**
- `/api/anomalies/detect` endpoint
- Statistical analysis:
  - Activity spikes (z-score based, threshold = 2 std devs)
  - Excessive deletions (>10 files)
  - Unusual file activity (>20 changes)
  - Hourly baseline calculation

**Algorithm:**
```javascript
// Current implementation
const avgPerHour = baseline.reduce((sum, h) => sum + h.count, 0) / baseline.length;
const stdDev = Math.sqrt(
  baseline.reduce((sum, h) => sum + Math.pow(h.count - avgPerHour, 2), 0) / baseline.length
);

if (hour.event_count > avgPerHour + (threshold * stdDev)) {
  // Flag as anomaly
}
```

### 🔧 What Needs Enhancement

**Gap #1: Single-Project Only**
```javascript
// Current: Uses projectState.db (single project)
const baseline = projectState.db.db.prepare(baselineSql).all(lookbackTime);

// Needed: Aggregate across projectDatabases
for (const [projectName, db] of projectDatabases.entries()) {
  const baseline = db.db.prepare(baselineSql).all(lookbackTime);
  // Aggregate results
}
```

**Gap #2: Limited Anomaly Types**
```
Current: 3 types (activity spike, excessive deletions, unusual file)
Needed: 7+ types
  - Change size anomalies (file changed 5x more than usual)
  - Rare file edits (files you never touch)
  - Unusual change type (you never delete this file)
  - Similar to past incidents (pattern matching)
```

**Gap #3: No User Learning**
```
Current: Static thresholds (2 std devs, 10 deletions)
Needed: Learn YOUR patterns over time
  - Track your approval/rejection of anomalies
  - Adjust thresholds based on feedback
  - Store user preferences per file type
```

**Gap #4: No Agent Attribution**
```
Current: Doesn't track which agent caused the anomaly
Needed: "ANT caused 3 anomalies today vs Claude Code's 1"
```

### 📋 Enhancement Tasks

**Priority: HIGH**
- [ ] Update to use `projectDatabases` instead of `projectState`
- [ ] Add agent detection to anomaly data
- [ ] Add change size anomaly detection
- [ ] Add rare file edit detection
- [ ] Add pattern matching to past incidents

**Priority: MEDIUM**
- [ ] User feedback system (thumbs up/down on anomalies)
- [ ] Adaptive thresholds based on feedback
- [ ] Per-file baseline learning

**Effort:** 1-2 weeks

---

## 2. HEALTH SCORING

### ✅ What You Already Have

**Frontend:**
- `MultiProjectHealthPanel.svelte` - Health dashboard
  - Health score per project (0-100)
  - Status icons (active/recent/idle/inactive)
  - Sortable by health, name, activity, errors
  - Auto-refresh every 30 seconds
  - Export to CSV/JSON

- `HealthWidget.svelte` - Compact health display
- `HealthStatus.svelte` - Status indicators

**Backend:**
- `/api/health/projects` endpoint
- Health calculation:
  ```javascript
  const activityScore = Math.min(recentActivity.count, 100);
  const errorPenalty = Math.min(errors.count * 5, 50);
  const healthScore = Math.max(activityScore - errorPenalty, 0);
  ```

### 🔧 What Needs Enhancement

**Gap #1: Simple Scoring Formula**
```
Current: health = activity - (errors * 5)
Problems:
  - Only 2 factors (activity, errors)
  - Doesn't consider test coverage
  - Doesn't consider code complexity
  - Doesn't consider rollback rate
```

**Gap #2: No Breakdown**
```
Current: Single number (78/100)
Needed: Component scores
  - Code Quality: 85/100
  - Test Coverage: 62/100
  - Stability: 88/100
  - Complexity: 68/100
  - Activity: 92/100
```

**Gap #3: No Trends**
```
Current: Point-in-time score
Needed: Trend analysis
  - "Health improving (↑5 points this week)"
  - "Test coverage declining (-7% in 7 days)"
```

**Gap #4: No Action Items**
```
Current: Just shows the score
Needed: Specific recommendations
  - "Add tests to auth.js (0% coverage)"
  - "Refactor server.js (4,500 lines)"
```

### 📋 Enhancement Tasks

**Priority: HIGH**
- [ ] Enhanced scoring formula (5 components)
- [ ] Trend tracking (compare to last week/month)
- [ ] Basic action items generator

**Priority: MEDIUM**
- [ ] Test coverage integration
- [ ] Code complexity analysis
- [ ] Rollback rate tracking
- [ ] Detailed breakdown UI

**Priority: LOW (post-v1)**
- [ ] Historical health graphs
- [ ] Health goals/alerts
- [ ] Automated health reports

**Effort:** 2-3 weeks

---

## 3. MULTI-AGENT MONITORING

### ❌ What You DON'T Have (Yet)

**Missing:**
- No agent detection logic
- No agent attribution in events table
- No per-agent statistics
- No agent behavior profiling

**Database Schema Needed:**
```sql
-- Add to events table
ALTER TABLE events ADD COLUMN agent TEXT;
ALTER TABLE events ADD COLUMN agent_confidence INTEGER;

-- New table
CREATE TABLE agent_stats (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_name TEXT NOT NULL,
  agent TEXT NOT NULL,
  date TEXT NOT NULL,
  changes_count INTEGER DEFAULT 0,
  rollbacks_count INTEGER DEFAULT 0,
  avg_change_size INTEGER DEFAULT 0,
  UNIQUE(project_name, agent, date)
);
```

**Frontend Needed:**
- Agent badges in EventFeed
- Agent filter dropdown
- Agent comparison panel
- Agent behavior dashboard

### 📋 Build Tasks

**Priority: CRITICAL (Tier 1 feature)**
- [ ] Build AgentDetector service
- [ ] Add agent field to events
- [ ] Create agent_stats table
- [ ] Add agent badges to UI
- [ ] Agent filter in EventFeed

**Effort:** 1-2 weeks

---

## 4. RISK CORRELATION

### 🟡 What You Partially Have

**Existing Related Features:**
- Rollback functionality exists (SessionRollbackPanel)
- File history tracking exists
- Can see past changes to files

**Missing:**
- No rollbacks table (track when/why files were rolled back)
- No risk scoring based on history
- No "you rolled this back 3 times" alerts
- No file criticality detection

### 📋 Build Tasks

**Priority: HIGH (Tier 1 feature)**
- [ ] Create rollbacks table
- [ ] Track rollback actions
- [ ] Build RiskAnalyzer service
- [ ] Calculate file-specific rollback rates
- [ ] Add risk warnings to UI

**Effort:** 1-2 weeks

---

## 5. SESSION INTELLIGENCE

### ❌ What You DON'T Have

**Missing:**
- No session tracking (start/end times)
- No session metrics (changes per hour, quality trends)
- No fatigue detection
- No break reminders
- No productivity analysis

### 📋 Build Tasks

**Priority: MEDIUM (Tier 2 feature)**
- [ ] Create sessions table
- [ ] Track session start/end
- [ ] Calculate session metrics
- [ ] Build session quality analyzer
- [ ] Add session dashboard panel

**Effort:** 1 week

---

## 6. PATTERN RECOGNITION

### 🟡 What You Partially Have

**Existing:**
- Historical event data
- Can query past changes
- Diff storage for comparison

**Missing:**
- No similarity scoring algorithm
- No pattern matching service
- No "I've seen this before" alerts
- No incident database

### 📋 Build Tasks

**Priority: MEDIUM (Tier 2 feature)**
- [ ] Build PatternMatcher service
- [ ] Implement similarity scoring
- [ ] Create incidents table
- [ ] Add pattern match alerts
- [ ] "Similar to past incident" UI

**Effort:** 2 weeks

---

## 7. AGENT BEHAVIOR PROFILING

### ❌ What You DON'T Have

**Missing:**
- No agent behavior tracking
- No "agent mood" detection
- No agent personality analysis
- No behavior deviation alerts

### 📋 Build Tasks

**Priority: MEDIUM (Tier 2 feature)**
- [ ] Build BehaviorProfiler service
- [ ] Track agent patterns over time
- [ ] Detect behavior changes
- [ ] "Agent is aggressive today" alerts
- [ ] Agent behavior dashboard

**Effort:** 1 week

---

## 8. CROSS-AGENT INTELLIGENCE

### ❌ What You DON'T Have (Post-v1)

**Missing:**
- No agent performance comparison
- No success rate tracking
- No agent recommendation engine

### 📋 Build Tasks

**Priority: LOW (Tier 3, post-v1)**
- [ ] Track per-agent success rates
- [ ] Build comparison dashboard
- [ ] Recommendation engine
- [ ] "Use Cursor for auth" suggestions

**Effort:** 2 weeks

---

## 9. DRIFT DETECTION

### ❌ What You DON'T Have (Post-v1)

**Missing:**
- No codebase structure tracking
- No drift analysis
- No growth rate monitoring

### 📋 Build Tasks

**Priority: LOW (Tier 3, post-v1)**
- [ ] Track directory structure changes
- [ ] Calculate drift scores
- [ ] Growth rate alerts
- [ ] Drift dashboard

**Effort:** 1-2 weeks

---

## 10. PRODUCTIVITY INSIGHTS

### ❌ What You DON'T Have (Post-v1)

**Missing:**
- No time-of-day analysis
- No productivity patterns
- No peak hours detection

### 📋 Build Tasks

**Priority: LOW (Tier 3, post-v1)**
- [ ] Time-based analytics
- [ ] Productivity scoring
- [ ] Peak hours dashboard
- [ ] Late-night quality warnings

**Effort:** 1 week

---

## SUMMARY: WHAT TO BUILD vs ENHANCE

### ✅ Enhance Existing (40% complete)

**Feature 1: Anomaly Detection**
- Status: 40% done
- Action: Enhance with multi-project, agent attribution, more anomaly types
- Effort: 1-2 weeks

**Feature 2: Health Scoring**
- Status: 30% done
- Action: Enhanced formula, trends, action items
- Effort: 2-3 weeks

### 🔨 Build New (60% of work)

**Feature 3: Multi-Agent Monitoring** (CRITICAL)
- Status: 0% done
- Action: Build from scratch
- Effort: 1-2 weeks

**Feature 4: Risk Correlation** (HIGH)
- Status: 10% done (rollback exists, no tracking)
- Action: Build rollback tracking + risk analysis
- Effort: 1-2 weeks

**Feature 5-10:** All new builds (Tier 2 & 3)
- Status: 0% done
- Effort: 6-8 weeks total

---

## RECOMMENDED APPROACH

### Phase 1: Enhance Existing (Weeks 1-2)

**Week 1:**
- [x] Update AnomalyDetection to use `projectDatabases`
- [x] Add agent field to events
- [x] Basic agent detection
- [x] Agent badges in UI

**Week 2:**
- [x] Enhanced health scoring (5 components)
- [x] Health trends
- [x] Action items generator

### Phase 2: Critical New Features (Weeks 3-4)

**Week 3:**
- [ ] Multi-agent detection (ANT, Claude Code, Cursor)
- [ ] Agent statistics tracking
- [ ] Agent comparison UI

**Week 4:**
- [ ] Rollbacks table
- [ ] Risk correlation
- [ ] Risk warnings UI

### Phase 3: Intelligence Features (Weeks 5-8)

**Week 5-6:**
- [ ] Session tracking
- [ ] Pattern recognition
- [ ] Agent behavior profiling

**Week 7-8:**
- [ ] Polish & testing
- [ ] Documentation
- [ ] User feedback incorporation

---

## KEY DECISIONS

### ✅ DO NOT REBUILD

**Keep these as-is:**
- AnomalyAlertsPanel.svelte (UI is good)
- MultiProjectHealthPanel.svelte (UI is good)
- Basic statistical algorithms (work fine)
- Export functionality (already implemented)

### 🔧 ENHANCE NOT REPLACE

**Update these files:**
- `backend/server.js` (add multi-project support to endpoints)
- Database queries (change `projectState.db` to loop `projectDatabases`)
- Add new fields to existing tables (don't recreate)

### 🆕 BUILD NEW

**New services needed:**
- `backend/services/agent-detector.js`
- `backend/services/risk-analyzer.js`
- `backend/services/behavior-profiler.js`
- `backend/services/pattern-matcher.js`

### 💾 DATABASE CHANGES

**Minimal schema updates:**
```sql
-- Enhance existing events table
ALTER TABLE events ADD COLUMN agent TEXT;
ALTER TABLE events ADD COLUMN agent_confidence INTEGER;

-- Add 3 new tables
CREATE TABLE rollbacks (...);
CREATE TABLE agent_stats (...);
CREATE TABLE sessions (...);
```

---

## EFFORT ESTIMATE

### Total Work Remaining

**Tier 1 (MUST HAVE for v1):**
- Enhance Anomaly Detection: 1 week
- Enhance Health Scoring: 2 weeks
- Build Multi-Agent: 1-2 weeks
- Build Risk Correlation: 1-2 weeks
**Subtotal: 5-7 weeks**

**Tier 2 (NICE TO HAVE for v1):**
- Session Intelligence: 1 week
- Pattern Recognition: 2 weeks
- Agent Behavior Profiling: 1 week
**Subtotal: 4 weeks**

**Tier 3 (POST-V1):**
- Cross-Agent Intelligence: 2 weeks
- Drift Detection: 1-2 weeks
- Productivity Insights: 1 week
**Subtotal: 4-5 weeks**

**TOTAL: 13-16 weeks of work**

With focus on Tier 1 only: **5-7 weeks to v1.0**

---

## BOTTOM LINE

**You already have 40% of the foundation!**

**Don't rebuild:**
- AnomalyAlertsPanel ✅
- MultiProjectHealthPanel ✅
- Basic detection logic ✅

**Just enhance:**
- Multi-project support (1 week)
- Better algorithms (1 week)
- More anomaly types (1 week)

**And add:**
- Agent detection (1-2 weeks)
- Risk correlation (1-2 weeks)

**Result:** v1.0 in 5-7 weeks, not 12 weeks

---

**Document Status:** Ready for Implementation
**Next Action:** Start Phase 1 (enhance existing features)
**Owner:** Engineering Team
