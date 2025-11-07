/**
 * Tests for Test Runner Service
 */

import { jest } from '@jest/globals';

// Mock dependencies
const mockExistsSync = jest.fn();
const mockReadFileSync = jest.fn();
const mockJoin = jest.fn((...args) => args.join('/'));

jest.mock('fs', () => ({
  existsSync: mockExistsSync,
  readFileSync: mockReadFileSync
}));

jest.mock('path', () => ({
  join: mockJoin
}));

jest.mock('child_process', () => ({
  exec: jest.fn(),
  spawn: jest.fn()
}));

jest.mock('../../utils/logger.js', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  }
}));

import { TestRunner } from '../../services/test-runner.js';

describe('TestRunner', () => {
  let testRunner;
  let mockDb;
  let mockIo;
  const sessionId = 'test-session-123';

  beforeEach(() => {
    mockDb = {};
    mockIo = {
      emit: jest.fn()
    };

    testRunner = new TestRunner(mockDb, sessionId, mockIo);

    // Clear mocks
    jest.clearAllMocks();
    mockExistsSync.mockReset();
    mockReadFileSync.mockReset();
  });

  describe('Constructor', () => {
    test('should initialize with dependencies', () => {
      expect(testRunner.db).toBe(mockDb);
      expect(testRunner.sessionId).toBe(sessionId);
      expect(testRunner.io).toBe(mockIo);
    });

    test('should have frameworks configuration', () => {
      expect(testRunner.frameworks).toBeDefined();
      expect(Array.isArray(testRunner.frameworks)).toBe(true);
      expect(testRunner.frameworks.length).toBeGreaterThan(0);
    });

    test('should have Jest framework configured', () => {
      const jest = testRunner.frameworks.find(f => f.name === 'jest');
      expect(jest).toBeDefined();
      expect(jest.detectFiles).toContain('jest.config.js');
      expect(jest.detectPackage).toBe('jest');
      expect(jest.runCommand).toBeDefined();
      expect(jest.parseOutput).toBeDefined();
    });

    test('should have Mocha framework configured', () => {
      const mocha = testRunner.frameworks.find(f => f.name === 'mocha');
      expect(mocha).toBeDefined();
      expect(mocha.detectFiles).toContain('.mocharc.js');
      expect(mocha.detectPackage).toBe('mocha');
    });

    test('should have Vitest framework configured', () => {
      const vitest = testRunner.frameworks.find(f => f.name === 'vitest');
      expect(vitest).toBeDefined();
      expect(vitest.detectFiles).toContain('vitest.config.js');
      expect(vitest.detectPackage).toBe('vitest');
    });

    test('should have Pytest framework configured', () => {
      const pytest = testRunner.frameworks.find(f => f.name === 'pytest');
      expect(pytest).toBeDefined();
      expect(pytest.detectFiles).toContain('pytest.ini');
      expect(pytest.detectPackage).toBeNull(); // Python doesn't use package.json
    });
  });

  describe('detectFrameworks()', () => {
    const projectPath = '/test/project';

    beforeEach(() => {
      mockExistsSync.mockReturnValue(false);
      mockReadFileSync.mockImplementation(() => {
        throw new Error('File not found');
      });
    });

    test('should detect Jest by config file', () => {
      mockExistsSync.mockImplementation(path => path.includes('jest.config.js'));

      const detected = testRunner.detectFrameworks(projectPath);

      expect(detected).toContain('jest');
    });

    test('should detect Jest by package.json dependency', () => {
      mockReadFileSync.mockReturnValue(
        JSON.stringify({
          devDependencies: { jest: '^29.0.0' }
        })
      );

      const detected = testRunner.detectFrameworks(projectPath);

      expect(detected).toContain('jest');
    });

    test('should detect Mocha by config file', () => {
      mockExistsSync.mockImplementation(path => path.includes('.mocharc.js'));

      const detected = testRunner.detectFrameworks(projectPath);

      expect(detected).toContain('mocha');
    });

    test('should detect Vitest by config file', () => {
      mockExistsSync.mockImplementation(path => path.includes('vitest.config.js'));

      const detected = testRunner.detectFrameworks(projectPath);

      expect(detected).toContain('vitest');
    });

    test('should detect Pytest by config file', () => {
      mockExistsSync.mockImplementation(path => path.includes('pytest.ini'));

      const detected = testRunner.detectFrameworks(projectPath);

      expect(detected).toContain('pytest');
    });

    test('should detect multiple frameworks', () => {
      mockExistsSync.mockReturnValue(true);

      const detected = testRunner.detectFrameworks(projectPath);

      expect(detected.length).toBeGreaterThan(1);
    });

    test('should handle missing package.json', () => {
      mockExistsSync.mockReturnValue(false);
      mockReadFileSync.mockImplementation(() => {
        throw new Error('ENOENT');
      });

      const detected = testRunner.detectFrameworks(projectPath);

      expect(detected).toEqual([]);
    });

    test('should handle malformed package.json', () => {
      mockExistsSync.mockReturnValue(false);
      mockReadFileSync.mockReturnValue('invalid json');

      const detected = testRunner.detectFrameworks(projectPath);

      expect(detected).toEqual([]);
    });

    test('should detect framework from dependencies not devDependencies', () => {
      mockReadFileSync.mockReturnValue(
        JSON.stringify({
          dependencies: { jest: '^29.0.0' }
        })
      );

      const detected = testRunner.detectFrameworks(projectPath);

      expect(detected).toContain('jest');
    });

    test('should not detect if neither config nor package exists', () => {
      mockExistsSync.mockReturnValue(false);
      mockReadFileSync.mockReturnValue(
        JSON.stringify({
          dependencies: {}
        })
      );

      const detected = testRunner.detectFrameworks(projectPath);

      expect(detected).toEqual([]);
    });
  });

  describe('parseJestOutput()', () => {
    test('should parse Jest summary with all passed tests', () => {
      const output = `
Test Suites: 5 passed, 5 total
Tests:       50 passed, 50 total
Snapshots:   0 total
Time:        5.123 s
      `;

      const results = testRunner.parseJestOutput(output);

      expect(results).toHaveLength(50);
      expect(results.every(r => r.status === 'passed')).toBe(true);
    });

    test('should parse Jest summary with failures', () => {
      const output = `
Test Suites: 3 failed, 2 passed, 5 total
Tests:       10 failed, 40 passed, 50 total
Snapshots:   0 total
Time:        5.123 s
      `;

      const results = testRunner.parseJestOutput(output);

      expect(results).toHaveLength(50);
      expect(results.filter(r => r.status === 'failed')).toHaveLength(10);
      expect(results.filter(r => r.status === 'passed')).toHaveLength(40);
    });

    test('should parse Jest summary with skipped tests', () => {
      const output = `
Test Suites: 1 skipped, 4 passed, 5 total
Tests:       5 skipped, 45 passed, 50 total
Snapshots:   0 total
Time:        5.123 s
      `;

      const results = testRunner.parseJestOutput(output);

      expect(results).toHaveLength(50);
      expect(results.filter(r => r.status === 'skipped')).toHaveLength(5);
      expect(results.filter(r => r.status === 'passed')).toHaveLength(45);
    });

    test('should parse Jest summary with failures and skipped', () => {
      const output = `
Test Suites: 2 failed, 1 skipped, 2 passed, 5 total
Tests:       8 failed, 2 skipped, 40 passed, 50 total
Snapshots:   0 total
      `;

      const results = testRunner.parseJestOutput(output);

      expect(results).toHaveLength(50);
      expect(results.filter(r => r.status === 'failed')).toHaveLength(8);
      expect(results.filter(r => r.status === 'skipped')).toHaveLength(2);
      expect(results.filter(r => r.status === 'passed')).toHaveLength(40);
    });

    test('should handle Jest output without summary', () => {
      const output = `
Some console output
No test summary here
      `;

      const results = testRunner.parseJestOutput(output);

      expect(results).toHaveLength(1);
      expect(results[0].status).toBe('failed');
      expect(results[0].error).toContain('Test run did not complete');
    });

    test('should find summary at end of output', () => {
      const output = `
Old summary from console.log:
Tests:       100 passed, 100 total

Actual test output...

Final summary:
Tests:       50 passed, 50 total
      `;

      const results = testRunner.parseJestOutput(output);

      // Should use the LAST summary line
      expect(results).toHaveLength(50);
    });

    test('should handle Jest summary with only failures', () => {
      const output = `
Tests:       10 failed, 0 passed, 10 total
      `;

      const results = testRunner.parseJestOutput(output);

      expect(results).toHaveLength(10);
      expect(results.every(r => r.status === 'failed')).toBe(true);
    });

    test('parsed tests should have required properties', () => {
      const output = 'Tests:       5 passed, 5 total';

      const results = testRunner.parseJestOutput(output);

      expect(results[0]).toMatchObject({
        name: expect.any(String),
        status: 'passed',
        duration: 0,
        file: null,
        error: null,
        stack: null
      });
    });
  });

  describe('parseMochaOutput()', () => {
    test('should delegate to parseJestOutput', () => {
      const output = 'Tests:       25 passed, 25 total';

      const results = testRunner.parseMochaOutput(output);

      expect(results).toHaveLength(25);
      expect(results.every(r => r.status === 'passed')).toBe(true);
    });
  });

  describe('parseVitestOutput()', () => {
    test('should delegate to parseJestOutput', () => {
      const output = 'Tests:       30 passed, 30 total';

      const results = testRunner.parseVitestOutput(output);

      expect(results).toHaveLength(30);
      expect(results.every(r => r.status === 'passed')).toBe(true);
    });
  });

  describe('parsePytestOutput()', () => {
    test('should parse pytest PASSED output', () => {
      const output = `
tests/test_module.py::test_function PASSED
tests/test_module.py::test_another PASSED
tests/test_module.py::test_third PASSED
      `;

      const results = testRunner.parsePytestOutput(output);

      expect(results).toHaveLength(3);
      expect(results.every(r => r.status === 'passed')).toBe(true);
      expect(results[0].name).toContain('test_function');
    });

    test('should parse pytest FAILED output', () => {
      const output = `
tests/test_module.py::test_function FAILED
tests/test_module.py::test_another PASSED
      `;

      const results = testRunner.parsePytestOutput(output);

      expect(results).toHaveLength(2);
      expect(results[0].status).toBe('failed');
      expect(results[1].status).toBe('passed');
      expect(results[0].error).toBeDefined();
    });

    test('should handle pytest output with no results', () => {
      const output = `
collecting...
      `;

      const results = testRunner.parsePytestOutput(output);

      expect(results).toEqual([]);
    });

    test('should extract test names from pytest paths', () => {
      const output = `
tests/integration/api/test_endpoints.py::test_get_users PASSED
      `;

      const results = testRunner.parsePytestOutput(output);

      expect(results[0].name).toContain('test_get_users');
    });

    test('parsed pytest tests should have required properties', () => {
      const output = 'tests/test.py::test_example PASSED';

      const results = testRunner.parsePytestOutput(output);

      expect(results[0]).toMatchObject({
        name: expect.any(String),
        status: 'passed',
        duration: 0,
        file: null,
        error: null,
        stack: null
      });
    });
  });

  describe('Framework Integration', () => {
    test('all frameworks should have parseOutput method', () => {
      testRunner.frameworks.forEach(framework => {
        expect(framework.parseOutput).toBeDefined();
        expect(typeof framework.parseOutput).toBe('function');
      });
    });

    test('all frameworks should have detectFiles array', () => {
      testRunner.frameworks.forEach(framework => {
        expect(Array.isArray(framework.detectFiles)).toBe(true);
        expect(framework.detectFiles.length).toBeGreaterThan(0);
      });
    });

    test('all frameworks should have runCommand', () => {
      testRunner.frameworks.forEach(framework => {
        expect(framework.runCommand).toBeDefined();
        expect(typeof framework.runCommand).toBe('string');
        expect(framework.runCommand.length).toBeGreaterThan(0);
      });
    });

    test('all frameworks except pytest should have detectPackage', () => {
      testRunner.frameworks.forEach(framework => {
        if (framework.name !== 'pytest') {
          expect(framework.detectPackage).toBeDefined();
          expect(typeof framework.detectPackage).toBe('string');
        }
      });
    });
  });
});
