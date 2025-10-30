# RAVEN v2 PRODUCT VISION
## The AI Agent Monitor for Individual Developers

**Updated:** October 25, 2025
**Supersedes:** EXECUTIVE_PRODUCT_REVIEW.md (team-focused approach)
**Core Insight:** Raven monitors, ANT builds. Separate tools, complementary purpose.

---

## EXECUTIVE SUMMARY

**Raven is the passive observer. ANT is the active builder.**

### The Ecosystem

```
┌─────────────────────────────────────────────┐
│         YOUR DEVELOPMENT ENVIRONMENT         │
├─────────────────────────────────────────────┤
│                                             │
│  AI Coding Agents (Active):                │
│  ├─ ANT (your tool) ...................... 🐜 │
│  ├─ Claude Code ......................... 🤖 │
│  ├─ Cursor .............................. ↗️  │
│  ├─ GitHub Copilot ...................... 🤝 │
│  └─ Aider ............................... 💬 │
│                                             │
│                    │                        │
│                    ▼                        │
│                                             │
│  Raven (Passive Monitor) ................ 🐦‍⬛ │
│  └─ Watches all agents                     │
│  └─ Detects anomalies                      │
│  └─ Tracks patterns                        │
│  └─ Provides intelligence                  │
│                                             │
└─────────────────────────────────────────────┘
```

### Core Philosophy

**Target User:** Solo developer (not teams in v1)
**Value Proposition:** Universal AI agent monitor that detects anomalies, learns patterns, and protects your code
**Differentiation:** Agent-agnostic monitoring with behavioral intelligence

---

## 1. STRATEGIC POSITIONING

### What Raven Is
✅ **Universal AI Agent Monitor** - Works with ANT, Claude Code, Cursor, Copilot, Aider
✅ **Behavioral Intelligence** - Learns your patterns, detects anomalies
✅ **Safety Net** - Protects you from AI mistakes with rollback and alerts
✅ **Solo Developer Tool** - Simple, local-first, no auth/teams complexity

### What Raven Is NOT
❌ **Not an AI Coding Assistant** - That's ANT's job
❌ **Not Team Collaboration** - Solo dev focus in v1
❌ **Not Cloud-Based** - Local-first, privacy-focused
❌ **Not Agent-Specific** - Works with ALL agents, not locked to one

### Why This Matters
- **ANT and Raven complement each other** - Build vs Monitor
- **Raven has value independently** - Works with any AI coding tool
- **Clear separation of concerns** - No feature confusion
- **Simpler architecture** - No auth, no teams, faster development

---

## 2. THE 10 CORE MONITORING FEATURES

### TIER 1: MUST-HAVE FOR v1 (Ship in 60 days)

#### **Feature 1: Anomaly Detection**
**"This change is unusual for you"**

**What it does:**
- Statistical analysis of your normal coding patterns
- Real-time alerts when AI agents do something unexpected
- Machine learning model learns what's "normal" for you

**User Experience:**
```
🚨 Anomaly Detected

ANT just deleted 847 lines from auth.js

Why this is unusual:
- 5x more deletions than your average (avg: 167 lines)
- You typically modify this file, not delete from it
- Last 10 changes to auth.js were all <50 lines
- This pattern is similar to the incident on Oct 12 (which you rolled back)

Confidence: 87%
Risk Level: High

[Review Change] [Ask Why] [Auto-Rollback] [False Alarm]
```

