import { exec } from 'child_process';
import { promisify } from 'util';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { logger } from '../utils/logger.js';

const execAsync = promisify(exec);

/**
 * Test Runner Service
 * Detects and runs test frameworks
 */
export class TestRunner {
  constructor(db, sessionId, io) {
    this.db = db;
    this.sessionId = sessionId;
    this.io = io;

    // Supported test frameworks with detection patterns
    this.frameworks = [
      {
        name: 'jest',
        detectFiles: ['jest.config.js', 'jest.config.json', 'jest.config.ts'],
        detectPackage: 'jest',
        runCommand: 'npm test',
        parseOutput: this.parseJestOutput.bind(this)
      },
      {
        name: 'mocha',
        detectFiles: ['.mocharc.js', '.mocharc.json', '.mocharc.yml'],
        detectPackage: 'mocha',
        runCommand: 'npm test',
        parseOutput: this.parseMochaOutput.bind(this)
      },
      {
        name: 'vitest',
        detectFiles: ['vitest.config.js', 'vitest.config.ts'],
        detectPackage: 'vitest',
        runCommand: 'npm test',
        parseOutput: this.parseVitestOutput.bind(this)
      },
      {
        name: 'pytest',
        detectFiles: ['pytest.ini', 'pyproject.toml', 'tox.ini'],
        detectPackage: null, // Python doesn't use package.json
        runCommand: 'pytest --tb=short',
        parseOutput: this.parsePytestOutput.bind(this)
      }
    ];
  }

  /**
   * Detect available test frameworks in a project
   */
  detectFrameworks(projectPath) {
    const detected = [];

    for (const framework of this.frameworks) {
      // Check for config files
      const hasConfigFile = framework.detectFiles.some(file =>
        existsSync(join(projectPath, file))
      );

      // Check package.json for the framework
      let hasPackage = false;
      try {
        const packageJson = JSON.parse(readFileSync(join(projectPath, 'package.json'), 'utf-8'));
        if (framework.detectPackage) {
          hasPackage = !!(packageJson.dependencies?.[framework.detectPackage] ||
                         packageJson.devDependencies?.[framework.detectPackage]);
        }
      } catch (error) {
        // No package.json or not parseable
      }

      if (hasConfigFile || hasPackage) {
        detected.push(framework.name);
      }
    }

    return detected;
  }

  /**
   * Run tests for a specific framework
   */
  async runTests(projectPath, framework) {
    const frameworkConfig = this.frameworks.find(f => f.name === framework);
    if (!frameworkConfig) {
      throw new Error(`Unknown framework: ${framework}`);
    }

    let stdout = '';
    let stderr = '';
    let commandFailed = false;

    try {
      logger.info(`Running ${framework} tests in ${projectPath}`);

      const result = await execAsync(frameworkConfig.runCommand, {
        cwd: projectPath,
        timeout: 60000, // 60 second timeout
        maxBuffer: 1024 * 1024 * 10 // 10MB buffer
      });

      stdout = result.stdout;
      stderr = result.stderr;
    } catch (error) {
      // Tests failed (non-zero exit code) - but we still want to parse the output
      commandFailed = true;
      stdout = error.stdout || '';
      stderr = error.stderr || '';

      // If it's a real error (not just test failures), throw it
      if (!stdout && !stderr) {
        logger.error(`Error running ${framework} tests:`, error);
        throw error;
      }
    }

    try {
      // Parse the output
      const output = stdout + stderr;
      const results = frameworkConfig.parseOutput(output);

      // Store results in database
      const timestamp = new Date().toISOString();
      for (const result of results) {
        this.db.insertTestResult(
          timestamp,
          framework,
          result.file,
          result.name,
          result.status,
          result.duration,
          result.error,
          result.stack,
          this.sessionId
        );
      }

      // Emit WebSocket event with summary
      const passed = results.filter(r => r.status === 'passed').length;
      const failed = results.filter(r => r.status === 'failed').length;
      const skipped = results.filter(r => r.status === 'skipped').length;

      this.io.emit('test-results', {
        timestamp,
        framework,
        total: results.length,
        passed,
        failed,
        skipped,
        duration: results.reduce((sum, r) => sum + (r.duration || 0), 0)
      });

      return {
        results,
        passed,
        failed,
        skipped,
        total: results.length
      };
    } catch (parseError) {
      logger.error(`Error parsing ${framework} test output:`, parseError);

      // Store failure
      const timestamp = new Date().toISOString();
      this.db.insertTestResult(
        timestamp,
        framework,
        null,
        'Test Run',
        'failed',
        0,
        parseError.message,
        parseError.stack,
        this.sessionId
      );

      throw parseError;
    }
  }

