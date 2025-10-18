# 🐦‍⬛ Raven - AI Agent Monitor

> **Local-first, lightning-fast monitoring tool for AI coding agents**

Raven captures file changes, system metrics, and API events in real time — without relying on GitHub. Built for Claude Code and other local AI development tools.

## 🚀 Current Status: Phase 5 Complete

✅ **Ready for cross-platform release!**

- [x] Async file watcher with 50ms debounce
- [x] Event logging to SQLite with diffs
- [x] System metrics collection (CPU, memory)
- [x] Real-time event streaming to UI
- [x] File snapshots on every change
- [x] Time-travel file history viewer
- [x] Restore files to any past state
- [x] Snapshot viewing and browsing
- [x] Side-by-side diff viewer
- [x] Event search and filtering
- [x] Keyboard shortcuts system
- [x] Export to JSON/CSV
- [x] Visual timeline slider
- [x] 25 Rust integration tests
- [x] 10 Frontend unit tests
- [x] Stress tests (10K lines, concurrent access)
- [x] Memory profiling tools
- [x] **Linux build scripts (.deb, .AppImage)**
- [x] **GitHub Actions CI/CD**
- [x] **Cross-platform builds (Linux, macOS, Windows)**
- [x] **Open source ready (LICENSE, CONTRIBUTING)**

**⚠️ Requires system dependencies to run** (see [docs/guides/SETUP.md](docs/guides/SETUP.md))

## 🎯 Features

### Phase 0 - Foundation ✅
- Project structure and build system
- Core Rust modules
- Svelte frontend UI
- Configuration system
- Test workspace

### Phase 1 - Core Backend ✅
- [x] Async file watcher with 50ms debounce
- [x] Event logging to SQLite
- [x] Diff generation using `similar` crate
- [x] System metrics collection (CPU, memory)
- [x] Real-time event streaming to UI

### Phase 2 - Short-Term Memory ✅
- [x] Automatic snapshots in `.raven/snapshots/`
- [x] Snapshot retrieval API
- [x] Time-travel restore feature (single file)
- [x] File history timeline viewer
- [x] FileBrowser UI component
- [x] Snapshot viewer modal

### Phase 3 - UI Enhancement ✅
- [x] Live event feed from backend
- [x] Real-time resource monitoring
- [x] Visual timeline slider for history browsing
- [x] Side-by-side diff viewer
- [x] Event filtering and search (text + type filters)
- [x] Keyboard shortcuts system
- [x] Export to JSON/CSV

### Phase 4 - Testing & QA ✅
- [x] Rust integration tests (25 tests)
- [x] Frontend unit tests (10 tests, keyboard service)
- [x] Stress testing with large files (10K lines)
- [x] Concurrent database access tests
- [x] Performance benchmarks (all targets met)
- [x] Memory profiling tools
- [x] Comprehensive test documentation

### Phase 5 - Cross-Platform Release ✅
- [x] Linux build scripts (Arch/Ubuntu)
- [x] GitHub Actions CI/CD (7 jobs, 2 workflows)
- [x] Cross-platform configs (Linux, macOS, Windows)
- [x] Release automation (tag-triggered)
- [x] Open source documentation (LICENSE, CONTRIBUTING, CHANGELOG)
- [x] Package formats (.deb, .AppImage, .dmg, .msi, .exe)
- [x] Version management and metadata

## 📦 Installation

See [docs/guides/SETUP.md](docs/guides/SETUP.md) for detailed installation instructions.

**Quick start:**

```bash
# Install system dependencies (Arch Linux)
sudo pacman -S webkit2gtk-4.1 base-devel curl wget file openssl gtk3

# Install frontend dependencies
cd frontend && npm install && cd ..

# Run development server
cargo tauri dev
```

## 🛠️ Tech Stack

- **Backend:** Rust 1.90+ with Tokio async runtime
- **UI Framework:** Tauri 2.1 (Rust + Svelte)
- **Frontend:** Svelte + Vite
- **Database:** SQLite (rusqlite)
- **File Watching:** notify + notify-debouncer-full
- **Diff Engine:** similar crate
- **Metrics:** sysinfo crate