**Implementation:**
```javascript
// backend/services/anomaly-detector.js
class AnomalyDetector {
  constructor(projectName) {
    this.projectName = projectName;
    this.baseline = this.loadBaseline();
  }

  loadBaseline() {
    // Calculate baseline from historical data
    const history = db.prepare(`
      SELECT filepath, change_type,
             LENGTH(diff) as diff_size,
             ABS(additions - deletions) as net_change
      FROM events
      WHERE project_name = ?
      AND timestamp > datetime('now', '-30 days')
    `).all(this.projectName);

    // Calculate mean and std dev for each metric
    const stats = {
      avgDiffSize: mean(history.map(h => h.diff_size)),
      stdDiffSize: stdDev(history.map(h => h.diff_size)),
      avgNetChange: mean(history.map(h => h.net_change)),
      stdNetChange: stdDev(history.map(h => h.net_change)),
      fileFrequency: this.calculateFileFrequency(history),
      changeTypeDistribution: this.calculateChangeTypeDistribution(history)
    };

    return stats;
  }

  detectAnomaly(change) {
    const scores = [];

    // Check 1: Is diff size unusual?
    const diffSize = change.diff.length;
    const zScore = (diffSize - this.baseline.avgDiffSize) / this.baseline.stdDiffSize;
    if (Math.abs(zScore) > 2) { // 2 standard deviations
      scores.push({
        type: 'diff_size',
        severity: Math.abs(zScore) / 2, // Normalize to 0-1
        message: `${Math.abs(zScore).toFixed(1)}x ${zScore > 0 ? 'larger' : 'smaller'} than your average`
      });
    }

    // Check 2: Is this file edited unusually often/rarely?
    const fileFreq = this.baseline.fileFrequency[change.filepath] || 0;
    if (fileFreq < 0.01) { // Rarely edited file
      scores.push({
        type: 'rare_file',
        severity: 0.7,
        message: 'You rarely edit this file (only 3 times in 30 days)'
      });
    }

    // Check 3: Is change type unusual for this file?
    const changeTypePattern = this.getFileChangePattern(change.filepath);
    if (changeTypePattern && changeTypePattern.dominant !== change.change_type) {
      scores.push({
        type: 'unusual_change_type',
        severity: 0.6,
        message: `You typically ${changeTypePattern.dominant} this file, not ${change.change_type}`
      });
    }

    // Check 4: Similar to past incidents?
    const similarIncidents = this.findSimilarIncidents(change);
    if (similarIncidents.length > 0) {
      scores.push({
        type: 'past_incident',
        severity: 0.9,
        message: `Similar to ${similarIncidents.length} past incidents you rolled back`,
        incidents: similarIncidents
      });
    }

    // Calculate overall anomaly score
    if (scores.length === 0) return null;

    const anomalyScore = scores.reduce((sum, s) => sum + s.severity, 0) / scores.length;
    const confidence = Math.min(scores.length / 4, 1.0); // More signals = higher confidence

    return {
      isAnomaly: anomalyScore > 0.5,
      score: Math.round(anomalyScore * 100),
      confidence: Math.round(confidence * 100),
      reasons: scores.map(s => s.message),
      riskLevel: anomalyScore > 0.7 ? 'high' : anomalyScore > 0.4 ? 'medium' : 'low'
    };
  }

  findSimilarIncidents(change) {
    // Look for similar changes that were rolled back
    return db.prepare(`
      SELECT e.*, r.timestamp as rollback_time, r.reason
      FROM events e
      JOIN rollbacks r ON e.id = r.event_id
      WHERE e.project_name = ?
      AND e.filepath LIKE ?
      AND e.change_type = ?
      AND timestamp > datetime('now', '-90 days')
    `).all(
      this.projectName,
      `%${path.basename(change.filepath)}%`,
      change.change_type
    );
  }
}

// Trigger on every new event
fileWatcher.on('change', async (change) => {
  const detector = new AnomalyDetector(change.project_name);
  const anomaly = detector.detectAnomaly(change);

  if (anomaly && anomaly.isAnomaly) {
    // Save to database
    db.prepare(`
      UPDATE events SET
        is_anomaly = 1,
        anomaly_score = ?,
        anomaly_confidence = ?,
        anomaly_reasons = ?,
        risk_level = ?
      WHERE id = ?
    `).run(
      anomaly.score,
      anomaly.confidence,
      JSON.stringify(anomaly.reasons),
      anomaly.riskLevel,
      change.id
    );

    // Send alert via WebSocket
    io.emit('anomaly-detected', { change, anomaly });
  }
});
```

**Database Schema:**
```sql
ALTER TABLE events ADD COLUMN is_anomaly INTEGER DEFAULT 0;
ALTER TABLE events ADD COLUMN anomaly_score INTEGER;
ALTER TABLE events ADD COLUMN anomaly_confidence INTEGER;
ALTER TABLE events ADD COLUMN anomaly_reasons TEXT; -- JSON array
ALTER TABLE events ADD COLUMN risk_level TEXT; -- 'low', 'medium', 'high'

CREATE TABLE rollbacks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER NOT NULL,
  timestamp TEXT NOT NULL,
  reason TEXT,
  FOREIGN KEY (event_id) REFERENCES events(id)
);
```

**Priority:** CRITICAL - This is the killer feature
**Effort:** 2 weeks
**Dependencies:** Historical event data (30+ days ideal)

---

#### **Feature 2: Multi-Agent Monitoring**
**"Works with ANT, Claude Code, Cursor, Copilot, Aider"**

**What it does:**
- Detects which AI agent made each change
- Tracks per-agent statistics and behavior
- Unified view across all your AI tools

