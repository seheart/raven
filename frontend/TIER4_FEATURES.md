# Tier 4 Advanced Features Documentation

This document explains what each Tier 4 feature does, its purpose, and what backend APIs need to be implemented.

---

## 1. Health Scoring

### Purpose
Provides an overall "health score" for the project based on multiple metrics. Think of it like a code quality dashboard that gives you a single number (0-100) representing how healthy your codebase is.

### What It Shows
- **Overall Score**: 0-100 health score with color coding (green=80+, yellow=60-79, orange=40-59, red=<40)
- **6 Metric Breakdowns**:
  - Code Quality Score (0-100)
  - Test Coverage Score (0-100)
  - Documentation Score (0-100)
  - Velocity Score (0-100) - how fast the project is moving
  - Stability Score (0-100) - how stable/reliable the code is
  - Security Score (0-100) - security posture
- **Recommendations**: List of suggestions to improve health (e.g., "Add tests to critical files", "Update outdated dependencies")

### Use Case
A developer opens the Health Scoring tab and sees their project has a 72 overall score. They see that Test Coverage is only 45, so they know to prioritize writing tests.

### Backend APIs Needed

**GET `/api/health/latest?project={project}`**
```json
{
  "score": {
    "overall_score": 72,
    "code_quality_score": 85,
    "test_coverage_score": 45,
    "documentation_score": 60,
    "velocity_score": 78,
    "stability_score": 90,
    "security_score": 80,
    "recommendations": [
      {
        "message": "Test coverage is below 50%. Add tests to critical files.",
        "severity": "high"
      },
      {
        "message": "Consider updating outdated dependencies",
        "severity": "medium"
      }
    ]
  }
}
```

**GET `/api/health/history?project={project}&days=30`**
```json
{
  "history": [
    {
      "date": "2025-01-15",
      "overall_score": 72
    },
    {
      "date": "2025-01-14",
      "overall_score": 70
    }
  ]
}
```

**POST `/api/health/calculate?project={project}`**
Triggers a new health score calculation and returns the updated score.

---

## 2. Drift Detection

### Purpose
Detects when project metrics "drift" from their baseline values. This catches regressions - when things that were good suddenly get worse.

### What It Shows
- **Active Drifts Count**: Number of metrics currently drifting
- **Drift List**: Each drift shows:
  - Type (e.g., "test_coverage", "build_time", "error_rate")
  - Severity (critical, high, medium, low)
  - Baseline value (what it was before)
  - Current value (what it is now)
  - Deviation percent (how much it changed)
  - When it was detected
  - Resolve button

### Use Case
Your test coverage was 80% last week. Today it's 65%. The drift detector alerts you that "test_coverage" has drifted -18.75% from baseline. You investigate and find someone deleted tests.

### Example Drift
```
Type: test_coverage
Severity: high
Description: Test coverage has dropped significantly
Baseline: 80.0
Current: 65.0
Deviation: -18.75%
```

### Backend APIs Needed

**GET `/api/drift/recent?project={project}&hours=24`**
```json
{
  "drifts": [
    {
      "id": 1,
      "drift_type": "test_coverage",
      "severity": "high",
      "description": "Test coverage has dropped significantly",
      "baseline_value": 80.0,
      "current_value": 65.0,
      "deviation_percent": -18.75,
      "detected_at": "2025-01-16T10:30:00Z",
      "resolved_at": null
    }
  ]
}
```

**GET `/api/drift/summary?project={project}&days=7`**
```json
{
  "summary": {
    "total_active_drifts": 3,
    "total_resolved": 12
  }
}
```

**POST `/api/drift/detect?project={project}`**
Triggers drift detection and returns new drifts found.

**POST `/api/drift/{driftId}/resolve?project={project}`**
Marks a drift as resolved.

---

## 3. Productivity Insights

### Purpose
Analyzes when and how developers are most productive. Helps optimize work schedules and habits.

