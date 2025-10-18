# Contributing to Raven

Thank you for your interest in contributing to Raven! This document provides guidelines and instructions for contributing.

## Table of Contents

1. [Code of Conduct](#code-of-conduct)
2. [Getting Started](#getting-started)
3. [Development Setup](#development-setup)
4. [Making Changes](#making-changes)
5. [Testing](#testing)
6. [Pull Request Process](#pull-request-process)
7. [Coding Standards](#coding-standards)
8. [Project Structure](#project-structure)

## Code of Conduct

### Our Pledge

We pledge to make participation in our project a harassment-free experience for everyone, regardless of age, body size, disability, ethnicity, gender identity and expression, level of experience, nationality, personal appearance, race, religion, or sexual identity and orientation.

### Our Standards

**Positive behavior includes:**
- Using welcoming and inclusive language
- Being respectful of differing viewpoints
- Gracefully accepting constructive criticism
- Focusing on what is best for the community
- Showing empathy towards other community members

**Unacceptable behavior includes:**
- Harassment, trolling, or derogatory comments
- Public or private harassment
- Publishing others' private information without permission
- Other conduct which could reasonably be considered inappropriate

## Getting Started

### Prerequisites

- **Rust 1.70+** - Install from [rustup.rs](https://rustup.rs/)
- **Node.js 18+** and **npm** - Install from [nodejs.org](https://nodejs.org/)
- **System dependencies** - See [SETUP.md](SETUP.md) for your platform

### Fork and Clone

1. Fork the repository on GitHub
2. Clone your fork:
```bash
git clone https://github.com/YOUR_USERNAME/raven.git
cd raven
```

3. Add upstream remote:
```bash
git remote add upstream https://github.com/seheart/raven.git
```

## Development Setup

### Install Dependencies

```bash
# Install frontend dependencies
cd frontend
npm install
cd ..

# Verify Rust installation
cargo --version
```

### Run Development Server

```bash
# Terminal 1: Frontend dev server
cd frontend
npm run dev

# Terminal 2: Tauri development mode
cargo tauri dev
```

### Database Setup

Raven creates `.raven/` directory automatically on first run:
```
.raven/
├── config.toml      # Configuration
├── db/              # SQLite database
└── snapshots/       # File snapshots
```

## Making Changes

### Branching Strategy

- `main` - Production-ready code
- `develop` - Development branch
- `feature/*` - New features
- `bugfix/*` - Bug fixes
- `hotfix/*` - Urgent fixes for production

### Create a Feature Branch

```bash
git checkout develop
git pull upstream develop
git checkout -b feature/your-feature-name
```

### Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
type(scope): subject

body

footer
```

**Types:**
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation only
- `style`: Code style (formatting, no logic change)
- `refactor`: Code refactoring
- `perf`: Performance improvement
- `test`: Add or update tests
- `chore`: Build process or tooling changes

**Examples:**
```bash
git commit -m "feat(watcher): add 50ms debounce for file changes"
git commit -m "fix(db): resolve concurrent access race condition"
git commit -m "docs(readme): update installation instructions"
```

## Testing

### Run Tests

**Rust Tests:**
```bash
# Integration tests
cargo test --test integration_tests

# All tests (requires webkit2gtk)
cargo test
```

**Frontend Tests:**
```bash
cd frontend

# Run tests in watch mode
npm run test

# Run tests once
npm run test:run

# Run with coverage
npm run test:coverage
```

### Writing Tests

**Rust Example:**
```rust
#[test]
fn test_database_insert() {
    let db = setup_test_db();
    let id = db.insert_event(...).unwrap();
    assert!(id > 0);
}
```

**Frontend Example:**
```javascript
describe('Component', () => {
  it('renders correctly', () => {
    const { container } = render(Component);
    expect(container).toBeTruthy();
  });
});
```

### Test Requirements

- All new features must include tests
- Bug fixes should include regression tests
- Maintain or improve code coverage
- All tests must pass before merging

## Pull Request Process

### Before Submitting

1. **Update from upstream:**
```bash
git checkout develop
git pull upstream develop
git checkout your-feature-branch
git rebase develop
```

2. **Run all tests:**
```bash
cargo test --test integration_tests
cd frontend && npm run test:run
```

3. **Check code formatting:**
```bash
cargo fmt -- --check
cargo clippy -- -D warnings
```

4. **Build successfully:**
```bash
cd frontend && npm run build
cargo build --release
```

### Submit Pull Request

1. Push to your fork:
```bash
git push origin your-feature-branch
```

2. Create PR on GitHub:
   - Base: `develop`
   - Compare: `your-feature-branch`
   - Title: Clear, descriptive title
   - Description: What, why, and how

3. **PR Description Template:**
```markdown
## Description
Brief description of changes

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update

## Testing
- [ ] Tests added/updated
- [ ] All tests passing
- [ ] Manual testing completed

## Checklist
- [ ] Code follows project style
- [ ] Self-review completed
- [ ] Documentation updated
- [ ] No new warnings
```

### Review Process

1. Maintainer reviews PR
2. Address feedback
3. Update PR with changes
4. Re-request review
5. Once approved, PR is merged

### After Merge

```bash
git checkout develop
git pull upstream develop
git branch -d your-feature-branch
```

## Coding Standards

### Rust

- Follow [Rust API Guidelines](https://rust-lang.github.io/api-guidelines/)
- Use `cargo fmt` for formatting
- Address all `cargo clippy` warnings
- Add documentation comments (`///`) for public APIs
- Keep functions focused and small
- Use descriptive variable names

**Example:**
```rust
/// Inserts a new event into the database
///
/// # Arguments
/// * `timestamp` - ISO 8601 timestamp
/// * `filepath` - Optional file path
/// * `change_type` - Type of change (created/modified/deleted)
///
/// # Returns
/// The ID of the inserted event
pub fn insert_event(&self, timestamp: &str, filepath: Option<&str>, change_type: &str) -> Result<i64> {
    // Implementation
}
```

### JavaScript/Svelte

- Use ES6+ features
- Prefer `const` over `let`
- Use async/await over promises
- Component names in PascalCase
- Functions in camelCase
- Meaningful variable names

**Example:**
```javascript
// Good
async function loadRecentEvents() {
  const events = await invoke('get_recent_events', { limit: 50 });
  return events;
}

// Bad
async function lre() {
  let e = await invoke('gre', { l: 50 });
  return e;
}
```

### File Organization

- One component per file
- Group related functions
- Keep files under 500 lines
- Extract utilities to separate files

## Project Structure

```
raven/
├── src/                     # Rust backend
│   ├── main.rs             # Entry point
│   ├── modules/            # Core modules
│   ├── commands/           # Tauri commands
│   ├── state.rs            # App state
│   └── watcher.rs          # File watcher
├── frontend/               # Svelte frontend
│   └── src/
│       ├── App.svelte
│       └── lib/            # Components
├── tests/                  # Integration tests
├── scripts/                # Build scripts
├── .github/workflows/      # CI/CD
└── docs/                   # Documentation
```

### Key Components

- **Database** (`src/modules/db.rs`) - SQLite operations
- **Event Logger** (`src/modules/event_logger.rs`) - Event persistence
- **Diff Engine** (`src/modules/diff_engine.rs`) - Diff generation
- **Metrics** (`src/modules/metrics.rs`) - System metrics
- **Watcher** (`src/watcher.rs`) - File watching
- **Commands** (`src/commands/mod.rs`) - Tauri IPC

## Getting Help

- **Issues:** [GitHub Issues](https://github.com/seheart/raven/issues)
- **Discussions:** [GitHub Discussions](https://github.com/seheart/raven/discussions)
- **Documentation:** [README.md](README.md), [SETUP.md](SETUP.md), [TESTING.md](TESTING.md)

## Recognition

Contributors will be recognized in:
- README.md Contributors section
- Release notes
- GitHub contributors page

Thank you for contributing to Raven! 🐦‍⬛