**Implementation:**
```javascript
// backend/services/agent-detector.js
class AgentDetector {
  detectAgent(change, context) {
    const signals = {
      processName: context.processName,
      workingDir: context.workingDir,
      environment: context.env,
      filePattern: this.analyzeFilePattern(change),
      commitPattern: this.analyzeCommitPattern(change)
    };

    // ANT detection
    if (signals.processName?.includes('ant') || signals.env?.ANT_SESSION) {
      return { agent: 'ant', confidence: 95 };
    }

    // Claude Code detection
    if (signals.processName?.includes('claude') || signals.workingDir?.includes('.anthropic')) {
      return { agent: 'claude-code', confidence: 90 };
    }

    // Cursor detection
    if (signals.processName?.includes('cursor') || signals.env?.CURSOR_SESSION) {
      return { agent: 'cursor', confidence: 90 };
    }

    // GitHub Copilot detection
    if (signals.processName?.includes('copilot') || signals.workingDir?.includes('.github/copilot')) {
      return { agent: 'github-copilot', confidence: 85 };
    }

    // Aider detection
    if (signals.processName?.includes('aider') || signals.env?.AIDER_MODEL) {
      return { agent: 'aider', confidence: 90 };
    }

    // Manual change detection (user editing directly)
    if (this.detectManualEdit(change, context)) {
      return { agent: 'manual', confidence: 80 };
    }

    return { agent: 'unknown', confidence: 50 };
  }

  analyzeFilePattern(change) {
    // Different agents have different editing patterns
    // ANT: Many small edits
    // Claude Code: Large contextual changes
    // Cursor: Precise single-line edits
    // Copilot: Autocomplete-style additions

    const lines = change.diff.split('\n');
    const additions = lines.filter(l => l.startsWith('+')).length;
    const deletions = lines.filter(l => l.startsWith('-')).length;

    return { additions, deletions, ratio: additions / (deletions || 1) };
  }
}

// Enhanced event tracking
fileWatcher.on('change', (change) => {
  const detector = new AgentDetector();
  const agentInfo = detector.detectAgent(change, {
    processName: getCurrentProcess(),
    workingDir: process.cwd(),
    env: process.env
  });

  // Save with agent attribution
  db.prepare(`
    INSERT INTO events (filepath, change_type, diff, agent, agent_confidence, timestamp)
    VALUES (?, ?, ?, ?, ?, datetime('now'))
  `).run(
    change.filepath,
    change.change_type,
    change.diff,
    agentInfo.agent,
    agentInfo.confidence
  );
});
```

**Database Schema:**
```sql
ALTER TABLE events ADD COLUMN agent TEXT; -- 'ant', 'claude-code', 'cursor', 'copilot', 'aider', 'manual', 'unknown'
ALTER TABLE events ADD COLUMN agent_confidence INTEGER; -- 0-100
```

**Priority:** CRITICAL
**Effort:** 1-2 weeks
**Dependencies:** Process monitoring, environment detection

---

#### **Feature 3: Risk Correlation**
**"You rolled back similar changes 3 times"**

**What it does:**
- Learns from your rollback history
- Predicts which changes are likely to be rolled back
- Shows historical context for risky files

**User Experience:**
```
⚠️  High-Risk Pattern Detected

ANT is modifying: database.js

Historical Risk Data:
- Last 5 changes to database.js: 3 were rolled back (60% failure rate)
- Your overall rollback rate: 12%
- Common issues in this file: SQL injection, connection leaks
- Time to rollback (average): 18 minutes
- Last incident: October 19 (6 days ago) - "Connection pool exhausted"

Similar Past Incidents:
1. Oct 19: Added connection pooling → Rolled back (pool exhausted)
2. Oct 12: Refactored queries → Rolled back (SQL injection)
3. Oct 8: Updated schema → Rolled back (foreign key constraint)

🧠 Raven Recommends:
✓ Review query escaping carefully (past SQL injection issue)
✓ Check connection pool configuration (past exhaustion issue)
✓ Test with production-like data
✓ Consider setting a checkpoint before proceeding

[View Past Incidents] [Set Checkpoint] [Strict Monitoring]
```

