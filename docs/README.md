# Raven Documentation

Complete documentation for the Raven AI Agent Monitor project.

**Current Version:** 0.6.0 (Phase II.6)
**Status:** Production Ready
**License:** MIT

---

## 📚 Documentation Index

### Getting Started

**[SETUP.md](SETUP.md)** - Installation & Configuration
Platform-specific installation instructions, dependencies, and troubleshooting.

**[TESTING.md](TESTING.md)** - Running Tests
How to run Rust integration tests, frontend unit tests, and stress tests.

---

### Project Information

**[HISTORY.md](HISTORY.md)** - Development Timeline
Complete development history from Phase 0 through Phase II.6, including:
- Timeline overview
- Key achievements per phase
- Technical implementations
- Performance benchmarks

---

### API Documentation

Technical documentation for specific features:

**[api/TELEMETRY_API.md](api/TELEMETRY_API.md)** - Telemetry Socket API
- Unix socket connection guide
- JSON event schema
- Code examples (Python, curl)
- Event types and fields

**[api/AGENT_MONITORING.md](api/AGENT_MONITORING.md)** - Multi-Agent System
- Agent adapter architecture
- Ollama integration
- LM Studio integration
- Adding custom agents

**[api/CUSTOM_TRIGGERS.md](api/CUSTOM_TRIGGERS.md)** - Alert Configuration
- Trigger types and patterns
- TOML configuration syntax
- Cooldown system
- Examples and use cases

**[api/PERFORMANCE_PROFILING.md](api/PERFORMANCE_PROFILING.md)** - Metrics & Profiling
- System metrics collection
- Process tracking
- Performance correlation analysis
- Query examples

**[api/SESSION_REPLAY.md](api/SESSION_REPLAY.md)** - Timeline Playback
- Session recording
- Playback controls
- File state reconstruction
- Timeline navigation

**[api/USER_EXPERIENCE.md](api/USER_EXPERIENCE.md)** - UI/UX Design
- Dashboard components
- Keyboard shortcuts
- Dark theme design system
- Navigation structure

---

## 🚀 Quick Start

New to Raven? Follow this path:

1. **[README.md](../README.md)** - Project overview
2. **[SETUP.md](SETUP.md)** - Install Raven
3. **[api/TELEMETRY_API.md](api/TELEMETRY_API.md)** - Connect your AI agent
4. **[HISTORY.md](HISTORY.md)** - Understand what's been built

---

## 📖 Documentation Structure

```
docs/
├── README.md              # This file
├── SETUP.md               # Installation guide
├── TESTING.md             # Test documentation
├── HISTORY.md             # Development timeline
└── api/
    ├── AGENT_MONITORING.md
    ├── CUSTOM_TRIGGERS.md
    ├── PERFORMANCE_PROFILING.md
    ├── SESSION_REPLAY.md
    ├── TELEMETRY_API.md
    └── USER_EXPERIENCE.md
```

**Total:** 10 documentation files (clean and focused)

---

## 🎯 Find What You Need

### Installation & Setup
→ [SETUP.md](SETUP.md)

### Using the Telemetry API
→ [api/TELEMETRY_API.md](api/TELEMETRY_API.md)

### Configuring Alerts
→ [api/CUSTOM_TRIGGERS.md](api/CUSTOM_TRIGGERS.md)

### Running Tests
→ [TESTING.md](TESTING.md)

### Understanding the Timeline
→ [HISTORY.md](HISTORY.md)

### UI Features & Shortcuts
→ [api/USER_EXPERIENCE.md](api/USER_EXPERIENCE.md)

### Multi-Agent Setup
→ [api/AGENT_MONITORING.md](api/AGENT_MONITORING.md)

### Performance Metrics
→ [api/PERFORMANCE_PROFILING.md](api/PERFORMANCE_PROFILING.md)

---

## 🔧 For Developers

**Architecture:** See [HISTORY.md](HISTORY.md) Phase 0-1 for system design
**Contributing:** See [../CONTRIBUTING.md](../CONTRIBUTING.md) in project root
**Changelog:** See [../CHANGELOG.md](../CHANGELOG.md) in project root

---

## 📝 Contributing to Docs

Found an error or want to improve documentation?

1. Fork the repository
2. Edit the relevant `.md` file
3. Submit a pull request
4. Follow the [contribution guidelines](../CONTRIBUTING.md)

---

## 📍 Navigation

- [← Back to Project Root](../)
- [View on GitHub](https://github.com/seheart/raven)
- [Report Documentation Issue](https://github.com/seheart/raven/issues)

---

**Last Updated:** 2025-10-18
**Version:** 0.6.0
