# Raven Tests Directory

This directory contains diagnostic and integration test scripts for the Raven project.

## Directory Structure

```
tests/
├── diagnostic/      # Diagnostic and one-off test scripts
├── integration/     # Integration test scripts
└── README.md        # This file
```

## Diagnostic Tests (`diagnostic/`)

Standalone test scripts for debugging and verification:

- `diagnostic-test.js` - General diagnostic tests for the Raven system
- `test-agent-detection.js` - Tests for AI agent detection functionality
- `test-multi-agent-telemetry.js` - Tests for multi-agent telemetry collection
- `test-session-trigger.js` - Tests for session-based trigger system
- `test-session.js` - Session management and tracking tests

## Integration Tests (`integration/`)

Integration test scripts that test multiple components together:

- `mock-metrics.js` - Mock metrics generation for testing
- `test-realtime.js` - Real-time data flow integration tests
- `test-session.js` - Session integration tests
- `test-telemetry.js` - Telemetry collection integration tests

## Running Tests

### Diagnostic Tests
```bash
# From project root
node tests/diagnostic/diagnostic-test.js
node tests/diagnostic/test-agent-detection.js
# etc.
```

### Integration Tests
```bash
# From project root
node tests/integration/test-telemetry.js
node tests/integration/test-realtime.js
# etc.
```

### Unit & Integration Tests (Jest/Vitest)
```bash
# Backend tests (Jest)
cd backend && npm test

# Frontend tests (Vitest)
cd frontend && npm test

# E2E tests (Playwright)
npm run test:e2e
```

## Notes

- These scripts are separate from the main test suites in `backend/__tests__/` and `frontend/src/lib/__tests__/`
- Diagnostic tests are meant to be run manually for debugging
- Integration tests may require the Raven backend to be running
- See individual test files for specific usage instructions