### What It Shows
- **Peak Hour**: The hour of day when most productive work happens (e.g., "14:00" = 2pm)
- **Optimal Session Duration**: How long coding sessions should be for best results (e.g., "2.5 hours")
- **Focus Score**: Average focus score 0-10 (based on context switches, interruptions)
- **Trend**: Whether productivity is improving, declining, or stable
- **Recommendations**: Tips to improve productivity

### Use Case
Developer sees their peak hour is 2pm-3pm, with an optimal session of 2.5 hours. They schedule deep work during that time and take breaks every 2.5 hours.

### Backend APIs Needed

**GET `/api/productivity/latest?project={project}`**
```json
{
  "metrics": {
    "peak_hours": {
      "peak_hour": 14
    },
    "session_patterns": {
      "optimal_session_duration": 2.5
    },
    "focus_metrics": {
      "avg_focus_score": 7.8
    },
    "productivity_trends": {
      "trend": "improving"
    },
    "recommendations": [
      {
        "message": "Schedule deep work during 2pm-4pm when you're most focused"
      }
    ]
  }
}
```

**POST `/api/productivity/calculate?project={project}&days=30`**
Recalculates productivity insights from last 30 days.

---

## 4. Claude Personality Analysis

### Purpose
Analyzes Claude AI's "personality" based on how it writes code - is it conservative or aggressive? Verbose or concise? This helps understand coding patterns.

### What It Shows
- **Personality Type**: e.g., "Pragmatic Problem Solver", "Creative Innovator"
- **Summary**: Brief description of the personality
- **Traits**: Tags like "methodical", "verbose", "cautious"
- **Metrics**:
  - Communication Style (e.g., "verbose", "concise")
  - Risk Tolerance (e.g., "conservative", "moderate", "aggressive")
  - Creativity Score (0-100)
  - Consistency Score (0-100)
  - Problem Solving Approach (e.g., "incremental", "holistic")
  - Decision Speed (e.g., "fast", "deliberate")
- **Strengths**: What Claude does well

### Use Case
Team notices Claude is "conservative" with 20% risk tolerance. They understand why it suggests small incremental changes rather than big refactors.

### Backend APIs Needed

**GET `/api/personality/latest?project={project}&agent=claude`**
```json
{
  "profile": {
    "overall_profile": {
      "type": "Pragmatic Problem Solver",
      "summary": "Takes a methodical, incremental approach to solving problems",
      "traits": ["methodical", "verbose", "cautious", "thorough"],
      "strengths": [
        "Comprehensive error handling",
        "Clear documentation",
        "Incremental improvements"
      ]
    },
    "communication_style": {
      "style": "verbose"
    },
    "risk_profile": {
      "tolerance": "conservative"
    },
    "creativity_score": {
      "score": 45
    },
    "consistency_metrics": {
      "score": 85
    },
    "problem_solving": {
      "approach": "incremental"
    },
    "decision_speed": {
      "speed": "deliberate"
    }
  }
}
```

**POST `/api/personality/analyze?project={project}&agent=claude&days=30`**
Recalculates personality analysis.

---

## 5. Growth Tracking

### Purpose
Tracks how the project grows over time - events, quality, health. Shows milestones and trends.

### What It Shows
- **Stats Cards**: Avg Daily Events, Avg Quality Score, Avg Health Score, Peak Events
- **Milestones**: Notable achievements like "peak_activity" (most active day), "best_quality" (highest quality day)
- **Trends**: Metrics going up or down (e.g., "events: ↗️ +15%", "quality: ↘️ -5%")

### Use Case
Developer sees they hit a milestone of 1000 events in a day. They also see quality trending down -5%, so they focus on code reviews.

### Backend APIs Needed

