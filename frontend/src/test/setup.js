import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Mock fetch for API calls
global.fetch = vi.fn((url) => {
  // Mock responses for different API endpoints
  if (url.includes('/health')) {
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ status: 'ok', session_id: 'test-session-123' })
    });
  }
  if (url.includes('/api/system-metrics')) {
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve([{
        cpu_percent: 25.5,
        memory_percent: 45.2,
        memory_used_mb: 4096,
        memory_total_mb: 16384,
        timestamp: '2025-10-17T12:00:00Z'
      }])
    });
  }
  if (url.includes('/api/agent-events')) {
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve([
        {
          id: 1,
          timestamp: '2025-10-17T12:00:00Z',
          agent_name: 'test-agent',
          event_type: 'file_change',
          filepath: 'test.js',
          change_type: 'created',
        },
      ])
    });
  }
  if (url.includes('/api/tracked-files')) {
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve(['file1.js', 'file2.js'])
    });
  }
  if (url.includes('/api/dashboard-stats')) {
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve({
        total_events: 100,
        total_files: 10,
        total_agents: 2
      })
    });
  }
  if (url.includes('/api/agents-status')) {
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve([
        { agent_name: 'test-agent', is_running: true }
      ])
    });
  }
  // Default success for other endpoints
  return Promise.resolve({
    ok: true,
    json: () => Promise.resolve([]),
    text: () => Promise.resolve('')
  });
});

// Add custom matchers
expect.extend({
  toBeWithinRange(received, floor, ceiling) {
    const pass = received >= floor && received <= ceiling;
    if (pass) {
      return {
        message: () =>
          `expected ${received} not to be within range ${floor} - ${ceiling}`,
        pass: true,
      };
    } else {
      return {
        message: () =>
          `expected ${received} to be within range ${floor} - ${ceiling}`,
        pass: false,
      };
    }
  },
});
