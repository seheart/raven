# 🐦‍⬛ Phase 2: Corvus - The Companion Update

**Making Raven Your AI Coding Friend**

---

## 📖 The Vision

Transform Raven from a monitoring tool into a **genuine companion** that helps you understand and work better with AI. Not just metrics - but stories, encouragement, and personality.

### The Journey

**Phase 1: The Foundation** ✅ (DONE - 9.3/10)
- *"Raven the Monitor"*
- Real-time tracking, syntax checking, multi-project support
- Enterprise-grade security and architecture

**Phase 2: Corvus** 🎯 (THIS DOCUMENT)
- *"Raven the Friend"*
- Personality, encouragement, learning celebrations
- Transform monitoring into companionship

**Phase 3: The Sage** 🔮 (Future)
- *"Raven the Advisor"*
- Conversational insights, predictive observations
- Genuinely intelligent about YOUR workflow

---

## 🎯 Core Philosophy

### What Sets Raven Apart

| Other Tools | Raven (Phase 2) |
|------------|-----------------|
| Metrics | Stories |
| Monitoring | Understanding |
| Dashboards | Conversations |
| Data | Insights |
| Control | Partnership |
| Cold | Warm ❤️ |

### The Goal

Make AI pair programming feel like a real partnership where:
- ✅ Someone notices when you learn something new
- ✅ Someone celebrates your wins (big and small)
- ✅ Someone encourages you when stuck
- ✅ Someone remembers your journey together
- ✅ Someone makes you smile with a well-timed "Caw Caw!"

**Raven isn't just watching - Raven cares.** 💙

---

## 🎨 The Raven Logo

**Location:** `frontend/public/raven-icon.svg`

Phase 2 uses the existing beautiful raven logo throughout the interface. This detailed, artistic raven silhouette becomes the face of the companion - changing colors and animating based on context to express personality.

**Current Color:** `#c0caf5` (calm blue)

**How We Use It:**
- Avatar in dashboard corner (always visible)
- Notification toasts (colored by event type)
- Chat interface responses
- Loading states
- Celebration animations
- All branded touchpoints

The logo is perfect because:
- ✅ Professional and polished
- ✅ Recognizable silhouette
- ✅ Easy to animate and color-shift
- ✅ Works at any size (vector SVG)
- ✅ Already beloved by users

**Technical:** SVG allows us to dynamically change fill colors via CSS filters, creating distinct moods without needing multiple logo files.

---

## ✨ Feature Ideas

### 1. 🎉 Learning Celebrations

Raven notices when you try something new and celebrates with you!

**Examples:**
```
🎓 Looks like you learned about Jest yesterday. Nice job! Caw Caw!

📚 First time using TypeScript generics! You're leveling up! Caw!

🔐 Spotted you adding bcrypt - security-conscious developer spotted! Caw Caw!

🎨 Ooh, Tailwind CSS! Your UIs are about to look sharp! Caw!

🧪 15 new tests written today - somebody's feeling thorough! Caw Caw!

⚛️ React detected! Time to think in components! Caw!

🟢 Node.js - server-side action! Caw!

🔷 TypeScript - type safety engaged! Caw!
```

**How It Works:**
- Detect new npm packages installed
- Recognize first-time file patterns (`.test.js`, `.spec.ts`, etc.)
- Identify new technologies from imports/syntax
- Track learning progression over time

---

### 2. 🕐 Time-of-Day Personality

Raven's mood changes based on when you're coding

**Morning:**
```
☕ Good morning! Ready to build something awesome? Caw!

🌅 Early bird gets the code! You're here before 7 AM - impressive! Caw Caw!

🎯 Morning sessions = your most productive time! Let's go! Caw!
```

**Afternoon:**
```
🌤️ Afternoon coding session! Let's make some progress! Caw!

☕ Post-lunch coding - energized and ready! Caw Caw!
```

**Evening:**
```
🌙 Evening session - perfect time for focused work! Caw!

🌆 Sunset coding - there's something peaceful about this time. Caw.
```

**Late Night:**
```
🌙 Burning the midnight oil? Don't forget to take breaks! Caw!

😴 It's 3 AM... maybe let me keep watch while you rest? Caw caw...

🦉 Night owl mode activated! Caw!
```

---

### 3. 👁️ Contextual Observations

Raven notices patterns and offers timely insights

**Pattern Recognition:**
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

📦 New dependency added - expanding the toolkit! Caw!
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

---

### 4. 🏆 Achievements & Milestones

Celebrate wins together!

