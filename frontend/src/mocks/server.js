/**
 * MSW Server Setup for Node.js Testing Environment
 * Used in Vitest tests to mock API calls
 */
import { setupServer } from 'msw/node';
import { handlers } from './handlers.js';

// Setup MSW server with handlers
export const server = setupServer(...handlers);
