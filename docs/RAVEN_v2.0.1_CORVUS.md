# 🐦‍⬛ Raven v2.0.1: Corvus

## The AI Agent Monitor with Heart

**Status:** MASTER PLAN
**Created:** November 8, 2025
**Combines:** PRODUCT_VISION_v2.md + PHASE_2_CORVUS.md
**Version:** 2.0.1 - Corvus (The Companion Update)

---

## 📖 EXECUTIVE SUMMARY

**Raven v2 transforms from a monitoring tool into a genuine companion** that combines:

1. **Technical Intelligence** - Anomaly detection, risk analysis, multi-agent monitoring
2. **Emotional Warmth** - Personality, encouragement, celebration, storytelling

**The Vision:**

> Raven is the passive observer who actually cares. It's your AI coding friend who watches over Claude, ANT, Cursor, and other agents - protecting you from mistakes while celebrating your wins.

**Core Philosophy:**

| Other Tools | Raven v2      |
| ----------- | ------------- |
| Metrics     | Stories       |
| Monitoring  | Understanding |
| Dashboards  | Conversations |
| Data        | Insights      |
| Control     | Partnership   |
| Cold        | Warm ❤️       |

---

## 🎯 THE 10 CORE FEATURES

### TIER 1: CRITICAL - Must Have First

---

#### **Feature 1: Anomaly Detection** 🚨

**"This change is unusual for you"**

**What it does:**

- Statistical analysis of your normal coding patterns
- Real-time alerts when AI agents do something unexpected
- Machine learning learns what's "normal" for your codebase
- Risk scoring with confidence levels

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

**Technical Implementation:**

```javascript
// backend/services/anomaly-detector.js
class AnomalyDetector {
  constructor(projectName) {
    this.projectName = projectName;
    this.baseline = this.loadBaseline();
  }

  loadBaseline() {
    // Calculate baseline from historical data (30 days)
    const history = db
      .prepare(
        `
      SELECT filepath, change_type,
             LENGTH(diff) as diff_size,
             ABS(additions - deletions) as net_change
      FROM events
      WHERE project_name = ?
      AND timestamp > datetime('now', '-30 days')
    `
      )
      .all(this.projectName);

    return {
      avgDiffSize: mean(history.map(h => h.diff_size)),
      stdDiffSize: stdDev(history.map(h => h.diff_size)),
      avgNetChange: mean(history.map(h => h.net_change)),
      stdNetChange: stdDev(history.map(h => h.net_change)),
      fileFrequency: this.calculateFileFrequency(history),
      changeTypeDistribution: this.calculateChangeTypeDistribution(history)
    };
  }

  detectAnomaly(change) {
    const scores = [];

    // Check 1: Is diff size unusual? (z-score)
    const diffSize = change.diff.length;
    const zScore = (diffSize - this.baseline.avgDiffSize) / this.baseline.stdDiffSize;
    if (Math.abs(zScore) > 2) {
      // 2 standard deviations
      scores.push({
        type: 'diff_size',
        severity: Math.abs(zScore) / 2,
        message: `${Math.abs(zScore).toFixed(1)}x ${zScore > 0 ? 'larger' : 'smaller'} than average`
      });
    }

    // Check 2: Is this file edited unusually often/rarely?
    const fileFreq = this.baseline.fileFrequency[change.filepath] || 0;
    if (fileFreq < 0.01) {
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

    if (scores.length === 0) return null;

    const anomalyScore = scores.reduce((sum, s) => sum + s.severity, 0) / scores.length;
    const confidence = Math.min(scores.length / 4, 1.0);

    return {
      isAnomaly: anomalyScore > 0.5,
      score: Math.round(anomalyScore * 100),
      confidence: Math.round(confidence * 100),
      reasons: scores.map(s => s.message),
      riskLevel: anomalyScore > 0.7 ? 'high' : anomalyScore > 0.4 ? 'medium' : 'low'
    };
  }
}
```

**Database Schema:**

```sql
ALTER TABLE events ADD COLUMN is_anomaly INTEGER DEFAULT 0;
ALTER TABLE events ADD COLUMN anomaly_score INTEGER;
ALTER TABLE events ADD COLUMN anomaly_confidence INTEGER;
ALTER TABLE events ADD COLUMN anomaly_reasons TEXT; -- JSON array
ALTER TABLE events ADD COLUMN risk_level TEXT; -- 'low', 'medium', 'high'
```

**With Personality:**