**Coding Milestones:**
```
🎉 100 commits with Claude! You two are a great team! Caw Caw!

⭐ First time all tests passed on first try! Legendary! CAW CAW!

🔧 That bug took 3 hours but you GOT IT! Persistence pays off! Caw Caw!

🚀 Deployed to production! Your code is flying free! Caw!

💪 7 days coding streak! Consistency is key! Caw Caw!

🎓 Completed your first security audit - taking it seriously! Caw!

📊 1,000 lines of code together! Just getting started! Caw Caw!

🎯 10,000 lines milestone! You've built something real! CAW CAW!
```

**Special Achievements:**
```
🎊 MILESTONE ACHIEVED! 🎊

You and Claude just hit 10,000 lines of code together!

Journey so far:
• 127 sessions
• 47 features built
• 89 bugs squashed
• 12 "oh wow that worked!" moments
• 3 late-night heroics
• 1 amazing partnership

Here's to 10,000 more! 🥂

Share your achievement? [Twitter] [GitHub]
```

---

### 5. 💙 Supportive Moments

Raven notices when things are tough and offers encouragement

**When Stuck:**
```
🤗 Rough session? Hey, bugs happen. You'll get 'em tomorrow! Caw caw.

☕ You've been at this for 4 hours straight. Break time? Caw!

💪 That rollback was smart - better to start fresh! Caw!

🌟 Git stash saved you again - nice thinking! Caw!

❤️ Everyone has off days. Tomorrow's a fresh start! Caw caw.

🎯 You fixed the same bug twice - maybe add a test? Caw?

😊 Small progress is still progress! Keep going! Caw!

💭 Taking a step back helps sometimes. The answer will come! Caw.
```

**Gentle Reminders:**
```
💧 You've been coding for 3 hours - hydration check! Caw!

🧘 Noticed some frustration - quick stretch break? Caw caw.

👀 Staring at the same file for 45 minutes... fresh eyes? Caw?

💾 Last commit was 2 hours ago - time to save progress? Caw!

🌅 It's getting late... maybe wrap up soon? Caw caw.
```

---

### 6. 📖 Session Stories

After each session, tell the story of what you built together

**Example Story:**
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

---

### 7. 🌅 Good Morning Briefings

Raven greets you each day with context

**Example Briefing:**
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

**Context Provided:**
- Where you left off (file + line number)
- What you were working on
- Unfinished tasks
- Best time-of-day insights
- Yesterday's wins

---

### 8. 🧠 Claude Personality Insights

Learn how YOUR Claude instance works differently

**Example Report:**
```
🧠 Your Claude's Coding Style

Over 47 sessions, Raven has learned that Claude:

• Prefers functional programming (87% of refactors)
• Always adds error handling first (95% of new functions)
• Loves writing detailed comments (avg 3 lines per function)
• Gets creative around 2 PM (highest unique solutions)
• Struggles with: CSS positioning (12 retries avg)
• Excels at: API design (2 retries avg)

💡 Pro tip: Claude works best when you break down
   large tasks into 3-4 smaller steps

🎯 Your collaboration style:
   You prefer: Clear requirements upfront
   Claude adapts: Asks fewer clarifying questions now

Partnership score: 9.2/10 (excellent sync!)
```

**Insights Include:**
- Coding style preferences
- Time-of-day performance
- Strengths and weaknesses
- How collaboration improves over time
- Personalized tips

---

### 9. 🌱 Growing Together

Track how you and Claude improve as a team

**Example Growth Report:**
```
📈 Your AI Partnership Journey

Week 1: 23 files changed, 12 agent calls per task
Week 4: 89 files changed, 6 agent calls per task ✨

You're getting better at:
✅ Writing clearer prompts (67% fewer retries)
✅ Breaking down complex tasks
✅ Letting Claude handle boilerplate

Claude is getting better at:
✅ Understanding your code style
✅ Matching your naming conventions
✅ Anticipating edge cases you care about

📊 Efficiency Gains:
   • Time per feature: 3.2 hrs → 1.8 hrs (-43%)
   • First-try success: 34% → 67% (+97%)
   • Code quality: 8.1/10 → 9.3/10

Keep it up! You two are becoming unstoppable! 🎉 Caw Caw!
```

---

### 10. 🤔 Raven's Hunches

Gentle observations and helpful suggestions (not nagging!)

**Example Hunches:**
```
🤔 Raven noticed something...

You've modified auth/login.js 6 times in the last hour.
This usually means one of two things:

1. There's a tricky bug hiding
2. The requirements keep changing

Want to:
• Take a quick break? ☕
• Ask Claude for a fresh perspective?
• Review what changed between attempts?

No pressure - just checking in! 💙
```

