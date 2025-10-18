import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Mock Tauri API
global.__TAURI__ = {
  invoke: vi.fn(),
  event: {
    listen: vi.fn(),
  },
};

// Mock @tauri-apps/api/core
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn((cmd, args) => {
    // Mock responses for different commands
    switch (cmd) {
      case 'greet':
        return Promise.resolve('Hello, Test!');
      case 'get_session_id':
        return Promise.resolve('test-session-123');
      case 'get_metrics':
        return Promise.resolve({
          cpu: 25.5,
          memory: 45.2,
          memory_used_mb: 4096,
          memory_total_mb: 16384,
        });
      case 'get_recent_events':
        return Promise.resolve([
          {
            id: 1,
            timestamp: '2025-10-17T12:00:00Z',
            filepath: 'test.rs',
            change_type: 'created',
            cpu: 10.0,
            mem: 20.0,
          },
        ]);
      case 'get_tracked_files':
        return Promise.resolve(['file1.rs', 'file2.rs']);
      default:
        return Promise.reject(new Error(`Unknown command: ${cmd}`));
    }
  }),
}));

// Mock @tauri-apps/api/event
vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn((event, handler) => {
    return Promise.resolve(() => {});
  }),
}));

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