```
🚨 Whoa there! *worried caw*

ANT just deleted a LOT from auth.js (847 lines!)

This feels off - you usually make small, careful changes to this file.
Remember that similar change on Oct 12? You rolled it back... caw caw.

Want to review before it goes too far? 💙
```

**Priority:** CRITICAL
**Effort:** 2 weeks
**Dependencies:** 30+ days of historical event data

---

#### **Feature 2: Multi-Agent Monitoring** 🤖

**"Works with ANT, Claude Code, Cursor, Copilot, Aider"**

**What it does:**

- Detects which AI agent made each change
- Tracks per-agent statistics and behavior
- Unified view across all your AI tools
- Foundation for all other features

**Agent Detection:**

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
    if (signals.processName?.includes('copilot')) {
      return { agent: 'github-copilot', confidence: 85 };
    }

    // Aider detection
    if (signals.processName?.includes('aider') || signals.env?.AIDER_MODEL) {
      return { agent: 'aider', confidence: 90 };
    }

    // Manual edit detection
    if (this.detectManualEdit(change, context)) {
      return { agent: 'manual', confidence: 80 };
    }

    return { agent: 'unknown', confidence: 50 };
  }
}
```

**Database Schema:**

```sql
ALTER TABLE events ADD COLUMN agent TEXT;
-- 'ant', 'claude-code', 'cursor', 'copilot', 'aider', 'manual', 'unknown'
ALTER TABLE events ADD COLUMN agent_confidence INTEGER; -- 0-100
```

**With Personality:**

```
🤖 Detected: Claude Code is helping! Caw!

👀 You're working with 3 different agents today:
   • Claude Code (12 changes) - Your main partner
   • Cursor (3 changes) - Quick fixes
   • Manual edits (5 changes) - You taking the wheel

Multi-tool workflow! Nice! Caw Caw! 🛠️
```

**Priority:** CRITICAL
**Effort:** 1-2 weeks
**Dependencies:** Process monitoring, environment detection

---

#### **Feature 3: Risk Correlation** ⚠️

**"You rolled back similar changes 3 times"**

**What it does:**

- Learns from your rollback history
- Predicts which changes are likely to be rolled back
- Shows historical context for risky files
- File-level risk scoring

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
    const fileHistory = db
      .prepare(
        `
      SELECT e.*, r.id as rollback_id, r.reason as rollback_reason
      FROM events e
      LEFT JOIN rollbacks r ON e.id = r.event_id
      WHERE e.filepath = ?
      AND e.timestamp > datetime('now', '-90 days')
      ORDER BY e.timestamp DESC
    `
      )
      .all(change.filepath);

    const totalChanges = fileHistory.length;
    const rollbacks = fileHistory.filter(h => h.rollback_id !== null);
    const rollbackRate = totalChanges > 0 ? rollbacks.length / totalChanges : 0;

    const riskFactors = [];

    // Signal 1: High rollback rate for this file
    if (rollbackRate > this.getOverallRollbackRate(change.project_name) * 3) {
      riskFactors.push({
        factor: 'high_rollback_rate',
        severity: 0.8,
        message: `This file has ${(rollbackRate * 100).toFixed(0)}% rollback rate`
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

    const riskScore =
      riskFactors.length > 0
        ? riskFactors.reduce((sum, f) => sum + f.severity, 0) / riskFactors.length
        : 0;

    return {
      riskScore: Math.round(riskScore * 100),
      riskLevel: riskScore > 0.7 ? 'high' : riskScore > 0.4 ? 'medium' : 'low',
      rollbackRate: Math.round(rollbackRate * 100),
      recentRollbacks: rollbacks.slice(0, 5),
      riskFactors: riskFactors.map(f => f.message),
      recommendation: this.generateRecommendation(riskScore, rollbacks)
    };
  }

  getFileCriticality(filepath) {
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

    return 0.3;
  }
}
```

**Database Schema:**

```sql
CREATE TABLE rollbacks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER NOT NULL,
  timestamp TEXT NOT NULL,
  reason TEXT,
  automatic INTEGER DEFAULT 0,
  FOREIGN KEY (event_id) REFERENCES events(id)
);

ALTER TABLE events ADD COLUMN risk_score INTEGER;
ALTER TABLE events ADD COLUMN risk_level TEXT;
ALTER TABLE events ADD COLUMN risk_factors TEXT; -- JSON array
```

**With Personality:**

