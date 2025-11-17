# Tier 4 Rebuild Plan

**Date:** 2025-11-17
**Purpose:** Break monolithic Tier4Page into focused, functional feature pages

---

## Current State Analysis

**Tier 4 Page:** 1591 lines, 9 tabs, 100% disabled (TIER4_ENABLED = false)

### 9 Features in Tier 4:

1. **Health Scoring** - Project health metrics with recommendations
2. **Drift Detection** - Baseline drift monitoring
3. **Productivity Insights** - Developer productivity analytics
4. **Claude Personality** - AI personality analysis
5. **Growth Tracking** - Project growth metrics and milestones
6. **Integrations** - GitHub/Discord/Slack configuration
7. **Gamification** - Achievements and badges
8. **Easter Eggs** - Seasonal messages and discoveries
9. **Social** - Export stats and team management

---

## Decision Matrix: Keep, Build, or Remove

| Feature               | Priority  | Action              | Reason                                 |
| --------------------- | --------- | ------------------- | -------------------------------------- |
| Health Scoring        | 🔴 High   | **Build New**       | Critical for project monitoring        |
| Drift Detection       | 🟡 Medium | **Build New**       | Useful for catching unexpected changes |
| Productivity Insights | 🔴 High   | **Already exists!** | Use existing DeveloperInsightsPage     |
| Claude Personality    | 🟢 Low    | **Remove**          | Too niche, hard to quantify value      |
| Growth Tracking       | 🟡 Medium | **Build Simple**    | Useful but can be lightweight          |
| Integrations          | 🔴 High   | **Build New**       | GitHub/Discord/Slack very useful       |
| Gamification          | 🟢 Low    | **Remove**          | Fun but not core value                 |
| Easter Eggs           | 🟢 Low    | **Remove**          | Not production-worthy                  |
| Social/Export         | 🟡 Medium | **Build Simple**    | Export is useful                       |

---

## New Page Structure

### 1. Project Health Page

**Route:** `/analysis/project-health`
**File:** `AnalysisProjectHealthPage.svelte`

**Features:**

- Overall health score (0-100)
- Health factors breakdown (code quality, test coverage, documentation, activity)
- Recommendations for improvement
- Health trend over time (chart)
- Health by project comparison

**Backend APIs Needed:**

```
GET /api/health/score?project=X
- Returns: { score: 85, factors: {...}, recommendations: [...] }

GET /api/health/trends?project=X&days=30
- Returns: { trends: [{date, score}] }

POST /api/health/calculate?project=X
- Triggers health score recalculation
- Returns: { score, factors }
```

**Implementation:** ~400 lines, 2-3 hours

---

### 2. Drift Detection Page

**Route:** `/analysis/drift-detection`
**File:** `AnalysisDriftDetectionPage.svelte`

**Features:**

- Recent drift events (last 24h)
- Drift severity (low, medium, high, critical)
- Baseline metrics comparison
- Drift trend chart
- Manual drift detection trigger

**Backend APIs Needed:**

```
GET /api/drift/recent?project=X&hours=24
- Returns: { drifts: [{timestamp, metric, baseline, current, severity}] }

GET /api/drift/summary?project=X&days=7
- Returns: { totalDrifts, bySeverity, mostDrifted }

POST /api/drift/detect?project=X
- Triggers drift analysis
- Returns: { drifts: [...] }
```

**Implementation:** ~300 lines, 2 hours

---

### 3. Growth Tracking Page

**Route:** `/analysis/growth`
**File:** `AnalysisGrowthPage.svelte`

**Features:**

- Project size growth (LOC, files, commits)
- Activity growth (events, agents)
- Growth milestones
- Growth rate chart
- Project maturity indicators

**Backend APIs Needed:**

```
GET /api/growth/summary?project=X&days=30
- Returns: { loc, files, commits, events, milestones }

GET /api/growth/trends?project=X&days=90
- Returns: { trends: [{date, loc, files, commits}] }
```

**Implementation:** ~350 lines, 2 hours

---

### 4. Integrations Page

**Route:** `/system/integrations`
**File:** `SystemIntegrationsPage.svelte`

**Features:**

- **GitHub Integration:**
  - Connect repository (token, owner, repo)
  - View recent commits/PRs
  - Trigger notifications on events

- **Discord Integration:**
  - Webhook URL configuration
  - Test webhook
  - Event feed to Discord channel

- **Slack Integration:**
  - Webhook URL configuration
  - Test webhook
  - Event feed to Slack channel

**Backend APIs Needed:**

```
GET /api/integrations/github/config
POST /api/integrations/github/config
POST /api/integrations/github/test
GET /api/integrations/github/events?hours=24

GET /api/integrations/discord/config
POST /api/integrations/discord/config
POST /api/integrations/discord/test

GET /api/integrations/slack/config
POST /api/integrations/slack/config
POST /api/integrations/slack/test
```

**Implementation:** ~500 lines, 3-4 hours

---

### 5. Export & Sharing Page