## 📂 Project Structure

```
raven3/
├── src/                    # Rust backend
│   ├── main.rs            # Entry point
│   ├── modules/           # Core modules
│   │   ├── repo_watcher.rs    # File system watching
│   │   ├── event_logger.rs    # Event persistence
│   │   ├── diff_engine.rs     # Diff generation
│   │   ├── metrics.rs         # System metrics
│   │   └── db.rs              # SQLite operations
│   └── commands/          # Tauri IPC commands
├── frontend/              # Svelte UI
│   └── src/
│       ├── App.svelte
│       └── lib/
│           ├── EventFeed.svelte
│           ├── MetricsPanel.svelte
│           ├── FileBrowser.svelte
│           ├── FileHistory.svelte
│           ├── DiffViewer.svelte
│           ├── TimelineSlider.svelte
│           ├── KeyboardShortcuts.svelte
│           └── keyboardService.js
├── .raven/                # Runtime data
│   ├── config.toml       # Configuration
│   ├── db/               # SQLite database
│   └── snapshots/        # File snapshots
└── test_workspace/        # Test directory
```

## 🧪 Development

```bash
# Check Rust code
cargo check

# Run tests
cargo test

# Format code
cargo fmt

# Run with debug logging
RUST_LOG=debug cargo tauri dev

# Build for production
cargo tauri build
```

## 🎨 UI Preview

Current UI includes:
- **System Metrics Panel** - Real-time CPU and memory usage
- **Event Feed** - Live file change events with search, filters, and timeline
- **Time Travel Panel** - Browse tracked files and view history
- **Diff Viewer** - Side-by-side comparison of changes
- **Keyboard Shortcuts** - Press `?` to see all shortcuts
- **Export Tools** - Download events as JSON or CSV

## 🔮 Future Enhancements

| Feature | Description |
|---------|-------------|
| **Agent Telemetry API** | Capture structured Claude events via local socket |
| **VS Code Extension** | Stream Raven data into IDE sidebar |
| **Performance Profiling** | Track latency vs CPU load |
| **Session Replay** | Visual timeline playback of all changes |
| **Custom Triggers** | Alerts for specific file change patterns |
| **Multi-Agent Support** | Extend to Ollama, LM Studio, etc. |

## 🧭 Philosophy

Raven is:
- **Local-first** - All data stays on your machine
- **Open source** - Transparent and auditable
- **Lightweight** - Target <50 MB memory footprint
- **Privacy-focused** - No telemetry, no cloud dependency

Every line of code an AI agent touches can be traced, replayed, and understood.

## 📝 Configuration

Edit `.raven/config.toml` to customize:

```toml
[monitoring]
watch_path = "../test_workspace"
debounce_ms = 50
max_events = 1000

[snapshots]
enabled = true
retention_days = 7

[metrics]
cpu_threshold = 80.0
memory_threshold = 85.0
```

## 🐛 Troubleshooting

See [docs/guides/SETUP.md](docs/guides/SETUP.md#troubleshooting) for common issues and solutions.

## 📚 Documentation

Complete documentation is available in the [docs/](docs/) directory:

- **[Setup Guide](docs/guides/SETUP.md)** - Installation instructions
- **[Development Plan](docs/guides/RAVEN_DEV_PLAN.md)** - Project roadmap
- **[Testing Guide](docs/guides/TESTING.md)** - Running tests
- **[API Documentation](docs/api/)** - Feature-specific docs
- **[Phase Reports](docs/phases/)** - Development history

## 📄 License

MIT License - See [LICENSE](LICENSE) file

## 👤 Author

**Seth Eheart**
Codename: Raven
Version: 0.6.0 (Phase II.6 Complete)

---

**Status:** Phase II.6 complete! Ready for cross-platform release with CI/CD, build automation, and full open source infrastructure 🚀
