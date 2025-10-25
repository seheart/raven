# INTEGRATION SUMMARY
## New Monitoring Services Integration Status

**Created:** October 25, 2025
**Status:** Ready for Integration

---

## WHAT WAS BUILT

### ✅ Core Services (Complete)

1. **AgentDetector** (`backend/services/agent-detector.js`)
   - Detects ANT, Claude Code, Cursor, Copilot, Aider
   - Process name detection
   - Environment variable detection
   - File marker detection
   - Change pattern analysis
   - Git author detection

2. **RiskAnalyzer** (`backend/services/risk-analyzer.js`)
   - File-specific rollback rate analysis
   - File criticality detection (auth, payment, database, security)
   - Change size anomaly detection
   - Recent rollback tracking
   - Change pattern analysis
   - Risk scoring (0-100 with low/medium/high levels)
   - Recommendation generation

3. **BehaviorProfiler** (`backend/services/behavior-profiler.js`)
   - Agent behavior profiling (30-day baselines)
   - Mood detection (aggressive/conservative/balanced)
   - Style detection (builder/cleanup/refactorer/mixed)
   - Behavior change detection
   - Deviation analysis
   - Daily statistics tracking
   - Cross-agent comparison

4. **PatternMatcher** (`backend/services/pattern-matcher.js`)
   - Similarity scoring (0-1)
   - Find similar past changes
   - Rollback pattern analysis
   - Outcome prediction
   - Historical success rate calculation

### ✅ Database Schema (Complete)

**Migration:** `backend/migrations/001_monitoring_enhancements.js`

**New Fields in `events` table:**
- `agent` TEXT
- `agent_confidence` INTEGER
- `is_anomaly` INTEGER
- `anomaly_score` INTEGER
- `anomaly_confidence` INTEGER
- `anomaly_reasons` TEXT (JSON)
- `risk_level` TEXT
- `risk_score` INTEGER
- `risk_factors` TEXT (JSON)

**New Tables:**
- `rollbacks` - Track rollback actions
- `agent_stats` - Daily agent statistics
- `sessions` - Coding session tracking
- `change_conversations` - AI explanation conversations
- `migrations` - Migration tracking

**New Indexes:**
- `idx_events_agent`
- `idx_events_anomaly`
- `idx_events_risk`
- `idx_rollbacks_event`
- `idx_agent_stats_lookup`
- `idx_sessions_project`

---

## NEXT STEPS: INTEGRATION INTO SERVER.JS

### Step 1: Run Migrations

```bash
cd backend
node run-migrations.js
```

This will add all new fields and tables to existing project databases.

### Step 2: Import Services in server.js

```javascript
// Add to imports section
import { agentDetector } from './services/agent-detector.js';
import { createRiskAnalyzer } from './services/risk-analyzer.js';
import { createBehaviorProfiler } from './services/behavior-profiler.js';
import { createPatternMatcher } from './services/pattern-matcher.js';

// Initialize services (after projectDatabases is populated)
let riskAnalyzer;
let behaviorProfiler;
let patternMatcher;

function initializeServices() {
  riskAnalyzer = createRiskAnalyzer(projectDatabases);
  behaviorProfiler = createBehaviorProfiler(projectDatabases);
  patternMatcher = createPatternMatcher(projectDatabases);
  console.log('✅ Monitoring services initialized');
}

// Call after projects are initialized
initializeServices();
```

### Step 3: Integrate Agent Detection

Update file watcher to detect and store agent:

```javascript
fileWatcher.on('change', async (change) => {
  // Detect which agent made the change
  const agentInfo = agentDetector.detectAgent(change, {
    processName: getCurrentProcessName(),
    projectRoot: projectPath,
    env: process.env
  });

  // Store with agent attribution
  const stmt = db.db.prepare(`
    INSERT INTO events (
      filepath, change_type, diff, timestamp,
      agent, agent_confidence, session_id
    ) VALUES (?, ?, ?, datetime('now'), ?, ?, ?)
  `);

  stmt.run(
    change.filepath,
    change.change_type,
    change.diff,
    agentInfo.agent,
    agentInfo.confidence,
    sessionId
  );

  // Get the event ID
  const eventId = db.db.prepare('SELECT last_insert_rowid() as id').get().id;

  // Run risk analysis (async, don't block)
  analyzeRiskAsync(eventId, change, projectName);

  // Emit event to clients
  io.emit('file-change', {
    ...change,
    agent: agentInfo.agent,
    agentConfidence: agentInfo.confidence
  });
});
```

### Step 4: Add Risk Analysis

