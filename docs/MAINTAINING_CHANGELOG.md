# Maintaining the Changelog

This guide explains how to update Raven's changelog for new releases.

## Location

The changelog file is located at: `docs/CHANGELOG.md`

## Format

We follow [Keep a Changelog](https://keepachangelog.com/en/1.0.0/) format and [Semantic Versioning](https://semver.org/).

## Semantic Versioning

Version format: `MAJOR.MINOR.PATCH` (e.g., `0.8.0`)

- **MAJOR** (1.0.0): Breaking changes, major overhaul (reserved for v1.0.0+)
- **MINOR** (0.X.0): New features, significant additions
- **PATCH** (0.8.X): Bug fixes, minor improvements

**Current Status:**
- We're in `0.x.x` range (pre-1.0.0)
- Version 1.0.0 will mark production-ready stability
- Increment MINOR for new features, PATCH for fixes

## When to Update

Update the changelog:
1. **After completing a significant feature** (new MINOR version)
2. **After fixing important bugs** (new PATCH version)
3. **Before making the repo public** (ensure changelog is current)
4. **After major refactors or improvements** (new MINOR version)

## Adding a New Release

### Step 1: Add the Version Header

Add a new section at the top of the changelog (after `## [Unreleased]`):

```markdown
## [0.9.0] - 2025-10-21
```

Format: `## [VERSION] - YYYY-MM-DD`

### Step 2: Categorize Changes

Use these section headers as needed:

```markdown
### Added
- New features

### Changed
- Changes to existing functionality

### Fixed
- Bug fixes

### Performance
- Performance optimizations

### Security
- Security improvements

### Deprecated
- Features to be removed soon

### Removed
- Removed features
```

### Step 3: Write Change Entries

Each entry should:
1. Start with an emoji indicator
2. Use bold for the main feature/component name
3. Include sub-bullets for details if needed

**Emoji Guide:**
- 🎉 `:tada:` - Major release milestone
- ✨ `:sparkles:` - New feature
- 🐛 `:bug:` - Bug fix
- 📝 `:memo:` - Documentation
- 🚀 `:rocket:` - Performance improvement
- 🔒 `:lock:` - Security
- 🏗️ `:building_construction:` - Architecture change
- ⚡ `:zap:` - Tooling/Developer experience

**Example:**

```markdown
### Added
- ✨ **Search Functionality**
  - Full-text search across all events
  - Filter by date range
  - Export search results to CSV
  - Keyboard shortcut: Ctrl+F

### Fixed
- 🐛 Fixed memory leak in WebSocket connections
- 🐛 Resolved database locking issue under high load
```

### Step 4: Update Version Numbers

After adding changelog entry, update these files:

1. **README.md** - Line ~262:
   ```markdown
   Version: 0.9.0 (Description of Release)
   ```

2. **backend/package.json** - Line 3:
   ```json
   "version": "0.9.0",
   ```

3. **frontend/package.json** - Line 4:
   ```json
   "version": "0.9.0",
   ```

4. **frontend/src/lib/Footer.svelte** - Line 9:
   ```javascript
   let version = '0.9.0';
   ```

5. **frontend/src/lib/AboutPage.svelte** - Line 128:
   ```svelte
   <span class="info-value">0.9.0</span>
   ```

### Step 5: Commit the Changes

Use this commit message format:

```bash
git add docs/CHANGELOG.md README.md backend/package.json frontend/package.json frontend/src/lib/Footer.svelte frontend/src/lib/AboutPage.svelte

git commit -m "Release v0.9.0: Brief description

- Feature 1
- Feature 2
- Fix 1

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

## Complete Example

Here's a full example for a hypothetical v0.9.0 release:

```markdown
## [0.9.0] - 2025-10-21

### Added
- ✨ **Advanced Search**
  - Full-text search across events
  - Date range filtering
  - Regex pattern matching
  - Export search results

- ✨ **User Preferences**
  - Customizable theme colors
  - Adjustable metric collection interval
  - Configurable retention policy

### Changed
- Improved performance of event rendering
- Updated UI with better contrast for accessibility
- Reorganized settings panel layout

### Fixed
- 🐛 Fixed race condition in database writes
- 🐛 Resolved WebSocket reconnection issues
- 🐛 Fixed incorrect CPU usage calculations

### Performance
- 🚀 Reduced memory usage by 30%
- 🚀 Optimized database queries (50% faster)
- 🚀 Improved startup time to <500ms
```

## Tips

1. **Be specific** - "Fixed login bug" → "Fixed authentication token expiration issue"
2. **User-focused** - Write for people using Raven, not just developers
3. **Group related changes** - Put related sub-bullets under one main feature
4. **Include impact** - Mention performance improvements with numbers when possible
5. **Link to issues** - Reference GitHub issues if applicable (e.g., "Fixes #42")

## Changelog vs Git Commits

**Changelog:**
- High-level, user-focused
- One entry per significant change
- Organized by category
- Written for humans

**Git Commits:**
- Detailed, developer-focused
- One commit per code change
- Chronological order
- Written for version control

Users will see the **Changelog** on the website. Developers will see **Git history** on GitHub.

## Automation (Future)

Consider automating changelog generation:
- Use conventional commits (feat:, fix:, etc.)
- Generate changelog from commit messages
- Tools: `conventional-changelog`, `release-please`

For now, manual updates ensure quality and clarity.

---

**Questions?** Check the existing CHANGELOG.md for reference and patterns.