**Route:** `/system/export`
**File:** `SystemExportPage.svelte`

**Features:**

- Export formats: JSON, CSV, SQLite dump
- Export scope: All data, specific project, date range
- Share history tracking
- Download management

**Backend APIs Needed:**

```
POST /api/export/generate
- Body: { format, scope, project, startDate, endDate }
- Returns: { downloadUrl, expiresAt }

GET /api/export/history?limit=20
- Returns: { exports: [{timestamp, format, size, downloadUrl}] }
```

**Implementation:** ~300 lines, 2 hours

---

## Features to REMOVE

### ❌ Claude Personality Analysis

**Reason:** Too speculative, hard to quantify, not production-ready

### ❌ Gamification (Achievements/Badges)

**Reason:** Fun but doesn't add monitoring value, adds complexity

### ❌ Easter Eggs

**Reason:** Cute but unprofessional for production tool

---

## Migration Path

### Phase 1: Create New Pages (Priority Order)

1. ✅ IntegrationsPage - Most requested feature
2. ✅ ProjectHealthPage - Core monitoring value
3. ✅ ExportPage - Frequently needed utility
4. ✅ DriftDetectionPage - Advanced monitoring
5. ✅ GrowthPage - Nice-to-have analytics

### Phase 2: Backend Implementation

For each page above, implement corresponding backend routes and business logic.

### Phase 3: Remove Tier4Page

Once all new pages are working:

1. Remove SystemTier4Page.svelte
2. Remove `/system/tier4` route from router
3. Update navigation to show new pages
4. Clean up old Tier4 docs/references

---

## Backend Implementation Priorities

### High Priority APIs (Implement First)

1. **Integrations APIs** - External services are high value
   - GitHub, Discord, Slack webhooks
   - ~200 lines backend code

2. **Health Scoring APIs** - Core monitoring feature
   - Calculate health scores based on activity, errors, tests
   - ~300 lines backend code

3. **Export APIs** - Frequently requested
   - Generate exports in various formats
   - ~150 lines backend code

### Medium Priority APIs (Implement Second)

4. **Drift Detection APIs**
   - Statistical analysis of metric changes
   - ~250 lines backend code

5. **Growth Tracking APIs**
   - Aggregate growth metrics over time
   - ~150 lines backend code

---

## Navigation Updates

### Current Navigation:

```
System
  ├─ Status
  ├─ Tier 4 (disabled)
  ├─ API Health
  └─ ...
```

### New Navigation:

```
Analysis
  ├─ Overview
  ├─ Performance
  ├─ Project Health (NEW)
  ├─ Drift Detection (NEW)
  ├─ Growth Tracking (NEW)
  ├─ Developer Insights
  └─ ...

System
  ├─ Status
  ├─ Integrations (NEW)
  ├─ Export (NEW)
  ├─ API Health
  └─ ...
```

---

## Implementation Estimates

| Task                          | Lines of Code | Time    | Priority  |
| ----------------------------- | ------------- | ------- | --------- |
| IntegrationsPage (frontend)   | ~500          | 3h      | 🔴 High   |
| Integrations backend          | ~200          | 2h      | 🔴 High   |
| ProjectHealthPage (frontend)  | ~400          | 2h      | 🔴 High   |
| Health backend                | ~300          | 3h      | 🔴 High   |
| ExportPage (frontend)         | ~300          | 2h      | 🔴 High   |
| Export backend                | ~150          | 1h      | 🔴 High   |
| DriftDetectionPage (frontend) | ~300          | 2h      | 🟡 Medium |
| Drift backend                 | ~250          | 2h      | 🟡 Medium |
| GrowthPage (frontend)         | ~350          | 2h      | 🟡 Medium |
| Growth backend                | ~150          | 1h      | 🟡 Medium |
| Remove Tier4 + cleanup        | -             | 1h      | 🟢 Low    |
| **TOTAL**                     | **~2900**     | **21h** | -         |

---

## Quick Win Alternative: Minimal Viable Rebuild

If full implementation is too much, here's a minimal version:

**Keep:** Integrations only (most valuable)
**Implementation:**

- Single IntegrationsPage with GitHub/Discord/Slack
- ~500 lines frontend + 200 lines backend
- **Total time: 5 hours**

**Benefits:**

- Immediate value (webhook integrations)
- Removes confusing disabled Tier4 page
- Foundation for future expansion

---

## Recommendation

**Option A: Full Rebuild** (21 hours)

- Implement all 5 new pages
- Maximum feature coverage
- Best long-term solution

**Option B: Phased Approach** (Start with 10 hours)

- Week 1: Integrations + Export (5h)
- Week 2: Health + Drift (7h)
- Week 3: Growth + cleanup (3h)

**Option C: Minimal (5 hours)**

- Integrations page only
- Remove Tier4
- Add other features later as needed

---

_Recommended: Option B (Phased Approach)_

This gives immediate value while spreading the work over time and allowing for user feedback to prioritize remaining features.

---

_End of Plan_