```
⚠️ *concerned caw*

Hey, database.js has been... tricky lately.

You've had to roll back 3 out of the last 5 changes here.
Not saying this will fail, but maybe extra careful? 🤔

Last time was that connection pool thing... remember that headache?
Let's not do that again! Caw caw.

Want to set a checkpoint first? 💙
```

**Priority:** HIGH
**Effort:** 1-2 weeks
**Dependencies:** Rollback tracking system

---

#### **Feature 4: Personality & Celebrations** 🎉

**"Caw Caw! You learned something new!"**

**What it does:**

- Raven notices when you try something new
- Celebrates wins with personality
- Time-of-day greetings and moods
- Makes monitoring feel warm, not cold

**Learning Celebrations:**

```
🎓 Looks like you learned about Jest yesterday. Nice job! Caw Caw!

📚 First time using TypeScript generics! You're leveling up! Caw!

🔐 Spotted you adding bcrypt - security-conscious developer spotted! Caw Caw!

🎨 Ooh, Tailwind CSS! Your UIs are about to look sharp! Caw!

🧪 15 new tests written today - somebody's feeling thorough! Caw Caw!
```

**Time-of-Day Personality:**

```
Morning (6-9 AM):
☕ Good morning! Ready to build something awesome? Caw!
🌅 Early bird gets the code! You're here before 7 AM - impressive! Caw Caw!

Afternoon (12-5 PM):
🌤️ Afternoon coding session! Let's make some progress! Caw!
☕ Post-lunch coding - energized and ready! Caw Caw!

Evening (6-10 PM):
🌙 Evening session - perfect time for focused work! Caw!
🌆 Sunset coding - there's something peaceful about this time. Caw.

Late Night (10 PM-6 AM):
🌙 Burning the midnight oil? Don't forget to take breaks! Caw!
😴 It's 3 AM... maybe let me keep watch while you rest? Caw caw...
🦉 Night owl mode activated! Caw!
```

**Milestone Celebrations:**

```
🎉 100 commits with Claude! You two are a great team! Caw Caw!

⭐ First time all tests passed on first try! Legendary! CAW CAW!

🔧 That bug took 3 hours but you GOT IT! Persistence pays off! Caw Caw!

🚀 Deployed to production! Your code is flying free! Caw!

💪 7 days coding streak! Consistency is key! Caw Caw!

📊 1,000 lines of code together! Just getting started! Caw Caw!

🎯 10,000 lines milestone! You've built something real! CAW CAW!
```

**Implementation:**

```javascript
// backend/services/celebration-detector.js
class CelebrationDetector {
  detectLearning(events) {
    // Detect new packages
    const newPackages = this.detectNewPackages(events);
    if (newPackages.length > 0) {
      return {
        type: 'learning',
        message: `🎓 Spotted you learning about ${newPackages[0]}! Nice! Caw Caw!`,
        intensity: 'medium'
      };
    }

    // Detect first-time file patterns
    const newPatterns = this.detectNewFilePatterns(events);
    if (newPatterns.includes('test')) {
      return {
        type: 'learning',
        message: `🧪 First time writing tests! Great habit to build! Caw!`,
        intensity: 'high'
      };
    }

    return null;
  }

  detectMilestone(events, totalStats) {
    // Commit milestones
    if (totalStats.commits === 100) {
      return {
        type: 'milestone',
        message: `🎊 CENTURY! 100 commits! You're building something real! CAW CAW!`,
        intensity: 'legendary'
      };
    }

    // Lines of code milestones
    if (totalStats.linesOfCode === 10000) {
      return {
        type: 'milestone',
        message: `🏆 10,000 LINES! You and Claude are unstoppable! CAW CAW CAW!`,
        intensity: 'legendary'
      };
    }

    // Perfect streak
    if (totalStats.consecutivePerfectTests >= 5) {
      return {
        type: 'achievement',
        message: `⭐ 5 test suites passed first try in a row! You're on FIRE! CAW CAW!`,
        intensity: 'high'
      };
    }

    return null;
  }

  getTimeOfDayGreeting() {
    const hour = new Date().getHours();

    if (hour >= 6 && hour < 9) {
      return `☕ Good morning! Ready to build something awesome? Caw!`;
    } else if (hour >= 21 || hour < 6) {
      return `🌙 Late night coding - don't forget to take breaks! Caw!`;
    } else if (hour >= 12 && hour < 17) {
      return `🌤️ Afternoon coding session! Let's make progress! Caw!`;
    }

    return `🌆 Evening session - perfect for focused work! Caw!`;
  }
}