**Implementation:**
```javascript
// backend/services/risk-analyzer.js
class RiskAnalyzer {
  analyzeRisk(change) {
    // Get file history
    const fileHistory = db.prepare(`
      SELECT e.*, r.id as rollback_id, r.reason as rollback_reason
      FROM events e
      LEFT JOIN rollbacks r ON e.id = r.event_id
      WHERE e.filepath = ?
      AND e.timestamp > datetime('now', '-90 days')
      ORDER BY e.timestamp DESC
    `).all(change.filepath);

    const totalChanges = fileHistory.length;
    const rollbacks = fileHistory.filter(h => h.rollback_id !== null);
    const rollbackRate = totalChanges > 0 ? (rollbacks.length / totalChanges) : 0;

    // Calculate overall project rollback rate for comparison
    const overallRollbackRate = this.getOverallRollbackRate(change.project_name);

    // Risk signals
    const riskFactors = [];

    // Signal 1: High rollback rate for this file
    if (rollbackRate > overallRollbackRate * 3) {
      riskFactors.push({
        factor: 'high_rollback_rate',
        severity: 0.8,
        message: `This file has ${(rollbackRate * 100).toFixed(0)}% rollback rate vs ${(overallRollbackRate * 100).toFixed(0)}% overall`
      });
    }

    // Signal 2: Recent rollback
    if (rollbacks.length > 0) {
      const lastRollback = rollbacks[0];
      const daysSince = this.daysSince(lastRollback.timestamp);
      if (daysSince < 7) {
        riskFactors.push({
          factor: 'recent_rollback',
          severity: 0.7,
          message: `Last rollback was ${daysSince} days ago: "${lastRollback.rollback_reason}"`
        });
      }
    }

    // Signal 3: File criticality
    const criticality = this.getFileCriticality(change.filepath);
    if (criticality > 0.7) {
      riskFactors.push({
        factor: 'critical_file',
        severity: criticality,
        message: `This is a critical file (${this.getFileCategoryName(change.filepath)})`
      });
    }

    // Signal 4: Large change size
    const changeSize = change.diff.split('\n').length;
    const avgChangeSize = this.getAvgChangeSize(change.filepath);
    if (changeSize > avgChangeSize * 3) {
      riskFactors.push({
        factor: 'large_change',
        severity: 0.6,
        message: `Change is ${(changeSize / avgChangeSize).toFixed(1)}x larger than typical`
      });
    }

    // Calculate overall risk score
    const riskScore = riskFactors.length > 0
      ? riskFactors.reduce((sum, f) => sum + f.severity, 0) / riskFactors.length
      : 0;

    return {
      riskScore: Math.round(riskScore * 100),
      riskLevel: riskScore > 0.7 ? 'high' : riskScore > 0.4 ? 'medium' : 'low',
      rollbackRate: Math.round(rollbackRate * 100),
      overallRollbackRate: Math.round(overallRollbackRate * 100),
      recentRollbacks: rollbacks.slice(0, 5),
      riskFactors: riskFactors.map(f => f.message),
      recommendation: this.generateRecommendation(riskScore, rollbacks)
    };
  }

  getFileCriticality(filepath) {
    // Critical files: auth, payment, database, security
    const criticalPatterns = [
      { pattern: /auth|login|session|jwt|token/i, score: 0.9 },
      { pattern: /payment|billing|stripe|charge/i, score: 0.95 },
      { pattern: /database|sql|query|migration/i, score: 0.85 },
      { pattern: /security|crypto|encrypt|password/i, score: 0.9 },
      { pattern: /config|env|secret/i, score: 0.8 }
    ];

    for (const { pattern, score } of criticalPatterns) {
      if (pattern.test(filepath)) return score;
    }

    return 0.3; // Default: low criticality
  }

  generateRecommendation(riskScore, rollbacks) {
    if (riskScore > 0.7) {
      return [
        'Set a checkpoint before proceeding',
        'Review past rollback reasons carefully',
        'Test thoroughly before committing',
        'Consider pair programming or code review'
      ];
    } else if (riskScore > 0.4) {
      return [
        'Consider setting a checkpoint',
        'Review the diff carefully',
        'Run tests before committing'
      ];
    }
    return ['Change looks safe based on history'];
  }
}

// Trigger on every change
fileWatcher.on('change', (change) => {
  const analyzer = new RiskAnalyzer();
  const risk = analyzer.analyzeRisk(change);

  // Save risk analysis
  db.prepare(`
    UPDATE events SET
      risk_score = ?,
      risk_level = ?,
      rollback_rate = ?,
      risk_factors = ?
    WHERE id = ?
  `).run(
    risk.riskScore,
    risk.riskLevel,
    risk.rollbackRate,
    JSON.stringify(risk.riskFactors),
    change.id
  );

  // Alert if high risk
  if (risk.riskLevel === 'high') {
    io.emit('high-risk-change', { change, risk });
  }
});
```

**Priority:** HIGH
**Effort:** 1-2 weeks
**Dependencies:** Rollback tracking system

---

### TIER 2: IMPORTANT FOR v1 (Nice to have)

#### **Feature 4: Agent Behavior Profiling**
**"ANT is acting aggressive today"**

**What it does:**
- Tracks each agent's "personality" and coding style
- Detects when an agent is behaving differently than usual
- "Mood" indicator for each agent

**User Experience:**
```
📊 Agent Behavior Report: ANT

Today vs 30-Day Average:
- Deletions: ⬆️ 340% higher than usual
- File modifications: ⬇️ 40% lower than usual
- Lines changed per edit: ⬆️ 230% higher (avg: 45 → 104)
- Confidence score: ⬇️ 15% lower (based on revision frequency)

Current Mood: 🟡 Aggressive (Cleanup Mode)

Analysis:
ANT is making large structural changes today. This pattern typically
occurs during refactoring sessions. Watch for:
- Unintended deletions
- Breaking changes to APIs
- Test coverage gaps

Historical Context:
- Last time ANT was this aggressive: Oct 12 (you rolled back 40% of changes)
- ANT's typical mode: Conservative (small, incremental changes)
- Success rate in aggressive mode: 68% vs 94% in conservative mode

🧠 Recommendation: Extra caution during this session. Set frequent checkpoints.

[View Detailed Stats] [Set Conservative Mode] [Notify on Large Changes]
```

**Priority:** MEDIUM
**Effort:** 1 week
**Dependencies:** Agent detection, behavioral metrics

