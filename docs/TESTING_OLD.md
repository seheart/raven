# Raven Testing Guide

## Overview

This document describes the testing infrastructure and procedures for Raven, a local-first AI agent monitoring tool.

## Table of Contents

1. [Testing Infrastructure](#testing-infrastructure)
2. [Running Tests](#running-tests)
3. [Test Categories](#test-categories)
4. [Performance Testing](#performance-testing)
5. [Memory Profiling](#memory-profiling)
6. [Known Limitations](#known-limitations)

## Testing Infrastructure

### Rust Backend Testing

**Test Location:** `tests/integration_tests.rs`

**Dependencies:**
- `tempfile` - Temporary file/directory creation
- `rusqlite` - Database testing
- `similar` - Diff generation testing
- `sysinfo` - Metrics collection testing
- `notify` - File watching configuration testing
- `chrono` - Timestamp testing
- `uuid` - Session ID generation testing

### Frontend Testing

**Test Framework:** Vitest + @testing-library/svelte

**Test Locations:**
- `frontend/src/lib/*.test.js` - Component tests
- `frontend/src/test/setup.js` - Test configuration

**Dependencies:**
- `vitest` - Test runner
- `@testing-library/svelte` - Svelte component testing
- `@testing-library/jest-dom` - DOM matchers
- `jsdom` - DOM environment
- `@vitest/ui` - Visual test interface

## Running Tests

### Rust Tests

```bash
# Note: Requires webkit2gtk-4.1 system dependency (see SETUP.md)
# Integration tests work independently:
cargo test --test integration_tests
```

### Frontend Tests

```bash
cd frontend

# Run all tests in watch mode
npm run test

# Run tests once
npm run test:run

# Run with UI
npm run test:ui

# Run with coverage
npm run test:coverage

# Run specific test file
npm run test:run -- src/lib/keyboardService.test.js
```

## Test Categories

### 1. Database Tests

**File:** `tests/integration_tests.rs`

Tests:
- ✅ Database creation and schema initialization
- ✅ Event insertion
- ✅ Querying all events
- ✅ Session-based event retrieval
- ✅ File history tracking
- ✅ Event lookup by ID
- ✅ Tracked files listing
- ✅ Time range queries
- ✅ Empty database handling
- ✅ Concurrent access (10 threads, 100 inserts)
- ✅ Performance (1000 inserts in <1 second)

### 2. Diff Engine Tests

**File:** `tests/integration_tests.rs`

Tests:
- ✅ Identical content (no changes)
- ✅ Addition detection
- ✅ Deletion detection
- ✅ Modification tracking
- ✅ Empty file handling
- ✅ Large file diffs (10,000 lines)

### 3. Metrics Collection Tests

**File:** `tests/integration_tests.rs`

Tests:
- ✅ CPU count validation
- ✅ Memory totals
- ✅ Memory usage percentage
- ✅ Used vs available memory

### 4. Keyboard Service Tests

**File:** `frontend/src/lib/keyboardService.test.js`

Tests:
- ✅ Instance creation
- ✅ Shortcut registration
- ✅ Handler invocation
- ✅ Modifier key support (Ctrl, Shift, Alt, Meta)
- ✅ Shortcut unregistration
- ✅ Clear all handlers
- ✅ ID generation for shortcuts
- ✅ Shortcut matching
- ✅ Case insensitivity
- ✅ Automatic cleanup when handlers removed

**Status:** ✅ All tests passing (10/10)

### 5. Component Tests

**Files:**
- `frontend/src/lib/EventFeed.test.js`
- `frontend/src/lib/MetricsPanel.test.js`

Tests:
- Component rendering
- UI element presence
- User interaction handling
- Search/filter functionality
- Export button functionality

**Status:** ⚠️ Svelte 5 compatibility issues (see [Known Limitations](#known-limitations))

## Performance Testing

### Database Performance

**Test:** `test_database_query_performance`

Metrics:
- 1,000 inserts: < 1 second
- 1,000 reads: < 100ms

### Diff Performance

**Test:** `test_large_diff_handling`

Metrics:
- 10,000 line diff: < 1 second

### Concurrent Access

**Test:** `test_concurrent_database_access`

Metrics:
- 10 threads × 10 inserts = 100 total
- All operations succeed
- No data corruption

## Memory Profiling

### Memory Profiling Script

**Location:** `scripts/memory_profile.sh`

**Usage:**
```bash
# Run once
./scripts/memory_profile.sh

# Monitor continuously
watch -n 1 ./scripts/memory_profile.sh
```

**Output:**
- System memory stats
- Raven process memory
- Memory breakdown by process
- Top memory consumers
- Profiling tips

### Memory Target

**Goal:** < 50 MB memory footprint

**Monitoring:**
```bash
# Check Raven memory usage
ps aux | grep raven | awk '{sum+=$6} END {print sum/1024 " MB"}'

# Monitor database size
du -h .raven/db/

# Monitor snapshots
du -h .raven/snapshots/
```

### Memory Optimization Tips

1. **Database Size:**
   - Set retention policies in `.raven/config.toml`
   - Clean old snapshots: `retention_days = 7`

2. **Event Limits:**
   - Configure `max_events` in config
   - Default: 1000 events

3. **Snapshot Management:**
   - Snapshots stored in `.raven/snapshots/`
   - Auto-cleanup after retention period

4. **Debounce Settings:**
   - Current: 50ms
   - Increase for lower memory usage: `debounce_ms = 100`

## Known Limitations

### Rust Tests

**Issue:** webkit2gtk-4.1 dependency blocks cargo test

**Workaround:**
1. Install webkit2gtk-4.1 (see SETUP.md)
2. Use integration tests: `cargo test --test integration_tests`
3. Tests are comprehensive but don't require web application runtime

**Coverage:**
- ✅ Database operations
- ✅ Diff generation
- ✅ Metrics collection
- ✅ File watching config
- ✅ Timestamp handling
- ✅ Session ID generation
- ✅ Performance benchmarks
- ✅ Concurrent access

### Frontend Tests

**Issue:** Svelte 5 + @testing-library/svelte compatibility

**Status:**
- ✅ Keyboard service tests (10/10 passing)
- ⚠️ Component tests (Svelte mount errors)

**Error:**
```
Svelte error: lifecycle_function_unavailable
`mount(...)` is not available on the server
```

**Root Cause:**
- @testing-library/svelte doesn't fully support Svelte 5 yet
- Tests attempt server-side rendering instead of client mounting

**Workaround:**
1. Keyboard service tests work (pure JavaScript)
2. Manual component testing via dev server
3. End-to-end testing when web application backend available

**Future:**
- Wait for @testing-library/svelte Svelte 5 support
- Consider alternative testing approach (Playwright/Cypress)

## Test Coverage Summary

### Rust Backend

| Module | Tests | Status |
|--------|-------|--------|
| Database | 10 | ✅ Passing |
| Diff Engine | 6 | ✅ Passing |
| Metrics | 3 | ✅ Passing |
| File Watching | 1 | ✅ Passing |
| Timestamps | 1 | ✅ Passing |
| Session IDs | 1 | ✅ Passing |
| Performance | 2 | ✅ Passing |
| Concurrent Access | 1 | ✅ Passing |

**Total:** 25 tests passing

### Frontend

| Module | Tests | Status |
|--------|-------|--------|
| Keyboard Service | 10 | ✅ Passing |
| EventFeed Component | 8 | ⚠️ Blocked |
| MetricsPanel Component | 3 | ⚠️ Blocked |

**Total:** 10 tests passing, 11 blocked by Svelte 5 compatibility

## CI/CD Integration

### GitHub Actions (Future)

```yaml
name: Tests

on: [push, pull_request]

jobs:
  test-rust:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - name: Install webkit2gtk
        run: sudo apt-get install -y libwebkit2gtk-4.1-dev
      - name: Run tests
        run: cargo test

  test-frontend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - name: Install dependencies
        run: cd frontend && npm install
      - name: Run tests
        run: cd frontend && npm run test:run
```

## Stress Testing

### Large File Handling

**Test:** `test_large_diff_handling`
- 10,000 line files
- 1,000 modified lines
- Completion: < 1 second

### Database Load

**Test:** `test_database_query_performance`
- 1,000 events inserted
- All queried
- Total time: < 1.1 seconds

### Concurrent Writes

**Test:** `test_concurrent_database_access`
- 10 threads
- 10 inserts per thread
- 100 total operations
- All succeed, no corruption

## Debugging Tests

### Rust Tests

```bash
# Run with output
cargo test --test integration_tests -- --nocapture

# Run specific test
cargo test --test integration_tests test_database_creation

# Run with debug logging
RUST_LOG=debug cargo test
```

### Frontend Tests

```bash
# Run with UI for debugging
npm run test:ui

# Run single test
npm run test:run -- src/lib/keyboardService.test.js

# Verbose output
npm run test:run -- --reporter=verbose
```

## Next Steps

1. ✅ Rust integration tests complete
2. ✅ Frontend keyboard service tests complete
3. ✅ Memory profiling tools created
4. ⚠️ Wait for Svelte 5 testing library support
5. 📋 Add E2E tests when web application backend available
6. 📋 Set up CI/CD pipeline
7. 📋 Add code coverage reporting

## Contributing

When adding new features:
1. Write tests first (TDD approach)
2. Run tests before committing
3. Ensure all tests pass
4. Update this document

## References

- [Vitest Documentation](https://vitest.dev/)
- [Svelte Testing Library](https://testing-library.com/docs/svelte-testing-library/intro/)
- [Node.js Testing Best Practices](https://github.com/goldbergyoni/nodebestpractices#testing-and-overall-quality-practices)
- [Express Testing Guide](https://expressjs.com/en/guide/testing.html)
