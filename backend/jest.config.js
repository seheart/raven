export default {
  testEnvironment: 'node',
  transform: {},
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  moduleNameMapper: {
    '^\.\./\.\./middleware/metrics\.js$': '<rootDir>/middleware/metrics.js',
    '^\.\./middleware/metrics\.js$': '<rootDir>/middleware/metrics.js',
    '^middleware/metrics\.js$': '<rootDir>/middleware/metrics.js',
    '^better-sqlite3$': '<rootDir>/test-shims/better-sqlite3-real.cjs',
    '^\.\.\/\.\.\/sync-service\.js$': '<rootDir>/sync-service.js'
  },
  resetModules: true,
  clearMocks: true,
  restoreMocks: true,
  testMatch: ['**/__tests__/**/*.js', '**/?(*.)+(spec|test).js'],
  testPathIgnorePatterns: ['/node_modules/', '/dist/', '/__tests__/test-watch-dir/'],
  collectCoverageFrom: [
    'middleware/**/*.js',
    'services/**/*.js',
    'routes/**/*.js',
    'config/**/*.js',
    '!**/node_modules/**',
    '!**/dist/**',
    '!**/coverage/**',
    '!jest.config.js',
    // Exclude services without tests
    '!services/conversation-sync.js',
    '!services/file-change-handler.js',
    '!services/git-backfill.js',
    '!services/health-checker.js',
    '!services/startup-validator.js',
    '!services/test-runner.js',
    '!services/syntax-checker.js',
    '!services/pattern-checker.js',
    // Exclude routes without tests or complex system dependencies
    '!routes/sessions.js',
    '!routes/cache.js',
    '!routes/health.js',
    '!routes/analytics.js',
    '!routes/safety.js'
  ],
  coverageThreshold: {
    global: {
      branches: 50,
      functions: 70,
      lines: 70,
      statements: 70
    }
  },
  testTimeout: 10000
};