// backend/services/message-generator.js
class MessageGenerator {
  addCaw(message, intensity) {
    const cawMap = {
      low: 'caw',
      medium: 'Caw!',
      high: 'Caw Caw!',
      legendary: 'CAW CAW CAW!'
    };

    return `${message} ${cawMap[intensity] || 'Caw!'}`;
  }

  selectTemplate(eventType, context) {
    // Pick appropriate template based on event type and context
    // Add personality modifiers based on time, mood, user preferences
  }
}
```

**Raven Avatar States:**

```css
/* Color-coded avatar moods using existing raven-icon.svg */
.raven-avatar {
  width: 48px;
  height: 48px;
  transition: all 0.3s ease;
}

.raven-avatar.normal {
  filter: hue-rotate(0deg); /* #c0caf5 - calm blue */
}

.raven-avatar.happy {
  filter: hue-rotate(120deg) saturate(1.2); /* #a6e3a1 - green */
  animation: bounce 0.5s ease;
}

.raven-avatar.excited {
  filter: hue-rotate(60deg); /* #f9e2af - yellow */
  animation: bounce 0.5s ease infinite;
}

.raven-avatar.worried {
  filter: hue-rotate(-30deg) saturate(1.5); /* #f38ba8 - red */
  animation: tilt 1s ease infinite;
}

.raven-avatar.celebrating {
  filter: hue-rotate(40deg); /* #fab387 - orange */
  animation: spin 1s ease;
}

@keyframes bounce {
  0%,
  100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-10px);
  }
}

@keyframes tilt {
  0%,
  100% {
    transform: rotate(0deg);
  }
  25% {
    transform: rotate(-5deg);
  }
  75% {
    transform: rotate(5deg);
  }
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}
```

**Database Schema:**

```sql
CREATE TABLE learning_events (
  id INTEGER PRIMARY KEY,
  project_name TEXT,
  technology TEXT,
  first_seen TIMESTAMP,
  usage_count INTEGER DEFAULT 1
);

CREATE TABLE milestones (
  id INTEGER PRIMARY KEY,
  project_name TEXT,
  milestone_type TEXT,
  value INTEGER,
  achieved_at TIMESTAMP,
  celebrated BOOLEAN DEFAULT false
);

CREATE TABLE user_preferences (
  id INTEGER PRIMARY KEY,
  chattiness_level TEXT DEFAULT 'friendly', -- 'silent', 'quiet', 'friendly', 'enthusiastic'
  show_caw BOOLEAN DEFAULT true,
  show_avatar BOOLEAN DEFAULT true,
  time_of_day_greetings BOOLEAN DEFAULT true,
  learning_celebrations BOOLEAN DEFAULT true
);
```

**Priority:** HIGH
**Effort:** 1-2 weeks
**Dependencies:** Event tracking, WebSocket for real-time notifications

---

### TIER 2: IMPORTANT - Build Next

---

#### **Feature 5: Agent Behavior Profiling** 📊

**"ANT is acting aggressive today"**

**What it does:**

- Tracks each agent's "personality" and coding style
- Detects when an agent is behaving differently
- "Mood" indicator for each agent
- Helps you understand agent patterns

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
```

**With Personality:**

```
🤖 *curious caw*

ANT is in a different mood today...

Usually makes small, careful edits (avg 45 lines).
Today? Going BIG - averaging 104 lines per change!

When ANT gets aggressive like this, we've seen:
✓ Great refactors (when it works!)
✗ Rollbacks (when things break)

Just keeping you informed! Caw! 👀
```

**Priority:** MEDIUM
**Effort:** 1 week
**Dependencies:** Multi-agent monitoring, statistical analysis

---

#### **Feature 6: Contextual Observations** 👁️

**"Third time editing that function..."**

**What it does:**

- Notices patterns in your work
- Offers timely, helpful observations
- Detects struggles and flow states
- Work style pattern recognition

**Pattern Observations:**

```
👀 Third time editing that same function - tricky bug hiding? Caw?

🔥 15 files in 30 minutes! You're on fire today! Caw Caw!

💡 Aha moment detected - that refactor looks clean! Caw!

📝 Noticed you're writing more comments than usual. Future you says thanks! Caw!

🎯 Zero syntax errors today! Clean flying! Caw Caw!

⚡ Claude only needed 2 tries - you two are in sync! Caw!

🤔 Hmm, lots of console.log removals... debug session? Caw caw.

🎨 Renaming variables for clarity - good code hygiene! Caw!

🔄 Fourth rollback today - something's not clicking. Need a fresh perspective? Caw?
```