**GET `/api/growth/summary?project={project}&days=30`**
```json
{
  "summary": {
    "statistics": {
      "avg_daily_events": 250,
      "avg_quality_score": 78,
      "avg_health_score": 72,
      "peak_events": 1000
    },
    "milestones": [
      {
        "type": "peak_activity",
        "message": "Hit record 1000 events in a single day!",
        "date": "2025-01-15"
      },
      {
        "type": "best_quality",
        "message": "Achieved highest quality score of 95",
        "date": "2025-01-10"
      }
    ],
    "trends": [
      {
        "metric": "daily_events",
        "direction": "increasing",
        "change_percent": 15
      },
      {
        "metric": "quality_score",
        "direction": "decreasing",
        "change_percent": 5
      }
    ]
  }
}
```

**GET `/api/growth/timeseries?project={project}&days=30&metric=all`**
```json
{
  "timeSeries": [
    {
      "date": "2025-01-15",
      "events": 1000,
      "quality": 85,
      "health": 75
    }
  ]
}
```

**POST `/api/growth/snapshot?project={project}`**
Creates a snapshot of current growth metrics.

---

## 6. Integrations

### Purpose
Configure external service integrations to send Raven data to GitHub, Discord, and Slack.

### What It Shows
- **GitHub Integration**:
  - Config form (token, owner, repo)
  - Test connection, Send health score, Disable
  - Use case: Post health scores as GitHub comments, create issues for critical errors

- **Discord Integration**:
  - Config form (webhook URL)
  - Test connection, Send health score, Disable
  - Use case: Send monitoring alerts to Discord channel

- **Slack Integration**:
  - Config form (webhook URL)
  - Test connection, Send health score, Disable
  - Use case: Notify team in Slack about health scores

### Use Case
Team configures Discord webhook. When health score drops below 70, Raven automatically posts an alert in #dev-alerts channel.

### Backend APIs Needed

**GET `/api/integrations/github/events?project={project}&hours=24`**
```json
{
  "events": [
    {
      "type": "health_score_posted",
      "timestamp": "2025-01-16T14:30:00Z"
    }
  ]
}
```

**POST `/api/integrations/github/config?project={project}`**
```json
// Request body
{
  "token": "ghp_xxxxxxxxxxxx",
  "owner": "username",
  "repo": "repo-name"
}

// Response
{
  "success": true
}
```

**GET `/api/integrations/github/test?project={project}`**
```json
{
  "result": {
    "success": true,
    "repo_name": "username/repo-name"
  }
}
```

**POST `/api/integrations/github/post-health?project={project}`**
Posts current health score to GitHub.

**POST `/api/integrations/github/disable?project={project}`**
Disables GitHub integration.

(Similar endpoints for `/discord` and `/slack`)

---

## 7. Gamification

### Purpose
Adds game-like achievements, levels, and streaks to make development more fun and rewarding.

### What It Shows
- **User Stats**: Level, Total Points, Streak (consecutive days), Badges unlocked
- **Achievements**: Cards showing unlocked achievements with:
  - Icon
  - Title (e.g., "First Commit", "Bug Hunter", "Speed Demon")
  - Description
  - Rarity (common, rare, epic, legendary)
  - Points awarded

### Use Case
Developer commits code for 7 days straight and unlocks "Week Warrior" achievement for 100 points. They level up to Level 5.

### Example Achievements
- "First Commit" - Made your first commit (10 pts, common)
- "Bug Hunter" - Fixed 50 bugs (100 pts, rare)
- "Speed Demon" - 100 commits in one day (200 pts, epic)
- "Perfect Week" - 7 days streak with no errors (500 pts, legendary)

### Backend APIs Needed

**GET `/api/gamification/stats?project={project}`**
```json
{
  "stats": {
    "level": 5,
    "total_points": 1250,
    "streak_days": 7,
    "badges_unlocked": 12
  }
}
```

**GET `/api/gamification/achievements?project={project}`**
```json
{
  "achievements": [
    {
      "id": 1,
      "title": "First Commit",
      "description": "Made your first commit to the project",
      "icon": "🎯",
      "points": 10,
      "rarity": "common",
      "unlocked_at": "2025-01-10T10:00:00Z"
    },
    {
      "id": 2,
      "title": "Bug Hunter",
      "description": "Fixed 50 bugs",
      "icon": "🐛",
      "points": 100,
      "rarity": "rare",
      "unlocked_at": "2025-01-15T14:30:00Z"
    }
  ]
}
```

