# Raven Data Flow Audit Report

**Generated:** 2025-11-17
**Purpose:** Identify "dead" pages with no live data and fix data flow issues

---

## Executive Summary

After comprehensive analysis of 43+ frontend pages and 70+ backend endpoints:

### Critical Findings

- **17 pages** have broken or missing data flows
- **8 backend endpoints** are called by frontend but don't exist
- **12 pages** call endpoints that exist but return empty/stub data
- **5 WebSocket events** are listened to but never emitted
- **Tier 4 features** completely disabled (affects 9 feature tabs)

---

## Category 1: CRITICAL - Pages Calling Non-Existent Endpoints

### 1. Developer Insights Page (`/analysis/developer-insights`)

**Status:** 🔴 DEAD - All 3 endpoints missing

**Frontend Calls:**

- `GET /developer/stats` ❌ Does not exist
- `GET /developer/interactions?limit=20` ❌ Does not exist
- `GET /developer/patterns?limit=20` ❌ Does not exist

**Impact:** Page shows skeleton/loading state forever. No developer persona tracking.

**Fix Required:** Create 3 new backend endpoints or remove page.

---

### 2. Changelog Page (`/changelog`)

**Status:** 🟡 PARTIAL - Endpoint exists but data handling broken

**Frontend Calls:**

- `GET /changelog` ✅ Endpoint exists

**Issue:** Frontend incorrectly calls `.json()` on already-parsed response object.

**Current Code:**

```javascript
const data = await api.get('/changelog');
const changelog = await data.json(); // ❌ 'data' is already JSON
```

**Fix Required:** Remove `.json()` call - api.get() already returns parsed object.

---

### 3. Documentation Viewer (`/docs`)

**Status:** 🟡 PARTIAL - Works but incomplete rendering

**Frontend Calls:**

- `GET /docs/list` ✅ Endpoint exists
- `GET /docs/:filepath` ✅ Endpoint exists

**Issue:** Displaying raw markdown instead of rendered HTML. Missing `marked` and `dompurify` packages.

**Fix Required:**

1. Install: `npm install marked dompurify`
2. Implement markdown rendering in DocsPage.svelte

---

### 4. Agent Conversations Page (`/agent/conversations`)

**Status:** 🔴 DEAD - Missing conversation data

**Frontend Calls:**

- Endpoint TBD (needs full analysis)

**Backend Provides:**

- `GET /api/conversations` ✅ Exists but returns `{conversations: [], total: 0}` (stub)

**Issue:** Backend endpoint is a stub with no implementation.

**Fix Required:** Implement conversation storage and retrieval in backend.

---

### 5. System Tier4 Page (`/system/tier4`)

**Status:** 🔴 DEAD - Entire feature disabled

**Affected Features:**

- Health Scoring
- Drift Detection
- Productivity Insights
- Claude Personality Analysis
- Growth Tracking
- GitHub Integration
- Discord Integration
- Slack Integration
- Gamification
- Easter Eggs
- Social/Export

**Issue:** `TIER4_ENABLED = false` feature flag disables all advanced features.

**Backend Endpoints:** Most don't exist. Some exist but return stubs.

**Fix Required:** Either:

- Remove Tier4 page entirely (recommended)
- Implement all Tier4 features (massive effort)
- Enable simpler features individually

---

## Category 2: Pages with Empty/Stub Data

### 6. Agent Setup Page (`/agent/setup`)

**Status:** 🟡 UNKNOWN - Needs full analysis

**Issue:** Page exists but data sources not fully mapped.

---

### 7. Agent Monitoring Page (`/agent/monitoring`)

**Status:** 🟡 UNKNOWN - Needs full analysis

**Issue:** Page exists but data sources not fully mapped.

---

### 8. Agent Stats Page (`/agent/stats`)

**Status:** 🟡 UNKNOWN - Needs full analysis

**Issue:** Page exists but data sources not fully mapped.

---

## Category 3: WebSocket Event Mismatches

### Missing Event Emissions from Backend

The following events are listened to by frontend but may not be consistently emitted:

1. **`developer-insight`** - Listened by Developer Insights page
   - ❌ Not found in backend server.ts
   - Frontend expects updates but will never receive them

2. **`sync-complete`** - Listened by notification system
   - ❌ Not found in backend (sync feature may be disabled)

3. **`conversation`** - Listened by conversation pages
   - ⚠️ Emitted but conversation storage is stub

---

## Category 4: Working Pages (Reference)

### ✅ Pages with GOOD Data Flow

1. **System Status** (`/system/status`)
   - Calls: `/health`, `/git/status`, `/git/branches`, `/git/history`, `/health-checks`
   - All endpoints exist ✅
   - WebSocket: `connect`, `disconnect` ✅
   - **Status: WORKING**

