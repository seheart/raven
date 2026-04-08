export default {
  testEnvironment: './jest-environment-custom.cjs',
  testEnvironmentOptions: {
    url: 'http://localhost'
  },
  transform: {},
  setupFiles: ['<rootDir>/jest.setup-early.js'],
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
  testPathIgnorePatterns: ['/node_modules/', '/dist/', '/__tests__/test-watch-dir/', '/__tests__/setup\\.js$', '/__tests__/performance/'],
  collectCoverageFrom: [
    'middleware/**/*.js',
    'services/**/*.js',
    'config/**/*.js',
    '!**/node_modules/**',
    '!**/dist/**',
    '!**/coverage/**',
    '!jest.config.js'
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
