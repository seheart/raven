/**
 * Global test setup for Jest
 * Runs before all tests
 */

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.PORT = '9999'; // Use different port for tests
process.env.RAVEN_DEV_DISABLE_AUTH = 'true';

// Suppress console logs during tests (optional - comment out for debugging)
// global.console = {
//   ...console,
//   log: jest.fn(),
//   debug: jest.fn(),
//   info: jest.fn(),
//   warn: jest.fn()
// };

// Increase timeout for integration tests
jest.setTimeout(10000);

// Clean up after all tests
afterAll(() => {
  // Close any open connections
  // Clean up test databases
  // etc.
});
