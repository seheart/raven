import { exec, spawn } from 'child_process';
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
        runCommand: 'npm test -- --maxWorkers=50%', // Run with 50% of CPU cores (best balance of speed vs stability)
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

    logger.info(`Running ${framework} tests in ${projectPath}`);

    // Emit initial progress
    this.io.emit('test-progress', {
      status: 'starting',
      message: 'Getting ready...',
      completedSuites: 0,
      totalSuites: 54,
      progress: 0
    });

    return new Promise((resolve, reject) => {
      let stdout = '';
      let stderr = '';
      let currentTestFile = null;
      let completedTests = 0;
      let totalTests = 0;
      let testSuites = 0;
      let completedSuites = 0;
      let testsStarted = false;

      // Spawn the test process using shell to handle complex commands
      logger.info(`Spawning test process: ${frameworkConfig.runCommand}`);
      const testProcess = spawn(frameworkConfig.runCommand, {
        cwd: projectPath,
        env: {
          HOME: process.env.HOME,
          PATH: process.env.PATH,
          USER: process.env.USER,
          NODE_ENV: 'test'
          // Don't inherit other env vars that might interfere
        },
        shell: true
      });

      logger.info(`Test process spawned with PID: ${testProcess.pid}`);

      // Track start time for timeout
      const startTime = Date.now();
      const timeout = setTimeout(() => {
        testProcess.kill();
        reject(new Error('Test execution timed out after 5 minutes'));
      }, 300000);

      // Stream stdout line by line to UI
      testProcess.stdout.on('data', (data) => {
        const chunk = data.toString();
        stdout += chunk;

        // Emit raw output to UI for display
        this.io.emit('test-output', {
          output: chunk
        });

        // Simple progress tracking based on PASS/FAIL lines
        const lines = chunk.split('\n');
        for (const line of lines) {
          const passMatch = line.match(/PASS|FAIL/);
          if (passMatch) {
            // First time we see test output, change message
            if (!testsStarted) {
              testsStarted = true;
              this.io.emit('test-progress', {
                status: 'running',
                message: 'Running tests...',
                completedSuites: 0,
                totalSuites: 54,
                progress: 1
              });
            }

            completedSuites++;
            testSuites = Math.max(testSuites, completedSuites + 10); // Estimate remaining

            this.io.emit('test-progress', {
              status: 'running',
              message: 'Running tests...',
              completedSuites,
              totalSuites: testSuites,
              progress: Math.min(95, Math.round((completedSuites / 54) * 100))
            });
          }
        }
      });

      testProcess.stderr.on('data', (data) => {
        const chunk = data.toString();
        stderr += chunk;

        // Also emit stderr to UI (Jest outputs to stderr)
        this.io.emit('test-output', {
          output: chunk
        });
      });

      testProcess.on('close', (code) => {
        clearTimeout(timeout);

        // Emit completion
        this.io.emit('test-progress', {
          status: 'completed',
          message: 'Tests completed',
          progress: 100
        });

        resolve({ stdout, stderr, code });
      });

      testProcess.on('error', (error) => {
        clearTimeout(timeout);
        logger.error(`Error running ${framework} tests:`, error);

        // Emit error progress
        this.io.emit('test-progress', {
          status: 'error',
          message: `Error: ${error.message}`,
          progress: 0
        });

        reject(error);
      });
    }).then(async ({ stdout, stderr, code }) => {
      try {
        // Parse the output
        const output = stdout + stderr;

        // Debug: Log last 30 lines of output to help diagnose parsing issues
        const outputLines = output.split('\n');
        logger.info(`Test output has ${outputLines.length} lines. Last 30 lines:`);
        outputLines.slice(-30).forEach((line, i) => {
          logger.info(`  Line ${outputLines.length - 30 + i}: ${line.substring(0, 150)}`);
        });

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
    });
  }

  /**
   * Parse Jest output
   */
  parseJestOutput(output) {
    const lines = output.split('\n');

    // ONLY extract the summary line - don't parse individual tests from console output
    // Format: "Tests:       53 failed, 1747 passed, 1800 total"
    // IMPORTANT: Only match the FINAL summary line, not console output containing old summaries
    let totalPassed = 0;
    let totalFailed = 0;
    let totalSkipped = 0;
    let totalTests = 0;

    // Search from the END of output to find the ACTUAL test summary (not console.log output)
    // Look for the line that starts exactly with "Tests:" followed by numbers and "total"
    for (let i = lines.length - 1; i >= Math.max(0, lines.length - 100); i--) {
      const line = lines[i].trim();
      // Match: "Tests:       4 skipped, 1796 passed, 1800 total"
      // Or:    "Tests:       45 failed, 14 passed, 59 total"
      const testSummaryMatch = line.match(/^Tests:\s+(?:(\d+)\s+failed,?\s*)?(?:(\d+)\s+skipped,?\s*)?(\d+)\s+passed,?\s*(\d+)\s+total/);
      if (testSummaryMatch) {
        totalFailed = parseInt(testSummaryMatch[1] || '0');
        totalSkipped = parseInt(testSummaryMatch[2] || '0');
        totalPassed = parseInt(testSummaryMatch[3]);
        totalTests = parseInt(testSummaryMatch[4]);
        logger.info(`Jest summary found at line ${i}: "${line}"`);
        logger.info(`Parsed: ${totalPassed} passed, ${totalFailed} failed, ${totalSkipped} skipped, ${totalTests} total`);
        break;
      }
    }

    // If we found a summary, use ONLY the summary line
    if (totalTests > 0) {
      logger.info(`Using Jest summary line: ${totalPassed} passed, ${totalFailed} failed, ${totalSkipped} skipped, ${totalTests} total`);

      const results = [];

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
      return results;
    }

    // If no summary found, Jest probably crashed - report as incomplete
    logger.warn('No Jest summary line found - test run may have crashed or been interrupted');
    return [{
      name: 'Test Run Incomplete',
      status: 'failed',
      duration: 0,
      file: null,
      error: 'Test run did not complete - no Jest summary found. Check console output for errors.',
      stack: null
    }];
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