**Work Style Observations:**

```
🤓 You always refactor on Fridays - interesting pattern! Caw!

🎯 Monday mornings = new features. You're consistent! Caw Caw!

🐛 Tuesday seems to be debug day. We got this! Caw!

⚡ You code fastest between 9-11 AM. Morning person! Caw!

🌈 CSS Fridays detected! Making things pretty! Caw Caw!

🧪 You write tests BEFORE features now - nice evolution! Caw!

💭 You think better after a break - saw that pattern! Caw!
```

**Supportive Moments:**

```
🤗 Rough session? Hey, bugs happen. You'll get 'em tomorrow! Caw caw.

☕ You've been at this for 4 hours straight. Break time? Caw!

💪 That rollback was smart - better to start fresh! Caw!

🌟 Git stash saved you again - nice thinking! Caw!

❤️ Everyone has off days. Tomorrow's a fresh start! Caw caw.

😊 Small progress is still progress! Keep going! Caw!

💭 Taking a step back helps sometimes. The answer will come! Caw.
```

**Priority:** MEDIUM
**Effort:** 1-2 weeks
**Dependencies:** Pattern detection engine

---

#### **Feature 7: Session Intelligence & Stories** 📖

**"Today's Story"**

**What it does:**

- Tracks session duration and quality
- Detects flow states and fatigue
- Break reminders
- Session story generation

**Session Insight:**

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
- No breaks in 4+ hours (quality drops 30% after 90min)
- Rollback rate starting to climb (9% → 12% → 15%)
- Last 3 changes were larger than usual (cognitive load indicator)

💡 Suggestion:
Take a 10-minute break now, or set a checkpoint for rollback safety.
Your next optimal coding window: 2:00pm - 4:00pm (your peak hours).
```

**Session Story:**

```
📖 Today's Story

You started by asking Claude to refactor the user authentication
system. Together, you:

1. Identified the security issues (10:23 AM)
2. Redesigned the token system (10:45 AM)
3. Hit a bug with JWT validation (11:12 AM)
4. Solved it by switching libraries (11:47 AM)
5. Added 59 security tests (12:30 PM)

Timeline:
────────●─────────●──●────●─────────●──────>
     start    design bug solve  tests

🏆 Achievement unlocked: Security Champion
   (Added comprehensive auth tests)

Session Stats:
⏱️  Duration: 2 hours 7 minutes
📝 Files: 23 changed
➕ Added: 847 lines
➖ Removed: 234 lines
🤖 Claude calls: 18
✨ Flow state: 73% of session

Mood: 🔥 Productive and focused

Want to save this story? [Yes] [No]
```

**With Personality:**

```
*raven settles in contentedly*

What a session! You and Claude just built something beautiful. Caw!

Started with a simple idea: "fix auth"
Ended with: Complete security overhaul with 59 tests!

That's the stuff! 🎉 Caw Caw!

(Also... you were in flow state for 73% of the time. When you focus,
 you REALLY focus! Just remember to blink occasionally 😊)

Same time tomorrow? *happy caw* 💙
```

**Priority:** MEDIUM
**Effort:** 1-2 weeks
**Dependencies:** Session tracking, timeline generation

---

#### **Feature 8: Pattern Recognition** 🔍

**"I've seen this before"**

**What it does:**

- Finds similar changes in history
- Matches current changes to past incidents
- Predicts outcomes based on patterns
- Risk factor identification

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

**With Personality:**

```
🔍 *head tilt* Hmm... déjà vu. Caw?

This payment.js change feels REALLY familiar...

*ruffles through memory feathers*

OH! Remember October 12? The billing.js thing?
Same pattern. And... that didn't go well. Caw caw.

Discount codes broke. Multi-cart calculations failed.
That penny rounding bug? Nightmare.

Not saying this WILL fail, but... maybe test the discount codes first?
Before we relive that Tuesday? 🤔

