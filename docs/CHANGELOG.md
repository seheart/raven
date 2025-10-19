# Changelog

All notable changes to Raven will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Planned
- macOS build and distribution
- Windows build and distribution
- E2E testing with Playwright
- Code coverage reporting
- Performance monitoring dashboard
- Multi-language support

## [0.4.0] - 2025-10-17

### Added
- **Testing Infrastructure**
  - 25 Rust integration tests covering all core modules
  - 10 Frontend unit tests (keyboard service)
  - Stress tests for 10,000 line files
  - Concurrent database access tests (10 threads)
  - Performance benchmarks (all targets met)
  - Memory profiling tools (`scripts/memory_profile.sh`)
  - Comprehensive test documentation (TESTING.md)

- **Test Coverage**
  - Database operations (10 tests)
  - Diff engine (6 tests)
  - Metrics collection (3 tests)
  - File watching configuration
  - Timestamp handling
  - Session ID generation
  - Performance validation

- **Development Tools**
  - Vitest configuration for frontend testing
  - Test setup with Web API mocks
  - Memory profiling script
  - Build scripts for Linux

### Changed
- Updated README.md to reflect Phase 4 completion
- Enhanced documentation with testing procedures

### Performance
- Database inserts: 1,000 operations in < 1 second
- Database queries: 1,000 reads in < 100ms
- Large diffs: 10,000 lines processed in < 1 second
- Concurrent access: 100 operations with no corruption

## [0.3.0] - 2025-10-17

### Added
- **UI Enhancements**
  - Side-by-side diff viewer with syntax highlighting
  - Event search and filtering (text + type filters)
  - Visual timeline slider with event density visualization
  - Keyboard shortcuts system with help modal
  - Export functionality (JSON and CSV formats)

- **Keyboard Shortcuts**
  - `?` - Show/hide shortcuts help
  - `1/2/3` - Toggle event type filters
  - `C` - Clear all events
  - `R` - Refresh events
  - `Esc` - Close modals

- **New Components**
  - `DiffViewer.svelte` - Side-by-side diff comparison
  - `TimelineSlider.svelte` - Time range selector
  - `KeyboardShortcuts.svelte` - Help modal
  - `keyboardService.js` - Centralized keyboard handling

### Changed
- Updated EventFeed with search, filters, and export buttons
- Enhanced FileHistory with diff viewer integration
- Redesigned header with shortcuts button
- Updated documentation to Phase 3

## [0.2.0] - 2025-10-17

### Added
- **Time-Travel Features**
  - File history timeline viewer
  - Snapshot viewing and browsing
  - File restoration to any past state
  - FileBrowser UI component

- **New API Endpoints**
  - `get_file_history` - Retrieve file change history
  - `get_tracked_files` - List all monitored files
  - `get_snapshot` - View file content at specific event
  - `restore_file` - Restore file to previous state

- **Database Enhancements**
  - Query methods for file history
  - Event lookup by ID
  - Time range queries
  - Tracked files listing

### Changed
- Updated UI to 3-column layout
- Enhanced EventFeed with real-time data
- Updated documentation to Phase 2

## [0.1.0] - 2025-10-16

### Added
- **Core Functionality**
  - Async file watcher with 50ms debounce
  - Event logging to SQLite database
  - Diff generation using `similar` crate
  - System metrics collection (CPU, memory)
  - Real-time event streaming to UI

- **Backend Modules**
  - `repo_watcher.rs` - File system monitoring
  - `event_logger.rs` - Event persistence
  - `diff_engine.rs` - Diff generation
  - `metrics.rs` - System metrics
  - `db.rs` - SQLite operations

- **Frontend Components**
  - `EventFeed.svelte` - Live event stream
  - `MetricsPanel.svelte` - System resource monitoring
  - Mock data fallback for browser mode

- **Infrastructure**
  - Node.js + Express framework
  - Svelte + Vite frontend build
  - SQLite database with automatic schema
  - Configuration system (`.raven/config.toml`)
  - Session ID tracking with UUID
  - File snapshot system

- **Documentation**
  - README.md with feature overview
  - SETUP.md with installation instructions
  - RAVEN_DEV_PLAN.md with project roadmap
  - Phase completion documents

### Technical Details
- Rust 1.70+ backend
- Node.js 18+ frontend
- Tokio async runtime
- 50ms file change debounce
- Ignored patterns: node_modules, .git, target, etc.

## [0.0.1] - 2025-10-15

### Added
- Initial project setup
- Basic Web server configuration
- Frontend scaffolding
- Git repository initialization

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