---

#### **Feature 5: Session Intelligence**
**"You're in flow... or burning out"**

**What it does:**
- Tracks coding session duration and intensity
- Monitors your productivity and code quality over time
- Alerts when fatigue may be affecting quality

**User Experience:**
```
⏱️  Session Insight

Current Session: 4h 23m
Started: 9:42am
Break Time: 0 minutes ⚠️

Session Metrics:
- Changes per hour: 23 (⬆️ 2x your average)
- Rollback rate this session: 15% (your normal: 12%)
- Focus score: 87/100 (high productivity)
- Code quality trend: ⬇️ Declining slowly

🧠 Raven Analysis:
You're in deep flow state - productivity is 2x normal. However:

⚠️  Warning Signs:
- No breaks in 4+ hours (research shows quality drops 30% after 90min)
- Rollback rate starting to climb (9% → 12% → 15%)
- Last 3 changes were larger than usual (cognitive load indicator)

Historical Pattern:
- Sessions >4 hours: 28% higher rollback rate
- Your best code quality: 2-3 hour sessions with breaks
- Late night sessions (after 10pm): 47% rollback rate

💡 Suggestion:
Take a 10-minute break now, or set a checkpoint for rollback safety.
Your next optimal coding window: 2:00pm - 4:00pm (your peak hours).

[Take Break] [Set Checkpoint] [Remind Me in 30m] [I'm Fine]
```

**Priority:** MEDIUM
**Effort:** 1 week
**Dependencies:** Session tracking, time-based analytics

---

#### **Feature 6: Pattern Recognition**
**"I've seen this before"**

**What it does:**
- Finds similar changes in your history
- Matches current changes to past incidents
- Predicts outcomes based on historical patterns

**User Experience:**
```
🔍 Pattern Match: 89% Similar to Past Incident

Current Change:
- File: payment.js
- Agent: ANT
- Type: Refactoring price calculation logic
- Size: 247 lines changed

Similar Past Incident:
- Date: October 12, 2025 (13 days ago)
- File: billing.js (same category: payments)
- Agent: Claude Code
- Change: Refactored price calculation logic
- Outcome: ❌ Rolled back after 23 minutes
- Reason: "Broke discount code calculations for multi-item carts"

Match Score: 89%
Confidence: High

Pattern Analysis:
Both changes involve:
✓ Price calculation refactoring
✓ Math operations on currency values
✓ Multiple conditional branches
✓ Same project area (payments/billing)

Risk Factors from Past Incident:
- Discount codes weren't tested (edge case)
- Multi-item cart calculations broke (complex logic)
- Tax calculations were off by 1 cent (rounding issue)

🧠 Raven Prediction:
High probability of similar issues. Before proceeding:

1. ✅ Test discount codes (was the issue last time)
2. ✅ Test multi-item carts with various quantities
3. ✅ Verify rounding in currency calculations
4. ✅ Check tax calculation edge cases
5. ✅ Consider asking ANT to add tests first

[View Full Past Incident] [Set Checkpoint] [Run Suggested Tests] [I've Got This]
```

**Priority:** MEDIUM
**Effort:** 2 weeks
**Dependencies:** Similarity scoring algorithm, incident database

---

### TIER 3: POST-v1 (Future versions)

#### **Feature 7: Cross-Agent Intelligence**
**"Which agent is best for this task?"**

**What it does:**
- Compares success rates across different agents
- Recommends which agent to use for which tasks
- Identifies agent strengths and weaknesses

**User Experience:**
```
🤖 Agent Performance Comparison (30 Days)

                ANT      Claude Code    Cursor    Copilot
Files/Day:       47           23          12         8
Accuracy:        94%          89%         96%       91%
Rollbacks:       8            15          2          5
Avg Change:      45 lines     120 lines   30 lines  18 lines
Speed:           Fast         Slow        Medium    Fast

By File Type:
JavaScript:      ANT (96%)    Claude (89%)  Cursor (94%)  Copilot (92%)
Python:          ANT (91%)    Claude (94%)  Cursor (98%)  Copilot (88%)
CSS:             ANT (88%)    Claude (85%)  Cursor (91%)  Copilot (95%)

By Task:
Auth/Security:   Cursor (96% success rate) ⭐ Best
Refactoring:     Claude Code (handles large changes well)
Quick fixes:     ANT (fastest, 94% accurate)
API endpoints:   ANT (97% success rate) ⭐ Best
UI/Styling:      Copilot (95% success rate) ⭐ Best

🧠 Smart Recommendations:

Current File: auth.js (authentication)
📌 Recommended Agent: Cursor
   Reason: 96% success rate on auth files vs ANT's 89%

Current Task: Large refactor (>200 lines)
📌 Recommended Agent: Claude Code
   Reason: Best at handling large contextual changes

Want to switch agents for this task?
[Use Cursor] [Stick with ANT] [Show Me Why]
```