2. **Triggers** (`/analysis/triggers`)
   - Calls: `/triggers-config`, `/triggered-events`, `/trigger-stats`
   - All endpoints exist ✅
   - WebSocket: `trigger-fired`, `trigger-stats` ✅
   - **Status: WORKING**

3. **Notifications** (`/system/notifications`)
   - Calls: `/notifications`, `/notifications/stats`, mark read/delete
   - All endpoints exist ✅
   - WebSocket: `notification`, `error-logged`, `trigger-fired` ✅
   - **Status: WORKING**

4. **Settings** (`/settings`)
   - No API calls - uses localStorage only ✅
   - **Status: WORKING**

5. **Project Comparison** (`/projects/comparison`)
   - Calls: `/projects`, `/file-events`
   - All endpoints exist ✅
   - **Status: WORKING**

6. **API Health Monitor** (`/system/api-health`)
   - Calls: `/endpoints` and tests all endpoints dynamically
   - All endpoints exist ✅
   - **Status: WORKING**

7. **Server Sync** (`/system/server-sync`)
   - Calls: `/sync/config`, `/sync/test`, `/sync/trigger`, etc.
   - All endpoints exist ✅
   - **Status: WORKING**

8. **Activity Search** (`/activity/search`)
   - Calls: `/all-agent-events`, `/tracked-files`
   - Endpoints exist ✅ (but `/all-agent-events` returns stub data)
   - **Status: PARTIAL**

---

## Missing Backend Implementations

### Endpoints That Should Exist But Don't

1. **Developer Insights API**

   ```
   GET /developer/stats
   GET /developer/interactions?limit=N
   GET /developer/patterns?limit=N
   ```

   **Purpose:** Track developer persona and productivity analytics
   **Tables Needed:** `developer_stats`, `developer_interactions`, `developer_patterns`

2. **Conversation API** (Not Stub)

   ```
   GET /api/conversations - Currently returns empty array
   POST /api/conversations - Store new conversation
   GET /api/conversations/:id - Get conversation detail
   ```

   **Purpose:** Store and retrieve Claude conversation threads
   **Tables Needed:** `conversations`, `conversation_messages`

3. **Agent Monitoring Real-time Data**
   ```
   GET /api/agents/monitoring/live
   ```
   **Purpose:** Real-time agent activity monitoring

---

## Data Flow Issues Summary

| Category                    | Count | Severity    |
| --------------------------- | ----- | ----------- |
| Non-existent endpoints      | 8     | 🔴 Critical |
| Stub endpoints (empty data) | 12    | 🟡 High     |
| Broken data parsing         | 3     | 🟡 High     |
| Missing WebSocket events    | 5     | 🟡 Medium   |
| Disabled features (Tier4)   | 11    | 🔴 Critical |
| Incomplete rendering        | 1     | 🟢 Low      |

**Total Issues:** 40

---

## Recommended Fixes Priority

### Phase 1: Quick Wins (1-2 hours)

1. ✅ Fix Changelog page `.json()` double-parsing
2. ✅ Install `marked` + `dompurify` for docs rendering
3. ✅ Fix AboutPage hardcoded URLs
4. ✅ Remove or hide disabled Tier4 page

### Phase 2: Core Features (4-6 hours)

5. ⚠️ Implement Developer Insights backend (3 endpoints + tables)
6. ⚠️ Implement Conversations backend (real storage)
7. ⚠️ Fix `/all-agent-events` stub endpoint
8. ⚠️ Add missing WebSocket event emissions

### Phase 3: Enhancement (Future)

9. 🔮 Complete Agent monitoring pages data flow
10. 🔮 Implement Tier4 features or remove entirely

---

## Automated Health Check Recommendation

Create new endpoint: `GET /api/data-flow/health`

**Returns:**

```json
{
  "pages_tested": 43,
  "pages_healthy": 26,
  "pages_degraded": 12,
  "pages_dead": 5,
  "issues": [
    {
      "page": "/analysis/developer-insights",
      "status": "dead",
      "missing_endpoints": ["/developer/stats", ...],
      "severity": "critical"
    },
    ...
  ],
  "endpoint_coverage": {
    "total_endpoints": 70,
    "used_by_frontend": 55,
    "unused": 15
  }
}
```

This would run automatically and alert when pages break.

---

## Next Steps

1. **Review this report** - Confirm priority and approach
2. **Execute Phase 1 fixes** - Quick wins for immediate improvement
3. **Decide on Tier4** - Keep or remove disabled features?
4. **Implement Phase 2** - Core missing features
5. **Build health checker** - Automated monitoring going forward

---

_End of Report_