*concerned caw*
```

**Priority:** MEDIUM
**Effort:** 2 weeks
**Dependencies:** Similarity algorithm, incident database

---

### TIER 3: NICE TO HAVE - Enhance Later

---

#### **Feature 9: Good Morning Briefings** ☀️

**"Where you left off"**

**What it does:**

- Daily context restoration
- Yesterday's summary
- Personalized productivity insights
- "Pick up where you left off" helper

**Example:**

```
☀️ Good morning! Yesterday you and Claude:

  • Completed the authentication refactor (3 hours)
  • Fixed 12 bugs in the payment flow
  • Added 847 lines, removed 234

  🎯 You left off working on: api/routes/checkout.js:247
     (The payment validation logic)

  💭 Raven noticed: You usually tackle backend work in the
     morning - want to continue where you left off?

  📊 Your energy today: Morning sessions = 127 lines/hour avg

  ☕ Ready to code? Let's do this! Caw Caw!
```

**Priority:** LOW
**Effort:** 1 week

---

#### **Feature 10: Project Memory & Context** 🏠

**"Welcome back"**

**What it does:**

- Remembers context across sessions
- TODOs from last session
- Relevant past work
- Reduces context switching

**Example:**

```
👋 Welcome back to the raven project!

Last time (3 days ago):
• You were adding the plugin system
• Left off at: backend/core/server-bootstrap.js:247
• Had just fixed: Duplicate key errors in frontend

🧩 Context you might need:
• That bootstrap pattern you researched
• The 7 plugin hooks you designed
• Your notes about lifecycle management

📝 Your TODO from last session:
  [ ] Finish ServerBootstrap graceful shutdown
  [ ] Add plugin hot-reload support
  [ ] Write plugin documentation

Ready to continue? 🚀 Caw!
```

**Priority:** LOW
**Effort:** 1 week

---

#### **Feature 11: Cross-Agent Intelligence** 🤖

**"Which agent is best for this task?"**

**What it does:**

- Compares success rates across agents
- Recommends which agent for which tasks
- Identifies agent strengths/weaknesses
- Performance benchmarking

**Example:**

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

Want to switch agents for this task?
[Use Cursor] [Stick with ANT] [Show Me Why]
```

**Priority:** LOW
**Effort:** 2 weeks

---

#### **Feature 12: "Ask Raven" Natural Language** 💬

**"Chat with Raven about your work"**

**What it does:**

- Natural language query interface
- Conversational insights
- Memory recall
- Personalized responses

**Example Conversations:**

```
You: "When do I get the most done?"

Raven: Based on 89 sessions, you're most productive:

  🌅 Morning (9-11 AM): Backend work, 127 lines/hour
  🌤️ Afternoon (2-4 PM): Frontend polish, 89 lines/hour
  🌙 Evening (8-10 PM): Bug fixes, 43 lines/hour

  You and Claude tackle big features best in the morning!
  Caw! 📊
```

```
You: "What was that auth thing we did last week?"

Raven: You refactored authentication on Oct 23rd:

  • Switched from sessions to JWT tokens
  • Added bcrypt for password hashing
  • Created 59 security tests
  • Took 4 hours, touched 23 files

  Want to see the diff? 🔍 Caw!
```

```
You: "Am I improving?"

Raven: Absolutely! Caw Caw! 📈

  Since starting:
  • Your code quality: 7.2 → 9.3 (+29%)
  • Features completed: Getting faster
  • Claude sync: Much better communication

  Most improved area: Test coverage (12% → 87%)

  You should be proud! 💪 Caw!
```

**Priority:** LOW
**Effort:** 2 weeks

---

### TIER 4: FUTURE - Post v2.0

- Health Scoring
- Drift Detection
- Productivity Insights
- Claude Personality Deep Analysis
- Growth Tracking & Charts
- Gamification & Achievements
- Easter Eggs & Seasonal Messages
- Sound Effects
- Voice Mode
- Social Features
- Integrations (GitHub, Discord, Slack)

---

## 🛠️ TECHNICAL ARCHITECTURE

### Database Schema (Complete)