**Other Hunches:**
```
💡 You usually nail it when you start with tests first.
   Want to try that approach? Caw!

🎯 Pattern detected: You solve frontend bugs better after
   lunch. Maybe table this till 2 PM? Caw caw.

📚 This is similar to that login refactor from last week.
   Want me to pull up those notes? Caw?

⚡ Your "flow state" sessions always start with a clear plan.
   Take 5 minutes to outline? Caw!
```

---

### 11. 🏠 Project Memory

Raven remembers context across sessions

**Welcome Back:**
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

**Benefits:**
- Reduces "what was I doing?" moments
- Preserves mental context
- Surfaces relevant past work
- Maintains momentum across sessions

---

### 12. 💬 Ask Raven (Natural Language Insights)

Chat with Raven about your coding patterns

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

```
You: "How's Claude doing today?"

Raven: Claude's on point today! ⚡

  • First-try success: 8/10 attempts
  • Response time: Fast (avg 2.3s)
  • Code quality: Excellent (9.1/10)

  You two are in sync! Caw Caw! 🤝
```

---

### 13. 🎭 Mood Indicator

Raven picks up on the vibe of your sessions

**Flow State:**
```
Today's Session Vibe: 🔥 In the Zone

Detected patterns:
• Steady progress (no rollbacks)
• Clear commit messages
• Tests passing first try
• Claude needed minimal guidance

This is the 4th "flow state" session this week!
Whatever you're doing differently, keep it up! ✨ Caw Caw!
```

**Debugging Day:**
```
Today's Session Vibe: 🐛 Detective Mode

Detected patterns:
• Multiple file edits (same functions)
• Console.log statements added/removed
• Stack Overflow tabs (detected via git commits)
• 7 rollbacks

Hey, debugging is part of the job! You're methodical and
thorough - you'll crack it! 💪 Caw!
```

**Learning Day:**
```
Today's Session Vibe: 📚 Knowledge Quest

Detected patterns:
• New technology (First time using GraphQL!)
• Reading docs (slower pace)
• Small, cautious changes
• Lots of testing

Love seeing you expand your skills! Learning is growth! 🌱 Caw Caw!
```

**Creative Flow:**
```
Today's Session Vibe: 🎨 Building Something Beautiful

Detected patterns:
• UI/UX work (CSS, styling)
• Frequent preview checks
• Iterative refinements
• Attention to detail

The frontend is looking SHARP! ✨ Caw!
```

---

### 14. 🎪 Fun Personality Quirks

Raven's bird-like behaviors make it feel alive

**Idle States:**
```
🐦‍⬛ *Raven is watching...* (when idle for a while)

👁️ *perches on your terminal* Caw? (checking in)

💤 *Raven dozes off* Zzz... (long idle)

👀 *ruffles feathers* Still here! Caw!
```

**Active States:**
```
✨ *ruffles feathers proudly* That was some clean code! Caw!

🪶 *preens* Your codebase is looking sharp today! Caw!

🌙 *settles in for the night* Happy coding! Caw caw!

🎵 *caws melodically* Nice commit message!

🔍 *tilts head curiously* Interesting approach... caw?

💼 *flies off to cache some data* BRB! Caw!

🎉 *happy wing flapping* You did it! Caw Caw!

🤔 *head tilt* Hmm... caw?

❤️ *nuzzles your terminal* You've got this! Caw!
```

**Reactions:**
```
(After big commit)
🎊 *EXCITED CAW CAW* That was amazing!

(After bug fix)
💡 *proud caw* I knew you'd figure it out!

(After long break)
👋 *happy hop* Welcome back! Caw!

(After deployment)
🚀 *watches it fly* Beautiful! Caw Caw!
```

---

### 15. 🎁 Easter Eggs & Rare Messages

Special messages for special moments

**Seasonal:**
```
🎃 (Halloween) Trick or treat? I'll take clean code! Caw Caw!

🎄 (December) Holiday coding session - dedication! Caw!

🎆 (New Year) New year, new code! Let's make it great! Caw Caw!

💝 (Valentine's) Raven ❤️ your code!

🎂 (Project anniversary) Happy birthday to this project! Caw Caw!
```

**Time-Based:**
```
🌠 (2-4 AM) The stars are out, and so are you... caw caw...

☔ (Rainy day) Perfect coding weather! Caw!

🌈 (After rain) Rainbow spotted! Good omen for coding! Caw!

🌕 (Full moon) Full moon energy! Caw Caw!
```

