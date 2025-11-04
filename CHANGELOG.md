# Changelog

All notable changes to Raven will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.0] - 2025-11-03

### 🎉 Official v1.0 Release - Production Ready!

This marks Raven's official v1.0.0 release - a mature, production-ready AI agent monitoring platform with comprehensive features and enterprise-grade quality.

### 📊 Chart Visualizations & Analytics

- **Comprehensive Chart.js integration** across 18+ pages
  - Added interactive data visualizations to all activity pages
  - Theme-aware chart colors matching UI themes
  - Accessible chart rendering with proper ARIA labels
  - Responsive chart layouts for all screen sizes

- **Enhanced Analytics Features**
  - File activity time-series charts
  - Git commit frequency visualizations
  - Session timeline charts with filtering
  - Pattern warning trend analysis
  - Performance metrics over time

### 🎨 UI/UX Improvements

- **Fixed chart rendering and layout issues** - Corrected sizing and positioning across activity pages
- **Toast notifications now visible** - Fixed store connection for notification system
- **Improved chart accessibility** - Added proper labels and screen reader support
- **Theme consistency** - All charts now respect user's selected theme

### 💡 Why This Matters

Version 1.0.0 marks Raven's official production release - transforming it from a data monitoring tool into a powerful analytics platform with rich visualizations that make patterns and trends immediately visible.

---

## [0.9.0] - 2025-11-02

### ⚡ System Performance & UX Excellence

- **Comprehensive UX/UI improvements** - Enhanced accessibility, theming, and error handling across all components
- **Performance optimizations** - Faster page loads and smoother interactions
- **Design system consolidation** - Unified spacing, typography, and component patterns
- **Enhanced error handling** - Better user feedback for error states
- **Accessibility improvements** - WCAG 2.1 AA compliance enhancements
- **Theme refinements** - Improved color contrast and visual hierarchy

### 🎨 Design System

- **Icon sizing system** - Standardized icon sizes (16px, 20px, 24px, 32px, 40px)
- **Spacing system refinements** - Consistent 2px-based spacing scale
- **Motion & transitions** - Smooth animations with cubic-bezier easing
- **Typography improvements** - Dual font system (monospace + sans-serif)

### 💡 Why This Matters

Version 0.9.0 elevates Raven's user experience to production-quality standards with enterprise-level polish, accessibility, and performance.

---

## [0.8.0] - 2025-10-31

### 🐛 Critical Bug Fixes

- **Fixed false positive performance alerts on startup** - Added 90-second grace period to prevent memory/CPU warnings during Node.js initialization
- **Fixed indefinite loading on "Checking health..." and "Loading projects..."** - Added 15-second default timeout to all API requests with graceful fallback handling
- **Fixed frontend hangs during startup** - Added timeout protection to HealthWidget and ProjectsOverview components (10s max)

### 🔒 Security Improvements

- **Documented CSP `unsafe-inline` requirement** - Added comprehensive explanation for Svelte framework's style injection needs with security justification
- **Added explicit radix to parseInt calls** - Prevents unexpected behavior with numeric parsing (security best practice)

### 🧹 Code Quality & Technical Debt

- **Removed all "NOW MODULAR" commented code blocks** - Cleaned up 20+ obsolete comment markers from completed refactoring
- **Resolved test conflicts** - Fixed 4 TODO items in test suites by adding proper mock cleanup in `afterEach` hooks
- **Un-skipped tests** - Re-enabled 4 previously skipped tests in `storage.test.js` and `health.test.js`
- **Extracted magic numbers to named constants** - Improved code readability with:
  - `PERFORMANCE_ALERT_COOLDOWN_MS`
  - `HEALTH_CHECK_DISCOVERY_DELAY_MS`
  - `TELEMETRY_BRIDGE_RETRY_DELAY_MS`
  - `STABILIZATION_DELAY_MS`

### ⚡ Performance Improvements

- **Optimized API timeout handling** - Requests now fail fast (15s) instead of hanging indefinitely
- **Improved error handling** - Timeout errors provide clear user feedback and don't spam logs

### 📚 Documentation

- **Created ACTION_PLAN_v1.6.6.md** - Comprehensive roadmap for code review recommendations and bug fixes
- **Updated security middleware comments** - Explained Svelte CSP requirements and security trade-offs

### 🔧 Developer Experience

- **Better error messages** - Timeout errors show specific endpoint and duration
- **Mock cleanup in tests** - `jest.resetAllMocks()` and `jest.restoreAllMocks()` prevent cross-test pollution
- **Consistent code style** - All `parseInt` calls now use explicit base-10 radix

### 💡 Why This Matters

Version 0.8.0 eliminates two critical user-facing issues that caused confusion during startup:

1. No more false alarm notifications about memory usage
2. No more stuck loading spinners - everything loads within 10-15 seconds or shows helpful errors

This release also significantly improves code quality by removing technical debt, resolving test conflicts, and establishing better constants management.

---

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