```sql
-- ============================================================
-- CORE MONITORING (Already exists - enhance these)
-- ============================================================

-- Events table (existing - add new columns)
ALTER TABLE events ADD COLUMN agent TEXT;
ALTER TABLE events ADD COLUMN agent_confidence INTEGER;
ALTER TABLE events ADD COLUMN is_anomaly INTEGER DEFAULT 0;
ALTER TABLE events ADD COLUMN anomaly_score INTEGER;
ALTER TABLE events ADD COLUMN anomaly_confidence INTEGER;
ALTER TABLE events ADD COLUMN anomaly_reasons TEXT; -- JSON
ALTER TABLE events ADD COLUMN risk_level TEXT;
ALTER TABLE events ADD COLUMN risk_score INTEGER;
ALTER TABLE events ADD COLUMN risk_factors TEXT; -- JSON

-- ============================================================
-- INTELLIGENCE & ANALYSIS (New tables)
-- ============================================================

-- Rollbacks tracking
CREATE TABLE rollbacks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER NOT NULL,
  timestamp TEXT NOT NULL,
  reason TEXT,
  automatic INTEGER DEFAULT 0,
  FOREIGN KEY (event_id) REFERENCES events(id)
);

-- Agent statistics
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

-- Learning events
CREATE TABLE learning_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_name TEXT NOT NULL,
  technology TEXT NOT NULL,
  first_seen TIMESTAMP NOT NULL,
  usage_count INTEGER DEFAULT 1,
  proficiency_level INTEGER DEFAULT 1
);

-- ============================================================
-- PERSONALITY & STORYTELLING (New tables)
-- ============================================================

-- Session stories
CREATE TABLE session_stories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  project_name TEXT NOT NULL,
  narrative TEXT,
  timeline JSON,
  stats JSON,
  mood TEXT,
  achievements JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Session context (for "welcome back" feature)
CREATE TABLE session_context (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  project_name TEXT NOT NULL,
  last_file TEXT,
  last_line INTEGER,
  working_on TEXT,
  todos JSON,
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Milestones
CREATE TABLE milestones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_name TEXT NOT NULL,
  milestone_type TEXT NOT NULL,
  value INTEGER,
  achieved_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  celebrated BOOLEAN DEFAULT false
);

-- User patterns
CREATE TABLE user_patterns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_name TEXT NOT NULL,
  pattern_type TEXT NOT NULL,
  pattern_data JSON,
  confidence REAL,
  last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- User preferences
CREATE TABLE user_preferences (
  id INTEGER PRIMARY KEY DEFAULT 1,
  chattiness_level TEXT DEFAULT 'friendly', -- 'silent', 'quiet', 'friendly', 'enthusiastic'
  show_caw BOOLEAN DEFAULT true,
  show_avatar BOOLEAN DEFAULT true,
  sound_enabled BOOLEAN DEFAULT false,
  time_of_day_greetings BOOLEAN DEFAULT true,
  learning_celebrations BOOLEAN DEFAULT true,
  supportive_messages BOOLEAN DEFAULT true,
  easter_eggs BOOLEAN DEFAULT true,
  session_stories BOOLEAN DEFAULT true,
  good_morning_briefings BOOLEAN DEFAULT true
);
```

### Service Architecture

```javascript
// backend/services/
// - anomaly-detector.js       (Feature 1)
// - agent-detector.js          (Feature 2)
// - risk-analyzer.js           (Feature 3)
// - celebration-detector.js    (Feature 4)
// - message-generator.js       (Feature 4)
// - behavior-profiler.js       (Feature 5)
// - pattern-detector.js        (Feature 6)
// - session-tracker.js         (Feature 7)
// - story-builder.js           (Feature 7)
// - pattern-matcher.js         (Feature 8)
// - briefing-generator.js      (Feature 9)
// - context-manager.js         (Feature 10)
// - agent-comparator.js        (Feature 11)
// - insight-engine.js          (Feature 12)
```

---

## 📋 RECOMMENDED DEVELOPMENT ROADMAP

### **Phase 1: Foundation (Weeks 1-4)**

**Goal:** Core monitoring intelligence + basic personality

**Week 1-2: Multi-Agent Detection**

- [ ] Implement AgentDetector service
- [ ] Add agent field to events table
- [ ] Test with ANT, Claude Code, Cursor
- [ ] UI: Agent badges in EventFeed
- [ ] **WITH:** Basic "Caw Caw!" messaging
- [ ] **WITH:** Time-of-day greetings
- [ ] **WITH:** Raven avatar component

**Week 3: Anomaly Detection Core**

- [ ] Build AnomalyDetector service
- [ ] Implement baseline learning (30-day history)
- [ ] Add statistical analysis (z-scores)
- [ ] Database schema updates
- [ ] **WITH:** "Worried caw" personality for anomalies

**Week 4: Risk Analysis + Celebrations**

- [ ] Build RiskAnalyzer service
- [ ] Rollbacks table and tracking
- [ ] Risk correlation algorithm
- [ ] **WITH:** Learning detection & celebrations
- [ ] **WITH:** Milestone detection
- [ ] **WITH:** Toast notification component

**Deliverable:** Working anomaly detection + risk analysis + personality layer

---