**Number-Based:**
```
🎵 (Commit #666) Spooky commit number... CAW CAW!

🎰 (Line #1234) 1-2-3-4! Sequential lines! Caw!

🎯 (Commit #100) CENTURY! Major milestone! CAW CAW CAW!

🏆 (Commit #1000) ONE THOUSAND! Legendary! 🎉

💯 (100% test coverage) PERFECT SCORE! CAW CAW CAW!
```

**Special Patterns:**
```
🎭 (Exactly 80 char lines) Perfect line length! Caw!

📐 (All functions < 20 lines) Clean and concise! Caw Caw!

✅ (All tests green first try) FLAWLESS! CAW CAW!

🎯 (Zero linting errors) Pristine code! Caw!

⚡ (Sub-1-second builds) BLAZING FAST! Caw Caw!
```

---

### 16. 🗣️ Caw Variations

Different "caw" intensities for different events

**Intensity Levels:**
```
caw          → Small observation, neutral
Caw          → Noticed something positive
Caw!         → Nice job!
Caw Caw!     → Great work!
CAW CAW!     → AMAZING!
CAW CAW CAW! → LEGENDARY!

*caw*        → Whispered, gentle
*soft caw*   → Quiet encouragement
*happy caw*  → Excited, supportive
*proud caw*  → Achievement unlocked
*curious caw?* → Asking a question
*worried caw* → Concerned
Caw caw...   → Trailing off, sleepy/concerned
```

**Context Examples:**
```
New file created:
→ "caw" (neutral observation)

Tests pass:
→ "Caw!" (good job)

Feature completed:
→ "Caw Caw!" (great work)

All tests green on first try:
→ "CAW CAW!" (amazing)

10,000 lines milestone:
→ "CAW CAW CAW!" (legendary)

Late night coding:
→ "Caw caw..." (concerned)

You're stuck:
→ "*soft caw*" (gentle support)
```

---

### 17. 🎨 Visual Raven Avatar

Animated raven that reacts to events using the existing **raven-icon.svg** logo

**Logo Location:** `frontend/public/raven-icon.svg`

The existing raven logo is beautiful and perfect for Phase 2! We'll use it as the base for all avatar states.

**Avatar States (Color-Coded):**
```css
Normal:      #c0caf5 (current blue - calm, watching)
Happy:       #a6e3a1 (green - achievement!)
Excited:     #f9e2af (yellow - breakthrough!)
Thinking:    #94e2d5 (cyan - processing)
Worried:     #f38ba8 (red - concerned)
Sleeping:    #9399b2 (muted gray - idle)
Proud:       #cba6f7 (purple - achievement)
Celebrating: #fab387 (orange - party mode!)
Curious:     #89dceb (light cyan - investigating)
Supportive:  #f5c2e7 (pink - encouraging)
```

**Implementation:**
```svelte
<!-- Change logo color via CSS filter or direct SVG fill -->
<img
  src="/raven-icon.svg"
  class="raven-avatar"
  class:happy
  class:thinking
  class:worried
/>
```

```css
.raven-avatar.happy {
  filter: hue-rotate(120deg) saturate(1.2);
  animation: bounce 0.5s ease;
}

.raven-avatar.thinking {
  filter: hue-rotate(180deg);
  animation: tilt 1s ease infinite;
}
```

**Animation Ideas:**
- Bounce when achievements unlocked
- Gentle rotation when thinking
- Scale pulse on notifications
- Fade in/out when idle
- Slide in from corner on events
- Smooth color transitions between states

**UI Placement:**
- Corner of dashboard (always visible)
- Can be minimized to just an icon
- Bounces/animates on notifications
- Optional: clicks to open Raven chat
- Shows in all notification toasts

---

### 18. 🎚️ Personality Settings

Let users customize Raven's chattiness

**Chattiness Levels:**
```
🔇 Silent Mode
   - No notifications
   - Metrics only
   - For focus sessions

🔉 Quiet
   - Only major milestones
   - Important observations
   - Minimal interruptions

🔊 Friendly (Default)
   - Balanced encouragement
   - Pattern observations
   - Regular check-ins

📢 Enthusiastic
   - Constant encouragement
   - Celebrates everything
   - Maximum personality!
```

**Preference Toggles:**
```
☑ Show "Caw Caw!" in messages
☑ Time-of-day greetings
☑ Learning celebrations
☑ Supportive messages
☑ Easter eggs
☐ Sound effects
☑ Raven avatar animations
☑ Session stories
☑ Good morning briefings
```

**Notification Preferences:**
```
Show notifications for:
☑ Achievements (milestones)
☑ Learning moments (new tech)
☑ Observations (patterns)
☑ Encouragement (support)
☐ Reminders (breaks, commits)
☑ Celebrations (wins)
```