**Priority:** LOW (post-v1)
**Effort:** 2 weeks
**Dependencies:** Multi-agent monitoring data, success metrics

---

#### **Feature 8: Health Scoring**
**"Is my project healthy?"**

**What it does:**
- Overall project health dashboard
- Tracks technical debt, test coverage, complexity
- Predicts maintenance burden

**User Experience:**
```
🏥 Project Health Score: 78/100

Detailed Breakdown:

📊 Code Quality: 85/100 ✅ Excellent
- Low duplication (3.2%)
- Good structure (avg file: 247 lines)
- Consistent style (ESLint: 98% pass)

⚠️  Test Coverage: 62/100 🟡 Needs Attention
- Current: 64% (down from 71% last week)
- Critical files without tests: 3
- New code coverage: 52% (should be >80%)

✅ Stability: 88/100 ✅ Excellent
- Rollback rate: 12% (acceptable)
- Error rate: 2.3% (low)
- Uptime: 99.2% (good)

⚠️  Complexity: 68/100 🟡 Needs Attention
- server.js: 4,500 lines (⚠️ too large)
- Cyclomatic complexity: 34 (high)
- 8 files >1,000 lines

✅ Activity: 92/100 ✅ Excellent
- Consistent progress (no stalls)
- Balanced work (not just fixes)
- Good momentum

🧠 Health Trends:

Improving:
✓ Code quality up 5 points (month over month)
✓ Stability improving (fewer rollbacks)

Declining:
⚠️  Test coverage dropping (-7% in 7 days)
⚠️  Complexity increasing (4 files growing too large)

Action Items:
1. 🔴 Critical: Add tests to auth.js (0% coverage, 847 lines)
2. 🟡 Important: Refactor server.js (4,500 lines → split into modules)
3. 🟡 Important: Add tests for recent changes (coverage is dropping)
4. 🟢 Nice-to-have: Document complex functions (10 flagged)

[View Detailed Report] [Set Health Goals] [Get Recommendations]
```

**Priority:** LOW (post-v1)
**Effort:** 2-3 weeks
**Dependencies:** Code analysis tools, metrics infrastructure

---

#### **Feature 9: Drift Detection**
**"Your codebase is evolving"**

**What it does:**
- Tracks structural changes to your codebase over time
- Detects architecture drift and growing complexity
- Alerts when project is changing too fast

**Priority:** LOW (post-v1)
**Effort:** 1-2 weeks

---

#### **Feature 10: Productivity Insights**
**"When are you most effective?"**

**What it does:**
- Analyzes your coding patterns by time of day
- Identifies your peak productivity windows
- Warns about low-quality time periods

**Priority:** LOW (post-v1)
**Effort:** 1 week

---

## 3. TECHNICAL ARCHITECTURE (Solo Dev)

### Simplified Stack

```
┌─────────────────────────────────────┐
│         SOLO DEVELOPER               │
├─────────────────────────────────────┤
│                                     │
│  Frontend (Svelte)                  │
│  ├─ 64 UI components (existing)    │
│  ├─ Real-time WebSocket updates    │
│  └─ Local state (no user context)  │
│                                     │
│  Backend (Node.js)                  │
│  ├─ Express API server             │
│  ├─ File watcher (chokidar)        │
│  ├─ SQLite databases (per-project) │
│  └─ WebSocket (Socket.IO)          │
│                                     │
│  Services (NEW)                     │
│  ├─ AnomalyDetector                │
│  ├─ AgentDetector                  │
│  ├─ RiskAnalyzer                   │
│  ├─ BehaviorProfiler              │
│  └─ PatternMatcher                 │
│                                     │
│  Data (SQLite)                      │
│  ├─ events (existing)              │
│  ├─ rollbacks (NEW)                │
│  ├─ agent_stats (NEW)              │
│  └─ sessions (NEW)                 │
│                                     │
└─────────────────────────────────────┘

NO CLOUD, NO AUTH, NO TEAMS, NO COMPLEXITY
```

### What We DON'T Need

