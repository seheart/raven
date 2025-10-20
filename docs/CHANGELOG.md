# Changelog

All notable changes to Raven will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Planned
- API rate limiting and authentication
- Multi-agent support (Ollama, LM Studio, etc.)
- VS Code extension integration
- Advanced session replay features
- Custom trigger patterns
- Performance profiling dashboard

---

## [0.8.0] - 2025-10-20

### Added
- ✨ **Complete UX Overhaul** - Phase 1 navigation improvements
  - Consolidated 5-tab navigation system (Overview, Agents, Activity, Analysis, System)
  - Sub-navigation for organized content hierarchy
  - Persistent tab state with localStorage
  - Toast notification system for user feedback
  - Welcome screen for first-time users
  - Loading skeletons for better perceived performance

- 📝 **Full-Page Documentation Views**
  - About, Changelog, and Docs now display as full pages
  - Removed modal overlays for better readability
  - Improved navigation flow

### Changed
- Reorganized UI into logical content groups
- Improved keyboard shortcuts integration
- Enhanced visual feedback throughout the app
- Updated footer navigation

### Performance
- Reduced component re-renders with optimized state management
- Improved page load times with lazy loading

---

## [0.7.0] - 2025-10-19

### Added
- ✨ **Notifications System**
  - Backend notifications table and database methods
  - 6 REST API endpoints for notifications management
  - Auto-create notifications from errors and triggers
  - Real-time WebSocket notifications via Socket.io
  - NotificationsPanel.svelte with filtering and pagination
  - Mark as read/unread and delete actions

- ✨ **Storage Management**
  - GET /api/storage endpoint with comprehensive stats
  - Total .raven directory size tracking
  - Per-database and per-table statistics
  - Snapshot directories with file counts
  - StoragePanel.svelte with detailed visualization
  - Auto-refresh every 30 seconds

- 🐛 **Code Review Fixes**
  - Diff optimization for large files
  - setTimeout cleanup to prevent memory leaks
  - Configurable ignore patterns
  - Error handling improvements

### Changed
- Updated all frontend components for consistent styling
- Created STYLE_GUIDE.md documenting design system
- Added timeFormat.js utility for consistent date formatting
- Improved error logging throughout the app

### Notes
- Storage retention policy (7 days) is configured but not yet enforced
- Data growing ~5.5 MB/day with 2-second metric collection

---

## [0.6.1] - 2025-10-19

### Fixed
- 🐛 Phase II.7: Code optimization and memory leak fixes
  - WebSocket memory leak fixes (11 components)
  - Zero breaking changes, 100% backward compatible
- 🐛 Fixed missing dirname import in db.js
- 🐛 Fixed missing path import in trigger-engine.js
- 🐛 Robust project switching with file discovery and persistence

### Performance
- Optimized WebSocket connections
- Reduced memory footprint
- Improved database query performance

---

## [0.6.0] - 2025-10-18

### Added
- ✨ **Comprehensive Diff Viewers**
  - Side-by-side diff comparison
  - Syntax highlighting
  - Line-by-line changes

- ✨ **Activity Log**
  - Complete event history
  - Advanced filtering options
  - Export capabilities

- ⚡ **Fast Startup Scripts**
  - `./start.sh` - Start both backend and frontend
  - `./stop.sh` - Stop all servers
  - `./restart.sh` - Restart everything
  - Background process management
  - Beautiful CLI output with progress indicators

### Changed
- UI/UX standardization across all components
- Performance correlations bugfix
- Comprehensive diagnostic and code cleanup

### Performance
- Sub-second startup time
- Optimized WebSocket connections
- Improved event rendering

---

## [0.5.0] - 2025-10-18

### Added
- 🏗️ **Governance Infrastructure**
  - Session tracking and documentation
  - Project planning framework
  - Development workflow standards

### Changed
- Marked Session 1 as complete in PROJECT_PLAN.md
- Implemented foundation infrastructure

---

## [0.4.0] - 2025-10-18

### Added
- ✨ **Comprehensive Testing** - 100% feature coverage (v0.6.1 milestone)
  - 25 Rust integration tests
  - 10 Frontend unit tests
  - Stress tests (10K lines, concurrent access)
  - Memory profiling tools

- 📝 **Feature Audit**
  - Complete feature inventory
  - Documentation of all capabilities
  - FEATURES.md created

### Fixed
- 🐛 Fixed critical bugs preventing compilation
- 🐛 Database corruption under high load
- 🐛 Memory leaks in event handlers

---

## [0.3.0] - 2025-10-18

### Added
- 🏗️ **Web Architecture**
  - Restored Node.js + Express backend
  - Documented shift from Tauri to web-based architecture
  - Improved deployment flexibility

- 📝 **Documentation Consolidation**
  - Reorganized project structure
  - Consolidated documentation (24 → 10 files)
  - Improved README and guides

- 🎨 **UI Polish**
  - About page
  - Changelog viewer
  - Raven logo and branding
  - Version display (v0.0.1 initial)

---

## [0.2.0] - 2025-10-17

### Fixed
- 🐛 Fixed all compilation errors
- 🐛 Fixed Tauri import errors and created placeholder icons
- 🐛 Resolved TelemetryProcessor Send error with spawn_blocking

### Changed
- Improved error handling across the codebase
- Better TypeScript type safety

---

## [0.1.0] - 2025-10-17

### Added
- 🎉 **Initial Release** - Complete Phase II (All 6 Phases)
  - Real-time file watching and event logging
  - System metrics collection (CPU, memory, disk, network)
  - SQLite database with event storage
  - WebSocket-based real-time updates
  - Svelte frontend with Dashboard
  - Tabbed navigation (Events, Metrics, Git, Performance, Triggers)
  - File snapshots and diff generation
  - Session replay capabilities
  - Custom trigger system
  - REST API + WebSocket API

- 🏗️ **Core Architecture**
  - Node.js + Express backend
  - Svelte + Vite frontend
  - Socket.io for real-time communication
  - SQLite for data persistence
  - chokidar for file watching
  - systeminformation for metrics

- 📝 **Documentation**
  - README.md
  - SETUP.md
  - TESTING.md
  - API documentation
  - Phase completion reports

### Technical Details
- Node.js 18+ required
- 50ms file change debounce
- 1-second metrics collection interval
- Automatic snapshot creation
- Real-time WebSocket updates

---

## Release Notes Format

### [Version] - YYYY-MM-DD

#### Added
- New features

#### Changed
- Changes to existing functionality

#### Deprecated
- Features to be removed

#### Removed
- Removed features

#### Fixed
- Bug fixes

#### Security
- Security improvements

#### Performance
- Performance optimizations

---

**Legend:**
- 🎉 Major release
- ✨ New feature
- 🐛 Bug fix
- 📝 Documentation
- 🚀 Performance
- 🔒 Security
- 🏗️ Architecture
- ⚡ Tooling

---

**Note:** Version 1.0.0 will be released when Raven reaches production-ready stability with comprehensive testing, documentation, and proven reliability in real-world usage.