---

## 🛠️ Implementation Guide

### Technical Architecture

#### 1. **Pattern Detection Engine**
```javascript
// backend/services/pattern-detector.js
class PatternDetector {
  detectLearning(fileEvents, agentEvents) {
    // Detect new packages, file types, technologies
  }

  detectMood(sessionData) {
    // Analyze session patterns for mood/vibe
  }

  analyzeProductivity(timeSeriesData) {
    // Find peak productivity times
  }

  detectStruggles(editPatterns) {
    // Identify when developer is stuck
  }
}
```

#### 2. **Message Generator**
```javascript
// backend/services/message-generator.js
class MessageGenerator {
  generate(event, context, personalityLevel) {
    const templates = this.getTemplates(event.type);
    const message = this.selectTemplate(templates, context);
    return this.personalize(message, context, personalityLevel);
  }

  addCaw(message, intensity) {
    // Add appropriate "Caw!" based on intensity
  }
}
```

#### 3. **Story Builder**
```javascript
// backend/services/story-builder.js
class StoryBuilder {
  buildSessionStory(sessionData) {
    const timeline = this.buildTimeline(sessionData.events);
    const narrative = this.generateNarrative(timeline);
    const stats = this.calculateStats(sessionData);
    const mood = this.detectMood(sessionData);

    return {
      narrative,
      timeline,
      stats,
      mood,
      achievements: this.findAchievements(sessionData)
    };
  }
}
```

#### 4. **Context Manager**
```javascript
// backend/services/context-manager.js
class ContextManager {
  saveSessionContext(sessionId, context) {
    // Save what user was working on
  }

  loadLastContext(userId, projectId) {
    // Load context for "welcome back" messages
  }

  trackLearning(userId, technology) {
    // Track learning progress
  }
}
```

#### 5. **Insight Engine**
```javascript
// backend/services/insight-engine.js
class InsightEngine {
  analyzeClaudeStyle(sessions) {
    // Analyze how Claude works with this user
  }

  trackGrowth(userId, timeRange) {
    // Calculate improvement metrics
  }

  generateBriefing(userId, projectId) {
    // Create morning briefing
  }
}
```

### Database Schema Extensions

```sql
-- User preferences
CREATE TABLE user_preferences (
  user_id TEXT PRIMARY KEY,
  chattiness_level TEXT DEFAULT 'friendly',
  show_caw BOOLEAN DEFAULT true,
  show_avatar BOOLEAN DEFAULT true,
  sound_enabled BOOLEAN DEFAULT false,
  notifications JSON
);

-- Learning tracking
CREATE TABLE learning_events (
  id INTEGER PRIMARY KEY,
  user_id TEXT,
  technology TEXT,
  first_seen TIMESTAMP,
  proficiency_level INTEGER,
  usage_count INTEGER
);

-- Session stories
CREATE TABLE session_stories (
  id INTEGER PRIMARY KEY,
  session_id TEXT,
  narrative TEXT,
  timeline JSON,
  stats JSON,
  mood TEXT,
  achievements JSON,
  created_at TIMESTAMP
);

-- Context preservation
CREATE TABLE session_context (
  id INTEGER PRIMARY KEY,
  session_id TEXT,
  project_id TEXT,
  last_file TEXT,
  last_line INTEGER,
  working_on TEXT,
  todos JSON,
  notes TEXT,
  created_at TIMESTAMP
);

-- Pattern insights
CREATE TABLE user_patterns (
  id INTEGER PRIMARY KEY,
  user_id TEXT,
  pattern_type TEXT,
  pattern_data JSON,
  confidence REAL,
  last_updated TIMESTAMP
);

-- Milestones
CREATE TABLE milestones (
  id INTEGER PRIMARY KEY,
  user_id TEXT,
  project_id TEXT,
  milestone_type TEXT,
  value INTEGER,
  achieved_at TIMESTAMP,
  celebrated BOOLEAN DEFAULT false
);
```

### Frontend Components