**GET `/api/gamification/recent?project={project}`**
Returns recently unlocked achievements.

---

## 8. Easter Eggs

### Purpose
Fun hidden features and seasonal messages that appear on special dates or when special patterns are detected.

### What It Shows
- **Seasonal Message**: Special message for holidays/events (e.g., "Happy New Year!", "It's Halloween! 🎃")
- **Discovered Easter Eggs**: List of found easter eggs with:
  - Title
  - Message
  - Trigger type (e.g., "date-based", "pattern-based", "konami-code")
  - When discovered

### Use Case
On December 25th, developer sees "Happy Holidays! 🎄" seasonal message. When they type a Konami code pattern, they unlock a secret easter egg.

### Example Easter Eggs
- "Coffee Break" - Triggered at 3:14pm (pi time)
- "Midnight Coder" - Triggered when coding after midnight
- "Palindrome Day" - Triggered on palindrome dates (2025-05-20)
- "Konami Code" - Triggered by typing the Konami code

### Backend APIs Needed

**GET `/api/easter-eggs?project={project}`**
```json
{
  "eggs": [
    {
      "id": 1,
      "title": "Coffee Break",
      "message": "Perfect time for coffee! ☕",
      "trigger_type": "time-based",
      "discovered_at": "2025-01-15T15:14:00Z"
    }
  ]
}
```

**GET `/api/easter-eggs/seasonal?project={project}`**
```json
{
  "messages": [
    {
      "title": "Happy New Year!",
      "message": "Welcome to 2025! 🎉 May your code be bug-free!"
    }
  ]
}
```

---

## 9. Social Features

### Purpose
Export your stats to share with others, track team members, and see share history.

### What It Shows
- **Export Section**: Download your stats as JSON, Markdown, or Plain Text
- **Share History**: List of times you've shared stats (platform, type, date)
- **Team Members**: List of team members with roles and join dates

### Use Case
Developer exports their stats as Markdown to include in their end-of-year review. They see their team has 5 members, 2 joined this month.

### Backend APIs Needed

**GET `/api/social/export?project={project}&format={format}`**
Downloads file with stats in requested format (json/markdown/text).

**GET `/api/social/share-history?project={project}&limit=20`**
```json
{
  "history": [
    {
      "id": 1,
      "share_type": "stats_export",
      "platform": "markdown",
      "shared_at": "2025-01-15T10:00:00Z"
    }
  ]
}
```

**GET `/api/social/team?project={project}`**
```json
{
  "members": [
    {
      "id": 1,
      "member_name": "Alice",
      "role": "Lead Developer",
      "joined_at": "2024-01-01T00:00:00Z"
    },
    {
      "id": 2,
      "member_name": "Bob",
      "role": "Developer",
      "joined_at": "2025-01-10T00:00:00Z"
    }
  ]
}
```

---

## Implementation Priority

If you're implementing these features incrementally, here's a suggested order:

1. **Health Scoring** - Most useful, gives overall project quality view
2. **Drift Detection** - Catches regressions early
3. **Productivity Insights** - Helps optimize work habits
4. **Growth Tracking** - Shows progress over time
5. **Gamification** - Fun motivator
6. **Integrations** - Team collaboration
7. **Social** - Sharing and team features
8. **Claude Personality** - Interesting but less critical
9. **Easter Eggs** - Fun extras

---

## Notes

- All APIs should accept a `project` parameter to support multi-project tracking
- Error states are handled gracefully in the frontend - if an API returns 404 or errors, the page shows an "empty state" message
- The frontend uses lazy loading - tabs only load data when first visited
- All POST endpoints trigger recalculation/analysis and return updated data
