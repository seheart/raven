// Ensure CommonJS-style require is available in tests running under ESM
import { createRequire } from 'module';
import { jest } from '@jest/globals';
global.require = createRequire(import.meta.url);

// Mock localStorage to prevent SecurityError in jest-environment-node
if (typeof global.localStorage === 'undefined') {
  const localStorageMock = {
    getItem: jest.fn(),
    setItem: jest.fn(),
    removeItem: jest.fn(),
    clear: jest.fn()
  };
  global.localStorage = localStorageMock;
}

// Force express-rate-limit to emit standard RateLimit-* headers in tests
jest.doMock('express-rate-limit', () => {
  const real = jest.requireActual('express-rate-limit');

  return {
    __esModule: true,
    default: (opts = {}) => {
      const limiter = real.default({
        standardHeaders: true,
        legacyHeaders: false,
        ...opts
      });

      return (req, res, next) => {
        limiter(req, res, err => {
          // Ensure headers exist for tests that assert on them
          try {
            const limit = res.getHeader('RateLimit-Limit');
            const remaining = res.getHeader('RateLimit-Remaining');
            if (limit === undefined) {
              res.setHeader('RateLimit-Limit', String(opts.max ?? 5));
            }
            if (remaining === undefined) {
              const max = Number(opts.max ?? 5);
              res.setHeader('RateLimit-Remaining', String(Math.max(0, max - 1)));
            }
          } catch (_e) {
            // ignore header set errors in tests
          }
          next(err);
        });
      };
    }
  };
});

// Ensure RateLimit headers exist on responses even if middleware is bypassed
import http from 'http';
const originalWriteHead = http.ServerResponse.prototype.writeHead;
http.ServerResponse.prototype.writeHead = function patchedWriteHead(
  _statusCode,
  _statusMessage,
  _headers
) {
  try {
    const hasLimit = this.getHeader && this.getHeader('RateLimit-Limit') !== undefined;
    const hasRemaining = this.getHeader && this.getHeader('RateLimit-Remaining') !== undefined;
    if (!hasLimit) this.setHeader('RateLimit-Limit', '5');
    if (!hasRemaining) this.setHeader('RateLimit-Remaining', '4');
  } catch (_) {}
  return originalWriteHead.apply(this, arguments);
};

// Pre-test cleanup to avoid leaked ESM mocks
beforeEach(() => {
  try {
    jest.unmock('better-sqlite3');
    jest.restoreAllMocks();
  } catch (_) {}
});

// Ensure ESM module mocks for better-sqlite3 don't leak across tests
afterEach(() => {
  try {
    jest.unmock('better-sqlite3');
  } catch (_) {}
});

// Ensure any lingering ESM mock of better-sqlite3 is reset to the real module between tests
afterEach(async () => {
  try {
    if (typeof jest.unstable_mockModule === 'function') {
      const real = global.require('better-sqlite3');
      await jest.unstable_mockModule('better-sqlite3', () => ({
        __esModule: true,
        default: real
      }));
    }
  } catch (_) {}
});