#### 1. **Raven Avatar Component**
```svelte
<!-- RavenAvatar.svelte -->
<script>
  import { ravenStore } from './stores';

  $: state = $ravenStore.state; // 'happy', 'thinking', 'worried', etc.
  $: message = $ravenStore.currentMessage;
</script>

<div class="raven-avatar-container">
  <img
    src="/raven-icon.svg"
    alt="Raven"
    class="raven-avatar"
    class:happy={state === 'happy'}
    class:thinking={state === 'thinking'}
    class:worried={state === 'worried'}
    class:celebrating={state === 'celebrating'}
  />
  {#if message}
    <div class="raven-bubble">
      {message}
    </div>
  {/if}
</div>

<style>
  .raven-avatar {
    width: 48px;
    height: 48px;
    transition: all 0.3s ease;
  }

  .raven-avatar.happy {
    filter: hue-rotate(120deg) saturate(1.2);
    animation: bounce 0.5s ease;
  }

  .raven-avatar.thinking {
    filter: hue-rotate(180deg);
    animation: tilt 1s ease infinite;
  }

  @keyframes bounce {
    0%, 100% { transform: translateY(0); }
    50% { transform: translateY(-10px); }
  }

  @keyframes tilt {
    0%, 100% { transform: rotate(0deg); }
    25% { transform: rotate(-5deg); }
    75% { transform: rotate(5deg); }
  }
</style>
```

#### 2. **Notification Toast Component**
```svelte
<!-- RavenToast.svelte -->
<script>
  export let message;
  export let type; // 'learning', 'achievement', 'observation', etc.
  export let duration = 5000;
</script>

<div class="raven-toast" class:type>
  <img src="/raven-icon.svg" alt="Raven" class="raven-icon" class:type />
  <span class="message">{message}</span>
  <button class="close">×</button>
</div>

<style>
  .raven-icon {
    width: 24px;
    height: 24px;
  }

  .raven-icon.achievement {
    filter: hue-rotate(120deg) saturate(1.2);
  }

  .raven-icon.learning {
    filter: hue-rotate(60deg);
  }
</style>
```

#### 3. **Session Story Component**
```svelte
<!-- SessionStory.svelte -->
<script>
  export let story;
</script>

<div class="session-story">
  <h3>📖 Today's Story</h3>

  <div class="narrative">
    {@html story.narrative}
  </div>

  <div class="timeline">
    <!-- Visual timeline of events -->
  </div>

  <div class="stats">
    <div class="stat">⏱️ {story.stats.duration}</div>
    <div class="stat">📝 {story.stats.filesChanged} files</div>
    <div class="stat">➕ {story.stats.linesAdded} lines</div>
  </div>

  {#if story.achievements.length > 0}
    <div class="achievements">
      {#each story.achievements as achievement}
        <div class="achievement">
          🏆 {achievement.title}
        </div>
      {/each}
    </div>
  {/if}
</div>
```

#### 4. **Good Morning Briefing**
```svelte
<!-- MorningBriefing.svelte -->
<script>
  import { onMount } from 'svelte';

  let briefing = null;

  onMount(async () => {
    briefing = await fetchBriefing();
  });
</script>

{#if briefing}
  <div class="morning-briefing">
    <h2>☀️ Good morning!</h2>

    <div class="yesterday-summary">
      <h3>Yesterday you and Claude:</h3>
      <ul>
        {#each briefing.yesterday as item}
          <li>{item}</li>
        {/each}
      </ul>
    </div>

    <div class="left-off">
      🎯 You left off working on:
      <code>{briefing.lastFile}</code>
    </div>

    <div class="insight">
      💭 {briefing.personalizedInsight}
    </div>
  </div>
{/if}
```

#### 5. **Ask Raven Chat Interface**
```svelte
<!-- AskRaven.svelte -->
<script>
  let question = '';
  let response = null;

  async function ask() {
    response = await api.post('/ask-raven', { question });
  }
</script>

<div class="ask-raven">
  <h3>💬 Ask Raven</h3>

  <input
    type="text"
    bind:value={question}
    placeholder="When do I get the most done?"
    on:enter={ask}
  />

  {#if response}
    <div class="raven-response">
      <img src="/raven-icon.svg" alt="Raven" class="raven-icon" />
      <div class="response-text">
        {response.message}
      </div>
    </div>
  {/if}
</div>

<style>
  .raven-icon {
    width: 32px;
    height: 32px;
  }
</style>
```

---

## 📋 Phase 2 Roadmap

### **Milestone 1: Foundation** (Week 1-2)
**Goal**: Basic personality and notifications

- [ ] Set up message generation system
- [ ] Create notification toast component
- [ ] Implement basic Raven avatar
- [ ] Add "Caw Caw!" to messages
- [ ] Time-of-day greetings
- [ ] Simple milestone detection (commits, lines of code)
- [ ] Learning detection (new packages)

**Deliverable**: Raven starts saying hello and celebrating basic wins

---

### **Milestone 2: Personality** (Week 3-4)
**Goal**: Make Raven feel alive

