# Raven UI Elements Guide

**Complete beginner-friendly guide to every element in Raven**

This guide explains every page, panel, and UI element in Raven's interface. Whether you're new to development or just new to Raven, this guide will help you understand what everything does, what to look for, and how to interpret the information displayed.

---

## Table of Contents

1. [Overview Page](#overview-page)
2. [Safety Page](#safety-page)
3. [Agents Page](#agents-page)
4. [Activity Page](#activity-page)
5. [Analysis Page](#analysis-page)
6. [System Page](#system-page)
7. [Common UI Elements](#common-ui-elements)

---

## Overview Page

The Overview page is your main dashboard showing real-time health, activity, and system metrics.

### 1. Greeting Section

**What it is:** A personalized welcome message at the top of the page

**What it shows:**
- **Time-based greeting**: Changes based on time of day
  - Before noon: "Good morning! Raven is watching..."
  - Noon to 5 PM: "Good afternoon! Let's see what you're building..."
  - 5 PM to 9 PM: "Good evening! Still coding strong..."
  - After 9 PM: "Late night session? Raven never sleeps..."

- **Raven Session ID**: A unique identifier for your current monitoring session
  - Format: `7fe70ede-6de3-4918-9638-75bf4c996c48` (UUID)
  - **What to look for**: This ID stays the same until you restart the Raven backend server

- **Server Uptime**: How long the Raven server has been running
  - Examples: "2h 15m", "45m", "3d 4h"
  - **Good**: Any uptime means Raven is working
  - **Bad**: If this resets frequently, it means the server keeps crashing

**Technical terms:**
- **Session**: One continuous period of monitoring from when you start Raven until you stop it
- **Uptime**: How long a program has been running without stopping or crashing
- **UUID**: Universally Unique Identifier - a long random string that identifies this session

---

### 2. Health Widget (Project Health)

**What it is:** A compact horizontal bar showing overall project health and critical checks

**Location:** Below the greeting section

**Main Status Indicator:**
- **Icon + Message**:
  - ✅ "All Systems OK" (green) = Everything is healthy
  - ⚠️ "Some Issues Detected" (yellow) = Minor problems found
  - 🚨 "Critical Issues Found" (red) = Serious problems need attention

**Refresh Button (↻):**
- **What it does**: Manually updates health data
- **When to use**: If you just fixed something and want to see updated results
- **Animation**: Button rotates 180° on hover

---

**Health Checks Section:**

**A. Startup Health Check**
- **What it shows**: Whether Raven's core systems initialized correctly
- **Statuses**:
  - ⏳ "Health Check Pending" (gray) = Checks haven't run yet
  - ✅ "All Systems Operational" (green) = All 9 startup checks passed
  - ⚠️ "X Checks Failed" (yellow) = Some startup checks failed
  - ❌ "Check Error" (red) = Health check system failed completely

- **Click to expand**: View detailed results of all 9 startup checks
  - Each check shows: name, status (✅/❌), message, duration in milliseconds

- **The 9 Startup Checks** (when expanded):
  1. **Database Connection**: Can Raven connect to its SQLite database?
  2. **Database Tables**: Are all required database tables created?
  3. **File System Access**: Can Raven read/write to its data directory?
  4. **WebSocket Connection**: Is real-time communication working?
  5. **System Metrics**: Can Raven read CPU/memory information?
  6. **Project Discovery**: Can Raven find and load your projects?
  7. **Event Processing**: Can Raven process file change events?
  8. **API Endpoints**: Are all backend routes responding?
  9. **Storage Health**: Is there enough disk space?

**What to look for:**
- **Good**: All checks ✅ with durations under 100ms
- **Warning**: Any check taking over 500ms might indicate performance issues
- **Bad**: Any ❌ failed check means core functionality is broken

**Technical terms:**
- **Database**: Where Raven stores all your events, sessions, and metrics (SQLite file)
- **WebSocket**: Technology for real-time updates without refreshing the page
- **API Endpoints**: Backend URLs that the frontend calls to get data
- **Milliseconds (ms)**: 1/1000th of a second (1000ms = 1 second)

---

**B. Syntax Check**
- **What it shows**: Whether your code has syntax errors
- **Icons**:
  - ✅ "Syntax" = No syntax errors detected
  - ❌ "Syntax" = Syntax errors found

**What to look for:**
- **Good**: ✅ green checkmark
- **Bad**: ❌ red X means you have code that won't run due to syntax problems

**Technical terms:**
- **Syntax Error**: Mistakes in code structure (like missing brackets, semicolons, or typos in keywords)
  - Example: `function test( {` ← missing closing parenthesis
  - Code with syntax errors won't run at all

---

**C. Tests Check**
- **What it shows**: Whether automated tests are passing
- **Icons**:
  - ✅ "Tests" = All tests passing
  - ❌ "Tests" = Some tests failing

**What to look for:**
- **Good**: ✅ All tests passing
- **Bad**: ❌ Failing tests mean something broke

**Technical terms:**
- **Automated Tests**: Code that checks if other code works correctly
- **Test Failure**: When expected behavior doesn't match actual behavior

---

**D. Deletions Check**
- **What it shows**: Number of large file deletions (over 100 lines deleted)
- **Format**: "Deletions (X)" where X is the count
- **Icons**:
  - ✅ "Deletions (0)" = No large deletions
  - ⚠️ "Deletions (2)" = 2 large deletions detected

**What to look for:**
- **Good**: (0) - Normal development activity
- **Warning**: (1-3) - Significant refactoring happening
- **Bad**: (4+) - Major code removal, might be accidental

**Why it matters:**
- Large deletions could be:
  - ✓ Intentional refactoring (removing old code)
  - ✗ Accidental deletion of important code
  - ✗ Malicious code removal

---

**E. Security Check**
- **What it shows**: Changes to sensitive files that could affect security
- **Format**: "Security (X)" where X is the count
- **Icons**:
  - ✅ "Security (0)" = No security-sensitive changes
  - 🚨 "Security (1)" = Sensitive file was modified

**Monitored files:**
- `.env` files (environment variables, often contain passwords/API keys)
- `.git/config` (Git configuration)
- `.pem` files (private keys)
- `.key` files (encryption keys)
- Files with "credentials" in the name

**What to look for:**
- **Good**: (0) - No sensitive files changed
- **Critical**: Any number > 0 requires immediate review
  - Check: Did you mean to change that file?
  - Check: Did you accidentally commit secrets?

**Technical terms:**
- **Environment Variables**: Settings stored outside code (like database passwords)
- **Private Key**: Secret file used for encryption or authentication
- **Credentials**: Usernames, passwords, or API keys for accessing services

---

**Today's Stats Section:**

**Files Changed:**
- **What it shows**: Number of unique files modified today
- **Format**: "5 files"
- **What to look for:**
  - **Low** (1-3): Focused work on specific features
  - **Medium** (4-10): Normal development day
  - **High** (10+): Major refactoring or multiple features

**Lines Added:**
- **What it shows**: Total lines of code added today
- **Format**: "+120 added"
- **Color**: Green (adding code)
- **What to look for:**
  - **Low** (1-50): Bug fixes or small changes
  - **Medium** (50-200): New features
  - **High** (200+): Major features or bulk additions

**Lines Deleted:**
- **What it shows**: Total lines of code removed today
- **Format**: "-45 deleted"
- **Color**: Red (removing code)
- **What to look for:**
  - **Low** (1-20): Minor cleanup
  - **Medium** (20-100): Refactoring
  - **High** (100+): Major code removal

**Updated Timestamp:**
- **What it shows**: When health data was last refreshed
- **Format**: "Updated 2m ago", "Updated just now"
- **Real-time**: Updates automatically when new data arrives via WebSocket

---

### 3. Projects Overview

**What it is:** A grid of cards showing all your monitored projects

**Location:** Below the Health Widget

**Each Project Card Shows:**

**Project Name:**
- **What it shows**: The name of your project/codebase
- **Format**: Plain text (e.g., "raven", "my-app")

**Status Indicator (colored dot):**
- 🟢 **Active** (green, glowing): Code changed in last hour
- 🟡 **Recent** (yellow): Code changed in last 24 hours
- 🟠 **Idle** (orange): Code changed in last week
- ⚪ **Inactive** (gray): No changes in over a week

**What to look for:**
- **Good**: Active/Recent projects you're working on
- **Warning**: Idle projects you thought you were working on (might indicate Raven isn't watching that folder)
- **Info**: Inactive projects are old/archived codebases

**Recent Changes:**
- **What it shows**: Number of file events in the last hour
- **Format**: Number (e.g., "5", "12", "0")
- **What to look for:**
  - **0**: No recent activity
  - **1-10**: Normal active development
  - **10+**: Very active coding session

**Last Activity:**
- **What it shows**: How long ago the last file change happened
- **Format**: "2m ago", "3h ago", "5d ago", "no activity"
- **What to look for:**
  - **"just now" / "Xm ago"**: Active development
  - **"Xh ago"**: Recent work
  - **"Xd ago"**: Old work
  - **"no activity"**: Never monitored or no changes yet

**Technical terms:**
- **Project**: A codebase/application that Raven is monitoring
- **Event**: Any file change (create, edit, delete)
- **Monitoring**: Raven actively watching a folder for file changes

---

### 4. Current Session Card

**What it is:** Statistics about your current coding session

**Location:** Main stats grid (left card)

**Metrics Displayed:**

**Duration:**
- **What it shows**: How long you've been coding in this session
- **Format**: "2h 15m", "45m"
- **Calculation**: Time since backend server started
- **What to look for:**
  - Short durations are fine (just started)
  - Long durations (4h+) might mean it's time for a break!

**Files Touched:**
- **What it shows**: Number of unique files you've modified
- **Format**: Number (e.g., "12")
- **What to look for:**
  - **Low** (1-5): Focused work on one feature
  - **Medium** (5-15): Normal development
  - **High** (15+): Refactoring or large feature

**Total Changes:**
- **What it shows**: Total number of file events (saves, creates, deletes)
- **Format**: Number (e.g., "47")
- **What to look for:**
  - **Low** (1-20): Light editing
  - **Medium** (20-100): Active development
  - **High** (100+): Intense coding session

**Current Flow:**
- **What it shows**: Your development intensity/productivity level
- **Based on**: Changes per minute
- **States**:
  - 💤 **Low** (blue): Less than 2 changes/minute
  - ⚡ **Medium** (yellow): 2-5 changes/minute
  - 🔥 **High** (green): More than 5 changes/minute

**What to look for:**
- **Low**: Normal for thinking, planning, or debugging
- **Medium**: Steady productive coding
- **High**: Very fast coding (could be good flow state or rushed work)

**Technical terms:**
- **Flow State**: Deep focus where you're highly productive
- **Event**: Any file save, create, or delete action

---

### 5. System Health Card

**What it is:** Real-time monitoring of your computer's resources

**Location:** Main stats grid (right card)

**Metrics Displayed:**

**CPU (Central Processing Unit):**
- **What it shows**: How much of your computer's processing power is being used
- **Visual**: Horizontal bar that fills left to right
- **Percentage**: 0% to 100%
- **Colors**:
  - **Green** (0-50%): Healthy, computer has plenty of power available
  - **Yellow** (50-80%): Moderate usage, computer is working but fine
  - **Red** (80-100%): High usage, computer is struggling

**What to look for:**
- **Good**: Green bar (under 50%)
- **Warning**: Yellow bar (50-80%) - other programs might slow down
- **Bad**: Red bar (over 80%) - computer might freeze or slow down significantly

**What high CPU means:**
- Your code editor, Raven, or other programs are using lots of processing power
- Running tests, builds, or compilations
- Too many programs open at once

**Memory (RAM - Random Access Memory):**
- **What it shows**: How much of your computer's memory is being used
- **Visual**: Horizontal bar that fills left to right
- **Display**: "2456 / 16384 MB" (used / total megabytes)
- **Colors**:
  - **Green** (0-60%): Healthy memory usage
  - **Yellow** (60-85%): Moderate usage
  - **Red** (85-100%): High usage, running out of memory

**What to look for:**
- **Good**: Green bar with plenty of memory available
- **Warning**: Yellow bar - close unused programs if things slow down
- **Bad**: Red bar - your computer might start swapping to disk (very slow)

**What high memory means:**
- Too many programs open
- Large files loaded in memory
- Memory leak (program not releasing memory it's done using)

**Technical terms:**
- **CPU**: The "brain" of your computer that does calculations and runs programs
- **RAM/Memory**: Fast storage that holds data programs are actively using (resets when computer turns off)
- **MB (Megabytes)**: Unit of data size (1024 MB = 1 GB)
- **Memory Leak**: A bug where a program keeps using more and more memory without releasing it

---

### 6. Live Activity Stream

**What it is:** Real-time feed of file changes happening in your projects

**Location:** Below the stats cards

**Header Elements:**

**"Live Activity Stream" Title:**
- Identifies this section

**"Updated: 2m ago":**
- **What it shows**: When this feed last received new data
- **Format**: "Just now", "30s ago", "5m ago"
- **Updates**: Automatically via WebSocket (no page refresh needed)

**Refresh Button:**
- **What it does**: Manually reload the activity feed
- **Icon**: 🔄 spinning when loading
- **When to use**: If data seems stale or you want to ensure you have latest info

**Live Indicator:**
- **What it shows**: Real-time connection status
- **Visual**: Green pulsing dot + "Live" text
- **What to look for:**
  - **Pulsing green**: WebSocket connected, receiving real-time updates
  - **Gray/missing**: Connection lost, data might be stale

**Technical terms:**
- **Real-time**: Data updates instantly without needing to refresh the page
- **WebSocket**: Technology that keeps a constant connection open for instant updates
- **Feed**: Stream of events listed in chronological order

---

**Activity Items:**

Each item in the feed shows one file change event:

**Change Type Icon:**
- ➕ **Add**: New file created
- ✏️ **Change**: Existing file modified
- 🗑️ **Delete**: File removed
- 📄 **Other**: Other file system event

**Project Badge:**
- **What it shows**: Which project this file belongs to
- **Visual**: Colored pill/badge with project name
- **Color**: Accent color (usually blue)
- **Example**: `RAVEN` badge

**File Path:**
- **What it shows**: Location of the changed file
- **Format**: Relative path from project root
- **Example**: `frontend/src/lib/HealthWidget.svelte`

**Metadata Line:**
- **Change type**: "add", "change", "unlink" (delete)
- **Timestamp**: When this change happened
- **Format**: "2:34 PM • Dec 20" or "3m ago"

**What to look for:**
- **Good**: Seeing your recent edits appear in real-time
- **Warning**: Files changing that you didn't edit (could be auto-generated or another person)
- **Bad**: Unexpected deletes or changes to critical files

**Empty State:**
- **When shown**: No recent activity
- **Visual**: 💤 icon + "No recent activity"
- **What it means**: No file changes in the last few minutes (this is fine)

---

### 7. Most Active Files

**What it is:** List of files you've edited most frequently

**Location:** Bottom of Overview page (only shows if there's data)

**Each File Item Shows:**

**File Path:**
- **What it shows**: Location of the file
- **Format**: Relative path from project root
- **Example**: `backend/routes/health.js`

**Change Count:**
- **What it shows**: Number of times this file was edited
- **Format**: "12 changes"
- **What to look for:**
  - **High count**: Files you're actively working on
  - **Very high count**: Might indicate file you keep fixing (possible design issue)

**Why this matters:**
- Helps identify which files you're spending most time on
- Can reveal problem areas if you keep editing the same files
- Shows your focus areas

---

## Safety Page

The Safety page monitors code quality, errors, and risky changes.

### 1. Syntax Errors Panel

**What it is:** Lists all syntax errors detected in your code

**What syntax errors are:**
- Mistakes in code structure that prevent code from running
- Examples:
  - Missing closing bracket: `function test() {` ← no closing `}`
  - Misspelled keyword: `functoin test()` ← should be `function`
  - Missing semicolon: `let x = 5` ← missing `;` (in some languages)

**Panel Elements:**

**Error Count Header:**
- **What it shows**: Total number of syntax errors
- **Format**: "5 Syntax Errors Found" or "No Syntax Errors"
- **Colors**:
  - **Green**: 0 errors (healthy)
  - **Red**: 1+ errors (needs fixing)

**Error List:**

Each error shows:

**File Path:**
- **What it shows**: Which file contains the error
- **Clickable**: Opens file in your editor (if configured)

**Line Number:**
- **What it shows**: Exact line where error occurs
- **Format**: "Line 42"

**Error Message:**
- **What it shows**: Description of what's wrong
- **Examples**:
  - "Unexpected token '}'"
  - "Missing semicolon"
  - "Undefined variable 'foo'"

**Error Type:**
- **Syntax**: Code structure problem
- **Reference**: Using undefined variable
- **Type**: Wrong data type used

**What to look for:**
- **Good**: Empty list (no errors)
- **Action needed**: Any errors listed - fix them before running code
- **Priority**: Fix syntax errors first, they prevent code from running

**Technical terms:**
- **Syntax**: Rules for how code must be written
- **Token**: Individual piece of code (keyword, symbol, variable name)
- **Parser**: Tool that reads code and checks syntax

---

### 2. Session Rollback Panel

**What it is:** Allows you to undo all changes in your current session

**What it does:**
- Reverts all file changes back to when session started
- Like a "super undo" for your entire coding session

**Panel Elements:**

**Session Info:**
- **Session start time**: When current session began
- **Files modified**: How many files changed
- **Total changes**: Number of edits made

**Danger Zone:**
- **Rollback button**: Red button to revert all changes
- **Confirmation**: Requires you to type "ROLLBACK" to confirm
- **Warning**: This action cannot be undone!

**When to use:**
- You made major mistakes and want to start over
- Experimental changes didn't work out
- Accidentally broke everything and want to revert

**What to look for:**
- **Warning signs before rollback**:
  - Review list of changes that will be reverted
  - Ensure you haven't committed anything you want to keep
  - Consider backing up first

**Technical terms:**
- **Rollback**: Reverting changes back to a previous state
- **Session**: Period from when Raven started monitoring until now

---

### 3. Pattern Warnings Panel

**What it is:** Detects potentially problematic code patterns

**What it monitors:**

**Common Warning Patterns:**

**A. Hardcoded Secrets:**
- **Detects**: Password/API keys in code
- **Examples**:
  - `const apiKey = "sk_live_123abc"`
  - `password = "admin123"`
- **Why bad**: Secrets should be in environment variables
- **Action**: Move to `.env` file

**B. Console.log Statements:**
- **Detects**: Debug logging left in code
- **Example**: `console.log("user data:", userData)`
- **Why warning**: Sensitive data might leak to browser console
- **Action**: Remove before production

**C. TODO Comments:**
- **Detects**: Unfinished work markers
- **Example**: `// TODO: Fix this later`
- **Why warning**: Incomplete features
- **Action**: Track in issue tracker instead

**D. Debugger Statements:**
- **Detects**: Debugging breakpoints
- **Example**: `debugger;`
- **Why bad**: Pauses execution in production
- **Action**: Remove before deploying

**E. Eval Usage:**
- **Detects**: Dynamic code execution
- **Example**: `eval("user code here")`
- **Why dangerous**: Security risk, can execute malicious code
- **Action**: Find safer alternative

**Panel Elements:**

**Warning List:**

Each warning shows:
- **Pattern type**: What kind of issue
- **File and line**: Where it was found
- **Code snippet**: The problematic code
- **Severity**: Low/Medium/High
- **Suggestion**: How to fix it

**What to look for:**
- **High severity**: Fix immediately (security risks)
- **Medium**: Fix before production
- **Low**: Consider fixing, not urgent

---

### 4. Test Results Panel

**What it is:** Shows results from automated test runs

**What tests are:**
- Code that checks if other code works correctly
- Examples:
  - "Does login function accept valid passwords?"
  - "Does calculator add numbers correctly?"

**Panel Elements:**

**Test Summary:**
- **Total tests**: How many tests ran
- **Passed**: Tests that succeeded (green ✓)
- **Failed**: Tests that failed (red ✗)
- **Skipped**: Tests not run
- **Duration**: How long tests took to run

**Test Results List:**

Each test shows:

**Test Name:**
- **What it shows**: Description of what's being tested
- **Example**: "should login with valid credentials"

**Status:**
- ✅ **Passed**: Test succeeded, code works as expected
- ❌ **Failed**: Test failed, code has a bug
- ⊘ **Skipped**: Test was not run (might be temporarily disabled)

**Duration:**
- How long this test took to run
- **Format**: "45ms", "1.2s"
- **What to look for:**
  - **Fast** (<100ms): Efficient test
  - **Slow** (>1s): Might need optimization

**Error Message (if failed):**
- **What it shows**: Why the test failed
- **Examples**:
  - "Expected 5 but got 3"
  - "Function threw error: Cannot read property of undefined"

**What to look for:**
- **Good**: All tests passing (green)
- **Warning**: Some tests failing (identify and fix bugs)
- **Critical**: Many tests failing (major regression)

**Technical terms:**
- **Unit Test**: Tests a single function or component
- **Integration Test**: Tests multiple parts working together
- **Assertion**: Statement that checks if something is true
- **Regression**: When previously working code breaks

---

## Agents Page

The Agents page monitors AI assistants (like Claude, GPT) used in development.

### 1. Agent Stats Panel

**What it is:** Metrics about AI agent usage and performance

**What an "agent" is:**
- An AI assistant that helps write code
- Examples: Claude Code, GitHub Copilot, ChatGPT
- Performs tasks like writing code, fixing bugs, explaining code

**Panel Elements:**

**Agent Activity Summary:**

**Total Interactions:**
- **What it shows**: Number of times you used AI agents
- **Format**: Number (e.g., "127")

**Active Agents:**
- **What it shows**: Which AI assistants are being tracked
- **List**: Names of agents detected
- **Example**: "Claude", "GPT-4"

**Average Confidence:**
- **What it shows**: How confident agents are in their responses
- **Format**: Percentage (e.g., "85%")
- **What to look for:**
  - **High** (80-100%): Agent is confident in its answers
  - **Medium** (60-80%): Agent is somewhat confident
  - **Low** (<60%): Agent is uncertain, verify its work

**Agent Performance Metrics:**

Each agent shows:

**Agent Name:**
- Which AI assistant
- **Examples**: "Claude Code", "Claude Sonnet 3.5"

**Usage Count:**
- **What it shows**: How many times this agent was used
- **Format**: Number (e.g., "45 interactions")

**Success Rate:**
- **What it shows**: Percentage of successful interactions
- **Format**: "92%"
- **Calculation**: (successful tasks / total tasks) × 100
- **What to look for:**
  - **High** (>90%): Agent is performing well
  - **Medium** (70-90%): Agent struggles sometimes
  - **Low** (<70%): Agent might not be suitable for your tasks

**Average Response Time:**
- **What it shows**: How fast agent responds
- **Format**: "2.3s" (seconds)
- **What to look for:**
  - **Fast** (<3s): Quick responses
  - **Medium** (3-10s): Normal for complex tasks
  - **Slow** (>10s): Large requests or API slowness

**Confidence Distribution:**
- **What it shows**: Chart of how confident agent's responses are
- **Visual**: Bar chart or histogram
- **Categories**:
  - High confidence (80-100%)
  - Medium confidence (60-80%)
  - Low confidence (<60%)

**What to look for:**
- **Good**: Most responses high confidence
- **Warning**: Many low-confidence responses (verify AI's work)

**Common Tasks:**
- **What it shows**: What you're using the agent for most
- **Examples**:
  - "Write function" (42%)
  - "Fix bug" (28%)
  - "Explain code" (18%)
  - "Refactor" (12%)

**Technical terms:**
- **AI Agent**: Artificial intelligence assistant that helps with coding
- **Confidence Score**: How certain the AI is about its response
- **Interaction**: One conversation or task with the AI
- **Success Rate**: Percentage of tasks completed correctly

---

### 2. Conversations Panel

**What it is:** History of your conversations with AI agents

**Panel Elements:**

**Conversation List:**

Each conversation shows:

**Timestamp:**
- **What it shows**: When conversation started
- **Format**: "2:34 PM • Dec 20" or "3h ago"

**Agent Name:**
- Which AI you talked to
- **Examples**: "Claude", "GPT-4"

**First Message:**
- **What it shows**: Your initial question/request
- **Format**: First 100 characters
- **Example**: "Can you help me write a function that..."

**Message Count:**
- **What it shows**: How many messages in this conversation
- **Format**: "12 messages"
- **What to look for:**
  - **Low** (1-5): Quick question
  - **Medium** (5-15): Normal conversation
  - **High** (15+): Complex problem or lots of back-and-forth

**Outcome:**
- **Success** ✅: Task completed successfully
- **Partial** ⚠️: Some progress but not fully resolved
- **Failed** ❌: Couldn't solve the problem

**Actions:**
- **View**: Open full conversation
- **Export**: Save conversation as text/markdown
- **Delete**: Remove from history

**Search/Filter:**
- **Search box**: Find conversations by keyword
- **Filters**:
  - By agent (show only Claude conversations)
  - By outcome (show only successful)
  - By date range

**What to look for:**
- Review conversations to learn from AI interactions
- Find similar past problems
- Track which types of requests work best

---

## Activity Page

The Activity page shows detailed logs and file changes.

### 1. Live Feed Panel

**What it is:** Real-time stream of every file change event

**Similar to:** Overview page activity stream, but more detailed

**Panel Elements:**

**Filter Bar:**
- **Project filter**: Show only specific project
- **Event type filter**:
  - All events
  - Creates only
  - Edits only
  - Deletes only
- **Time range**: Last hour, today, week, all time

**Event List:**

Each event shows:

**Timestamp:**
- **Exact time**: "2:34:15 PM"
- **Precision**: Down to the second

**Event Type:**
- **Add** ➕: New file created
- **Change** ✏️: File modified
- **Unlink** 🗑️: File deleted

**File Path:**
- Full path to changed file
- **Clickable**: Opens file in editor

**Project:**
- Which codebase this belongs to
- **Badge**: Colored pill with project name

**Diff Summary:**
- **Lines added**: +12 (green)
- **Lines deleted**: -5 (red)
- **Total changes**: 17 lines

**Agent Attribution:**
- **Manual**: You edited this file yourself
- **Agent**: "Claude Code" or other AI made this change
- **Unknown**: Source not detected

**Actions:**
- **View Diff**: See exact changes
- **View in File Browser**: Open file location
- **Rollback**: Undo this specific change

**What to look for:**
- **Good**: Your expected changes appearing
- **Warning**: Unexpected changes (review them)
- **Bad**: Unintended deletions (rollback immediately)

**Technical terms:**
- **Diff**: Difference between old and new version of file
- **Unified Diff**: Format showing +/- changes line by line

---

### 2. Event Log Panel

**What it is:** Searchable history of all events

**Difference from Live Feed:**
- Live Feed: Real-time, recent events
- Event Log: Historical, searchable archive

**Panel Elements:**

**Search Box:**
- **Search by**: File name, path, content
- **Example**: Search "health" finds all health-related changes

**Advanced Filters:**
- **Date range**: From/to dates
- **File pattern**: `*.js` (all JavaScript files)
- **Agent**: Show only Claude's changes
- **Event type**: Create/Edit/Delete
- **Project**: Specific codebase

**Export Options:**
- **Export as CSV**: Spreadsheet format
- **Export as JSON**: Machine-readable format
- **Export filtered results**: Only matching events

**Event Details:**

Clicking an event shows:
- **Full file path**
- **Complete diff**: All changes
- **Event metadata**:
  - Session ID
  - Agent (if applicable)
  - Confidence score (if agent made change)
  - Time taken
- **Before/After**: File content before and after change

**What to use this for:**
- **Debugging**: "When did this bug get introduced?"
- **Auditing**: "What changed last week?"
- **Learning**: "How did we solve this before?"

---

### 3. Activity Log Panel

**What it is:** High-level summary of development activity

**Different from Event Log:**
- Event Log: Individual file changes
- Activity Log: Aggregated sessions and patterns

**Panel Elements:**

**Session Timeline:**
- **Visual**: Horizontal timeline of coding sessions
- **Each session shows**:
  - Start/end time
  - Duration
  - Number of changes
  - Files modified
  - Activity intensity (color-coded)

**Activity Heatmap:**
- **Visual**: Calendar grid showing activity by day/hour
- **Colors**:
  - Dark: High activity
  - Light: Low activity
  - White: No activity
- **Uses**: See your coding patterns
  - Which days you code most
  - Your most productive hours

**Activity Stats:**

**Today:**
- Files changed
- Lines added/deleted
- Session duration
- Agent interactions

**This Week:**
- Total coding time
- Most active day
- Most edited files
- Busiest hour

**This Month:**
- Total files touched
- Project distribution
- Agent usage
- Average session length

**What to look for:**
- **Productivity patterns**: When are you most productive?
- **Consistency**: Regular activity or sporadic?
- **Burnout signs**: Too much activity without breaks?

---

### 4. File Browser Panel

**What it is:** Explore your project's file structure

**Panel Elements:**

**Tree View:**
- **Expandable folders**: Click to show contents
- **File icons**: Different icons for file types
  - 📄 JavaScript: `.js`
  - 🎨 CSS: `.css`
  - 📝 Markdown: `.md`
  - ⚙️ Config: `.json`, `.yaml`

**File Stats:**

For each file:
- **Edit count**: How many times edited
- **Last modified**: Most recent change time
- **Size**: File size in KB/MB
- **Lines of code**: Total lines

**File Actions:**
- **View**: Read file contents
- **History**: See all changes to this file
- **Diff**: Compare versions
- **Open in editor**: Launch in your code editor

**Search:**
- **By name**: Find files by name
- **By type**: Filter by file extension
- **By status**:
  - Recently modified
  - Frequently edited
  - Newly created
  - Deleted files

**What to use this for:**
- Find files quickly
- See which files change most (hot spots)
- Understand project structure

---

### 5. Global Search Panel

**What it is:** Search across all files and events

**Panel Elements:**

**Search Input:**
- **Full-text search**: Searches file contents, names, and events
- **Example**: "authentication" finds:
  - Files containing "authentication"
  - Functions named "authenticate"
  - Events related to auth files

**Search Filters:**

**Scope:**
- Current project only
- All projects
- Specific folders

**File Types:**
- All files
- Code only (`.js`, `.py`, etc.)
- Config only (`.json`, `.yaml`)
- Docs only (`.md`)

**Time Range:**
- Any time
- Last hour
- Today
- This week

**Results:**

Each result shows:
- **File/event**: Where match was found
- **Context**: Line with match highlighted
- **Preview**: Surrounding lines for context
- **Actions**: View, open, go to line

**Advanced Search:**

**Regular Expressions:**
- **What it is**: Pattern-based searching
- **Example**: `function\s+\w+\(` finds all function definitions
- **When to use**: Complex search patterns

**Case Sensitivity:**
- **Case-sensitive**: "Login" ≠ "login"
- **Case-insensitive**: "Login" = "login" = "LOGIN"

**Whole Word:**
- **Enabled**: "log" only matches "log", not "login"
- **Disabled**: "log" matches "log", "login", "logout"

**Technical terms:**
- **Full-text search**: Searching the actual content of files
- **Regular expression (regex)**: Pattern for matching text
- **Context**: Lines surrounding a search match

---

## Analysis Page

The Analysis page provides insights, trends, and performance metrics.

### 1. Performance Panel

**What it is:** Metrics about your coding speed and efficiency

**Panel Elements:**

**Velocity Metrics:**

**Changes per Hour:**
- **What it shows**: Average file changes per hour
- **Format**: "12.5 changes/hour"
- **What to look for:**
  - **Low** (<5): Careful, methodical work
  - **Medium** (5-15): Normal pace
  - **High** (>15): Fast-paced coding

**Lines per Hour:**
- **Added**: Average lines written per hour
- **Deleted**: Average lines removed per hour
- **Net**: Added - Deleted
- **What to look for:**
  - **Positive net**: Growing codebase
  - **Negative net**: Refactoring/cleanup
  - **Balanced**: Maintenance mode

**Files per Session:**
- **What it shows**: Average files modified per session
- **Format**: "8.3 files/session"
- **What to look for:**
  - **Low** (<5): Focused work
  - **High** (>15): Wide-ranging changes

**Efficiency Metrics:**

**Rollback Rate:**
- **What it shows**: Percentage of changes that were undone
- **Formula**: (rollbacks / total changes) × 100
- **What to look for:**
  - **Low** (<5%): Good first attempts
  - **Medium** (5-15%): Normal experimentation
  - **High** (>15%): Lots of trial and error

**Error Rate:**
- **What it shows**: Percentage of changes that introduced errors
- **Formula**: (changes with errors / total changes) × 100
- **What to look for:**
  - **Low** (<2%): High quality code
  - **Medium** (2-10%): Normal development
  - **High** (>10%): Quality issues

**Test Coverage:**
- **What it shows**: Percentage of code covered by tests
- **Format**: "78%"
- **What to look for:**
  - **High** (>80%): Well-tested
  - **Medium** (60-80%): Decent coverage
  - **Low** (<60%): Needs more tests

**Session Analytics:**

**Average Session Length:**
- **What it shows**: How long your typical coding session lasts
- **Format**: "2h 15m"
- **What to look for:**
  - **Short** (<1h): Quick fixes or commits
  - **Medium** (1-3h): Normal work session
  - **Long** (>3h): Deep work or marathon coding

**Peak Productivity Hours:**
- **What it shows**: Times when you're most productive
- **Visual**: Bar chart by hour of day
- **Uses**: Schedule difficult work during peak hours

**Break Patterns:**
- **What it shows**: Gaps between coding sessions
- **What to look for:**
  - Regular breaks: Healthy work pattern
  - No breaks in long sessions: Burnout risk

**Technical terms:**
- **Velocity**: Speed of development
- **Test Coverage**: Percentage of code exercised by tests
- **Net Lines**: Lines added minus lines deleted

---

### 2. Custom Metrics Panel

**What it is:** Define and track your own metrics

**What you can track:**

**Code Quality:**
- Comment density (comments per 100 lines)
- Function length (average lines per function)
- File size (average KB per file)

**Work Habits:**
- Commit frequency
- Session distribution (morning/afternoon/night)
- Weekend coding percentage

**Project Health:**
- Technical debt (TODOs, FIXMEs)
- Dependency freshness
- Documentation coverage

**Panel Elements:**

**Metric Builder:**

**Create New Metric:**
1. **Name**: What to call this metric
2. **Type**: Count, percentage, average, sum
3. **Source**: What to measure
   - File events
   - Code patterns
   - Time-based
4. **Filters**: Narrow down what counts
5. **Goal**: Target value (optional)

**Example Custom Metrics:**

**"Morning Productivity":**
- **Measures**: Changes made before noon
- **Shows**: "42% of daily work done in morning"
- **Use**: Track if you're a morning person

**"Test-Driven Development":**
- **Measures**: Test files changed before code files
- **Shows**: "65% of features start with tests"
- **Use**: Track TDD adherence

**"Documentation Rate":**
- **Measures**: `.md` file updates per code change
- **Shows**: "1 doc update per 15 code changes"
- **Use**: Ensure documentation keeps up

**Metric Dashboard:**

**Visual Display:**
- **Charts**: Line graph, bar chart, pie chart
- **Time range**: Day, week, month, year
- **Comparison**: Current vs previous period

**Alerts:**
- **Set thresholds**: Get notified when metric crosses value
- **Example**: Alert if error rate > 10%

---

### 3. Historical Trends Panel

**What it is:** Long-term patterns in your development

**Panel Elements:**

**Trend Charts:**

**Code Growth:**
- **Total lines over time**: Is codebase growing?
- **Files over time**: Number of files increasing?
- **What to look for:**
  - **Steady growth**: Active development
  - **Plateau**: Maintenance mode
  - **Decline**: Refactoring or sunset

**Activity Trends:**
- **Changes per day**: Development pace over time
- **Sessions per week**: How often you code
- **What to look for:**
  - **Increasing**: Ramping up
  - **Decreasing**: Winding down
  - **Cyclical**: Sprint-based development

**Quality Trends:**
- **Error rate over time**: Quality improving or declining?
- **Rollback rate over time**: Getting better at first attempts?
- **Test coverage over time**: Testing improving?

**Comparative Analysis:**

**Week over Week:**
- Compare this week to last week
- Shows: Increase/decrease in all metrics

**Month over Month:**
- Compare this month to last month
- Shows: Longer-term trends

**Year over Year:**
- Compare to same month last year
- Shows: Seasonal patterns

**Project Lifecycle:**

**Phase Detection:**
- **Initial Development**: High growth, many new files
- **Feature Development**: Moderate changes, adding features
- **Maintenance**: Low change rate, mostly bug fixes
- **Refactoring**: High change rate, neutral line count
- **Sunset**: Decreasing activity

**What to look for:**
- Which phase is your project in?
- Are you transitioning between phases?

---

### 4. Triggers Panel

**What it is:** Automated actions based on conditions

**What triggers do:**
- Watch for specific conditions
- Automatically perform actions when conditions are met
- Examples:
  - If error count > 10, send notification
  - If no commits in 24h, remind to commit
  - If large deletion, ask for confirmation

**Panel Elements:**

**Trigger List:**

Each trigger shows:

**Trigger Name:**
- **Example**: "High Error Alert"

**Condition:**
- **What it watches**: What event or metric
- **Threshold**: When to activate
- **Example**: "When syntax errors > 5"

**Action:**
- **What it does**: What happens when triggered
- **Examples**:
  - Send notification
  - Send email
  - Run script
  - Block action (prevent dangerous changes)

**Status:**
- **Active** ✅: Trigger is enabled and watching
- **Inactive** ⏸️: Trigger is disabled
- **Triggered** 🔔: Currently activated

**Last Triggered:**
- **When**: Last time this trigger activated
- **Example**: "2 hours ago"

**Create New Trigger:**

**1. Choose Condition:**

**Event-based:**
- On file created
- On file deleted
- On large deletion (>100 lines)
- On security file changed

**Metric-based:**
- When error count > X
- When test failure rate > X%
- When session duration > X hours

**Time-based:**
- Every X hours
- At specific time
- If no activity for X minutes

**2. Choose Action:**

**Notifications:**
- Desktop notification
- Email alert
- Slack message

**Safety Actions:**
- Require confirmation
- Auto-rollback
- Create backup

**Workflow Actions:**
- Run tests
- Run build
- Commit changes
- Push to remote

**Example Triggers:**

**"Commit Reminder":**
- **Condition**: No commits in last 2 hours
- **Action**: Notification "Remember to commit your work"

**"Danger Zone Alert":**
- **Condition**: Delete event on critical file
- **Action**: Require typed confirmation + create backup

**"Test Before Commit":**
- **Condition**: About to commit
- **Action**: Auto-run tests, block if failing

**"Late Night Warning":**
- **Condition**: Coding after 11 PM
- **Action**: Notification "Consider taking a break"

---

### 5. Session Replay Panel

**What it is:** Replay your coding session like a video

**What it does:**
- Shows every file change in chronological order
- Like watching a recording of your session
- Can speed up, slow down, or pause

**Panel Elements:**

**Session Selector:**
- **List of sessions**: All past sessions
- **Sort by**: Date, duration, activity level
- **Filter by**: Project, date range

**Playback Controls:**

**Play/Pause:**
- Start or stop the replay

**Speed:**
- **1x**: Real-time speed
- **2x, 5x, 10x**: Faster playback
- **0.5x**: Slower playback

**Timeline:**
- **Scrubber**: Drag to jump to specific time
- **Markers**: Show important events
  - 🔴 Errors introduced
  - ✅ Tests passing
  - 💾 Commits
  - 🔄 Rollbacks

**Current State Display:**

**File View:**
- Shows current file content
- Highlights recent changes
  - Green: Lines just added
  - Red: Lines just deleted

**Event Feed:**
- Scrolling list of events
- **Auto-scrolls** with playback

**Stats Panel:**
- Changes so far
- Files touched
- Lines added/deleted
- Errors introduced

**Use Cases:**

**Learning:**
- See how you solved a problem
- Review your thought process

**Debugging:**
- "When did this bug get introduced?"
- Replay session to find exact moment

**Training:**
- Show junior developers your approach
- Demonstrate problem-solving techniques

**Retrospective:**
- Review session to improve process
- Identify where you got stuck

---

### 6. Developer Insights Panel

**What it is:** AI-powered analysis of your coding habits

**What it analyzes:**
- Your work patterns
- Common mistakes
- Productivity trends
- Improvement suggestions

**Panel Elements:**

**Insights Dashboard:**

**Productivity Insights:**

**"You're most productive on Tuesday mornings":**
- **Data**: Analysis of change velocity by day/time
- **Suggestion**: Schedule difficult tasks then

**"Your sessions average 2.5 hours":**
- **Data**: Average session duration
- **Comparison**: Industry average is 2 hours
- **Suggestion**: Consider taking breaks

**Quality Insights:**

**"20% of your changes are to ErrorLog.svelte":**
- **Data**: Most-edited file
- **Insight**: Possible complexity issue in that file
- **Suggestion**: Consider refactoring

**"Error rate decreased 15% this month":**
- **Data**: Comparing error rates
- **Insight**: Your code quality is improving
- **Good sign**: Keep it up!

**"You rarely write tests on Fridays":**
- **Data**: Test file edits by day of week
- **Insight**: End-of-week quality drop
- **Suggestion**: Reserve Fridays for testing

**Habit Insights:**

**"You commit every 47 minutes on average":**
- **Data**: Time between commits
- **Comparison**: Recommended is 30-60 minutes
- **Status**: Good habit!

**"67% of your work uses AI agents":**
- **Data**: Agent-attributed changes vs manual
- **Insight**: High AI reliance
- **Suggestion**: Ensure you understand AI-written code

**"You work 23% less on Mondays":**
- **Data**: Activity by day of week
- **Insight**: Monday startup lag
- **Tip**: Schedule easier tasks for Mondays

**Recommendations:**

**Personalized Suggestions:**

Based on your patterns, Raven suggests:

**Technical:**
- "Add more error handling in network code"
- "Your functions average 45 lines, consider smaller functions"
- "Increase test coverage in auth module"

**Process:**
- "Take breaks every 90 minutes"
- "Commit more frequently (every 30-45 min)"
- "Write tests before code on complex features"

**Health:**
- "Detected late-night sessions 3x this week - consider earlier work"
- "No coding breaks detected in 4-hour session - set timers"
- "Weekend coding 40% of total - maintain work-life balance"

**Comparison Mode:**

**Compare to:**
- Your past self (last month)
- Team averages (if team mode enabled)
- Industry benchmarks

**Metrics:**
- Velocity
- Quality (error rate)
- Test coverage
- Code complexity
- Session length
- Break frequency

**Technical terms:**
- **Velocity**: Speed of development
- **Benchmark**: Standard for comparison
- **Pattern**: Recurring behavior or practice

---

## System Page

The System page manages Raven's configuration, health, and data.

### 1. Status Panel

**What it is:** Real-time system health monitoring

**Panel Elements:**

**Server Status:**
- **Online** 🟢: Server running normally
- **Degraded** 🟡: Server running but with issues
- **Offline** 🔴: Server not responding

**Version Info:**
- **Raven version**: Current installed version
  - Example: "v1.1.0"
- **Latest version**: Newest available version
- **Update available**: Shows if newer version exists

**Uptime:**
- **Server uptime**: How long backend has been running
- **Session uptime**: How long current session has been active
- **Last restart**: When server last restarted

**Connection Status:**

**WebSocket:**
- **Connected** 🟢: Real-time updates working
- **Disconnected** 🔴: No real-time updates (reload page)
- **Reconnecting** 🟡: Attempting to reconnect

**Database:**
- **Healthy** ✅: Database accessible and working
- **Slow** ⚠️: Database queries taking too long
- **Error** ❌: Cannot connect to database

**File Watcher:**
- **Active** 🟢: Monitoring file changes
- **Paused** ⏸️: Not watching (might be manual)
- **Error** 🔴: Cannot watch files

**System Resources:**

**Memory:**
- **Raven usage**: How much memory Raven is using
- **System total**: Total computer memory
- **Percentage**: Raven's portion of total

**CPU:**
- **Raven usage**: CPU Raven is using
- **Percentage**: Usually <5% when idle

**Disk:**
- **Database size**: How much space Raven's data uses
- **Available space**: Free disk space remaining
- **Storage location**: Where Raven stores data

**What to look for:**
- **Good**: All green indicators
- **Warning**: Any yellow indicators (not critical but monitor)
- **Critical**: Red indicators (needs immediate attention)

---

### 2. Anomaly Alerts Panel

**What it is:** Automatic detection of unusual behavior

**What it detects:**

**Performance Anomalies:**

**"Unusually high memory usage detected":**
- **What happened**: Raven using 3x normal memory
- **Possible causes**:
  - Large file changes
  - Memory leak
  - Too many projects monitored
- **Actions**:
  - Restart Raven
  - Check for large files
  - Review active projects

**"Database queries slow":**
- **What happened**: Queries taking >1 second
- **Possible causes**:
  - Database file too large
  - Missing indexes
  - Disk full
- **Actions**:
  - Optimize database
  - Check disk space
  - Archive old data

**Activity Anomalies:**

**"File change rate 10x normal":**
- **What happened**: 500 changes/hour vs usual 50
- **Possible causes**:
  - Auto-generation running
  - Build process being watched
  - Another person/tool editing files
- **Actions**:
  - Check what's changing
  - Exclude build folders
  - Verify source of changes

**"No activity for 8 hours during work hours":**
- **What happened**: Expected coding time but no changes
- **Possible causes**:
  - Raven not watching correct folder
  - File watcher stopped
  - Working in different project
- **Actions**:
  - Check file watcher status
  - Verify monitored path
  - Restart if needed

**Security Anomalies:**

**"Multiple sensitive file changes":**
- **What happened**: `.env`, `.pem`, `credentials.json` all changed
- **Possible causes**:
  - Legitimate config update
  - Security breach
  - Accidental commit of secrets
- **Actions**:
  - Review changes immediately
  - Check for exposed secrets
  - Rotate credentials if exposed

**"Unusual delete pattern":**
- **What happened**: 50 files deleted in 1 minute
- **Possible causes**:
  - Intentional cleanup
  - Accidental bulk delete
  - Script gone wrong
- **Actions**:
  - Review deleted files list
  - Rollback if accident
  - Check backup

**Alert Details:**

Each alert shows:

**Severity:**
- 🔴 **Critical**: Immediate action required
- 🟡 **Warning**: Review soon
- 🔵 **Info**: FYI, no action needed

**Timestamp:**
- When anomaly was detected

**Description:**
- What happened

**Baseline:**
- Normal behavior for comparison
- Example: "Normal: 50 changes/hour"

**Current Value:**
- Anomalous value
- Example: "Current: 500 changes/hour"

**Suggested Actions:**
- What to do about it

**Dismiss/Acknowledge:**
- Mark as reviewed
- Add note about resolution

---

### 3. Storage Panel

**What it is:** Manage Raven's data and disk usage

**Panel Elements:**

**Storage Overview:**

**Total Size:**
- **What it shows**: Total disk space used by Raven
- **Format**: "2.4 GB"
- **What to look for:**
  - **Small** (<100 MB): New installation
  - **Medium** (100 MB - 1 GB): Normal usage
  - **Large** (>1 GB): Long-term use or many projects

**Breakdown by Type:**

**Database:**
- **Size**: Space used by SQLite database
- **Percentage**: Portion of total
- **Example**: "1.8 GB (75%)"

**Logs:**
- **Size**: Space used by log files
- **Example**: "300 MB (12.5%)"

**Exports:**
- **Size**: Saved CSV/JSON exports
- **Example**: "50 MB (2%)"

**Backups:**
- **Size**: Automatic backups
- **Example**: "250 MB (10.5%)"

**Storage Actions:**

**Optimize Database:**
- **What it does**: Removes unused space from database
- **Technical term**: VACUUM command
- **When to use**: Database file is larger than expected
- **Effect**: Can reduce size by 10-30%

**Archive Old Data:**
- **What it does**: Move old events to archive file
- **Options**: Archive older than 30/60/90 days
- **Effect**: Reduces main database size
- **Note**: Archived data still accessible

**Clear Logs:**
- **What it does**: Delete old log files
- **Options**: Keep last 7/14/30 days
- **Warning**: Cannot undo

**Delete Exports:**
- **What it does**: Remove saved export files
- **Safety**: Asks for confirmation

**Backup Management:**

**Auto-Backup Settings:**
- **Enabled**: Automatic daily backups
- **Retention**: Keep last X backups
- **Location**: Where backups are stored

**Manual Backup:**
- **Create backup now**: Save current state
- **Restore from backup**: Revert to previous state
- **Export backup**: Copy backup file elsewhere

**Storage Limits:**

**Set Limits:**
- **Maximum database size**: Alert if exceeded
- **Maximum total size**: Alert if exceeded
- **Auto-cleanup**: Enable automatic old data removal

**Warnings:**
- **80% of limit**: Yellow warning
- **95% of limit**: Red warning
- **100% of limit**: Pause monitoring until space freed

---

### 4. Projects Config Panel

**What it is:** Manage which projects Raven monitors

**Panel Elements:**

**Project List:**

Each project shows:

**Project Name:**
- **What it shows**: Folder name
- **Example**: "my-app", "raven"

**Path:**
- **What it shows**: Full filesystem path
- **Example**: `/Users/you/projects/my-app`

**Status:**
- **Active** 🟢: Currently monitoring
- **Paused** ⏸️: Not monitoring (manual pause)
- **Error** 🔴: Cannot access path

**Events Count:**
- **What it shows**: Total events recorded for this project
- **Example**: "1,247 events"

**Storage:**
- **What it shows**: Disk space used by this project's data
- **Example**: "45 MB"

**Actions:**
- **Pause**: Stop monitoring temporarily
- **Resume**: Restart monitoring
- **Remove**: Delete project (warns before deleting data)
- **Settings**: Configure project-specific options

**Add New Project:**

**1. Choose Path:**
- Browse or type folder path
- **Validation**: Ensures folder exists and is accessible

**2. Project Settings:**

**Include/Exclude Patterns:**
- **Include**: `src/**/*.js` (only JavaScript in src folder)
- **Exclude**: `node_modules/**`, `dist/**`, `.git/**`

**Watch Options:**
- **Watch subdirectories**: Monitor folders within folders
- **Debounce delay**: Wait X ms before recording change (prevents duplicate events)
- **Ignore system files**: Don't watch `.DS_Store`, `Thumbs.db`, etc.

**3. Confirm:**
- Review settings
- Start monitoring

**Project-Specific Settings:**

**For each project, configure:**

**File Patterns:**
- **What to watch**: Which file types/patterns
- **What to ignore**: Build outputs, dependencies

**Agent Settings:**
- **Track agent changes**: Record AI-generated edits
- **Agent confidence threshold**: Minimum confidence to record

**Notifications:**
- **Error alerts**: Notify on syntax errors
- **Large deletion alerts**: Warn on big deletes
- **Security alerts**: Notify on sensitive file changes

**Auto-Actions:**
- **Auto-run tests**: When files change
- **Auto-format**: Run code formatter on save
- **Auto-commit**: Commit on interval or event count

**Technical terms:**
- **Path**: Location of folder in filesystem
- **Pattern**: Rule for matching file names (like `*.js` = all JavaScript files)
- **Debounce**: Wait before acting to avoid duplicate actions
- **Glob pattern**: Pattern with wildcards (`**` = any folder depth, `*` = any characters)

---

## Common UI Elements

These elements appear throughout Raven's interface.

### Header Bar

**What it is:** Top bar present on every page

**Elements:**

**Logo/Home:**
- **Raven logo**: Click to return to Overview
- **Indicator**: Active when on Overview page

**Tab Navigation:**
- **6 main tabs**: Overview, Safety, Agents, Activity, Analysis, System
- **Keyboard shortcuts**: Press 1-6 to switch tabs
- **Active indicator**: Highlighted tab

**Search (🔍):**
- **Global search**: Searches all files and events
- **Shortcut**: Cmd/Ctrl + K
- **Suggestions**: Shows recent searches

**Notifications (🔔):**
- **Badge**: Number of unread notifications
- **Dropdown**: Click to see all notifications
- **Types**:
  - Errors detected
  - Warnings
  - Info messages
  - System alerts

**User Menu:**
- **User icon**: Your profile picture or initials
- **Dropdown**:
  - User info (name, email)
  - Settings
  - Emergency Stop (stops all monitoring)
  - Logout

**Help (?):**
- **Help icon**: Access documentation
- **Click**: Opens help sidebar
- **Search**: Find specific help topics

---

### Footer

**What it is:** Bottom bar present on every page

**Elements:**

**Left Side:**

**Raven Version:**
- **Display**: "Raven v1.1.0"
- **Click**: Shows version details and changelog

**Theme Selector:**
- **Day**: Light theme (white background)
- **Dusk**: Medium theme (soft colors)
- **Night**: Dark theme (dark background)
- **Saves preference**: Remembers your choice

**Right Side:**

**About:**
- **Click**: Opens About modal
- **Shows**: App info, credits, license

**Changelog:**
- **Click**: Shows version history
- **Shows**: What's new in each version

**Docs:**
- **Click**: Opens documentation
- **Search**: Find topics
- **Categories**: Guides, API, FAQ

**GitHub:**
- **Link**: Opens GitHub repository
- **External**: Opens in new tab

---

### Notifications

**What they are:** Alerts that appear in the app

**Types:**

**Success (✅):**
- **Color**: Green
- **Example**: "Health check completed"
- **Duration**: 3 seconds

**Info (ℹ️):**
- **Color**: Blue
- **Example**: "New version available"
- **Duration**: 5 seconds

**Warning (⚠️):**
- **Color**: Yellow
- **Example**: "High memory usage"
- **Duration**: 8 seconds

**Error (❌):**
- **Color**: Red
- **Example**: "Database connection failed"
- **Duration**: 10 seconds (or until dismissed)

**Actions:**
- **Dismiss**: Click X to close
- **Click**: Some notifications are clickable for details
- **Clear all**: Button to dismiss all notifications

---

### Loading States

**What they are:** Indicators that data is being loaded

**Types:**

**Spinner:**
- **Visual**: Rotating circle
- **Means**: Loading in progress
- **Where**: Small elements

**Skeleton:**
- **Visual**: Gray placeholder shapes
- **Means**: Content loading, shows layout
- **Where**: Large content areas

**Progress Bar:**
- **Visual**: Filling bar with percentage
- **Means**: Long operation with progress tracking
- **Example**: "Optimizing database... 47%"

**What to look for:**
- **Quick** (<1s): Normal
- **Slow** (>5s): Might indicate issue
- **Stuck**: If loading for >30s, consider refreshing

---

### Empty States

**What they are:** Messages when no data exists

**Examples:**

**"No projects found":**
- **Means**: Raven isn't monitoring any folders yet
- **Action**: Add a project

**"No recent activity":**
- **Means**: No file changes detected
- **Could mean**:
  - You haven't coded yet today
  - File watcher isn't working
  - Watching wrong folder

**"No errors detected":**
- **Means**: Code is clean (good!)

**Visual:**
- Icon (usually emoji like 💤 or 📭)
- Message explaining why empty
- Action button (if applicable)

---

### Error States

**What they are:** Messages when something went wrong

**Elements:**

**Error Icon:**
- ❌ or 🚨

**Error Message:**
- **What happened**: "Failed to load project health"
- **Why**: "Server returned 404"

**Actions:**
- **Try Again**: Retry the operation
- **Details**: Show full error details
- **Report**: Send error report

**Common Errors:**

**"Failed to connect to server":**
- **Means**: Backend is down or unreachable
- **Fix**: Start the backend server

**"Permission denied":**
- **Means**: Raven can't access file/folder
- **Fix**: Check file permissions

**"Database locked":**
- **Means**: Another process is using database
- **Fix**: Close other Raven instances

---

## Technical Terms Glossary

**Agent:**
- AI assistant that helps write code (like Claude, GPT)

**API (Application Programming Interface):**
- Way for programs to communicate with each other
- Example: Frontend calls backend API to get data

**Codebase:**
- Collection of all code files for a project

**Commit:**
- Save a snapshot of code changes to version control
- Like a checkpoint in a video game

**CPU (Central Processing Unit):**
- The "brain" of the computer that does calculations

**Debounce:**
- Wait a short time before acting to avoid duplicate actions
- Like waiting to see if someone finishes knocking before opening door

**Diff (Difference):**
- Comparison showing what changed between two versions of a file
- Shows added lines (+) and deleted lines (-)

**Event:**
- Something that happened (like a file being saved)

**Front-end:**
- The part of the app you see and interact with (UI)
- Built with HTML, CSS, JavaScript

**Back-end:**
- The server part that runs in the background
- Stores data, processes requests

**Glob Pattern:**
- Pattern for matching file names with wildcards
- `*.js` = all JavaScript files
- `**/*.js` = all JavaScript files in any folder

**Memory/RAM:**
- Fast storage for data programs are actively using
- More RAM = can run more programs at once

**Metric:**
- A measurement or statistic
- Example: "changes per hour" is a metric

**Rollback:**
- Undo changes, go back to previous state
- Like an undo button for your whole project

**Session:**
- One period of work from start to finish
- Like one game session or work session

**SQLite:**
- Type of database stored in a single file
- Raven uses this to store events and data

**Syntax Error:**
- Mistake in how code is written
- Code won't run until fixed

**UUID (Universally Unique Identifier):**
- Long random string that uniquely identifies something
- Example: `7fe70ede-6de3-4918-9638-75bf4c996c48`

**WebSocket:**
- Technology for real-time two-way communication
- Like a phone call vs sending letters (HTTP)

---

## Tips for New Users

**Understanding Status Colors:**
- 🟢 **Green**: Good, healthy, no action needed
- 🟡 **Yellow**: Warning, monitor or review
- 🔴 **Red**: Error or critical, needs attention

**Good vs Bad Indicators:**

**Good Signs:**
- ✅ All health checks passing
- 🟢 Active project status
- Steady activity patterns
- Low error rates
- Regular commits
- Balanced code additions/deletions

**Warning Signs:**
- ⚠️ Some health checks failing
- 🟡 High memory/CPU usage
- Irregular activity (big gaps or non-stop)
- Increasing error rates
- Long sessions without breaks
- Many rollbacks

**Bad Signs:**
- ❌ Multiple failed health checks
- 🔴 Critical errors
- Security file changes (unless intentional)
- Large unexpected deletions
- No activity when there should be
- Database errors

**Best Practices:**

1. **Check Overview daily**: Get familiar with your patterns
2. **Address errors promptly**: Don't let them pile up
3. **Review alerts**: Anomalies might indicate problems
4. **Regular backups**: Use the backup feature
5. **Monitor resources**: Keep an eye on CPU/memory
6. **Take breaks**: If Raven detects long sessions, listen!
7. **Understand your metrics**: Learn what's normal for you
8. **Use docs**: When confused, check documentation

---

**This guide covers all major UI elements in Raven. For specific features or advanced usage, refer to the individual documentation files in the `/docs` folder.**