  /**
   * Parse Jest output
   */
  parseJestOutput(output) {
    let results = [];
    const lines = output.split('\n');

    // First, try to extract the summary line for accurate totals
    // Format: "Tests:       53 failed, 1747 passed, 1800 total"
    let totalPassed = 0;
    let totalFailed = 0;
    let totalSkipped = 0;
    let totalTests = 0;

    for (const line of lines) {
      const testSummaryMatch = line.match(/Tests:\s+(?:(\d+)\s+failed,?\s*)?(?:(\d+)\s+passed,?\s*)?(?:(\d+)\s+skipped,?\s*)?(\d+)\s+total/);
      if (testSummaryMatch) {
        totalFailed = parseInt(testSummaryMatch[1] || '0');
        totalPassed = parseInt(testSummaryMatch[2] || '0');
        totalSkipped = parseInt(testSummaryMatch[3] || '0');
        totalTests = parseInt(testSummaryMatch[4]);
        logger.info(`Jest summary parsed: ${totalPassed} passed, ${totalFailed} failed, ${totalSkipped} skipped, ${totalTests} total`);
        break;
      }
    }

    // Extract test file results and individual failing tests
    let currentFile = null;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Match PASS/FAIL lines to get test files
      const passMatch = line.match(/PASS\s+(.+\.(?:test|spec)\.[jt]sx?)/);
      const failMatch = line.match(/FAIL\s+(.+\.(?:test|spec)\.[jt]sx?)/);

      if (passMatch) {
        currentFile = passMatch[1];
        results.push({
          name: `Test suite: ${currentFile}`,
          status: 'passed',
          duration: 0,
          file: currentFile,
          error: null,
          stack: null
        });
      } else if (failMatch) {
        currentFile = failMatch[1];
        // Look ahead for individual test failures
        let errorMessage = '';
        for (let j = i + 1; j < Math.min(i + 50, lines.length); j++) {
          if (lines[j].includes('●')) {
            errorMessage = lines[j].replace('●', '').trim();
            break;
          }
        }
        results.push({
          name: `Test suite: ${currentFile}`,
          status: 'failed',
          duration: 0,
          file: currentFile,
          error: errorMessage || 'Test suite failed',
          stack: null
        });
      }

      // Match individual test failures (lines starting with ●)
      const testFailMatch = line.match(/^\s+●\s+(.+)/);
      if (testFailMatch && currentFile) {
        const testName = testFailMatch[1];
        // Look for error details in following lines
        let errorDetails = '';
        for (let j = i + 1; j < Math.min(i + 20, lines.length); j++) {
          if (lines[j].includes('expect(') || lines[j].includes('TypeError') || lines[j].includes('Error:')) {
            errorDetails = lines[j].trim();
            break;
          }
        }
        results.push({
          name: testName,
          status: 'failed',
          duration: 0,
          file: currentFile,
          error: errorDetails || 'Test failed',
          stack: null
        });
      }
    }

    // If we found a summary, use ONLY the summary line (ignore parsed results to avoid duplicates)
    if (totalTests > 0) {
      logger.info(`Using Jest summary line: ${totalPassed} passed, ${totalFailed} failed, ${totalSkipped} skipped, ${totalTests} total`);

      // Clear results and rebuild entirely from summary
      results = [];

      // Add failed tests
      for (let i = 0; i < totalFailed; i++) {
        results.push({
          name: `Failed test ${i + 1}`,
          status: 'failed',
          duration: 0,
          file: null,
          error: 'Test failed - see Jest output for details',
          stack: null
        });
      }

      // Add passing tests
      for (let i = 0; i < totalPassed; i++) {
        results.push({
          name: `Passing test ${i + 1}`,
          status: 'passed',
          duration: 0,
          file: null,
          error: null,
          stack: null
        });
      }

      // Add skipped tests
      for (let i = 0; i < totalSkipped; i++) {
        results.push({
          name: `Skipped test ${i + 1}`,
          status: 'skipped',
          duration: 0,
          file: null,
          error: null,
          stack: null
        });
      }

      logger.info(`Created ${results.length} synthetic test entries (matches Jest total: ${totalTests})`);
    }

    // If we couldn't parse any results, create a summary entry
    if (results.length === 0) {
      results.push({
        name: 'Test Run',
        status: output.includes('FAIL') ? 'failed' : 'passed',
        duration: 0,
        file: null,
        error: output.includes('FAIL') ? 'Tests failed - see output' : null,
        stack: null
      });
    }

    return results;
  }

  /**
   * Parse Mocha output
   */
  parseMochaOutput(output) {
    // Similar to Jest parsing
    return this.parseJestOutput(output);
  }

  /**
   * Parse Vitest output
   */
  parseVitestOutput(output) {
    // Similar to Jest parsing
    return this.parseJestOutput(output);
  }

  /**
   * Parse Pytest output
   */
  parsePytestOutput(output) {
    const results = [];
    const lines = output.split('\n');

    for (const line of lines) {
      if (line.includes('PASSED')) {
        results.push({
          name: line.split('::')[1]?.trim() || line.trim(),
          status: 'passed',
          duration: 0,
          file: null,
          error: null,
          stack: null
        });
      } else if (line.includes('FAILED')) {
        results.push({
          name: line.split('::')[1]?.trim() || line.trim(),
          status: 'failed',
          duration: 0,
          file: null,
          error: line.trim(),
          stack: null
        });
      }
    }

    return results;
  }
}