```javascript
async function analyzeRiskAsync(eventId, change, projectName) {
  try {
    const risk = riskAnalyzer.analyzeRisk(change, projectName);

    // Update event with risk data
    db.db.prepare(`
      UPDATE events SET
        risk_score = ?,
        risk_level = ?,
        risk_factors = ?
      WHERE id = ?
    `).run(
      risk.riskScore,
      risk.riskLevel,
      JSON.stringify(risk.riskFactors),
      eventId
    );

    // Send alert if high risk
    if (risk.riskLevel === 'high') {
      io.emit('high-risk-change', {
        eventId,
        change,
        risk
      });
    }
  } catch (e) {
    console.error('Risk analysis failed:', e);
  }
}
```

### Step 5: Update Anomaly Detection Endpoint

Replace single-project logic with multi-project aggregation:

```javascript
app.get('/api/anomalies/detect', (req, res) => {
  try {
    const lookbackHours = parseInt(req.query.hours) || 24;
    const threshold = parseFloat(req.query.threshold) || 2.0;
    const lookbackTime = new Date(Date.now() - lookbackHours * 60 * 60 * 1000).toISOString();

    const allAnomalies = [];

    // Aggregate across all projects
    for (const [projectName, db] of projectDatabases.entries()) {
      // Get baseline
      const baseline = db.db.prepare(`
        SELECT strftime('%H', timestamp) as hour, COUNT(*) as count
        FROM events
        WHERE timestamp < ?
        GROUP BY hour
      `).all(lookbackTime);

      const avgPerHour = baseline.reduce((sum, h) => sum + h.count, 0) / Math.max(baseline.length, 1);
      const stdDev = Math.sqrt(
        baseline.reduce((sum, h) => sum + Math.pow(h.count - avgPerHour, 2), 0) / Math.max(baseline.length, 1)
      );

      // Check recent activity
      const recent = db.db.prepare(`
        SELECT
          strftime('%Y-%m-%d %H:00:00', timestamp) as hour,
          COUNT(*) as event_count,
          SUM(CASE WHEN change_type = 'unlink' THEN 1 ELSE 0 END) as deletions,
          COUNT(DISTINCT filepath) as unique_files,
          agent
        FROM events
        WHERE timestamp >= ?
        GROUP BY hour, agent
        ORDER BY hour DESC
      `).all(lookbackTime);

      // Detect anomalies
      for (const hour of recent) {
        // Activity spike
        if (hour.event_count > avgPerHour + (threshold * stdDev)) {
          allAnomalies.push({
            project: projectName,
            type: 'activity_spike',
            severity: 'warning',
            timestamp: hour.hour,
            agent: hour.agent,
            message: `${projectName}: Unusual activity spike - ${hour.event_count} events (avg: ${Math.round(avgPerHour)})`,
            details: {
              event_count: hour.event_count,
              average: Math.round(avgPerHour),
              std_devs: ((hour.event_count - avgPerHour) / Math.max(stdDev, 1)).toFixed(2)
            }
          });
        }

        // Excessive deletions
        if (hour.deletions > 10) {
          allAnomalies.push({
            project: projectName,
            type: 'excessive_deletions',
            severity: 'critical',
            timestamp: hour.hour,
            agent: hour.agent,
            message: `${projectName}: High deletion count - ${hour.deletions} files deleted`,
            details: { deletions: hour.deletions, threshold: 10 }
          });
        }
      }
    }

    res.json({
      anomalies: allAnomalies,
      baseline: { avgPerHour, stdDev },
      lookbackHours
    });
  } catch (error) {
    logger.error('Anomaly detection error:', error);
    res.status(500).json({ error: 'Failed to detect anomalies' });
  }
});
```

### Step 6: Add New API Endpoints

```javascript
// Agent behavior profile
app.get('/api/agents/:agent/profile', (req, res) => {
  const { agent } = req.params;
  const { project, days } = req.query;

  const profile = behaviorProfiler.getAgentProfile(
    project || 'raven',
    agent,
    parseInt(days) || 30
  );

  res.json({ profile });
});

// Behavior change detection
app.get('/api/agents/:agent/behavior-change', (req, res) => {
  const { agent } = req.params;
  const { project, hours } = req.query;

  const change = behaviorProfiler.detectBehaviorChange(
    project || 'raven',
    agent,
    parseInt(hours) || 24
  );

  res.json({ change });
});

// Agent comparison
app.get('/api/agents/compare', (req, res) => {
  const { project } = req.query;

  const comparison = behaviorProfiler.compareAgents(project || 'raven');

  res.json({ agents: comparison });
});

// Find similar changes (pattern matching)
app.post('/api/changes/:id/similar', (req, res) => {
  const { id } = req.params;
  const { project, limit } = req.query;

  // Get the change
  const db = projectDatabases.get(project || 'raven');
  const change = db.db.prepare('SELECT * FROM events WHERE id = ?').get(id);

  if (!change) {
    return res.status(404).json({ error: 'Change not found' });
  }

  const similar = patternMatcher.findSimilarChanges(
    change,
    project || 'raven',
    parseInt(limit) || 5
  );

  res.json({ similar });
});

// Rollback tracking
app.post('/api/changes/:id/rollback', (req, res) => {
  const { id } = req.params;
  const { project, reason } = req.body;

  const db = projectDatabases.get(project || 'raven');

  const success = riskAnalyzer.trackRollback(db, id, reason, false);

  if (success) {
    res.json({ success: true, message: 'Rollback tracked' });
  } else {
    res.status(500).json({ error: 'Failed to track rollback' });
  }
});
```