❌ **Authentication** - Single user, always trusted
❌ **User management** - No users table, no sessions
❌ **Multi-tenancy** - One developer = one instance
❌ **Distributed systems** - Everything runs locally
❌ **Team sync** - No collaboration features
❌ **Permissions** - Everyone has full access (it's just you)
❌ **Cloud infrastructure** - 100% local-first

### Database Schema Updates

```sql
-- Existing: events table (already has most fields)
ALTER TABLE events ADD COLUMN agent TEXT;
ALTER TABLE events ADD COLUMN agent_confidence INTEGER;
ALTER TABLE events ADD COLUMN is_anomaly INTEGER DEFAULT 0;
ALTER TABLE events ADD COLUMN anomaly_score INTEGER;
ALTER TABLE events ADD COLUMN anomaly_confidence INTEGER;
ALTER TABLE events ADD COLUMN anomaly_reasons TEXT;
ALTER TABLE events ADD COLUMN risk_level TEXT;
ALTER TABLE events ADD COLUMN risk_score INTEGER;
ALTER TABLE events ADD COLUMN risk_factors TEXT;

-- NEW: Rollbacks tracking
CREATE TABLE rollbacks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER NOT NULL,
  timestamp TEXT NOT NULL,
  reason TEXT,
  automatic INTEGER DEFAULT 0, -- 1 if auto-rollback
  FOREIGN KEY (event_id) REFERENCES events(id)
);

-- NEW: Agent statistics
CREATE TABLE agent_stats (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_name TEXT NOT NULL,
  agent TEXT NOT NULL,
  date TEXT NOT NULL, -- YYYY-MM-DD
  changes_count INTEGER DEFAULT 0,
  rollbacks_count INTEGER DEFAULT 0,
  avg_change_size INTEGER DEFAULT 0,
  avg_confidence INTEGER DEFAULT 0,
  UNIQUE(project_name, agent, date)
);

-- NEW: Coding sessions
CREATE TABLE sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_name TEXT NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT,
  changes_count INTEGER DEFAULT 0,
  rollbacks_count INTEGER DEFAULT 0,
  break_minutes INTEGER DEFAULT 0
);
```

---

## 4. DEVELOPMENT ROADMAP

### Phase 1: Foundation (Weeks 1-4)

**Week 1: Multi-Agent Detection**
- [ ] Implement AgentDetector service
- [ ] Add agent field to events table
- [ ] Test with ANT, Claude Code, Cursor
- [ ] UI: Agent badges in EventFeed

**Week 2: Anomaly Detection Core**
- [ ] Build AnomalyDetector service
- [ ] Implement baseline learning (30-day history)
- [ ] Add statistical analysis (z-scores, distributions)
- [ ] Database schema updates for anomalies

**Week 3: Anomaly Detection UI**
- [ ] Alert banner when anomaly detected
- [ ] Anomaly details panel
- [ ] False alarm reporting
- [ ] Alert settings/preferences

**Week 4: Risk Analysis**
- [ ] Build RiskAnalyzer service
- [ ] Rollbacks table and tracking
- [ ] Risk correlation algorithm
- [ ] Risk indicators in UI

**Deliverable:** Raven v1.0 with anomaly detection, multi-agent support, risk analysis

---

### Phase 2: Intelligence (Weeks 5-8)

**Week 5: Agent Behavior Profiling**
- [ ] BehaviorProfiler service
- [ ] Agent stats tracking
- [ ] "Mood" detection algorithm
- [ ] Agent comparison dashboard

**Week 6: Session Intelligence**
- [ ] Session tracking and metrics
- [ ] Fatigue detection
- [ ] Break reminders
- [ ] Session quality scoring

**Week 7: Pattern Recognition**
- [ ] PatternMatcher service
- [ ] Similarity scoring algorithm
- [ ] Incident matching
- [ ] Pattern alerts UI

**Week 8: Polish & Testing**
- [ ] Integration testing
- [ ] Performance optimization
- [ ] Documentation
- [ ] User feedback incorporation

**Deliverable:** Raven v1.5 with behavioral intelligence

---

### Phase 3: Advanced Features (Weeks 9-12)

**Week 9-10: Cross-Agent Intelligence**
- [ ] Agent performance comparison
- [ ] Success rate analytics
- [ ] Recommendation engine
- [ ] Agent switcher UI

**Week 11: Health Scoring**
- [ ] Code quality metrics
- [ ] Health dashboard
- [ ] Trend analysis
- [ ] Action recommendations

**Week 12: Drift & Productivity**
- [ ] Drift detection
- [ ] Productivity analysis
- [ ] Time-of-day insights
- [ ] Final polish

**Deliverable:** Raven v2.0 feature-complete

---

## 5. AI FEATURES (Optional for v2+)

### When to Add AI

**NOT in v1** - Statistical analysis is sufficient for:
- Anomaly detection (z-scores, distributions)
- Risk analysis (historical correlation)
- Pattern matching (similarity algorithms)

**Consider for v1.5** - If users ask for it:
- "Ask Raven why" (Claude API explains anomalies)
- Natural language queries ("show me risky changes today")

**Plan for v2.0** - When you have data and budget:
- Predictive analytics ("ANT is about to...")
- AI-powered explanations (full conversation)
- Smart recommendations (context-aware)

### Cost-Effective AI Strategy

1. **User provides API key** - Zero cost to you
2. **Local models option** - Ollama for privacy-conscious users
3. **Tiered pricing** - AI features in Pro/Teams tiers
4. **Aggressive caching** - Never re-analyze same data

---

## 6. BUSINESS MODEL (Solo Dev Focus)

### Pricing

| Tier | Price | Features |
|------|-------|----------|
| **Free** | $0 | 3 projects, 30 days retention, basic anomaly detection |
| **Pro** | $9/mo | Unlimited projects, unlimited retention, all monitoring features |
| **Pro + AI** | $15/mo | Pro + AI explanations, predictions (requires Anthropic API key) |

### Why This Works

1. **Solo devs will pay** - See Raycast ($8/mo), Sublime Text ($99), Cursor ($20/mo)
2. **Privacy-first sells** - Local-first tools command premium prices
3. **Simple pricing** - No per-seat complexity
4. **AI is optional** - Core monitoring works without AI

### Market Size

- **Total Addressable Market:** 30M developers worldwide
- **AI-assisted devs:** ~10M (33%)
- **Target market:** Solo/indie devs using AI tools (5M)
- **Realistic conversion:** 1% = 50K paid users
- **Revenue potential:** 50K × $9/mo = $450K MRR = $5.4M ARR

---

## 7. SUCCESS METRICS

### Product Metrics (v1)
- **Anomaly detection accuracy:** >80% (user feedback: useful vs false alarm)
- **Agent detection accuracy:** >90% (correctly identifies which agent)
- **Risk prediction accuracy:** >70% (high-risk changes actually problematic)
- **Time to value:** <10 minutes (install to first useful alert)

### Business Metrics (v1)
- **Weekly Active Users:** 1,000 in first 90 days
- **Free → Pro conversion:** >5% in first month
- **Retention (D7):** >40% (users return after 1 week)
- **NPS:** >50 (indicates viral potential)

### Technical Metrics
- **Performance:** <100ms for anomaly detection
- **Accuracy:** False alarm rate <20%
- **Reliability:** >99% uptime
- **Scalability:** Handles 10K+ events/day per project

---

## 8. COMPETITIVE ADVANTAGE

### Why Raven Wins

1. **Agent-Agnostic** - Only tool that works with ALL agents
2. **Behavioral Intelligence** - Learns YOUR patterns, not generic rules
3. **Solo Dev Focused** - Simpler, faster, cheaper than team tools
4. **Local-First** - Privacy-focused devs choose local over cloud
5. **Monitoring Focus** - Doesn't try to be a coding assistant

### Moat Duration

- **Feature parity:** 6-9 months (competitors need to build multi-agent support)
- **Data moat:** 12+ months (need user data to train behavioral models)
- **Network effects:** 18+ months (ANT + Raven ecosystem)

---

## 9. RISKS & MITIGATION

### Risk #1: Agent Wars
**Problem:** If ANT fails, Raven's marketing story is weaker
**Mitigation:** Raven works with competitors (Cursor, Claude Code) = survives even if ANT doesn't

### Risk #2: Built Into Agents
**Problem:** Cursor/Claude Code add monitoring features
**Mitigation:**
- Raven works across ALL agents (they can't)
- Deeper behavioral intelligence (months ahead)
- Launch fast (6 months before they add features)

### Risk #3: Solo Dev Market Too Small
**Problem:** Not enough solo devs willing to pay
**Mitigation:**
- Market validation: Cursor has 100K+ paid users
- Expand to teams in v2 (fallback option)
- Freemium model = large funnel

---

## 10. NEXT STEPS

### Immediate Actions (This Week)

1. **Validate approach** - Show this doc to 5 solo devs, get feedback
2. **Start coding** - Week 1 roadmap (multi-agent detection)
3. **Set up metrics** - Analytics, error tracking
4. **Create wireframes** - Anomaly alert UI designs

### Week 1 Deliverables

- [ ] Multi-agent detection working for ANT + Claude Code
- [ ] Agent badges in EventFeed
- [ ] Basic agent statistics endpoint
- [ ] Demo video showing agent detection

### Month 1 Goal

**Ship Raven v1.0** with:
- ✅ Multi-agent monitoring
- ✅ Anomaly detection
- ✅ Risk analysis
- ✅ Beautiful UI (already 80% done)

---

## APPENDIX: KEY DECISIONS

### Decision 1: Solo Dev Only (v1)
**Rationale:**
- 10x simpler architecture (no auth, teams, sync)
- Faster development (3-6 months vs 12-18 months)
- Clear focus (nail individual experience first)
- Easier marketing (simpler message)

### Decision 2: No AI Required (v1)
**Rationale:**
- Statistical analysis is sufficient for core features
- Reduces dependencies and costs
- Faster, more reliable (no API calls)
- AI can be added incrementally in v1.5+

### Decision 3: Agent-Agnostic
**Rationale:**
- Raven survives even if ANT doesn't launch
- Larger market (all AI coding tool users)
- Competitive differentiation (only universal monitor)
- Network effects (users bring friends using other agents)

### Decision 4: Local-First
**Rationale:**
- Privacy-conscious developers will pay premium
- No cloud costs = better margins
- Aligns with target user values
- Simpler deployment (no server management)

---

**Document Status:** CANONICAL - This is the current product vision
**Supersedes:** All previous strategic documents
**Next Review:** After v1.0 ships (60 days)
**Owner:** Product Leadership