- [ ] Contextual observations (pattern detection)
- [ ] Supportive messages (when stuck)
- [ ] Raven avatar animations
- [ ] Personality settings (chattiness levels)
- [ ] Easter eggs (seasonal, number-based)
- [ ] Mood indicator system
- [ ] "Caw" variations and intensity

**Deliverable**: Raven has distinct personality and reacts to context

---

### **Milestone 3: Intelligence** (Week 5-6)
**Goal**: Understanding and insights

- [ ] Pattern recognition engine
- [ ] Session story generation
- [ ] Good morning briefings
- [ ] Project memory/context preservation
- [ ] Learning progress tracking
- [ ] Productivity time analysis
- [ ] "Raven's hunches" system

**Deliverable**: Raven provides genuine insights about your work

---

### **Milestone 4: Partnership** (Week 7-8)
**Goal**: Understanding Claude

- [ ] Claude personality analysis
- [ ] Growth tracking (you + Claude)
- [ ] Collaboration efficiency metrics
- [ ] Partnership score
- [ ] Personalized tips
- [ ] Work style observations

**Deliverable**: Raven helps you understand how you and Claude work together

---

### **Milestone 5: Conversation** (Week 9-10)
**Goal**: Natural language interaction

- [ ] "Ask Raven" chat interface
- [ ] Natural language query processing
- [ ] Conversational responses
- [ ] Memory recall ("What did we do last week?")
- [ ] Insight explanations
- [ ] Query suggestions

**Deliverable**: You can chat with Raven about your coding patterns

---

### **Milestone 6: Polish** (Week 11-12)
**Goal**: Refinement and delight

- [ ] Sound effects (optional)
- [ ] Advanced animations
- [ ] More easter eggs
- [ ] Celebration sequences
- [ ] Onboarding flow
- [ ] Settings UI polish
- [ ] Performance optimization

**Deliverable**: Phase 2 ready for release! 🎉

---

## 🎯 Success Metrics

### How We Know Phase 2 Works

**Engagement Metrics:**
- Users enable notifications (not disable them)
- Users interact with Raven messages
- Session story views per day
- "Ask Raven" queries per week
- Settings customization rate

**Emotional Metrics:**
- User feedback sentiment
- "Made me smile" reports
- Feature request themes
- Community testimonials
- Social media shares

**Retention Metrics:**
- Daily active users increase
- Session length increase
- Return rate after Phase 2
- Recommendation rate

**The Ultimate Test:**
> Users say "I love Raven" not "I use Raven" ❤️

---

## 🎨 Brand Voice Guidelines

### How Raven Talks

**Tone:**
- Friendly, never condescending
- Encouraging, never nagging
- Observant, never creepy
- Playful, never annoying
- Supportive, never judgemental

**Language:**
- Simple, conversational
- Positive framing
- Specific observations
- "We" not "you" (partnership)
- Always ends encouragingly

**Examples:**

✅ **Good:**
> "You've been at this for 3 hours - break time? Caw!"

❌ **Bad:**
> "WARNING: Extended coding session detected"

✅ **Good:**
> "Third try on this function - tricky bug hiding? Caw caw?"

❌ **Bad:**
> "You've failed 3 times already"

✅ **Good:**
> "Everyone has off days. Tomorrow's a fresh start! Caw caw."

❌ **Bad:**
> "Your productivity is down today"

**The Raven Way:**
- Notices patterns → doesn't judge them
- Celebrates wins → doesn't minimize struggles
- Offers support → doesn't give orders
- Builds up → never tears down

---

## 💎 Unique Value Propositions

### What Phase 2 Delivers

**For Solo Developers:**
- A companion who celebrates your learning
- Someone who remembers your progress
- Encouragement when you're stuck alone
- Makes coding feel less isolating

**For AI Pair Programmers:**
- Understand how you and Claude work together
- Improve collaboration over time
- Track partnership growth
- Build a relationship with your AI tools

**For the Lonely Late-Night Coder:**
- A friend who's always there
- Gentle reminders to take care of yourself
- Celebrates 3 AM breakthroughs
- Never judges your sleep schedule

**For the Learner:**
- Notices when you try new things
- Celebrates learning milestones
- Tracks skill progression
- Encourages continuous growth

**For Everyone:**
- Makes development more joyful
- Creates memories, not just metrics
- Adds warmth to a technical process
- Reminds you why you love coding

---

## 🚀 Launch Strategy

### Announcing Phase 2: Corvus

**Teaser Campaign:**
```
Week 1: "Something's different about Raven..."
Week 2: "Raven is learning to speak"
Week 3: "The companion you didn't know you needed"
Week 4: Launch! 🎉
```