### Step 7: Add Daily Statistics Job

```javascript
// Run daily at midnight
import schedule from 'node-schedule';

schedule.scheduleJob('0 0 * * *', () => {
  console.log('🔄 Running daily agent statistics update...');

  for (const [projectName] of projectDatabases.entries()) {
    behaviorProfiler.updateDailyStats(projectName);
  }

  console.log('✅ Daily statistics updated');
});
```

---

## UI INTEGRATION NEEDED

### EventFeed.svelte - Add Agent Badges

```svelte
<script>
  function getAgentBadge(agent) {
    const badges = {
      'ant': { icon: '🐜', color: '#7aa2f7' },
      'claude-code': { icon: '🤖', color: '#bb9af7' },
      'cursor': { icon: '↗️', color: '#9ece6a' },
      'github-copilot': { icon: '🤝', color: '#f7768e' },
      'aider': { icon: '💬', color: '#e0af68' },
      'manual': { icon: '👤', color: '#a9b1d6' },
      'unknown': { icon: '❓', color: '#565f89' }
    };
    return badges[agent] || badges.unknown;
  }
</script>

{#each events as event}
  <div class="event-card">
    {#if event.agent}
      <span
        class="agent-badge"
        style="background: {getAgentBadge(event.agent).color}"
        title="{event.agent} ({event.agentConfidence}% confidence)"
      >
        {getAgentBadge(event.agent).icon}
      </span>
    {/if}

    <!-- Rest of event display -->
  </div>
{/each}
```

### Add RiskWarning Component

```svelte
<!-- RiskWarning.svelte -->
<script>
  export let risk;
</script>

{#if risk && risk.riskLevel !== 'low'}
  <div class="risk-warning severity-{risk.riskLevel}">
    <div class="risk-header">
      {#if risk.riskLevel === 'high'}
        ⚠️ High Risk
      {:else}
        ⚡ Medium Risk
      {/if}
      <span class="risk-score">{risk.riskScore}/100</span>
    </div>

    <ul class="risk-factors">
      {#each risk.riskFactors as factor}
        <li>{factor.message}</li>
      {/each}
    </ul>

    {#if risk.recommendation}
      <div class="risk-recommendation">
        💡 Recommendations:
        <ul>
          {#each risk.recommendation as rec}
            <li>{rec}</li>
          {/each}
        </ul>
      </div>
    {/if}
  </div>
{/if}
```

---

## TESTING CHECKLIST

Before deploying to production:

- [ ] Run migrations on test database
- [ ] Verify agent detection with ANT, Claude Code, Cursor
- [ ] Test risk analysis on various file types
- [ ] Verify behavior profiling with 30 days of data
- [ ] Test pattern matching with historical rollbacks
- [ ] Load test with 1000+ events
- [ ] Verify UI displays agent badges
- [ ] Test high-risk change alerts
- [ ] Verify anomaly detection aggregation
- [ ] Test all new API endpoints

---

## DEPLOYMENT STEPS

1. **Backup databases** (critical!)
   ```bash
   cp -r .raven/db .raven/db.backup-$(date +%Y%m%d)
   ```

2. **Run migrations**
   ```bash
   cd backend
   node run-migrations.js
   ```

3. **Restart Raven**
   ```bash
   raven restart
   ```

4. **Verify services loaded**
   Check logs for:
   ```
   ✅ Monitoring services initialized
   ```

5. **Test agent detection**
   Make a file change and check if agent is detected:
   ```bash
   curl http://localhost:3030/api/events?limit=1
   # Should show "agent": "ant" or similar
   ```

---

## ROLLBACK PLAN

If something breaks:

1. **Stop Raven**
   ```bash
   raven stop
   ```

2. **Restore database backup**
   ```bash
   rm -rf .raven/db
   mv .raven/db.backup-YYYYMMDD .raven/db
   ```

3. **Revert code changes**
   ```bash
   git checkout HEAD~1 backend/server.js
   ```

4. **Restart**
   ```bash
   raven start
   ```

---

**Status:** ✅ Ready for integration
**Estimated Time:** 2-4 hours for full integration and testing
**Risk Level:** Medium (database changes, new services)
**Recommendation:** Test on development copy first
