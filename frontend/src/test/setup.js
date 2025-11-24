import '@testing-library/jest-dom';
import { expect, afterEach, beforeAll, afterAll } from 'vitest';
import { cleanup } from '@testing-library/svelte';
// Temporarily disable MSW to avoid localStorage errors
// import { server } from '../mocks/server.js';

// Cleanup after each test
afterEach(() => {
  cleanup();
});

// Add custom matchers
expect.extend({
  // Add any custom Svelte-specific matchers here if needed
});

// Mock window.matchMedia for components that use media queries
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {}, // deprecated
    removeListener: () => {}, // deprecated
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {}
  })
});

// Mock IntersectionObserver
global.IntersectionObserver = class IntersectionObserver {
  constructor() {}
  disconnect() {}
  observe() {}
  takeRecords() {
    return [];
  }
  unobserve() {}
};

// localStorage mock is handled in global-setup.js to avoid security errors

// Setup MSW for API mocking (disabled due to localStorage issues)
// beforeAll(() => {
//   server.listen({ onUnhandledRequest: 'warn' });
// });

// afterEach(() => {
//   server.resetHandlers();
// });

// afterAll(() => {
//   server.close();
// });