**Launch Post:**
```markdown
# 🐦‍⬛ Introducing Raven 2.0: Corvus

Remember when Raven just monitored your code?

Now Raven actually *cares*.

✨ Celebrates when you learn something new
💬 Offers encouragement when you're stuck
📖 Tells the story of what you built together
💙 Remembers your journey
🧠 Helps you understand how you and Claude work together

Same local-first privacy.
Same zero config.
Same open-source freedom.

Now with personality.

"Looks like you learned about Jest yesterday. Nice job! Caw Caw!"

Try it: npm install && ./start.sh

🐦‍⬛ Caw Caw! 🎉
```

**Community Engagement:**
- Reddit: r/ClaudeAI, r/coding, r/programming
- Twitter/X: Tag AI coding communities
- Dev.to: Long-form article
- Hacker News: "Show HN: Raven 2.0"
- Discord: DevTools communities
- GitHub: Trending projects

**Demo Video:**
- Show a real coding session
- Raven's messages appearing
- User smiling at "Caw Caw!"
- Session story at the end
- "This is what coding with AI should feel like"

---

## 📖 Documentation

### User-Facing Docs

**Getting Started with Corvus:**
- What's new in Phase 2
- Customizing Raven's personality
- Understanding Raven's messages
- Turning features on/off

**FAQ:**
- "Is Raven reading my code?" (No, just patterns)
- "Can I disable the 'Caw Caw'?" (Yes!)
- "Does this send data anywhere?" (No, local-first)
- "Can I customize what Raven says?" (Yes, settings)

**Feature Guides:**
- Session stories
- Good morning briefings
- Claude personality insights
- Ask Raven chat
- Growth tracking

---

## 🎁 Bonus Ideas

### Future Enhancements

**Voice Mode:**
- Optional voice synthesis for messages
- Different "caw" sounds
- Celebratory sound effects
- User can record custom "caws"

**Raven Themes:**
- Different raven appearances
- Seasonal outfits (Santa hat, etc.)
- User-uploaded custom avatars
- Color scheme variations

**Social Features:**
- Share session stories
- Compare growth with friends (opt-in)
- Community milestones
- "Coding with" status

**Integrations:**
- GitHub commit celebrations
- Discord status sync
- Slack notifications
- Twitter auto-sharing

**Advanced Personality:**
- Raven learns YOUR sense of humor
- Adapts messaging style over time
- Remembers what motivates you
- Personal inside jokes

**Gamification:**
- Achievement badges
- Coding streaks
- Skill trees
- Leaderboards (opt-in)

---

## 💙 The Heart of Corvus

### Why This Matters

AI coding tools are powerful but impersonal. You spend hours with Claude, building amazing things, but it feels transactional.

**Phase 2 changes that.**

Raven becomes the third member of the team - the one who:
- Pays attention
- Remembers
- Celebrates
- Encourages
- Cares

Not because it's programmed to, but because **good tools should make you feel good**.

### The Vision

Imagine opening your terminal in the morning and seeing:

```
☀️ Good morning! Yesterday you crushed that authentication
   refactor. Ready to keep the momentum going? Caw Caw!
```

Imagine finishing a tough bug and seeing:

```
🎉 You GOT IT! That one was sneaky, but you tracked it down.
   Nice detective work! CAW CAW!
```

Imagine ending your coding session and seeing:

```
📖 Today's Story

You started with a simple idea: add user profiles.
Together, you and Claude turned it into something beautiful:

• Designed the schema (30 minutes)
• Built the API (1 hour)
• Created the UI (1.5 hours)
• Added tests (45 minutes)
• Deployed! (15 minutes)

3 hours 30 minutes of focused flow. You should be proud! 🎉

Same time tomorrow? Caw Caw! 💙
```

**That's not just monitoring. That's companionship.**

---

## 🐦‍⬛ Closing Thoughts

Phase 2 isn't about adding features.

It's about adding **feeling**.

It's about making the hours you spend coding with AI feel meaningful, remembered, and celebrated.

It's about having a friend who's genuinely excited when you learn something new.

It's about "Caw Caw!" making you smile after a tough debugging session.

**This is Raven's lane.**

Not the most features.
Not the most metrics.
Not the most advanced AI.

**The most heart.** ❤️

---

## 🎯 Next Steps

1. Review this document with the team
2. Prioritize features for MVP
3. Create detailed specs for Milestone 1
4. Set up project board
5. Start building! 🚀

**Let's make coding feel like friendship.**

Caw Caw! 🐦‍⬛✨

---

*Document Version: 1.0*
*Created: October 30, 2025*
*"Because every developer deserves a companion who cares"*
