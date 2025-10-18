# Raven Setup Guide - Phase 0

## System Dependencies (Linux/Arch)

Tauri requires several system libraries to be installed. Run this command:

```bash
sudo pacman -S --needed \
  webkit2gtk-4.1 \
  base-devel \
  curl \
  wget \
  file \
  openssl \
  gtk3 \
  libappindicator-gtk3 \
  librsvg
```

### Alternative Package Managers

**Ubuntu/Debian:**
```bash
sudo apt install \
  libwebkit2gtk-4.1-dev \
  build-essential \
  curl \
  wget \
  file \
  libssl-dev \
  libgtk-3-dev \
  libayatana-appindicator3-dev \
  librsvg2-dev
```

**Fedora:**
```bash
sudo dnf install \
  webkit2gtk4.1-devel \
  openssl-devel \
  curl \
  wget \
  file \
  libappindicator-gtk3-devel \
  librsvg2-devel
```

## Development Tools

Ensure you have:
- Rust (1.70+): `rustc --version`
- Node.js (18+): `node --version`
- npm (9+): `npm --version`

## Project Setup

### 1. Install Frontend Dependencies

```bash
cd frontend
npm install
cd ..
```

### 2. Verify Rust Build

```bash
cargo check
```

This will download and compile all Rust dependencies.

### 3. Run Development Server

```bash
cargo tauri dev
```

Or use the npm script:
```bash
npm run tauri:dev
```

## Project Structure

```
raven3/
├── src/                    # Rust backend
│   ├── main.rs            # Entry point
│   ├── modules/           # Core modules
│   │   ├── repo_watcher.rs
│   │   ├── event_logger.rs
│   │   ├── diff_engine.rs
│   │   ├── metrics.rs
│   │   └── db.rs
│   └── commands/          # Tauri commands
│       └── mod.rs
├── frontend/              # Svelte UI
│   ├── src/
│   │   ├── App.svelte
│   │   └── lib/
│   │       ├── EventFeed.svelte
│   │       └── MetricsPanel.svelte
│   └── package.json
├── .raven/                # Runtime data
│   ├── config.toml       # Configuration
│   ├── db/               # SQLite database
│   └── snapshots/        # File snapshots
├── test_workspace/        # Test directory for monitoring
├── Cargo.toml            # Rust dependencies
├── tauri.conf.json       # Tauri configuration
└── package.json          # Root npm scripts

```

## Testing Raven

1. **Start the application:**
   ```bash
   cargo tauri dev
   ```

2. **Test the UI:**
   - Click "Test Connection" button
   - Should see: "Hello, Claude! Raven is watching..."

3. **Test file watching** (Phase 1):
   - Edit files in `test_workspace/`
   - Watch events appear in the UI

## Troubleshooting

### Build Errors

**Error:** `webkit2gtk-4.1` not found
- **Solution:** Install webkit2gtk-4.1 package (see above)

**Error:** `cargo: command not found`
- **Solution:** Install Rust: `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`

**Error:** Frontend build fails
- **Solution:** Run `cd frontend && npm install`

### Runtime Issues

**App doesn't start:**
- Check logs: `RUST_LOG=debug cargo tauri dev`
- Verify all system dependencies are installed

**Events not showing:**
- Phase 1 implementation not complete yet (file watching not active)
- Current UI shows mock data only

## Next Steps (Phase 1)

- [ ] Implement async file watcher integration
- [ ] Connect event logger to UI via Tauri events
- [ ] Add real-time system metrics
- [ ] Test with actual Claude Code sessions

## Development Commands

```bash
# Check Rust code
cargo check

# Run tests
cargo test

# Format code
cargo fmt

# Run frontend dev server only
cd frontend && npm run dev

# Build for production
cargo tauri build

# Run with debug logging
RUST_LOG=debug cargo tauri dev
```

## Contributing

This is Phase 0 - foundation complete!
- ✅ Project structure
- ✅ Rust modules (stubs)
- ✅ Svelte UI
- ✅ Configuration system
- ✅ Test workspace

Next: Phase 1 - Core backend implementation