### **Phase 2: Intelligence + Warmth (Weeks 5-8)**

**Goal:** Pattern understanding + emotional connection

**Week 5: Contextual Observations**

- [ ] Pattern detection engine
- [ ] Contextual observation messages
- [ ] Supportive message system
- [ ] Work style pattern recognition

**Week 6: Session Intelligence**

- [ ] Session tracking service
- [ ] Flow state detection
- [ ] Fatigue/break detection
- [ ] Session quality scoring

**Week 7: Session Stories**

- [ ] Story builder service
- [ ] Timeline generation
- [ ] Session summary UI
- [ ] Achievement detection

**Week 8: Agent Behavior + Pattern Matching**

- [ ] Behavior profiler service
- [ ] Agent mood detection
- [ ] Pattern matcher service
- [ ] Similar incident detection

**Deliverable:** Full personality + behavioral intelligence

---

### **Phase 3: Polish + Delight (Weeks 9-12)**

**Goal:** Conversation + context preservation

**Week 9: Good Morning Briefings**

- [ ] Briefing generator service
- [ ] Context preservation
- [ ] Daily summary system
- [ ] Morning briefing UI

**Week 10: Project Memory**

- [ ] Context manager service
- [ ] "Welcome back" messages
- [ ] TODO tracking across sessions
- [ ] Relevant work surfacing

**Week 11: Cross-Agent Intelligence**

- [ ] Agent comparator service
- [ ] Performance benchmarking
- [ ] Recommendation engine
- [ ] Agent comparison UI

**Week 12: Ask Raven + Polish**

- [ ] Natural language query interface
- [ ] Insight engine
- [ ] Conversational responses
- [ ] Final UI/UX polish
- [ ] Performance optimization
- [ ] Documentation

**Deliverable:** Raven v2.0.1 - Full Corvus Experience

---

## 🎯 SUCCESS METRICS

### How We Know v2 Works

**Engagement:**

- Users keep personality features enabled (>80%)
- "Caw Caw!" generates smiles (user feedback)
- Session story views >50% of sessions
- Anomaly detection accuracy >80%
- Risk prediction accuracy >70%

**Emotional:**

- Users say "I love Raven" not just "I use Raven"
- Testimonials mention personality/warmth
- Social media shares of Raven messages
- Feature requests ask for MORE personality

**Technical:**

- Anomaly detection false alarm rate <20%
- Agent detection accuracy >90%
- Performance <100ms for detection
- Handles 10K+ events/day per project

**The Ultimate Test:**

> "Raven feels like a friend who genuinely cares about my code" ❤️

---

## 💎 UNIQUE VALUE PROPOSITION

**Raven v2 delivers:**

1. **Technical Intelligence** - Real anomaly detection, risk analysis, multi-agent monitoring
2. **Emotional Warmth** - Celebrates learning, encourages when stuck, remembers your journey
3. **Partnership Insight** - Understands how you and AI agents work together
4. **Local-First Privacy** - No cloud, no data sharing, 100% yours
5. **Agent-Agnostic** - Works with ALL AI coding tools

**What makes this different:**

| Feature     | Other Tools  | Raven v2       |
| ----------- | ------------ | -------------- |
| Monitoring  | Cold metrics | Warm stories   |
| Alerts      | Annoying     | Encouraging    |
| Data        | Forgotten    | Remembered     |
| Personality | None         | Genuine friend |
| Multi-agent | Single tool  | All tools      |

---

## 🐦‍⬛ CLOSING VISION

**This isn't just monitoring with personality sprinkled on top.**

**This is genuine companionship built on solid technical foundations.**

Raven v2 notices when Claude does something risky (anomaly detection).
Raven v2 remembers you rolled back similar changes before (risk correlation).
Raven v2 celebrates when you learn TypeScript for the first time (learning detection).
Raven v2 tells you the story of what you built together (session stories).
Raven v2 says "Caw Caw!" and makes you smile during a tough debugging session.

**Because good tools should make you feel good.** ❤️

---

## 📖 NEXT STEPS

1. **Read this document carefully** ✅ (You're doing it!)
2. **Pick which features to start with**
3. **We'll build them one by one**
4. **Test each feature as we go**
5. **Ship when they feel right**

**Let's make Raven the AI coding companion everyone wishes they had.**

Caw Caw! 🐦‍⬛✨

---

_Document Version: 2.0.1_
_Created: November 8, 2025_
_"Because every developer deserves a companion who cares AND protects"_
